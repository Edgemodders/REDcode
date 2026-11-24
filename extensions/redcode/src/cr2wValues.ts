// Values REDbridge cannot walk into, made into nodes the CR2W editor can (a modder's report, 2026-11-24).
//
// Some buffers parse into WolvenKit classes that are not RED types: a worldInstancedMeshNode's `buffer`
// (worldInstancedMeshNodeBuffer: InnerNodes, TransformRanges) and its `cookedWorldTransformsBuffer`
// (WorldTransformsBuffer: Transforms), among others. REDbridge's cr2w.getNode answers their `Data` as one value,
// its preview the .NET type name, and refuses any path below it ("below a value, which has no children"). So the
// editor showed "Data WolvenKit.RED4.Types.worldInstancedMeshNodeBuffer" and nothing more. Here such a value
// becomes a read-only tree: objects as classes, arrays as arrays paged like REDbridge's, read from the value
// REDbridge sent once and kept per document. Editing inside them needs REDbridge to walk them (asked of it).
//
// No VS Code imports: the unit checks load it.

export interface NodeChild {
  name: string;
  kind: string;
  type: string;
  preview: string;
  count: number | null;
  value: unknown;
}

export interface Cr2wNode {
  path: string;
  kind: string;
  type: string;
  value: unknown;
  children: NodeChild[] | null;
  total: number | null;
  offset: number | null;
  /** Read from a value REDbridge cannot walk into: no edits here. */
  readOnly?: boolean;
}

type Json = Record<string, unknown>;

/** A value REDbridge sent whole that holds a tree: an object that is not a wrapped value ({$type, $value}), or an array. */
export function isOpaque(kind: string, value: unknown): boolean {
  if (kind !== "value" || value === null || typeof value !== "object") return false;
  return Array.isArray(value) || !("$value" in (value as Json));
}

const typeOf = (v: unknown): string => {
  if (Array.isArray(v)) {
    const first = v.find((x) => x !== null && x !== undefined);
    return `array:${first === undefined ? "?" : typeOf(first)}`;
  }
  if (v !== null && typeof v === "object") return String((v as Json).$type ?? "object");
  if (typeof v === "number") return Number.isInteger(v) ? "Int64" : "Float";
  if (typeof v === "boolean") return "Bool";
  return "String";
};

/** A small struct: few fields, each a plain or wrapped value, shown inline as REDbridge's small structs are. */
const isSmall = (o: Json) => {
  const keys = Object.keys(o).filter((k) => k !== "$type");
  return keys.length <= 8 && keys.every((k) => {
    const v = o[k];
    return v === null || typeof v !== "object" || (!Array.isArray(v) && "$value" in (v as Json));
  });
};

/** One child of a value's node. Big objects and arrays carry no value: their node is read when opened. */
export function jsonChild(name: string, v: unknown): NodeChild {
  if (Array.isArray(v)) return { name, kind: "array", type: typeOf(v), preview: `${v.length.toLocaleString("en-US")} items`, count: v.length, value: null };
  if (v !== null && typeof v === "object") {
    const o = v as Json;
    if ("$value" in o) return { name, kind: "value", type: String(o.$type ?? "value"), preview: JSON.stringify(o.$value), count: null, value: o };
    const type = typeOf(o);
    return { name, kind: "class", type, preview: type, count: null, value: isSmall(o) ? o : null };
  }
  if (v === null || v === undefined) return { name, kind: "null", type: "null", preview: "null", count: null, value: null };
  return { name, kind: "value", type: typeOf(v), preview: typeof v === "string" ? JSON.stringify(v) : String(v), count: null, value: v };
}

/** A value's node at a path: an object's fields, or a page of an array's items. */
export function jsonNode(path: string, v: unknown, offset = 0, limit = 200): Cr2wNode {
  if (Array.isArray(v)) {
    const from = Math.max(0, offset);
    const page = v.slice(from, from + limit);
    return { path, kind: "array", type: typeOf(v), value: null, children: page.map((x, i) => jsonChild(String(from + i), x)), total: v.length, offset: from, readOnly: true };
  }
  if (v !== null && typeof v === "object" && !("$value" in (v as Json))) {
    const o = v as Json;
    return { path, kind: "class", type: typeOf(o), value: isSmall(o) ? o : null, children: Object.keys(o).filter((k) => k !== "$type").map((k) => jsonChild(k, o[k])), total: null, offset: null, readOnly: true };
  }
  const c = jsonChild(path.split(".").pop() ?? "", v);
  return { path, kind: c.kind, type: c.type, value: v, children: null, total: null, offset: null, readOnly: true };
}

/** A REDbridge node with its opaque children made into class and array children (their big values left out). */
export function openChildren(n: Cr2wNode): Cr2wNode {
  if (!n.children?.some((c) => isOpaque(c.kind, c.value))) return n;
  // The type REDbridge names stays: these buffers' JSON has no $type of its own.
  return { ...n, children: n.children.map((c) => (isOpaque(c.kind, c.value) ? { ...jsonChild(c.name, c.value), type: c.type } : c)) };
}

/** Walks a value down dotted parts: array indices and object keys. */
export function walkValue(v: unknown, parts: string[]): unknown {
  let at: unknown = v;
  for (const p of parts) {
    if (Array.isArray(at)) {
      const i = Number(p);
      if (!Number.isInteger(i) || i < 0 || i >= at.length) throw new Error(`No item ${p} (${at.length} items)`);
      at = at[i];
    } else if (at !== null && typeof at === "object" && p in (at as Json)) {
      at = (at as Json)[p];
    } else {
      throw new Error(`No field ${p}`);
    }
  }
  return at;
}

const belowValue = (e: unknown) => /below a value/i.test(e instanceof Error ? e.message : String(e));

/**
 * Reads a node through REDbridge, and below a value REDbridge cannot walk into, from that value: fetched once from
 * REDbridge (at the nearest path it answers as an opaque value) and kept in `cache` by path. The caller clears the
 * cache when the document changes.
 */
export async function readNode(
  fetch: (path: string, offset: number, limit: number) => Promise<Cr2wNode>,
  cache: Map<string, { value: unknown; type: string }>,
  path: string,
  offset = 0,
  limit = 200,
): Promise<Cr2wNode> {
  for (const [at, kept] of cache) {
    if (path === at) return { ...jsonNode(path, kept.value, offset, limit), type: kept.type };
    if (path.startsWith(`${at}.`)) return jsonNode(path, walkValue(kept.value, path.slice(at.length + 1).split(".")), offset, limit);
  }
  try {
    const n = await fetch(path, offset, limit);
    if (isOpaque(n.kind, n.value)) {
      cache.set(path, { value: n.value, type: n.type });
      return { ...jsonNode(path, n.value, offset, limit), type: n.type };
    }
    return openChildren(n);
  } catch (e) {
    if (!belowValue(e)) throw e;
    // Up the path to the value REDbridge answers whole.
    const parts = path.split(".");
    for (let k = parts.length - 1; k > 0; k--) {
      const at = parts.slice(0, k).join(".");
      let n: Cr2wNode;
      try {
        n = await fetch(at, 0, 1);
      } catch (e2) {
        if (belowValue(e2)) continue;
        throw e2;
      }
      if (!isOpaque(n.kind, n.value)) break;
      cache.set(at, { value: n.value, type: n.type });
      return jsonNode(path, walkValue(n.value, parts.slice(k)), offset, limit);
    }
    throw e;
  }
}
