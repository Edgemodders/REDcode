// @edgemodders/world-view, the page half (the API agreed with EDGEbuilder in EDGEbuilder #8): the game's
// things in a three.js scene. Each unique mesh is drawn as one InstancedMesh per GLB primitive with all its
// placements; things with no mesh are markers; the caller's own objects go in the same scene. Picking is a
// ray against each placement's box, so it stays fast with thousands of copies. Browser only: a webview, a
// REDnode overlay page or any page with WebGL.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createStage, type LightSettings, type Stage } from "./stage";

export type { LightSettings } from "./stage";

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
  highlight(ids: string[]): void;
  pick(x: number, y: number): Picked | null;
  onPick(cb: (picked: Picked | null, event: PointerEvent) => void): () => void;
  onPointer(cb: (type: "down" | "move" | "up", event: PointerEvent, id: string | null) => void): () => void;
  toCanvas(world: THREE.Vector3): [number, number];
  rayFrom(x: number, y: number): { origin: THREE.Vector3; direction: THREE.Vector3 };
  /** The three.js camera, for a gizmo, with its pose (where it is and what it orbits) to read and set. */
  readonly camera: WorldCamera;
  frame(ids?: string[]): void;
  setOptions(options: Partial<WorldViewOptions>): void;
  /** How many placements, markers and draws are on screen now, for a status line. */
  stats(): { meshes: number; placements: number; shown: number; markers: number; draws: number };
  readonly lighting: Stage;
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  dispose(): void;
}

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
  const stage = createStage(renderer, scene, options.light);
  const accent = new THREE.Color(options.accent ?? 0x19f3ff);
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
    if (highlighted.has(placement.id)) return accent;
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
        im.setColorAt(slot, highlighted.has(r.marker.id) ? accent : white);
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
  const onDown = (e: PointerEvent) => {
    downAt = { x: e.clientX, y: e.clientY };
    if (pointerListeners.size) {
      const p = pick(e.clientX, e.clientY);
      for (const l of pointerListeners) l("down", e, p?.id ?? null);
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!pointerListeners.size) return;
    const p = pick(e.clientX, e.clientY);
    for (const l of pointerListeners) l("move", e, p?.id ?? null);
  };
  const onUp = (e: PointerEvent) => {
    const p = pick(e.clientX, e.clientY);
    for (const l of pointerListeners) l("up", e, p?.id ?? null);
    // A click, not a drag of the camera.
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4) for (const l of pickListeners) l(p, e);
    downAt = null;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);

  // ---- flying: WASD moves the camera and what it orbits; Q and E go down and up; Shift is faster ----
  const keys = new Set<string>();
  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (!"wasdqe".includes(k) && k !== "shift") return;
    if (e.type === "keydown") keys.add(k);
    else keys.delete(k);
  };
  canvas.tabIndex = canvas.tabIndex >= 0 ? canvas.tabIndex : 0;
  canvas.addEventListener("keydown", onKey);
  canvas.addEventListener("keyup", onKey);
  canvas.addEventListener("blur", () => keys.clear());
  const fly = (dt: number) => {
    if (!keys.size) return;
    const speed = (keys.has("shift") ? 60 : 15) * dt * Math.max(1, camera.position.distanceTo(controls.target) / 30);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const move = new THREE.Vector3();
    if (keys.has("w")) move.add(forward);
    if (keys.has("s")) move.sub(forward);
    if (keys.has("d")) move.add(right);
    if (keys.has("a")) move.sub(right);
    if (keys.has("e")) move.y += 1;
    if (keys.has("q")) move.y -= 1;
    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(speed);
    camera.position.add(move);
    controls.target.add(move);
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

  const frame = (ids?: string[]) => {
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
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1);
    const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0.7, 1);
    camera.position.copy(c).add(dir.normalize().multiplyScalar(distance));
    camera.near = Math.max(0.05, distance / 2000);
    camera.far = Math.max(20000, distance * 50);
    camera.updateProjectionMatrix();
    controls.target.copy(c);
    controls.update();
    culledAt.set(Infinity, 0, 0);
    cull();
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
    highlight(ids) {
      highlighted = new Set(ids);
      redrawAll();
    },
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
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("keyup", onKey);
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
