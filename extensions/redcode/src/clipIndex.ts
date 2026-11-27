// The clip index (docs/design/animation-timeline.md, "Finding and using game clips"): every game .anims file's clip
// names, rig and lengths, read once through REDbridge's anims.info and kept in the game cache (emptied by a game patch),
// so the timeline can find a game clip by words. No VS Code imports: the MCP server can bundle it.
// Measured 2026-11-26 (tools/probes/anims/clip-index.mjs): 14,016 files, 146,814 clips, about 2 minutes, 7 MB.
import fs from "node:fs";
import path from "node:path";

export interface ClipIndexCall {
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

export interface ClipIndex {
  version: 1;
  built: string;
  /** Rig paths; each file names one by its place here, or -1 for none. */
  rigs: string[];
  /** [game path of the set, rig, [clip name, seconds][]] */
  files: [string, number, [string, number][]][];
}

export interface ClipHit {
  set: string;
  clip: string;
  seconds: number;
  rig: string | null;
  /** "same": the open clip's rig; "person": another body rig with the same bones by name; "other": a rig whose bones differ. */
  fits: "same" | "person" | "other";
}

const IndexVersion = 1;
const Batch = 50;

export function clipIndexFile(cacheRoot: string): string {
  return path.join(cacheRoot, "game", "clip-index.json");
}

export function loadClipIndex(cacheRoot: string): ClipIndex | undefined {
  try {
    const index = JSON.parse(fs.readFileSync(clipIndexFile(cacheRoot), "utf8")) as ClipIndex;
    return index.version === IndexVersion && Array.isArray(index.files) ? index : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads every .anims in the game's archives. onProgress gets files read and the total; a true from
 * cancelled() stops it between batches (nothing is written). A batch that fails is read file by file,
 * and a file that still fails is left out.
 */
export async function buildClipIndex(
  bridge: ClipIndexCall,
  cacheRoot: string,
  onProgress?: (done: number, total: number) => void,
  cancelled?: () => boolean,
): Promise<ClipIndex | undefined> {
  const found = new Set<string>();
  for (let offset = 0; ; offset += 5000) {
    const r = await bridge.request<{ total: number; items: { name: string }[] }>("archive.list", { extension: ".anims", offset, limit: 5000 });
    for (const i of r.items) found.add(i.name);
    if (offset + 5000 >= r.total) break;
  }
  const paths = [...found].sort();
  const rigs: string[] = [];
  const rigAt = new Map<string, number>();
  const files: ClipIndex["files"] = [];
  type Info = { items?: { path: string; rig?: string | null; clips?: { name: string; duration: number }[] }[] };
  const take = (r: Info) => {
    for (const f of r.items ?? []) {
      let rig = -1;
      if (f.rig) {
        rig = rigAt.get(f.rig) ?? rigs.length;
        if (rig === rigs.length) {
          rigs.push(f.rig);
          rigAt.set(f.rig, rig);
        }
      }
      files.push([f.path, rig, (f.clips ?? []).map((c) => [c.name, Math.round(c.duration * 100) / 100])]);
    }
  };
  for (let i = 0; i < paths.length; i += Batch) {
    if (cancelled?.()) return undefined;
    const batch = paths.slice(i, i + Batch);
    try {
      take(await bridge.request<Info>("anims.info", { files: batch }));
    } catch {
      for (const p of batch) {
        try {
          take(await bridge.request<Info>("anims.info", { files: [p] }));
        } catch {
          // left out
        }
      }
    }
    onProgress?.(Math.min(i + Batch, paths.length), paths.length);
  }
  const index: ClipIndex = { version: IndexVersion, built: new Date().toISOString(), rigs, files };
  const file = clipIndexFile(cacheRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(index));
  return index;
}

/**
 * A person's rig: a main build's base rig or V's, which all have man_base's 71 bones by name
 * (docs/design/bodies.md, tools/probes/bodies/rigs.mjs).
 */
export function isPersonRig(rig: string | null | undefined): boolean {
  if (!rig) return false;
  const r = rig.toLowerCase();
  if (/\\player_(wo)?man_skeleton\.rig$/.test(r)) return true;
  const m = /\\base_entities\\([^\\]+)\\([^\\]+)\.rig$/.exec(r);
  return !!m && m[1] === m[2];
}

function fitsOf(rig: string | null, openRig: string | undefined): ClipHit["fits"] {
  if (rig && openRig && rig.toLowerCase() === openRig.toLowerCase()) return "same";
  if (isPersonRig(rig) && (!openRig || isPersonRig(openRig))) return "person";
  return "other";
}

const FitRank = { same: 0, person: 1, other: 2 } as const;

/**
 * Clips whose name or set path holds every word of the query (any case; "_" and spaces both split
 * words). Clips on the open clip's rig come first, then a person's rig, then the rest; within those,
 * more words in the clip's own name, then shorter names.
 */
export function searchClips(index: ClipIndex, query: string, openRig?: string, limit = 60): { hits: ClipHit[]; total: number } {
  const words = query.toLowerCase().split(/[\s_]+/).filter(Boolean);
  if (!words.length) return { hits: [], total: 0 };
  const found: { hit: ClipHit; score: number }[] = [];
  for (const [set, rigAt, clips] of index.files) {
    const setLow = set.toLowerCase();
    const rig = rigAt >= 0 ? index.rigs[rigAt] : null;
    let fits: ClipHit["fits"] | undefined;
    for (const [clip, seconds] of clips) {
      const name = clip.toLowerCase();
      let inName = 0;
      let all = true;
      for (const w of words) {
        if (name.includes(w)) inName++;
        else if (!setLow.includes(w)) {
          all = false;
          break;
        }
      }
      if (!all) continue;
      fits ??= fitsOf(rig, openRig);
      found.push({ hit: { set, clip, seconds, rig, fits }, score: FitRank[fits] * 1000 - inName * 100 + Math.min(clip.length, 99) });
    }
  }
  found.sort((a, b) => a.score - b.score || a.hit.set.localeCompare(b.hit.set));
  return { hits: found.slice(0, limit).map((f) => f.hit), total: found.length };
}
