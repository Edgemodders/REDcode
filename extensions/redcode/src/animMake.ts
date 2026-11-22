// Making animations in REDcode (docs/design/animation-tools.md, AT2): Generate with Uthana, Add Clip from GLB and
// Replace Clip from GLB, over @edgemodders/anim-core. The animation view, the commands and REDcodeApi all come here.

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import * as anim from "../../../packages/anim-core/src/index";
import type { BridgeClient } from "./bridgeClient";
import { getKey } from "./keys";

/** What a make asks for. */
export interface MakeRequest {
  /** "generate": from words through Uthana. "glb": from a .glb already on the game's rig. */
  action: "generate" | "glb";
  /** The rig's game path (the open set's). */
  rig: string;
  prompt?: string;
  length?: number;
  model?: anim.Model;
  inPlace?: boolean;
  /** Uthana rewrites the prompt unless this is set. */
  asWritten?: boolean;
  /** The new clip's name; from the prompt (or the file's name) when left out. */
  name?: string;
  /** Replace this game clip in a copy of its set in the project, instead of making a new clip. */
  replace?: { set: string; clip: string };
  /** The .glb for "glb"; asked for when left out. */
  file?: string;
}

export interface MakeResult {
  /** The set's file on disk, and its path under the project's archive folder. */
  file: string;
  set: string;
  clip: string;
  replaced: boolean;
  /** US dollars, for a generated clip. */
  cost?: number;
  /** The made clip's record (a new clip only). */
  id?: string;
  notes: string[];
}

export interface MakeDeps {
  bridge(): BridgeClient;
  /** The open project's folder; throws when none is open. */
  projectDir(): string;
  /** anim-core's export cache. */
  cacheDir: string;
  /** The Uthana key for REDcode, asking the modder when none is saved; undefined when they do not give one. */
  uthanaKey(): Promise<string | undefined>;
  log: vscode.OutputChannel;
  /** After a make: the Project view shows the new files. */
  refresh(): void;
}

export type StageCallback = (stage: anim.Stage, detail?: string) => void;

/** What each stage says to the modder. */
export const StageText: Record<anim.Stage, string> = {
  "stand-in": "Getting the stand-in character on Uthana (uploaded once per rig)…",
  queued: "Uthana has the job…",
  running: "Uthana is making the motion…",
  downloading: "Downloading the motion…",
  fitting: "Fitting it onto the game's rig…",
  importing: "Writing the clip into the project…",
  done: "Done",
};

/** The rig anim-core can make clips on, or why not. */
export function makeRig(rigPath: string): { rig?: anim.Rig; why?: string } {
  const rig = anim.rigFor(rigPath);
  if (rig) return { rig };
  const name = rigPath.split("\\").pop() || "this file's rig";
  return { why: `Clips are made on the base man's and woman's rigs (man_base, woman_base) for now, not on ${name}.` };
}

/** Closes every editor tab on a file; false when one was not closed (its unsaved changes kept). */
async function closeTabsOn(file: string): Promise<boolean> {
  const want = path.resolve(file).toLowerCase();
  const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => {
    const input = t.input;
    const uri = input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom ? input.uri : undefined;
    return uri?.scheme === "file" && path.resolve(uri.fsPath).toLowerCase() === want;
  });
  if (!tabs.length) return true;
  return vscode.window.tabGroups.close(tabs);
}

/** A name not yet taken by a made clip in the project: name, name_2, name_3… */
function freeName(project: anim.Project, name: string): string {
  if (!anim.recordOf(project, name)) return name;
  for (let i = 2; ; i++) if (!anim.recordOf(project, `${name}_${i}`)) return `${name}_${i}`;
}

/**
 * Makes a clip. For a new clip whose name is taken, the modder is asked: make it again (a new take, keeping its
 * id) or keep both. A clip EDGEfab has edited is made again only when they say so, and they are asked before Uthana
 * is paid. For a replacement, editor tabs on the project's copy of the set are closed first.
 */
