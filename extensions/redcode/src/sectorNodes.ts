// The nodes a sector script sees (docs/design/sector-scripts.md): one per node data entry of a
// .streamingsector, read from the sector's CR2W JSON. A node joins the entry (where it stands, its streaming
// distance) and the node it places (its class, mesh, appearance). get and set take a property's path; set
// records a change, which REDcode turns into one JSON Patch on the open document (cr2w.patch's dotted paths).
// No VS Code imports: the script runner and the MCP server use it too.

/** A sector's root chunk, as WolvenKit's JSON has it. */
export interface SectorRoot {
  nodes?: { HandleId?: string; Data?: Json }[];
  nodeData?: { Data?: Json[] };
}

type Json = Record<string, unknown>;

/** One value a script changed: the document path cr2w.patch takes, the value before and after. */
export interface NodeChange {
  /** The node's id, `<sector>#<entry>`. */
  id: string;
  entry: number;
  /** The path the script gave, such as "streamingDistance". */
  property: string;
  /** The path in the document from its root chunk, such as "nodeData.Data.12.streamingDistance". */
  path: string;
  from: unknown;
  to: unknown;
}

/** The root chunk of a CR2W JSON file (`Data.RootChunk`), or the object itself when it is one. */
export function rootChunkOf(json: unknown): SectorRoot {
  const j = json as { Data?: { RootChunk?: SectorRoot } } & SectorRoot;
  return j?.Data?.RootChunk ?? j;
}

const isObject = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/** A value as a script reads it: a CName, ResourcePath or NodeRef as its text, a resource reference as its path. */
export function plainValue(v: unknown): unknown {
  if (!isObject(v)) return v;
  if ("$type" in v && "$value" in v) return v.$value;
  const depot = v.DepotPath;
  if (isObject(depot) && "$value" in depot) return depot.$value;
  return v;
}

/** A value a script sets, in the form the old one had: text into a CName or a resource reference. */
export function wrapValue(old: unknown, value: unknown): unknown {
  if (isObject(value) || Array.isArray(value)) return value;
  if (!isObject(old)) return value;
  const textual = (o: Json) => (o.$storage === "uint64" && typeof value === "string" && !/^\d+$/.test(value) ? { $storage: "string" } : {});
  if ("$type" in old && "$value" in old) return { ...old, ...textual(old), $value: value };
  const depot = old.DepotPath;
  if (isObject(depot) && "$value" in depot) return { ...old, DepotPath: { ...depot, ...textual(depot), $value: value } };
  return value;
}

/** Steps into a handle's or a buffer's Data when the path does not name it, as the editor's tree shows them. */
function inner(v: unknown, next: string): unknown {
  if (isObject(v) && next !== "Data" && isObject(v.Data) && ("HandleId" in v || "BufferId" in v)) return v.Data;
  return v;
}

/** Walks a dotted path from an object: the value there and the path as the document has it (with Data under handles and buffers). */
function walk(from: unknown, segments: string[]): { value: unknown; path: string[]; parent?: unknown; key?: string | number } | undefined {
  let value = from;
  const path: string[] = [];
  let parent: unknown;
  let key: string | number | undefined;
  for (const s of segments) {
    const stepped = inner(value, s);
    if (stepped !== value) path.push("Data");
    value = stepped;
    if (Array.isArray(value)) {
      if (!/^\d+$/.test(s) || Number(s) >= value.length) return undefined;
      parent = value;
      key = Number(s);
      value = value[key];
    } else if (isObject(value)) {
      if (!(s in value)) return undefined;
      parent = value;
      key = s;
      value = value[s];
    } else return undefined;
    path.push(s);
  }
  return { value, path, parent, key };
}

/** The first resource path in a node's top properties that ends with one of the extensions. */
function resourceIn(node: Json | undefined, keys: string[], ext?: RegExp): string | null {
  if (!node) return null;
  for (const k of keys) {
    const p = plainValue(node[k]);
    if (typeof p === "string" && p && p !== "0" && (!ext || ext.test(p))) return p;
  }
  return null;
}

/** The node a script gets for each node data entry. */
export class SectorNode {
  constructor(
    readonly sector: string,
    readonly entry: number,
    private readonly entryJson: Json,
    private readonly nodeJson: Json | undefined,
    /** The node's place in the sector's nodes. */
    readonly nodeIndex: number,
    private readonly changes: Map<string, NodeChange>,
  ) {}

  /** `<sector>#<entry>`, as the sector view, ArchiveXL and REDnode name it. */
  get id(): string {
    return `${this.sector}#${this.entry}`;
  }

  /** The node's class, such as worldMeshNode. */
  get type(): string {
    return String(this.nodeJson?.$type ?? "");
  }

  get debugName(): string | null {
    const n = plainValue(this.nodeJson?.debugName);
    return typeof n === "string" && n !== "None" ? n : null;
  }

  /**
   * A cooked node's inner node that this entry places, or undefined. Cooked nodes (worldInstancedMeshNode,
   * worldCookedStaticMeshNode, ...) keep their meshes in inner nodes in their buffer, picked by the entry's
   * instanceIndex (none: the first), as REDbridge's sector.nodes reads them.
   */
  get inner(): Json | undefined {
    const list = (((this.nodeJson?.buffer as Json | undefined)?.Data as Json | undefined)?.InnerNodes ?? undefined) as Json[] | undefined;
    if (!Array.isArray(list) || !list.length) return undefined;
    const i = Number(plainValue(this.entryJson.instanceIndex) ?? 0xffffffff);
    return list[Number.isInteger(i) && i >= 0 && i < list.length ? i : 0];
  }

