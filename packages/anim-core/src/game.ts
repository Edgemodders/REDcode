// The game's side: the rigs anim-core knows, game files exported through REDbridge into a cache, the stand-in
// character for Uthana, and adding or replacing a clip in a project through REDbridge's import.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { clipOf, type Glb } from "./glb";
import type { Uthana } from "./uthana";

/** What anim-core needs of REDbridge: REDcode's BridgeClient has request; REDnode's kernel.bridge() has call. */
export interface Bridge {
  request<T = any>(method: string, params?: Record<string, unknown>): Promise<T>;
}

/** Either kind of REDbridge client as a Bridge. */
export function asBridge(client: object): Bridge {
  const b = client as { request?: unknown; call?: unknown };
  if (typeof b.request === "function") return client as Bridge;
  if (typeof b.call === "function") {
    const call = b.call as (method: string, params?: Record<string, unknown>) => Promise<any>;
    return { request: (m, p) => call.call(client, m, p) };
  }
  throw new Error("Not a REDbridge client: it has neither request nor call");
}

const BS = "\\";
const at = (...parts: string[]) => parts.join(BS);

/** A rig made clips can go on: its base body and a standing idle clip on it, the reference for the fit. */
export interface Rig {
  id: "man_base" | "woman_base";
  label: string;
  rig: string;
  deformations: string;
  body: string;
  referenceSet: string;
  referenceClip: string;
}

export const Rigs: Record<Rig["id"], Rig> = {
  man_base: {
    id: "man_base",
    label: "Man (average)",
    rig: at("base", "characters", "base_entities", "man_base", "man_base.rig"),
    deformations: at("base", "characters", "base_entities", "man_base", "deformations_rigs", "man_base_deformations.rig"),
    body: at("base", "characters", "common", "base_bodies", "man_average", "t0_000_ma_base__full.mesh"),
    referenceSet: at("base", "animations", "npc", "generic_characters", "male_average", "interactive_scene", "generic_male_average__stand__2h_on_sides__01.anims"),
    referenceClip: "stand__2h_on_sides__01",
  },
  woman_base: {
    id: "woman_base",
    label: "Woman (average)",
    rig: at("base", "characters", "base_entities", "woman_base", "woman_base.rig"),
    deformations: at("base", "characters", "base_entities", "woman_base", "deformations_rigs", "woman_base_deformations.rig"),
    body: at("base", "characters", "common", "base_bodies", "woman_average", "t0_000_wa_base__full.mesh"),
    referenceSet: at("base", "animations", "npc", "generic_characters", "female_average", "interactive_scene", "generic_female_average__stand__2h_on_sides__02.anims"),
    // Her __01 set has only variations (warm-ups, exercises); __02 is one plain standing idle.
    referenceClip: "stand__2h_on_sides__02",
  },
};

/** The rig anim-core knows for a rig path, or undefined. */
export function rigFor(rigPath: string): Rig | undefined {
  const r = rigPath.toLowerCase();
  return Object.values(Rigs).find((x) => x.rig === r);
}

const mtime = (f: string) => {
  try {
    return fs.statSync(f).mtimeMs;
  } catch {
    return 0;
  }
};

