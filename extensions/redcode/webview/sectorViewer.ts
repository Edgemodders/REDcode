// The sector view (docs/design/sector-view.md): a .streamingsector in 3D, read-only, in the CR2W editor's
// sector mode, drawn by @edgemodders/world-view's page half. The host streams the meshes over as they are
// exported (sectorMesh), with markers for things with no mesh; a click on a thing selects its node data
// entry, which the Properties view follows, and Show in Tree goes to it. Materials (docs/design/sector-materials.md):
// By material colours each copy by the materials its appearance names, and the Materials switch draws the
// picked thing with its own materials, EDGEmat's when it is installed. Selection (docs/design/sector-selection.md):
// Ctrl+click, Shift+drag and Volume select many, listed on the right, the current one followed by the panel.
// Scripts (docs/design/sector-scripts.md): the host's menu runs a script on every node or the selection, and
// the selection it makes comes back here.

import * as THREE from "three";
import { createWorldView, type CameraMove, type PageAppearance, type PageMarker, type PagePlacement, type WorldView } from "../../../packages/world-view/src/page";
import { cssColour, el, lightControls, sideSplitter, type LightSettings } from "./viewerKit";

/** The selected list's icons, drawn on a 16 px grid (see iconButton). */
const Icons = {
  back: "path M10 3 5 8 10 13",
  forward: "path M6 3 11 8 6 13",
  frame: "path M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4",
  isolate: "rect 2.5 2.5 11 11 dashed|circle 8 8 2.5 filled",
  add: "rect 2.5 2.5 11 11|path M8 5v6M5 8h6",
  copy: "rect 5.5 5.5 8 8|path M3 10.5V3.5a1 1 0 0 1 1-1h6.5",
  clear: "path M4 4l8 8M12 4l-8 8",
  open: "path M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5H7",
  // A selected row's own buttons (the owner, 2026-11-24: their words covered the row).
  flyTo: "circle 8 8 4.5|path M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3",
  tree: "path M3 3.5h3M4.5 3.5v9M4.5 8h3M4.5 12.5h3|rect 8.5 6.5 5 3|rect 8.5 11 5 3",
  only: "path M2.5 3h11l-4.25 5v5l-2.5 1.2V8Z",
  mesh: "path M8 1.8 13.5 4.9v6.2L8 14.2l-5.5-3.1V4.9Z|path M2.5 4.9 8 8l5.5-3.1M8 8v6.2",
  material: "circle 8 8 5.5|path M5.2 6.4a3.2 3.2 0 0 1 2.6-1.9",
  // Show in Game: a screen with a play mark.
  game: "rect 1.5 3 13 9|path M6.5 5.5v4l3.5-2Z|path M5.5 14h5",
};

/** What the host sends while a sector loads. */
export type SectorMessage =
  | { type: "sectorMesh"; mesh: string; data: string; placements: PagePlacement[] }
  | { type: "sectorMarkers"; sector: string; markers: PageMarker[] }
  | { type: "sectorUnload"; sector: string }
  | { type: "sectorProgress"; phase?: "reading" | "exporting"; done: number; total: number; etaMs?: number; current?: string }
  | { type: "sectorDone"; skipped: { id: string; why: string }[]; sectors: string[] }
  | { type: "sectorScript"; state: "running" | "done" | "applied"; name: string; done?: number; total?: number; note?: string; selected?: number[] | null; selectedIds?: string[] | null; line?: string }
  | { type: "sectorOverlapLayer"; layer: OverlapLayer }
  | { type: "sectorOverlapProgress"; done: number; total: number }
  | { type: "sectorOverlapDone"; count: number; error?: string };

/** A sector whose things reach into the opened one (docs/design/sector-layers.md). */
export interface OverlapLayer {
  path: string;
  kind: string;
  level: number;
  group: "neighbours" | "levels" | "interiors" | "exteriors" | "global" | "other";
  reach: number;
  byPosition: number;
  variants: number;
  replaces: boolean;
  distance: number;
  /** The project has its own copy, which is the one drawn. */
  project?: boolean;
}

export interface SectorSource {
  /** The opened sector's game path. */
  sector: string;
  /** Asks the host to load the sector, with the coarser sectors over it or not; messages follow. */
  load(coarser: boolean): Promise<void>;
  /** A thing was picked: its node data entry in this sector's tree, or null for another sector's or nothing. */
  picked(path: string | null): void;
  /** Show in Tree: the tree at that path. */
  showInTree(path: string): void;
  /** The entry or entries to select at first (REDcodeApi.openSector's select). */
  select?: number | number[];
  /** A drawn mesh's appearances, each with the material it names per submesh. */
  meshInfo?(mesh: string): Promise<PageAppearance[]>;
  /** A mesh with its materials, for the picked thing: the .glb as base64, and EDGEmat's maps by material name when it is there. */
  render?(mesh: string, appearance?: string): Promise<RenderedThing>;
  /** The picked mesh's buttons. */
  action?(action: "openInEdgemat" | "openMesh" | "addMesh", mesh: string, appearance?: string): Promise<unknown>;
  /** The selected list's Add Meshes to Project: the host asks once for all of them. */
  addMeshes?(meshes: string[]): Promise<unknown>;
  /** The selected list's Copy: the text goes to the clipboard. */
  copy?(text: string): Promise<unknown>;
  /** The light kept for the window (REDcode issue #31), and where a change goes to be kept. */
  light?: Partial<LightSettings>;
  onLight?: (settings: LightSettings) => void;
  say?(message: string): void;
  /** The Scripts button: the host's menu, given the selected node data entries of this sector, and the whole selection by id (layers' things too). */
  scripts?(entries: number[], ids?: string[]): Promise<unknown>;
  /** The picked panel's Links (docs/design/sector-layers.md, L3): a thing's definition, placements, inner record and files. */
  links?(sector: string, entry: number): Promise<LinksInfo>;
  /** A layer's thing in its own sector's tab, picked there. */
  openAt?(sector: string, entry: number): Promise<unknown>;
  /** A file a thing uses, opened in REDcode. */
  openFile?(path: string): Promise<unknown>;
  /** Stop: ends the running script. */
  stopScript?(): Promise<unknown>;
  /** The Overlaps tab: the host finds the sectors whose things reach in, and sends them as it finds them. */
  overlaps?(): Promise<unknown>;
  /** The layers turned on (Ghost or Shown), by game path: the host loads them beside the opened sector. */
  layers?(paths: string[]): Promise<unknown>;
  /** A layer's Open: its sector in its own tab. */
  openSector?(path: string): Promise<unknown>;
  /** Show in Game: EDGEbuilder's camera to a sector's node data entry ("focus"), or the pick sent along to it ("select"). */
  showInGame?(sector: string, entry: number, how: "focus" | "select"): Promise<unknown>;
  /** The Properties tab: what the selected node data entries, and the nodes they name, share. */
  props?(entries: number[]): Promise<PropsInfo>;
  /** Sets one property on every selected entry or node; the host asks first. */
  setProp?(entries: number[], target: "entry" | "node", property: string, value: unknown): Promise<unknown>;
}

/** What the host reads of a thing for the Links row (src/sectorNodes.ts, entryLinks). */
export interface LinksInfo {
  entry: number;
  type: string;
  node: number;
  nodePath: string;
  placements: number[];
  inner?: { index: number; path: string; type: string };
  files: string[];
  /** The thing is the opened sector's: its tree is this tab's. */
  opened: boolean;
}

/** A property every selected thing has (src/sectorProps.ts). */
export interface PropRowInfo {
  name: string;
  type: string;
  value: unknown;
  mixed: boolean;
  enumValues?: string[];
}

export interface PropsInfo {
  entries: number;
  nodes: number;
  entryType: string;
  nodeTypes: string[];
  entryProps: PropRowInfo[];
  nodeProps: PropRowInfo[];
  game: boolean;
}

export interface SectorView {
  receive(m: SectorMessage): void;
  /** Selects a node data entry of this sector, or several, and frames them. */
  selectEntry(entry: number | number[]): void;
  /** The document changed (an undo, a redo, another page's edit): the Properties tab reads it again when shown. */
  refreshProps?(): void;
  dispose(): void;
  /** EDGEmat changed a material: the picked thing is drawn again when it shows that mesh (or when no mesh is named). */
  refreshMaterials(change?: { mesh?: string }): void;
}

/** Baked PBR maps for a material, as base64 PNG, from EDGEmat through the host. */
interface RenderedMaps {
  baseColor?: string;
  normal?: string;
  roughness?: string;
  metalness?: string;
  fidelity?: "approximate" | "checked";
}

