// The shared key store (REDcode issue #33, K4b; docs/design/keys.md): AI service keys in
// %APPDATA%\Edgemodders\keys, shared by every EDGE tool in VS Code and in the game. REDbridge decrypts and
// writes them (its keys.* methods, K4a, on only when it is started with --keys); REDcode is the only VS Code
// extension that asks it. No VS Code imports, so the unit checks run it with a stand-in bridge.

import * as os from "node:os";
import * as path from "node:path";
import { KeyAccess, type BridgeClient } from "./bridgeClient";

// For scripts/unit.mjs and smoke checks: dist/keys.js bundles its own copy of the client, with its own symbol.
export { BridgeClient, KeyAccess } from "./bridgeClient";

/** What REDbridge's keys.info says about a service; never the key. */
export interface KeyInfo {
  service: string;
  /** The service's name for people, such as OpenAI. */
  name: string;
  /** A key is there: in the store, or in the environment variable. */
  set: boolean;
  /** Where the key comes from: the environment variable wins over the store's file. */
  source: "env" | "file" | null;
  /** The environment variable that would win, such as OPENAI_API_KEY. */
  env: string;
  /** The key's last four characters, to tell keys apart. */
  last4?: string | null;
  /** The store's file is there but this Windows user cannot decrypt it (made by another user or PC). */
  unreadable: boolean;
  /** When the store's file was last written. */
  updated?: string | null;
  /** The tools that read it, as used-by.json records them. */
  usedBy: { tool: string; at: string }[];
}

/** keys.get: the key itself, for a caller that may have it. */
export interface KeyValue {
  service: string;
  key: string | null;
  source: "env" | "file" | null;
  unreadable: boolean;
}

/** REDcodeApi.keys.status: what a caller can expect from get, asking nobody and never the key. */
export interface KeyStatus {
  service: string;
  /** A key is there: in the store, or in the environment variable. */
  set: boolean;
  /** Where it comes from: the environment variable wins over the store's file. */
  source: "env" | "file" | null;
  /** The store's file is there but this Windows user cannot decrypt it (made by another user or PC). */
  unreadable: boolean;
  /** Whether this caller may read it: allowed, denied (the modder said Don't Allow), or not asked yet. */
  access: "allowed" | "denied" | "unasked";
}

/** A key's status for one caller, from keys.info and the remembered answer. */
export function keyStatus(info: KeyInfo, answer: "allow" | "deny" | undefined): KeyStatus {
  return {
    service: info.service,
    set: info.set,
    source: info.source,
    unreadable: info.unreadable,
    access: answer === "allow" ? "allowed" : answer === "deny" ? "denied" : "unasked",
  };
}

/** The services every EDGE tool knows, in the order the Keys view lists them (REDbridge's keys.list does too). */
export const KnownServices = ["anthropic", "gemini", "openai", "elevenlabs", "tripo", "uthana"];

/** A service id as REDbridge takes it: 1 to 40 lowercase letters, digits or dashes. Answers why not, or undefined. */
export function checkServiceId(id: string): string | undefined {
  if (!id) return "Type the service's id, such as openai";
  if (!/^[a-z0-9-]{1,40}$/.test(id)) return "Lowercase letters, digits and dashes only, at most 40";
  return undefined;
}

/** The store's folder, as REDbridge finds it: EDGEMODDERS_KEYS_DIR, else %APPDATA%\Edgemodders\keys. */
export function keysFolder(env: NodeJS.ProcessEnv = process.env): string {
  if (env.EDGEMODDERS_KEYS_DIR) return env.EDGEMODDERS_KEYS_DIR;
  const appData = env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "Edgemodders", "keys");
}

/** A caller's name as consent remembers it: trimmed, case kept for messages, compared in lower case. */
export function consentKey(caller: string, service: string): string {
  return `${caller.trim().toLowerCase()}|${service}`;
}