/** Empties the cache when the game the bridge has loaded changed (another folder, or a patch). */
async function cacheReady(bridge: Bridge, cacheDir: string): Promise<void> {
  const info = await bridge.request<{ gameDir?: string | null }>("bridge.info");
  let stamp = "no game";
  if (info?.gameDir) {
    try {
      const s = fs.statSync(path.join(info.gameDir, "bin", "x64", "Cyberpunk2077.exe"));
      stamp = `${path.resolve(info.gameDir).toLowerCase()}|${s.size}|${Math.round(s.mtimeMs)}`;
    } catch {
      stamp = `${path.resolve(info.gameDir).toLowerCase()}|no exe`;
    }
  }
  const file = path.join(cacheDir, "stamp.txt");
  let old = "";
  try {
    old = fs.readFileSync(file, "utf8").trim();
  } catch {
    // none yet
  }
  if (old === stamp) return;
  fs.rmSync(cacheDir, { recursive: true, force: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, `${stamp}\n`);
}

/** A game file exported through REDbridge into cacheDir, from the cache when it is newer than the extracted file. */
export async function exportGame(bridge: Bridge, cacheDir: string, gamePath: string, ext: string, options: Record<string, unknown> | null, variant: string): Promise<string> {
  await cacheReady(bridge, cacheDir);
  const archiveDir = path.join(cacheDir, "game");
  const file = path.join(archiveDir, ...gamePath.split(BS));
  if (!fs.existsSync(file)) await bridge.request("archive.extract", { path: gamePath, outFile: file });
  const rawDir = path.join(cacheDir, "raw", variant);
  const rel = path.relative(archiveDir, file);
  const out = path.join(rawDir, rel.slice(0, rel.length - path.extname(rel).length) + ext);
  if (mtime(out) > mtime(file)) return out;
  const r = await bridge.request<{ ok: boolean; written?: string[] }>("project.export", { file, archiveDir, rawDir, options });
  if (!r.ok || !fs.existsSync(out)) throw new Error(`REDbridge could not export ${gamePath}${r.written?.length ? `; it wrote ${r.written.join(", ")}` : ""}`);
  return out;
}

/** The rig's reference clip, alone, from its set exported through REDbridge. */
export async function referenceClip(bridge: Bridge, cacheDir: string, rig: Rig): Promise<Glb> {
  return clipOf(await exportGame(bridge, cacheDir, rig.referenceSet, ".anims.glb", {}, "anims"), rig.referenceClip);
}

/** The stand-in: the rig's base body skinned on the rig and its deformations rig, without materials (about 2 MB). */
export async function standInGlb(bridge: Bridge, cacheDir: string, rig: Rig): Promise<string> {
  return exportGame(bridge, cacheDir, rig.body, ".glb", { rigs: [rig.rig, rig.deformations], meshMaterials: false }, "rigged");
}

/** Where the stand-in characters' ids are kept, by rig and by a fingerprint of the key (never the key). */
export function charactersFile(env: NodeJS.ProcessEnv = process.env): string {
  const local = env.LOCALAPPDATA ?? path.join(env.USERPROFILE ?? "", "AppData", "Local");
  return path.join(local, "Edgemodders", "anim", "characters.json");
}

export const keyFingerprint = (key: string) => crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);

/**
 * The Uthana character for the rig, uploading its stand-in once per Uthana account (auto-rig off, so Uthana keeps
 * the game's bone names and rest pose). Uthana answers the same id for the same file, so a lost record costs only
 * an upload.
 */
export async function standIn(bridge: Bridge, client: Uthana, key: string, rig: Rig, cacheDir: string, store = charactersFile()): Promise<{ id: string; uploaded: boolean }> {
  let known: Record<string, { id: string; at: string }> = {};
  try {
    known = JSON.parse(fs.readFileSync(store, "utf8"));
  } catch {
    // none yet
  }
  const slot = `${keyFingerprint(key)}/${rig.id}`;
  if (known[slot]?.id) return { id: known[slot].id, uploaded: false };
  const bytes = fs.readFileSync(await standInGlb(bridge, cacheDir, rig));
  const c = await client.createCharacter(`edge_${rig.id}`, `edge_${rig.id}.glb`, bytes);
  known[slot] = { id: c.id, at: new Date().toISOString() };
  fs.mkdirSync(path.dirname(store), { recursive: true });
  fs.writeFileSync(store, JSON.stringify(known, null, 2));
  return { id: c.id, uploaded: true };
}

/** A WolvenKit project's folders. */
export interface Project {
  /** The folder with the .cpmodproj. */
  dir: string;
  name: string;
  archiveDir: string;
  rawDir: string;
}

