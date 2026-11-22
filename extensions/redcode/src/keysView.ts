// The Keys view and REDcodeApi.keys (REDcode issue #33, K4b; docs/design/keys.md). One place in VS Code to
// see, set, replace and clear the AI service keys every EDGE tool shares, with the tools that read each one;
// and the API other extensions ask for a key through, which asks the modder before a tool first reads one.

import * as fs from "node:fs";
import * as vscode from "vscode";
import type { BridgeClient } from "./bridgeClient";
import { answersFor, checkServiceId, consentKey, deleteKey, describeKey, getKey, keyInfo, keysFolder, keyStatus, listKeys, setKey, withoutService, type Consent, type KeyInfo, type KeyStatus } from "./keys";

/** REDcodeApi.keys: how another EDGE extension gets an AI service key, with the modder's say. */
export interface KeysApi {
  /**
   * The key for a service (openai, anthropic, gemini, elevenlabs, tripo, or another id), or undefined when
   * none is set or the modder said no. The first time a caller asks for a service, REDcode asks the modder
   * and remembers the answer. caller is the tool's name for people, such as EDGEhack. An environment
   * variable (OPENAI_API_KEY and the rest) wins over the store. Throws when REDbridge is not running or is
   * older than 0.18.0.
   */
  get(service: string, caller: string): Promise<string | undefined>;
  /**
   * Asks the modder for the key in a password box, saves it in the shared store for every tool, and returns
   * it; undefined when they cancel. Allows the caller to read it from then on.
   */
  ask(service: string, caller: string): Promise<string | undefined>;
  /**
   * Whether a key is set and whether caller may read it (allowed, denied, or not asked yet), without asking
   * the modder anything and without the key. For telling "no key" from "the modder said no" after get answers
   * undefined, so a tool can stay quiet after a no. Throws as get does.
   */
  status(service: string, caller: string): Promise<KeyStatus>;
  /** A service's key was set, replaced or removed, here or by another tool (the store's folder changed). */
  readonly onDidChange: vscode.Event<string>;
}

const ConsentKey = "redcode.keyConsent";

type KeyNode = { kind: "key"; info: KeyInfo } | { kind: "message"; text: string; detail?: string; command?: vscode.Command };

class KeysTree implements vscode.TreeDataProvider<KeyNode> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(
    private readonly getBridge: () => BridgeClient | undefined,
    private readonly consent: () => Consent,
  ) {}

  refresh(): void {
    this.changed.fire();
  }

  async getChildren(node?: KeyNode): Promise<KeyNode[]> {
    if (node) return [];
    const bridge = this.getBridge();
    if (!bridge?.running) return [{ kind: "message", text: "REDbridge is not running", detail: "The key store is read through REDbridge.", command: { command: "redcode.restartBridge", title: "Restart REDbridge" } }];
    try {
      return (await listKeys(bridge)).map((info) => ({ kind: "key" as const, info }));
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      const update = /0\.18\.0/.test(text);
      return [{ kind: "message", text: update ? "The key store needs REDbridge 0.18.0" : text, detail: text, command: update ? { command: "redcode.updateBridge", title: "Update REDbridge" } : undefined }];
    }
  }

  getTreeItem(node: KeyNode): vscode.TreeItem {
    if (node.kind === "message") {
      const item = new vscode.TreeItem(node.text);
      item.iconPath = new vscode.ThemeIcon("info");
      item.tooltip = node.detail;
      item.command = node.command;
      item.contextValue = "keyMessage";
      return item;
    }
    const info = node.info;
    const item = new vscode.TreeItem(info.name || info.service);
    const { description, tooltip } = describeKey(info);
    item.description = description;
    const answers = answersFor(this.consent(), info.service);
    const allowed = answers.filter((a) => a.answer === "allow").map((a) => a.caller);
    const refused = answers.filter((a) => a.answer === "deny").map((a) => a.caller);
    const said = [allowed.length ? `Allowed: ${allowed.join(", ")}` : "", refused.length ? `Refused: ${refused.join(", ")}` : ""].filter(Boolean).join("\n");
    item.tooltip = said ? `${tooltip}\n${said}` : tooltip;
    item.iconPath = new vscode.ThemeIcon(info.unreadable ? "warning" : info.set ? "key" : "circle-large-outline");
    // .answered: some tool has an answer for this key, so its row offers to forget them.
    item.contextValue = (info.unreadable ? "key.unreadable" : !info.set ? "key.unset" : info.source === "env" ? "key.env" : "key.set") + (answers.length ? ".answered" : "");
    return item;
  }
}

