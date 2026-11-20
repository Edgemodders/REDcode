// Small things the mesh viewer, the animation view and the sector view share.

import * as THREE from "three";
import { BrightnessSteps, type LightSettings, type Stage } from "../../../packages/world-view/src/stage";

export type { LightSettings } from "../../../packages/world-view/src/stage";

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function cssColour(name: string, fallback: string): THREE.Color {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  try {
    return new THREE.Color(v || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

/**
 * The Light control (REDcode issue #31): how bright, and Fixed light, which keeps the light where it is
 * while the view turns, so a material's shine shows moving. onChange keeps the choice for the window.
 */
export function lightControls(stage: Stage, onChange?: (s: LightSettings) => void): HTMLElement[] {
  const now = stage.settings;
  const brightness = el("select");
  brightness.title = "How bright the light is";
  for (const s of BrightnessSteps) {
    const o = el("option", "", `Light ${s}×`);
    o.value = String(s);
    brightness.appendChild(o);
  }
  // The nearest step to what was kept.
  const nearest = BrightnessSteps.reduce((a, b) => (Math.abs(b - now.brightness) < Math.abs(a - now.brightness) ? b : a));
  brightness.value = String(nearest);
  const fixed = el("button", now.mode === "fixed" ? "on" : "", "Fixed light");
  fixed.title = "Keep the light where it is while you turn the view, to see how shine moves; off, it comes from over your shoulder";
  brightness.addEventListener("change", () => {
    stage.set({ brightness: Number(brightness.value) });
    onChange?.(stage.settings);
  });
  fixed.addEventListener("click", () => {
    const on = !fixed.classList.contains("on");
    fixed.classList.toggle("on", on);
    stage.set({ mode: on ? "fixed" : "camera" });
    onChange?.(stage.settings);
  });
  return [brightness, fixed];
}
