// Lip sync, the reading half (docs/research/lipsync.md, FL1 See): which characters have lip synced lines, a character's
// lines by scene with their words and voice file, and one line's clip as curves. Its own folder, as rigs and
// animation get. No VS Code imports. Every game read goes through REDbridge, passed in as one call function
// (callOf makes one from REDcode's BridgeClient or REDnode's kernel.bridge()). Needs REDbridge 0.14.0 (anims.info,
// options.animations).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** A REDbridge call: the method and its parameters in, the result out. */
export type BridgeCall = (method: string, params?: Record<string, unknown>) => Promise<any>;

const calls = new WeakMap<object, BridgeCall>();

/** Either kind of REDbridge client (REDcode's BridgeClient has request, REDnode's kernel.bridge() has call) as
 *  a BridgeCall. The same client gives the same function, since the game's lists are kept per call function. */
export function callOf(client: object): BridgeCall {
  let call = calls.get(client);
  if (!call) {
    const b = client as { request?: unknown; call?: unknown };
    const fn = typeof b.request === "function" ? b.request : typeof b.call === "function" ? b.call : undefined;
    if (!fn) throw new Error("Not a REDbridge client: it has neither request nor call");
    call = (method, params) => (fn as BridgeCall).call(client, method, params);
    calls.set(client, call);
  }
  return call;
}

export class LipsyncError extends Error {}

export const DefaultLanguage = "en-us";

/** A character that speaks: the game keys lip sync by voice tag, not by head. */
export interface LipsyncCharacter {
  /** The voice tag's name, such as `angelica_whelan`; the id when the game's lists have no name for it. */
  voiceTag: string;
  /** The voice tag's id, as the lip sync map and a scene's `voicetagId` hold it. */
  id: string;
  /** How many scenes (voice sets too) have lip sync for this character. */
  scenes: number;
}

export interface LipsyncLine {
  /** The clip's name in the set: `f_<HEX>` or `m_<HEX>`. */
  clip: string;
  gender: "female" | "male";
  /** The line's string id, decimal, as the voice and subtitle maps hold it. */
  lineId: string;
  /** The same in 16 hex digits, as clip and `.wem` names hold it. */
  hex: string;
  /** The words, when the language's subtitles have the line. */
  text?: string;
  /** The voice file's game path (`.wem`), when the line is voiced. */
  audio?: string;
  seconds: number;
  frames: number;
}

export interface LipsyncScene {
  /** The scene's game path, or its hash when the name is not known. */
  scene: string;
  /** The clip set's game path. */
  set: string;
  /** The head's skeleton the set names. */
  rig?: string;
  lines: LipsyncLine[];
  /** Why the set could not be read, in the game's words. */
  error?: string;
}

export interface LipsyncLines {
  character: LipsyncCharacter;
  language: string;
  /** How many scenes the character has; `scenes` holds `offset` to `offset + limit` of them. */
  total: number;
  offset: number;
  scenes: LipsyncScene[];
}

/**
 * What a track is for. `lipsync` (`<pose>LipsyncPoseOutput`) is what a lip sync clip drives: the mouth, and
 * also brows, blinks and the throat. `override` mutes other face animation on those poses, `control` is the
 * envelopes and JALI's two controls, `pose` the plain poses that ride along (eye direction, head, neck).
 */
export type TrackGroup = "lipsync" | "override" | "control" | "pose" | "wrinkle";

export interface LipsyncTrack {
  name: string;
  group: TrackGroup;
  /** The face part, from the name: jaw, lips, tongue, cheek, brow, eye, nose, throat, neck, head or other. */
  part: string;
  /** Flat pairs: seconds, value, seconds, value, ... */
  keys: number[];
  min: number;
  max: number;
}

export interface LipsyncClip {
  set: string;
  clip: string;
  rig?: string;
  seconds: number;
  fps: number;
  frames: number;
  /** How many tracks the head rig has (414 on every head read). */
  trackCount: number;
  /** The tracks that move, in the rig's order. */
  tracks: LipsyncTrack[];
  /** Tracks that hold one value other than 0 for the whole line. */
  held: { name: string; group: TrackGroup; value: number }[];
}

