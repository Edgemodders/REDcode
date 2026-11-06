// The animation view (docs/design/animation.md, A1), bundled with the mesh viewer into
// media/mesh/viewer.js and loaded by the CR2W editor's animations mode. It shows an .anims file's rig
// as bones and joints, and plays the animation picked: the list and the skeleton come first, and each
// animation's keys come from the host when it is picked, since an export can hold hundreds of MB.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { cssColour, el } from "./viewerKit";

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
  /** The bytes of a .glb holding only the animation at this index. */
  clip: (index: number) => Promise<ArrayBuffer>;
  /** The animation to open at, by name. */
  initial?: string;
  /** Shown in the toolbar, such as when the file has unsaved edits. */
  note?: string;
  /** Says something to the person: a name that is not in the file. */
  say?: (message: string) => void;
}

export interface AnimsView {
  dispose(): void;
  refreshMaterials(): void;
  /** Goes to an animation by name, and plays it. */
  showAnimation(name: string): void;
}

const Speeds = [0.1, 0.25, 0.5, 1, 2];

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
  note.remove();
  stage.appendChild(renderer.domElement);
  scene.add(root);
  root.updateMatrixWorld(true);

  // Bones as lines from each bone to its parent, joints as dots, both over anything else.
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  const lines = new THREE.SkeletonHelper(root);
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

  const frame = () => {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const b of bones) box.expandByPoint(b.getWorldPosition(at));
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
    const span = Math.ceil(Math.max(size.x, size.z, 1) * 2);
    grid.scale.setScalar(span);
    grid.position.y = box.min.y;
  };

  // ---- the transport ---------------------------------------------------------------------------
  const mixer = new THREE.AnimationMixer(root);
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

  const play = el("button", "", "Play");
  play.title = "Play or pause";
  const back = el("button", "", "◀");
  back.title = "One frame back";
  const forward = el("button", "", "▶");
  forward.title = "One frame on";
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
  transport.append(play, back, forward, scrub, time, loopButton, speedPick);

  const fit = el("button", "", "Frame");
  fit.title = "Fit the view to the rig";
  fit.addEventListener("click", frame);
  const rigName = el("span", "dim mono animrig", source.rig ? `Rig ${source.rig.split("\\").pop()}` : "");
  rigName.title = source.rig;
  bar.append(fit, rigName);
  if (source.note) bar.append(el("span", "dim", source.note));

  const info = () => source.animations[current];
  const showTime = () => {
    const a = info();
    if (!a) {
      time.textContent = "";
      return;
    }
    const t = action?.time ?? 0;
    time.textContent = `${seconds(t)} / ${seconds(a.duration)}`;
    if (document.activeElement !== scrub) scrub.value = String(t);
  };
  const setPlaying = (on: boolean) => {
    playing = on;
    play.textContent = on ? "Pause" : "Play";
    if (action) action.paused = !on;
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
    moveDots();
    showTime();
  };
  const step = (by: number) => {
    const a = info();
    if (!a || !action) return;
    setPlaying(false);
    const fps = fpsOf(a) || 30;
    seek(Math.round((action.time + by / fps) * fps) / fps);
  };

  play.addEventListener("click", () => {
    if (!action) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (ended) action.reset();
    ended = false;
    action.enabled = true;
    action.play();
    setPlaying(true);
    showTime();
  });
  back.addEventListener("click", () => step(-1));
  forward.addEventListener("click", () => step(1));
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
  side.append(el("div", "label", "Animations"), filter, list);
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

  /** Goes to an animation: asks the host for its keys unless they are here, then plays it. */
  async function pick(index: number): Promise<void> {
    const a = source.animations[index];
    if (!a) return;
    const mine = ++asking;
    rows.forEach((r, i) => r.classList.toggle("selected", i === index));
    rows[index].scrollIntoView({ block: "nearest" });
    current = index;
    time.textContent = "Loading…";
    let clip = clips.get(index);
    if (!clip) {
      try {
        const parsed = await loader.parseAsync(await source.clip(index), "");
        clip = parsed.animations[0];
        if (!clip) throw new Error("the export holds no keys for it");
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
    setPlaying(true);
    mixer.update(0);
    moveDots();
    showTime();
  }

  const showAnimation = (name: string) => {
    const index = source.animations.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());
    if (index < 0) {
      source.say?.(`This file has no animation named ${name}`);
      return;
    }
    filter.value = "";
    rows.forEach((r) => (r.hidden = false));
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
      moveDots();
      showTime();
    }
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  };
  tick();

  if (source.initial && source.animations.some((a) => a.name.toLowerCase() === source.initial!.toLowerCase())) showAnimation(source.initial);
  else {
    if (source.initial) source.say?.(`This file has no animation named ${source.initial}`);
    if (source.animations.length > 0) void pick(0);
  }

  return {
    dispose: () => {
      running = false;
      observer.disconnect();
      controls.dispose();
      mixer.stopAllAction();
      renderer.dispose();
      dotGeometry.dispose();
      dotMaterial.dispose();
      lines.dispose();
      grid.dispose();
    },
    refreshMaterials: () => undefined,
    showAnimation,
  };
}
