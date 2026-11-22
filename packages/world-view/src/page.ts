// @edgemodders/world-view, the page half (the API agreed with EDGEbuilder in EDGEbuilder #8): the game's
// things in a three.js scene. Each unique mesh is drawn as one InstancedMesh per GLB primitive with all its
// placements; things with no mesh are markers; the caller's own objects go in the same scene. Picking is a
// ray against each placement's box, so it stays fast with thousands of copies. Browser only: a webview, a
// REDnode overlay page or any page with WebGL.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createStage, type LightSettings, type Stage } from "./stage";
import { createVolume, type Volume } from "./volume";

export type { LightSettings } from "./stage";
export type { Volume } from "./volume";

/** As the host half sends them. */
export interface PagePlacement {
  id: string;
  matrix: number[];
  range?: number;
  /** The node's mesh appearance: which material each submesh shows, once setMaterials has named them. */
  appearance?: string;
}

/** A mesh appearance as the host half's meshMaterials reads it: the material named per submesh index. */
export interface PageAppearance {
  name: string;
  chunkMaterials: string[];
}

export interface PageMarker {
  id: string;
  kind: string;
  class: string;
  resource?: string;
  matrix: number[];
  box?: { min: number[]; max: number[] };
  range?: number;
}

export interface Pose {
  position: number[];
  target: number[];
}

export interface WorldViewOptions {
  /** Each mesh in its own colour, or each material name in its own. */
  colourBy?: "mesh" | "material";
  /** "streaming": a placement shows only within its streaming distance of the camera, as in the game. "none": all of them. */
  culling?: "streaming" | "none";
  background?: THREE.ColorRepresentation;
  /** Draw the markers (things with no mesh). On at first. */
  markers?: boolean;
  light?: Partial<LightSettings>;
  /** The selection colour. */
  accent?: THREE.ColorRepresentation;
}

export interface Picked {
  id: string;
  point: THREE.Vector3;
}

export interface WorldView {
  addMesh(mesh: string, glb: ArrayBuffer, placements: PagePlacement[]): Promise<void>;
  addMarkers(markers: PageMarker[]): void;
  /** Takes out every id under "<sector>#". */
  unloadSector(path: string): void;
  addObject(id: string, object: THREE.Object3D): void;
  removeObject(id: string): void;
  /**
   * Draws a placement with another .glb (a textured mesh, an entity) instead of the plain mesh. prepare, when
   * given, sees the loaded scene before it is drawn, such as to set its materials.
   */
  replaceMesh(id: string, glb: ArrayBuffer, prepare?: (scene: THREE.Object3D) => void | Promise<void>): Promise<void>;
  /** Draws a placement replaced by replaceMesh with its plain mesh again. */
  restoreMesh(id: string): void;
  /** A mesh's appearances, for colouring by material: each placement's parts by the materials its appearance names. */
  setMaterials(mesh: string, appearances: PageAppearance[]): void;
  setHidden(ids: string[], how: "hidden" | "ghost" | "shown"): void;
  /** Draws these in the selection colour; with current, that one in it and the rest paler. */
  highlight(ids: string[], current?: string | null): void;
  /**
   * What a box on the screen takes (client coordinates): each shown thing whose middle is inside it, at any
   * depth, or with touching, whose box reaches into it. Hidden things are left out; ghosted ones are in.
   */
  idsInRect(x0: number, y0: number, x1: number, y1: number, options?: { touching?: boolean }): string[];
  /** What a box in the world takes: each shown thing whose middle is in it, or with touching, whose box touches it. */
  idsInBox(box: THREE.Box3, options?: { touching?: boolean }): string[];
  /** Every shown thing, for a Select All. */
  idsShown(): string[];
  /** Shift+drag on the canvas draws a box on the screen; this hears it when the button comes up (with the event, for Ctrl). */
  onBoxSelect(cb: (rect: { x0: number; y0: number; x1: number; y1: number }, event: PointerEvent) => void): () => void;
  /** The volume tool: a box in the world to select with. */
  readonly volume: Volume;
  pick(x: number, y: number): Picked | null;
  onPick(cb: (picked: Picked | null, event: PointerEvent) => void): () => void;
  onPointer(cb: (type: "down" | "move" | "up", event: PointerEvent, id: string | null) => void): () => void;
  toCanvas(world: THREE.Vector3): [number, number];
  rayFrom(x: number, y: number): { origin: THREE.Vector3; direction: THREE.Vector3 };
  /** The three.js camera, for a gizmo, with its pose (where it is and what it orbits) to read and set. */
  readonly camera: WorldCamera;
  frame(ids?: string[]): void;
  /** frame, with the camera gliding there. from: look from above, or from the side the view starts on; else from where it is. */
  flyTo(ids?: string[], from?: "top" | "start"): void;
  /** A camera move held on or off, for on-screen buttons; fast and slow as Shift and Ctrl on the keys. */
  hold(move: CameraMove, on: boolean, how?: { fast?: boolean; slow?: boolean }): void;
  /** The fly speed's multiplier, 1 at first; the wheel changes it while the right button is held. */
  flySpeed: number;
  onFlySpeed(cb: (speed: number) => void): () => void;
  setOptions(options: Partial<WorldViewOptions>): void;
  /** How many placements, markers and draws are on screen now, for a status line. */
  stats(): { meshes: number; placements: number; shown: number; markers: number; draws: number };
  readonly lighting: Stage;
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  dispose(): void;
}