interface MapEntry {
  sceneHash: string;
  voiceTags: string[];
  sets: string[];
}

const value = (v: unknown): string => (v && typeof v === "object" && "$value" in v ? String((v as { $value: unknown }).$value) : String(v ?? ""));

async function rootChunk(call: BridgeCall, gamePath: string): Promise<any> {
  const r = (await call("cr2w.toJson", { path: gamePath })) as { json?: string };
  if (!r?.json) throw new LipsyncError(`REDbridge gave no content for ${gamePath}.`);
  return JSON.parse(r.json)?.Data?.RootChunk;
}

// One set of the game's lists per bridge: the map is 3,527 scenes and reads in a fifth of a second.
const tagCache = new WeakMap<BridgeCall, Promise<Map<string, string>>>();
const mapCache = new WeakMap<BridgeCall, Map<string, Promise<MapEntry[]>>>();

/** Voice tag names by id, from the game's two lists (the base game's and Phantom Liberty's). */
export function voiceTags(call: BridgeCall): Promise<Map<string, string>> {
  let cached = tagCache.get(call);
  if (!cached) {
    cached = (async () => {
      const names = new Map<string, string>();
      for (const file of ["base\\sound\\localization\\voicetaglist.voicetags", "ep1\\sound\\localization\\voicetaglist.voicetags"]) {
        try {
          for (const t of (await rootChunk(call, file))?.voiceTags ?? []) names.set(String(t.id), value(t.voiceTag));
        } catch {
          // Phantom Liberty not installed, or a list that doesn't read: the ids still work.
        }
      }
      return names;
    })();
    cached.catch(() => tagCache.delete(call));
    tagCache.set(call, cached);
  }
  return cached;
}

function lipsyncMap(call: BridgeCall, language: string): Promise<MapEntry[]> {
  let byLanguage = mapCache.get(call);
  if (!byLanguage) mapCache.set(call, (byLanguage = new Map()));
  let cached = byLanguage.get(language);
  if (!cached) {
    cached = (async () => {
      let root: any;
      try {
        root = await rootChunk(call, `base\\localization\\${language}.lipmap`);
      } catch (e) {
        throw new LipsyncError(`The game has no lip sync map for ${language} (${e instanceof Error ? e.message : e}).`);
      }
      const paths: unknown[] = root?.scenePaths ?? [];
      return (root?.sceneEntries ?? []).map((e: any, i: number) => ({
        sceneHash: String(paths[i] ?? ""),
        voiceTags: (e.actorVoiceTags ?? []).map(String),
        sets: (e.animSets ?? []).map((s: any) => value(s?.DepotPath)),
      }));
    })();
    cached.catch(() => byLanguage!.delete(language));
    byLanguage.set(language, cached);
  }
  return cached;
}

/** Every character with lip sync in a language, most scenes first; `find` keeps the names that contain it. */
export async function lipsyncCharacters(call: BridgeCall, options: { language?: string; find?: string } = {}): Promise<LipsyncCharacter[]> {
  const [names, map] = await Promise.all([voiceTags(call), lipsyncMap(call, options.language ?? DefaultLanguage)]);
  const counts = new Map<string, number>();
  // A tag without a clip set at its place (one of V's scenes in 2.5) has nothing to show.
  for (const e of map) e.voiceTags.forEach((id, i) => e.sets[i] && counts.set(id, (counts.get(id) ?? 0) + 1));
  const find = options.find?.trim().toLowerCase();
  return [...counts]
    .map(([id, scenes]) => ({ voiceTag: names.get(id) ?? id, id, scenes }))
    .filter((c) => !find || c.voiceTag.toLowerCase().includes(find) || c.id === find)
    .sort((a, b) => b.scenes - a.scenes || a.voiceTag.localeCompare(b.voiceTag));
}