export function projectAt(dir: string): Project {
  const proj = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".cpmodproj")) : undefined;
  const name = proj ? proj.slice(0, -".cpmodproj".length) : path.basename(dir);
  return { dir, name, archiveDir: path.join(dir, "source", "archive"), rawDir: path.join(dir, "source", "raw") };
}

/** A new WolvenKit project (CP77Mod, WolvenKit's layout), or the one already there. */
export function ensureProject(dir: string, name = path.basename(dir)): Project {
  for (const d of ["source/archive", "source/raw", "source/resources", "packed"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  if (!fs.readdirSync(dir).some((f) => f.toLowerCase().endsWith(".cpmodproj"))) {
    const x = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    fs.writeFileSync(
      path.join(dir, `${name}.cpmodproj`),
      `<?xml version="1.0" encoding="utf-8"?>\r\n<CP77Mod xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">\r\n  <Name>${x(name)}</Name>\r\n  <ModName>${x(name)}</ModName>\r\n  <Author></Author>\r\n  <Email />\r\n  <Description />\r\n  <Version>1.0.0</Version>\r\n</CP77Mod>\r\n`,
    );
  }
  return projectAt(dir);
}

/** A name as a game path part: lowercase letters, digits and _. */
export function slug(text: string, fallback = "clip"): string {
  const s = text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40).replace(/_+$/g, "");
  return s || fallback;
}

/**
 * A made clip's own set: <mod>\anims\<name>\<name>.anims, one clip per set, as EDGEfab and EDGEdir agreed for a
 * made animation in a project (EDGEfab #7, 2026-11-16; the owner chose it for REDcode on 2026-11-22).
 */
export function addedSet(project: Project, clip: string): string {
  return at(slug(project.name, "mod"), "anims", clip, `${clip}.anims`);
}

/**
 * The facts of a made animation, as EDGEfab #7 agreed them and EDGEdir reads them from the record
 * source\raw\<mod>\anims\<name>\<name>.edgefab.json, beside the clip <name>.glb.
 */
export interface AnimRecord {
  kind: "anim";
  /** Made once, kept for good: EDGEdir's clips name the animation by it. */
  id: string;
  name: string;
  anim: { rig: string; seconds: number; fps: number; rootMotion: boolean; loop: boolean; name: string };
  /** Which tool made it, and from what (REDcode's own fields; readers skip what they do not know). */
  madeBy?: string;
  made?: string;
  source?: Record<string, unknown>;
  /** Where the motion came from and on what terms, shaped like EDGEfab's prop records' license (EDGEfab #7). */
  license?: { source: string; plan?: string; terms?: string; note: string };
  /** Set by EDGEfab when it edits the clip (EDGEfab #7): a clip with edits is not made again without asking. */
  edited?: string;
  edits?: unknown[];
}

/** Thrown when a clip about to be made again or replaced has EDGEfab's edits, and the caller did not allow it. */
export class EditedClipError extends Error {
  constructor(
    readonly clip: string,
    readonly record: AnimRecord,
  ) {
    super(`${clip} has edits made in EDGEfab, which making it again would lose`);
    this.name = "EditedClipError";
  }
}

/** The record of a made clip in the project, or undefined when there is none. */
export function recordOf(project: Project, clip: string, set = addedSet(project, clip)): AnimRecord | undefined {
  const file = path.join(path.dirname(path.join(project.rawDir, ...set.split(BS))), `${clip}.edgefab.json`);
  try {
    const r = JSON.parse(fs.readFileSync(file, "utf8")) as AnimRecord;
    return r?.kind === "anim" ? r : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a record carries EDGEfab's edits, which making the clip again would lose. */
export const hasEdits = (r: AnimRecord | undefined) => !!r && (!!r.edited || (Array.isArray(r.edits) && r.edits.length > 0));

/**
 * What Uthana's terms say of its output (Terms of Use 2.0.0, effective 2026-11-09, read 2026-11-22; the plan is the
 * caller's to say, since anim-core cannot read it).
 */
export function uthanaLicense(plan: "paid" | "free" = "paid") {
  return {
    source: "uthana",
    plan,
    terms: "https://uthana.com/terms",
    note:
      plan === "paid"
        ? "Made with Uthana. A paying customer owns the output, to the extent rights exist (terms 4.2); Uthana may use inputs and outputs to train its models (6.2)."
        : 'Made with Uthana before paying: a non-exclusive licence, with the credit "Animation generated with Uthana (uthana.com)" (terms 4.3).',
  };
}

/** A made clip in a project, found by its record. */
export interface MadeClip extends AnimRecord {
  /** The set's path under the project's archive folder. */
  set: string;
  /** The record's file. */
  record: string;
  /** The clip's .glb on the game's rig. */
  glb: string;
}

export interface ImportResult {
  /** The set's path under the project's archive folder. */
  set: string;
  clip: string;
  from: string;
  added: string[];
  updated: string[];
  notes: string[];
  /** The fitted .glb and its source record, under the project's raw folder. */
  files: string[];
}

/** Where a clip's sources go: <raw>/<set>.sources/<clip>.glb (the motion as it came) and <clip>.json (where from). */
const sourceDir = (project: Project, set: string) => path.join(project.rawDir, ...`${set}.sources`.split(BS));

async function importClip(bridge: Bridge, project: Project, set: string, clip: string, glb: Buffer, start: { rig?: string; template?: string }, source?: { motion?: Buffer; record?: Record<string, unknown> }): Promise<ImportResult> {
  const rawGlb = path.join(project.rawDir, ...`${set}.glb`.split(BS));
  fs.mkdirSync(path.dirname(rawGlb), { recursive: true });
  fs.writeFileSync(rawGlb, glb);
  const exists = fs.existsSync(path.join(project.archiveDir, ...set.split(BS)));
  const r = await bridge.request<{ ok: boolean; anims?: { from: string; added: string[]; updated: string[]; skipped: { name: string; why: string }[]; notes: string[] } }>("project.import", {
    file: rawGlb,
    rawDir: project.rawDir,
    archiveDir: project.archiveDir,
    keep: exists,
    template: exists ? null : start.template ?? null,
    rig: exists ? null : start.rig ?? null,
  });
  const a = r.anims;
  if (!r.ok || !a) throw new Error(`REDbridge did not import ${clip}`);
  if (a.skipped?.length) throw new Error(`REDbridge skipped ${a.skipped.map((s) => `${s.name}: ${s.why}`).join("; ")}`);
  const files = [rawGlb];
  if (source) {
    const dir = sourceDir(project, set);
    fs.mkdirSync(dir, { recursive: true });
    if (source.motion) {
      fs.writeFileSync(path.join(dir, `${clip}.glb`), source.motion);
      files.push(path.join(dir, `${clip}.glb`));
    }
    if (source.record) {
      fs.writeFileSync(path.join(dir, `${clip}.json`), JSON.stringify(source.record, null, 2));
      files.push(path.join(dir, `${clip}.json`));
    }
  }
  return { set, clip, from: a.from, added: a.added, updated: a.updated, notes: a.notes, files };
}

/**
 * A fitted clip as a made animation: its own set on the rig, and beside the set's .glb the clip as <name>.glb and
 * its record <name>.edgefab.json (EDGEfab #7). A clip made again under the same name keeps its id. source.motion
 * (the motion as it came, such as Uthana's) is kept as <name>.source.glb.
 */
export async function addClip(
  bridge: Bridge,
  project: Project,
  rig: Rig,
  clip: string,
  glb: Buffer,
  facts: { seconds: number; fps?: number; rootMotion?: boolean; loop?: boolean; license?: AnimRecord["license"]; overwriteEdited?: boolean },
  source?: { motion?: Buffer; record?: Record<string, unknown> },
  set = addedSet(project, clip),
): Promise<ImportResult & { record: AnimRecord }> {
  const old = recordOf(project, clip, set);
  if (hasEdits(old) && !facts.overwriteEdited) throw new EditedClipError(clip, old!);
  const dir = path.dirname(path.join(project.rawDir, ...set.split(BS)));
  const recordFile = path.join(dir, `${clip}.edgefab.json`);
  // Made again, a clip keeps its id: EDGEdir's clips name it by that. No import over the old set: its own clip is
  // the only one, so the new set starts from the rig.
  const id = old?.id || crypto.randomUUID();
  if (old) fs.rmSync(path.join(project.archiveDir, ...set.split(BS)), { force: true });
  const r = await importClip(bridge, project, set, clip, glb, { rig: rig.rig });
  const record: AnimRecord = {
    kind: "anim",
    id,
    name: clip,
    anim: { rig: rig.rig, seconds: Math.round(facts.seconds * 1000) / 1000, fps: facts.fps ?? 30, rootMotion: facts.rootMotion ?? false, loop: facts.loop ?? false, name: clip },
    madeBy: "REDcode",
    made: new Date().toISOString(),
    ...(source?.record ? { source: source.record } : {}),
    ...(facts.license ? { license: facts.license } : {}),
  };
  fs.writeFileSync(path.join(dir, `${clip}.glb`), glb);
  fs.writeFileSync(recordFile, JSON.stringify(record, null, 2));
  r.files.push(path.join(dir, `${clip}.glb`), recordFile);
  if (source?.motion) {
    fs.writeFileSync(path.join(dir, `${clip}.source.glb`), source.motion);
    r.files.push(path.join(dir, `${clip}.source.glb`));
  }
  return { ...r, record };
}

/** The made clips in a project, found by their records (kind "anim") under source\raw, newest first. */
export function madeClips(project: Project): MadeClip[] {
  const out: (MadeClip & { at: number })[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && depth < 16 && !e.name.startsWith(".")) walk(full, depth + 1);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".edgefab.json")) {
        try {
          const r = JSON.parse(fs.readFileSync(full, "utf8")) as AnimRecord;
          if (r?.kind !== "anim" || !r.id || !r.anim) continue;
          const name = e.name.slice(0, -".edgefab.json".length);
          const rel = path.relative(project.rawDir, path.join(dir, `${name}.anims`)).split(path.sep).join(BS);
          out.push({ ...r, set: rel, record: full, glb: path.join(dir, `${name}.glb`), at: fs.statSync(full).mtimeMs });
        } catch {
          // not a record anim-core can read
        }
      }
    }
  };
  walk(project.rawDir, 0);
  return out.sort((a, b) => b.at - a.at).map(({ at: _at, ...c }) => c);
}