  /** What names its resources: the inner node for a cooked node, else the node. */
  private get shows(): Json | undefined {
    return this.inner ?? this.nodeJson;
  }

  /** The mesh it draws, by game path, or null. */
  get mesh(): string | null {
    return resourceIn(this.shows, ["mesh", "staticMesh"], /\.mesh$/i);
  }

  /** The mesh, entity or other resource it places, or null. */
  get resource(): string | null {
    return this.mesh ?? resourceIn(this.shows, ["entityTemplate", "material", "effect", "resource"]);
  }

  get appearance(): string | null {
    const a = plainValue(this.shows?.meshAppearance ?? this.shows?.appearanceName);
    return typeof a === "string" && a !== "None" ? a : null;
  }

  /** Where it stands in the world, in game axes (Z up): [x, y, z]. */
  get position(): [number, number, number] {
    const p = ((this.entryJson.transform as Json | undefined)?.position ?? {}) as Json;
    return [Number(p.X ?? 0), Number(p.Y ?? 0), Number(p.Z ?? 0)];
  }

  get streamingDistance(): number {
    return Number(this.entryJson.streamingDistance ?? 0);
  }

  /** The node and its node data entry as JSON, to read anything else. Change values with set, not here. */
  get json(): { node: Json | undefined; entry: Json } {
    return { node: this.nodeJson, entry: this.entryJson };
  }

  /**
   * Where a path goes: "entry.x" and "node.x" say it; otherwise the node's own property of that name, then
   * the entry's (streamingDistance, transform and the other placing values are the entry's).
   */
  private target(path: string): { on: "node" | "entry"; segments: string[] } {
    const segments = path.split(".").filter((s) => s !== "");
    if (!segments.length) throw new Error("A property's path is empty");
    if (segments[0] === "entry") return { on: "entry", segments: segments.slice(1) };
    if (segments[0] === "node") return { on: "node", segments: segments.slice(1) };
    if (this.nodeJson && segments[0] in this.nodeJson) return { on: "node", segments };
    return { on: "entry", segments };
  }

  /** A property by its path, such as "streamingDistance" or "meshAppearance": names and paths as text. Undefined when there is none. */
  get(path: string): unknown {
    const t = this.target(path);
    const r = walk(t.on === "node" ? this.nodeJson : this.entryJson, t.segments);
    return r ? plainValue(r.value) : undefined;
  }

  /** Changes a property, for the preview: nothing changes in the sector until Apply. Text goes into names and paths. */
  set(path: string, value: unknown): void {
    const t = this.target(path);
    if (t.on === "node" && !this.nodeJson) throw new Error(`${this.id} places no node`);
    const r = walk(t.on === "node" ? this.nodeJson : this.entryJson, t.segments);
    if (!r || r.key === undefined) throw new Error(`${this.id} (${this.type}) has no ${path}`);
    const to = wrapValue(r.value, value);
    if (JSON.stringify(to) === JSON.stringify(r.value)) return;
    const docPath = [...(t.on === "node" ? ["nodes", String(this.nodeIndex), "Data"] : ["nodeData", "Data", String(this.entry)]), ...r.path].join(".");
    const was = this.changes.get(docPath);
    (r.parent as Record<string | number, unknown>)[r.key] = to;
    if (was && JSON.stringify(was.from) === JSON.stringify(to)) this.changes.delete(docPath);
    else this.changes.set(docPath, { id: this.id, entry: this.entry, property: path, path: docPath, from: was ? was.from : r.value, to });
  }

  /** What a log line or JSON shows of it. */
  toJSON(): unknown {
    return { id: this.id, type: this.type, mesh: this.mesh, resource: this.resource, appearance: this.appearance, position: this.position, streamingDistance: this.streamingDistance };
  }
}

/** Every node data entry of a sector's JSON as a script node, in the file's order. */
export function sectorNodes(sector: string, json: unknown, changes: Map<string, NodeChange> = new Map()): SectorNode[] {
  const root = rootChunkOf(json);
  const nodes = root.nodes ?? [];
  const entries = root.nodeData?.Data ?? [];
  return entries.map((e, i) => {
    const k = Number(e.nodeIdx ?? e.nodeIndex ?? -1);
    return new SectorNode(sector, i, e, nodes[k]?.Data, k, changes);
  });
}

/** A change as one JSON Patch operation for cr2w.patch. */
export const changeToOp = (c: NodeChange) => ({ op: "replace" as const, path: c.path, value: c.to });

/** Changes as lines for a log: `#12 worldMeshNode: streamingDistance 30 → 90`. */
export function describeChange(c: NodeChange, node?: SectorNode): string {
  const show = (v: unknown) => {
    const p = plainValue(v);
    const s = typeof p === "string" ? p : JSON.stringify(p);
    return s.length > 80 ? `${s.slice(0, 77)}…` : s;
  };
  return `#${c.entry}${node ? ` ${node.type}${node.mesh ? ` ${node.mesh.slice(node.mesh.lastIndexOf("\\") + 1)}` : ""}` : ""}: ${c.property} ${show(c.from)} → ${show(c.to)}`;
}
