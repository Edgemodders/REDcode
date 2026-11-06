// Animations for the animation view (docs/design/animation.md, A1): an .anims exported to a .glb in
// REDcode's cache through REDbridge's project.export, with the rig as a skin and each animation as a
// glTF clip. Those files are large (233 MB and 1,246 clips for the largest in game 2.5), so the page
// never gets one whole: it gets the skeleton and the list, then one clip at a time, cut out here.
// No VS Code imports.

import * as fs from "node:fs";
import type { BridgeClient } from "./bridgeClient";
import { cachedExport, type ExportSource } from "./exportCache";

interface GlbAccessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  max?: number[];
  min?: number[];
}

interface GlbBufferView {
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
}

interface GlbSampler {
  input: number;
  output: number;
  interpolation?: string;
}

interface GlbAnimation {
  name?: string;
  channels: { sampler: number; target: { node?: number; path: string } }[];
  samplers: GlbSampler[];
}

interface GlbJson {
  asset: unknown;
  scene?: number;
  scenes?: unknown[];
  nodes?: unknown[];
  skins?: { joints: number[]; skeleton?: number; name?: string }[];
  animations?: GlbAnimation[];
  accessors?: GlbAccessor[];
  bufferViews?: GlbBufferView[];
}

/** An animation as the list shows it. */
export interface AnimClipInfo {
  name: string;
  /** Seconds. */
  duration: number;
  /**
   * The most keys any track has. The export thins tracks (87 keys for 106 frames in the game's Trauma
   * Team clips), so this is a lower bound: the view takes numFrames from the file, as animFrames reads it.
   */
  frames: number;
}

/** An exported .anims .glb, read once: its JSON, and where its binary chunk starts in the file. */
export interface AnimsGlb {
  file: string;
  json: GlbJson;
  binOffset: number;
}

const ComponentBytes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TypeCount: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const JsonChunk = 0x4e4f534a;
const BinChunk = 0x004e4942;

/** The .glb for an .anims: WolvenKit writes <name>.anims.glb, again only when the source is newer. */
export async function animsGlbFor(bridge: BridgeClient, cacheRoot: string, source: ExportSource): Promise<{ glb: string; cached: boolean }> {
  const r = await cachedExport(bridge, cacheRoot, source, ".anims.glb", {}, "glTF");
  return { glb: r.file, cached: r.cached };
}

/** Reads a .glb's JSON and finds its binary chunk, without reading the binary. */
export function readAnimsGlb(file: string): AnimsGlb {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(20);
    fs.readSync(fd, head, 0, 20, 0);
    if (head.toString("latin1", 0, 4) !== "glTF") throw new Error(`${file} is not a .glb`);
    if (head.readUInt32LE(16) !== JsonChunk) throw new Error(`${file}: its first chunk is not JSON`);
    const jsonLength = head.readUInt32LE(12);
    const text = Buffer.alloc(jsonLength);
    fs.readSync(fd, text, 0, jsonLength, 20);
    const json = JSON.parse(text.toString("utf8")) as GlbJson;
    let binOffset = -1;
    const next = 20 + jsonLength;
    if (next + 8 <= fs.fstatSync(fd).size) {
      const bin = Buffer.alloc(8);
      fs.readSync(fd, bin, 0, 8, next);
      if (bin.readUInt32LE(4) === BinChunk) binOffset = next + 8;
    }
    return { file, json, binOffset };
  } finally {
    fs.closeSync(fd);
  }
}

/** The file's animations, in their order: the index is what animsClip takes. */
export function animsList(glb: AnimsGlb): AnimClipInfo[] {
  const accessors = glb.json.accessors ?? [];
  return (glb.json.animations ?? []).map((a, i) => {
    let duration = 0;
    let frames = 0;
    for (const s of a.samplers) {
      const input = accessors[s.input];
      if (!input) continue;
      duration = Math.max(duration, input.max?.[0] ?? 0);
      frames = Math.max(frames, input.count);
    }
    return { name: a.name ?? `Animation ${i}`, duration, frames };
  });
}