/** One character by voice tag name or id; a part of a name works when only one character has it. */
export async function lipsyncCharacter(call: BridgeCall, character: string, language = DefaultLanguage): Promise<LipsyncCharacter> {
  const all = await lipsyncCharacters(call, { language });
  const want = character.trim().toLowerCase();
  const exact = all.find((c) => c.voiceTag.toLowerCase() === want || c.id === want);
  if (exact) return exact;
  const close = all.filter((c) => c.voiceTag.toLowerCase().includes(want));
  if (close.length === 1) return close[0];
  if (!close.length) throw new LipsyncError(`No character with lip sync in ${language} is called "${character}". Voice tags look like judy, panam or angelica_whelan.`);
  throw new LipsyncError(`"${character}" fits ${close.length} characters: ${close.slice(0, 12).map((c) => c.voiceTag).join(", ")}${close.length > 12 ? ", ..." : ""}. Name one.`);
}

const sceneCache = new WeakMap<BridgeCall, Map<string, Promise<string>>>();

/** A scene's game path from its hash, or the hash when the game's names don't have it. Kept per bridge: V's
 *  scenes are hundreds, asked for again at every page. */
function sceneOf(call: BridgeCall, hash: string): Promise<string> {
  let known = sceneCache.get(call);
  if (!known) sceneCache.set(call, (known = new Map()));
  let scene = known.get(hash);
  if (!scene) {
    scene = (call("hash.resolve", { hash }) as Promise<{ path?: string; known?: boolean }>).then(
      (r) => (r?.known && r.path ? r.path : hash),
      () => hash,
    );
    known.set(hash, scene);
  }
  return scene;
}

/** Where a line's lip sync is: whose it is, the scene and the clip set, and the clip when one line was asked for. */
export interface LipsyncPlace {
  character: LipsyncCharacter;
  language: string;
  /** The scene's game path, or its hash when the name is not known. */
  scene: string;
  set: string;
  clip?: string;
}

/** The language of a lip sync set, from its game path (`base\localization\en-us\lipsync\...anims`); undefined
 *  for any other file. */
