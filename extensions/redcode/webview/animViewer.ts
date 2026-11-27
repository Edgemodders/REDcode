// The animation view (docs/design/animation.md, A1 and A2), bundled with the mesh viewer into
// media/mesh/viewer.js and loaded by the CR2W editor's animations mode. It shows an .anims file's rig
// as bones and joints, or a body on it, and plays the animation picked: the list and the skeleton come
// first, and each animation's keys come from the host when it is picked, since an export can hold
// hundreds of MB. Root motion is a switch: its keys come from a second export.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { cssColour, el, lightControls, sideSplitter, type LightSettings } from "./viewerKit";
import { createStage } from "../../../packages/world-view/src/stage";
import { editPanel, type EditApi } from "./animEdit";
import { timelinePanel, type TimelinePanel } from "./animTimeline";
import type { Frames } from "../../../packages/anim-core/src/pose";

export interface AnimClipInfo {
  name: string;
  duration: number;
  frames: number;
}

export interface AnimsSource {
  /** The bytes of a .glb with the rig's nodes, and no animations. */
  skeleton: ArrayBuffer;
  /** The game path of the rig the file names. */
  rig: string;
  animations: AnimClipInfo[];
  /** The bytes of a .glb holding only the animation at this index, with its root motion or in place. */
  clip: (index: number, rootMotion: boolean) => Promise<ArrayBuffer>;
  /**
   * A body on the rig (A2): a .glb whose skin has the bones the clips drive, by name. A base body, or a
   * character's or vehicle's meshes. Without one, the bones show alone.
   */
  body?: { data: ArrayBuffer; label: string; notes: string[] };
  /** Why there is no body, or not the one asked for. */
  bodyNote?: string;
  /** Plays the root motion at first: the whole rig moves through the scene. */
  rootMotion?: boolean;
  /** The animation to open at, by name. */
  initial?: string;
  /** Shown in the toolbar, such as when the file has unsaved edits. */
  note?: string;
  /** Says something to the person: a name that is not in the file. */
  say?: (message: string) => void;
  /** A3: a synced clip's set, from the host. Without it, no set is offered. */
  set?: SetApi;
  /** Plays the set of the animation opened at first (REDcodeApi.openAnimation's set). */
  playSet?: boolean;
  /** The light kept for the window (REDcode issue #31), and where a change goes to be kept. */
  light?: Partial<LightSettings>;
  onLight?: (settings: LightSettings) => void;
  /** The side list's width in pixels, kept for the window; undefined is the default width. */
  sideWidth?: number;
  onSideWidth?: (width: number | undefined) => void;
  /** Making clips (docs/design/animation-tools.md, AT2). Without it, no Make panel. */
  make?: MakeApi;
  /** Editing a made clip (docs/design/animation-editor.md, AE2). Without it, or on a file that is not a made clip's own set, no Edit panel. */
  edit?: EditApi;
  /** Where a view stood before it was built again (a rebuild from the Edit panel): its camera, clip, moment and speed. */
  restore?: AnimsViewState;
  /** A lip sync set (docs/design/lipsync.md): opens the Lip Sync editor at the shown clip's line. */
  lipSync?: (clip: string | undefined) => void;
}

/** What the Make panel asks of the host. */
export interface MakeApi {
  /** Why clips cannot be made here (no project open, another rig), or undefined when they can. */
  why?: string;
  /** The file is the game's: a replacement goes into a copy of its set in the project. */
  game: boolean;
  /** This file is the own set of the project's made clip of this name: replacing makes it again. */
  made?: string;
  /** How that made clip was made (its record's source): prompt, model, length, upperBodyOnly, inPlace, made; or source "glb" and file. */
  from?: Record<string, unknown>;
  run(req: MakeAsk): Promise<{ clip: string; set: string; cost?: number; notes: string[] }>;
}

export interface MakeAsk {
  action: "generate" | "glb";
  prompt?: string;
  length?: number;
  model?: string;
  inPlace?: boolean;
  upperBodyOnly?: boolean;
  asWritten?: boolean;
  name?: string;
  /** The clip to replace, by name: the one the view shows. */
  replace?: string;
}

/** Uthana's text-to-motion models, as anim-core prices them (Uthana's docs, 2026-11-22). */
const MakeModels = [
  { id: "text-to-motion-3.0", label: "3.0", perSecond: 0.1, min: 4 },
  { id: "text-to-motion-3.0-lite", label: "3.0 Lite", perSecond: 0.1, min: 5 },
  { id: "text-to-motion-3.0-mini", label: "3.0 Mini", perSecond: 0.075, min: 5 },
];

/** A made clip's line: what it was made from, with what, when. */
function madeFromText(from: Record<string, unknown>): string {
  const when = typeof from.made === "string" && !Number.isNaN(Date.parse(from.made)) ? new Date(from.made).toLocaleString() : "";
  if (from.source === "glb") return `Made from ${typeof from.file === "string" ? from.file : "a .glb"}${when ? `, ${when}` : ""}.`;
  const m = MakeModels.find((x) => x.id === from.model);
  const secs = typeof from.length === "number" ? from.length : undefined;
  const cost = m && secs ? `, about $${(m.perSecond * secs).toFixed(2)}` : "";
  const how = [m ? `Uthana ${m.label}` : "Uthana", secs ? `${secs} s` : "", from.upperBodyOnly ? "upper body only" : "", from.inPlace === false ? "with travel" : ""].filter(Boolean).join(", ");
  const sent = typeof from.sent === "string" && from.sent !== from.prompt ? " The words went with REDcode's grounding rule." : "";
  return `Made with ${how}${cost}${when ? `, ${when}` : ""}, from the words below.${sent}`;
}

/** The stages in order, for the progress bar, with each one's short name for the busy button. */
const MakeSteps: [stage: string, short: string][] = [
  ["start", "Starting"],
  ["stand-in", "Stand-in"],
  ["queued", "Queued"],
  ["running", "Uthana is making it"],
  ["downloading", "Downloading"],
  ["fitting", "Fitting"],
  ["importing", "Writing"],
  ["done", "Opening"],
];
const MakeStages: Record<string, string> = {
  "stand-in": "Getting the stand-in character on Uthana (uploaded once per rig)…",
  queued: "Uthana has the job…",
  running: "Uthana is making the motion…",
  downloading: "Downloading the motion…",
  fitting: "Fitting it onto the game's rig…",
  importing: "Writing the clip into the project…",
  done: "Opening the clip…",
};

/** A member of a synced moment, as the host lists it. */
export interface SetMemberInfo {
  role: string;
  file: string;
  /** The file's name, for the list. */
  name: string;
  clip: string;
  rig: string;
  duration: number;
  /** How many other files have the same role (the player's male and female files). */
  alternatives: number;
  /** Shown at first. */
  active: boolean;
  /** The clip this view has open. */
  self: boolean;
  /** Its animation buffer: "compressed" or "simd". */
  buffer?: string;
}

/** Where a member stands relative to the opened clip's member, or why it could not be placed. */
export interface SetPlace {
  index: number;
  /** Column-major 4x4, as Matrix4.fromArray takes it. */
  matrix: number[] | null;
  /** The track that placed it, in words. */
  from: string;
  spread: number | null;
  ambiguous: boolean;
  problem: string | null;
}

export interface SetApi {
  /** The members of the clip's moment, the clip's own first; empty when it is not synced. why says what is missing. */
  list(clip: string): Promise<{ members: SetMemberInfo[]; why?: string }>;
  place(clip: string, include: number[]): Promise<SetPlace[]>;
  /** A member's skeleton, its clip with root motion, and its body when its rig has one. */
  member(index: number): Promise<{ skeleton: ArrayBuffer; clip: ArrayBuffer; body?: { data: ArrayBuffer; label: string; notes: string[] }; bodyNote?: string }>;
}

export interface AnimsViewState {
  clip?: string;
  time: number;
  speed: number;
  camera: number[];
  target: number[];
}

export interface AnimsView {
  /** Where the view stands, for a view built again to come back to. */
  state?(): AnimsViewState;
  dispose(): void;
  refreshMaterials(): void;
  /** Goes to an animation by name, and plays it; with playSet, plays its synced set too. */
  showAnimation(name: string, options?: { playSet?: boolean }): void;
  /** A stage of a make the Make panel started, from the host. */
  makeStage?(stage: string, detail?: string): void;
}

/** Each member's colour in the view and the list, after the opened one's. */
const MemberColours = [0xffb347, 0x7cfc9a, 0xff6ad5, 0x9ab8ff, 0xffe066, 0x66e0ff, 0xc39bff, 0xff8a65];

const Speeds = [0.1, 0.25, 0.5, 1, 2];

interface PlayingMember {
  index: number;
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction;
  duration: number;
  /** Its joints but for its helper joints, for Frame. */
  framed: THREE.Bone[];
  lines: THREE.SkeletonHelper;
  meshes: THREE.Object3D[];
  material: THREE.Material;
  root: THREE.Object3D;
}

const seconds = (t: number) => `${t.toFixed(2)} s`;
const fpsOf = (a: AnimClipInfo) => (a.duration > 0 && a.frames > 1 ? Math.round((a.frames - 1) / a.duration) : 0);

