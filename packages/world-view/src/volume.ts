// @edgemodders/world-view, the page half's volume (REDcode's docs/design/sector-selection.md): a box in the
// world for selecting what is inside it. start() arms it: drag on the ground for its base, move the mouse up or
// down for its height, and click. It then stays, see-through, with a handle on each face to resize it and one
// above it to move it. It takes the pointer only while drawing or dragging a handle (a capture listener that
// stops the event there), so the camera and picking work as usual round it. Level with the world: no turning.

import * as THREE from "three";

export interface Volume {
  /** Arms the tool: the next left drag on the canvas draws a new box in place of the old one. */
  start(): void;
  /** Takes the box out, or stops a drawing under way. */
  clear(): void;
  /** Puts a box there as if drawn (typed numbers, a box around the camera), with its handles; onChange fires. */
  set(box: THREE.Box3): void;
  /** The box, once its base is drawn; null when there is none. */
  readonly box: THREE.Box3 | null;
  /** Armed or drawing: the pointer belongs to the tool until the box is done. */
  readonly drawing: boolean;
  /** Fires as the box changes (drawn, resized, moved), and with null when it is cleared. */
  onChange(cb: (box: THREE.Box3 | null) => void): () => void;
  dispose(): void;
}

export interface VolumeHost {
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  accent: THREE.Color;
  rayFrom(x: number, y: number): { origin: THREE.Vector3; direction: THREE.Vector3 };
  /** The point on what is drawn under the cursor, for the base's height. */
  pointAt(x: number, y: number): THREE.Vector3 | null;
  /** What the camera orbits: the base's height over empty ground. */
  target(): THREE.Vector3;
}

type Phase = "off" | "armed" | "base" | "height" | "done";
type Drag = { kind: "face"; axis: 0 | 1 | 2; side: 0 | 1; start: number } | { kind: "move"; y: number; start: THREE.Vector3; from: THREE.Box3 };

const Axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

