// A head for the Lip Sync tab (docs/lipsync.md, "R-face"): which meshes, rig and facial setup make a character's
// head, the setup read into the solver's shape (faceSolve.ts), and the meshes exported as glTF on the face rig.
// Everything comes from the game through REDbridge and is kept in the lip sync cache, never in a project.

import * as fs from "node:fs";
import * as path from "node:path";
import type { BridgeCall } from "./lines";
import { lipsyncCacheDir, LipsyncError } from "./lines";
import type { FaceChanges, FacePart, FaceSetup } from "./faceSolve";

/** The heads the tab shows when it knows nothing better: a crowd woman's and a crowd man's, both plain. */
export const DefaultHeads = {
  woman: "base\\characters\\appearances\\citizen\\citizen__biker_wa.app",
  man: "base\\characters\\appearances\\citizen\\citizen__biker_ma.app",
} as const;

/** A head as an appearance carries it. */
export interface HeadParts {
  /** The appearance file and the appearance's name in it. */
  app: string;
  appearance: string;
  /** The face's skeleton, facial setup and graph (game paths). */
  rig: string;
  setup: string;
  graph?: string;
  /** The head's meshes: `kind` is skin, eyes, teeth, brows, lashes, hair or other, from the mesh's name. */
  meshes: { name: string; mesh: string; kind: string }[];
}

/** A head ready to show: its parts, the setup for the solver, and each mesh as a GLB on the face rig. */
export interface HeadModel extends HeadParts {
  face: FaceSetup;
  /** GLB files in the cache, one a mesh; their skins' joints are the rig's bones in order. */
  models: { name: string; kind: string; file: string }[];
}

const depot = (ref: any): string | undefined => {
  const v = ref?.DepotPath?.$value;
  return typeof v === "string" && v !== "0" && v !== "" ? v : undefined;
};
const text = (v: any): string => (typeof v === "string" ? v : (v?.$value ?? ""));

const Kinds: [RegExp, string][] = [
  [/^h0_/, "skin"],
  [/^he_/, "eyes"],
  [/^ht_/, "teeth"],
  [/^heb_/, "brows"],
  [/^hel_|^hx_.*lash/, "lashes"],
  [/^hh_/, "hair"],
];

async function json(call: BridgeCall, gamePath: string): Promise<any> {
  const r = (await call("cr2w.toJson", { path: gamePath })) as { json?: string };
  if (!r?.json) throw new LipsyncError(`REDbridge didn't read ${gamePath}.`);
  return JSON.parse(r.json);
}

/** The head parts of an appearance (`appearance` by name, else the file's first). */
export async function headParts(call: BridgeCall, app: string, appearance?: string): Promise<HeadParts> {
  const file = await json(call, app);
  const all: any[] = file?.Data?.RootChunk?.appearances ?? [];
  const picked = all.map((a) => a?.Data ?? a).find((a) => !appearance || text(a?.name) === appearance);
  if (!picked) throw new LipsyncError(appearance ? `${app} has no appearance called ${appearance}.` : `${app} has no appearances.`);
  const components: any[] = [];
  const walk = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (typeof o.$type === "string" && o.$type.endsWith("Component")) components.push(o);
    for (const v of Array.isArray(o) ? o : Object.values(o)) walk(v);
  };
  walk(picked);
  const face = components.find((c) => depot(c.facialSetup) && depot(c.rig));
  if (!face) throw new LipsyncError(`${text(picked.name)} in ${app} has no face (no component with a facial setup).`);
  const seen = new Set<string>();
  const meshes: HeadParts["meshes"] = [];
  for (const c of components) {
    const mesh = depot(c.mesh);
    const name = text(c.name);
    if (!mesh || seen.has(mesh)) continue;
    const base = mesh.slice(mesh.lastIndexOf("\\") + 1);
    const kind = Kinds.find(([re]) => re.test(base))?.[1];
    if (!kind || /shadow/.test(base)) continue;
    seen.add(mesh);
    meshes.push({ name, mesh, kind });
  }
  if (!meshes.some((m) => m.kind === "skin")) throw new LipsyncError(`${text(picked.name)} in ${app} has no head mesh.`);
  return { app, appearance: text(picked.name), rig: depot(face.rig)!, setup: depot(face.facialSetup)!, graph: depot(face.graph), meshes };
}

function changes(poses: any[], transforms: any[]): FaceChanges {
  const bones = new Array<number>(transforms.length);
  const values = new Array<number>(transforms.length * 7);
  transforms.forEach((t, i) => {
    bones[i] = t.Bone;
    values.splice(i * 7, 7, t.Rotation.i, t.Rotation.j, t.Rotation.k, t.Rotation.r, t.Translation.X, t.Translation.Y, t.Translation.Z);
  });
  return { start: poses.map((p) => p.TransformIdx), count: poses.map((p) => p.NumTransforms), bones, values };
}

