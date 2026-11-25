// The commands, the animation view's hook and REDcodeApi.generateAnimation for making clips (AT2 in
// docs/design/animation-tools.md), over src/animMake.ts.

import * as path from "node:path";
import * as vscode from "vscode";
import * as fs from "node:fs";
import { asBridge, BoneGroups, bonesOf, clipOnBody, editClip, footContacts, IkBones, madeClips, projectAt, readGlb, rebaseClip, rigFor, Rigs, standInGlb, suggestPins, type EditStep, type Model } from "../../../packages/anim-core/src/index";
import { Cancelled, makeClip, makeRig, StageText, type MakeDeps, type MakeRequest, type MakeResult } from "./animMake";
import type { AnimMaker } from "./cr2wEditor";
import { gamePathOfUri } from "./gameFs";
import { ProjectFolders } from "./project";

export interface AnimCommandsHost {
  deps: MakeDeps;
  /** The open project's folder, or undefined. */
  projectDir(): string | undefined;
  /** Opens an .anims at a clip in the animation view. */
  open(file: string, clip: string): Promise<void>;
  /** A key for another tool, asking the modder (REDcodeApi.keys). */
  keyFor(caller: string): Promise<string | undefined>;
  /** Opens a .glb in Blender with the animation script and calls onSave after each save Blender exports (AE5). */
  blender(o: { glb: string; label: string; onSave: () => Promise<void> }): Promise<boolean>;
  /** Reads an open .anims again from disk, its view rebuilt in place. */
  reload(file: string): Promise<void>;
}

/** A made clip's edits for the animation view's Edit panel (AE2). */
export interface EditInfo {
  clip: string;
  seconds: number;
  steps: EditStep[];
  edited?: string;
  canUndo: boolean;
  /** An Undo to take back (the owner's AE5 run). */
  canRedo: boolean;
  /** Just rebuilt from the panel: the reopened tab shows the panel again. */
  open: boolean;
  /** The rig's bones by name, and its bone groups. */
  bones: string[];
  groups: Record<string, string[]>;
  /** The bones a pin or a move works on. */
  ikBones: string[];
  /** Where each foot rests and how far it slides there, and the pins that would hold the sliding ones. */
  feet: { contacts: { bone: string; from: number; to: number; slide: number }[]; suggestedPins: EditStep[] };
  /** The project's other made clips on this rig, for a Layer. */
  others: string[];
}

/** What REDcodeApi.generateAnimation takes (since the release with AT2). */
export interface GenerateAnimationOptions {
  /** What the animation shows. */
  prompt: string;
  /** "man_base" (default), "woman_base", or the rig's game path. */
  rig?: string;
  /** Seconds: 4 to 10 for text-to-motion-3.0, 5 to 10 for its Lite and Mini. Default 5. */
  length?: number;
  model?: Model;
  /** No travel across the floor (default true). */
  inPlace?: boolean;
  /** The legs held still, for arm and upper body motions. */
  upperBodyOnly?: boolean;
  /** The clip's name; from the prompt when left out. */
  name?: string;
  /** Replace a game clip (in a copy of its set in the project) instead of making a new clip. */
  replace?: { set: string; clip: string };
  /** Open the clip in REDcode's animation view when made (default true). */
  open?: boolean;
}

const rigPathOf = (rig: string | undefined) => {
  if (!rig || rig === "man_base") return Rigs.man_base.rig;
  if (rig === "woman_base") return Rigs.woman_base.rig;
  return rig.toLowerCase();
};

/** A make with a notification showing its stages. */
function withStages(title: string, deps: MakeDeps, req: MakeRequest): Promise<MakeResult> {
  return Promise.resolve(
    vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title }, (progress) => makeClip(deps, req, (stage) => progress.report({ message: StageText[stage] }))),
  );
}

