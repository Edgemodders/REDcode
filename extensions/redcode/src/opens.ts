// The open contract (REDcode issue #22, for EDGEhack and any EDGE tool): a tool says in its
// package.json which TweakDB records it opens, and a click on one of those records in REDcode's
// TweakDB view runs the tool's command instead of opening REDcode's record page.
//
//   "edgemodders": { "opens": [
//     { "tweakdb": { "type": "Item", "flat": "itemType", "is": "ItemType.Prt_Program" }, "command": "edgehack.openQuickhack" }
//   ] }
//
// REDcode reads it from every installed extension's package.json, so the tool need not be running.
// No VS Code imports here, so the unit checks load it.

/** A record type (as tweakdb.records takes it, subtypes included) and, optionally, a flat's value. */
export interface TweakMatch {
  type: string;
  flat?: string;
  is?: unknown;
}

export interface TweakClaim {
  tweakdb: TweakMatch;
  /** Run with the record's path, or its id when it has no path. */
  command: string;
  /** The extension that declared it, and the name it shows in menus. */
  extension: string;
  title: string;
}

export interface ExtensionInfo {
  id: string;
  packageJSON: unknown;
}

/** Every valid tweakdb claim of the given extensions, in their order; malformed entries are skipped. */
export function readClaims(extensions: readonly ExtensionInfo[], skip?: (message: string) => void): TweakClaim[] {
  const claims: TweakClaim[] = [];
  for (const ext of extensions) {
    const pkg = ext.packageJSON as { displayName?: unknown; name?: unknown; edgemodders?: { opens?: unknown } } | undefined;
    const opens = pkg?.edgemodders?.opens;
    if (opens === undefined) continue;
    if (!Array.isArray(opens)) {
      skip?.(`${ext.id}: edgemodders.opens is not a list`);
      continue;
    }
    const title = typeof pkg?.displayName === "string" && pkg.displayName ? pkg.displayName : typeof pkg?.name === "string" ? pkg.name : ext.id;
    for (const [i, entry] of opens.entries()) {
      const e = entry as { tweakdb?: { type?: unknown; flat?: unknown; is?: unknown }; command?: unknown; files?: unknown } | null;
      // Only tweakdb entries for now; "files" entries may come later and are not an error.
      if (!e || e.tweakdb === undefined) continue;
      const t = e.tweakdb;
      if (typeof e.command !== "string" || !e.command || typeof t?.type !== "string" || !t.type || (t.flat !== undefined && typeof t.flat !== "string")) {
        skip?.(`${ext.id}: edgemodders.opens[${i}] needs a "command" and a "tweakdb" with a "type" (and "flat" as a string)`);
        continue;
      }
      if ((t.is !== undefined) !== (t.flat !== undefined)) {
        skip?.(`${ext.id}: edgemodders.opens[${i}]: "flat" and "is" go together`);
        continue;
      }
      claims.push({ tweakdb: { type: t.type, ...(t.flat !== undefined ? { flat: t.flat, is: t.is } : {}) }, command: e.command, extension: ext.id, title });
    }
  }
  return claims;
}

/**
 * Whether a flat's value, as tweakdb.records gives it, is the claim's "is": a record link or name
 * ignoring case, a number or boolean exactly, and a list when any element is.
 */
export function flatIs(value: unknown, is: unknown): boolean {
  if (Array.isArray(value)) return value.some((v) => flatIs(v, is));
  if (typeof value === "string" && typeof is === "string") return value.toLowerCase() === is.toLowerCase();
  if (value !== null && typeof value === "object" && typeof is !== "object") {
    // A LocKey as { key, text }: its key.
    const key = (value as { key?: unknown }).key;
    return typeof key === "string" && typeof is === "string" && key.toLowerCase() === is.toLowerCase();
  }
  return value === is;
}

/** A stable key for a claim's match, so two tools claiming the same records share one lookup. */
export function matchKey(m: TweakMatch): string {
  return JSON.stringify([m.type.toLowerCase(), m.flat ?? null, m.is ?? null]);
}
