// Small glTF binary (.glb) helpers: read the JSON and binary chunks, write them back, read a float accessor,
// and cut one animation out of a large .anims export without reading its whole binary. No dependencies.

import * as fs from "node:fs";
import type { GlbAccessor, GlbBufferView, GlbJson } from "./glbJson";

export type { GlbAccessor, GlbAnimation, GlbBufferView, GlbChannel, GlbJson, GlbNode, GlbSampler } from "./glbJson";

/** A .glb in memory. */
export interface Glb {
  json: GlbJson;
  bin?: Buffer;
}

const JsonChunk = 0x4e4f534a;
const BinChunk = 0x004e4942;
const ComponentBytes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TypeCount: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

export function readGlb(buf: Buffer): Glb {
  if (buf.toString("latin1", 0, 4) !== "glTF") throw new Error("Not a .glb");
  const length = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== JsonChunk) throw new Error("A .glb whose first chunk is not JSON");
  const json = JSON.parse(buf.subarray(20, 20 + length).toString("utf8")) as GlbJson;
  const at = 20 + length;
  const bin = buf.length >= at + 8 && buf.readUInt32LE(at + 4) === BinChunk ? buf.subarray(at + 8, at + 8 + buf.readUInt32LE(at)) : undefined;
  return { json, bin };
}

export function writeGlb(json: unknown, bin?: Buffer): Buffer {
  const text = Buffer.from(JSON.stringify(json), "utf8");
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const binLength = bin ? Math.ceil(bin.length / 4) * 4 : 0;
  const out = Buffer.alloc(12 + 8 + jsonLength + (bin ? 8 + binLength : 0));
  out.write("glTF", 0, "latin1");
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonLength, 12);
  out.writeUInt32LE(JsonChunk, 16);
  text.copy(out, 20);
  out.fill(0x20, 20 + text.length, 20 + jsonLength);
  if (bin) {
    out.writeUInt32LE(binLength, 20 + jsonLength);
    out.writeUInt32LE(BinChunk, 24 + jsonLength);
    bin.copy(out, 28 + jsonLength);
  }
  return out;
}

/** A float accessor's rows (one array per element). */
export function readAccessor({ json, bin }: Glb, index: number): number[][] {
  const a = json.accessors?.[index];
  if (!a || a.bufferView === undefined || !bin) throw new Error(`accessor ${index} has no data`);
  if (a.componentType !== 5126) throw new Error(`accessor ${index}: component type ${a.componentType}, not float`);
  const n = TypeCount[a.type];
  const v = json.bufferViews![a.bufferView];
  const off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = v.byteStride ?? n * 4;
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: n }, (_, k) => bin.readFloatLE(off + i * stride + k * 4)));
}

/** A .glb file's JSON, and where its binary chunk starts, without reading the binary. */
export function readGlbHead(file: string): { json: GlbJson; binOffset: number } {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(20);
    fs.readSync(fd, head, 0, 20, 0);
    if (head.toString("latin1", 0, 4) !== "glTF") throw new Error(`${file} is not a .glb`);
    const length = head.readUInt32LE(12);
    const text = Buffer.alloc(length);
    fs.readSync(fd, text, 0, length, 20);
    return { json: JSON.parse(text.toString("utf8")) as GlbJson, binOffset: 20 + length + 8 };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * One animation of a large .glb (an .anims export) as its own Glb: the same nodes, the skin's joint list
 * (without its inverse bind matrices, which the import does not need), and only that animation's keys.
 */
export function clipOf(file: string, name: string): Glb {
  const { json, binOffset } = readGlbHead(file);
  const animation = json.animations?.find((a) => a.name === name);
  if (!animation) throw new Error(`No clip ${name} in ${file}`);
  const accessors = json.accessors ?? [];
  const views = json.bufferViews ?? [];
  const outAccessors: GlbAccessor[] = [];
  const outViews: GlbBufferView[] = [];
  const parts: Buffer[] = [];
  let length = 0;
  const seen = new Map<number, number>();
  const fd = fs.openSync(file, "r");
  try {
    const take = (old: number): number => {
      const known = seen.get(old);
      if (known !== undefined) return known;
      const a = accessors[old];
      const v = a?.bufferView !== undefined ? views[a.bufferView] : undefined;
      if (!a || !v) throw new Error(`${file}: accessor ${old} has no data`);
      const element = (ComponentBytes[a.componentType] ?? 0) * (TypeCount[a.type] ?? 0);
      const stride = v.byteStride ?? element;
      const bytes = stride * (a.count - 1) + element;
      const data = Buffer.alloc(bytes);
      fs.readSync(fd, data, 0, bytes, binOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0));
      const pad = (4 - (length % 4)) % 4;
      if (pad) {
        parts.push(Buffer.alloc(pad));
        length += pad;
      }
      outViews.push({ buffer: 0, byteOffset: length, byteLength: bytes, ...(v.byteStride ? { byteStride: v.byteStride } : {}) });
      outAccessors.push({ ...a, bufferView: outAccessors.length, byteOffset: 0 });
      parts.push(data);
      length += bytes;
      seen.set(old, outAccessors.length - 1);
      return outAccessors.length - 1;
    };
    const samplers = animation.samplers.map((s) => ({ ...s, input: take(s.input), output: take(s.output) }));
    const bin = Buffer.concat(parts, length);
    const { asset, scene, scenes, nodes } = json;
    return {
      json: {
        asset,
        scene,
        scenes,
        nodes,
        skins: (json.skins ?? []).map((s) => ({ joints: s.joints, ...(s.skeleton !== undefined ? { skeleton: s.skeleton } : {}) })),
        animations: [{ ...animation, samplers }],
        accessors: outAccessors,
        bufferViews: outViews,
        buffers: [{ byteLength: bin.length }],
      },
      bin,
    };
  } finally {
    fs.closeSync(fd);
  }
}
