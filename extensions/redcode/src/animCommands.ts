// The commands, the animation view's hook and REDcodeApi.generateAnimation for making clips (AT2 in
// docs/design/animation-tools.md), over src/animMake.ts.

import * as path from "node:path";
import * as vscode from "vscode";
import { madeClips, projectAt, Rigs, type Model } from "../../../packages/anim-core/src/index";
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

  const maker: AnimMaker = {
    why: (rig) => (!host.projectDir() ? "Open a project first: made clips go into it." : makeRig(rig).why),
    run: async (req, onStage) => {
      const r = await makeClip(host.deps, req, onStage);
      await host.open(r.file, r.clip);
      return r;
    },
    madeClipOf: (file) => {
      const dir = host.projectDir();
      if (!dir) return undefined;
      const want = path.resolve(file).toLowerCase();
      const archive = path.join(dir, ProjectFolders.archive);
      return madeClips(projectAt(dir)).find((m) => path.join(archive, ...m.set.split("\\")).toLowerCase() === want)?.name;
    },
  };

  /** REDcodeApi.generateAnimation: the caller's key use is asked of the modder, as REDcodeApi.keys asks it. */
  const generateAnimation = async (o: GenerateAnimationOptions, caller: string): Promise<MakeResult> => {
    if (!o || typeof o.prompt !== "string" || !o.prompt.trim()) throw new Error("generateAnimation needs a prompt");
    const key = await host.keyFor(caller);
    if (!key) throw new Error(`${caller} may not use the Uthana key, or none is set`);
    const r = await makeClip(
      { ...host.deps, uthanaKey: async () => key },
      { action: "generate", rig: rigPathOf(o.rig), prompt: o.prompt, length: o.length, model: o.model, inPlace: o.inPlace, name: o.name, replace: o.replace },
    );
    if (o.open !== false) await host.open(r.file, r.clip);
    return r;
  };
  return { maker, generateAnimation };
}
