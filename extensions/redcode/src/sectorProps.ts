// The sector view's Properties tab (a modder's request, 2026-11-24): the properties every selected thing shares, edited
// on all of them at once. Two levels: the node data entries (streaming distance, flags, priority…) and the nodes they
// name (mesh, appearance, shadows…), several entries sometimes naming one node. A property shows when every entry
// (or every node) has it with the same type and it is a plain value; its value shows, or "mixed". An edit becomes one
// change per entry or node, which the sector scripts' preview confirms and applies as one edit.
//
// No VS Code imports: the unit checks load it.

import type { NodeChange } from "./sectorNodes";

/** A node as REDbridge's getNode answers it, with the fields used here. */
export interface PropsNode {
  path: string;
  kind: string;
  type: string;
  children: { name: string; kind: string; type: string; value: unknown }[] | null;
}

export interface PropRow {
  name: string;
  type: string;
  /** The value when every one has the same, as WolvenKit's JSON has it (a CName as { $type, $storage, $value }). */
  value: unknown;
  mixed: boolean;
  /** For an enum: its values, filled by the host. */
  enumValues?: string[];
}

/** A plain value an edit can set: a number, a string, a bool, or a wrapped one ({ $type, $value }). */
const editable = (c: { kind: string; value: unknown }) =>
  c.kind === "value" && (c.value === null || typeof c.value !== "object" || (!Array.isArray(c.value) && "$value" in (c.value as Record<string, unknown>)));

/**
 * What ties the sector together, never set on many at once: which node an entry names, which of its copies, the
 * prefab it came from, and node references (one value for all would point them all at one node).
 */
const Structural = new Set(["nodeIdx", "instanceIndex", "sourcePrefabHash"]);
const StructuralTypes = new Set(["NodeRef"]);

/** The properties every node has with the same type and an editable value, each with its value or mixed. */
export function sharedProps(nodes: PropsNode[]): PropRow[] {
  if (!nodes.length) return [];
  const first = nodes[0].children ?? [];
  const rows: PropRow[] = [];
  for (const c of first) {
    if (!editable(c) || Structural.has(c.name) || StructuralTypes.has(c.type)) continue;
    const all = nodes.map((n) => n.children?.find((x) => x.name === c.name));
    if (all.some((x) => !x || x.type !== c.type || !editable(x))) continue;
    const text = JSON.stringify(c.value);
    rows.push({ name: c.name, type: c.type, value: c.value, mixed: all.some((x) => JSON.stringify(x!.value) !== text) });
  }
  return rows;
}

/** The node an entry names: its nodeIdx, read from the entry's node. */
export function nodeIndexOf(entry: PropsNode): number | undefined {
  const c = entry.children?.find((x) => x.name === "nodeIdx");
  const v = c?.value && typeof c.value === "object" && "$value" in (c.value as Record<string, unknown>) ? (c.value as Record<string, unknown>).$value : c?.value;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/**
 * The changes an edit makes: on each entry (target "entry"), or on each node the entries name, once (target "node"),
 * where the value differs. id and entry name the first entry naming a node, for the preview's list.
 */
export function propChanges(
  sector: string,
  entries: number[],
  entryNodes: PropsNode[],
  nodes: Map<number, PropsNode>,
  target: "entry" | "node",
  property: string,
  value: unknown,
): NodeChange[] {
  const changes: NodeChange[] = [];
  const text = JSON.stringify(value);
  if (target === "entry") {
    entryNodes.forEach((n, i) => {
      const c = n.children?.find((x) => x.name === property);
      if (!c || JSON.stringify(c.value) === text) return;
      changes.push({ id: `${sector}#${entries[i]}`, entry: entries[i], property, path: `${n.path}.${property}`, from: c.value, to: value });
    });
    return changes;
  }
  const done = new Set<number>();
  entryNodes.forEach((n, i) => {
    const idx = nodeIndexOf(n);
    if (idx === undefined || done.has(idx)) return;
    done.add(idx);
    const node = nodes.get(idx);
    const c = node?.children?.find((x) => x.name === property);
    if (!node || !c || JSON.stringify(c.value) === text) return;
    changes.push({ id: `${sector}#${entries[i]}`, entry: entries[i], property: `node ${idx} ${property}`, path: `${node.path}.${property}`, from: c.value, to: value });
  });
  return changes;
}