function part(baked: any, main: any, corrective: any, correctiveCount: number): FacePart {
  const tracks: number[] = baked.AllMainPoses.map((p: any) => p.Track);
  const poseOf = new Map(tracks.map((t, i) => [t, i]));
  const by = (table: any[] | null | undefined) => new Map((table ?? []).map((e: any) => [e.Track, e]));
  const envelope = by(baked.EnvelopesPerTrackMapping);
  const half = by(baked.UpperLowerFace);
  let entry = 0;
  const poses = baked.AllMainPoses.map((p: any) => {
    const first = entry;
    entry += p.NumInbetweens;
    return { track: p.Track, first, thresholds: baked.AllMainPosesInbetweens.slice(first, entry), muzzle: envelope.get(p.Track)?.Envelope ?? 0, half: half.get(p.Track)?.Part ?? 0 };
  });
  const grouped = (rules: any[] | null | undefined, indices: number[] | null | undefined, key: string, map: (v: number) => number | undefined) => {
    let at = 0;
    return (rules ?? []).flatMap((r: any) => {
      const list = (indices ?? []).slice(at, at + r.NumInfluences);
      at += r.NumInfluences;
      const target = map(r[key]);
      return target === undefined ? [] : [{ target, by: list.map(map).filter((v): v is number => v !== undefined), kind: r.Type ?? 0 }];
    });
  };
  const correctives = Array.from({ length: correctiveCount }, () => ({ poses: [] as number[], entries: [] as number[] }));
  for (const e of baked.GlobalCorrectiveEntries ?? []) {
    const p = poseOf.get(e.Track);
    // A parent this part has no pose for can never be on, so the corrective is off: -1 reads as weight 0.
    correctives[e.Index]?.poses.push(p ?? -1);
  }
  for (const e of baked.InbetweenCorrectiveEntries ?? []) correctives[e.Index]?.entries.push(e.Track);
  return {
    poses,
    limits: (baked.GlobalLimits ?? []).flatMap((l: any) => (poseOf.has(l.Track) ? [{ pose: poseOf.get(l.Track)!, min: l.Min, mid: l.Mid, max: l.Max, slider: l.Envelope }] : [])),
    influences: grouped(baked.InfluencedPoses, baked.InfluenceIndices, "Track", (t) => poseOf.get(t)).map((r) => ({ pose: r.target, by: r.by, kind: r.kind })),
    correctives,
    correctiveInfluences: grouped(baked.CorrectiveInfluencedPoses, baked.CorrectiveInfluenceIndices, "Index", (i) => i).map((r) => ({ corrective: r.target, by: r.by, kind: r.kind })),
    main: changes(main.Poses ?? [], main.Transforms ?? []),
    corrective: changes(corrective.Poses ?? [], corrective.Transforms ?? []),
  };
}

/** A head's facial setup and rig, read into the solver's shape. About a second; `faceSetupCached` keeps it. */
export async function readFaceSetup(call: BridgeCall, rig: string, setup: string): Promise<FaceSetup> {
  const [rigFile, setupFile] = await Promise.all([json(call, rig), json(call, setup)]);
  const r = rigFile?.Data?.RootChunk;
  const s = setupFile?.Data?.RootChunk;
  const baked = s?.bakedData?.Data;
  const main = s?.mainPosesData?.Data;
  const corrective = s?.correctivePosesData?.Data;
  if (!r?.boneNames || !baked || !main || !corrective) throw new LipsyncError(`${setup} didn't come back as a facial setup with its poses (it needs REDbridge 0.16.0 or later).`);
  const tracks: string[] = (r.trackNames ?? []).map(text);
  const map = s.info?.tracksMapping ?? {};
  const envelopes = map.numEnvelopes ?? 13;
  const mainCount = map.numMainPoses ?? 141;
  const overrides = map.numLipsyncOverrides ?? (baked.LipsyncOverridesIndexMapping ?? []).length;
  const rest: number[] = [];
  for (const t of r.boneTransforms) rest.push(t.Rotation.i, t.Rotation.j, t.Rotation.k, t.Rotation.r, t.Translation.X, t.Translation.Y, t.Translation.Z);
  const info = s.posesInfo ?? {};
  const count = (name: string, key: string, fallback: number) => info?.[name]?.[key] ?? fallback;
  return {
    rig,
    setup,
    bones: r.boneNames.map(text),
    rest,
    tracks,
    layout: { main: envelopes, overrides: envelopes + mainCount, lipsync: envelopes + mainCount + overrides, wrinkles: envelopes + 2 * mainCount + overrides, mainCount },
    overrides: [...(baked.LipsyncOverridesIndexMapping ?? [])],
    parts: (["Face", "Tongue", "Eyes"] as const).map((name) => part(baked[name], main[name], corrective[name], count(name.toLowerCase(), "numCorrectivePoses", (corrective[name].Poses ?? []).length))),
  };
}

const safe = (gamePath: string) => gamePath.replace(/[^a-z0-9_.-]+/gi, "_");

/** A head's setup from the cache, read from the game the first time. */
export async function faceSetupCached(call: BridgeCall, rig: string, setup: string, cacheDir = lipsyncCacheDir()): Promise<FaceSetup> {
  const file = path.join(cacheDir, "heads", `${safe(setup)}.face.json`);
  if (fs.existsSync(file)) {
    try {
      const cached = JSON.parse(fs.readFileSync(file, "utf8")) as FaceSetup & { version?: number };
      if (cached.version === FaceCacheVersion && cached.rig === rig) return cached;
    } catch {
      // A cache file cut short: read it again below.
    }
  }
  const face = await readFaceSetup(call, rig, setup);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ version: FaceCacheVersion, ...face }));
  return face;
}
/** Raised when the cached shape changes, so old files are read again. */
const FaceCacheVersion = 1;