/** A .glb from JSON and an optional binary chunk, each padded to four bytes as the format wants. */
function writeGlb(json: unknown, bin?: Buffer): Buffer {
  const text = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = (4 - (text.length % 4)) % 4;
  const jsonLength = text.length + jsonPad;
  const binPad = bin ? (4 - (bin.length % 4)) % 4 : 0;
  const binLength = bin ? bin.length + binPad : 0;
  const total = 12 + 8 + jsonLength + (bin ? 8 + binLength : 0);
  const out = Buffer.alloc(total);
  out.write("glTF", 0, "latin1");
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonLength, 12);
  out.writeUInt32LE(JsonChunk, 16);
  text.copy(out, 20);
  out.fill(0x20, 20 + text.length, 20 + jsonLength);
  if (bin) {
    const at = 20 + jsonLength;
    out.writeUInt32LE(binLength, at);
    out.writeUInt32LE(BinChunk, at + 4);
    bin.copy(out, at + 8);
  }
  return out;
}

/** The skeleton alone: the nodes, and the skin that marks them as bones. No animations and no binary. */
export function animsSkeleton(glb: AnimsGlb): Buffer {
  const { asset, scene, scenes, nodes, skins } = glb.json;
  return writeGlb({ asset, scene, scenes, nodes, skins: (skins ?? []).map((s) => ({ joints: s.joints, ...(s.skeleton !== undefined ? { skeleton: s.skeleton } : {}) })) });
}

/** One animation as its own .glb: the same nodes, and only that animation's keys. */
export function animsClip(glb: AnimsGlb, index: number): Buffer {
  const animation = glb.json.animations?.[index];
  if (!animation) throw new Error(`No animation ${index} in ${glb.file}`);
  if (glb.binOffset < 0) throw new Error(`${glb.file} has no binary chunk`);
  const accessors = glb.json.accessors ?? [];
  const views = glb.json.bufferViews ?? [];
  const newAccessors: GlbAccessor[] = [];
  const newViews: GlbBufferView[] = [];
  const parts: Buffer[] = [];
  let length = 0;
  const seen = new Map<number, number>();
  const fd = fs.openSync(glb.file, "r");
  try {
    const take = (old: number): number => {
      const known = seen.get(old);
      if (known !== undefined) return known;
      const accessor = accessors[old];
      const view = accessor?.bufferView !== undefined ? views[accessor.bufferView] : undefined;
      if (!accessor || !view) throw new Error(`${glb.file}: accessor ${old} has no data`);
      // Only this accessor's own bytes: several may share one large buffer view.
      const element = (ComponentBytes[accessor.componentType] ?? 0) * (TypeCount[accessor.type] ?? 0);
      if (!element) throw new Error(`${glb.file}: accessor ${old} has an unknown type`);
      const stride = view.byteStride ?? element;
      const bytes = stride * (accessor.count - 1) + element;
      const data = Buffer.alloc(bytes);
      fs.readSync(fd, data, 0, bytes, glb.binOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0));
      const pad = (4 - (length % 4)) % 4;
      if (pad) {
        parts.push(Buffer.alloc(pad));
        length += pad;
      }
      const at = newAccessors.length;
      newViews.push({ byteOffset: length, byteLength: bytes, ...(view.byteStride ? { byteStride: view.byteStride } : {}) });
      newAccessors.push({ ...accessor, bufferView: at, byteOffset: 0 });
      parts.push(data);
      length += bytes;
      seen.set(old, at);
      return at;
    };
    const samplers = animation.samplers.map((s) => ({ ...s, input: take(s.input), output: take(s.output) }));
    const bin = Buffer.concat(parts, length);
    const { asset, scene, scenes, nodes } = glb.json;
    return writeGlb(
      {
        asset,
        scene,
        scenes,
        nodes,
        animations: [{ ...animation, samplers }],
        accessors: newAccessors,
        bufferViews: newViews.map((v) => ({ buffer: 0, ...v })),
        buffers: [{ byteLength: bin.length }],
      },
      bin,
    );
  } finally {
    fs.closeSync(fd);
  }
}