/** Builds the view into container: the canvas with its transport, and the list of animations. */
export async function mountAnimations(container: HTMLElement, source: AnimsSource): Promise<AnimsView> {
  container.replaceChildren();
  container.classList.add("meshview");
  const bar = el("div", "toolbar");
  const stage = el("div", "meshstage");
  const side = el("div", "meshside animside");
  const note = el("div", "note", "Loading the rig…");
  stage.appendChild(note);
  const body = el("div", "meshbody");
  body.append(stage, side);
  sideSplitter(body, side, source.sideWidth, source.onSideWidth);
  const transport = el("div", "toolbar animtransport");
  container.append(bar, body, transport);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  const scene = new THREE.Scene();
  scene.background = cssColour("--vscode-editor-background", "#0d1017");
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const loader = new GLTFLoader();
  let root: THREE.Object3D;
  try {
    root = (await loader.parseAsync(source.skeleton, "")).scene;
  } catch (e) {
    note.textContent = `Could not read the rig: ${e instanceof Error ? e.message : String(e)}`;
    return { dispose: () => renderer.dispose(), refreshMaterials: () => undefined, showAnimation: () => undefined };
  }
  // A body, when there is one, is what the clips move: its bones carry the same names as the rig's.
  let bodyRoot: THREE.Object3D | undefined;
  let bodyError = "";
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa3b5, roughness: 0.75, metalness: 0 });
  if (source.body) {
    try {
      bodyRoot = (await loader.parseAsync(source.body.data, "")).scene;
      // Exported without materials: one plain material, and no culling by the bind pose's bounds, which
      // root motion leaves behind.
      bodyRoot.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.material = bodyMaterial;
        mesh.frustumCulled = false;
      });
    } catch (e) {
      bodyError = `Could not read the body: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  const animated = bodyRoot ?? root;
  /** A3: the other members of a synced set while it plays, each on its own rig, placed, on the main clip's clock. */
  let playingSet: PlayingMember[] = [];
  /** Puts every member at the main clip's moment (or its own end, when it is shorter). */
  const syncSet = () => {
    const t = action?.time ?? 0;
    for (const m of playingSet) {
      m.action.time = Math.min(t, m.duration);
      m.mixer.update(0);
    }
  };
  note.remove();
  stage.appendChild(renderer.domElement);
  // An environment for reflections, tone mapping and the modder's light (REDcode issue #31).
  const lighting = createStage(renderer, scene, source.light);
  scene.add(animated);
  animated.updateMatrixWorld(true);

  // Bones as lines from each bone to its parent, joints as dots, both over anything else.
  const bones: THREE.Bone[] = [];
  animated.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  const lines = new THREE.SkeletonHelper(animated);
  const accent = cssColour("--vscode-textLink-foreground", "#19f3ff");
  (lines.material as THREE.LineBasicMaterial).vertexColors = false;
  (lines.material as THREE.LineBasicMaterial).color = accent;
  scene.add(lines);
  const dotGeometry = new THREE.BufferGeometry();
  const dotPositions = new Float32Array(bones.length * 3);
  dotGeometry.setAttribute("position", new THREE.BufferAttribute(dotPositions, 3));
  const dotMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 4, sizeAttenuation: false, depthTest: false, transparent: true });
  const dots = new THREE.Points(dotGeometry, dotMaterial);
  dots.frustumCulled = false;
  scene.add(dots);
  const at = new THREE.Vector3();
  const moveDots = () => {
    bones.forEach((b, i) => {
      b.getWorldPosition(at);
      at.toArray(dotPositions, i * 3);
    });
    dotGeometry.attributes.position.needsUpdate = true;
  };
  moveDots();

  const grid = new THREE.GridHelper(1, 10, 0x2a3346, 0x1a2030);
  scene.add(grid);

  // Joints the fit leaves out: reference_joint can sit metres from the body (3.9 to 14.6 m in the
  // Trauma Team soldiers' landing; a synced set's shared point, unverified), and Root and Trajectory
  // stay on the ground while the body starts up in the AV (3.1 m at the landing's start).
  const HelperJoints = new Set(["reference_joint", "trajectory", "root"]);
  const framed = bones.filter((b) => !HelperJoints.has(b.name.toLowerCase()));
  const poseBox = () => {
    animated.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const b of framed.length ? framed : bones) box.expandByPoint(b.getWorldPosition(at));
    // A playing set is framed whole: every member's joints, but for their helper joints.
    for (const m of playingSet) {
      m.group.updateMatrixWorld(true);
      for (const b of m.framed) box.expandByPoint(b.getWorldPosition(at));
    }
    return box;
  };
  /**
   * Fits the view: in place, to the whole animation, so a drop or a climb stays in view; with root
   * motion, to the pose now, since the view follows the rig.
   */
  const frame = () => {
    let box = poseBox();
    const a = info();
    // In place, or with a set playing (which stays where it is), the whole animation is framed.
    if (action && a && (!rootMotion || playingSet.length > 0) && a.duration > 0) {
      const keep = action.time;
      for (let k = 0; k <= 8; k++) {
        action.time = (a.duration * k) / 8;
        mixer.update(0);
        syncSet();
        box = box.union(poseBox());
      }
      action.time = keep;
      mixer.update(0);
      syncSet();
      moveDots();
    }
    if (box.isEmpty()) return;
    const centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 0.25);
    const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
    camera.near = Math.max(0.001, distance / 1000);
    camera.far = distance * 100;
    camera.position.copy(centre).add(new THREE.Vector3(1, 0.6, 1).normalize().multiplyScalar(distance));
    camera.updateProjectionMatrix();
    controls.target.copy(centre);
    controls.update();
    const size = box.getSize(new THREE.Vector3());
    span = Math.ceil(Math.max(size.x, size.z, 1) * 2);
    sizeGrid();
    grid.position.y = box.min.y;
    followed = undefined;
  };
  let span = 1;
  // With root motion the grid stays where it is and spans more, so the rig's travel shows against it.
  const sizeGrid = () => grid.scale.setScalar(rootMotion && playingSet.length === 0 ? Math.max(span, 50) : span);

  // With root motion on, the camera keeps to the body: it moves by as much as Hips moved. Root would not
  // do: it stays on the ground while a body drops from the AV (3.1 m below the hips at the start), so the
  // drop would leave the view. A rig with no Hips (a vehicle's) follows its Root.
  const rootBone = bones.find((b) => b.name === "Hips") ?? bones.find((b) => b.name === "Root");
  let followed: THREE.Vector3 | undefined;
  const follow = () => {
    // A set stays where it is: the view frames all of it instead of following one member.
    if (!rootBone || !rootMotion || playingSet.length > 0) {
      followed = undefined;
      return;
    }
    const now = rootBone.getWorldPosition(new THREE.Vector3());
    if (followed) {
      const by = now.clone().sub(followed);
      camera.position.add(by);
      controls.target.add(by);
    }
    followed = now;
  };

  // ---- the transport ---------------------------------------------------------------------------
  const mixer = new THREE.AnimationMixer(animated);
  let rootMotion = !!source.rootMotion;
  let action: THREE.AnimationAction | null = null;
  let current = -1;
  let playing = false;
  /** It reached its end with Loop off: Play starts it again. */
  let ended = false;
  let loop = true;
  let speed = 1;
  /** Parsed clips, the newest last; a few are kept so going back and forth does not ask again. */
  const clips = new Map<number, THREE.AnimationClip>();
  let asking = 0;

  /** Which way it plays: 1 forward, -1 backward. */
  let direction = 1;
  // The transport's buttons as the usual media icons (the owner's AE5 run, 2026-11-25).
  const transportButton = (shape: string, title: string) => {
    const b = el("button", "icon animtbtn");
    setIcon(b, shape, title);
    return b;
  };
  const setIcon = (b: HTMLButtonElement, shape: string, title: string) => {
    b.title = title;
    b.setAttribute("aria-label", title.split(" (")[0]);
    b.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="${shape}"/></svg>`;
  };
  const Shapes = {
    play: "M3.5 2.5v11L12.5 8z",
    playBack: "M12.5 2.5v11L3.5 8z",
    pause: "M4 3h3v10H4zM9 3h3v10H9z",
  };
  const toStart = transportButton("M2 3h1.6v10H2zM9.4 3v10L3.8 8zM15 3v10L9.4 8z", "Jump to the beginning (Home)");
  const back = transportButton("M3 3h1.6v10H3zM13 3v10L5.4 8z", "Step back one frame (Left arrow)");
  const playBack = transportButton(Shapes.playBack, "Play backward");
  const stop = transportButton("M3.5 3.5h9v9h-9z", "Stop, back to the beginning");
  const play = transportButton(Shapes.play, "Play forward (Space)");
  const forward = transportButton("M3 3v10L10.6 8zM11.4 3H13v10h-1.6z", "Step forward one frame (Right arrow)");
  const toEnd = transportButton("M1 3v10L6.6 8zM6.6 3v10L12.2 8zM12.4 3H14v10h-1.6z", "Jump to the end (End)");
  const scrub = el("input", "animscrub");
  scrub.type = "range";
  scrub.min = "0";
  scrub.max = "1";
  scrub.step = "any";
  scrub.value = "0";
  scrub.title = "Drag to any moment";
  const time = el("span", "dim mono animtime", "");
  const loopButton = el("button", "on", "Loop");
  loopButton.title = "Play it again from the start when it ends";
  const speedPick = el("select");
  speedPick.title = "Playback speed";
  for (const s of Speeds) {
    const o = el("option", "", `${s}×`);
    o.value = String(s);
    if (s === 1) o.selected = true;
    speedPick.appendChild(o);
  }
  const buttons = el("span", "animtbuttons");
  buttons.append(toStart, back, playBack, stop, play, forward, toEnd);
  transport.append(buttons, scrub, time, loopButton, speedPick);

  const fit = el("button", "", "Frame");
  fit.title = "Fit the view to the rig";
  fit.addEventListener("click", frame);
  const rigName = el("span", "dim mono animrig", source.rig ? `Rig ${source.rig.split("\\").pop()}` : "");
  rigName.title = source.rig;
  const toggle = (label: string, title: string, on: boolean, set: (on: boolean) => void) => {
    const b = el("button", on ? "on" : "", label);
    b.title = title;
    b.addEventListener("click", () => {
      const now = !b.classList.contains("on");
      b.classList.toggle("on", now);
      set(now);
    });
    return b;
  };
  // With a body the bones are off at first; without one they are all there is to see. A set's members
  // follow the same two switches.
  let bonesShown = !bodyRoot;
  let bodyShown = true;
  const showBones = (on: boolean) => {
    bonesShown = on;
    lines.visible = on;
    dots.visible = on;
    for (const m of playingSet) m.lines.visible = on || m.meshes.length === 0;
  };
  const bonesButton = toggle("Bones", "Show the bones and joints", !bodyRoot, showBones);
  bar.append(fit);
  if (bodyRoot) {
    const meshes: THREE.Object3D[] = [];
    bodyRoot.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o);
    });
    bar.append(
      toggle("Body", "Show the body", true, (on) => {
        bodyShown = on;
        meshes.forEach((m) => (m.visible = on));
        for (const p of playingSet) p.meshes.forEach((m) => (m.visible = on));
      }),
      bonesButton,
    );
  }
  /** Root motion on or off: the keys come again from the other export, and the same animation goes on at the same moment. */
  const applyRootMotion = async (on: boolean) => {
    rootMotion = on;
    rootMotionButton.classList.toggle("on", on);
    // A set is placed by its members' root motion: without it, it stops.
    if (!on && playingSet.length > 0) stopSet();
    const at = action?.time ?? 0;
    action?.stop();
    action = null;
    for (const c of clips.values()) mixer.uncacheClip(c);
    clips.clear();
    sizeGrid();
    // The rig jumps to where the other keys put it: the view goes with it.
    if (current >= 0) {
      await pick(current, at, true);
      frame();
    }
  };
  const rootMotionButton = toggle("Root motion", "Move the whole rig as the animation moves it through the scene; off, it plays in place", rootMotion, (on) => void applyRootMotion(on));
  bar.append(rootMotionButton, ...lightControls(lighting, source.onLight), rigName);
  if (bodyRoot && source.body) {
    const bodyName = el("span", "dim animrig", `On ${source.body.label}`);
    bodyName.title = [source.body.label, ...source.body.notes].join("\n");
    bar.append(bodyName);
  }
  const bodyProblem = bodyError || source.bodyNote;
  if (bodyProblem) {
    const warn = el("span", "dim", bodyRoot ? "(not the entity asked for)" : "(bones only)");
    warn.title = bodyProblem;
    bar.append(warn);
    source.say?.(bodyProblem);
  }
  if (source.note) bar.append(el("span", "dim", source.note));
  if (bodyRoot) showBones(false);

  /** While the timeline plays its own frames (TL2): their length, in place of the clip's. */
  let previewDuration: number | undefined;
  const info = () => {
    const a = source.animations[current];
    return a && previewDuration !== undefined ? { ...a, duration: previewDuration } : a;
  };
  const showTime = () => {
    const a = info();
    if (!a) {
      time.textContent = "";
      return;
    }
    const t = action?.time ?? 0;
    time.textContent = `${seconds(t)} / ${seconds(a.duration)}`;
    if (document.activeElement !== scrub) scrub.value = String(t);
    timeline?.tick();
  };
  const setPlaying = (on: boolean) => {
    playing = on;
    const forwards = on && direction > 0;
    const backwards = on && direction < 0;
    play.classList.toggle("on", forwards);
    playBack.classList.toggle("on", backwards);
    // The button playing shows Pause, and pauses (the owner, 2026-11-26).
    setIcon(play, forwards ? Shapes.pause : Shapes.play, forwards ? "Pause at this frame (Space)" : "Play forward (Space)");
    setIcon(playBack, backwards ? Shapes.pause : Shapes.playBack, backwards ? "Pause at this frame (Space)" : "Play backward");
    if (action) {
      action.paused = !on;
      action.timeScale = direction;
    }
  };
  /** Shows the pose at a moment, playing or not. */
  const seek = (t: number) => {
    if (!action) return;
    ended = false;
    const a = info();
    action.time = Math.max(0, Math.min(t, a?.duration ?? t));
    action.paused = !playing;
    action.enabled = true;
    mixer.update(0);
    syncSet();
    moveDots();
    follow();
    showTime();
  };
  const step = (by: number) => {
    const a = info();
    if (!a || !action) return;
    setPlaying(false);
    const fps = fpsOf(a) || 30;
    seek(Math.round((action.time + by / fps) * fps) / fps);
  };

  /** Plays one way from where it stands; at that way's end, from the other end. */
  const playWay = (way: number) => {
    if (!action) return;
    const a = info();
    const length = a?.duration ?? 0;
    direction = way;
    const frameLength = 1 / (fpsOf(a!) || 30);
    if (way > 0 && (ended || action.time >= length - frameLength / 2)) action.time = 0;
    if (way < 0 && (ended || action.time <= frameLength / 2)) action.time = length;
    ended = false;
    action.enabled = true;
    action.paused = false;
    if (!action.isRunning()) action.play();
    setPlaying(true);
    showTime();
  };
  // Play while playing that way pauses; the other way turns round.
  play.addEventListener("click", () => (playing && direction > 0 ? setPlaying(false) : playWay(1)));
  playBack.addEventListener("click", () => (playing && direction < 0 ? setPlaying(false) : playWay(-1)));
  // Stop: no more playing, and back to the beginning (the owner, 2026-11-26).
  stop.addEventListener("click", () => {
    setPlaying(false);
    seek(0);
  });
  toStart.addEventListener("click", () => {
    setPlaying(false);
    seek(0);
  });
  toEnd.addEventListener("click", () => {
    setPlaying(false);
    seek(info()?.duration ?? 0);
  });
  back.addEventListener("click", () => step(-1));
  forward.addEventListener("click", () => step(1));
  // The keys of the transport, while the 3D view or the transport (not a text box) has the keyboard. On the view's
  // own elements, which go with it, not on the page's container, which the tree uses too.
  stage.tabIndex = -1;
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    // The timeline's keys first (Delete, S, Ctrl+Z, W and E for the grabbed bone, Esc), while the view has the keyboard.
    if (timeline?.key(e)) return;
    if (e.ctrlKey || e.altKey || e.metaKey || t.closest("input, textarea, select")) return;
    // Space on a button presses that button.
    if (e.code === "Space" && t.closest("button")) return;
    const keys: Record<string, () => void> = {
      Space: () => (playing ? setPlaying(false) : playWay(direction)),
      ArrowLeft: () => step(-1),
      ArrowRight: () => step(1),
      Home: () => toStart.click(),
      End: () => toEnd.click(),
    };
    const run = keys[e.code];
    if (!run) return;
    e.preventDefault();
    run();
  };
  stage.addEventListener("keydown", onKey);
  transport.addEventListener("keydown", onKey);
  scrub.addEventListener("input", () => {
    setPlaying(false);
    seek(Number(scrub.value));
  });
  loopButton.addEventListener("click", () => {
    loop = !loop;
    loopButton.classList.toggle("on", loop);
    action?.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  });
  speedPick.addEventListener("change", () => {
    speed = Number(speedPick.value);
  });
  mixer.addEventListener("finished", () => {
    ended = true;
    setPlaying(false);
    showTime();
  });

  // ---- the list --------------------------------------------------------------------------------
  const filter = el("input", "animfilter");
  filter.type = "text";
  filter.placeholder = `Filter ${source.animations.length.toLocaleString()} animations`;
  filter.spellcheck = false;
  const list = el("div", "animlist");
  // A3: the picked clip's synced set, when it has one.
  const setBox = el("div", "animset");
  setBox.hidden = true;
  if (source.lipSync) {
    const lipSyncButton = el("button", "", "Open in Lip Sync");
    lipSyncButton.title = "See this character's lip synced lines in the Lip Sync editor, at the line shown here: its voice, its curves and the head it was made for";
    lipSyncButton.addEventListener("click", () => source.lipSync!(info()?.name));
    bar.insertBefore(lipSyncButton, bar.firstChild);
  }
  // AT2: the Make panel above the list, shown by the bar's Make button.
  const make = source.make ? makePanel(source.make, () => info()?.name) : undefined;
  // AE2: the Edit panel on a made clip's own set, shown by the bar's Edit button.
  const editInfo = source.edit ? await source.edit.info().catch(() => null) : null;
  // A marker on the bone a step's form names; clicking a joint in the view picks it.
  // A dot of a fixed size on screen, over the body: a small ball inside the head did not show (the owner's AE2 run).
  const markerGeometry = new THREE.BufferGeometry();
  markerGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
  const marker = new THREE.Points(markerGeometry, new THREE.PointsMaterial({ color: 0xfcee0a, size: 14, sizeAttenuation: false, depthTest: false, transparent: true }));
  marker.renderOrder = 10;
  marker.frustumCulled = false;
  const showBone = (name: string | null) => {
    marker.removeFromParent();
    const b = name ? bones.find((x) => x.name === name) : undefined;
    if (b) b.add(marker);
  };
  let timeline: TimelinePanel | undefined;
  const editor = editInfo && source.edit
    ? editPanel(source.edit, editInfo, {
        changed: () => timeline?.changed(),
        now: () => action?.time ?? 0,
        seek: (t: number) => {
          setPlaying(false);
          seek(t);
        },
        showBone,
        say: (message: string) => source.say?.(message),
      })
    : undefined;
  // ---- the Animation Timeline under the view (docs/design/animation-timeline.md, TL2 to TL4) ----
  /** The timeline's own frames, played in place of the applied clip while its blocks are changed. */
  let previewClip: THREE.AnimationClip | undefined;
  const previewFrames = (f: Frames | null) => {
    const t = action?.time ?? 0;
    if (!f) {
      if (!previewClip) return;
      mixer.uncacheClip(previewClip);
      previewClip = undefined;
      previewDuration = undefined;
      if (current >= 0) void pick(current, t, true);
      return;
    }
    const times = Float32Array.from({ length: f.count }, (_, i) => i / f.fps);
    const tracks: THREE.KeyframeTrack[] = [];
    for (const [name, rots] of f.rot) {
      const node = THREE.PropertyBinding.sanitizeNodeName(name);
      if (!animated.getObjectByName(node)) continue;
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, rots.flat()));
      const pos = f.pos.get(name);
      if (pos) tracks.push(new THREE.VectorKeyframeTrack(`${node}.position`, times, pos.flat()));
    }
    const duration = (f.count - 1) / f.fps;
    const clip = new THREE.AnimationClip(`${f.name} (timeline)`, duration, tracks);
    action?.stop();
    if (previewClip) mixer.uncacheClip(previewClip);
    previewClip = clip;
    previewDuration = duration;
    action = mixer.clipAction(clip);
    action.clampWhenFinished = true;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.play();
    action.time = Math.min(t, duration);
    action.paused = !playing;
    scrub.max = String(duration || 1);
    mixer.update(0);
    moveDots();
    showTime();
  };
  // The grabbed bone's buttons in the view itself, where the eye is (the owner, 2026-11-26: Turn was not found in the
  // timeline's bar). Move only where it means something: a hand or foot, the root or hips.
  const grabBox = el("div", "animgrab");
  grabBox.hidden = true;
  stage.appendChild(grabBox);
  /** The Bones tab's row for the bone selected in the view, set once the tab is built. */
  let markBone: (name: string | null) => void = () => undefined;
  const showGrabBox = (bone: string | null, mode: "move" | "turn") => {
    markBone(bone);
    grabBox.hidden = !bone || !timeline;
    if (!bone || !timeline) return;
    const t = timeline;
    const b = (label: string, title: string, on: boolean, run: () => void) => {
      const x = el("button", on ? "on" : "", label);
      x.title = title;
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        run();
      });
      return x;
    };
    const chain = t.isChain(bone);
    const hand = handOf(bone);
    const curls: HTMLElement[] = [];
    if (hand && t.profile()?.kind === "person") {
      if (hand.finger) curls.push(curlSlider("Curl", `Curl: bend the ${hand.finger.toLowerCase()} toward the palm (right) or open it (left), every joint of it together`, hand.side, [hand.finger]));
      curls.push(curlSlider("Fist", "Fist: bend every finger and the thumb toward the palm (right) or open the hand (left)", hand.side, FingerNames));
    }
    grabBox.replaceChildren(
      el("span", "animgrabname", bone),
      ...(t.canMove(bone) ? [b("Move", chain ? "Move: drag the hand or foot by its arrows; the arm or leg bends after it (W)" : "Move: slide the bone by its arrows (W)", mode === "move", () => t.setGrabMode("move"))] : []),
      b("Turn", "Turn: drag a ring to turn the bone about that axis (E)", mode === "turn", () => t.setGrabMode("turn")),
      ...curls,
      b("Let Go", "Let Go: take the handles away (Esc)", false, () => t.grab(null)),
    );
  };

  // ---- Curl and Fist (the owner, 2026-11-26): a finger's joints, or the whole hand's, bent toward the palm at once ----
  const FingerNames = ["Thumb", "Index", "Middle", "Ring", "Pinky"];
  /**
   * How far each joint bends at full curl, in degrees, on top of the pose shown: the thumb less than the fingers. Checked
   * on man_base's rig from its relaxed rest pose (2026-11-26): the index tip comes back to the knuckle, tucked in.
   */
  const MaxBend: Record<string, number[]> = { Thumb: [30, 50, 40], other: [70, 90, 60] };
  /** The hand a bone belongs to, and its finger: LeftHand, RightHandIndex2, RightInHandPinky. */
  const handOf = (bone: string): { side: "Left" | "Right"; finger: string | null } | null => {
    const m = /^(Left|Right)(?:Hand|InHand)(Thumb|Index|Middle|Ring|Pinky)?(?:\d*)$/.exec(bone);
    return m ? { side: m[1] as "Left" | "Right", finger: m[2] ?? null } : null;
  };
  const jointsOf = (side: string, finger: string) => [1, 2, 3].map((n) => boneNamed(`${side}Hand${finger}${n}`)).filter((x): x is THREE.Bone => !!x);
  type CurlJoint = { bone: THREE.Bone; base: THREE.Quaternion; axis: THREE.Vector3; max: number };
  /**
   * Each joint's bend: the palm faces along the hand's forward (wrist to middle knuckle) crossed with its width
   * (index to pinky knuckle), the order set by the side; a joint bends about its own direction crossed with that,
   * so a positive turn takes the fingertip toward the palm. The axis is kept in the joint's own frame, from the
   * pose at the playhead, so the turn is that pose and the bend.
   */
  const curlPlan = (side: "Left" | "Right", fingers: string[]): CurlJoint[] => {
    const hand = boneNamed(`${side}Hand`);
    const index1 = boneNamed(`${side}HandIndex1`);
    const pinky1 = boneNamed(`${side}HandPinky1`);
    const middle1 = boneNamed(`${side}HandMiddle1`);
    if (!hand || !index1 || !pinky1 || !middle1) return [];
    hand.updateWorldMatrix(true, true);
    const at = (b: THREE.Object3D) => b.getWorldPosition(new THREE.Vector3());
    const width = at(pinky1).sub(at(index1)).normalize();
    const forward = at(middle1).sub(at(hand)).normalize();
    const palm = (side === "Right" ? forward.clone().cross(width) : width.clone().cross(forward)).normalize();
    const plan: CurlJoint[] = [];
    for (const finger of fingers) {
      const joints = jointsOf(side, finger);
      joints.forEach((j, i) => {
        const next = joints[i + 1];
        const dir = next ? at(next).sub(at(j)) : i > 0 ? at(j).sub(at(joints[i - 1])) : forward.clone();
        const axisWorld = dir.normalize().cross(palm);
        if (axisWorld.lengthSq() < 1e-8) return;
        axisWorld.normalize();
        const axis = axisWorld.applyQuaternion(j.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
        const max = ((MaxBend[finger] ?? MaxBend.other)[i] * Math.PI) / 180;
        plan.push({ bone: j, base: j.quaternion.clone(), axis, max });
      });
    }
    return plan;
  };
  /** A slider's own bend: the pose it started from, kept while the same slider stays at the same moment. */
  let curl: { key: string; time: number; plan: CurlJoint[]; value: number } | null = null;
  let curling = false;
  const curlSlider = (label: string, title: string, side: "Left" | "Right", fingers: string[]) => {
    const key = `${side}:${fingers.join(",")}`;
    const box = el("label", "animcurl");
    box.title = title;
    const input = el("input");
    input.type = "range";
    input.min = "-0.3";
    input.max = "1";
    input.step = "0.01";
    const now = () => Math.round((action?.time ?? 0) * 1000) / 1000;
    input.value = curl && curl.key === key && curl.time === now() ? String(curl.value) : "0";
    input.addEventListener("input", () => {
      if (!timeline) return;
      if (!curling) {
        // A new slider or another moment: the bend starts again from the pose now shown.
        if (!curl || curl.key !== key || curl.time !== now()) curl = { key, time: now(), plan: curlPlan(side, fingers), value: 0 };
        if (!curl.plan.length) return;
        setPlaying(false);
        timeline.poseStart(curl.plan.map((p) => p.bone.name));
        curling = true;
      }
      const v = Number(input.value);
      curl!.value = v;
      const turns: Record<string, number[]> = {};
      for (const p of curl!.plan) turns[p.bone.name] = p.base.clone().multiply(new THREE.Quaternion().setFromAxisAngle(p.axis, v * p.max)).toArray();
      timeline.poseSet(turns);
    });
    input.addEventListener("change", () => {
      if (!curling) return;
      curling = false;
      timeline?.poseEnd();
    });
    box.append(document.createTextNode(label), input);
    return box;
  };
  // The grabbed bone's handles (TL4): three.js's TransformControls on a stand-in that sits on the bone.
  let handles: TransformControls | undefined;
  const handleAt = new THREE.Object3D();
  let grabbedBone: THREE.Bone | undefined;
  let grabMode: "move" | "turn" = "turn";
  const placeHandles = () => {
    if (!grabbedBone || handles?.dragging) return;
    grabbedBone.getWorldPosition(handleAt.position);
    grabbedBone.getWorldQuaternion(handleAt.quaternion);
  };
  const boneNamed = (name: string) => bones.find((b) => b.name === name);
  /** The grabbed bone's value at the playhead, as the timeline's keys hold it (TL1's rules). */
  const grabValue = (): { place?: number[]; turn?: number[] } | undefined => {
    if (!grabbedBone || !timeline) return undefined;
    const profile = timeline.profile();
    const chain = profile?.chains[grabbedBone.name];
    const anchor = chain ? (chain.space === "root" ? boneNamed(profile!.root) : boneNamed(chain.bones[0])?.parent) : grabbedBone.parent;
    if (!anchor) return undefined;
    anchor.updateMatrixWorld(true);
    if (grabMode === "move") return { place: anchor.worldToLocal(handleAt.position.clone()).toArray() };
    const q = anchor.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handleAt.quaternion);
    return { turn: q.toArray() };
  };
  const timelineHost = editor && editInfo && source.edit?.clip
    ? {
        info: editInfo,
        steps: () => editor.steps(),
        setSteps: (next: Parameters<typeof editor.setSteps>[0]) => editor.setSteps(next),
        dirty: () => editor.dirty(),
        apply: () => editor.apply(),
        clip: (src?: Parameters<NonNullable<EditApi["clip"]>>[0]) => source.edit!.clip!(src),
        now: () => action?.time ?? 0,
        seek: (t: number) => {
          setPlaying(false);
          seek(t);
        },
        playing: () => playing,
        togglePlay: () => (playing ? setPlaying(false) : playWay(direction)),
        preview: previewFrames,
        chooseStep: (index: number) => {
          if (editTab) showTab(editTab);
          editor.choose(index);
        },
        grabbed: (bone: string | null, mode: "move" | "turn") => {
          grabMode = mode;
          grabbedBone = bone ? boneNamed(bone) : undefined;
          showBone(bone);
          showGrabBox(grabbedBone ? bone : null, mode);
          if (!grabbedBone) {
            handles?.detach();
            return;
          }
          if (!handles) {
            handles = new TransformControls(camera, renderer.domElement);
            handles.setSize(0.8);
            scene.add(handleAt, handles.getHelper());
            handles.addEventListener("dragging-changed", (ev) => {
              controls.enabled = !ev.value;
              if (ev.value) {
                setPlaying(false);
                timeline?.grabStart();
              } else timeline?.grabEnd();
            });
            handles.addEventListener("objectChange", () => {
              if (!handles?.dragging) return;
              const v = grabValue();
              if (v) timeline?.grabMove(v);
            });
          }
          placeHandles();
          handles.attach(handleAt);
          handles.setMode(mode === "move" ? "translate" : "rotate");
          handles.setSpace(mode === "move" ? "world" : "local");
        },
        say: (message: string) => source.say?.(message),
      }
    : undefined;
  if (timelineHost) {
    timeline = timelinePanel(timelineHost);
    container.insertBefore(timeline.box, transport);
    const timelineButton = el("button", "on", "Timeline");
    timelineButton.title = "Show the timeline under the view: the clip's blocks on tracks, its keys and blends";
    timelineButton.addEventListener("click", () => {
      timeline!.box.hidden = !timeline!.box.hidden;
      timelineButton.classList.toggle("on", !timeline!.box.hidden);
    });
    bar.insertBefore(timelineButton, bar.firstChild);
  }
  if (editor) {
    // A click (not a drag) near a joint fills the form's bone, when the form has one; else it grabs the joint for the timeline.
    let down: { x: number; y: number } | null = null;
    renderer.domElement.addEventListener("pointerdown", (e) => (down = handles?.axis ? null : { x: e.clientX, y: e.clientY }));
    renderer.domElement.addEventListener("pointerup", (e) => {
      const from = down;
      down = null;
      if (!from || Math.hypot(e.clientX - from.x, e.clientY - from.y) > 4) return;
      const forForm = editor.wantsBone();
      if (!forForm && (!timeline || timeline.box.hidden)) return;
      const r = renderer.domElement.getBoundingClientRect();
      const grabbing = !!timeline && !timeline.box.hidden;
      let best: { name: string; d: number } | null = null;
      let chain: { name: string; d: number } | null = null;
      for (const b of framed.length ? framed : bones) {
        const p = b.getWorldPosition(new THREE.Vector3()).project(camera);
        if (p.z > 1) continue;
        const d = Math.hypot(((p.x + 1) / 2) * r.width - (e.clientX - r.left), ((1 - p.y) / 2) * r.height - (e.clientY - r.top));
        if (d < 14 && (!best || d < best.d)) best = { name: b.name, d };
        if (d < 14 && timeline?.isChain(b.name) && (!chain || d < chain.d)) chain = { name: b.name, d };
      }
      // A hand or a foot among the joints there wins over the helper joints crowded round a wrist or an ankle.
      if (chain) best = chain;
      if (!best) return;
      // Both: the form's bone, and the timeline's handles on it.
      if (forForm) editor.pickBone(best.name, grabbing);
      if (grabbing) timeline!.grab(best.name);
    });
  }
  // The side column's tabs (the owner, 2026-11-25): Clip, Edit and Animations, each with the column's whole height,
  // where the Make and Edit panels above the list squeezed each other and the list.
  const animPane = el("div", "animpane");
  animPane.append(el("div", "label", "Animations"), filter, list, setBox);
  const tabRow = el("div", "sidetabs");
  type SideTab = { button: HTMLButtonElement; pane: HTMLElement; shown?: () => void; left?: () => void };
  const sideTabs: SideTab[] = [];
  let currentTab: SideTab | undefined;
  const showTab = (t: SideTab) => {
    if (currentTab && currentTab !== t) currentTab.left?.();
    for (const x of sideTabs) {
      x.pane.hidden = x !== t;
      x.button.classList.toggle("on", x === t);
    }
    currentTab = t;
  };
  const addTab = (label: string, title: string, pane: HTMLElement, shown?: () => void, left?: () => void): SideTab => {
    const button = el("button", "sidetab", label) as HTMLButtonElement;
    button.title = title;
    pane.classList.add("sidepane");
    const t: SideTab = { button, pane, shown, left };
    button.addEventListener("click", () => {
      showTab(t);
      t.shown?.();
    });
    sideTabs.push(t);
    tabRow.append(button);
    side.append(pane);
    return t;
  };
  side.append(tabRow);
  const clipTab = make
    ? addTab("Clip", source.make!.why ?? "Make a clip from words with Uthana, or from a .glb, as a new clip or in place of the one shown", make.box, () => make.focus())
    : undefined;
  const editTab = editor
    ? addTab("Edit", "Edit this made clip: pin a sliding foot, key a bone, lay another clip on some bones, trim, loop. The clip as made is kept", editor.box, undefined, () => showBone(null))
    : undefined;
  const animsTab = addTab("Animations", "The clips in this file", animPane);
  // ---- the Bones tab (the owner, 2026-11-26): every bone by name, filtered; a click selects it in the view ----
  // A collapsible tree as REDcode's other trees, a filter with its clear button, and Add Clip under the list.
  const bonesPane = el("div", "animpane bonepane");
  const filterBox = el("div", "bonefilterbox");
  const boneFilter = el("input", "animfilter");
  boneFilter.type = "text";
  boneFilter.spellcheck = false;
  const filterClear = el("button", "bonefilterclear", "×");
  filterClear.title = "Clear the filter";
  filterClear.hidden = true;
  filterBox.append(boneFilter, filterClear);
  const boneList = el("div", "animlist bonelist");
  const boneTools = el("div", "toolbar bonetools");
  const addClipButton = el("button", "", "Add Clip");
  boneTools.append(addClipButton);
  bonesPane.append(el("div", "label", "Bones"), filterBox, boneList, boneTools);
  type BoneNode = { bone: THREE.Bone; row: HTMLElement; toggle: HTMLElement; parent: BoneNode | null; children: BoneNode[]; depth: number };
  const boneNodes = new Map<string, BoneNode>();
  /** Bones whose children show: at first every one but the hands, so the fingers wait under them. */
  const openBones = new Set<string>();
  let markedBone: string | null = null;
  const selectBone = (name: string) => {
    // With the timeline, the bone is grabbed, handles and all; without it (a game clip), marked in the view.
    if (timeline) timeline.grab(name);
    else showBone(name);
    markBone(name);
  };
  const filterWords = () => boneFilter.value.toLowerCase().split(/\s+/).filter(Boolean);
  /** Shows the rows: while filtered, every match flat; else each bone whose parents are all open. */
  const showBoneRows = () => {
    const words = filterWords();
    for (const n of boneNodes.values()) {
      let shown: boolean;
      if (words.length) shown = words.every((w) => n.bone.name.toLowerCase().includes(w));
      else {
        shown = true;
        for (let p = n.parent; p; p = p.parent) if (!openBones.has(p.bone.name)) shown = false;
      }
      n.row.hidden = !shown;
      n.row.style.paddingLeft = `${6 + (words.length ? 0 : Math.min(n.depth, 14) * 12)}px`;
      n.toggle.textContent = words.length || !n.children.length ? "" : openBones.has(n.bone.name) ? "▾" : "▸";
    }
    filterClear.hidden = !boneFilter.value;
  };
  const fillBones = () => {
    if (boneNodes.size || !bones.length) return;
    const named = bones.filter((b) => b.name);
    boneFilter.placeholder = `Filter ${named.length.toLocaleString()} bones`;
    for (const b of named) {
      const row = el("div", "row bonerow");
      const toggle = el("span", "toggle", "");
      row.append(toggle, el("span", "name", b.name));
      row.title = `${b.name}${b.parent?.name ? `\nIn ${b.parent.name}` : ""}\nClick to select it in the view`;
      const parent = b.parent && boneNodes.get(b.parent.name) ? boneNodes.get(b.parent.name)! : null;
      const node: BoneNode = { bone: b, row, toggle, parent, children: [], depth: parent ? parent.depth + 1 : 0 };
      parent?.children.push(node);
      boneNodes.set(b.name, node);
      if (!/^(Left|Right)Hand$/.test(b.name)) openBones.add(b.name);
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!node.children.length || filterWords().length) return;
        if (openBones.has(b.name)) openBones.delete(b.name);
        else openBones.add(b.name);
        showBoneRows();
      });
      row.addEventListener("click", () => selectBone(b.name));
      boneList.append(row);
    }
    showBoneRows();
    markBone(markedBone);
  };
  markBone = (name) => {
    markedBone = name;
    // The bone selected in the view: its parents opened so its row shows, lit and in sight.
    const node = name ? boneNodes.get(name) : undefined;
    let opened = false;
    for (let p = node?.parent; p; p = p.parent)
      if (!openBones.has(p.bone.name)) {
        openBones.add(p.bone.name);
        opened = true;
      }
    if (opened) showBoneRows();
    for (const n of boneNodes.values()) n.row.classList.toggle("selected", n.bone.name === name);
    if (node && !bonesPane.hidden) node.row.scrollIntoView({ block: "nearest" });
    showAddClip();
  };
  boneFilter.addEventListener("input", showBoneRows);
  filterClear.addEventListener("click", () => {
    boneFilter.value = "";
    showBoneRows();
    boneFilter.focus();
  });
  boneFilter.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && boneFilter.value) {
      boneFilter.value = "";
      showBoneRows();
    }
  });
  // Add Clip: a short move and its blend for the selected bone, on the selected track at the time marker; greyed, with
  // why in its tooltip, when there is no room there (a later step may splice it in; the owner, 2026-11-26).
  const showAddClip = () => {
    if (!timeline) {
      addClipButton.disabled = true;
      addClipButton.title = "Add Clip works on a made clip, with its timeline";
      return;
    }
    const room = timeline.addClipRoom(markedBone);
    addClipButton.disabled = !room.ok;
    addClipButton.title = room.ok ? `Add Clip: a short move for ${markedBone} and a blend after it, on the selected track at the time marker` : room.why;
  };
  addClipButton.addEventListener("click", () => {
    if (timeline && markedBone) timeline.addClip(markedBone);
    showAddClip();
  });
  timeline?.onDraw(() => {
    if (!bonesPane.hidden) showAddClip();
  });
  addTab("Bones", "Every bone of the rig by name, with a filter: a click selects it in the view", bonesPane, () => {
    fillBones();
    showAddClip();
    boneFilter.focus();
  });
  tabRow.hidden = sideTabs.length < 2;
  // A clip just rebuilt from the Edit panel opens on Edit, where the modder left it, and an edited clip too, since its
  // steps are what it is about; a made clip's own tab opens on Clip, its words and how it was made.
  showTab(editTab && (editInfo?.open || editInfo?.edited) ? editTab : clipTab && source.make?.from && !source.make.why ? clipTab : animsTab);
  const rows: HTMLElement[] = source.animations.map((a, i) => {
    const row = el("div", "part animrow");
    const fps = fpsOf(a);
    row.append(el("span", "name", a.name), el("span", "size", seconds(a.duration)));
    row.title = `${a.name}\n${seconds(a.duration)}, ${a.frames.toLocaleString()} frames${fps ? `, ${fps} fps` : ""}`;
    row.addEventListener("click", () => void pick(i));
    return row;
  });
  list.append(...rows);
  filter.addEventListener("input", () => {
    const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
    source.animations.forEach((a, i) => {
      const name = a.name.toLowerCase();
      rows[i].hidden = !words.every((w) => name.includes(w));
    });
  });

  /**
   * Goes to an animation: asks the host for its keys unless they are here, then plays it, from at when
   * given. sameClip: the same animation again (root motion switched), so a playing set goes on.
   */
  async function pick(index: number, at?: number, sameClip = false): Promise<void> {
    const a = source.animations[index];
    if (!a) return;
    const mine = ++asking;
    if (!sameClip) {
      stopSet();
      void refreshSet(a.name);
    }
    rows.forEach((r, i) => r.classList.toggle("selected", i === index));
    rows[index].scrollIntoView({ block: "nearest" });
    current = index;
    make?.refresh();
    time.textContent = "Loading…";
    let clip = clips.get(index);
    if (!clip) {
      try {
        const parsed = await loader.parseAsync(await source.clip(index, rootMotion), "");
        clip = parsed.animations[0];
        if (!clip) throw new Error("the export holds no keys for it");
        // The file's length, not the last key's time: a still channel has one key, at any time.
        if (a.duration > 0) clip.duration = a.duration;
      } catch (e) {
        if (mine === asking) time.textContent = `Could not read it: ${e instanceof Error ? e.message : String(e)}`;
        return;
      }
      clips.set(index, clip);
      if (clips.size > 8) {
        const oldest = clips.keys().next().value as number;
        if (oldest !== current) {
          mixer.uncacheClip(clips.get(oldest)!);
          clips.delete(oldest);
        }
      }
    }
    if (mine !== asking) return;
    action?.stop();
    ended = false;
    action = mixer.clipAction(clip);
    action.reset();
    action.clampWhenFinished = true;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.play();
    scrub.max = String(a.duration || 1);
    scrub.value = "0";
    // A clip of a frame or two is a pose: looped, it would flicker (or seem to run backwards, as each
    // screen frame lands just short of the last), so it opens paused.
    const pose = a.duration < 0.1;
    const wasPlaying = (at === undefined || playing) && !pose;
    setPlaying(wasPlaying);
    if (at !== undefined) action.time = Math.min(at, a.duration);
    mixer.update(0);
    syncSet();
    moveDots();
    follow();
    showTime();
    // The first animation shown fits the view to itself; later picks keep the camera where it is.
    if (!fitted) {
      fitted = true;
      frame();
    }
  }
  let fitted = false;

  // ---- the synced set (A3) ---------------------------------------------------------------------
  /** The picked clip's set as the host listed it, which members are checked, and each one's last placing. */
  let setMembers: SetMemberInfo[] = [];
  let setClip = "";
  let setWhy = "";
  const chosen = new Set<number>();
  const placing = new Map<number, SetPlace>();
  let setBusy = "";
  let setAsking = 0;
  /** Play the set once the picked clip's set is listed (REDcodeApi.openAnimation's set). */
  let wantSet = !!source.playSet;

  const colourOf = (i: number) => MemberColours[(setMembers.slice(0, i).filter((m) => !m.self).length) % MemberColours.length];
  const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

  async function refreshSet(clip: string): Promise<void> {
    const mine = ++setAsking;
    setMembers = [];
    setClip = clip;
    setWhy = "";
    chosen.clear();
    placing.clear();
    renderSetBox();
    if (!source.set || !clip.toLowerCase().startsWith("synced__")) return;
    try {
      const r = await source.set.list(clip);
      if (mine !== setAsking) return;
      setMembers = r.members;
      setWhy = r.why ?? "";
      setMembers.forEach((m, i) => {
        if (!m.self && m.active) chosen.add(i);
      });
    } catch (e) {
      if (mine !== setAsking) return;
      setWhy = e instanceof Error ? e.message : String(e);
    }
    renderSetBox();
    if (wantSet) {
      wantSet = false;
      if (setMembers.some((m) => !m.self)) void playSet();
    }
  }

  function renderSetBox(): void {
    const others = setMembers.filter((m) => !m.self);
    setBox.hidden = others.length === 0 && !setWhy;
    if (setBox.hidden) return;
    const moment = setClip.split("__").slice(1, -1).join("__");
    const head = el("div", "label", "Synced set");
    head.title = moment;
    const rowsOut: HTMLElement[] = [];
    setMembers.forEach((m, i) => {
      const row = el("div", `setrow${m.self ? " self" : ""}`);
      const swatch = el("span", "swatch");
      swatch.style.background = m.self ? cssColourHex("--vscode-textLink-foreground", "#19f3ff") : hex(colourOf(i));
      const name = el("span", "name", m.role);
      const file = el("span", "dim", m.self ? "this file" : m.name.replace(/\.anims$/i, ""));
      row.title = `${m.clip}\n${m.file}\n${m.rig ? `Rig ${m.rig}` : "No rig named"}${m.alternatives ? `\nOne of ${m.alternatives + 1} files for ${m.role}: one shows at a time` : ""}`;
      if (!m.self) {
        const box = el("input");
        box.type = "checkbox";
        box.checked = chosen.has(i);
        box.disabled = !!setBusy;
        box.title = m.alternatives ? `Show this ${m.role} (the others for ${m.role} go)` : `Show ${m.role}`;
        box.addEventListener("change", () => {
          if (box.checked) {
            // One file per role: the player's male and female files are alternatives.
            setMembers.forEach((o, j) => {
              if (j !== i && !o.self && o.role.toLowerCase() === m.role.toLowerCase()) chosen.delete(j);
            });
            chosen.add(i);
          } else chosen.delete(i);
          if (playingSet.length > 0) void playSet();
          else renderSetBox();
        });
        row.append(box);
      }
      row.append(swatch, name, file);
      const p = placing.get(i);
      if (p && !m.self) {
        const state = el("span", "dim why", p.matrix ? (p.ambiguous ? "placed, unsure" : "placed") : "not placed");
        state.title = p.matrix ? `From ${p.from}${p.spread !== null ? `; it stays within ${p.spread.toFixed(3)} m over the clip` : ""}${p.ambiguous ? ". Another member fits that track as well, so the two may be swapped" : ""}` : (p.problem ?? "");
        row.append(state);
      }
      rowsOut.push(row);
    });
    const button = el("button", playingSet.length > 0 ? "on" : "", setBusy || (playingSet.length > 0 ? "Stop the Set" : "Play the Set"));
    button.title = playingSet.length > 0 ? "Show this animation alone again" : "Play every checked member on one clock, each where the sync tracks put it, with root motion on";
    button.disabled = !!setBusy || (playingSet.length === 0 && chosen.size === 0);
    button.addEventListener("click", () => {
      if (playingSet.length > 0) {
        stopSet();
        frame();
      } else void playSet();
    });
    const out: HTMLElement[] = [head, ...rowsOut];
    if (others.length > 0) out.push(button);
    if (setWhy) out.push(el("div", "dim setnote", setWhy));
    setBox.replaceChildren(...out);
  }

  function cssColourHex(name: string, fallback: string): string {
    return `#${cssColour(name, fallback).getHexString()}`;
  }

  /** Places the checked members and plays them with this clip, replacing a set already playing. */
  async function playSet(): Promise<void> {
    if (!source.set || setBusy) return;
    const clip = setClip;
    const include = [...chosen];
    setBusy = "Placing…";
    renderSetBox();
    try {
      if (!rootMotion) await applyRootMotion(true);
      const places = await source.set.place(clip, include);
      if (clip !== setClip) return;
      placing.clear();
      for (const p of places) placing.set(p.index, p);
      const loaded: PlayingMember[] = [];
      for (const p of places) {
        const m = setMembers[p.index];
        if (!m || m.self || !p.matrix) continue;
        setBusy = `Loading ${m.role}…`;
        renderSetBox();
        loaded.push(await loadMember(p.index, p.matrix));
        if (clip !== setClip) {
          loaded.forEach(disposeMember);
          return;
        }
      }
      stopSet();
      playingSet = loaded;
      showBones(bonesShown);
      syncSet();
      frame();
      const missing = places.filter((p) => !p.matrix && !setMembers[p.index]?.self).map((p) => setMembers[p.index]?.role);
      if (missing.length) source.say?.(`Not placed: ${missing.join(", ")}. Hover them in the set for why.`);
    } catch (e) {
      setWhy = e instanceof Error ? e.message : String(e);
      source.say?.(setWhy);
    } finally {
      setBusy = "";
      renderSetBox();
    }
  }

  async function loadMember(index: number, matrix: number[]): Promise<PlayingMember> {
    const data = await source.set!.member(index);
    const colour = colourOf(index);
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(colour).lerp(new THREE.Color(0x9aa3b5), 0.55), roughness: 0.75, metalness: 0 });
    const skeleton = (await loader.parseAsync(data.skeleton, "")).scene;
    let memberBody: THREE.Object3D | undefined;
    if (data.body) {
      try {
        memberBody = (await loader.parseAsync(data.body.data, "")).scene;
      } catch {
        memberBody = undefined;
      }
    }
    const meshes: THREE.Object3D[] = [];
    memberBody?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = material;
      mesh.frustumCulled = false;
      mesh.visible = bodyShown;
      meshes.push(mesh);
    });
    const memberRoot = memberBody ?? skeleton;
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    group.matrix.fromArray(matrix);
    group.add(memberRoot);
    scene.add(group);
    group.updateMatrixWorld(true);
    const memberBones: THREE.Bone[] = [];
    memberRoot.traverse((o) => {
      if ((o as THREE.Bone).isBone) memberBones.push(o as THREE.Bone);
    });
    const memberLines = new THREE.SkeletonHelper(memberRoot);
    (memberLines.material as THREE.LineBasicMaterial).vertexColors = false;
    (memberLines.material as THREE.LineBasicMaterial).color = new THREE.Color(colour);
    memberLines.visible = bonesShown || meshes.length === 0;
    scene.add(memberLines);
    const clip = (await loader.parseAsync(data.clip, "")).animations[0];
    if (!clip) throw new Error(`${setMembers[index]?.role}: the export holds no keys for it`);
    const memberMixer = new THREE.AnimationMixer(memberRoot);
    const memberAction = memberMixer.clipAction(clip);
    memberAction.setLoop(THREE.LoopOnce, 1);
    memberAction.clampWhenFinished = true;
    memberAction.play();
    const framedBones = memberBones.filter((b) => !HelperJoints.has(b.name.toLowerCase()));
    return { index, group, mixer: memberMixer, action: memberAction, duration: setMembers[index]?.duration ?? clip.duration, framed: framedBones.length ? framedBones : memberBones, lines: memberLines, meshes, material, root: memberRoot };
  }

  function disposeMember(m: PlayingMember): void {
    m.mixer.stopAllAction();
    scene.remove(m.group);
    scene.remove(m.lines);
    m.lines.dispose();
    m.material.dispose();
    m.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }

  function stopSet(): void {
    if (playingSet.length === 0) return;
    playingSet.forEach(disposeMember);
    playingSet = [];
    sizeGrid();
    renderSetBox();
  }

  const showAnimation = (name: string, options?: { playSet?: boolean }) => {
    const index = source.animations.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());
    if (index < 0) {
      source.say?.(`This file has no animation named ${name}`);
      return;
    }
    filter.value = "";
    rows.forEach((r) => (r.hidden = false));
    if (options?.playSet) {
      if (index === current && setMembers.length > 0) {
        void playSet();
        return;
      }
      wantSet = true;
    }
    void pick(index);
  };

  const resize = () => {
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  frame();

  let running = true;
  const clock = new THREE.Clock();
  const tick = () => {
    if (!running) return;
    // At most a tenth of a second at once, so coming back to a hidden tab does not skip ahead.
    const delta = Math.min(clock.getDelta(), 0.1);
    if (playing && action) {
      mixer.update(delta * speed);
      syncSet();
      moveDots();
      follow();
      showTime();
    }
    placeHandles();
    controls.update();
    lighting.update(camera);
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();

  const kept = source.restore;
  const backIndex = kept?.clip ? source.animations.findIndex((a) => a.name === kept!.clip) : -1;
  if (kept && backIndex >= 0) {
    // Built again after an edit: the same clip, paused at the same moment, from the same camera and speed.
    fitted = true;
    speed = kept.speed;
    speedPick.value = String(kept.speed);
    camera.position.fromArray(kept.camera);
    controls.target.fromArray(kept.target);
    controls.update();
    void pick(backIndex, kept.time);
  } else if (source.initial && source.animations.some((a) => a.name.toLowerCase() === source.initial!.toLowerCase())) showAnimation(source.initial);
  else {
    if (source.initial) source.say?.(`This file has no animation named ${source.initial}`);
    if (source.animations.length > 0) void pick(0);
  }

  return {
    dispose: () => {
      running = false;
      timeline?.dispose();
      handles?.dispose();
      stopSet();
      observer.disconnect();
      controls.dispose();
      mixer.stopAllAction();
      lighting.dispose();
      renderer.dispose();
      dotGeometry.dispose();
      dotMaterial.dispose();
      bodyMaterial.dispose();
      bodyRoot?.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      lines.dispose();
      grid.dispose();
    },
    refreshMaterials: () => undefined,
    showAnimation,
    makeStage: (stage, detail) => make?.stage(stage, detail),
    state: () => ({ clip: info()?.name, time: action?.time ?? 0, speed, camera: camera.position.toArray(), target: controls.target.toArray() }),
  };
}

/**
 * The Make panel (AT2): words for Uthana, or a .glb, made into a new clip in the project or in place of the clip
 * shown. The host does the work and opens the clip it made.
 */
function makePanel(api: MakeApi, shown: () => string | undefined): { box: HTMLElement; refresh: () => void; stage: (stage: string, detail?: string) => void; focus: () => void } {
  const box = el("div", "animmake");
  box.hidden = true;
  box.append(el("div", "label", "Make a Clip"));
  // The clip picked in the list, in the accent colour: what Replace acts on.
  const target = el("div", "maketarget", "");
  if (api.why) {
    box.append(el("div", "dim", api.why));
    return { box, refresh: () => undefined, stage: () => undefined, focus: () => undefined };
  }
  const prompt = el("textarea", "makeprompt");
  prompt.rows = 3;
  prompt.placeholder = "What it shows, such as: a man stands relaxed, raises his right hand and waves hello, then lowers it. Say what the feet do when they move; REDcode asks Uthana for feet that respect the ground (lifting, stepping, running and jumping are fine; floating and sliding are not)";
  prompt.spellcheck = true;

  const length = el("select");
  length.title = "How long, in seconds";
  const model = el("select");
  model.title = "Uthana's model and its price";
  for (const m of MakeModels) {
    const o = el("option", "", `${m.label}, $${m.perSecond.toFixed(m.perSecond < 0.1 ? 3 : 2)}/s`);
    o.value = m.id;
    model.appendChild(o);
  }
  const fillLengths = () => {
    const m = MakeModels.find((x) => x.id === model.value) ?? MakeModels[0];
    const keep = Number(length.value) || 5;
    length.replaceChildren();
    for (let s = m.min; s <= 10; s++) {
      const o = el("option", "", `${s} s`);
      o.value = String(s);
      if (s === Math.max(keep, m.min)) o.selected = true;
      length.appendChild(o);
    }
  };
  fillLengths();
  const check = (label: string, title: string, on: boolean) => {
    const wrap = el("label", "makecheck");
    const input = el("input");
    input.type = "checkbox";
    input.checked = on;
    wrap.title = title;
    wrap.append(input, document.createTextNode(` ${label}`));
    return { wrap, input };
  };
  const inPlace = check("In place", "No travel across the floor: workspots in the game apply no root motion. Off keeps the travel (untried in the game)", true);
  const upperBody = check("Upper body only", "The legs held still (Uthana's torso only), for arm and upper body motions such as a wave or a phone. Off, the whole body moves, with feet that respect the ground", false);
  const asWritten = check("As written", "Send the words as they are; otherwise Uthana rewrites them into a motion description first", false);
  const name = el("input", "makename");
  name.type = "text";
  name.placeholder = "Name: from the words";
  name.spellcheck = false;
  name.title = "The new clip's name: lowercase letters, digits and _";
  // Where the clip goes, as two choices in sight (a dropdown hid Replace: AT2's hand test).
  const goesName = `goesto${Math.random().toString(36).slice(2)}`;
  const choice = (label: string, title: string, on: boolean) => {
    const wrap = el("label", "makecheck");
    const input = el("input");
    input.type = "radio";
    input.name = goesName;
    input.checked = on;
    wrap.title = title;
    const text = el("span", "", label);
    wrap.append(input, document.createTextNode(" "), text);
    return { wrap, input, text };
  };
  const asNew = choice("New Clip", "A new clip, in its own set in the project", true);
  const asReplace = choice("Replace Clip", "In place of the clip picked in the list", false);
  const replacingNow = () => asReplace.input.checked;

  const generate = el("button", "on", "Generate");
  const fromGlb = el("button", "", "From a GLB…");
  fromGlb.title = "A .glb with a clip already on the game's rig (from Blender, say), through the same fit";
  const status = el("div", "dim makestatus", "");
  // While a make runs: how far along (a bar through the stages) and how long so far, in the button.
  const bar = el("div", "makebar");
  const barFill = el("div", "makebarfill");
  bar.appendChild(barFill);
  bar.hidden = true;
  const row = (...kids: HTMLElement[]) => {
    const r = el("div", "makerow");
    r.append(...kids);
    return r;
  };
  // A made clip's own tab: how it was made, and its words ready for another go.
  const from = api.from;
  const madeLine = from ? el("div", "dim makefrom", madeFromText(from)) : undefined;
  if (from && typeof from.prompt === "string") {
    prompt.value = from.prompt;
    if (typeof from.model === "string" && MakeModels.some((m) => m.id === from.model)) model.value = from.model;
    fillLengths();
    if (typeof from.length === "number") length.value = String(from.length);
    upperBody.input.checked = from.upperBodyOnly === true;
    if (typeof from.inPlace === "boolean") inPlace.input.checked = from.inPlace;
  }
  box.append(target);
  if (madeLine) box.append(madeLine);
  box.append(prompt, row(model, length, inPlace.wrap, upperBody.wrap, asWritten.wrap), row(asNew.wrap, asReplace.wrap), row(name), row(generate, fromGlb), bar, status);
  const inputs: (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement)[] = [prompt, model, length, inPlace.input, upperBody.input, asWritten.input, name, asNew.input, asReplace.input, generate, fromGlb];

  /** A make is running: every input stays off until it ends. */
  let busy = false;
  const price = () => {
    const m = MakeModels.find((x) => x.id === model.value) ?? MakeModels[0];
    return Math.round(m.perSecond * Number(length.value) * 100) / 100;
  };
  const refresh = () => {
    const clip = shown();
    target.textContent = api.made ?? clip ?? "";
    target.title = api.made ? "Replace makes this clip again, keeping its name and id" : clip ? `Replace puts the new motion in place of this clip${api.game ? ", in a copy of this game set in the project" : ""}` : "";
    asReplace.wrap.title = api.made ? `Make ${api.made} again, keeping its name and id` : clip ? `In place of ${clip}${api.game ? ", in a copy of this game set in the project" : ""}` : "Pick a clip in the list first";
    if (!busy) asReplace.input.disabled = !clip && !api.made;
    if (asReplace.input.disabled && asReplace.input.checked) asNew.input.checked = true;
    generate.textContent = `Generate, $${price().toFixed(2)}`;
    generate.title = "Uthana makes the motion from the words; it charges only a finished job";
    const replacing = replacingNow();
    if (!busy) name.disabled = replacing;
  };
  model.addEventListener("change", () => {
    fillLengths();
    refresh();
  });
  length.addEventListener("change", refresh);
  asNew.input.addEventListener("change", refresh);
  asReplace.input.addEventListener("change", refresh);
  refresh();

  let started = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let busyButton: HTMLButtonElement = generate;
  let busyShort = "Starting";
  const elapsed = () => {
    const s = Math.floor((Date.now() - started) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const drawBusy = () => {
    const spin = el("span", "makespin");
    busyButton.replaceChildren(spin, document.createTextNode(` ${busyShort}… ${elapsed()}`));
  };
  /** Busy: every input off (so nothing changes under the make), a spinner and the time in the button, the bar. */
  const setBusy = (on: boolean, button: HTMLButtonElement, what: string) => {
    busy = on;
    for (const i of inputs) i.disabled = on;
    box.classList.toggle("busy", on);
    if (on) {
      busyButton = button;
      busyButton.title = what;
      started = Date.now();
      busyShort = MakeSteps[0][1];
      barFill.style.width = "0%";
      bar.hidden = false;
      drawBusy();
      timer = setInterval(drawBusy, 1000);
    } else {
      clearInterval(timer);
      timer = undefined;
      bar.hidden = true;
      fromGlb.textContent = "From a GLB…";
      fromGlb.title = "A .glb with a clip already on the game's rig (from Blender, say), through the same fit";
      refresh();
    }
  };
  const run = async (action: "generate" | "glb") => {
    if (busy) return;
    if (action === "generate" && !prompt.value.trim()) {
      status.textContent = "Say what the animation shows first.";
      prompt.focus();
      return;
    }
    setBusy(true, action === "generate" ? generate : fromGlb, action === "generate" ? "Generating" : "Making the clip from the .glb");
    status.textContent = action === "generate" ? "Starting…" : "Pick the .glb…";
    try {
      const replacing = replacingNow();
      const r = await api.run({
        action,
        ...(action === "generate" ? { prompt: prompt.value.trim(), length: Number(length.value), model: model.value, asWritten: asWritten.input.checked } : {}),
        inPlace: inPlace.input.checked,
        upperBodyOnly: upperBody.input.checked,
        ...(name.value.trim() && !replacing ? { name: name.value.trim() } : {}),
        ...(replacing ? { replace: api.made ?? shown() } : {}),
      });
      // A name is for one clip: the next make names its own unless one is typed again.
      name.value = "";
      status.textContent = `Made ${r.clip}${r.cost !== undefined ? ` ($${r.cost.toFixed(2)})` : ""} in ${r.set}.${r.notes.length ? ` ${r.notes.join(" ")}` : ""}`;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      status.textContent = /cancel/i.test(message) ? "" : `Not made: ${message}`;
    } finally {
      setBusy(false, generate, "");
      // refresh() does not turn the name back on while replacing; the rest come back as they were.
    }
  };
  generate.addEventListener("click", () => void run("generate"));
  fromGlb.addEventListener("click", () => void run("glb"));
  return {
    box,
    refresh,
    stage: (stage, detail) => {
      if (!busy) return;
      status.textContent = MakeStages[stage] ?? `${stage}${detail ? ` ${detail}` : ""}`;
      const at = MakeSteps.findIndex(([s]) => s === stage);
      if (at >= 0) {
        busyShort = MakeSteps[at][1];
        barFill.style.width = `${Math.round(((at + 1) / MakeSteps.length) * 100)}%`;
        drawBusy();
      }
    },
    focus: () => prompt.focus(),
  };
}
