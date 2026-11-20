// @edgemodders/world-view: the lighting every 3D view shares (REDcode issue #31, from EDGEmat): an
// environment for reflections, tone mapping, and a light the modder controls. Without an environment a
// metal (metalness 1) has nothing to reflect and draws near black; without tone mapping highlights clip.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** The light a modder sets: how bright, and whether it comes from the camera or stays put while the model turns. */
export interface LightSettings {
  /** 0.25 to 4, 1 the default. */
  brightness: number;
  /** "camera": the key light follows the view (the old behaviour). "fixed": it stays where it was, so turning the model shows how its shine moves. */
  mode: "camera" | "fixed";
}

export const DefaultLight: LightSettings = { brightness: 1, mode: "camera" };

/** The steps the Light control offers. */
export const BrightnessSteps = [0.5, 1, 1.5, 2.5];

export interface Stage {
  readonly settings: LightSettings;
  set(settings: Partial<LightSettings>): void;
  /** Call each frame before rendering: a camera light moves with the camera. */
  update(camera: THREE.Camera): void;
  dispose(): void;
}

/** Lights a scene for a renderer: environment, tone mapping, a hemisphere fill and a key light. */
export function createStage(renderer: THREE.WebGLRenderer, scene: THREE.Scene, initial: Partial<LightSettings> = {}): Stage {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  room.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose?.();
  });
  scene.environment = env;
  const fill = new THREE.HemisphereLight(0xffffff, 0x3a3f4a, 0.9);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 4, 3);
  scene.add(fill, key, key.target);
  const settings: LightSettings = { ...DefaultLight, ...initial };
  /** A directional light needs only a direction: where it comes from, as a unit vector. A fixed light keeps the one it had. */
  const from = new THREE.Vector3(2, 4, 3).normalize();
  const apply = () => {
    const b = Math.min(4, Math.max(0.25, settings.brightness));
    renderer.toneMappingExposure = 0.8 * b;
    scene.environmentIntensity = 0.45;
    fill.intensity = 0.6;
    key.intensity = 1.4;
  };
  apply();
  /** Over the viewer's shoulder, in the camera's frame: up, a little right, a little behind. */
  const shoulder = new THREE.Vector3(0.45, 0.8, 0.4).normalize();
  return {
    get settings() {
      return { ...settings };
    },
    set(next) {
      Object.assign(settings, next);
      apply();
    },
    update(camera) {
      // A camera light turns with the view; a fixed one keeps the direction it last had.
      if (settings.mode === "camera") from.copy(shoulder).applyQuaternion(camera.quaternion);
      key.target.position.set(0, 0, 0);
      key.position.copy(from).multiplyScalar(100);
      key.target.updateMatrixWorld();
    },
    dispose() {
      scene.remove(fill, key, key.target);
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    },
  };
}
