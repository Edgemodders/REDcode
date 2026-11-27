// A body's deformation graph for the animation view (docs/design/bodies.md, B2): the build's *_deformations.animgraph and
// .rig read through REDbridge, cut down to what webview/deformGraph.ts runs (the nodes in the order they run, the
// transforms the extenders add, the rig's reference pose), and kept in the cache: the graph's JSON is about 100 MB, the
// part the view needs about 150 KB. No VS Code imports.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { BridgeClient } from "./bridgeClient";

/** What the page's deformer takes (webview/deformGraph.ts's DeformGraph). */
export interface DeformGraphData {
  nodes: ({ t: string } & Record<string, unknown>)[];
  reference: Record<string, { r: number[]; t: number[]; s: number[] }>;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const name = (x: Json | null | undefined): string | null => x?.name?.$value ?? x?.$value ?? null;
const v3 = (v: Json | null | undefined) => (v ? [v.X, v.Y, v.Z] : null);
const qs = (t: Json | null | undefined) => (t ? { r: [t.Rotation.i, t.Rotation.j, t.Rotation.k, t.Rotation.r], t: [t.Translation.X, t.Translation.Y, t.Translation.Z], s: [t.Scale.X, t.Scale.Y, t.Scale.Z] } : null);

/** One node, with the fields the deformer uses. */
function cut(n: Json): { t: string } & Record<string, unknown> {
  const t = String(n.$type).replace("animAnimNode_", "");
  switch (t) {
    case "AimConstraint_ObjectUp":
    case "AimConstraint_ObjectRotationUp":
      return { t, bone: name(n.transformIndex), target: name(n.targetTransform), up: name(n.upTransform), fwd: v3(n.forwardAxisLS), upAxis: v3(n.upAxisLS), upVec: v3(n.upTransformVector), w: n.weight };
    case "PointConstraint":
    case "OrientConstraint":
      return { t, bone: name(n.transformIndex), inputs: (n.inputWeightedTransforms ?? []).map((x: Json) => [name(x.transform), x.weight]), pre: n.preprocessedWeights, w: n.weight };
    case "SetBoneTransform":
      return { t, entries: (n.entries ?? []).map((e: Json) => ({ bone: name(e.transformToChange), src: name(e.sourceBone), space: name(e.offsetSpaceBone), method: e.setMethod, offset: qs(e.offset), toRef: e.offsetToReference, snap: e.snapToReference })) };
    case "SimpleSpline":
      return { t, bone: name(n.constrainedTransform), a: name(n.startTransform), m: name(n.middleTransform), b: name(n.endTransform), p: n.defaultProgress, mode: n.progressMode };
    case "TwistConstraint":
      return { t, a: name(n.transformA), b: name(n.transformB), front: n.frontAxis, outputs: (n.outputs ?? []).map((o: Json) => ({ bone: name(o.twistedTransform), axis: o.twistAxis, pos: o.positiveScale, neg: o.negativeScale })) };
    case "TranslationLimit":
      return { t, bone: name(n.constrainedTransform), parent: name(n.parentTransform), x: n.limitOnXAxis, y: n.limitOnYAxis, z: n.limitOnZAxis };
    case "SimpleBounce":
      return { t, a: name(n.startTransform), b: name(n.endTransform), delay: n.delay, mul: n.multiplier, neg: n.negativeMultiplier, off: n.offset, smooth: n.smoothStep, outs: (n.transformOutputs ?? []).map((o: Json) => ({ bone: name(o.targetTransform), parent: name(o.parentTransform), ch: o.targetTransformChannel, mul: o.multiplier, entries: o.channelEntries })) };
    case "StackTransformsExtender":
      return { t, tag: n.tag?.$value, add: (n.transformInfos ?? []).map((x: Json) => ({ name: x.name.$value, parent: x.parentName.$value, ref: qs(x.referenceTransformLs) })) };
    default:
      return { t };
  }
}

/** The graph's nodes in running order: from the output back through each node's input, reversed. */
export function cutGraph(graphJson: Json): DeformGraphData["nodes"] {
  const root = graphJson.Data?.RootChunk ?? graphJson;
  const byId = new Map<string, Json>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) return v.forEach(walk);
    const o = v as Json;
    if (o.HandleId !== undefined && o.Data && typeof o.Data === "object" && !byId.has(o.HandleId)) byId.set(o.HandleId, o.Data);
    for (const k of Object.keys(o)) walk(o[k]);
  };
  walk(root);
  const deref = (h: Json | null | undefined) => (h ? (h.Data ?? byId.get(h.HandleRefId) ?? null) : null);
  const output = [...byId.values()].find((d) => d.$type === "animAnimNode_Output");
  if (!output) throw new Error("The graph has no output node");
  const chain: Json[] = [];
  for (let n = deref(output.node?.node); n; n = deref(n.inputLink?.node)) chain.push(n);
  return chain.reverse().map(cut);
}

/** The rig's reference pose by bone name. */
export function rigReference(rigJson: Json): DeformGraphData["reference"] {
  const rig = rigJson.Data?.RootChunk ?? rigJson;
  const out: DeformGraphData["reference"] = {};
  (rig.boneNames ?? []).forEach((n: Json, i: number) => {
    const q = qs(rig.boneTransforms?.[i]);
    if (q) out[n.$value] = q;
  });
  return out;
}

/**
 * A deformations rig's graph, cut down and cached under cacheDir. The graph is the rig's path with .animgraph (as the
 * game's builds have them: man_base_deformations.rig beside man_base_deformations.animgraph).
 */
export async function deformGraphFor(bridge: BridgeClient, cacheDir: string, deformationsRig: string): Promise<DeformGraphData> {
  const key = crypto.createHash("sha1").update(deformationsRig.toLowerCase()).digest("hex").slice(0, 16);
  const file = path.join(cacheDir, "deform", `${key}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as DeformGraphData;
  } catch {
    // Not read yet.
  }
  const graphPath = deformationsRig.replace(/\.rig$/i, ".animgraph");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "redcode-deform-"));
  try {
    const g = path.join(tmp, "graph.json");
    const r = path.join(tmp, "rig.json");
    await bridge.toJson(graphPath, g);
    await bridge.toJson(deformationsRig, r);
    const data: DeformGraphData = { nodes: cutGraph(JSON.parse(fs.readFileSync(g, "utf8"))), reference: rigReference(JSON.parse(fs.readFileSync(r, "utf8"))) };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const part = `${file}.${process.pid}.part`;
    fs.writeFileSync(part, JSON.stringify(data));
    fs.renameSync(part, file);
    return data;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