/** Registers the Keys view, its commands and the folder watch; returns REDcodeApi.keys. */
export function registerKeys(context: vscode.ExtensionContext, getBridge: () => BridgeClient | undefined, log: vscode.OutputChannel): { api: KeysApi; refresh: () => void } {
  const consent = (): Consent => context.globalState.get<Consent>(ConsentKey, {});
  const tree = new KeysTree(getBridge, consent);
  const changed = new vscode.EventEmitter<string>();
  const view = vscode.window.createTreeView("redcode.keys", { treeDataProvider: tree });
  context.subscriptions.push(view, changed);

  const remember = async (caller: string, service: string, answer: "allow" | "deny") => {
    await context.globalState.update(ConsentKey, { ...consent(), [consentKey(caller, service)]: answer });
    tree.refresh();
  };
  /** One question at a time per caller and service, so two calls at once do not ask twice. */
  const asking = new Map<string, Promise<boolean>>();

  const checkArgs = (service: unknown, caller: unknown): { service: string; caller: string } => {
    if (typeof service !== "string" || checkServiceId(service)) throw new Error(`keys: not a service id: ${String(service)}`);
    if (typeof caller !== "string" || !caller.trim()) throw new Error("keys: name the tool that asks (caller), such as EDGEhack");
    return { service, caller: caller.trim() };
  };

  const allowed = (caller: string, service: string, name: string): Promise<boolean> => {
    const k = consentKey(caller, service);
    const known = consent()[k];
    if (known) return Promise.resolve(known === "allow");
    let p = asking.get(k);
    if (!p) {
      p = (async () => {
        const pick = await vscode.window.showInformationMessage(
          `${caller} wants your ${name} key.`,
          { modal: true, detail: `REDcode keeps the AI service keys every EDGE tool shares, in VS Code and in the game. Let ${caller} read your ${name} key? REDcode remembers the answer; Forget Tool Permissions in the Keys view asks again.` },
          "Allow",
          "Don't Allow",
        );
        if (pick === "Allow" || pick === "Don't Allow") {
          await remember(caller, service, pick === "Allow" ? "allow" : "deny");
          log.appendLine(`Keys: ${pick === "Allow" ? "allowed" : "refused"} ${caller} for ${service}`);
        }
        return pick === "Allow";
      })().finally(() => asking.delete(k));
      asking.set(k, p);
    }
    return p;
  };

  /** The password box, saving through REDbridge; it asks again with REDbridge's reason when a key is refused. */
  const askAndSave = async (info: KeyInfo, title: string, prompt: string): Promise<boolean> => {
    let refused = "";
    for (;;) {
      const key = await vscode.window.showInputBox({
        title,
        prompt: refused || prompt,
        password: true,
        ignoreFocusOut: true,
        placeHolder: `Your ${info.name} key`,
        validateInput: (v) => (!v.trim() ? "Paste the key" : /\s/.test(v.trim()) ? "A key has no spaces" : undefined),
      });
      if (key === undefined) return false;
      try {
        await setKey(getBridge(), info.service, key.trim());
        log.appendLine(`Keys: ${info.service} set from VS Code`);
        tree.refresh();
        changed.fire(info.service);
        return true;
      } catch (e) {
        refused = `${e instanceof Error ? e.message : String(e)} Try again, or Escape to stop.`;
      }
    }
  };

  const api: KeysApi = {
    async get(service, caller) {
      ({ service, caller } = checkArgs(service, caller));
      const info = await keyInfo(getBridge(), service);
      if (!info.set || info.unreadable) return undefined;
      if (!(await allowed(caller, service, info.name || service))) return undefined;
      const r = await getKey(getBridge(), service, caller);
      return r.key ?? undefined;
    },
    async ask(service, caller) {
      ({ service, caller } = checkArgs(service, caller));
      const info = await keyInfo(getBridge(), service);
      const env = info.source === "env" ? ` The environment variable ${info.env} has one too, and wins while it is set.` : "";
      const saved = await askAndSave(info, `${info.name} key for ${caller}`, `${caller} needs your ${info.name} key. REDcode saves it for every EDGE tool, in VS Code and in the game.${env}`);
      if (!saved) return undefined;
      await remember(caller, service, "allow");
      const r = await getKey(getBridge(), service, caller);
      return r.key ?? undefined;
    },
    async status(service, caller) {
      ({ service, caller } = checkArgs(service, caller));
      return keyStatus(await keyInfo(getBridge(), service), consent()[consentKey(caller, service)]);
    },
    onDidChange: changed.event,
  };

  const pickService = async (): Promise<KeyInfo | undefined> => {
    const list = await listKeys(getBridge());
    const pick = await vscode.window.showQuickPick(
      list.map((info) => ({ label: info.name || info.service, description: describeKey(info).description, info })),
      { title: "Set a key", placeHolder: "Which service?" },
    );
    return pick?.info;
  };

  const run = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (e) {
      void vscode.window.showErrorMessage(`REDcode: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("redcode.keys.refresh", () => tree.refresh()),
    vscode.commands.registerCommand("redcode.keys.set", (node?: KeyNode) =>
      run(async () => {
        const info = node?.kind === "key" ? node.info : await pickService();
        if (!info) return;
        const env = info.source === "env" ? ` ${info.env} is set too, and wins while it is.` : "";
        await askAndSave(info, `${info.set ? "Replace" : "Set"} the ${info.name} key`, `Saved for every EDGE tool, in VS Code and in the game.${env}`);
      })(),
    ),
    vscode.commands.registerCommand("redcode.keys.add", () =>
      run(async () => {
        const service = await vscode.window.showInputBox({
          title: "Add a key for another service",
          prompt: "The service's id, as the tool that needs it names it: lowercase letters, digits and dashes",
          placeHolder: "my-service",
          ignoreFocusOut: true,
          validateInput: (v) => checkServiceId(v.trim()),
        });
        if (!service) return;
        const info = await keyInfo(getBridge(), service.trim());
        await askAndSave(info, `Set the ${info.name} key`, "Saved for every EDGE tool, in VS Code and in the game.");
      })(),
    ),
    vscode.commands.registerCommand("redcode.keys.clear", (node?: KeyNode) =>
      run(async () => {
        if (node?.kind !== "key") return;
        const info = node.info;
        const ok = await vscode.window.showWarningMessage(
          `Remove your ${info.name} key from the shared store?`,
          { modal: true, detail: `Every EDGE tool that uses it, in VS Code and in the game, will ask for it again.${info.source === "env" ? ` The environment variable ${info.env} still has one.` : ""}` },
          "Remove",
        );
        if (ok !== "Remove") return;
        await deleteKey(getBridge(), info.service);
        log.appendLine(`Keys: ${info.service} removed from VS Code`);
        tree.refresh();
        changed.fire(info.service);
      })(),
    ),
    vscode.commands.registerCommand("redcode.keys.forgetPermissions", () =>
      run(async () => {
        const n = Object.keys(consent()).length;
        if (n === 0) {
          void vscode.window.showInformationMessage("REDcode: no tool has asked for a key yet.");
          return;
        }
        const ok = await vscode.window.showWarningMessage(`Forget which tools may read which keys (${n} answer${n === 1 ? "" : "s"})?`, { modal: true, detail: "Each tool is asked again the next time it wants a key." }, "Forget");
        if (ok !== "Forget") return;
        await context.globalState.update(ConsentKey, {});
        log.appendLine("Keys: tool permissions forgotten");
        tree.refresh();
      })(),
    ),
    vscode.commands.registerCommand("redcode.keys.forgetKeyPermissions", (node?: KeyNode) =>
      run(async () => {
        if (node?.kind !== "key") return;
        const info = node.info;
        const answers = answersFor(consent(), info.service);
        if (answers.length === 0) {
          void vscode.window.showInformationMessage(`REDcode: no tool has asked for the ${info.name} key yet.`);
          return;
        }
        const ok = await vscode.window.showWarningMessage(
          `Forget which tools may read your ${info.name} key?`,
          { modal: true, detail: `${answers.map((a) => `${a.caller}: ${a.answer === "allow" ? "allowed" : "refused"}`).join("\n")}\n\nEach is asked again the next time it wants this key. Other keys' answers stay.` },
          "Forget",
        );
        if (ok !== "Forget") return;
        await context.globalState.update(ConsentKey, withoutService(consent(), info.service));
        log.appendLine(`Keys: tool permissions for ${info.service} forgotten`);
        tree.refresh();
      })(),
    ),
  );

  // Another tool (the game's Keys view, REDnode, another window) changing the store: the view follows, and
  // extensions hear which service changed.
  let timer: NodeJS.Timeout | undefined;
  const pending = new Set<string>();
  const folder = keysFolder();
  try {
    if (fs.existsSync(folder)) {
      const watcher = fs.watch(folder, (_event, file) => {
        const name = String(file ?? "");
        const m = /^(.+)\.txt$/i.exec(name);
        if (m) pending.add(m[1].toLowerCase());
        clearTimeout(timer);
        timer = setTimeout(() => {
          tree.refresh();
          for (const s of pending) changed.fire(s);
          pending.clear();
        }, 300);
      });
      context.subscriptions.push({ dispose: () => watcher.close() });
    }
  } catch (e) {
    log.appendLine(`Keys: not watching ${folder}: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { api, refresh: () => tree.refresh() };
}
