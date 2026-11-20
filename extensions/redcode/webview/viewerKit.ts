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

/**
 * The splitter between a 3D view and its side list: drag to widen the list (long animation or submesh
 * names), double-click for the default width. The width goes to onWidth when the drag ends, to be kept.
 */
export function sideSplitter(body: HTMLElement, side: HTMLElement, width?: number, onWidth?: (width: number | undefined) => void): HTMLElement {
  const splitter = el("div", "meshsplitter");
  splitter.title = "Drag to resize the list; double-click for the default width";
  side.before(splitter);
  const set = (w: number | undefined) => (w === undefined ? body.style.removeProperty("--side") : body.style.setProperty("--side", `${Math.round(w)}px`));
  const clamp = (w: number) => Math.min(Math.max(140, w), Math.max(140, body.clientWidth - 200));
  if (typeof width === "number" && width > 0) set(width);
  splitter.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add("active");
    document.body.classList.add("resizing");
    let w = side.getBoundingClientRect().width;
    const move = (ev: PointerEvent) => {
      w = clamp(body.getBoundingClientRect().right - ev.clientX - splitter.offsetWidth / 2);
      set(w);
    };
    const up = () => {
      splitter.removeEventListener("pointermove", move);
      splitter.removeEventListener("pointerup", up);
      splitter.removeEventListener("pointercancel", up);
      splitter.classList.remove("active");
      document.body.classList.remove("resizing");
      onWidth?.(Math.round(w));
    };
    splitter.addEventListener("pointermove", move);
    splitter.addEventListener("pointerup", up);
    splitter.addEventListener("pointercancel", up);
  });
  splitter.addEventListener("dblclick", () => {
    set(undefined);
    onWidth?.(undefined);
  });
  return splitter;
}
