// The sector view (docs/design/sector-view.md): a .streamingsector in 3D, read-only, in the CR2W editor's
// sector mode, drawn by @edgemodders/world-view's page half. The host streams the meshes over as they are
// exported (sectorMesh), with markers for things with no mesh; a click on a thing selects its node data
// entry, which the Properties view follows, and Show in Tree goes to it. Materials (docs/design/sector-materials.md):
// By material colours each copy by the materials its appearance names, and the Materials switch draws the
// picked thing with its own materials, EDGEmat's when it is installed.

import * as THREE from "three";
import { createWorldView, type PageAppearance, type PageMarker, type PagePlacement, type WorldView } from "../../../packages/world-view/src/page";
import { cssColour, el, lightControls, type LightSettings } from "./viewerKit";

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
  /** The entry to select at first (REDcodeApi.openSector's select). */
  select?: number;
  /** A drawn mesh's appearances, each with the material it names per submesh. */
  meshInfo?(mesh: string): Promise<PageAppearance[]>;
  /** A mesh with its materials, for the picked thing: the .glb as base64, and EDGEmat's maps by material name when it is there. */
  render?(mesh: string, appearance?: string): Promise<RenderedThing>;
  /** The picked mesh's buttons. */
  action?(action: "openInEdgemat" | "openMesh" | "addMesh", mesh: string, appearance?: string): Promise<unknown>;
  /** The light kept for the window (REDcode issue #31), and where a change goes to be kept. */
  light?: Partial<LightSettings>;
  onLight?: (settings: LightSettings) => void;
  say?(message: string): void;
}

export interface SectorView {
  receive(m: SectorMessage): void;
  /** Selects a node data entry of this sector, and frames it. */
  selectEntry(entry: number): void;
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
  container.append(bar, stage, info);

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
  const stats = el("span", "dim mono", "");
  bar.append(fit, coarser, culling, markerButton, colour, realButton, ...lightControls(view.lighting, source.onLight), stats);
  const progress = el("span", "dim", "Reading the sector…");
  const pickedLine = el("span", "mono", "");
  const pickedMeta = el("span", "dim mono", "");
  const realNote = el("span", "dim", "");
  const toTree = button("Show in Tree", "Go to this node data entry in the tree");
  toTree.hidden = true;
  const openMesh = button("Open Mesh", "Open the mesh in REDcode's mesh view");
  const toEdgemat = button("Open in EDGEmat", "Put the mesh on EDGEmat's Desk at this node's appearance, to choose or make another material");
  const addMesh = button("Add Mesh to Project", "Copy the mesh into the project. A change to it shows everywhere the game uses this mesh, not only here");
  const meshButtons = [openMesh, toEdgemat, addMesh];
  for (const b of meshButtons) b.hidden = true;
  info.append(progress, pickedLine, pickedMeta, toTree, ...meshButtons, realNote);

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

  const choose = (id: string | null) => {
    picked = id;
    view.highlight(id ? [id] : []);
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
    if (!what || !source.action) return;
    source.action(action, what.mesh, what.appearance).catch((e) => source.say?.(e instanceof Error ? e.message : String(e)));
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
  view.onPick((p) => choose(p?.id ?? null));
  toTree.addEventListener("click", () => {
    const path = picked ? pathOf(picked) : null;
    if (path) source.showInTree(path);
  });
  fit.addEventListener("click", () => view.frame(picked ? [picked] : undefined));

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
  const selectEntry = (entry: number) => {
    // An instanced mesh's node is drawn as its copies: its first copy stands for it.
    const own = `${source.sector}#${entry}`;
    const id = !drawnAs.has(own) && drawnAs.has(`${own}.0`) ? `${own}.0` : own;
    choose(id);
    view.frame([id]);
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
