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
  /** Where a fixed light stays, relative to the scene: where the camera light was when it was fixed. */
  let fixedFrom = new THREE.Vector3(2, 4, 3);
  const apply = () => {
    const b = Math.min(4, Math.max(0.25, settings.brightness));
    renderer.toneMappingExposure = 0.8 * b;
    scene.environmentIntensity = 0.45;
    fill.intensity = 0.6;
    key.intensity = 1.4;
  };
  apply();
  const offset = new THREE.Vector3();
  return {
    get settings() {
      return { ...settings };
    },
    set(next) {
      if (next.mode === "fixed" && settings.mode !== "fixed") fixedFrom = key.position.clone();
      Object.assign(settings, next);
      apply();
    },
    update(camera) {
      if (settings.mode === "camera") {
        // Over the viewer's shoulder: up and to the right of the camera, towards what it looks at.
        offset.set(0.6, 0.8, 0.2).applyQuaternion(camera.quaternion);
        key.position.copy(camera.position).add(offset.multiplyScalar(Math.max(1, camera.position.length() * 0.05)));
        key.target.position.copy(camera.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(10));
      } else {
        key.position.copy(fixedFrom);
        key.target.position.set(0, 0, 0);
      }
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