export function createVolume(host: VolumeHost): Volume {
  const { canvas, scene, camera } = host;
  let phase: Phase = "off";
  let box: THREE.Box3 | null = null;
  let base: { y: number; a: THREE.Vector3; b: THREE.Vector3 } | null = null;
  let height: { startY: number; perPixel: number } | null = null;
  let drag: (Drag & { pointer: number }) | null = null;
  /** The pointer whose down the tool took: its up is the tool's too. */
  let swallow: number | null = null;
  const listeners = new Set<(b: THREE.Box3 | null) => void>();

  // ---- drawing: a see-through box, its edges over everything, a handle per face and a move handle ----
  const group = new THREE.Group();
  group.renderOrder = 10;
  const fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: host.accent, transparent: true, opacity: 0.08, depthWrite: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: host.accent, transparent: true, opacity: 0.9, depthTest: false }));
  edges.renderOrder = 11;
  group.add(fill, edges);
  const handleGeometry = new THREE.BoxGeometry(1, 1, 1);
  const handleMaterial = new THREE.MeshBasicMaterial({ color: host.accent, depthTest: false });
  const faces: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const h = new THREE.Mesh(handleGeometry, handleMaterial);
    h.renderOrder = 12;
    h.userData.face = { axis: Math.floor(i / 2), side: i % 2 };
    faces.push(h);
    group.add(h);
  }
  const mover = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
  mover.renderOrder = 12;
  group.add(mover);
  group.visible = false;
  scene.add(group);

  const emit = () => {
    for (const l of listeners) l(box ? box.clone() : null);
  };
  const show = () => {
    if (!box) {
      group.visible = false;
      return;
    }
    group.visible = true;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    fill.position.copy(centre);
    fill.scale.set(Math.max(size.x, 0.01), Math.max(size.y, 0.01), Math.max(size.z, 0.01));
    edges.position.copy(centre);
    edges.scale.copy(fill.scale);
    const done = phase === "done";
    const s = Math.min(3, Math.max(0.15, Math.max(size.x, size.y, size.z) * 0.035));
    faces.forEach((h) => {
      const { axis, side } = h.userData.face as { axis: number; side: number };
      h.visible = done;
      h.position.copy(centre).setComponent(axis, side ? box!.max.getComponent(axis) : box!.min.getComponent(axis));
      h.scale.setScalar(s);
    });
    mover.visible = done;
    mover.position.set(centre.x, box.max.y + s * 3, centre.z);
    mover.scale.setScalar(s * 1.4);
  };

  // ---- the mouse on the ground and along an axis ----
  const onPlane = (x: number, y: number, h: number): THREE.Vector3 | null => {
    const r = host.rayFrom(x, y);
    if (Math.abs(r.direction.y) < 1e-6) return null;
    const t = (h - r.origin.y) / r.direction.y;
    if (t <= 0) return null;
    return r.origin.clone().addScaledVector(r.direction, t);
  };
  /** Where the mouse's ray comes closest to a line through c along u: the distance along u. */
  const alongAxis = (x: number, y: number, c: THREE.Vector3, u: THREE.Vector3): number | null => {
    const r = host.rayFrom(x, y);
    const w0 = c.clone().sub(r.origin);
    const b = u.dot(r.direction);
    const denom = 1 - b * b;
    if (Math.abs(denom) < 1e-6) return null;
    return (b * r.direction.dot(w0) - u.dot(w0)) / denom;
  };
  const handleAt = (x: number, y: number): THREE.Object3D | null => {
    if (phase !== "done" || !box) return null;
    const r = host.rayFrom(x, y);
    const caster = new THREE.Raycaster(r.origin, r.direction);
    const hits = caster.intersectObjects([...faces, mover], false);
    return hits[0]?.object ?? null;
  };
  const baseBox = () => {
    if (!base) return null;
    const b = new THREE.Box3().setFromPoints([base.a, base.b]);
    b.min.y = b.max.y = base.y;
    return b;
  };

  const take = (e: PointerEvent) => {
    e.stopImmediatePropagation();
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // No such pointer (a scripted event): the moves still come over the canvas.
    }
  };
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (phase === "armed") {
      const hit = host.pointAt(e.clientX, e.clientY);
      const h = hit ? hit.y : host.target().y;
      const a = onPlane(e.clientX, e.clientY, h);
      if (!a) return;
      take(e);
      swallow = e.pointerId;
      base = { y: h, a, b: a.clone() };
      phase = "base";
      box = baseBox();
      show();
      emit();
      return;
    }
    if (phase === "height") {
      // The click that sets the height.
      take(e);
      swallow = e.pointerId;
      phase = "done";
      height = null;
      show();
      emit();
      return;
    }
    const handle = handleAt(e.clientX, e.clientY);
    if (!handle || !box) return;
    take(e);
    swallow = e.pointerId;
    if (handle === mover) {
      const start = onPlane(e.clientX, e.clientY, mover.position.y);
      if (!start) return;
      drag = { kind: "move", y: mover.position.y, start, from: box.clone(), pointer: e.pointerId };
    } else {
      const { axis, side } = handle.userData.face as { axis: 0 | 1 | 2; side: 0 | 1 };
      const start = alongAxis(e.clientX, e.clientY, handle.position, Axes[axis]);
      if (start === null) return;
      drag = { kind: "face", axis, side, start, pointer: e.pointerId };
    }
  };
  const onMove = (e: PointerEvent) => {
    if (phase === "base" && base) {
      const b = onPlane(e.clientX, e.clientY, base.y);
      if (b) base.b.copy(b);
      box = baseBox();
      show();
      emit();
      e.stopImmediatePropagation();
      return;
    }
    if (phase === "height" && base && height) {
      const h = (height.startY - e.clientY) * height.perPixel;
      const b = baseBox()!;
      b.min.y = Math.min(base.y, base.y + h);
      b.max.y = Math.max(base.y, base.y + h);
      box = b;
      show();
      emit();
      return;
    }
    if (drag && box && e.pointerId === drag.pointer) {
      e.stopImmediatePropagation();
      if (drag.kind === "move") {
        const p = onPlane(e.clientX, e.clientY, drag.y);
        if (!p) return;
        const d = p.sub(drag.start);
        box = drag.from.clone().translate(new THREE.Vector3(d.x, 0, d.z));
      } else {
        const c = faces[drag.axis * 2 + drag.side].position;
        const t = alongAxis(e.clientX, e.clientY, c, Axes[drag.axis]);
        if (t === null) return;
        // The handle moves with the face, so t is from where it is now; start is where on it the drag took it.
        const value = (drag.side ? box.max : box.min).getComponent(drag.axis) + (t - drag.start);
        const v = drag.side ? Math.max(value, box.min.getComponent(drag.axis) + 0.1) : Math.min(value, box.max.getComponent(drag.axis) - 0.1);
        (drag.side ? box.max : box.min).setComponent(drag.axis, v);
      }
      show();
      emit();
    }
  };
  const onUp = (e: PointerEvent) => {
    if (swallow !== e.pointerId) return;
    swallow = null;
    e.stopImmediatePropagation();
    if (phase === "base" && base) {
      const size = baseBox()!.getSize(new THREE.Vector3());
      if (size.x < 0.2 && size.z < 0.2) {
        // A click, not a drag: still waiting for the base.
        phase = "armed";
        base = null;
        box = null;
        show();
        emit();
        return;
      }
      const centre = baseBox()!.getCenter(new THREE.Vector3());
      const distance = camera.position.distanceTo(centre);
      height = { startY: e.clientY, perPixel: (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, canvas.clientHeight) };
      phase = "height";
      return;
    }
    drag = null;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && (phase === "armed" || phase === "base" || phase === "height")) {
      e.stopImmediatePropagation();
      clear();
    }
  };
  const clear = () => {
    const wasOn = phase !== "off";
    phase = "off";
    base = null;
    height = null;
    drag = null;
    swallow = null;
    const had = !!box;
    box = null;
    show();
    // Armed with no box yet counts too: whoever turned the tool on hears that it is off.
    if (had || wasOn) emit();
  };
  canvas.addEventListener("pointerdown", onDown, { capture: true });
  canvas.addEventListener("pointermove", onMove, { capture: true });
  canvas.addEventListener("pointerup", onUp, { capture: true });
  canvas.addEventListener("keydown", onKey, { capture: true });

  return {
    start() {
      clear();
      phase = "armed";
    },
    clear,
    set(b) {
      phase = "done";
      base = null;
      height = null;
      drag = null;
      box = b.clone();
      show();
      emit();
    },
    get box() {
      return box ? box.clone() : null;
    },
    get drawing() {
      return phase === "armed" || phase === "base" || phase === "height";
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      clear();
      canvas.removeEventListener("pointerdown", onDown, { capture: true });
      canvas.removeEventListener("pointermove", onMove, { capture: true });
      canvas.removeEventListener("pointerup", onUp, { capture: true });
      canvas.removeEventListener("keydown", onKey, { capture: true });
      scene.remove(group);
      fill.geometry.dispose();
      (fill.material as THREE.Material).dispose();
      edges.geometry.dispose();
      (edges.material as THREE.Material).dispose();
      handleGeometry.dispose();
      handleMaterial.dispose();
      mover.geometry.dispose();
      (mover.material as THREE.Material).dispose();
    },
  };
}