export function registerAnimCommands(context: vscode.ExtensionContext, host: AnimCommandsHost): { maker: AnimMaker; generateAnimation: (options: GenerateAnimationOptions, caller: string) => Promise<MakeResult> } {
  const run = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (e) {
      if (e instanceof Cancelled) return;
      const message = e instanceof Error ? e.message : String(e);
      host.deps.log.appendLine(`Make: ${message}`);
      void vscode.window.showErrorMessage(`REDcode: ${message}`);
    }
  };
  const done = async (r: MakeResult) => {
    await host.open(r.file, r.clip);
    const said = `Made ${r.clip}${r.cost !== undefined ? ` ($${r.cost.toFixed(2)})` : ""} in ${r.set}.`;
    void vscode.window.showInformationMessage([said, ...r.notes].join(" "));
  };
  const pickRig = async (): Promise<string | undefined> => {
    const pick = await vscode.window.showQuickPick(
      Object.values(Rigs).map((r) => ({ label: r.label, description: r.id, rig: r.rig })),
      { title: "The rig the clip is for", placeHolder: "NPCs on the base man's or woman's rig" },
    );
    return pick?.rig;
  };
  const askPrompt = () =>
    vscode.window.showInputBox({
      title: "Generate with Uthana",
      prompt: "What the animation shows",
      placeHolder: "a man stands relaxed, raises his right hand and waves hello, then lowers it",
      ignoreFocusOut: true,
      validateInput: (v) => (v.trim() ? undefined : "Say what it shows"),
    });
  const askLength = async (): Promise<number | undefined> => {
    const pick = await vscode.window.showQuickPick(
      [4, 5, 6, 8, 10].map((s) => ({ label: `${s} seconds`, description: `$${(s * 0.1).toFixed(2)} with text-to-motion-3.0`, s })),
      { title: "How long" },
    );
    return pick?.s;
  };
  const activeAnims = (): vscode.Uri | undefined => {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const uri = input instanceof vscode.TabInputCustom ? input.uri : undefined;
    return uri && /\.anims$/i.test(uri.path) ? uri : undefined;
  };
  const setPathOf = (uri: vscode.Uri | undefined): string | undefined => {
    if (!uri) return undefined;
    const game = gamePathOfUri(uri);
    if (game) return game;
    const dir = host.projectDir();
    if (!dir || uri.scheme !== "file") return undefined;
    const archive = path.join(dir, ProjectFolders.archive);
    const rel = path.relative(archive, uri.fsPath);
    return rel.startsWith("..") || path.isAbsolute(rel) ? undefined : rel.split(path.sep).join("\\");
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("redcode.anims.generate", (args?: Partial<MakeRequest>) =>
      run(async () => {
        const rig = args?.rig ?? (await pickRig());
        if (!rig) return;
        const prompt = args?.prompt ?? (await askPrompt());
        if (!prompt) return;
        const length = args?.length ?? (await askLength());
        if (!length) return;
        await done(await withStages("Generating with Uthana", host.deps, { action: "generate", rig, prompt, length, model: args?.model, inPlace: args?.inPlace, name: args?.name, replace: args?.replace }));
      })(),
    ),
    vscode.commands.registerCommand("redcode.anims.addClip", (node?: { kind?: string; file?: string } | string) =>
      run(async () => {
        const given = typeof node === "string" ? node : node?.kind === "file" ? node.file : undefined;
        const file = given && /\.glb$/i.test(given) ? given : undefined;
        const rig = await pickRig();
        if (!rig) return;
        const name = await vscode.window.showInputBox({ title: "Add a Clip from GLB", prompt: "The clip's name (lowercase letters, digits and _); from the file's name when empty", ignoreFocusOut: true });
        if (name === undefined) return;
        await done(await withStages("Adding the clip", host.deps, { action: "glb", rig, file, name: name || undefined }));
      })(),
    ),
    vscode.commands.registerCommand("redcode.anims.replaceClip", (args?: { set?: string; clip?: string; file?: string; prompt?: string; length?: number }) =>
      run(async () => {
        const set =
          args?.set ??
          (await vscode.window.showInputBox({
            title: "Replace a Game Clip",
            prompt: "The game's .anims set that holds the clip",
            value: setPathOf(activeAnims()) ?? "",
            ignoreFocusOut: true,
            validateInput: (v) => (/\.anims$/i.test(v.trim()) ? undefined : "An .anims game path"),
          }));
        if (!set) return;
        const clip = args?.clip ?? (await vscode.window.showInputBox({ title: "Replace a Game Clip", prompt: `The clip in ${set.split("\\").pop()} to replace, by name`, ignoreFocusOut: true }));
        if (!clip) return;
        const how = args?.file ? "glb" : args?.prompt ? "generate" : (await vscode.window.showQuickPick([{ label: "Generate with Uthana", how: "generate" as const }, { label: "From a GLB…", how: "glb" as const }], { title: `Replace ${clip} with` }))?.how;
        if (!how) return;
        const rigInfo = await host.deps.bridge().request<{ items: { rig?: string | null }[] }>("anims.info", { files: [set.trim()] }).catch(() => undefined);
        const rig = rigInfo?.items?.[0]?.rig ?? (await pickRig());
        if (!rig) return;
        let prompt = args?.prompt;
        let length = args?.length;
        if (how === "generate") {
          prompt ??= await askPrompt();
          if (!prompt) return;
          length ??= await askLength();
          if (!length) return;
        }
        await done(await withStages(`Replacing ${clip}`, host.deps, { action: how, rig, prompt, length, file: args?.file, replace: { set: set.trim(), clip } }));
      })(),
    ),
  );

  /** The project's made clip whose own set this file is. */
  const madeOf = (file: string) => {
    const dir = host.projectDir();
    if (!dir) return undefined;
    const want = path.resolve(file).toLowerCase();
    const archive = path.join(dir, ProjectFolders.archive);
    return madeClips(projectAt(dir)).find((m) => path.join(archive, ...m.set.split("\\")).toLowerCase() === want);
  };
  /** One make at a time, from any animation view: two at once would write the same project together. */
  let making = false;

  // ---- the Animation Editor in the animation view (docs/design/animation-editor.md, AE2) ----
  /** Each edited clip's earlier step lists, newest last, by its record's id: Undo puts the last back. Kept while REDcode runs. */
  const history = new Map<string, { steps: EditStep[]; base?: string }[]>();
  /** What each Undo took away, newest last, for Redo; a new Apply or a Blender save clears it. */
  const future = new Map<string, { steps: EditStep[]; base?: string }[]>();
  /** A copy of a clip's starting point, for an Undo or Redo that crosses a Blender save, in REDcode's cache (not the project). */
  const keepBase = (m: { id: string; name: string; glb: string }) => {
    const dir = path.join(host.deps.cacheDir, "anim-edit", m.id.replace(/[^\w.-]+/g, "_"));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${m.name}.${Date.now()}.base.glb`);
    fs.copyFileSync(path.join(path.dirname(m.glb), `${m.name}.base.glb`), file);
    return file;
  };
  /** Moves one state from one list to the other: the clip as it is now goes onto `to`, and `from`'s last is put back. */
  const travel = async (file: string, from: Map<string, { steps: EditStep[]; base?: string }[]>, to: Map<string, { steps: EditStep[]; base?: string }[]>, none: string) => {
    const m = madeOf(file);
    const last = m ? from.get(m.id)?.pop() : undefined;
    if (!m || !last) throw new Error(none);
    const now = { steps: (m.edits ?? []) as EditStep[], base: last.base ? keepBase(m) : undefined };
    const list = to.get(m.id) ?? [];
    list.push(now);
    if (list.length > 30) list.shift();
    to.set(m.id, list);
    // Across a Blender save the starting point changes too: it goes back first, then its steps.
    if (last.base) fs.copyFileSync(last.base, path.join(path.dirname(m.glb), `${m.name}.base.glb`));
    return applySteps(file, last.steps, false);
  };
  /** The file rebuilt last and when: its tab, opening again, shows the Edit panel where the modder left it. */
  let rebuilt: { file: string; at: number } | undefined;
  const editInfo = (file: string): EditInfo | undefined => {
    const m = madeOf(file);
    if (!m) return undefined;
    const glb = readGlb(fs.readFileSync(m.glb));
    const names = glb.json.nodes.map((n) => n.name ?? "").filter(Boolean);
    // The skeleton's joints only, in the rig's order: the file's other nodes (Armature, the meshes) are no bones.
    const joints = (glb.json.skins?.[0]?.joints ?? []).map((i) => glb.json.nodes[i]?.name ?? "").filter(Boolean);
    const contacts = footContacts(glb);
    const dir = host.projectDir()!;
    return {
      clip: m.name,
      seconds: m.anim.seconds,
      steps: (m.edits ?? []) as EditStep[],
      edited: m.edited,
      canUndo: (history.get(m.id)?.length ?? 0) > 0,
      canRedo: (future.get(m.id)?.length ?? 0) > 0,
      open: !!rebuilt && rebuilt.file === path.resolve(file).toLowerCase() && Date.now() - rebuilt.at < 30000,
      bones: (joints.length ? joints : names).filter((n) => !["Root", "Trajectory", "reference_joint"].includes(n)),
      groups: Object.fromEntries(BoneGroups.map((g) => [g, bonesOf(g, names)])),
      ikBones: IkBones,
      feet: { contacts: contacts.map((c) => ({ bone: c.bone, from: c.from, to: c.to, slide: c.slide })), suggestedPins: suggestPins(contacts) },
      others: madeClips(projectAt(dir)).filter((x) => x.name !== m.name && x.anim.rig.toLowerCase() === m.anim.rig.toLowerCase()).map((x) => x.name),
    };
  };
  /** Rebuilds the clip from its steps, then reopens its tab at it (the set on disk is new). */
  const applySteps = async (file: string, steps: EditStep[], remember: boolean) => {
    const m = madeOf(file);
    if (!m) throw new Error("This file is not a made clip's own set: only made clips can be edited here for now");
    const dir = host.projectDir()!;
    const before = (m.edits ?? []) as EditStep[];
    const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Editing ${m.name}` }, () =>
      editClip(asBridge(host.deps.bridge()), projectAt(dir), m.name, steps, { cacheDir: host.deps.cacheDir, set: m.set }),
    );
    if (remember) {
      const list = history.get(m.id) ?? [];
      list.push({ steps: before });
      if (list.length > 30) list.shift();
      history.set(m.id, list);
      future.delete(m.id);
    }
    host.deps.log.appendLine(`Animation Editor: ${m.name}, ${steps.length} step(s): ${r.report.steps.map((x) => x.did).join("; ") || "as made"}`);
    host.deps.refresh();
    rebuilt = { file: path.resolve(file).toLowerCase(), at: Date.now() };
    // The editor reads the new set again in place (src/cr2wEditor.ts, animsEdit).
    return { clip: m.name, seconds: r.report.seconds, did: r.report.steps };
  };
  const maker: AnimMaker = {
    why: (rig) => (!host.projectDir() ? "Open a project first: made clips go into it." : makeRig(rig).why),
    run: async (req, onStage) => {
      if (making) throw new Error("Another clip is being made; wait for it to finish.");
      making = true;
      try {
        // A notification with each stage too, seen from any tab while the panel waits.
        const r = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: req.action === "generate" ? "Generating with Uthana" : "Making the clip" },
          (progress) =>
            makeClip(host.deps, req, (stage, detail) => {
              progress.report({ message: StageText[stage] });
              onStage(stage, detail);
            }),
        );
        await host.open(r.file, r.clip);
        return r;
      } finally {
        making = false;
      }
    },
    madeClipOf: (file) => madeOf(file)?.name,
    editInfo,
    edit: (file, steps) => applySteps(file, steps, true),
    undo: (file) => travel(file, history, future, "Nothing to undo"),
    redo: (file) => travel(file, future, history, "Nothing to redo"),
    blender: async (file) => {
      const m = madeOf(file);
      if (!m) throw new Error("This file is not a made clip's own set");
      const rig = rigFor(m.anim.rig);
      if (!rig) throw new Error(`${m.name} is on ${m.anim.rig}; only man_base and woman_base clips open in Blender`);
      const dir = host.projectDir()!;
      const bridge = asBridge(host.deps.bridge());
      // The clip as it plays now, on the base body, for Blender (decision 7 of docs/design/animation-timeline.md).
      const glb = path.join(path.dirname(m.glb), `${m.name}.blender.glb`);
      const body = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Preparing ${m.name} for Blender` }, () => standInGlb(bridge, host.deps.cacheDir, rig));
      fs.writeFileSync(glb, clipOnBody(readGlb(fs.readFileSync(body)), readGlb(fs.readFileSync(m.glb)), m.name));
      let first = true;
      return host.blender({
        glb,
        label: m.name,
        onSave: async () => {
          // Each save is the clip's new starting point; the first keeps the one before it, with its steps, for Undo.
          const r = await rebaseClip(bridge, projectAt(dir), m.name, fs.readFileSync(glb), { cacheDir: host.deps.cacheDir, set: m.set, keepBefore: first, by: "Blender" });
          if (first && r.before) {
            const list = history.get(m.id) ?? [];
            list.push({ steps: r.before.steps, base: r.before.file });
            history.set(m.id, list);
          }
          future.delete(m.id);
          first = false;
          rebuilt = { file: path.resolve(file).toLowerCase(), at: Date.now() };
          host.deps.log.appendLine(`Animation Editor: ${m.name} from Blender, ${r.report.seconds.toFixed(2)} s; its steps folded in`);
          host.deps.refresh();
          await host.reload(file);
        },
      });
    },
    madeFromOf: (file) => {
      const m = madeOf(file);
      return m ? { ...(m.source ?? {}), made: (m.source?.made as string | undefined) ?? m.made } : undefined;
    },
  };

  /** REDcodeApi.generateAnimation: the caller's key use is asked of the modder, as REDcodeApi.keys asks it. */
  const generateAnimation = async (o: GenerateAnimationOptions, caller: string): Promise<MakeResult> => {
    if (!o || typeof o.prompt !== "string" || !o.prompt.trim()) throw new Error("generateAnimation needs a prompt");
    const key = await host.keyFor(caller);
    if (!key) throw new Error(`${caller} may not use the Uthana key, or none is set`);
    const r = await makeClip(
      { ...host.deps, uthanaKey: async () => key },
      { action: "generate", rig: rigPathOf(o.rig), prompt: o.prompt, length: o.length, model: o.model, inPlace: o.inPlace, upperBodyOnly: o.upperBodyOnly, name: o.name, replace: o.replace },
    );
    if (o.open !== false) await host.open(r.file, r.clip);
    return r;
  };
  return { maker, generateAnimation };
}
