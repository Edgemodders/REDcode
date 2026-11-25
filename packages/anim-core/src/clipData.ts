// A clip's .glb read from its bytes, with no Node imports: the page (REDcode's Animation Timeline, TL2) and Node
// (edit.ts's framesOf) read clips the same way. A Node Buffer is a Uint8Array, so a Glb from glb.ts reads here too.

import type { GlbJson } from "./glbJson";
import { lerp, slerp, type Frames, type V } from "./pose";

/** A .glb's JSON and binary chunk. */
export interface GlbData {
  json: GlbJson;
  bin?: Uint8Array;
}

const JsonChunk = 0x4e4f534a;
const BinChunk = 0x004e4942;
const TypeCount: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/** Reads a .glb's two chunks from its bytes. */
export function parseGlb(data: ArrayBuffer | Uint8Array): GlbData {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67) throw new Error("Not a .glb");
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JsonChunk) throw new Error("A .glb whose first chunk is not JSON");
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as GlbJson;
  const at = 20 + length;
  const bin = bytes.length >= at + 8 && view.getUint32(at + 4, true) === BinChunk ? bytes.subarray(at + 8, at + 8 + view.getUint32(at, true)) : undefined;
  return { json, bin };
}

/** A float accessor's rows (one array per element). */
export function floatsOf({ json, bin }: GlbData, index: number): number[][] {
  const a = json.accessors?.[index];
  if (!a || a.bufferView === undefined || !bin) throw new Error(`accessor ${index} has no data`);
  if (a.componentType !== 5126) throw new Error(`accessor ${index}: component type ${a.componentType}, not float`);
  const n = TypeCount[a.type];
  const v = json.bufferViews![a.bufferView];
  const off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = v.byteStride ?? n * 4;
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  return Array.from({ length: a.count }, (_, i) => Array.from({ length: n }, (_, k) => view.getFloat32(off + i * stride + k * 4, true)));
}

interface Channel {
  node: string;
  path: string;
  interpolation: string;
  times: number[];
  values: V[];
}

function channels(g: GlbData, index = 0): Channel[] {
  const a = g.json.animations?.[index];
  if (!a) throw new Error("No animation in the file");
  return a.channels.map((c) => {
    const s = a.samplers[c.sampler];
    return {
      node: g.json.nodes[c.target.node!]?.name ?? "",
      path: c.target.path,
      interpolation: s.interpolation ?? "LINEAR",
      times: floatsOf(g, s.input).map((v) => v[0]),
      values: floatsOf(g, s.output),
    };
  });
}

function sample(c: Channel, t: number): V {
  const ts = c.times;
  if (t <= ts[0] || ts.length === 1) return c.values[0];
  if (t >= ts[ts.length - 1]) return c.values[c.values.length - 1];
  let i = 0;
  while (i < ts.length - 2 && ts[i + 1] <= t) i++;
  if (c.interpolation === "STEP") return c.values[i];
  const f = (t - ts[i]) / (ts[i + 1] - ts[i] || 1);
  return c.path === "rotation" ? slerp(c.values[i], c.values[i + 1], f) : lerp(c.values[i], c.values[i + 1], f);
}

/** A clip's first animation as whole frames at fps (30, the game's rate). */
export function framesOfData(glb: GlbData, fps = 30): Frames {
  const list = channels(glb);
  const a = glb.json.animations?.[0];
  if (!a) throw new Error("No animation in the file");
  const start = Math.min(...list.map((c) => c.times[0]));
  const end = Math.max(...list.map((c) => c.times[c.times.length - 1]));
  const count = Math.max(1, Math.round((end - start) * fps) + 1);
  const rot = new Map<string, V[]>();
  const pos = new Map<string, V[]>();
  for (const n of glb.json.nodes) {
    if (!n.name) continue;
    rot.set(n.name, Array.from({ length: count }, () => [...(n.rotation ?? [0, 0, 0, 1])]));
    pos.set(n.name, Array.from({ length: count }, () => [...(n.translation ?? [0, 0, 0])]));
  }
  const keyed: string[] = [];
  for (const c of list) {
    if (c.path !== "rotation" && c.path !== "translation") continue;
    const into = (c.path === "rotation" ? rot : pos).get(c.node);
    if (!into) continue;
    keyed.push(`${c.node}/${c.path}`);
    for (let i = 0; i < count; i++) into[i] = [...sample(c, start + i / fps)];
  }
  return { json: glb.json, name: a.name ?? "clip", extras: JSON.parse(JSON.stringify(a.extras ?? {})), fps, count, rot, pos, keyed };
}