/** The head a face rig belongs to, found by the game's naming: a head's folder holds its skeleton
 *  (`<head>_skeleton.rig`), its facial setup and its meshes. A lip sync set names such a rig, so this gives
 *  the head a clip was made on. Undefined when the folder has no skin mesh or no setup. */
export async function headOfRig(call: BridgeCall, rig: string): Promise<HeadParts | undefined> {
  // Crowd heads live under `base\characters\head\`, main characters' under `base\characters\main_npc\<name>\`:
  // any folder with a skeleton, a setup and a skin mesh is a head.
  const folder = rig.slice(0, rig.lastIndexOf("\\") + 1);
  if (!folder) return undefined;
  const found = (await call("archive.search", { query: folder, limit: 200 })) as { items?: { name: string }[] };
  const names = (found?.items ?? []).map((i) => i.name).filter((n) => n.toLowerCase().startsWith(folder.toLowerCase()) && !n.slice(folder.length).includes("\\"));
  const setup = names.find((n) => /\.facialsetup$/i.test(n));
  const seen = new Set<string>();
  const meshes: HeadParts["meshes"] = [];
  // The shortest name of a kind is the plain part (`h0_001_wa_c__judy.mesh` before its `_cry` and `_cyberware`).
  for (const mesh of names.filter((n) => /\.mesh$/i.test(n)).sort((a, b) => a.length - b.length || a.localeCompare(b))) {
    const base = mesh.slice(folder.length);
    const kind = Kinds.find(([re]) => re.test(base))?.[1];
    // One mesh a kind: a folder can hold variants of a part.
    if (!kind || kind === "hair" || /shadow|_lod|morph/i.test(base) || seen.has(kind)) continue;
    seen.add(kind);
    meshes.push({ name: base.replace(/\.mesh$/i, ""), mesh, kind });
  }
  if (!setup || !meshes.some((m) => m.kind === "skin")) return undefined;
  return { app: "", appearance: "", rig, setup, meshes };
}

/** Whether a face rig is a woman's or a man's, from the build in its name (`h0_001_wa_c__judy`: `wa` a woman
 *  of average build, `ma`, `mb` and `mf` men) or its folder (`\head\wa\`). */
export function rigGender(rig: string): "woman" | "man" | undefined {
  const m = /\\h0_\d+_([a-z])[a-z]_/i.exec(rig) ?? /\\head\\([a-z])[a-z]*\\/i.exec(rig);
  return m ? (m[1].toLowerCase() === "w" ? "woman" : "man") : undefined;
}

/** A head ready to show, by the face rig it belongs to (`rig`) or by appearance (`app`): parts, setup, and the
 *  meshes exported on the face rig (without their materials: the tab colours them by kind). Hair is left out
 *  unless asked: without its textures it is a block. Kept in the cache; a second call is quick. */
export async function headModel(call: BridgeCall, request: { app?: string; appearance?: string; rig?: string; hair?: boolean; cacheDir?: string }): Promise<HeadModel> {
  const cacheDir = request.cacheDir ?? lipsyncCacheDir();
  // The head a rig belongs to when asked by rig, else an appearance's; a rig with no head of its own falls
  // back to the plain head of its gender.
  const own = request.rig ? await headOfRig(call, request.rig) : undefined;
  const parts = own ?? (await headParts(call, request.app ?? DefaultHeads[(request.rig && rigGender(request.rig)) || "woman"], request.appearance));
  const face = await faceSetupCached(call, parts.rig, parts.setup, cacheDir);
  const archiveDir = path.join(cacheDir, "heads", "archive");
  const rawDir = path.join(cacheDir, "heads", "raw");
  const models: HeadModel["models"] = [];
  for (const m of parts.meshes) {
    if (m.kind === "hair" && !request.hair) continue;
    const out = path.join(rawDir, m.mesh.replace(/\.mesh$/i, ".glb"));
    if (!fs.existsSync(out)) {
      const file = path.join(archiveDir, m.mesh);
      if (!fs.existsSync(file)) await call("archive.extract", { path: m.mesh, outFile: file });
      const r = (await call("project.export", { file, archiveDir, rawDir, options: { rig: parts.rig, meshMaterials: false } })) as { ok?: boolean; written?: string[] };
      const written = r?.written?.[0] ? path.join(rawDir, r.written[0]) : out;
      if (!r?.ok || !fs.existsSync(written)) throw new LipsyncError(`REDbridge didn't export ${m.mesh} on ${parts.rig}.`);
      if (written !== out) fs.renameSync(written, out);
      fs.rmSync(file, { force: true }); // the game's mesh is not kept, only its glTF
    }
    models.push({ name: m.name, kind: m.kind, file: out });
  }
  return { ...parts, face, models };
}