/** The remembered answers, by consentKey: allow or deny. */
export type Consent = Record<string, "allow" | "deny">;

/** The tools that have an answer for one service, as consent remembers them (callers in lower case). */
export function answersFor(consent: Consent, service: string): { caller: string; answer: "allow" | "deny" }[] {
  const tail = `|${service}`;
  return Object.entries(consent)
    .filter(([k]) => k.endsWith(tail))
    .map(([k, answer]) => ({ caller: k.slice(0, -tail.length), answer }))
    .sort((a, b) => a.caller.localeCompare(b.caller));
}

/** The remembered answers without one service's, so each tool is asked again for that key only. */
export function withoutService(consent: Consent, service: string): Consent {
  const tail = `|${service}`;
  return Object.fromEntries(Object.entries(consent).filter(([k]) => !k.endsWith(tail)));
}

/** Turns REDbridge's refusals into what the modder can do about them. */
export function keyError(e: unknown): Error {
  const message = e instanceof Error ? e.message : String(e);
  if (/keys\.\w+/i.test(message) && /(not found|no method|unknown method)/i.test(message)) {
    return new Error("The key store needs REDbridge 0.18.0 or later. Run REDcode: Update REDbridge.");
  }
  if (/key methods are off/i.test(message)) {
    return new Error("REDbridge was started without its key methods. Run REDcode: Restart REDbridge.");
  }
  return e instanceof Error ? e : new Error(message);
}

const call = async <T>(bridge: BridgeClient | undefined, method: string, params?: Record<string, unknown>): Promise<T> => {
  if (!bridge?.running) throw new Error("The key store needs REDbridge running. Run REDcode: Restart REDbridge.");
  try {
    return await bridge[KeyAccess]<T>(method, params);
  } catch (e) {
    throw keyError(e);
  }
};

/** Every known service, then any other with a file. */
export const listKeys = (bridge: BridgeClient | undefined) => call<KeyInfo[]>(bridge, "keys.list");
export const keyInfo = (bridge: BridgeClient | undefined, service: string) => call<KeyInfo>(bridge, "keys.info", { service });
/** The key; tool names the caller in used-by.json. */
export const getKey = (bridge: BridgeClient | undefined, service: string, tool: string) => call<KeyValue>(bridge, "keys.get", { service, tool });
/** Saves a key for every tool. REDbridge refuses one with spaces or without its service's start, with a message to show. */
export const setKey = (bridge: BridgeClient | undefined, service: string, key: string) => call<KeyInfo>(bridge, "keys.set", { service, key });
/** Removes the store's file: true when there was one. */
export const deleteKey = (bridge: BridgeClient | undefined, service: string) => call<boolean>(bridge, "keys.delete", { service });

/** One line about a key for the Keys view, and a longer one for its tooltip. */
export function describeKey(info: KeyInfo, toolNames: (tool: string) => string = (t) => t): { description: string; tooltip: string } {
  const tools = info.usedBy.map((u) => toolNames(u.tool));
  const usedBy = tools.length ? `used by ${tools.join(", ")}` : "not used yet";
  if (info.unreadable) {
    return {
      description: "can't be read here",
      tooltip: `${info.name}: the store has a key that this Windows user cannot read (saved by another user or PC). Set it again to replace it.`,
    };
  }
  if (!info.set) return { description: "not set", tooltip: `${info.name}: no key yet. Set one here, or in the game's Keys view; every EDGE tool reads the same store.` };
  const tail = info.last4 ? `…${info.last4}` : "set";
  if (info.source === "env") {
    return {
      description: `${tail} from ${info.env}`,
      tooltip: `${info.name}: the environment variable ${info.env} has a key, which wins over the store. Change it where the variable is set.\n${usedBy}`,
    };
  }
  return { description: `${tail} · ${usedBy}`, tooltip: `${info.name}: ${tail}${info.updated ? `, saved ${info.updated.slice(0, 10)}` : ""}\n${usedBy}` };
}