export function lipsyncSetLanguage(gamePath: string): string | undefined {
  return /(?:^|\\)localization\\([a-z]{2}-[a-z]{2})\\lipsync\\.+\.anims$/i.exec(gamePath.replace(/\//g, "\\"))?.[1].toLowerCase();
}

/** The line a voice file speaks, from its game path (`ep1\localization\en-us\vo\judy_q307_f_2e66c436233bc000.wem`):
 *  the language, the clip its lip sync has, and the name's start, which begins with the voice tag. Undefined for
 *  a file named otherwise. */
export function lineOfVoice(gamePath: string): { language: string; gender: "female" | "male"; hex: string; lineId: string; clip: string; name: string } | undefined {
  const m = /(?:^|\\)localization\\([a-z]{2}-[a-z]{2})\\vo[a-z_]*\\([^\\]+)_([fm])_([0-9a-f]{16})\.wem$/i.exec(gamePath.replace(/\//g, "\\"));
  if (!m) return undefined;
  const line = lineOfClip(`${m[3]}_${m[4]}`)!;
  return { language: m[1].toLowerCase(), ...line, clip: `${m[3].toLowerCase()}_${line.hex}`, name: m[2].toLowerCase() };
}

/** Whose lip sync set a game path is, and for which scene: the game's lip sync map names each set beside its
 *  voice tag. Undefined when the map of that language does not have the set. */
export async function lipsyncOfSet(call: BridgeCall, set: string, language = lipsyncSetLanguage(set) ?? DefaultLanguage): Promise<LipsyncPlace | undefined> {
  const want = set.replace(/\//g, "\\").toLowerCase();
  const [all, map] = await Promise.all([lipsyncCharacters(call, { language }), lipsyncMap(call, language)]);
  for (const e of map) {
    const i = e.sets.findIndex((s) => s.toLowerCase() === want);
    const character = i < 0 ? undefined : all.find((c) => c.id === e.voiceTags[i]);
    if (character) return { character, language, scene: await sceneOf(call, e.sceneHash), set: e.sets[i] };
  }
  return undefined;
}

/**
 * The lip sync of a voice file: the character from the file name's start, the scene from the line's subtitle
 * file (named as its scene), then the clip in that scene's set. A character with up to 400 scenes is searched
 * whole when the scene's name does not lead there. Undefined when the game has no clip for the line.
 */
export async function lipsyncOfVoice(call: BridgeCall, voice: string): Promise<LipsyncPlace | undefined> {
  const v = lineOfVoice(voice);
  if (!v) return undefined;
  const all = await lipsyncCharacters(call, { language: v.language });
  // The longest voice tag the name starts with: `judy_scene_judy_default` is judy's, `v_q302` is V's.
  const fits = all.filter((c) => v.name === c.voiceTag || v.name.startsWith(`${c.voiceTag}_`)).sort((a, b) => b.voiceTag.length - a.voiceTag.length);
  return placeOfLine(call, fits.slice(0, 3), v.clip, v.lineId, v.language);
}

/** The scene and set of one of a character's lines, by its clip's name (`f_2CE9C077837E0000`). Undefined when
 *  the game has no such clip for them. */
export async function lipsyncOfClip(call: BridgeCall, character: string, clip: string, language = DefaultLanguage): Promise<LipsyncPlace | undefined> {
  const line = lineOfClip(clip);
  if (!line) return undefined;
  return placeOfLine(call, [await lipsyncCharacter(call, character, language)], `${line.gender === "female" ? "f" : "m"}_${line.hex}`, line.lineId, language);
}

/** Finds a line's clip among the scenes of the characters it may be (the likeliest first): by the scene its
 *  subtitle file is named after, then, for a character with up to 400 scenes, in all of them. */
async function placeOfLine(call: BridgeCall, fits: LipsyncCharacter[], clip: string, lineId: string, language: string): Promise<LipsyncPlace | undefined> {
  if (!fits.length) return undefined;
  const details = ((await call("loc.lines", { stringIds: [lineId], language }).catch(() => [])) as { file?: string }[]) ?? [];
  const file = details[0]?.file ?? "";
  const sceneName = file.slice(file.lastIndexOf("\\") + 1).replace(/\.json$/i, "");
  const find = async (character: LipsyncCharacter, scene: string | undefined): Promise<LipsyncPlace | undefined> => {
    for (let offset = 0; ; offset += 200) {
      const page = await lipsyncLines(call, { character: character.id, language, scene, offset, limit: 200 });
      const found = page.scenes.find((s) => s.lines.some((l) => l.clip === clip));
      if (found) return { character, language, scene: found.scene, set: found.set, clip };
      if (offset + page.scenes.length >= page.total || !page.scenes.length) return undefined;
    }
  };
  for (const character of fits) {
    const place = sceneName ? await find(character, sceneName) : undefined;
    if (place) return place;
  }
  return fits[0].scenes <= 400 ? find(fits[0], undefined) : undefined;
}

/** The line a clip is for, from its name (`f_2CE9C077837E0000`); undefined for a clip named otherwise. */
export function lineOfClip(clip: string): { gender: "female" | "male"; hex: string; lineId: string } | undefined {
  const m = /^([fm])_([0-9a-f]{1,16})$/i.exec(clip);
  if (!m) return undefined;
  return { gender: m[1].toLowerCase() === "f" ? "female" : "male", hex: m[2].toUpperCase().padStart(16, "0"), lineId: BigInt(`0x${m[2]}`).toString() };
}

/**
 * A character's lip synced lines, scene by scene: each line's clip, words, voice file and length. Scenes come a
 * page at a time (V has hundreds); `scene` keeps the scenes whose path contains it.
 */
export async function lipsyncLines(
  call: BridgeCall,
  request: { character: string; language?: string; scene?: string; offset?: number; limit?: number },
): Promise<LipsyncLines> {
  const language = request.language ?? DefaultLanguage;
  const character = await lipsyncCharacter(call, request.character, language);
  const map = await lipsyncMap(call, language);
  let entries = map.flatMap((e) => {
    // A scene can list a character more than once, each time with its own set.
    return e.voiceTags.flatMap((id, i) => (id === character.id && e.sets[i] ? [{ sceneHash: e.sceneHash, set: e.sets[i] }] : []));
  });
  const named = await Promise.all(entries.map(async (e) => ({ ...e, scene: await sceneOf(call, e.sceneHash) })));
  const filter = request.scene?.trim().toLowerCase().replace(/\//g, "\\");
  const kept = (filter ? named.filter((e) => e.scene.toLowerCase().includes(filter) || e.set.toLowerCase().includes(filter)) : named).sort((a, b) => a.scene.localeCompare(b.scene));
  const offset = Math.max(0, request.offset ?? 0);
  const page = kept.slice(offset, offset + Math.max(1, Math.min(request.limit ?? 20, 200)));
  entries = page;

  const info = page.length ? ((await call("anims.info", { files: page.map((e) => e.set) })) as { items?: any[] }) : { items: [] };
  const sets = new Map<string, any>((info.items ?? []).map((s: any) => [String(s.path).toLowerCase(), s]));
  const ids = new Set<string>();
  for (const s of sets.values()) for (const c of s.clips ?? []) {
    const line = lineOfClip(c.name);
    if (line) ids.add(line.lineId);
  }
  const details = new Map<string, any>();
  if (ids.size) {
    const found = (await call("loc.lines", { stringIds: [...ids], language })) as any[];
    for (const d of found ?? []) details.set(String(d.stringId), d);
  }

  const scenes: LipsyncScene[] = page.map((e) => {
    const s = sets.get(e.set.toLowerCase());
    const lines: LipsyncLine[] = [];
    for (const c of s?.clips ?? []) {
      const line = lineOfClip(c.name);
      if (!line) continue;
      const d = details.get(line.lineId);
      // A line said the same by both of V's voices has its words under female only.
      const text = (line.gender === "male" && d?.male ? d.male : d?.female) || d?.male || undefined;
      lines.push({
        clip: c.name, gender: line.gender, lineId: line.lineId, hex: line.hex, text,
        audio: d?.voice?.[line.gender] || undefined,
        seconds: +Number(c.duration).toFixed(4), frames: c.frames,
      });
    }
    return { scene: e.scene, set: e.set, rig: s?.rig ?? undefined, lines, error: s?.error ?? (s ? undefined : "The set is not in the game's archives.") };
  });
  return { character, language, total: kept.length, offset, scenes };
}

function partOf(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("brows")) return "brow";
  if (n.startsWith("neck_throat")) return "throat";
  for (const part of ["jaw", "tongue", "lips", "cheek", "eye", "brow", "nose", "neck", "head"]) if (n.startsWith(part)) return part;
  if (n.startsWith("jali")) return n.includes("jaw") ? "jaw" : "lips";
  return "other";
}

/** Sorts a head rig's track names into groups. Poses are the names that have a `LipsyncPoseOutput` twin. */
export function trackGroups(names: string[]): { group: TrackGroup; part: string }[] {
  const poses = new Set(names.filter((n) => n.endsWith("LipsyncPoseOutput")).map((n) => n.slice(0, -"LipsyncPoseOutput".length)));
  return names.map((n) => {
    if (n.endsWith("LipsyncPoseOutput")) return { group: "lipsync", part: partOf(n) };
    if (n.endsWith("AnimOverrideWeight")) return { group: "override", part: partOf(n) };
    if (n.endsWith("Wrnkl")) return { group: "wrinkle", part: partOf(n) };
    return { group: poses.has(n) ? "pose" : "control", part: partOf(n) };
  });
}

/** The JSON part of a GLB. */
function glbJson(file: string): any {
  const b = fs.readFileSync(file);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67) throw new LipsyncError(`${file} is not a GLB.`);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8"));
}

let cacheDir: string | undefined;

/** Sets where exports are kept: REDcode gives a folder under its global storage. */
export function setLipsyncCacheDir(dir: string): void {
  cacheDir = dir;
}

/** Where exported clips and heads are kept: game data, so on the modder's PC only, outside any project. The
 *  folder the caller set, else LIPSYNC_CACHE, else `%LOCALAPPDATA%\REDcode\cache\lipsync`. */
export function lipsyncCacheDir(): string {
  return cacheDir ?? process.env.LIPSYNC_CACHE ?? path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "REDcode", "cache", "lipsync");
}

/**
 * One line's clip as curves: every track that moves, with its keys. REDbridge writes the clip alone to a glTF
 * (about a third of a second), whose extras hold the float tracks (WolvenKit's `wkit.cp2077.gltf.anims`).
 */
export async function lipsyncClip(call: BridgeCall, request: { set: string; clip: string; cacheDir?: string }): Promise<LipsyncClip> {
  const set = request.set.replace(/\//g, "\\");
  const work = path.join(request.cacheDir ?? lipsyncCacheDir(), "clip");
  const archiveDir = path.join(work, "archive");
  const rawDir = path.join(work, "raw");
  fs.mkdirSync(archiveDir, { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });
  const file = path.join(archiveDir, set);
  if (!fs.existsSync(file)) await call("archive.extract", { path: set, outFile: file });
  const r = (await call("project.export", { file, archiveDir, rawDir, options: { animations: [request.clip] } })) as { ok?: boolean; written?: string[] };
  const glb = path.join(rawDir, r?.written?.[0] ?? `${set}.glb`);
  if (!r?.ok || !fs.existsSync(glb)) throw new LipsyncError(`REDbridge didn't export ${request.clip} from ${set}.`);
  const json = glbJson(glb);
  fs.rmSync(glb, { force: true }); // one clip at a time: the next export would overwrite it anyway

  const animation = (json.animations ?? []).find((a: any) => a.name === request.clip) ?? json.animations?.[0];
  const extras = animation?.extras;
  if (extras?.schema?.type !== "wkit.cp2077.gltf.anims") throw new LipsyncError(`${request.clip} came out without WolvenKit's animation extras, so its tracks can't be read.`);
  const skin = (json.skins ?? []).find((s: any) => Array.isArray(s?.extras?.trackNames));
  const names: string[] = skin?.extras?.trackNames ?? [];
  const groups = trackGroups(names);

  const byTrack = new Map<number, { time: number; value: number }[]>();
  for (const k of extras.trackKeys ?? []) {
    let keys = byTrack.get(k.trackIndex);
    if (!keys) byTrack.set(k.trackIndex, (keys = []));
    keys.push(k);
  }
  const tracks: LipsyncTrack[] = [];
  let seconds = 0;
  for (const [index, keys] of [...byTrack].sort((a, b) => a[0] - b[0])) {
    keys.sort((a, b) => a.time - b.time);
    const flat: number[] = [];
    let min = Infinity;
    let max = -Infinity;
    for (const k of keys) {
      flat.push(+k.time.toFixed(4), +k.value.toFixed(5));
      min = Math.min(min, k.value);
      max = Math.max(max, k.value);
    }
    seconds = Math.max(seconds, keys[keys.length - 1].time);
    const g = groups[index] ?? { group: "control" as const, part: "other" };
    tracks.push({ name: names[index] ?? `track ${index}`, group: g.group, part: g.part, keys: flat, min: +min.toFixed(5), max: +max.toFixed(5) });
  }
  const held = (extras.constTrackKeys ?? [])
    .filter((k: any) => Math.abs(k.value) > 1e-6 && !byTrack.has(k.trackIndex))
    .map((k: any) => ({ name: names[k.trackIndex] ?? `track ${k.trackIndex}`, group: groups[k.trackIndex]?.group ?? ("control" as const), value: +k.value.toFixed(5) }));

  const fps = 30;
  return {
    set, clip: animation.name, rig: skin?.extras?.rigPath ?? undefined,
    seconds: +seconds.toFixed(4), fps, frames: Math.round(seconds * fps) + 1,
    trackCount: names.length, tracks, held,
  };
}

/** A track's value at a time, between its keys. */
export function sampleTrack(track: LipsyncTrack, seconds: number): number {
  const k = track.keys;
  if (!k.length) return 0;
  if (seconds <= k[0]) return k[1];
  for (let i = 2; i < k.length; i += 2) {
    if (seconds <= k[i]) {
      const span = k[i] - k[i - 2];
      return span > 0 ? k[i - 1] + ((k[i + 1] - k[i - 1]) * (seconds - k[i - 2])) / span : k[i + 1];
    }
  }
  return k[k.length - 1];
}
