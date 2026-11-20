// The sector view (docs/design/sector-view.md): a .streamingsector in 3D, read-only, in the CR2W editor's
// sector mode, drawn by @edgemodders/world-view's page half. The host streams the meshes over as they are
// exported (sectorMesh), with markers for things with no mesh; a click on a thing selects its node data
// entry, which the Properties view follows, and Show in Tree goes to it.

import { createWorldView, type PageMarker, type PagePlacement, type WorldView } from "../../../packages/world-view/src/page";
import { cssColour, el, lightControls, type LightSettings } from "./viewerKit";

/** What the host sends while a sector loads. */
export type SectorMessage =
  | { type: "sectorMesh"; mesh: string; data: string; placements: PagePlacement[] }
  | { type: "sectorMarkers"; sector: string; markers: PageMarker[] }
  | { type: "sectorUnload"; sector: string }
  | { type: "sectorProgress"; done: number; total: number; etaMs?: number; current?: string }
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
  refreshMaterials(): void;
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
  const stats = el("span", "dim mono", "");
  bar.append(fit, coarser, culling, markerButton, colour, ...lightControls(view.lighting, source.onLight), stats);
  const progress = el("span", "dim", "Reading the sector…");
  const pickedLine = el("span", "mono", "");
  const toTree = button("Show in Tree", "Go to this node data entry in the tree");
  toTree.hidden = true;
  info.append(progress, pickedLine, toTree);

  let picked: string | null = null;
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
    source.picked(path);
  };
  view.onPick((p) => choose(p?.id ?? null));
  toTree.addEventListener("click", () => {
    const path = picked ? pathOf(picked) : null;
    if (path) source.showInTree(path);
  });
  fit.addEventListener("click", () => view.frame(picked ? [picked] : undefined));

  let loaded = false;
  let framed = false;
  const load = async (withCoarser: boolean) => {
    progress.textContent = withCoarser ? "Reading the coarser sectors over this one…" : "Reading the sector…";
    try {
      await source.load(withCoarser);
    } catch (e) {
      progress.textContent = `Could not load it: ${e instanceof Error ? e.message : String(e)}`;
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
  colour.addEventListener("change", () => view.setOptions({ colourBy: colour.value as "mesh" | "material" }));

  const pendingSelect = source.select;
  const selectEntry = (entry: number) => {
    const id = `${source.sector}#${entry}`;
    choose(id);
    view.frame([id]);
  };

  void load(false);

  return {
    receive(m) {
      switch (m.type) {
        case "sectorMesh":
          void view.addMesh(m.mesh, b64(m.data), m.placements).then(() => {
            // The first meshes frame the view once, so it does not jump while the rest arrive.
            if (!framed) {
              framed = true;
              view.frame();
            }
          });
          return;
        case "sectorMarkers":
          // The opened sector's only: the coarser ones hold tens of thousands, far apart.
          if (m.sector.toLowerCase() !== source.sector.toLowerCase()) return;
          view.addMarkers(m.markers);
          if (!framed && m.markers.length) {
            framed = true;
            view.frame();
          }
          return;
        case "sectorUnload":
          view.unloadSector(m.sector);
          return;
        case "sectorProgress":
          progress.textContent = m.done < m.total ? `Exporting meshes: ${m.done.toLocaleString()} of ${m.total.toLocaleString()}${m.etaMs ? `, about ${seconds(m.etaMs)} left` : ""}` : "";
          progress.title = m.current ?? "";
          return;
        case "sectorDone":
          progress.textContent = m.skipped.length ? `${m.skipped.length.toLocaleString()} thing(s) could not be drawn` : "";
          progress.title = m.skipped.slice(0, 20).map((s) => `${s.id}: ${s.why}`).join("\n");
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
      view.dispose();
    },
    refreshMaterials: () => undefined,
  };
}
