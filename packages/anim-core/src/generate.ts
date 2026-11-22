// From words to a clip in a project: the stand-in, Uthana's job, the download, the fit, and the import, each
// stage reported, as REDcode's Generate panel and the Animation Tools pack show them.

import { fitClip, type FitReport } from "./fit";
import { addClip, EditedClipError, hasEdits, recordOf, referenceClip, replaceClip, slug, standIn, uthanaLicense, type AnimRecord, type Bridge, type ImportResult, type Project, type Rig } from "./game";
import { readGlb } from "./glb";
import { cost, Models, motionIdOf, type Model, type Uthana } from "./uthana";

export type Stage = "stand-in" | "queued" | "running" | "downloading" | "fitting" | "importing" | "done";

export interface GenerateOptions {
  bridge: Bridge;
  uthana: Uthana;
  /** The key, for the stand-in's record (only its fingerprint is kept). */
  key: string;
  rig: Rig;
  project: Project;
  /** REDbridge's export cache for anim-core. */
  cacheDir: string;
  prompt: string;
  /** Seconds. */
  length?: number;
  model?: Model;
  /** No travel (default): workspots apply no root motion. */
  inPlace?: boolean;
  /** Uthana rewrites the prompt unless false. */
  rewritePrompt?: boolean;
  /** The clip's name; from the prompt when left out. */
  name?: string;
  /** Replace this game clip in its set instead of adding to the project's set. */
  replace?: { set: string; clip: string };
  /** Make again a clip that has EDGEfab's edits (the modder said so); otherwise generate stops before paying. */
  overwriteEdited?: boolean;
  /** The Uthana account's plan, for the record's license (default "paid"). */
  plan?: "paid" | "free";
  onStage?: (stage: Stage, detail?: string) => void;
  signal?: AbortSignal;
}

export interface Generated extends ImportResult {
  motionId: string;
  characterId: string;
  report: FitReport;
  cost: number;
  record?: AnimRecord;
}

/** A clip name from a prompt: its first few words, lowercase. */
export function clipNameFor(prompt: string): string {
  const words = slug(prompt).split("_").filter((w) => !["a", "an", "the", "and", "then", "his", "her", "their", "of", "to", "with"].includes(w));
  return words.slice(0, 4).join("_") || "clip";
}

export async function generate(o: GenerateOptions): Promise<Generated> {
  const model = o.model ?? "text-to-motion-3.0";
  const length = o.length ?? 5;
  const stage = (s: Stage, d?: string) => o.onStage?.(s, d);

  const m = Models[model];
  if (!m) throw new Error(`No Uthana model ${model}`);
  if (!(length >= m.min && length <= m.max)) throw new Error(`${model} makes ${m.min} to ${m.max} seconds, not ${length}`);
  // Before paying: a clip with EDGEfab's edits is not made again unless the modder said so (EDGEfab #7).
  const clip = o.replace?.clip ?? slug(o.name ?? clipNameFor(o.prompt));
  if (!o.replace) {
    const old = recordOf(o.project, clip);
    if (hasEdits(old) && !o.overwriteEdited) throw new EditedClipError(clip, old!);
  }

  stage("stand-in");
  const character = await standIn(o.bridge, o.uthana, o.key, o.rig, o.cacheDir);
  if (o.signal?.aborted) throw new Error("Stopped");

  const job = await o.uthana.textToMotion(o.prompt, { model, length, characterId: character.id, rewritePrompt: o.rewritePrompt });
  stage("queued", job.id);
  const done = await o.uthana.wait(job.id, { signal: o.signal, onStatus: (s) => s === "RESERVED" && stage("running", job.id) });
  if (done.status !== "FINISHED") throw new Error(`Uthana's job ${done.status.toLowerCase()}: ${JSON.stringify(done.result ?? null).slice(0, 300)}`);
  const motionId = motionIdOf(done);
  if (!motionId) throw new Error(`Uthana finished but named no motion: ${JSON.stringify(done.result ?? null).slice(0, 300)}`);

  stage("downloading", motionId);
  const motion = await o.uthana.download(character.id, motionId, { fps: 30, inPlace: o.inPlace !== false });

  stage("fitting");
  const { glb, report } = fitClip(readGlb(motion), await referenceClip(o.bridge, o.cacheDir, o.rig), clip);
  if (report.missingBones.length) throw new Error(`Uthana's motion lacks ${report.missingBones.length} of the rig's bones (${report.missingBones.slice(0, 5).join(", ")}): it is not on the game's skeleton`);

  stage("importing", clip);
  const record = {
    source: "uthana",
    prompt: o.prompt,
    model,
    length,
    inPlace: o.inPlace !== false,
    motionId,
    characterId: character.id,
    rig: o.rig.rig,
    made: new Date().toISOString(),
  };
  const r = o.replace
    ? await replaceClip(o.bridge, o.project, o.replace.set, clip, glb, { motion, record })
    : await addClip(o.bridge, o.project, o.rig, clip, glb, { seconds: report.duration, fps: 30, rootMotion: o.inPlace === false, license: uthanaLicense(o.plan), overwriteEdited: o.overwriteEdited }, { motion, record });
  stage("done", clip);
  return { ...r, motionId, characterId: character.id, report, cost: cost(model, length), record: "record" in r ? (r as { record: AnimRecord }).record : undefined };
}