/**
 * The camera's moves. forward and back fly where the camera looks; left and right strafe; up and down go up
 * and down in the world; panUp and panDown move along the screen's up; zoomIn and zoomOut go closer to and
 * further from what it orbits; orbitLeft and orbitRight turn round it.
 */
export type CameraMove = "forward" | "back" | "left" | "right" | "up" | "down" | "panUp" | "panDown" | "zoomIn" | "zoomOut" | "orbitLeft" | "orbitRight";

export type WorldCamera = THREE.PerspectiveCamera & { readonly pose: Pose; setPose(pose: Pose): void };

interface MeshRecord {
  key: string;
  name: string;
  /** The GLB's primitives, each baked into the mesh's own space. */
  parts: { geometry: THREE.BufferGeometry; material: string; submesh: number }[];
  /** From setMaterials: the material per submesh, by appearance name in lower case; first is the first appearance's. */
  materials?: { byName: Map<string, string[]>; first: string[] };
  box: THREE.Box3;
  placements: PagePlacement[];
  matrices: THREE.Matrix4[];
  boxes: THREE.Box3[];
  drawn: THREE.InstancedMesh[];
  /** Which placement each instance slot shows. */
  slots: number[];
}

interface MarkerRecord {
  marker: PageMarker;
  matrix: THREE.Matrix4;
  box: THREE.Box3;
}

const MarkerColours: Record<string, number> = { entity: 0xffb347, decal: 0x9ab8ff, light: 0xffe066, collision: 0x55606f, sound: 0x7cfc9a, area: 0xc39bff, other: 0x8a94a6 };

/**
 * A stable colour for a name. Hue, saturation and lightness each come from their own bits of the hash, so
 * names whose hues are close still differ.
 */
export function colourFor(name: string): THREE.Color {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  h >>>= 0;
  const hue = (h % 360) / 360;
  const sat = 0.3 + ((h >>> 9) % 8) * 0.05;
  const light = 0.36 + ((h >>> 13) % 6) * 0.04;
  return new THREE.Color().setHSL(hue, sat, light);
}

const sectorOf = (id: string) => id.slice(0, id.lastIndexOf("#"));