export async function makeClip(deps: MakeDeps, req: MakeRequest, onStage: StageCallback = () => undefined): Promise<MakeResult> {
  const { rig, why } = makeRig(req.rig);
  if (!rig) throw new Error(why);
  const project = anim.projectAt(deps.projectDir());
  const bridge = anim.asBridge(deps.bridge());

  let file = req.file;
  if (req.action === "glb" && !file) {
    const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { glTF: ["glb"] }, title: req.replace ? `A .glb to replace ${req.replace.clip} with` : "A .glb with a clip on the game's rig", defaultUri: vscode.Uri.file(project.rawDir) });
    if (!picked?.[0]) throw cancelled();
    file = picked[0].fsPath;
  }

  // The clip's name, and what to do when it is taken.
  let name = req.replace?.clip ?? "";
  let overwriteEdited = false;
  if (!req.replace) {
    const asked = req.name?.trim();
    name = anim.slug(asked || (req.action === "generate" ? anim.clipNameFor(req.prompt ?? "") : path.basename(file ?? "clip").replace(/\.(anims\.)?glb$/i, "")));
    const old = anim.recordOf(project, name);
    if (old && !asked) name = freeName(project, name);
    else if (old) {
      const edited = anim.hasEdits(old);
      const pick = await vscode.window.showWarningMessage(
        edited ? `${name} has edits made in EDGEfab. Making it again loses them.` : `The project already has a clip named ${name}.`,
        { modal: true, detail: edited ? "Keep Both makes a new clip beside it." : "Make It Again keeps its id, so EDGEdir's scenes that use it get the new take. Keep Both makes a new clip beside it." },
        "Make It Again",
        "Keep Both",
      );
      if (!pick) throw cancelled();
      if (pick === "Keep Both") name = freeName(project, name);
      else overwriteEdited = edited;
    }
  }

  // A replacement: the project's copy of the set, which must not be open with unsaved edits.
  const replaceFile = req.replace ? path.join(project.archiveDir, ...req.replace.set.toLowerCase().split("\\")) : undefined;
  if (replaceFile && fs.existsSync(replaceFile) && !(await closeTabsOn(replaceFile))) throw new Error(`${path.basename(replaceFile)} is open with unsaved changes: save or close it first`);

  const notes: string[] = [];
  let result: anim.ImportResult & { record?: anim.AnimRecord };
  let cost: number | undefined;
  if (req.action === "generate") {
    if (!req.prompt?.trim()) throw new Error("Say what the animation shows");
    const key = await deps.uthanaKey();
    if (!key) throw new Error("Making animations needs an Uthana key: set it in REDcode's Keys view (service uthana)");
    const made = await anim.generate({
      bridge,
      uthana: anim.uthana(key),
      key,
      rig,
      project,
      cacheDir: deps.cacheDir,
      prompt: req.prompt.trim(),
      length: req.length,
      model: req.model,
      inPlace: req.inPlace,
      rewritePrompt: req.asWritten ? false : undefined,
      name,
      replace: req.replace,
      overwriteEdited,
      onStage,
    });
    result = made;
    cost = made.cost;
    deps.log.appendLine(`Make: ${name} from Uthana (${made.cost.toFixed(2)} USD, motion ${made.motionId}), lift ${(made.report.grounding.lift * 100).toFixed(1)} cm`);
  } else {
    onStage("fitting");
    const motion = fs.readFileSync(file!);
    const { glb, report } = anim.fitClip(anim.readGlb(motion), await anim.referenceClip(bridge, deps.cacheDir, rig), name);
    if (report.missingBones.length) notes.push(`${report.missingBones.length} of the rig's bones are not in the file and hold their rest pose: ${report.missingBones.slice(0, 6).join(", ")}${report.missingBones.length > 6 ? "…" : ""}`);
    if (report.restDifference.degrees > 1) notes.push(`The file's rest pose differs from the rig's by up to ${report.restDifference.degrees.toFixed(0)} degrees (${report.restDifference.bone}): is it on the game's rig?`);
    onStage("importing", name);
    const source = { motion, record: { source: "glb", file: path.basename(file!), made: new Date().toISOString() } };
    result = req.replace
      ? await anim.replaceClip(bridge, project, req.replace.set, name, glb, source)
      : await anim.addClip(bridge, project, rig, name, glb, { seconds: report.duration, fps: 30, overwriteEdited, license: { source: "own", note: `From ${path.basename(file!)}, imported in REDcode` } }, source);
    onStage("done", name);
  }
  if (req.replace) notes.push("The project's copy of the set replaces the game's whole file: another mod that replaces a clip of the same set conflicts with it, and the first one loaded wins.");
  notes.push(...result.notes);
  deps.refresh();
  return {
    file: path.join(project.archiveDir, ...result.set.split("\\")),
    set: result.set,
    clip: name,
    replaced: !!req.replace,
    cost,
    id: result.record?.id,
    notes,
  };
}

/** A make the modder stopped: no message. */
export class Cancelled extends Error {
  constructor() {
    super("Cancelled");
    this.name = "Cancelled";
  }
}
const cancelled = () => new Cancelled();

/** The key for REDcode itself: the store's, or the modder gives one in the Keys view's window. */
export async function uthanaKeyFor(bridge: BridgeClient | undefined, ask: () => Promise<string | undefined>): Promise<string | undefined> {
  const r = await getKey(bridge, "uthana", "REDcode").catch(() => undefined);
  return r?.key ?? (await ask());
}
