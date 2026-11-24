// The head in the Lip Sync tab (docs/research/lipsync.md, "R-face"): the character's head meshes, posed each frame by
// lipsync-core's face solver from the clip's tracks at the playhead. Bundled for the browser on its own
// (media/lipsync/head.js) and loaded by the tab's page, which calls `window.lipsyncHead`.
// The meshes come without materials, so each kind gets a plain colour: the shape of the mouth is what is shown.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clipValues, faceSolver, type ClipTracks, type FaceSetup } from "../../../packages/lipsync-core/src/faceSolve";

interface HeadMessage {
  /** Each mesh as a GLB the page may fetch; its skin's joints are the rig's bones in order. */
  models: { kind: string; uri: string }[];
  face: FaceSetup;
}

const Colours: Record<string, number> = { skin: 0xc8a08a, eyes: 0xe8e8ea, teeth: 0xe6dfd0, brows: 0x2b211c, lashes: 0x1c1614, hair: 0x2b211c };

let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let controls: OrbitControls | undefined;
let canvas: HTMLCanvasElement | undefined;
let skeletons: THREE.Bone[][] = [];
let face: FaceSetup | undefined;
let solver: ReturnType<typeof faceSolver> | undefined;
let values: Float32Array | undefined;
let loading = 0;
let last: { clip: ClipTracks | null; seconds: number } = { clip: null, seconds: 0 };

function render() {
  if (!renderer || !scene || !camera || !canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w && h && (canvas.width !== Math.floor(w * devicePixelRatio) || canvas.height !== Math.floor(h * devicePixelRatio))) {
    renderer.setPixelRatio(devicePixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
}

function pose(clip: ClipTracks | null, seconds: number) {
  if (!face || !solver || !values) return;
  if (clip) clipValues(face, clip, seconds, values);
  else values.fill(0);
  // A lip sync clip alone carries no mood, so the upper and lower face tracks are not applied: they would only
  // mute acting the clip does not have.
  const out = solver.solve(values, { halves: false });
  for (const bones of skeletons) {
    for (let b = 0; b < bones.length; b++) {
      const o = b * 7;
      // The game's space to glTF's: translation (x, z, -y), rotation (x, z, -y, w).
      bones[b].position.set(out[o + 4], out[o + 6], -out[o + 5]);
      bones[b].quaternion.set(out[o], out[o + 2], -out[o + 1], out[o + 3]);
    }
  }
}

const api = {
  /** Whether a head is loaded and shown. */
  ready: false,
  /** Loads a head into the canvas; a head loaded before is replaced. */
  async load(target: HTMLCanvasElement, message: HeadMessage): Promise<void> {
    const mine = ++loading;
    api.ready = false;
    if (!renderer || canvas !== target) {
      renderer?.dispose();
      canvas = target;
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      camera = new THREE.PerspectiveCamera(20, 1, 0.01, 20);
      controls = new OrbitControls(camera, canvas);
      controls.enablePan = false;
      controls.minDistance = 0.3;
      controls.maxDistance = 3;
      controls.addEventListener("change", render);
    }
    const next = new THREE.Scene();
    next.add(new THREE.HemisphereLight(0xffffff, 0x30303c, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    next.add(key);
    const loader = new GLTFLoader();
    const loaded = await Promise.all(message.models.map(async (m) => ({ kind: m.kind, gltf: await loader.loadAsync(m.uri) })));
    if (mine !== loading) return;
    const all: THREE.Bone[][] = [];
    for (const { kind, gltf } of loaded) {
      let bones: THREE.Bone[] | undefined;
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.SkinnedMesh;
        if (!mesh.isMesh) return;
        mesh.material = new THREE.MeshStandardMaterial({ color: Colours[kind] ?? 0x999999, roughness: kind === "teeth" || kind === "eyes" ? 0.35 : 0.7, side: THREE.DoubleSide });
        mesh.frustumCulled = false;
        if (mesh.isSkinnedMesh) bones ??= mesh.skeleton.bones;
      });
      if (bones && bones.length === message.face.bones.length) all.push(bones);
      next.add(gltf.scene);
    }
    scene = next;
    skeletons = all;
    face = message.face;
    solver = faceSolver(face);
    values = new Float32Array(face.tracks.length);
    // Look at the face from the front: the head bone's place, a little below it, where the mouth is. The face
    // looks along glTF's -Z after the export's turn.
    next.updateMatrixWorld(true);
    const centre = new THREE.Vector3();
    const head = all[0]?.find((b) => b.name === "Head");
    if (head) head.getWorldPosition(centre);
    centre.y += 0.02;
    camera!.position.copy(centre).add(new THREE.Vector3(0.12, 0, -1.0));
    key.position.copy(centre).add(new THREE.Vector3(-0.5, 0.6, -1.5));
    controls!.target.copy(centre);
    controls!.update();
    api.ready = all.length > 0;
    pose(last.clip, last.seconds);
    render();
  },
  /** Shows the head at `seconds` of a clip (no clip: at rest). Cheap to call every frame. */
  show(clip: ClipTracks | null, seconds: number): void {
    last = { clip, seconds };
    if (!api.ready) return;
    pose(clip, seconds);
    render();
  },
};

(window as unknown as { lipsyncHead: typeof api }).lipsyncHead = api;