export function createWorldView(canvas: HTMLCanvasElement, options: WorldViewOptions = {}): WorldView {
  let opts: Required<Pick<WorldViewOptions, "colourBy" | "culling" | "markers">> & WorldViewOptions = { colourBy: "mesh", culling: "streaming", markers: true, ...options } as Required<Pick<WorldViewOptions, "colourBy" | "culling" | "markers">> & WorldViewOptions;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.background ?? 0x0d1017);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20000);
  camera.position.set(30, 30, 30);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.screenSpacePanning = true;
  // As EDGEbuilder's free camera: the left button orbits (Shift or Ctrl with it pans), the middle pans, the
  // right looks round and flies with the keys (below), and the wheel goes towards the cursor.
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: null };
  controls.zoomToCursor = true;
  const stage = createStage(renderer, scene, options.light);
  const accent = new THREE.Color(options.accent ?? 0x19f3ff);
  /** The rest of a selection, beside its current one. */
  const paleAccent = accent.clone().lerp(new THREE.Color(1, 1, 1), 0.55);
  const white = new THREE.Color(1, 1, 1);
  const loader = new GLTFLoader();

  const world = new THREE.Group();
  scene.add(world);
  const records = new Map<string, MeshRecord>();
  const markers = new Map<string, MarkerRecord>();
  const objects = new Map<string, THREE.Object3D>();
  const replaced = new Map<string, THREE.Object3D>();
  const hidden = new Set<string>();
  const ghosted = new Set<string>();
  let highlighted = new Set<string>();
  let current: string | null = null;
  const highlightColour = (id: string) => (current === null || id === current ? accent : paleAccent);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  let markerMeshes: THREE.InstancedMesh[] = [];
  let markerSlots: string[][] = [];
  const ghostGroup = new THREE.Group();
  scene.add(ghostGroup);

  /** Coloured by material once the mesh's names are known: then each copy's colour is its instance colour. */
  const byMaterial = (record: MeshRecord) => opts.colourBy === "material" && !!record.materials;
  const materialFor = (record: MeshRecord) => {
    const name = byMaterial(record) ? "white" : `r:${record.key}`;
    let m = materials.get(name);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: name === "white" ? 0xffffff : colourFor(name), roughness: 0.8, metalness: 0 });
      materials.set(name, m);
    }
    return m;
  };
  const materialColours = new Map<string, THREE.Color>();
  /** A copy's colour for one part: the selection's, or (by material) its material's, or white over the mesh's colour. */
  const copyColour = (record: MeshRecord, part: MeshRecord["parts"][number], placement: PagePlacement) => {
    if (highlighted.has(placement.id)) return highlightColour(placement.id);
    if (!byMaterial(record)) return white;
    const m = record.materials!;
    const names = (placement.appearance && m.byName.get(placement.appearance.toLowerCase())) || m.first;
    const name = names[part.submesh] || part.material;
    let c = materialColours.get(name);
    if (!c) materialColours.set(name, (c = colourFor(`m:${name}`)));
    return c;
  };

  // ---- drawing the placements ----
  const camPos = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const visible = (record: MeshRecord, i: number) => {
    const p = record.placements[i];
    if (hidden.has(p.id) || ghosted.has(p.id) || replaced.has(p.id)) return false;
    if (opts.culling !== "streaming" || p.range === undefined || p.range === null) return true;
    record.boxes[i].getCenter(centre);
    return centre.distanceTo(camPos) <= p.range;
  };

  /** Rebuilds a mesh's instanced draws for the placements that show now. */
  const redraw = (record: MeshRecord) => {
    for (const d of record.drawn) {
      world.remove(d);
      d.dispose();
    }
    record.drawn = [];
    record.slots = [];
    for (let i = 0; i < record.placements.length; i++) if (visible(record, i)) record.slots.push(i);
    if (!record.slots.length) return;
    for (const part of record.parts) {
      const im = new THREE.InstancedMesh(part.geometry, materialFor(record), record.slots.length);
      record.slots.forEach((pi, slot) => {
        im.setMatrixAt(slot, record.matrices[pi]);
        im.setColorAt(slot, copyColour(record, part, record.placements[pi]));
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      im.userData.record = record.key;
      world.add(im);
      record.drawn.push(im);
    }
  };

  const redrawAll = () => {
    for (const r of records.values()) redraw(r);
    drawMarkers();
  };

  const drawMarkers = () => {
    for (const m of markerMeshes) {
      world.remove(m);
      m.dispose();
    }
    markerMeshes = [];
    markerSlots = [];
    if (opts.markers === false) return;
    const byKind = new Map<string, MarkerRecord[]>();
    for (const r of markers.values()) {
      const id = r.marker.id;
      if (hidden.has(id) || ghosted.has(id)) continue;
      if (opts.culling === "streaming" && r.marker.range !== undefined && r.box.getCenter(centre).distanceTo(camPos) > r.marker.range) continue;
      const list = byKind.get(r.marker.kind) ?? [];
      list.push(r);
      byKind.set(r.marker.kind, list);
    }
    const unit = new THREE.BoxGeometry(1, 1, 1);
    for (const [kind, list] of byKind) {
      const material = new THREE.MeshBasicMaterial({ color: MarkerColours[kind] ?? MarkerColours.other, wireframe: true, transparent: true, opacity: 0.55 });
      const im = new THREE.InstancedMesh(unit, material, list.length);
      const m = new THREE.Matrix4();
      list.forEach((r, slot) => {
        const size = r.box.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.05, 0.05, 0.05));
        m.compose(r.box.getCenter(new THREE.Vector3()), new THREE.Quaternion(), size);
        im.setMatrixAt(slot, m);
        im.setColorAt(slot, highlighted.has(r.marker.id) ? highlightColour(r.marker.id) : white);
      });
      im.frustumCulled = false;
      world.add(im);
      markerMeshes.push(im);
      markerSlots.push(list.map((r) => r.marker.id));
    }
  };

  const drawGhosts = () => {
    for (const c of [...ghostGroup.children]) {
      ghostGroup.remove(c);
      (c as THREE.Box3Helper).dispose?.();
    }
    for (const id of ghosted) {
      const box = boxOf(id);
      if (box) ghostGroup.add(new THREE.Box3Helper(box, 0xff6a6a));
    }
  };

  /** The world box of an id: a placement's, a marker's or an object's. */
  const boxOf = (id: string): THREE.Box3 | undefined => {
    for (const r of records.values()) {
      const i = r.placements.findIndex((p) => p.id === id);
      if (i >= 0) return r.boxes[i].clone();
    }
    const m = markers.get(id);
    if (m) return m.box.clone();
    const o = objects.get(id) ?? replaced.get(id);
    return o ? new THREE.Box3().setFromObject(o) : undefined;
  };

  // ---- culling as the camera moves ----
  let culledAt = new THREE.Vector3(Infinity, 0, 0);
  const cull = () => {
    if (opts.culling !== "streaming") return;
    camera.getWorldPosition(camPos);
    if (camPos.distanceTo(culledAt) < 2) return;
    culledAt = camPos.clone();
    redrawAll();
  };

  // ---- picking ----
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const rayFrom = (x: number, y: number) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return { origin: raycaster.ray.origin.clone(), direction: raycaster.ray.direction.clone() };
  };
  const hit = new THREE.Vector3();
  const pick = (x: number, y: number): Picked | null => {
    rayFrom(x, y);
    const ray = raycaster.ray;
    let best: Picked | null = null;
    let bestD = Infinity;
    const consider = (id: string, box: THREE.Box3) => {
      if (!ray.intersectBox(box, hit)) return;
      const d = hit.distanceTo(ray.origin);
      // A box inside another wins over it: a small thing on a big one.
      if (d < bestD || (best && d - bestD < 0.5 && box.containsPoint(best.point))) {
        bestD = d;
        best = { id, point: hit.clone() };
      }
    };
    for (const r of records.values()) for (const i of r.slots) consider(r.placements[i].id, r.boxes[i]);
    markerSlots.forEach((ids) => ids.forEach((id) => consider(id, markers.get(id)!.box)));
    for (const [id, o] of [...objects, ...replaced]) {
      const hits = raycaster.intersectObject(o, true);
      if (hits[0] && hits[0].distance < bestD) {
        bestD = hits[0].distance;
        best = { id, point: hits[0].point.clone() };
      }
    }
    return best;
  };

  const pickListeners = new Set<(p: Picked | null, e: PointerEvent) => void>();
  const pointerListeners = new Set<(t: "down" | "move" | "up", e: PointerEvent, id: string | null) => void>();
  let downAt: { x: number; y: number } | null = null;
  /** The right button held: the camera turns where it stands, and the wheel sets the fly speed. */
  let looking: { pointer: number; x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    glide = null;
    if (e.button === 2) {
      looking = { pointer: e.pointerId, x: e.clientX, y: e.clientY };
      controls.enableZoom = false;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // No such pointer (a scripted event): the moves still come while the cursor is over the canvas.
      }
    }
    // Any button gives the view the keyboard (W A S D, and the caller's Ctrl+A, F and Esc).
    canvas.focus({ preventScroll: true });
    if (e.button === 0) downAt = { x: e.clientX, y: e.clientY };
    if (pointerListeners.size) {
      const p = pick(e.clientX, e.clientY);
      for (const l of pointerListeners) l("down", e, p?.id ?? null);
    }
  };
  const onMove = (e: PointerEvent) => {
    if (looking && e.pointerId === looking.pointer) {
      look(e.clientX - looking.x, e.clientY - looking.y);
      looking.x = e.clientX;
      looking.y = e.clientY;
    }
    if (!pointerListeners.size) return;
    const p = pick(e.clientX, e.clientY);
    for (const l of pointerListeners) l("move", e, p?.id ?? null);
  };
  const onUp = (e: PointerEvent) => {
    if (looking && e.pointerId === looking.pointer && e.button === 2) {
      looking = null;
      controls.enableZoom = true;
    }
    const p = pick(e.clientX, e.clientY);
    for (const l of pointerListeners) l("up", e, p?.id ?? null);
    // A click of the left button, not a drag of the camera.
    if (e.button === 0 && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) for (const l of pickListeners) l(p, e);
    if (e.button === 0) downAt = null;
  };
  const onLost = () => {
    looking = null;
    controls.enableZoom = true;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("lostpointercapture", onLost);

  /** Every placement and marker that shows, with its world box: what a selection box can take. */
  const shownBoxes = (): [string, THREE.Box3][] => {
    const out: [string, THREE.Box3][] = [];
    const c = new THREE.Vector3();
    const inRange = (b: THREE.Box3, range?: number) => opts.culling !== "streaming" || range === undefined || range === null || b.getCenter(c).distanceTo(camera.position) <= range;
    for (const r of records.values()) {
      r.placements.forEach((p, i) => {
        if (!hidden.has(p.id) && inRange(r.boxes[i], p.range)) out.push([p.id, r.boxes[i]]);
      });
    }
    if (opts.markers !== false) for (const [id, m] of markers) if (!hidden.has(id) && inRange(m.box, m.marker.range)) out.push([id, m.box]);
    return out;
  };

  // ---- Shift+drag: a box on the screen, as in EDGEbuilder's viewport (it takes Shift's pan from the left button) ----
  const boxListeners = new Set<(rect: { x0: number; y0: number; x1: number; y1: number }, e: PointerEvent) => void>();
  let boxing: { pointer: number; x0: number; y0: number; x: number; y: number; el: HTMLDivElement } | null = null;
  const drawBox = () => {
    if (!boxing) return;
    const st = boxing.el.style;
    st.left = `${Math.min(boxing.x0, boxing.x)}px`;
    st.top = `${Math.min(boxing.y0, boxing.y)}px`;
    st.width = `${Math.abs(boxing.x - boxing.x0)}px`;
    st.height = `${Math.abs(boxing.y - boxing.y0)}px`;
  };
  const onBoxDown = (e: PointerEvent) => {
    if (e.button !== 0 || !e.shiftKey || !boxListeners.size || volume.drawing) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const div = document.createElement("div");
    const hex = accent.getHexString();
    div.style.cssText = `position:fixed;pointer-events:none;z-index:10;border:1px solid #${hex};background:#${hex}22`;
    document.body.appendChild(div);
    boxing = { pointer: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, el: div };
    drawBox();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // No such pointer (a scripted event).
    }
  };
  const onBoxMove = (e: PointerEvent) => {
    if (!boxing || e.pointerId !== boxing.pointer) return;
    boxing.x = e.clientX;
    boxing.y = e.clientY;
    drawBox();
  };
  const onBoxUp = (e: PointerEvent) => {
    if (!boxing || e.pointerId !== boxing.pointer) return;
    e.stopImmediatePropagation();
    const b = boxing;
    boxing = null;
    b.el.remove();
    const rect = { x0: b.x0, y0: b.y0, x1: e.clientX, y1: e.clientY };
    if (Math.hypot(rect.x1 - rect.x0, rect.y1 - rect.y0) < 4) {
      // A Shift+click: a pick, as a click is.
      const p = pick(e.clientX, e.clientY);
      for (const l of pickListeners) l(p, e);
      return;
    }
    for (const l of boxListeners) l(rect, e);
  };
  canvas.addEventListener("pointerdown", onBoxDown, { capture: true });
  canvas.addEventListener("pointermove", onBoxMove, { capture: true });
  canvas.addEventListener("pointerup", onBoxUp, { capture: true });

  const volume = createVolume({
    canvas,
    scene,
    camera,
    accent,
    rayFrom,
    pointAt: (x, y) => pick(x, y)?.point ?? null,
    target: () => controls.target.clone(),
  });

  /** Turns the camera where it stands: what it orbits moves round it. */
  const look = (dx: number, dy: number) => {
    const offset = controls.target.clone().sub(camera.position);
    const s = new THREE.Spherical().setFromVector3(offset);
    s.theta -= dx * 0.004;
    s.phi = Math.min(Math.PI - 0.02, Math.max(0.02, s.phi + dy * 0.004));
    controls.target.copy(camera.position).add(new THREE.Vector3().setFromSpherical(s));
  };

  // ---- flying: W A S D move the camera and what it orbits, Q and E go down and up, Shift is faster, Ctrl slower ----
  const keys = new Set<string>();
  const KeyMoves: Record<string, CameraMove> = { w: "forward", s: "back", a: "left", d: "right", e: "up", q: "down" };
  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!(k in KeyMoves) && k !== "shift" && k !== "control") return;
    // Ctrl+A is a Select All for the caller, not a slow strafe.
    if (k === "a" && (e.ctrlKey || e.metaKey) && e.type === "keydown") return;
    if (e.type === "keydown") {
      keys.add(k);
      if (k in KeyMoves) glide = null;
    } else keys.delete(k);
  };
  canvas.tabIndex = canvas.tabIndex >= 0 ? canvas.tabIndex : 0;
  canvas.addEventListener("keydown", onKey);
  canvas.addEventListener("keyup", onKey);
  const onBlur = () => keys.clear();
  canvas.addEventListener("blur", onBlur);
  /** Moves held by on-screen buttons, with their own fast and slow. */
  const held = new Map<CameraMove, { fast?: boolean; slow?: boolean }>();
  let flySpeed = 1;
  const speedListeners = new Set<(speed: number) => void>();
  const setFlySpeed = (v: number) => {
    flySpeed = Math.min(20, Math.max(0.05, v));
    for (const l of speedListeners) l(flySpeed);
  };
  const onWheel = (e: WheelEvent) => {
    if (!looking) return;
    e.preventDefault();
    setFlySpeed(flySpeed * (e.deltaY < 0 ? 1.25 : 0.8));
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });
  const fly = (dt: number) => {
    const moves = new Map<CameraMove, number>();
    const keyRate = (keys.has("shift") ? 4 : 1) * (keys.has("control") ? 0.25 : 1);
    for (const [k, m] of Object.entries(KeyMoves)) if (keys.has(k)) moves.set(m, keyRate);
    for (const [m, how] of held) moves.set(m, Math.max(moves.get(m) ?? 0, (how.fast ? 4 : 1) * (how.slow ? 0.25 : 1)));
    if (!moves.size) return;
    const rate = (m: CameraMove) => moves.get(m) ?? 0;
    const distance = camera.position.distanceTo(controls.target);
    const speed = 15 * flySpeed * dt * Math.max(1, distance / 30);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const move = new THREE.Vector3()
      .addScaledVector(forward, rate("forward") - rate("back"))
      .addScaledVector(right, rate("right") - rate("left"))
      .addScaledVector(screenUp, rate("panUp") - rate("panDown"));
    move.y += rate("up") - rate("down");
    if (move.lengthSq() > 0) {
      move.multiplyScalar(speed);
      camera.position.add(move);
      controls.target.add(move);
    }
    // Closer and further, and round, move the camera only.
    const zoom = rate("zoomIn") - rate("zoomOut");
    const orbit = rate("orbitRight") - rate("orbitLeft");
    if (zoom || orbit) {
      const offset = camera.position.clone().sub(controls.target);
      if (zoom) offset.multiplyScalar(Math.exp(-1.2 * flySpeed * zoom * dt));
      if (orbit) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.9 * orbit * dt);
      if (offset.length() < 0.1) offset.setLength(0.1);
      camera.position.copy(controls.target).add(offset);
    }
  };

  // ---- gliding: flyTo moves there over a moment; any move of the modder's stops it ----
  let glide: { from: Pose; to: Pose; t: number } | null = null;
  const Glide = 0.45;
  const stepGlide = (dt: number) => {
    if (!glide) return;
    glide.t = Math.min(1, glide.t + dt / Glide);
    const k = 1 - Math.pow(1 - glide.t, 3);
    const lerp = (a: number[], b: number[]) => new THREE.Vector3().fromArray(a).lerp(new THREE.Vector3().fromArray(b), k);
    camera.position.copy(lerp(glide.from.position, glide.to.position));
    controls.target.copy(lerp(glide.from.target, glide.to.target));
    if (glide.t >= 1) {
      glide = null;
      culledAt.set(Infinity, 0, 0);
    }
  };

  // ---- the loop ----
  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  let running = true;
  const clock = new THREE.Clock();
  let sinceCull = 0;
  const tick = () => {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.1);
    fly(dt);
    stepGlide(dt);
    controls.update();
    sinceCull += dt;
    if (sinceCull > 0.25) {
      sinceCull = 0;
      cull();
    }
    stage.update(camera);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();

  /** Where the camera goes to frame these ids, or everything; null when there is nothing. */
  const framing = (ids?: string[], from?: "top" | "start"): Pose | null => {
    const box = new THREE.Box3();
    if (ids?.length) for (const id of ids) {
      const b = boxOf(id);
      if (b) box.union(b);
    }
    else {
      // The meshes and the caller's objects; markers only when there is nothing else, since sound and AI
      // spots can sit far from what is drawn.
      for (const r of records.values()) for (const b of r.boxes) box.union(b);
      for (const o of objects.values()) box.union(new THREE.Box3().setFromObject(o));
      if (box.isEmpty()) for (const m of markers.values()) box.union(m.box);
    }
    if (box.isEmpty()) return null;
    const c = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1);
    const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
    const dir = from === "top" ? new THREE.Vector3(0, 1, 0.001) : from === "start" ? new THREE.Vector3(1, 0.7, 1) : camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0.7, 1);
    // Near and far follow the size, so a small thing close up is not clipped and a whole sector is not cut off.
    camera.near = Math.max(0.05, distance / 2000);
    camera.far = Math.max(20000, distance * 50);
    camera.updateProjectionMatrix();
    return { position: c.clone().add(dir.normalize().multiplyScalar(distance)).toArray(), target: c.toArray() };
  };
  const frame = (ids?: string[]) => {
    const pose = framing(ids);
    if (!pose) return;
    glide = null;
    camera.position.fromArray(pose.position);
    controls.target.fromArray(pose.target);
    controls.update();
    culledAt.set(Infinity, 0, 0);
    cull();
  };
  const flyTo = (ids?: string[], from?: "top" | "start") => {
    const to = framing(ids, from);
    if (!to) return;
    glide = { from: { position: camera.position.toArray(), target: controls.target.toArray() }, to, t: 0 };
  };

  const worldCamera = Object.defineProperties(camera, {
    pose: { get: () => ({ position: camera.position.toArray(), target: controls.target.toArray() }) },
    setPose: {
      value: (pose: Pose) => {
        camera.position.fromArray(pose.position);
        controls.target.fromArray(pose.target);
        controls.update();
        culledAt.set(Infinity, 0, 0);
      },
    },
  }) as WorldCamera;

  return {
    async addMesh(mesh, glb, placements) {
      const key = mesh.toLowerCase();
      let record = records.get(key);
      if (!record) {
        const gltf = await loader.parseAsync(glb, "");
        gltf.scene.updateMatrixWorld(true);
        const parts: MeshRecord["parts"] = [];
        const box = new THREE.Box3();
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const geometry = m.geometry.clone().applyMatrix4(m.matrixWorld);
          geometry.computeBoundingBox();
          if (geometry.boundingBox) box.union(geometry.boundingBox);
          const material = Array.isArray(m.material) ? m.material[0] : m.material;
          // WolvenKit names each part submesh_03_LOD_1: the index is what an appearance's chunkMaterials go by.
          const sub = /submesh_(\d+)/i.exec(m.name || m.parent?.name || "");
          parts.push({ geometry, material: material?.name || m.name || key, submesh: sub ? Number(sub[1]) : parts.length });
        });
        if (box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
        record = { key, name: mesh, parts, box, placements: [], matrices: [], boxes: [], drawn: [], slots: [] };
        records.set(key, record);
      }
      const known = new Set(record.placements.map((p) => p.id));
      for (const p of placements) {
        if (known.has(p.id)) continue;
        const m = new THREE.Matrix4().fromArray(p.matrix);
        record.placements.push(p);
        record.matrices.push(m);
        record.boxes.push(record.box.clone().applyMatrix4(m));
      }
      camera.getWorldPosition(camPos);
      redraw(record);
    },
    addMarkers(list) {
      for (const marker of list) {
        const matrix = new THREE.Matrix4().fromArray(marker.matrix);
        const box = marker.box
          ? new THREE.Box3(new THREE.Vector3().fromArray(marker.box.min), new THREE.Vector3().fromArray(marker.box.max))
          : new THREE.Box3().setFromCenterAndSize(new THREE.Vector3().setFromMatrixPosition(matrix), new THREE.Vector3(0.4, 0.4, 0.4));
        markers.set(marker.id, { marker, matrix, box });
      }
      drawMarkers();
    },
    unloadSector(sector) {
      const lower = sector.toLowerCase();
      const ofSector = (id: string) => sectorOf(id).toLowerCase() === lower;
      for (const [key, r] of [...records]) {
        const keep = r.placements.map((p, i) => (ofSector(p.id) ? -1 : i)).filter((i) => i >= 0);
        if (keep.length === r.placements.length) continue;
        if (!keep.length) {
          for (const d of r.drawn) {
            world.remove(d);
            d.dispose();
          }
          for (const part of r.parts) part.geometry.dispose();
          records.delete(key);
          continue;
        }
        r.placements = keep.map((i) => r.placements[i]);
        r.matrices = keep.map((i) => r.matrices[i]);
        r.boxes = keep.map((i) => r.boxes[i]);
        redraw(r);
      }
      for (const id of [...markers.keys()]) if (ofSector(id)) markers.delete(id);
      for (const [id, o] of [...replaced]) if (ofSector(id)) {
        world.remove(o);
        replaced.delete(id);
      }
      drawMarkers();
    },
    addObject(id, object) {
      const old = objects.get(id);
      if (old) world.remove(old);
      objects.set(id, object);
      world.add(object);
    },
    removeObject(id) {
      const o = objects.get(id);
      if (o) world.remove(o);
      objects.delete(id);
    },
    async replaceMesh(id, glb, prepare) {
      const gltf = await loader.parseAsync(glb, "");
      if (prepare) await prepare(gltf.scene);
      let matrix: THREE.Matrix4 | undefined;
      for (const r of records.values()) {
        const i = r.placements.findIndex((p) => p.id === id);
        if (i >= 0) matrix = r.matrices[i];
      }
      matrix ??= markers.get(id)?.matrix;
      if (!matrix) throw new Error(`Nothing drawn as ${id}`);
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      holder.matrix.copy(matrix);
      holder.add(gltf.scene);
      const old = replaced.get(id);
      if (old) world.remove(old);
      replaced.set(id, holder);
      world.add(holder);
      redrawAll();
    },
    restoreMesh(id) {
      const old = replaced.get(id);
      if (!old) return;
      world.remove(old);
      replaced.delete(id);
      redrawAll();
    },
    setMaterials(mesh, appearances) {
      const record = records.get(mesh.toLowerCase());
      if (!record) return;
      record.materials = { byName: new Map(appearances.map((a) => [a.name.toLowerCase(), a.chunkMaterials])), first: appearances[0]?.chunkMaterials ?? [] };
      if (opts.colourBy === "material") redraw(record);
    },
    setHidden(ids, how) {
      for (const id of ids) {
        hidden.delete(id);
        ghosted.delete(id);
        if (how === "hidden") hidden.add(id);
        else if (how === "ghost") ghosted.add(id);
        const o = objects.get(id) ?? replaced.get(id);
        if (o) o.visible = how === "shown";
      }
      redrawAll();
      drawGhosts();
    },
    highlight(ids, now) {
      highlighted = new Set(ids);
      current = now && highlighted.has(now) && highlighted.size > 1 ? now : null;
      redrawAll();
    },
    idsInRect(x0, y0, x1, y1, o) {
      const r = canvas.getBoundingClientRect();
      const toNdc = (x: number, y: number) => [((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1)];
      const [ax, ay] = toNdc(Math.min(x0, x1), Math.max(y0, y1));
      const [bx, by] = toNdc(Math.max(x0, x1), Math.min(y0, y1));
      const v = new THREE.Vector3();
      const inFront = (q: THREE.Vector3) => q.z > -1 && q.z < 1;
      const takes = (b: THREE.Box3) => {
        b.getCenter(v).project(camera);
        if (inFront(v) && v.x >= ax && v.x <= bx && v.y >= ay && v.y <= by) return true;
        if (!o?.touching) return false;
        // The box's corners on the screen: with any of them behind the camera, only the middle counts.
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < 8; i++) {
          v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(camera);
          if (!inFront(v)) return false;
          minX = Math.min(minX, v.x);
          maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y);
          maxY = Math.max(maxY, v.y);
        }
        return maxX >= ax && minX <= bx && maxY >= ay && minY <= by;
      };
      return shownBoxes().filter(([, b]) => takes(b)).map(([id]) => id);
    },
    idsInBox(box, o) {
      const c = new THREE.Vector3();
      return shownBoxes()
        .filter(([, b]) => (o?.touching ? box.intersectsBox(b) : box.containsPoint(b.getCenter(c))))
        .map(([id]) => id);
    },
    idsShown() {
      return shownBoxes().map(([id]) => id);
    },
    onBoxSelect(cb) {
      boxListeners.add(cb);
      return () => boxListeners.delete(cb);
    },
    volume,
    pick,
    onPick(cb) {
      pickListeners.add(cb);
      return () => pickListeners.delete(cb);
    },
    onPointer(cb) {
      pointerListeners.add(cb);
      return () => pointerListeners.delete(cb);
    },
    toCanvas(p) {
      const v = p.clone().project(camera);
      const rect = canvas.getBoundingClientRect();
      return [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
    },
    rayFrom,
    camera: worldCamera,
    frame,
    flyTo,
    hold(move, on, how) {
      if (on) {
        glide = null;
        held.set(move, how ?? {});
      } else held.delete(move);
    },
    get flySpeed() {
      return flySpeed;
    },
    set flySpeed(v: number) {
      setFlySpeed(v);
    },
    onFlySpeed(cb) {
      speedListeners.add(cb);
      return () => speedListeners.delete(cb);
    },
    setOptions(next) {
      const recolour = next.colourBy && next.colourBy !== opts.colourBy;
      opts = { ...opts, ...next };
      if (recolour) {
        for (const m of materials.values()) m.dispose();
        materials.clear();
      }
      if (next.light) stage.set(next.light);
      culledAt.set(Infinity, 0, 0);
      camera.getWorldPosition(camPos);
      redrawAll();
    },
    stats() {
      let placements = 0;
      let shown = 0;
      let draws = 0;
      for (const r of records.values()) {
        placements += r.placements.length;
        shown += r.slots.length;
        draws += r.drawn.length;
      }
      return { meshes: records.size, placements, shown, markers: markers.size, draws: draws + markerMeshes.length };
    },
    lighting: stage,
    scene,
    renderer,
    dispose() {
      running = false;
      observer.disconnect();
      controls.dispose();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("lostpointercapture", onLost);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("keyup", onKey);
      canvas.removeEventListener("blur", onBlur);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onBoxDown, { capture: true });
      canvas.removeEventListener("pointermove", onBoxMove, { capture: true });
      canvas.removeEventListener("pointerup", onBoxUp, { capture: true });
      boxing?.el.remove();
      volume.dispose();
      for (const r of records.values()) {
        for (const d of r.drawn) d.dispose();
        for (const p of r.parts) p.geometry.dispose();
      }
      for (const m of markerMeshes) m.dispose();
      for (const m of materials.values()) m.dispose();
      stage.dispose();
      renderer.dispose();
    },
  };
}