/**
 * A fitted clip over a game clip: a copy of the game's set at the game's path in the project (the game's set the
 * first time), that clip updated, every other clip kept. The whole file is replaced in the game, so two mods
 * replacing clips of one set conflict.
 */
export function replaceClip(bridge: Bridge, project: Project, gameSet: string, clip: string, glb: Buffer, source?: { motion?: Buffer; record?: Record<string, unknown> }): Promise<ImportResult> {
  return importClip(bridge, project, gameSet.toLowerCase(), clip, glb, { template: gameSet }, source);
}

/** The clips of a set in a project (names only), read through REDbridge. */
export async function clipsIn(bridge: Bridge, file: string): Promise<string[]> {
  const doc = (await bridge.request<{ doc: number }>("cr2w.open", { file })).doc;
  try {
    const root = await bridge.request<{ children: { name: string; count?: number }[] }>("cr2w.getNode", { doc, path: "" });
    const count = root.children.find((c) => c.name === "animations")?.count ?? 0;
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const v = (await bridge.request<{ value: any }>("cr2w.getNode", { doc, path: `animations.${i}.Data.animation.Data.name` })).value;
      names.push(v?.$value ?? String(v));
    }
    return names;
  } finally {
    await bridge.request("cr2w.close", { doc }).catch(() => undefined);
  }
}

