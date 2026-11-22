// The sector view (docs/design/sector-view.md): a .streamingsector in 3D, read-only, in the CR2W editor's
// sector mode, drawn by @edgemodders/world-view's page half. The host streams the meshes over as they are
// exported (sectorMesh), with markers for things with no mesh; a click on a thing selects its node data
// entry, which the Properties view follows, and Show in Tree goes to it. Materials (docs/design/sector-materials.md):
// By material colours each copy by the materials its appearance names, and the Materials switch draws the
// picked thing with its own materials, EDGEmat's when it is installed. Selection (docs/design/sector-selection.md):
// Ctrl+click, Shift+drag and Volume select many, listed on the right, the current one followed by the panel.

import * as THREE from "three";
import { createWorldView, type CameraMove, type PageAppearance, type PageMarker, type PagePlacement, type WorldView } from "../../../packages/world-view/src/page";
import { cssColour, el, lightControls, sideSplitter, type LightSettings } from "./viewerKit";

/** What the host sends while a sector loads. */
export type SectorMessage =
  | { type: "sectorMesh"; mesh: string; data: string; placements: PagePlacement[] }
  | { type: "sectorMarkers"; sector: string; markers: PageMarker[] }
  | { type: "sectorUnload"; sector: string }
  | { type: "sectorProgress"; phase?: "reading" | "exporting"; done: number; total: number; etaMs?: number; current?: string }
  | { type: "sectorDone"; skipped: { id: string; why: string }[]; sectors: string[] };

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
}

export interface SectorView {
  receive(m: SectorMessage): void;
  /** Selects a node data entry of this sector, or several, and frames them. */
  selectEntry(entry: number | number[]): void;
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
  const stats = el("span", "dim mono", "");
  bar.append(fit, coarser, culling, markerButton, colour, realButton, volumeButton, touchingButton, ...lightControls(view.lighting, source.onLight), stats);
  const progress = el("span", "dim", "Reading the sector…");
  const pickedLine = el("span", "mono", "");
  const pickedMeta = el("span", "dim mono", "");
  const realNote = el("span", "dim", "");
  const hint = el("span", "dim", "");
  const toTree = button("Show in Tree", "Go to this node data entry in the tree");
  toTree.hidden = true;
  const openMesh = button("Open Mesh", "Open the mesh in REDcode's mesh view");
  const toEdgemat = button("Open in EDGEmat", "Put the mesh on EDGEmat's Desk at this node's appearance, to choose or make another material");
  const addMesh = button("Add Mesh to Project", "Copy the mesh into the project. A change to it shows everywhere the game uses this mesh, not only here");
  const meshButtons = [openMesh, toEdgemat, addMesh];
  for (const b of meshButtons) b.hidden = true;
  info.append(progress, hint, pickedLine, pickedMeta, toTree, ...meshButtons, realNote);

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

  /** The panel under the view, Show in Tree, the Properties view and Materials: all on the current thing. */
  const showCurrent = () => {
    const id = picked;
    const path = id ? pathOf(id) : null;
    toTree.hidden = !path;
    pickedLine.textContent = id ? `${id.slice(id.lastIndexOf("\\") + 1)}${path ? "" : "  (a coarser sector's)"}` : "";
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
  const frameAll = button("Frame All", "Fly to all of them");
  const isolate = button("Isolate", "Ghost everything else, to see these alone; again to show it all");
  const addAll = button("Add Meshes to Project", "Copy each of their meshes into the project once. A change to one shows everywhere the game uses it");
  const copyAll = button("Copy", "Copy their ids and meshes, one per line, for an issue or an assistant");
  const clearAll = button("Clear", "Select nothing (Esc)");
  head.append(count, frameAll, isolate, addAll, copyAll, clearAll);
  const rows = el("div", "selrows");
  const empty = el("div", "dim selempty", "Nothing selected. Click a thing to select it, Ctrl+click to add or take out, Shift+drag for a box on the screen, or Volume for a box in the world.");
  side.append(head, rows, empty);
  const MaxRows = 500;
  const fileName = (p: string) => p.slice(p.lastIndexOf("\\") + 1);
  const labelOf = (id: string) => {
    const w = drawnAs.get(id);
    if (w) return { kind: "mesh", name: fileName(w.mesh) };
    const mk = markerOf.get(id);
    return { kind: mk?.kind ?? "thing", name: mk?.class ?? "" };
  };
  const entryOf = (id: string) => id.slice(id.lastIndexOf("#"));
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
    const rowButton = (label: string, title: string, run: () => void) => {
      const b = button(label, title);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        run();
      });
      acts.appendChild(b);
    };
    rowButton("Fly To", "Fly the camera to it", () => {
      setCurrent(id);
      view.flyTo([id]);
    });
    const path = pathOf(id);
    if (path)
      rowButton("Tree", "Show in Tree: its node data entry", () => {
        setCurrent(id);
        source.showInTree(path);
      });
    if (what && source.action) {
      rowButton("Mesh", "Open Mesh: the mesh in REDcode's mesh view", () => runAction("openMesh", what));
      rowButton("EDGEmat", "Open in EDGEmat: the mesh on EDGEmat's Desk at this node's appearance", () => runAction("openInEdgemat", what));
      rowButton("Add", "Add Mesh to Project: a change to it shows everywhere the game uses this mesh", () => runAction("addMesh", what));
    }
    rowButton("×", "Take it out of the selection", () => toggle(id));
    row.appendChild(acts);
    row.addEventListener("click", (e) => {
      if (e.ctrlKey || e.metaKey) return toggle(id);
      setCurrent(id);
      view.flyTo([id]);
    });
    return row;
  };
  const renderList = () => {
    const any = selection.length > 0;
    head.hidden = !any;
    empty.hidden = any;
    if (!any) {
      rows.replaceChildren();
      return;
    }
    count.textContent = `${selection.length.toLocaleString()} selected`;
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
        case "sectorDone":
          idle();
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