export interface RenderedThing {
  data: string;
  appearance?: string;
  chunkMaterials: string[];
  edgemat: boolean;
  maps?: Record<string, RenderedMaps>;
  mapsError?: string;
}

const b64 = (s: string) => {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

const seconds = (ms: number) => (ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60000)} min`);

/** When the sector view last took Ctrl+A: the page's text selected just after it is VS Code's Select All, undone. */
let selectAllAt = -Infinity;
document.addEventListener("selectionchange", () => {
  if (performance.now() - selectAllAt < 1000 && !document.getSelection()?.isCollapsed) document.getSelection()?.removeAllRanges();
});

export async function mountSector(container: HTMLElement, source: SectorSource): Promise<SectorView> {
  container.replaceChildren();
  container.classList.add("meshview");
  const bar = el("div", "toolbar");
  const stage = el("div", "meshstage");
  const canvas = el("canvas", "sectorcanvas");
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  stage.appendChild(canvas);
  // A thin bar over the top of the view while anything loads: moving while sectors are read, filling while meshes export.
  const loadBar = el("div", "loadbar");
  const loadFill = el("div", "fill");
  loadBar.appendChild(loadFill);
  loadBar.hidden = true;
  stage.appendChild(loadBar);
  const info = el("div", "toolbar sectorinfo");
  const camBar = el("div", "toolbar camerabar");
  const camHelp = el("div", "toolbar camerahelp dim");
  camHelp.hidden = true;
  // The selected list on the right, always there (showing it only when something is selected would move the view under the cursor).
  const side = el("div", "meshside sectorside");
  const body = el("div", "meshbody");
  body.append(stage, side);
  sideSplitter(body, side);
  container.append(bar, camBar, camHelp, body, info);

  const view: WorldView = createWorldView(canvas, {
    background: cssColour("--vscode-editor-background", "#0d1017"),
    accent: cssColour("--vscode-textLink-foreground", "#19f3ff"),
    // A file viewer shows the whole file at first; Streamed shows what the game would draw from the camera.
    culling: "none",
    light: source.light,
  });

  // ---- the toolbar ----
  const button = (label: string, title: string, on?: boolean) => {
    const b = el("button", on ? "on" : "", label);
    b.title = title;
    return b;
  };
  /** A button drawn as a 16 px line icon in the text colour; the title names it and says what it does. */
  const iconButton = (shapes: string, title: string) => {
    const b = el("button", "icon");
    b.title = title;
    b.setAttribute("aria-label", title.split(":")[0]);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    // Each shape: "path d" or "circle cx cy r" or "rect x y w h", separated by "|".
    for (const shape of shapes.split("|")) {
      const [kind, ...v] = shape.trim().split(" ");
      const e = document.createElementNS("http://www.w3.org/2000/svg", kind);
      if (kind === "path") e.setAttribute("d", v.join(" "));
      else if (kind === "circle") ["cx", "cy", "r"].forEach((k, i) => e.setAttribute(k, v[i]));
      else if (kind === "rect") ["x", "y", "width", "height"].forEach((k, i) => e.setAttribute(k, v[i]));
      if (v.includes("dashed")) e.setAttribute("stroke-dasharray", "2 1.6");
      if (v.includes("filled")) e.setAttribute("fill", "currentColor");
      svg.appendChild(e);
    }
    b.appendChild(svg);
    return b;
  };
  const fit = button("Frame", "Fit the view to the sector, or to the thing picked");
  const coarser = button("Coarser levels", "Also draw the coarser sectors over this one: from above, they hold what is far. Level 0 is only the near layer");
  const culling = button("Streamed", "Show each thing only within its streaming distance of the camera, as the game does; off, everything shows");
  const colour = el("select");
  colour.title = "Colour each mesh, or each material name";
  for (const [v, l] of [["mesh", "By mesh"], ["material", "By material"]]) {
    const o = el("option", "", l);
    o.value = v;
    colour.appendChild(o);
  }
  const markerButton = button("Markers", "Show the opened sector's things that have no mesh: entities, decals, lights, collision, sound and AI spots", true);
  const realButton = button("Materials", "Draw the picked thing with its materials, rendered by EDGEmat when it is installed, else by REDcode with EDGEmat's renderer");
  realButton.hidden = !source.render;
  const volumeButton = button("Volume", "Select with a box in the world: drag on the ground for its base, move the mouse for its height, and click. Its handles resize it, the round one above moves it; again to take it away");
  const touchingButton = button("Touching", "Boxes also take what only touches them, such as roads and walls whose middle is far off; off, a thing's middle must be inside");
  const scriptsButton = button("Scripts", "Run a script on every node or on the selection: find nodes, select them, change values. New Script, Edit, Debug");
  scriptsButton.hidden = !source.scripts;
  const stats = el("span", "dim mono", "");
  bar.append(fit, coarser, culling, markerButton, colour, realButton, volumeButton, touchingButton, scriptsButton, ...lightControls(view.lighting, source.onLight), stats);
  const progress = el("span", "dim", "Reading the sector…");
  const pickedLine = el("span", "mono", "");
  const pickedMeta = el("span", "dim mono", "");
  const realNote = el("span", "dim", "");
  const hint = el("span", "dim", "");
  const scriptLine = el("span", "dim", "");
  const toTree = button("Show in Tree", "Go to this node data entry in the tree");
  toTree.hidden = true;
  const toGame = button("Show in Game", "Fly EDGEbuilder's camera to this thing in the running game, with Edit on. Needs REDnode and EDGEbuilder in the game");
  toGame.hidden = true;
  // The Links row (docs/design/sector-layers.md, part 3): what the picked thing is made of and where else it stands.
  const linksRow = el("div", "sectorlinks");
  linksRow.hidden = true;
  const openMesh = button("Open Mesh", "Open the mesh in REDcode's mesh view");
  const toEdgemat = button("Open in EDGEmat", "Put the mesh on EDGEmat's Desk at this node's appearance, to choose or make another material");
  const addMesh = button("Add Mesh to Project", "Copy the mesh into the project. A change to it shows everywhere the game uses this mesh, not only here");
  const meshButtons = [openMesh, toEdgemat, addMesh];
  for (const b of meshButtons) b.hidden = true;
  info.append(progress, hint, scriptLine, pickedLine, pickedMeta, toTree, toGame, ...meshButtons, realNote, linksRow);

  // ---- the camera's row: each move while its button is held (Shift faster, Ctrl slower), as the keys do ----
  const group = (label: string, ...items: HTMLElement[]) => {
    const g = el("span", "camgroup");
    g.append(el("span", "dim", label), ...items);
    return g;
  };
  const moveButton = (label: string, title: string, move: CameraMove) => {
    const b = button(label, title);
    b.classList.add("cam");
    const stop = () => view.hold(move, false);
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      view.hold(move, true, { fast: e.shiftKey, slow: e.ctrlKey });
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        // No such pointer (a pen gone, a scripted event): pointerup still ends the move.
      }
    });
    b.addEventListener("pointerup", stop);
    b.addEventListener("pointercancel", stop);
    b.addEventListener("lostpointercapture", stop);
    return b;
  };
  const speedValue = el("span", "mono", "×1.0");
  const showSpeed = (s: number) => (speedValue.textContent = `×${s < 1 ? s.toFixed(2) : s.toFixed(1)}`);
  view.onFlySpeed(showSpeed);
  const slower = button("−", "Fly slower (or the wheel, with the right button held)");
  const faster = button("+", "Fly faster (or the wheel, with the right button held)");
  slower.addEventListener("click", () => (view.flySpeed = view.flySpeed * 0.8));
  faster.addEventListener("click", () => (view.flySpeed = view.flySpeed * 1.25));
  const topView = button("Top", "Look down on the sector, or on the thing picked, from above");
  const resetView = button("Reset", "Back to the view the sector opened with");
  const helpButton = button("?", "The mouse and keys");
  topView.addEventListener("click", () => view.flyTo(picked ? [picked] : undefined, "top"));
  resetView.addEventListener("click", () => view.flyTo(undefined, "start"));
  helpButton.addEventListener("click", () => {
    camHelp.hidden = !camHelp.hidden;
    helpButton.classList.toggle("on", !camHelp.hidden);
  });
  camHelp.textContent =
    "Left drag: orbit. Right drag: look round, and fly with W A S D, Q down, E up. Middle drag, or Ctrl with the left: pan. " +
    "Wheel: closer to the cursor; with the right button held, the fly speed. Shift: faster, Ctrl: slower. F: frame the picked thing. Double-click: fly to a thing. " +
    "Click: select one. Ctrl+click: add or take out. Shift+drag: select in a box on the screen. Volume: a box in the world. Esc: select nothing. Ctrl+A: select all (click in the view first).";
  camBar.append(
    group("Zoom", moveButton("+", "Closer to what the camera orbits", "zoomIn"), moveButton("−", "Further from what the camera orbits", "zoomOut")),
    group(
      "Move",
      moveButton("Forward", "Fly where the camera looks (W)", "forward"),
      moveButton("Back", "Fly back (S)", "back"),
      moveButton("◀", "Strafe left (A)", "left"),
      moveButton("▶", "Strafe right (D)", "right"),
    ),
    group("Pan", moveButton("▲", "Pan up the screen", "panUp"), moveButton("▼", "Pan down the screen", "panDown")),
    group("Height", moveButton("Up", "Straight up (E)", "up"), moveButton("Down", "Straight down (Q)", "down")),
    group("Orbit", moveButton("⟲", "Turn round what the camera orbits", "orbitLeft"), moveButton("⟳", "Turn round the other way", "orbitRight")),
    group("Speed", slower, speedValue, faster),
    topView,
    resetView,
    helpButton,
  );

  let picked: string | null = null;
  /** What each placement draws, from the host's meshes: for the picked panel and its buttons. */
  const drawnAs = new Map<string, { mesh: string; appearance?: string }>();
  const markerOf = new Map<string, PageMarker>();
  /** The meshes drawn so far, by game path in lower case, for By material. */
  const drawnMeshes = new Map<string, string>();
  const infos = new Map<string, Promise<PageAppearance[]>>();
  const meshInfo = (mesh: string) => {
    const key = mesh.toLowerCase();
    let p = infos.get(key);
    if (!p && source.meshInfo) {
      p = source.meshInfo(mesh);
      infos.set(key, p);
      p.catch(() => infos.delete(key));
    }
    return p ?? Promise.resolve([] as PageAppearance[]);
  };
  const lookOf = (list: PageAppearance[], name?: string) => list.find((a) => a.name.toLowerCase() === (name ?? "").toLowerCase()) ?? list[0];
  const showStats = () => {
    const s = view.stats();
    stats.textContent = `${s.meshes.toLocaleString()} meshes, ${s.shown.toLocaleString()} of ${s.placements.toLocaleString()} copies shown, ${s.markers.toLocaleString()} markers`;
  };
  const statsTimer = setInterval(showStats, 1000);

  /** A sector item's id as a tree path in this sector, or null when it is another sector's. */
  const pathOf = (id: string): string | null => {
    const cut = id.lastIndexOf("#");
    if (cut < 0 || id.slice(0, cut).toLowerCase() !== source.sector.toLowerCase()) return null;
    const entry = id.slice(cut + 1).split(".")[0];
    return /^\d+$/.test(entry) ? `nodeData.Data.${entry}` : null;
  };

  /** A thing's sector and node data entry, from its id (<sector>#<entry>, or #<entry>.<copy> for an instanced copy). */
  const gameEntryOf = (id: string): { sector: string; entry: number } | null => {
    const cut = id.lastIndexOf("#");
    const entry = cut < 0 ? "" : id.slice(cut + 1).split(".")[0];
    return /^\d+$/.test(entry) && /\.streamingsector$/i.test(id.slice(0, cut)) ? { sector: id.slice(0, cut), entry: Number(entry) } : null;
  };
  const showInGame = (id: string) => {
    const at = gameEntryOf(id);
    if (at) source.showInGame?.(at.sector, at.entry, "focus").catch((e) => source.say?.(e instanceof Error ? e.message : String(e)));
  };
  /** The Links row for the picked thing, read by the host a moment after the pick settles. */
  let linksTimer: ReturnType<typeof setTimeout> | undefined;
  let linksAsked = 0;
  const linkButton = (text: string, title: string, run: () => void) => {
    const b = el("button", "linkbtn", text);
    b.title = title;
    b.addEventListener("click", run);
    return b;
  };
  const showLinks = (id: string | null) => {
    clearTimeout(linksTimer);
    const mine = ++linksAsked;
    const at = id ? gameEntryOf(id) : null;
    if (!at || !source.links) {
      linksRow.hidden = true;
      return;
    }
    linksTimer = setTimeout(() => {
      source.links!(at.sector, at.entry).then(
        (l) => {
          if (mine !== linksAsked) return;
          linksRow.replaceChildren(el("span", "dim", "Links"));
          const own = (path: string) => () => (l.opened ? source.showInTree(path) : void source.openAt?.(at.sector, at.entry));
          linksRow.append(
            linkButton(`Node ${l.node}`, l.opened ? `Its definition, nodes[${l.node}] (${l.type}), in the tree` : `Its definition is nodes[${l.node}] (${l.type}) of its own sector: open it there`, own(l.nodePath)),
          );
          if (l.placements.length > 1) {
            linksRow.append(
              linkButton(`${l.placements.length} placements`, `Every node data entry that places ${l.inner ? `inner record ${l.inner.index} of nodes[${l.node}]` : `nodes[${l.node}]`}: select them all`, () => {
                const ids = l.placements.flatMap((e) => idsOfId(`${at.sector}#${e}`));
                select(ids, ids.find((x) => x.startsWith(`${at.sector}#${at.entry}`)) ?? ids[0] ?? null);
              }),
            );
          }
          if (l.inner) linksRow.append(linkButton(`Inner ${l.inner.index}`, `The ${l.inner.type} this entry places, in the tree`, own(l.inner.path)));
          if (!l.opened && source.openAt) linksRow.append(linkButton("Open Its Sector", `${at.sector}\nOpens in its own tab with this thing picked`, () => void source.openAt!(at.sector, at.entry)));
          for (const f of l.files) {
            const b = linkButton(f.slice(f.lastIndexOf("\\") + 1), `${f}\nOpen it in REDcode`, () => source.openFile?.(f).catch((e) => source.say?.(e instanceof Error ? e.message : String(e))));
            b.hidden = !source.openFile;
            linksRow.append(b);
          }
          linksRow.hidden = false;
        },
        () => {
          if (mine === linksAsked) linksRow.hidden = true;
        },
      );
    }, 250);
  };

  /** Each pick goes along to EDGEbuilder in the game, a moment after it settles. */
  let sendTimer: ReturnType<typeof setTimeout> | undefined;
  const sendPick = (id: string | null) => {
    clearTimeout(sendTimer);
    const at = id ? gameEntryOf(id) : null;
    if (!at || !source.showInGame) return;
    sendTimer = setTimeout(() => void source.showInGame?.(at.sector, at.entry, "select").catch(() => undefined), 400);
  };

  /** The panel under the view, Show in Tree, the Properties view and Materials: all on the current thing. */
  const showCurrent = () => {
    const id = picked;
    const path = id ? pathOf(id) : null;
    toTree.hidden = !path;
    toGame.hidden = !id || !source.showInGame || !gameEntryOf(id);
    sendPick(id);
    showLinks(id);
    pickedLine.textContent = id ? `${id.slice(id.lastIndexOf("\\") + 1)}${path ? "" : layerOf(id.slice(0, id.lastIndexOf("#"))) ? "  (a layer's)" : "  (a coarser sector's)"}` : "";
    pickedLine.title = id ?? "";
    const what = id ? drawnAs.get(id) : undefined;
    for (const b of meshButtons) b.hidden = !what || !source.action;
    pickedMeta.textContent = "";
    pickedMeta.title = "";
    if (what) {
      const name = what.mesh.slice(what.mesh.lastIndexOf("\\") + 1);
      pickedMeta.textContent = `${name} · ${what.appearance || "default"}`;
      pickedMeta.title = what.mesh;
      void meshInfo(what.mesh).then(
        (list) => {
          if (picked !== id) return;
          const look = lookOf(list, what.appearance);
          const mats = [...new Set(look?.chunkMaterials ?? [])].filter((x) => x);
          pickedMeta.textContent = `${name} · ${look?.name ?? what.appearance ?? "default"}${mats.length ? ` · ${mats.length} material${mats.length === 1 ? "" : "s"}: ${mats.join(", ")}` : ""}`;
          const differs = what.appearance && look && look.name.toLowerCase() !== what.appearance.toLowerCase();
          pickedMeta.title = `${what.mesh}\nAppearance: ${look?.name ?? "(none)"}${differs ? ` (the node names ${what.appearance})` : ""}\nPer submesh: ${(look?.chunkMaterials ?? []).map((x, i) => `${i}: ${x}`).join(", ")}`;
        },
        () => undefined,
      );
    } else if (id && markerOf.has(id)) {
      const mk = markerOf.get(id)!;
      pickedMeta.textContent = `${mk.class}${mk.resource ? ` · ${mk.resource.slice(mk.resource.lastIndexOf("\\") + 1)}` : ""}`;
      pickedMeta.title = mk.resource ?? "";
    }
    void showMaterials();
    source.picked(path);
  };

  // ---- the selection (docs/design/sector-selection.md): many things, one of them current ----
  let selection: string[] = [];
  let shownCurrent: string | null | undefined;
  /** Isolate on: the things ghosted, everything shown but the selection. It follows the selection, and ends with it. */
  let isolated: string[] | null = null;
  const endIsolate = () => {
    if (!isolated) return;
    view.setHidden(isolated, "shown");
    isolated = null;
    isolate.classList.remove("on");
  };
  const applyIsolate = () => {
    if (isolated) view.setHidden(isolated, "shown");
    const keep = new Set(selection);
    isolated = view.idsShown().filter((id) => !keep.has(id));
    view.setHidden(isolated, "ghost");
    isolate.classList.add("on");
  };
  const select = (ids: string[], current?: string | null) => {
    selection = [...new Set(ids)];
    const now = current && selection.includes(current) ? current : (selection[0] ?? null);
    picked = now;
    if (!travelling) remember(selection, now);
    view.highlight(selection, now);
    if (isolated) {
      if (selection.length) applyIsolate();
      else endIsolate();
    }
    // A volume being dragged selects many times a second: the panel and Materials only when the current one changes.
    if (shownCurrent !== now) {
      shownCurrent = now;
      showCurrent();
    }
    renderList();
  };
  const choose = (id: string | null) => select(id ? [id] : [], id);

  // ---- the selection's history: Back and Forward ----
  type Step = { ids: string[]; current: string | null };
  const MaxSteps = 100;
  let steps: Step[] = [{ ids: [], current: null }];
  let at = 0;
  let travelling = false;
  /** Changes this close together are one step: a volume dragged, a box redrawn. */
  let joining: ReturnType<typeof setTimeout> | undefined;
  const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  function remember(ids: string[], current: string | null) {
    if (sameIds(ids, steps[at].ids)) {
      steps[at].current = current;
      return;
    }
    if (joining && at > 0) steps[at] = { ids, current };
    else {
      steps = steps.slice(0, at + 1);
      steps.push({ ids, current });
      if (steps.length > MaxSteps) steps.shift();
      at = steps.length - 1;
    }
    clearTimeout(joining);
    joining = setTimeout(() => (joining = undefined), 400);
  }
  const travel = (by: number) => {
    const to = at + by;
    if (to < 0 || to >= steps.length) return;
    clearTimeout(joining);
    joining = undefined;
    at = to;
    travelling = true;
    try {
      select(steps[at].ids, steps[at].current);
    } finally {
      travelling = false;
    }
  };
  const setCurrent = (id: string) => {
    picked = id;
    view.highlight(selection, id);
    shownCurrent = id;
    showCurrent();
    for (const r of rows.children) (r as HTMLElement).classList.toggle("current", (r as HTMLElement).dataset.id === id);
  };
  /** Ctrl+click: in, or out. */
  const toggle = (id: string) => {
    if (selection.includes(id)) {
      const rest = selection.filter((x) => x !== id);
      select(rest, picked === id ? rest[rest.length - 1] : picked);
    } else select([...selection, id], id);
  };

  // ---- the selected list ----
  const head = el("div", "selhead");
  const count = el("span", "selcount", "");
  const back = iconButton(Icons.back, "Back: the selection before this one");
  const forward = iconButton(Icons.forward, "Forward: the selection after this one");
  const frameAll = iconButton(Icons.frame, "Frame All: fly to all of them");
  const isolate = iconButton(Icons.isolate, "Isolate: ghost everything else, to see these alone; again to show it all");
  const addAll = iconButton(Icons.add, "Add Meshes to Project: copy each of their meshes into the project once. A change to one shows everywhere the game uses it");
  const copyAll = iconButton(Icons.copy, "Copy: their ids and meshes, one per line, for an issue or an assistant");
  const clearAll = iconButton(Icons.clear, "Clear: select nothing (Esc). Back brings it back");
  head.append(back, forward, count, frameAll, isolate, addAll, copyAll, clearAll);
  back.addEventListener("click", () => travel(-1));
  forward.addEventListener("click", () => travel(1));
  const rows = el("div", "selrows");
  const empty = el("div", "dim selempty", "Nothing selected. Click a thing to select it, Ctrl+click to add or take out, Shift+drag for a box on the screen, or Volume for a box in the world.");
  // ---- the side panel's tabs: Selections and Overlaps (docs/design/sector-layers.md) ----
  const tabs = el("div", "sidetabs");
  const selTab = el("button", "sidetab on", "Selections");
  selTab.title = "The things selected in the view";
  const ovTab = el("button", "sidetab", "Overlaps");
  ovTab.title = "Overlaps: the sectors whose things reach into this one, as layers to show beside it";
  const propTab = el("button", "sidetab", "Properties");
  propTab.title = "Properties: what every selected thing shares, changed on all of them at once";
  tabs.append(selTab, ovTab, propTab);
  const selPane = el("div", "sidepane");
  selPane.append(head, rows, empty);
  const ovPane = el("div", "sidepane");
  ovPane.hidden = true;
  const propPane = el("div", "sidepane proppane");
  propPane.hidden = true;
  side.append(tabs, selPane, ovPane, propPane);
  const showTab = (which: "selections" | "overlaps" | "properties") => {
    selTab.classList.toggle("on", which === "selections");
    ovTab.classList.toggle("on", which === "overlaps");
    propTab.classList.toggle("on", which === "properties");
    selPane.hidden = which !== "selections";
    ovPane.hidden = which !== "overlaps";
    propPane.hidden = which !== "properties";
    if (which === "overlaps") startOverlaps();
    if (which === "properties") refreshProps();
  };
  selTab.addEventListener("click", () => showTab("selections"));
  ovTab.addEventListener("click", () => showTab("overlaps"));
  propTab.addEventListener("click", () => showTab("properties"));
  propTab.hidden = !source.props;

  // ---- the Properties tab (a modder's request, 2026-11-24) ----------------------------------------
  // What every selected node data entry shares, and what every node they name shares, edited on all of them: an edit
  // goes to the host, which says how many values change and asks, as a sector script's changes do.
  let propsAsked = 0;
  let propsTimer: ReturnType<typeof setTimeout> | undefined;
  const plainOf = (v: unknown) => (v && typeof v === "object" && "$value" in (v as Record<string, unknown>) ? (v as Record<string, unknown>).$value : v);
  const IntTypes = /^(Int|Uint)(8|16|32|64)$/;
  const propEditor = (row: PropRowInfo, commit: (value: unknown) => void): HTMLElement => {
    const shown = plainOf(row.value);
    const wrap = (v: unknown) => (row.value && typeof row.value === "object" && "$value" in (row.value as Record<string, unknown>) ? { ...(row.value as Record<string, unknown>), $value: v } : v);
    if (row.enumValues?.length) {
      const s = el("select");
      if (row.mixed) {
        const o = el("option", "", "(mixed)");
        o.value = "";
        s.append(o);
      }
      for (const v of row.enumValues) {
        const o = el("option", "", v);
        o.value = v;
        s.append(o);
      }
      s.value = row.mixed ? "" : String(shown);
      s.addEventListener("change", () => s.value && commit(wrap(s.value)));
      return s;
    }
    if (row.type === "Bool") {
      const c = el("input");
      c.type = "checkbox";
      c.checked = !row.mixed && (shown === 1 || shown === true);
      c.indeterminate = row.mixed;
      c.addEventListener("change", () => commit(c.checked ? 1 : 0));
      return c;
    }
    const numeric = row.type === "Float" || row.type === "Double" || IntTypes.test(row.type);
    const i = el("input");
    i.type = "text";
    i.className = numeric ? "num" : "";
    i.value = row.mixed ? "" : shown === null || shown === undefined ? "" : String(shown);
    i.placeholder = row.mixed ? "mixed" : "";
    const done = () => {
      if (row.mixed && i.value === "") return;
      if (!row.mixed && i.value === String(shown ?? "")) return;
      if (numeric) {
        const n = Number(i.value);
        if (i.value.trim() === "" || Number.isNaN(n)) {
          i.classList.add("bad");
          return;
        }
        i.classList.remove("bad");
        const big = /64$/.test(row.type) && typeof shown === "string";
        commit(wrap(row.type === "Float" ? Math.fround(n) : IntTypes.test(row.type) ? (big ? String(Math.trunc(n)) : Math.trunc(n)) : n));
      } else commit(wrap(i.value));
    };
    // One commit a value: Enter leaves the box and its change event commits (EDGEweb's scripted run: Enter and then
    // the box losing focus to the question committed twice, and the question came twice).
    i.addEventListener("change", done);
    i.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        i.blur();
      }
      if (e.key === "Escape") i.value = row.mixed ? "" : String(shown ?? "");
    });
    return i;
  };
  const propSection = (title: string, tip: string, rows: PropRowInfo[], target: "entry" | "node", entries: number[]) => {
    const box = el("div", "propsection");
    const head = el("div", "prophead", title);
    head.title = tip;
    box.append(head);
    if (!rows.length) box.append(el("div", "dim propnone", "Nothing all of them share that can be set here."));
    for (const r of rows) {
      const line = el("div", "proprow");
      const name = el("span", "propname", r.name);
      name.title = `${r.name} (${r.type})${r.mixed ? "\nNot the same on all of them" : ""}`;
      const cell = el("span", "propvalue");
      cell.append(
        propEditor(r, (value) => {
          source.setProp!(entries, target, r.name, value).then(
            () => refreshProps(),
            (e) => source.say?.(e instanceof Error ? e.message : String(e)),
          );
        }),
      );
      line.append(name, el("span", "dim proptype", r.type), cell);
      box.append(line);
    }
    return box;
  };
  /** Reads what the selection shares again, when the tab shows (after the selection settles). */
  const refreshProps = () => {
    if (!source.props || propPane.hidden) return;
    clearTimeout(propsTimer);
    propsTimer = setTimeout(() => {
      const entries = selectedEntries();
      const mine = ++propsAsked;
      if (!entries.length) {
        propPane.replaceChildren(el("div", "dim propnone", selection.length ? "The selection holds nothing of this sector's own (a layer's things are changed in their own sector)." : "Select things in the view, or with a script, to see what they share and change it on all of them."));
        return;
      }
      propPane.replaceChildren(el("div", "dim propnone", `Reading ${entries.length.toLocaleString()} node data entr${entries.length === 1 ? "y" : "ies"}…`));
      source.props!(entries).then(
        (p) => {
          if (mine !== propsAsked) return;
          const kinds = p.nodeTypes.length === 1 ? p.nodeTypes[0] : `${p.nodeTypes.length} kinds`;
          const head = el("div", "dim propsummary", `${p.entries.toLocaleString()} node data entr${p.entries === 1 ? "y" : "ies"}, naming ${p.nodes.toLocaleString()} node${p.nodes === 1 ? "" : "s"} (${kinds}).${p.game ? " The game's copy: a change asks to add the sector to the project." : " A change asks first, with how many values it changes."}`);
          propPane.replaceChildren(
            head,
            propSection(`Node data · ${p.entryType}`, "Each selected thing's node data entry: where it streams, its flags and priority", p.entryProps, "entry", entries),
            propSection(`Node · ${kinds}`, "The nodes the entries name: what they draw and how. Several entries can name one node, such as an instanced mesh's copies", p.nodeProps, "node", entries),
          );
        },
        (e) => {
          if (mine === propsAsked) propPane.replaceChildren(el("div", "error", e instanceof Error ? e.message : String(e)));
        },
      );
    }, 250);
  };

  type LayerState = "off" | "ghost" | "shown";
  const GroupInfo: Record<OverlapLayer["group"], { name: string; tip: string; colour: number }> = {
    neighbours: { name: "Neighbours", tip: "Sectors of the same kind and level beside this one", colour: 0x4fc3f7 },
    levels: { name: "Other levels", tip: "Sectors of the same kind at other levels: coarser ones hold big things and what is seen from far", colour: 0xb39ddb },
    interiors: { name: "Interiors", tip: "Interior sectors: the insides of buildings", colour: 0xffb74d },
    exteriors: { name: "Exteriors", tip: "Exterior sectors", colour: 0x81c784 },
    other: { name: "Other", tip: "Navigation and other kinds", colour: 0x90a4ae },
    global: { name: "Global", tip: "Quest and always-loaded sectors. Many quest sectors load only while their quest runs, so their things may never show at the same time as the rest", colour: 0xf06292 },
  };
  const GroupOrder = Object.keys(GroupInfo) as OverlapLayer["group"][];
  const LayerOpacity = 0.3;
  const layers: OverlapLayer[] = [];
  const layerState = new Map<string, LayerState>();
  const loadingLayers = new Set<string>();
  const collapsed = new Set<string>(["global"]);
  let overlapsStarted = false;
  let overlapRun: { done: number; total: number; finished: boolean; error?: string } = { done: 0, total: 0, finished: false };
  const stateOf = (p: string): LayerState => layerState.get(p.toLowerCase()) ?? "off";
  const layerOf = (sector: string) => layers.find((l) => l.path.toLowerCase() === sector.toLowerCase());
  const shortSector = (p: string) => p.slice(p.lastIndexOf("\\") + 1).replace(/\.streamingsector$/i, "");

  const ovHead = el("div", "selhead ovhead");
  const ovStatus = el("span", "selcount ovstatus", "");
  const ovAllOff = iconButton(Icons.clear, "All Off: turn every layer off");
  ovHead.append(ovStatus, ovAllOff);
  const ovList = el("div", "selrows ovlist");
  const ovEmpty = el("div", "dim selempty", "");
  ovPane.append(ovHead, ovList, ovEmpty);

  const sendLayers = () => {
    const on = layers.filter((l) => stateOf(l.path) !== "off").map((l) => l.path);
    source.layers?.(on).catch((e) => source.say?.(e instanceof Error ? e.message : String(e)));
  };
  const setLayers = (list: OverlapLayer[], state: LayerState) => {
    let load = false;
    for (const l of list) {
      const was = stateOf(l.path);
      if (was === state) continue;
      layerState.set(l.path.toLowerCase(), state);
      view.setSectorLook(l.path, state === "ghost" ? { colour: GroupInfo[l.group].colour, opacity: LayerOpacity } : null);
      if ((was === "off") !== (state === "off")) load = true;
      if (was === "off" && state !== "off") loadingLayers.add(l.path.toLowerCase());
      if (state === "off") loadingLayers.delete(l.path.toLowerCase());
    }
    if (load) sendLayers();
    renderOverlaps();
  };
  ovAllOff.addEventListener("click", () => setLayers(layers, "off"));

  /** Off, Ghost, Shown: three buttons, the one on lit; none lit when a group is mixed. */
  const stateSwitch = (current: LayerState | null, tip: string, set: (s: LayerState) => void) => {
    const box = el("span", "laystate");
    for (const [state, label, what] of [
      ["off", "Off", "not drawn"],
      ["ghost", "Ghost", "drawn see-through in the group's colour"],
      ["shown", "Shown", "drawn as this sector's things are"],
    ] as [LayerState, string, string][]) {
      const b = button(label, `${label}: ${tip} ${what}`, current === state);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        set(state);
      });
      box.appendChild(b);
    }
    return box;
  };

  const renderOverlaps = () => {
    const n = layers.length;
    ovTab.textContent = n ? `Overlaps (${n.toLocaleString()})` : "Overlaps";
    if (!overlapRun.finished) {
      ovStatus.replaceChildren(el("span", "makespin"), document.createTextNode(overlapRun.total ? ` Checking ${overlapRun.done.toLocaleString()} of ${overlapRun.total.toLocaleString()}…` : " Finding the sectors…"));
      ovStatus.title = "Each sector is read once and kept, so this place is quicker next time";
    } else {
      ovStatus.textContent = overlapRun.error ? `Could not finish: ${overlapRun.error}` : `${n.toLocaleString()} sector${n === 1 ? "" : "s"} reach in`;
      ovStatus.title = "";
    }
    ovAllOff.hidden = !layers.some((l) => stateOf(l.path) !== "off");
    ovEmpty.hidden = n > 0 || !overlapRun.finished;
    ovEmpty.textContent = overlapRun.error ? "" : "No other sector's things reach into this one.";
    const out: HTMLElement[] = [];
    for (const g of GroupOrder) {
      const list = layers.filter((l) => l.group === g);
      if (!list.length) continue;
      const info = GroupInfo[g];
      const states = new Set(list.map((l) => stateOf(l.path)));
      const gh = el("div", "ovgroup");
      gh.title = info.tip;
      const caret = el("span", "ovcaret", collapsed.has(g) ? "▸" : "▾");
      const swatch = el("span", "ovswatch");
      swatch.style.background = `#${info.colour.toString(16).padStart(6, "0")}`;
      gh.append(caret, swatch, el("span", "ovgname", `${info.name} (${list.length.toLocaleString()})`), stateSwitch(states.size === 1 ? [...states][0] : null, "every sector in the group", (st) => setLayers(list, st)));
      gh.addEventListener("click", () => {
        if (collapsed.has(g)) collapsed.delete(g);
        else collapsed.add(g);
        renderOverlaps();
      });
      out.push(gh);
      if (collapsed.has(g)) continue;
      for (const l of list) {
        const row = el("div", "ovrow");
        const state = stateOf(l.path);
        row.title = `${l.path}\nLevel ${l.level}, ${l.kind}. ${l.reach.toLocaleString()} of its things reach into this sector${l.byPosition ? ` (${l.byPosition.toLocaleString()} have no box and count by where they stand)` : ""}.${l.variants ? `\n${l.variants} named variant(s): node ranges a quest switches on or off.` : ""}${l.replaces ? "\nPhantom Liberty's copy, which the game streams in place of the base game's." : ""}${l.project ? "\nThe project's own copy is the one drawn." : ""}`;
        const name = el("span", "selname", shortSector(l.path));
        const meta = el("span", "dim ovmeta", `${l.reach.toLocaleString()}`);
        meta.title = "Things that reach in";
        row.append(name, meta);
        if (l.project) row.appendChild(el("span", "ovtag", "project"));
        if (l.replaces) row.appendChild(el("span", "ovtag", "PL"));
        if (loadingLayers.has(l.path.toLowerCase())) row.appendChild(el("span", "makespin"));
        row.appendChild(stateSwitch(state, "this sector", (st) => setLayers([l], st)));
        if (source.openSector) {
          const open = iconButton(Icons.open, "Open: this sector in its own tab");
          open.addEventListener("click", (e) => {
            e.stopPropagation();
            source.openSector!(l.path).catch((err) => source.say?.(err instanceof Error ? err.message : String(err)));
          });
          row.appendChild(open);
        }
        out.push(row);
      }
    }
    ovList.replaceChildren(...out);
  };
  const startOverlaps = () => {
    if (overlapsStarted || !source.overlaps) return;
    overlapsStarted = true;
    renderOverlaps();
    source.overlaps().catch((e) => {
      overlapRun = { ...overlapRun, finished: true, error: e instanceof Error ? e.message : String(e) };
      renderOverlaps();
    });
  };
  ovTab.hidden = !source.overlaps;
  const MaxRows = 500;
  const fileName = (p: string) => p.slice(p.lastIndexOf("\\") + 1);
  const labelOf = (id: string) => {
    const w = drawnAs.get(id);
    if (w) return { kind: "mesh", name: fileName(w.mesh) };
    const mk = markerOf.get(id);
    return { kind: mk?.kind ?? "thing", name: mk?.class ?? "" };
  };
  /** "#12", or "exterior_-20_7_-1_0#12" for another sector's thing. */
  const entryOf = (id: string) => {
    const cut = id.lastIndexOf("#");
    const sector = id.slice(0, cut);
    return sector.toLowerCase() === source.sector.toLowerCase() ? id.slice(cut) : `${sector.slice(sector.lastIndexOf("\\") + 1).replace(/\.streamingsector$/i, "")}${id.slice(cut)}`;
  };
  const runAction = (action: "openInEdgemat" | "openMesh" | "addMesh", what: { mesh: string; appearance?: string }) => {
    source.action?.(action, what.mesh, what.appearance).catch((e) => source.say?.(e instanceof Error ? e.message : String(e)));
  };
  const rowFor = (id: string) => {
    const { kind, name } = labelOf(id);
    const what = drawnAs.get(id);
    const row = el("div", `selrow${id === picked ? " current" : ""}`);
    row.dataset.id = id;
    row.title = `${id}${what ? `\n${what.mesh}${what.appearance ? ` · ${what.appearance}` : ""}` : ""}\nClick: fly to it. Ctrl+click: take it out`;
    row.append(el("span", "dim selkind", kind), el("span", "selname", name), el("span", "dim mono selentry", entryOf(id)));
    const acts = el("span", "selacts");
    const rowButton = (icon: string, title: string, run: () => void) => {
      const b = iconButton(icon, title);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        run();
      });
      acts.appendChild(b);
    };
    rowButton(Icons.flyTo, "Fly To: the camera to it", () => {
      setCurrent(id);
      view.flyTo([id]);
    });
    const path = pathOf(id);
    if (path)
      rowButton(Icons.tree, "Show in Tree: its node data entry", () => {
        setCurrent(id);
        source.showInTree(path);
      });
    if (source.showInGame && gameEntryOf(id))
      rowButton(Icons.game, "Show in Game: EDGEbuilder's camera to it in the running game", () => {
        setCurrent(id);
        showInGame(id);
      });
    rowButton(Icons.only, what ? "Only: keep only the selected things that draw this mesh" : "Only: keep only this one in the selection", () => {
      const keep = what ? selection.filter((x) => drawnAs.get(x)?.mesh.toLowerCase() === what.mesh.toLowerCase()) : [id];
      select(keep, id);
    });
    if (what && source.action) {
      rowButton(Icons.mesh, "Open Mesh: the mesh in REDcode's mesh view", () => runAction("openMesh", what));
      rowButton(Icons.material, "Open in EDGEmat: the mesh on EDGEmat's Desk at this node's appearance", () => runAction("openInEdgemat", what));
      rowButton(Icons.add, "Add Mesh to Project: a change to it shows everywhere the game uses this mesh", () => runAction("addMesh", what));
    }
    rowButton(Icons.clear, "Take Out: of the selection", () => toggle(id));
    row.appendChild(acts);
    row.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey) return toggle(id);
      setCurrent(id);
      view.flyTo([id]);
    });
    return row;
  };
  const renderList = () => {
    refreshProps();
    const any = selection.length > 0;
    back.disabled = at <= 0;
    forward.disabled = at >= steps.length - 1;
    head.hidden = !any && back.disabled && forward.disabled;
    for (const b of [frameAll, isolate, copyAll, clearAll]) b.hidden = !any;
    empty.hidden = any;
    count.textContent = any ? `${selection.length.toLocaleString()} selected` : "";
    selTab.textContent = any ? `Selections (${selection.length.toLocaleString()})` : "Selections";
    if (!any) {
      addAll.hidden = true;
      rows.replaceChildren();
      return;
    }
    const sorted = [...selection].sort((a, b) => labelOf(a).name.localeCompare(labelOf(b).name) || a.localeCompare(b, undefined, { numeric: true }));
    const more = sorted.length - MaxRows;
    rows.replaceChildren(...sorted.slice(0, MaxRows).map(rowFor), ...(more > 0 ? [el("div", "dim selmore", `and ${more.toLocaleString()} more`)] : []));
    addAll.hidden = !source.addMeshes || !selection.some((id) => drawnAs.has(id));
    copyAll.hidden = !source.copy;
  };
  frameAll.addEventListener("click", () => view.flyTo(selection));
  clearAll.addEventListener("click", () => choose(null));
  isolate.addEventListener("click", () => {
    if (isolated) endIsolate();
    else if (selection.length) applyIsolate();
  });
  addAll.addEventListener("click", () => {
    const meshes = selection.map((id) => drawnAs.get(id)?.mesh).filter((x): x is string => !!x);
    source.addMeshes?.(meshes).catch((e) => source.say?.(e instanceof Error ? e.message : String(e)));
  });
  copyAll.addEventListener("click", () => {
    const text = selection.map((id) => `${id}\t${drawnAs.get(id)?.mesh ?? markerOf.get(id)?.class ?? ""}`).join("\n");
    source.copy?.(text).catch((e) => source.say?.(e instanceof Error ? e.message : String(e)));
  });

  renderList();

  // ---- boxes: Shift+drag on the screen, and the volume in the world ----
  const touching = () => touchingButton.classList.contains("on");
  view.onBoxSelect((r, e) => {
    const ids = view.idsInRect(r.x0, r.y0, r.x1, r.y1, { touching: touching() });
    select(e.ctrlKey || e.metaKey ? [...selection, ...ids] : ids, picked);
  });
  let volumeTimer: ReturnType<typeof setTimeout> | undefined;
  const volumeSelect = () => {
    const b = view.volume.box;
    if (b) select(view.idsInBox(b, { touching: touching() }), picked);
  };
  view.volume.onChange((b) => {
    if (!b) {
      volumeButton.classList.remove("on");
      hint.textContent = "";
      return;
    }
    if (!view.volume.drawing) hint.textContent = "";
    // At most ten selections a second while it is dragged.
    volumeTimer ??= setTimeout(() => {
      volumeTimer = undefined;
      volumeSelect();
    }, 100);
  });
  volumeButton.addEventListener("click", () => {
    if (volumeButton.classList.contains("on")) {
      view.volume.clear();
      return;
    }
    view.volume.start();
    volumeButton.classList.add("on");
    hint.textContent = "Drag on the ground for the volume's base, move the mouse for its height, and click. Esc stops.";
    canvas.focus();
  });
  touchingButton.addEventListener("click", () => {
    touchingButton.classList.toggle("on");
    volumeSelect();
  });

  // ---- the picked thing with its materials ----
  /** The placement drawn with its materials now, and what was made for it. */
  let shownReal: string | null = null;
  let realMade: { dispose(): void }[] = [];
  let renderToken = 0;
  const putBack = () => {
    if (shownReal) view.restoreMesh(shownReal);
    shownReal = null;
    for (const x of realMade) x.dispose();
    realMade = [];
  };
  const texture = async (b64png: string | undefined, colour: boolean) => {
    if (!b64png) return null;
    const bytes = Uint8Array.from(atob(b64png), (ch) => ch.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
    try {
      const t = await new THREE.TextureLoader().loadAsync(url);
      t.flipY = false; // the glTF UV convention
      t.wrapS = t.wrapT = THREE.RepeatWrapping; // the game repeats textures past 0 to 1
      if (colour) t.colorSpace = THREE.SRGBColorSpace;
      realMade.push(t);
      return t;
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  /** EDGEmat's maps on each part, by the material the appearance names for its submesh; the rest keep WolvenKit's. */
  const applyMaps = async (scene: THREE.Object3D, r: RenderedThing) => {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const made = new Map<string, THREE.Material>();
    for (const mesh of meshes) {
      const sub = /submesh_(\d+)/i.exec(mesh.name || mesh.parent?.name || "");
      const own = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const extras = (mesh.userData ?? {}) as { materialNames?: string[] };
      const name = (sub && r.chunkMaterials[Number(sub[1])]) || extras.materialNames?.[0] || own?.name || "";
      const maps = r.maps?.[name];
      if (!maps) continue;
      let m = made.get(name);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ map: await texture(maps.baseColor, true), normalMap: await texture(maps.normal, false), roughnessMap: await texture(maps.roughness, false), metalnessMap: await texture(maps.metalness, false), roughness: 1, metalness: maps.metalness ? 1 : 0, side: THREE.DoubleSide });
        made.set(name, m);
        realMade.push(m);
      }
      mesh.material = m;
    }
  };
  const showMaterials = async () => {
    const token = ++renderToken;
    const on = realButton.classList.contains("on");
    const what = picked ? drawnAs.get(picked) : undefined;
    if (shownReal !== picked || !on) putBack();
    realNote.textContent = "";
    if (!on || !what || !picked || !source.render) return;
    const id = picked;
    realNote.textContent = "Exporting its materials…";
    try {
      const r = await source.render(what.mesh, what.appearance);
      if (token !== renderToken) return;
      // Drawn again (EDGEmat changed it): what was made for the last drawing goes.
      putBack();
      await view.replaceMesh(id, b64(r.data), (scene) => applyMaps(scene, r));
      if (token !== renderToken) {
        if (picked !== id) view.restoreMesh(id);
        return;
      }
      shownReal = id;
      const rendered = Object.keys(r.maps ?? {});
      const approximate = Object.values(r.maps ?? {}).some((x) => x.fidelity !== "checked");
      const wanted = [...new Set(r.chunkMaterials.filter((x) => x))];
      const missing = wanted.filter((x) => !rendered.includes(x));
      const who = r.edgemat ? "EDGEmat" : "REDcode (EDGEmat's renderer)";
      realNote.textContent = rendered.length
        ? `Materials by ${who}${approximate ? ", approximate" : ""}${missing.length ? `; ${missing.length} not rendered` : ""}`
        : `No materials rendered${r.mapsError ? `: ${r.mapsError}` : ""}`;
      realNote.title = missing.length ? `Not rendered (nothing to show, or not readable): ${missing.join(", ")}` : "";
    } catch (e) {
      if (token === renderToken) realNote.textContent = `Could not draw its materials: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
  realButton.addEventListener("click", () => {
    realButton.classList.toggle("on");
    void showMaterials();
  });
  const act = (action: "openInEdgemat" | "openMesh" | "addMesh") => {
    const what = picked ? drawnAs.get(picked) : undefined;
    if (what) runAction(action, what);
  };
  openMesh.addEventListener("click", () => act("openMesh"));
  toEdgemat.addEventListener("click", () => act("openInEdgemat"));
  addMesh.addEventListener("click", () => act("addMesh"));

  // ---- By material: each mesh's material names, read once each while it is on ----
  const named = new Set<string>();
  let naming = false;
  const nameMeshes = async () => {
    if (naming || !source.meshInfo) return;
    naming = true;
    try {
      for (;;) {
        const todo = [...drawnMeshes].filter(([key]) => !named.has(key));
        if (!todo.length || colour.value !== "material") break;
        let i = 0;
        for (const [key, mesh] of todo) {
          if (colour.value !== "material") break;
          named.add(key);
          realNote.textContent = `Reading material names: ${++i} of ${todo.length}`;
          try {
            view.setMaterials(mesh, await meshInfo(mesh));
          } catch {
            // Drawn in its mesh's colour.
          }
        }
      }
    } finally {
      naming = false;
      if (realNote.textContent?.startsWith("Reading material names")) realNote.textContent = "";
    }
  };
  view.onPick((p, e) => {
    if (e.ctrlKey || e.metaKey) {
      if (p) toggle(p.id);
      return;
    }
    choose(p?.id ?? null);
  });
  toTree.addEventListener("click", () => {
    const path = picked ? pathOf(picked) : null;
    if (path) source.showInTree(path);
  });
  toGame.addEventListener("click", () => {
    if (picked) showInGame(picked);
  });
  fit.addEventListener("click", () => view.flyTo(picked ? [picked] : undefined));
  // The view's keys work wherever the view has the keyboard: the 3D view, the list, its buttons, the line under
  // it. A click anywhere in it gives it the keyboard; a text box keeps its own keys (Ctrl+A selects its text).
  container.tabIndex = -1;
  container.addEventListener("pointerdown", (e) => {
    const t = e.target as HTMLElement | null;
    if (t && !t.closest("input, textarea, select, button, [contenteditable]") && !container.contains(document.activeElement)) container.focus({ preventScroll: true });
  });
  container.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, select, [contenteditable]")) return;
    const k = e.key.toLowerCase();
    if (k === "f" && !e.ctrlKey && !e.altKey && !e.metaKey) view.flyTo(picked ? [picked] : undefined);
    if (k === "escape") {
      view.volume.clear();
      choose(null);
      endIsolate();
    }
    if (k === "a" && (e.ctrlKey || e.metaKey)) {
      // VS Code's webview hands every key to the workbench from the page's window, and its Select All then runs
      // execCommand("selectAll") in the page: stopped here, before the key reaches the window. The selection
      // guard is for a VS Code that listens earlier.
      e.preventDefault();
      e.stopPropagation();
      selectAllAt = performance.now();
      view.volume.clear();
      select(view.idsShown(), picked);
    }
  });
  // Double-click: pick the thing and fly close to it (the clicks before it picked it already).
  canvas.addEventListener("dblclick", (e) => {
    const p = view.pick(e.clientX, e.clientY);
    if (!p) return;
    if (selection.includes(p.id)) setCurrent(p.id);
    else choose(p.id);
    view.flyTo([p.id]);
  });

  let loaded = false;
  let framed = false;
  /** Meshes the page could not draw (the host exported them, three.js could not read them). */
  const failed: { id: string; why: string }[] = [];
  /** Shows the bar: undefined for a moving one (how long is not known yet), else how far, 0 to 1. */
  const busy = (part?: number) => {
    loadBar.hidden = false;
    loadBar.classList.toggle("busy", part === undefined);
    loadFill.style.width = part === undefined ? "" : `${Math.round(Math.max(0, Math.min(1, part)) * 100)}%`;
  };
  const idle = () => {
    loadBar.hidden = true;
    coarser.disabled = false;
    coarser.textContent = "Coarser levels";
  };
  const load = async (withCoarser: boolean) => {
    progress.textContent = withCoarser ? "Finding the coarser sectors over this one…" : "Reading the sector…";
    busy();
    if (withCoarser) {
      coarser.disabled = true;
      coarser.textContent = "Loading coarser levels…";
    }
    try {
      await source.load(withCoarser);
    } catch (e) {
      progress.textContent = `Could not load it: ${e instanceof Error ? e.message : String(e)}`;
      idle();
    }
  };
  coarser.addEventListener("click", () => {
    const on = !coarser.classList.contains("on");
    coarser.classList.toggle("on", on);
    void load(on);
  });
  culling.addEventListener("click", () => {
    const on = !culling.classList.contains("on");
    culling.classList.toggle("on", on);
    view.setOptions({ culling: on ? "streaming" : "none" });
  });
  markerButton.addEventListener("click", () => {
    const on = !markerButton.classList.contains("on");
    markerButton.classList.toggle("on", on);
    view.setOptions({ markers: on });
  });
  colour.addEventListener("change", () => {
    view.setOptions({ colourBy: colour.value as "mesh" | "material" });
    if (colour.value === "material") void nameMeshes();
  });

  // ---- scripts: the host's menu; while one runs, the button stops it ----
  let scriptRunning = false;
  /** The selection's node data entries in this sector, each once. */
  const selectedEntries = () => [
    ...new Set(
      selection
        .map((id) => pathOf(id))
        .filter((p): p is string => !!p)
        .map((p) => Number(p.slice("nodeData.Data.".length))),
    ),
  ];
  /** A node data entry's ids as drawn, by its id in any sector: itself, or each copy of an instanced mesh. */
  const idsOfId = (own: string) => {
    if (drawnAs.has(own) || markerOf.has(own)) return [own];
    const copies = [...drawnAs.keys()].filter((id) => id.startsWith(`${own}.`));
    return copies.length ? copies : [own];
  };
  const idsOfEntry = (n: number) => idsOfId(`${source.sector}#${n}`);
  /** The selection as node data entries by id, each once (an instanced mesh's copies are one entry). */
  const selectedIdsOfEntries = () => [...new Set(selection.map((id) => id.replace(/(#\d+)\.\d+$/, "$1")))];
  const showScript = (m: Extract<SectorMessage, { type: "sectorScript" }>) => {
    scriptRunning = m.state === "running";
    scriptsButton.classList.toggle("on", scriptRunning);
    if (scriptRunning) {
      const spin = el("span", "makespin");
      const count = m.total ? ` ${(m.done ?? 0).toLocaleString()} of ${m.total.toLocaleString()}` : "";
      scriptsButton.replaceChildren(spin, document.createTextNode(` Stop${count}`));
      scriptsButton.title = `Stop "${m.name}"`;
      scriptLine.textContent = m.note ?? `${m.name}…`;
      return;
    }
    scriptsButton.replaceChildren(document.createTextNode("Scripts"));
    scriptsButton.title = "Run a script on every node or on the selection: find nodes, select them, change values. New Script, Edit, Debug";
    scriptLine.textContent = m.line ?? "";
    scriptLine.title = m.line ?? "";
    if (m.state === "done" && m.selected) {
      const before = selection.length;
      const ids = m.selectedIds ? m.selectedIds.flatMap(idsOfId) : m.selected.flatMap(idsOfEntry);
      select(ids, ids[0] ?? null);
      // How the list changed, in rows (an instanced node is a row per copy it draws): a run that adds copies to a
      // selection already holding many could not be told apart from one that did nothing (the owner, 2026-11-24).
      const change = `selection ${before.toLocaleString()} → ${ids.length.toLocaleString()}`;
      scriptLine.textContent = `${m.line ?? ""} · ${change}`;
      scriptLine.title = scriptLine.textContent;
    }
  };
  scriptsButton.addEventListener("click", () => {
    if (scriptRunning) {
      source.stopScript?.().catch((e) => source.say?.(e instanceof Error ? e.message : String(e)));
      return;
    }
    source.scripts?.(selectedEntries(), selectedIdsOfEntries()).catch((e) => source.say?.(e instanceof Error ? e.message : String(e)));
  });

  const pendingSelect = source.select;
  const selectEntry = (entry: number | number[]) => {
    // An instanced mesh's node is drawn as its copies: its first copy stands for it.
    const ids = (Array.isArray(entry) ? entry : [entry]).map((n) => {
      const own = `${source.sector}#${n}`;
      return !drawnAs.has(own) && drawnAs.has(`${own}.0`) ? `${own}.0` : own;
    });
    select(ids, ids[0]);
    view.frame(ids);
  };

  void load(false);

  return {
    refreshProps,
    receive(m) {
      switch (m.type) {
        case "sectorMesh":
          for (const p of m.placements) drawnAs.set(p.id, { mesh: m.mesh, ...(p.appearance ? { appearance: p.appearance } : {}) });
          view.addMesh(m.mesh, b64(m.data), m.placements).then(
            () => {
              drawnMeshes.set(m.mesh.toLowerCase(), m.mesh);
              if (colour.value === "material") {
                // Names already read come at once; the rest join the reading.
                if (named.has(m.mesh.toLowerCase())) void meshInfo(m.mesh).then((list) => view.setMaterials(m.mesh, list), () => undefined);
                else void nameMeshes();
              }
              // The first meshes frame the view once, so it does not jump while the rest arrive.
              if (!framed) {
                framed = true;
                view.frame();
              }
            },
            (e) => failed.push({ id: m.mesh, why: e instanceof Error ? e.message : String(e) }),
          );
          return;
        case "sectorMarkers":
          // The opened sector's only: the coarser ones hold tens of thousands, far apart.
          if (m.sector.toLowerCase() !== source.sector.toLowerCase()) return;
          for (const mk of m.markers) markerOf.set(mk.id, mk);
          view.addMarkers(m.markers);
          if (!framed && m.markers.length) {
            framed = true;
            view.frame();
          }
          return;
        case "sectorUnload": {
          view.unloadSector(m.sector);
          const prefix = `${m.sector.toLowerCase()}#`;
          for (const id of [...drawnAs.keys()]) if (id.toLowerCase().startsWith(prefix)) drawnAs.delete(id);
          for (const id of [...markerOf.keys()]) if (id.toLowerCase().startsWith(prefix)) markerOf.delete(id);
          if (selection.some((id) => id.toLowerCase().startsWith(prefix))) select(selection.filter((id) => !id.toLowerCase().startsWith(prefix)), picked);
          if (shownReal?.toLowerCase().startsWith(prefix)) {
            shownReal = null;
            for (const x of realMade) x.dispose();
            realMade = [];
          }
          return;
        }
        case "sectorProgress":
          if (m.phase === "reading") {
            progress.textContent = `Reading sectors: ${m.done.toLocaleString()} of ${m.total.toLocaleString()}`;
            busy(m.total ? m.done / m.total : undefined);
          } else if (m.done < m.total) {
            progress.textContent = `Exporting meshes: ${m.done.toLocaleString()} of ${m.total.toLocaleString()}${m.etaMs ? `, about ${seconds(m.etaMs)} left` : ""}`;
            busy(m.done / m.total);
          } else progress.textContent = "";
          progress.title = m.current ?? "";
          return;
        case "sectorScript":
          showScript(m);
          return;
        case "sectorOverlapLayer":
          if (!layerOf(m.layer.path)) layers.push(m.layer);
          renderOverlaps();
          return;
        case "sectorOverlapProgress":
          overlapRun = { ...overlapRun, done: m.done, total: m.total };
          renderOverlaps();
          return;
        case "sectorOverlapDone":
          overlapRun = { ...overlapRun, finished: true, error: m.error };
          renderOverlaps();
          return;
        case "sectorDone":
          idle();
          if (loadingLayers.size) {
            loadingLayers.clear();
            renderOverlaps();
          }
          {
            const all = [...m.skipped, ...failed];
            progress.textContent = all.length ? `${all.length.toLocaleString()} thing(s) could not be drawn` : "";
            progress.title = all.slice(0, 20).map((s) => `${s.id}: ${s.why}`).join("\n");
          }
          if (!loaded) {
            loaded = true;
            if (pendingSelect !== undefined) selectEntry(pendingSelect);
            else view.frame();
          }
          showStats();
          return;
      }
    },
    selectEntry,
    dispose() {
      clearInterval(statsTimer);
      if (volumeTimer) clearTimeout(volumeTimer);
      renderToken++;
      for (const x of realMade) x.dispose();
      view.dispose();
    },
    refreshMaterials(change) {
      const what = picked ? drawnAs.get(picked) : undefined;
      if (!what || !realButton.classList.contains("on")) return;
      const changed = change?.mesh?.toLowerCase();
      const mesh = what.mesh.toLowerCase();
      if (!changed || changed === mesh || changed.endsWith(`\\${mesh}`)) void showMaterials();
    },
  };
}
