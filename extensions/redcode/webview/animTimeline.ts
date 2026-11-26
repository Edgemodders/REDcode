// The Animation Timeline under REDcode's animation view (docs/design/animation-timeline.md, TL2 to TL4): a made
// clip's timeline steps as blocks on tracks, with the clip's other steps (layers, pins, keys, trim, loop) as marks,
// played live in the view while the modder works. The blocks are worked out by anim-core's evaluateTimeline, the
// same code Apply runs in Node.
//
// The lanes are drawn as EDGEwave's mix draws them (EDGEwave 0.3.0, webview/editor.ts drawMix and media/editor.css:
// a ruler, one lane per track, the selected one shaded with the accent bar at its left and its block outlined in the
// accent colour, a checkbox per lane), copied here per decision 6; trim, snap, split, blends, keys and jump ticks
// are added in the same look.

import { framesOfData, parseGlb } from "../../../packages/anim-core/src/clipData";
import type { Frames } from "../../../packages/anim-core/src/pose";
import { evaluateTimeline, rigProfile, type LayerSource, type MoveKey, type RigProfile, type TimelineStep, type Transition } from "../../../packages/anim-core/src/timeline";
import { skeletonOf } from "../../../packages/anim-core/src/pose";
import { moveOnText, sourceName, type EditInfo, type EditStep } from "./animEdit";
import { el } from "./viewerKit";

export interface TimelineHost {
  info: EditInfo;
  /** The steps, shared with the Edit panel (applied or not). */
  steps(): EditStep[];
  /** A change from the timeline: the whole list, waiting for Apply. */
  setSteps(next: EditStep[]): void;
  /** Applied steps differ from these. */
  dirty(): boolean;
  apply(): void;
  /** The clip as made (no source), or an animation block's clip, as a one-clip .glb. */
  clip(source?: LayerSource): Promise<ArrayBuffer>;
  now(): number;
  seek(t: number): void;
  playing(): boolean;
  togglePlay(): void;
  /** Plays these frames in the view in place of the applied clip, or the applied clip again (null). */
  preview(frames: Frames | null): void;
  /** The Edit panel's step at this place, chosen. */
  chooseStep(index: number): void;
  /** The grabbed bone changed (TL4): the view puts its handles on it, or takes them away. */
  grabbed(bone: string | null, mode: "move" | "turn"): void;
  say(message: string): void;
}

export interface TimelinePanel {
  box: HTMLElement;
  /** The steps changed in the Edit panel: drawn and worked out again. */
  changed(): void;
  /** The playhead moved (a frame of playback, a scrub): drawn again. */
  tick(): void;
  /** The rig's profile, once the clip as made is read: which bones bend an arm or a leg. */
  profile(): RigProfile | undefined;
  /** Grabbing (TL4): a bone is picked in the 3D view. */
  grab(bone: string | null): void;
  /** A bone that ends a chain (a hand or a foot), which a click near it prefers. */
  isChain(bone: string): boolean;
  /** A drag of the grabbed bone starts, goes on (with its new value at the playhead) and ends. */
  grabStart(): void;
  grabMove(value: { place?: number[]; turn?: number[] }): void;
  grabEnd(): void;
  /** The keys of the timeline, while the 3D view or the timeline has the keyboard: true when taken. */
  key(e: KeyboardEvent): boolean;
  dispose(): void;
}

type Block = Extract<TimelineStep, { step: "anim" | "move" | "blend" }>;
type Lane = { track: number; name: string; off: boolean };

const Fps = 30;
const Ruler = 18;
const LaneH = 32;
const Edge = 6;
const Transitions: Transition[] = ["smooth", "linear", "in", "out", "overshoot", "hold"];
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (v: number[]) => v.map((x) => Math.round(x * 10000) / 10000);
const s2 = (t: number) => `${t.toFixed(2)} s`;
const isBlock = (s: EditStep): s is Block => s.step === "anim" || s.step === "move" || s.step === "blend";
const isTimeline = (s: EditStep): s is TimelineStep => ["anim", "move", "blend", "track", "line", "end"].includes(s.step);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function css(name: string, fallback: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim() || fallback;
}
const colours = () => ({
  accent: css("--accent", "#fcee0a"),
  cyan: css("--cyan", "#19f3ff"),
  red: css("--red", "#ff2a52"),
  dim: css("--dim", "#8a93a8"),
  line: css("--line", "#262c3d"),
  fg: css("--vscode-foreground", "#cccccc"),
  shade: css("--vscode-editorWidget-background", "rgba(128,128,128,.08)"),
  font: css("--vscode-editor-font-family", "monospace"),
});

export function timelinePanel(host: TimelineHost): TimelinePanel {
  const info = host.info;
  const box = el("div", "animtimeline");
  const grip = el("div", "tlgrip");
  grip.title = "Drag to give the timeline more or less height";
  const bar = el("div", "toolbar tlbar");
  const lanesBox = el("div", "tllanes");
  const checks = el("div", "tlchecks");
  const canvas = el("canvas") as HTMLCanvasElement;
  canvas.tabIndex = 0;
  lanesBox.append(checks, canvas);
  const status = el("div", "dim tlstatus", "Reading the clip as made…");
  box.append(grip, bar, lanesBox, status);

  // ---- the state ----
  let base: Frames | undefined;
  let profile: RigProfile | undefined;
  let baseSeconds = info.seconds;
  const sources = new Map<string, Frames>();
  const reading = new Set<string>();
  let jumps: number[] = [];
  let error = "";
  let resultSeconds = info.seconds;
  /** The selected block (its place in the display list), and a key or a stretch of a move. */
  let sel: { index: number; key?: number; stretch?: number } | null = null;
  let selLane: number | null = null;
  /** The bone grabbed in the 3D view (TL4), and how a drag changes it. */
  let grabbedBone: string | null = null;
  let grabMode: "move" | "turn" = "turn";
  const history: EditStep[][] = [];
  const future: EditStep[][] = [];
  let clipboard: Block | null = null;
  // The view: seconds per pixel and the time at the canvas's left edge.
  let spp = 0.01;
  let left = 0;
  let fitted = false;

  // ---- the display list: the steps, with the clip as made as a block when none is there yet ----
  const display = (): EditStep[] => {
    const steps = host.steps();
    if (steps.some((s) => s.step === "anim")) return steps;
    const tracks = steps.filter((s): s is Extract<TimelineStep, { track: number }> => isTimeline(s) && "track" in s).map((s) => s.track);
    const track = tracks.length ? Math.min(0, ...tracks) - 1 : 0;
    return [{ step: "anim", track, start: 0, length: r3(baseSeconds), clip: "base" }, ...steps];
  };
  const blocksOf = (list: EditStep[]) => list.map((s, index) => ({ s, index })).filter((x): x is { s: Block; index: number } => isBlock(x.s));
  const lengthOf = (b: Block): number => {
    if (b.step !== "anim" || b.length !== undefined) return b.length ?? 0;
    const f = b.clip && b.clip !== "base" ? sources.get(JSON.stringify(b.clip)) : base;
    return f ? (f.count - 1) / f.fps - (b.from ?? 0) : 1;
  };
  const endOf = (b: Block) => b.start + lengthOf(b);
  const lanesOf = (list: EditStep[]): Lane[] => {
    const tracks = new Set<number>();
    for (const s of list) if (isTimeline(s) && "track" in s) tracks.add(s.track);
    return [...tracks]
      .sort((a, b) => b - a)
      .map((track) => {
        const t = list.find((s): s is Extract<TimelineStep, { step: "track" }> => s.step === "track" && s.track === track);
        return { track, name: t?.name ?? "", off: !!t?.off };
      });
  };
  const legacy = (list: EditStep[]) => list.map((s, index) => ({ s, index })).filter((x) => !isTimeline(x.s));
  const endStep = (list: EditStep[]) => list.find((s): s is Extract<TimelineStep, { step: "end" }> => s.step === "end");
  const clipEnd = (list: EditStep[]) => endStep(list)?.at ?? Math.max(0, ...blocksOf(list).map((b) => endOf(b.s)));

  /** A change: the whole display list becomes the steps (the clip as made made real the first time), with an Undo. */
  const commit = (next: EditStep[], keepHistory = true) => {
    if (keepHistory) {
      history.push(clone(display()));
      if (history.length > 100) history.shift();
      future.length = 0;
    }
    host.setSteps(next);
    redraw();
    schedule();
  };
  /** A working copy to change and commit. */
  const working = () => clone(display());

  // ---- working it out ----
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      evaluate();
    });
  };
  const readSource = (clip: LayerSource) => {
    const key = JSON.stringify(clip);
    if (sources.has(key) || reading.has(key)) return;
    reading.add(key);
    host.clip(clip).then(
      (bytes) => {
        sources.set(key, framesOfData(parseGlb(bytes), Fps));
        reading.delete(key);
        redraw();
        schedule();
      },
      (e) => {
        reading.delete(key);
        error = `Could not read ${sourceName(clip)}: ${e instanceof Error ? e.message : String(e)}`;
        showStatus();
      },
    );
  };
  const evaluate = () => {
    if (!base) return;
    const list = display();
    for (const b of blocksOf(list)) if (b.s.step === "anim" && b.s.clip && b.s.clip !== "base") readSource(b.s.clip);
    if (reading.size) {
      status.textContent = "Reading the animation blocks' clips…";
      return;
    }
    try {
      const r = evaluateTimeline(base, list, { sources: (c) => sources.get(JSON.stringify(c)), profile });
      jumps = r.jumps;
      resultSeconds = (r.frames.count - 1) / r.frames.fps;
      error = "";
      const timeline = host.steps().some(isTimeline);
      host.preview(host.dirty() && timeline ? r.frames : null);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    redraw();
    showStatus();
  };
  const showStatus = () => {
    const list = display();
    const others = legacy(list).length;
    const parts: string[] = [];
    if (error) parts.push(error);
    else if (host.dirty()) parts.push(`Playing the timeline as changed${others ? `, without the ${others} other step${others === 1 ? "" : "s"} in the Steps lane (Apply puts them on top)` : ""}. Apply rebuilds the clip.`);
    else parts.push("As applied.");
    if (jumps.length) parts.push(`${jumps.length} jump${jumps.length === 1 ? "" : "s"} (red on the ruler: click one for a blend).`);
    if (grabbedBone) parts.push(`${grabbedBone} grabbed: drag its handles to key it at the playhead (${grabMode === "move" ? "W" : "E"}; W moves a hand or foot, E turns, Esc lets go).`);
    status.textContent = parts.join(" ");
    status.classList.toggle("tlerror", !!error);
  };

  host.clip().then(
    (bytes) => {
      base = framesOfData(parseGlb(bytes), Fps);
      baseSeconds = (base.count - 1) / base.fps;
      profile = rigProfile([...base.rot.keys()], skeletonOf(base.json.nodes));
      status.textContent = "";
      redraw();
      schedule();
    },
    (e) => {
      status.textContent = `Could not read the clip as made: ${e instanceof Error ? e.message : String(e)}`;
    },
  );

  // ---- geometry ----
  const width = () => canvas.clientWidth || 1;
  const x = (t: number) => (t - left) / spp;
  const tAt = (px: number) => left + px * spp;
  const snapFrame = (t: number) => Math.round(t * Fps) / Fps;
  /** Snaps to frames, and to block edges, the playhead and the end within a few pixels; Alt holds it off. */
  const snap = (t: number, alt: boolean, skip?: number) => {
    if (alt) return Math.max(0, t);
    const list = display();
    const edges = [0, host.now(), clipEnd(list), ...blocksOf(list).filter((b) => b.index !== skip).flatMap((b) => [b.s.start, endOf(b.s)])];
    let best = snapFrame(t);
    let d = 6 * spp;
    for (const e of edges) if (Math.abs(e - t) < d) [best, d] = [e, Math.abs(e - t)];
    return Math.max(0, r3(best));
  };
  const fit = () => {
    const total = Math.max(clipEnd(display()), resultSeconds, baseSeconds, 1);
    spp = (total * 1.08) / width();
    left = 0;
  };
  /** Which lane a y is in (by its place in the lanes), -1 on the ruler. The Steps lane, when there is one, is last. */
  const laneAt = (y: number) => (y < Ruler ? -1 : Math.floor((y - Ruler) / LaneH));

  // ---- drawing ----
  /** Everything: the lanes, their checkboxes and the selected block's bar. */
  const redraw = () => {
    draw();
    syncChecks(lanesOf(display()));
    showBar();
  };
  /** The canvas only: for each frame of playback and each move of a drag. */
  const draw = () => {
    const list = display();
    const lanes = lanesOf(list);
    const steps = legacy(list);
    const rows = lanes.length + (steps.length ? 1 : 0);
    const h = Ruler + LaneH * Math.max(1, rows) + 1;
    canvas.style.height = `${h}px`;
    const w = width();
    if (!fitted && w > 1 && base) {
      fitted = true;
      fit();
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const g = canvas.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const k = colours();
    g.font = `10px ${k.font}`;
    // The ruler: seconds, with finer ticks as it zooms in.
    const step = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30].find((s) => s / spp >= 60) ?? 60;
    g.fillStyle = k.dim;
    for (let t = Math.floor(left / step) * step; x(t) < w; t += step) {
      const px = Math.round(x(t));
      if (px < 0) continue;
      g.fillRect(px, Ruler - 6, 1, 6);
      g.fillText(step < 1 ? `${t.toFixed(2)}s` : `${Math.round(t)}s`, px + 3, 10);
      for (let m = 1; m < 5; m++) g.fillRect(Math.round(x(t + (step * m) / 5)), Ruler - 3, 1, 3);
    }
    if (1 / Fps / spp > 6) for (let f = Math.ceil(left * Fps); x(f / Fps) < w; f++) g.fillRect(Math.round(x(f / Fps)), Ruler - 2, 1, 2);
    g.fillStyle = k.line;
    g.fillRect(0, Ruler - 1, w, 1);
    // Trim: what is cut away, shaded; a loop, a mark at the end.
    for (const { s } of steps) {
      if (s.step === "trim") {
        g.fillStyle = "rgba(0,0,0,.35)";
        if ((s.from ?? 0) > 0) g.fillRect(x(0), Ruler, x(s.from!) - x(0), h);
        if (s.to !== undefined) g.fillRect(x(s.to), Ruler, w, h);
      }
    }
    // The lanes, top first: the highest track wins.
    const blocks = blocksOf(list);
    lanes.forEach((lane, i) => {
      const top = Ruler + LaneH * i;
      if (lane.track === selLane) {
        g.fillStyle = k.shade;
        g.fillRect(0, top, w, LaneH);
        g.fillStyle = k.accent;
        g.fillRect(0, top, 2, LaneH);
      }
      g.fillStyle = k.line;
      g.fillRect(0, top + LaneH - 1, w, 1);
      g.globalAlpha = lane.off ? 0.35 : 1;
      for (const b of blocks.filter((x) => x.s.track === lane.track)) drawBlock(g, k, b.s, b.index, top);
      g.globalAlpha = 1;
      g.fillStyle = lane.track === selLane ? k.accent : k.dim;
      g.fillText(lane.name || `Track ${lane.track}`, 4, top + 10);
    });
    // The clip's other steps, run after the timeline: drawn as marks, changed in the Edit tab.
    if (steps.length) {
      const top = Ruler + LaneH * lanes.length;
      g.fillStyle = k.dim;
      g.fillText("Steps (after the timeline)", 4, top + 10);
      for (const { s, index } of steps) {
        const chosen = sel?.index === index;
        g.strokeStyle = chosen ? k.accent : k.dim;
        g.fillStyle = chosen ? k.accent : k.dim;
        if (s.step === "pin" || s.step === "layer") {
          const from = s.step === "pin" ? s.from : s.at ?? 0;
          const to = s.step === "pin" ? s.to : Math.max(from + 0.5, resultSeconds);
          g.strokeRect(x(from) + 0.5, top + 13.5, Math.max(2, x(to) - x(from) - 1), LaneH - 17);
          g.fillText(s.step === "pin" ? `Pin ${s.bone}` : `Layer ${sourceName(s.source)}`, Math.max(4, x(from) + 4), top + LaneH - 7);
        } else if (s.step === "key") diamond(g, x(s.at), top + LaneH / 2 + 4, 4, true);
        else if (s.step === "loop") g.fillText("⟲ loop", Math.max(4, x(resultSeconds) - 44), top + LaneH - 7);
      }
    }
    // The end marker, the jumps, the playhead.
    const end = clipEnd(list);
    g.fillStyle = k.dim;
    g.fillRect(Math.round(x(end)), Ruler, 1, h);
    g.beginPath();
    g.moveTo(x(end) - 5, 0);
    g.lineTo(x(end) + 5, 0);
    g.lineTo(x(end), 8);
    g.closePath();
    g.fillStyle = endStep(list) ? k.accent : k.fg;
    g.fill();
    g.fillStyle = k.red;
    for (const j of jumps) {
      g.beginPath();
      g.moveTo(x(j) - 4, Ruler - 1);
      g.lineTo(x(j) + 4, Ruler - 1);
      g.lineTo(x(j), Ruler - 9);
      g.closePath();
      g.fill();
    }
    g.fillStyle = k.accent;
    g.fillRect(Math.round(x(host.now())), 0, 1, h);
  };

  const diamond = (g: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: boolean) => {
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.lineTo(cx + r, cy);
    g.lineTo(cx, cy + r);
    g.lineTo(cx - r, cy);
    g.closePath();
    if (fill) g.fill();
    else g.stroke();
  };

  const drawBlock = (g: CanvasRenderingContext2D, k: ReturnType<typeof colours>, b: Block, index: number, top: number) => {
    const chosen = sel?.index === index;
    const x0 = x(b.start);
    const x1 = Math.max(x0 + 3, x(endOf(b)));
    const y0 = top + 12;
    const hgt = LaneH - 15;
    if (b.step === "anim") {
      g.fillStyle = k.cyan;
      g.globalAlpha *= 0.22;
      g.fillRect(x0, y0, x1 - x0, hgt);
      g.globalAlpha /= 0.22;
      g.fillStyle = chosen ? k.accent : k.fg;
      const name = b.clip && b.clip !== "base" ? sourceName(b.clip) : "as made";
      const stretch = `${s2(b.from ?? 0)}–${s2((b.from ?? 0) + lengthOf(b))}`;
      g.fillText(`${name} ${stretch}${b.mode === "add" ? " · add" : ""}${b.weight !== undefined && b.weight !== 1 ? ` · ${b.weight}` : ""}`, Math.max(x0 + 4, 4), y0 + hgt - 5);
    } else if (b.step === "blend") {
      g.save();
      g.beginPath();
      g.rect(x0, y0, x1 - x0, hgt);
      g.clip();
      g.strokeStyle = k.dim;
      for (let px = x0 - hgt; px < x1; px += 5) {
        g.beginPath();
        g.moveTo(px, y0 + hgt);
        g.lineTo(px + hgt, y0);
        g.stroke();
      }
      g.restore();
      g.fillStyle = chosen ? k.accent : k.fg;
      if (x1 - x0 > 40) g.fillText(b.ease ?? "smooth", x0 + 4, y0 + hgt - 5);
    } else {
      // A move: its stretches (the chosen one lit), its keys as diamonds.
      const keys = [...b.keys].sort((p, q) => p.at - q.at);
      g.fillStyle = k.fg;
      g.fillText(moveOnText(b.on), Math.max(x0 + 4, 4), y0 + 8);
      if (sel?.index === index && sel.stretch !== undefined) {
        const a = sel.stretch === 0 ? 0 : keys[sel.stretch - 1]?.at ?? 0;
        const z = keys[sel.stretch]?.at ?? b.length;
        g.fillStyle = k.accent;
        g.globalAlpha *= 0.2;
        g.fillRect(x(b.start + a), y0, x(b.start + z) - x(b.start + a), hgt);
        g.globalAlpha /= 0.2;
      }
      g.fillStyle = k.cyan;
      g.strokeStyle = k.cyan;
      g.beginPath();
      g.moveTo(x0, y0 + hgt - 4);
      g.lineTo(x1, y0 + hgt - 4);
      g.stroke();
      keys.forEach((key, i) => {
        const on = chosen && sel?.key === i;
        g.fillStyle = on ? k.accent : k.cyan;
        diamond(g, x(b.start + key.at), y0 + hgt - 4, on ? 5 : 4, true);
      });
    }
    g.strokeStyle = chosen ? k.accent : k.line;
    g.lineWidth = chosen ? 2 : 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, hgt - 1);
    g.lineWidth = 1;
  };

  // ---- the lanes' checkboxes ----
  const syncChecks = (lanes: Lane[]) => {
    checks.style.paddingTop = `${Ruler}px`;
    checks.replaceChildren(
      ...lanes.map((lane) => {
        const row = el("div", "");
        row.style.height = `${LaneH}px`;
        const boxIn = el("input") as HTMLInputElement;
        boxIn.type = "checkbox";
        boxIn.checked = !lane.off;
        boxIn.title = "In the clip: off, the track is left out (right-click a lane for Only This Track and All Tracks)";
        boxIn.addEventListener("change", () => setOff(lane.track, !boxIn.checked));
        row.append(boxIn);
        return row;
      }),
    );
  };
  const trackStep = (list: EditStep[], track: number) => {
    let t = list.find((s): s is Extract<TimelineStep, { step: "track" }> => s.step === "track" && s.track === track);
    if (!t) {
      t = { step: "track", track };
      list.push(t);
    }
    return t;
  };
  const tidyTrack = (list: EditStep[]) => list.filter((s) => s.step !== "track" || s.off || s.name);
  const setOff = (track: number, off: boolean) => {
    const list = working();
    trackStep(list, track).off = off || undefined;
    commit(tidyTrack(list));
  };

  // ---- the selected block's bar ----
  const label = (text: string) => el("span", "dim", text);
  const num = (value: number, title: string, set: (v: number) => void, stepBy = 0.05) => {
    const i = el("input", "editnum") as HTMLInputElement;
    i.type = "number";
    i.step = String(stepBy);
    i.value = String(r3(value));
    i.title = title;
    i.addEventListener("change", () => {
      const v = Number(i.value);
      if (Number.isFinite(v)) set(v);
    });
    return i;
  };
  const choice = (options: [string, string][], value: string, title: string, set: (v: string) => void) => {
    const s = el("select") as HTMLSelectElement;
    s.title = title;
    for (const [v, l] of options) {
      const o = el("option", "", l);
      o.value = v;
      s.append(o);
    }
    s.value = value;
    s.addEventListener("change", () => set(s.value));
    return s;
  };
  const button = (text: string, title: string, run: () => void, on = false) => {
    const b = el("button", on ? "on" : "", text) as HTMLButtonElement;
    b.title = title;
    b.addEventListener("click", run);
    return b;
  };
  /** Changes the selected step in a working copy and commits it. */
  const change = (fn: (s: EditStep, list: EditStep[]) => void) => {
    if (!sel) return;
    const list = working();
    const s = list[sel.index];
    if (!s) return;
    fn(s, list);
    commit(list);
  };
  const addMenu = () => {
    const pick = choice(
      [["", "Add…"], ["move", "Move (pose a bone)"], ["blend", "Blend"], ["anim-made", "Animation: a made clip…"], ["anim-game", "Animation: a game clip…"], ["anim-base", "Animation: this clip as made"]],
      "",
      "Add a block at the playhead",
      (v) => {
        pick.value = "";
        if (v === "move") addMove();
        else if (v === "blend") addBlend(host.now());
        else if (v === "anim-base") addAnim("base");
        else if (v === "anim-made") {
          if (!info.others.length) return host.say("The project has no other made clips on this rig");
          showAnimForm("made");
        } else if (v === "anim-game") showAnimForm("game");
      },
    );
    return pick;
  };
  let animForm: "made" | "game" | null = null;
  const showAnimForm = (kind: "made" | "game") => {
    animForm = kind;
    showBar();
  };
  const showBar = () => {
    bar.replaceChildren();
    const list = display();
    const apply = button("Apply", "Rebuild the clip from the timeline and the steps; the clip as made is kept", () => host.apply(), host.dirty());
    apply.disabled = !host.dirty();
    const undo = button("↶", "Undo on the timeline (Ctrl+Z)", () => undoStep());
    undo.disabled = !history.length;
    const redo = button("↷", "Redo on the timeline (Ctrl+Y)", () => redoStep());
    redo.disabled = !future.length;
    const fitButton = button("Fit", "Fit the whole clip in the timeline (Ctrl+wheel zooms, the wheel scrolls)", () => {
      fit();
      redraw();
    });
    bar.append(el("span", "label", "Timeline"), addMenu(), apply, undo, redo, fitButton);
    if (animForm) {
      const kind = animForm;
      const made = kind === "made" ? choice(info.others.map((o): [string, string] => [o, o]), info.others[0] ?? "", "The made clip", () => undefined) : undefined;
      const set = el("input") as HTMLInputElement;
      const clip = el("input") as HTMLInputElement;
      set.placeholder = "the game's .anims set, by game path";
      clip.placeholder = "the clip in it, by name";
      const ok = button("Add", "Add it at the playhead on a new track", () => {
        const src: LayerSource | null = kind === "made" ? (made!.value ? { made: made!.value } : null) : set.value.trim() && clip.value.trim() ? { game: { set: set.value.trim(), clip: clip.value.trim() } } : null;
        if (!src) return host.say("Name the clip");
        animForm = null;
        addAnim(src);
      }, true);
      const cancel = button("Cancel", "", () => {
        animForm = null;
        showBar();
      });
      bar.append(label(kind === "made" ? "Made clip" : "Game clip"), ...(made ? [made] : [set, clip]), ok, cancel);
      return;
    }
    const s = sel ? list[sel.index] : undefined;
    if (!s) {
      bar.append(label(grabbedBone ? `Grabbed ${grabbedBone}` : "Click a block, or a joint in the view to pose it"));
      if (grabbedBone) bar.append(...grabButtons());
      return;
    }
    if (!isTimeline(s)) {
      bar.append(label("A step of the Edit tab:"), el("span", "", stepLine(s)), button("Edit It", "Show it in the Edit tab's form", () => host.chooseStep(sel!.index - (list.length - host.steps().length))));
      return;
    }
    if (!isBlock(s)) return;
    const common = () => [
      label("Start"),
      num(s.start, "Where it starts, in seconds", (v) => change((x) => ((x as Block).start = Math.max(0, r3(v))))),
      label("Length"),
      num(lengthOf(s), "How long it is, in seconds", (v) => change((x) => ((x as Block).length = Math.max(1 / Fps, r3(v))))),
    ];
    if (s.step === "anim") {
      bar.append(el("span", "trackname", s.clip && s.clip !== "base" ? sourceName(s.clip) : "Clip as made"), ...common(),
        label("From"), num(s.from ?? 0, "Where in the clip it starts, in seconds: a cut piece keeps its frames", (v) => change((x) => ((x as Extract<Block, { step: "anim" }>).from = Math.max(0, r3(v)) || undefined))),
        label("On"), groupPick(s), modePick(s), label("Weight"), weightBox(s));
    } else if (s.step === "blend") {
      bar.append(el("span", "trackname", "Blend"), ...common(), label("Ease"),
        choice(Transitions.map((t): [string, string] => [t, t]), s.ease ?? "smooth", "How it runs", (v) => change((x) => ((x as Extract<Block, { step: "blend" }>).ease = v as Transition))));
    } else {
      const keys = [...s.keys].sort((p, q) => p.at - q.at);
      bar.append(el("span", "trackname", `Move ${moveOnText(s.on)}`), ...common(), modePick(s), label("Weight"), weightBox(s));
      const k = sel!.stretch ?? (sel!.key !== undefined ? sel!.key : undefined);
      if (k !== undefined && keys.length) {
        const ease = Array.isArray(s.ease) ? s.ease[k] ?? s.ease[s.ease.length - 1] : s.ease;
        bar.append(label(`Into key ${Math.min(k, keys.length - 1) + 1}`), choice(Transitions.map((t): [string, string] => [t, t]), ease ?? "smooth", "How the stretch into this key runs", (v) => setEase(k, v as Transition)));
      }
      if (sel!.key !== undefined) {
        bar.append(label("At"), num(keys[sel!.key]?.at ?? 0, "The key's time from the move's start", (v) => moveKey(sel!.key!, v)), button("Delete Key", "Take this key out (Delete)", () => deleteKey()));
      }
      bar.append(label(`${keys.length} key${keys.length === 1 ? "" : "s"}`));
      if (grabbedBone) bar.append(...grabButtons());
    }
    bar.append(button("Delete", "Take the block out (Delete)", () => deleteSelected()));
  };
  const stepLine = (s: EditStep) => JSON.stringify(s).slice(0, 120);
  const grabButtons = () => {
    const chain = !!grabbedBone && !!profile?.chains[grabbedBone];
    const mv = button("Move", chain ? "Drag the hand or foot; the arm or leg bends (W)" : "Slide the bone (W)", () => setGrabMode("move"), grabMode === "move");
    const tn = button("Turn", "Turn the bone (E)", () => setGrabMode("turn"), grabMode === "turn");
    const go = button("Let Go", "Take the handles away (Esc)", () => panel.grab(null));
    return [mv, tn, go];
  };
  const setGrabMode = (m: "move" | "turn") => {
    grabMode = m;
    host.grabbed(grabbedBone, grabMode);
    showBar();
    showStatus();
  };
  const groupPick = (s: Extract<Block, { step: "anim" }>) => {
    const groups = Object.keys(profile?.groups ?? info.groups);
    const opts: [string, string][] = [["", "every bone"], ...groups.filter((g) => g !== "all").map((g): [string, string] => [g, g])];
    if (s.bones?.length) opts.unshift(["*", `${s.bones.length} bones, as given`]);
    return choice(opts, s.bones?.length ? "*" : s.group ?? "", "The bones it plays on", (v) =>
      change((x) => {
        const a = x as Extract<Block, { step: "anim" }>;
        if (v === "*") return;
        delete a.bones;
        if (v) a.group = v;
        else delete a.group;
      }),
    );
  };
  const modePick = (s: Extract<Block, { step: "anim" | "move" }>) =>
    choice([["replace", "Replace"], ["add", "Add"]], s.mode ?? "replace", "Replace puts its pose in place of what is below; Add puts its change on top", (v) => change((x) => ((x as Extract<Block, { step: "anim" | "move" }>).mode = v === "add" ? "add" : undefined)));
  const weightBox = (s: Extract<Block, { step: "anim" | "move" }>) =>
    num(s.weight ?? 1, "How much of it: 0 to 1, between what is below and its own pose", (v) => change((x) => ((x as Extract<Block, { step: "anim" | "move" }>).weight = Math.min(1, Math.max(0, v)) === 1 ? undefined : Math.min(1, Math.max(0, v)))), 0.1);

  // ---- making blocks ----
  /** A track whose lane is free from a to b, top first; else a new track above every other. */
  const freeTrack = (list: EditStep[], a: number, b: number, prefer?: number): number => {
    const blocks = blocksOf(list);
    const free = (t: number) => blocks.every((x) => x.s.track !== t || endOf(x.s) <= a + 1e-6 || x.s.start >= b - 1e-6);
    if (prefer !== undefined && free(prefer)) return prefer;
    const lanes = lanesOf(list).map((l) => l.track);
    for (const t of lanes) if (free(t)) return t;
    return lanes.length ? Math.max(...lanes) + 1 : 0;
  };
  const addAt = (list: EditStep[], s: Block) => {
    list.push(s);
    sel = { index: list.length - 1 };
    selLane = s.track;
  };
  const addBlend = (t: number, length = 0.5, prefer?: number) => {
    const list = working();
    const start = Math.max(0, r3(t));
    const track = freeTrack(list, start, start + length, prefer ?? selLane ?? undefined);
    addAt(list, { step: "blend", track, start, length, ease: "smooth" });
    commit(list);
  };
  const addAnim = (clip: "base" | LayerSource) => {
    const list = working();
    const start = r3(host.now());
    const f = clip === "base" ? base : undefined;
    const length = f ? (f.count - 1) / f.fps : 1;
    if (clip !== "base") readSource(clip);
    // On a new track above the others, as the button says: another clip's length is not known until it is read.
    const lanes = lanesOf(list).map((l) => l.track);
    const track = lanes.length ? Math.max(...lanes) + 1 : 0;
    const block: Block = { step: "anim", track, start, clip, ...(clip === "base" ? { length: r3(length) } : {}) };
    addAt(list, block);
    commit(list);
  };
  /** Add Move: the grabbed bone, or the right hand; keyed by dragging the bone in the view. */
  const addMove = (bone = grabbedBone ?? (profile?.chains.RightHand ? "RightHand" : info.bones[0])) => {
    const list = working();
    const at = newMove(list, bone, host.now());
    commit(list);
    return at;
  };
  /** A new move around t (1 s either side) on a free track, with a 0.5 s Smooth blend after it (decision 9). */
  const newMove = (list: EditStep[], bone: string, t: number) => {
    const start = r3(Math.max(0, snapFrame(t - 1)));
    const length = r3(Math.max(2 / Fps, snapFrame(t + 1) - start));
    const track = freeTrack(list, start, start + length + 0.5);
    const on = profile?.chains[bone] ? { ik: bone } : { bones: [bone] };
    const move: Block = { step: "move", track, start, length, on, keys: [] };
    list.push({ step: "blend", track, start: r3(start + length), length: 0.5, ease: "smooth" });
    addAt(list, move);
    return list.length - 1;
  };
  const deleteSelected = () => {
    if (!sel) return;
    const list = working();
    const s = list[sel.index];
    if (!s || !isTimeline(s)) return;
    list.splice(sel.index, 1);
    sel = null;
    commit(list);
  };
  const setEase = (k: number, e: Transition) =>
    change((x) => {
      const m = x as Extract<Block, { step: "move" }>;
      const n = m.keys.length;
      const now = Array.from({ length: n }, (_, i) => (Array.isArray(m.ease) ? m.ease[i] ?? m.ease[m.ease.length - 1] : m.ease) ?? "smooth");
      m.keys.sort((p, q) => p.at - q.at);
      now[Math.min(k, n - 1)] = e;
      m.ease = now.every((v) => v === now[0]) ? (now[0] === "smooth" ? undefined : now[0]) : now;
      if (m.ease === undefined) delete m.ease;
    });
  const moveKey = (k: number, at: number) =>
    change((x) => {
      const m = x as Extract<Block, { step: "move" }>;
      m.keys.sort((p, q) => p.at - q.at);
      if (m.keys[k]) m.keys[k].at = Math.max(0, Math.min(m.length, r3(at)));
    });
  const deleteKey = () => {
    if (!sel || sel.key === undefined) return;
    const k = sel.key;
    change((x) => {
      const m = x as Extract<Block, { step: "move" }>;
      m.keys.sort((p, q) => p.at - q.at);
      m.keys.splice(k, 1);
      if (Array.isArray(m.ease)) m.ease.splice(k, 1);
    });
    sel = { index: sel.index };
    redraw();
  };
  /** S: the selected block cut in two at the playhead; an animation block's second piece keeps its frames. */
  const split = () => {
    if (!sel) return;
    const list = working();
    const s = list[sel.index];
    const t = snapFrame(host.now());
    if (!s || !isBlock(s) || t <= s.start + 1e-6 || t >= endOf(s) - 1e-6) return host.say("Put the playhead inside the selected block to split it");
    const len = lengthOf(s);
    const a = r3(t - s.start);
    let second: Block;
    if (s.step === "anim") second = { ...clone(s), start: r3(t), length: r3(len - a), from: r3((s.from ?? 0) + a) };
    else if (s.step === "blend") second = { ...clone(s), start: r3(t), length: r3(len - a) };
    else {
      second = { ...clone(s), start: r3(t), length: r3(len - a), keys: s.keys.filter((k) => k.at > a).map((k) => ({ ...k, at: r3(k.at - a) })) };
      s.keys = s.keys.filter((k) => k.at <= a);
      delete s.ease;
      delete (second as Extract<Block, { step: "move" }>).ease;
    }
    s.length = a;
    list.splice(sel.index + 1, 0, second);
    sel = { index: sel.index + 1 };
    commit(list);
  };
  const copy = () => {
    const s = sel ? display()[sel.index] : undefined;
    if (s && isBlock(s)) clipboard = clone(s);
  };
  const paste = () => {
    if (!clipboard) return;
    const list = working();
    const len = lengthOf(clipboard);
    const start = r3(host.now());
    const track = freeTrack(list, start, start + len, selLane ?? clipboard.track);
    addAt(list, { ...clone(clipboard), start, track });
    commit(list);
  };
  const undoStep = () => {
    const prev = history.pop();
    if (!prev) return;
    future.push(clone(display()));
    sel = null;
    commit(prev, false);
  };
  const redoStep = () => {
    const next = future.pop();
    if (!next) return;
    history.push(clone(display()));
    sel = null;
    commit(next, false);
  };
  /** A blend at a jump: after the block that ends there, else before the one that starts there, on its lane when free. */
  const blendAtJump = (t: number) => {
    const list = display();
    const blocks = blocksOf(list);
    const ending = blocks.find((b) => Math.abs(endOf(b.s) - t) < 1.5 / Fps);
    const starting = blocks.find((b) => Math.abs(b.s.start - t) < 1.5 / Fps);
    if (ending) addBlend(endOf(ending.s), 0.5, ending.s.track);
    else if (starting) addBlend(Math.max(0, starting.s.start - 0.5), Math.min(0.5, starting.s.start), starting.s.track);
    else addBlend(t);
  };

  // ---- the lanes' menu ----
  let menu: HTMLElement | null = null;
  const closeMenu = () => {
    menu?.remove();
    menu = null;
  };
  const openMenu = (ev: MouseEvent, track: number) => {
    closeMenu();
    menu = el("div", "tlmenu");
    const item = (text: string, run: () => void, off = false) => {
      const b = el("button", "", text) as HTMLButtonElement;
      b.disabled = off;
      b.addEventListener("click", () => {
        closeMenu();
        run();
      });
      menu!.append(b);
    };
    const lanes = lanesOf(display());
    const i = lanes.findIndex((l) => l.track === track);
    item("Only This Track", () => {
      const list = working();
      for (const l of lanes) trackStep(list, l.track).off = l.track === track ? undefined : true;
      commit(tidyTrack(list));
    });
    item("All Tracks", () => {
      const list = working();
      for (const l of lanes) trackStep(list, l.track).off = undefined;
      commit(tidyTrack(list));
    });
    item("Move Up (wins over the one above)", () => swapTracks(track, lanes[i - 1].track), i <= 0);
    item("Move Down", () => swapTracks(track, lanes[i + 1].track), i >= lanes.length - 1);
    item("Rename…", () => renameTrack(track));
    item("Add Blend Here", () => addBlend(host.now(), 0.5, track));
    menu.style.left = `${ev.clientX}px`;
    menu.style.top = `${ev.clientY}px`;
    document.body.append(menu);
  };
  const renameTrack = (track: number) => {
    const input = el("input") as HTMLInputElement;
    input.value = lanesOf(display()).find((l) => l.track === track)?.name ?? "";
    input.placeholder = "the track's name";
    bar.replaceChildren(label(`Track ${track}`), input, button("OK", "", () => done(), true), button("Cancel", "", () => showBar()));
    const done = () => {
      const list = working();
      trackStep(list, track).name = input.value.trim() || undefined;
      commit(tidyTrack(list));
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done();
      if (e.key === "Escape") showBar();
    });
    input.focus();
  };
  /** Two lanes trade places: the upper one wins. */
  const swapTracks = (a: number, b: number) => {
    const list = working();
    for (const s of list) if (isTimeline(s) && "track" in s) s.track = s.track === a ? b : s.track === b ? a : s.track;
    if (selLane === a) selLane = b;
    else if (selLane === b) selLane = a;
    commit(list);
  };
  document.addEventListener("pointerdown", (e) => {
    if (menu && !menu.contains(e.target as Node)) closeMenu();
  });

  // ---- the mouse ----
  type Hit =
    | { kind: "ruler" }
    | { kind: "end" }
    | { kind: "jump"; t: number }
    | { kind: "lane"; track: number }
    | { kind: "block"; index: number; part: "body" | "left" | "right"; track: number }
    | { kind: "key"; index: number; key: number; track: number }
    | { kind: "step"; index: number };
  const hitAt = (px: number, py: number): Hit | null => {
    const list = display();
    const lanes = lanesOf(list);
    if (py < Ruler) {
      if (Math.abs(px - x(clipEnd(list))) < 6 && py < 10) return { kind: "end" };
      const j = jumps.find((t) => Math.abs(px - x(t)) < 5);
      if (j !== undefined && py > Ruler - 10) return { kind: "jump", t: j };
      return { kind: "ruler" };
    }
    const li = laneAt(py);
    if (li >= lanes.length) {
      const t = tAt(px);
      const steps = legacy(list);
      const hit = steps.find(({ s }) =>
        s.step === "key" ? Math.abs(px - x(s.at)) < 6 : s.step === "pin" ? t >= s.from && t <= s.to : s.step === "layer" ? t >= (s.at ?? 0) : false,
      );
      return hit ? { kind: "step", index: hit.index } : null;
    }
    const lane = lanes[li];
    if (!lane) return null;
    const blocks = blocksOf(list).filter((b) => b.s.track === lane.track);
    for (const b of blocks) {
      if (b.s.step !== "move") continue;
      const keys = [...b.s.keys].sort((p, q) => p.at - q.at);
      const k = keys.findIndex((key) => Math.abs(px - x(b.s.start + key.at)) < 6);
      if (k >= 0 && py > Ruler + li * LaneH + LaneH / 2) return { kind: "key", index: b.index, key: k, track: lane.track };
    }
    for (const b of blocks) {
      const x0 = x(b.s.start);
      const x1 = x(endOf(b.s));
      if (px < x0 - 3 || px > x1 + 3) continue;
      const part = px - x0 < Edge && x1 - x0 > 3 * Edge ? "left" : x1 - px < Edge && x1 - x0 > 3 * Edge ? "right" : px >= x0 && px <= x1 ? "body" : null;
      if (part) return { kind: "block", index: b.index, part, track: lane.track };
    }
    return { kind: "lane", track: lane.track };
  };

  let drag:
    | { kind: "scrub" }
    | { kind: "end"; before: EditStep[] }
    | { kind: "block"; index: number; part: "body" | "left" | "right"; x0: number; y0: number; mode: "time" | "lane" | null; orig: Block; list: EditStep[]; laneAt0: number; before: EditStep[]; follower?: number }
    | { kind: "key"; index: number; key: number; x0: number; orig: Block; list: EditStep[]; before: EditStep[] }
    | null = null;

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const hit = hitAt(e.clientX - r.left, e.clientY - r.top);
    if (hit && "track" in hit) openMenu(e, hit.track);
  });
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    canvas.focus({ preventScroll: true });
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const hit = hitAt(px, py);
    if (!hit) return;
    canvas.setPointerCapture(e.pointerId);
    animForm = null;
    switch (hit.kind) {
      case "ruler":
        drag = { kind: "scrub" };
        host.seek(Math.max(0, snap(tAt(px), e.altKey)));
        break;
      case "end":
        drag = { kind: "end", before: clone(display()) };
        break;
      case "jump":
        blendAtJump(hit.t);
        break;
      case "lane":
        sel = null;
        selLane = hit.track;
        host.seek(Math.max(0, snap(tAt(px), e.altKey)));
        redraw();
        break;
      case "step":
        sel = { index: hit.index };
        redraw();
        break;
      case "block": {
        const list = working();
        sel = { index: hit.index };
        selLane = hit.track;
        const s = list[hit.index] as Block;
        // A click on a move's stretch picks it, for its ease.
        if (s.step === "move" && hit.part === "body") {
          const at = tAt(px) - s.start;
          const keys = [...s.keys].sort((p, q) => p.at - q.at);
          const k = keys.findIndex((key) => key.at >= at);
          if (keys.length) sel.stretch = k < 0 ? undefined : k;
        }
        // The blend after a move or an animation (starting where it ends, on its track) goes along with its end.
        const follower = s.step === "blend" ? -1 : list.findIndex((x, i) => i !== hit.index && isTimeline(x) && x.step === "blend" && x.track === s.track && Math.abs(x.start - endOf(s)) < 1e-3);
        drag = { kind: "block", index: hit.index, part: hit.part, x0: px, y0: py, mode: hit.part === "body" ? null : "time", orig: clone(s), list, laneAt0: laneAt(py), before: clone(list), ...(follower >= 0 ? { follower } : {}) };
        redraw();
        break;
      }
      case "key": {
        const list = working();
        sel = { index: hit.index, key: hit.key };
        selLane = hit.track;
        const s = list[hit.index] as Extract<Block, { step: "move" }>;
        s.keys.sort((p, q) => p.at - q.at);
        host.seek(s.start + s.keys[hit.key].at);
        drag = { kind: "key", index: hit.index, key: hit.key, x0: px, orig: clone(s), list, before: clone(list) };
        redraw();
        break;
      }
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (!drag) {
      const hit = hitAt(px, py);
      canvas.style.cursor = !hit ? "default" : hit.kind === "block" ? (hit.part === "body" ? "grab" : "ew-resize") : hit.kind === "end" || hit.kind === "key" ? "ew-resize" : hit.kind === "jump" ? "pointer" : "default";
      return;
    }
    if (drag.kind === "scrub") return host.seek(Math.max(0, snap(tAt(px), e.altKey)));
    if (drag.kind === "end") {
      const list = display().filter((s) => s.step !== "end");
      const at = Math.max(1 / Fps, snap(tAt(px), e.altKey));
      host.setSteps([...list, { step: "end", at }]);
      draw();
      schedule();
      return;
    }
    if (drag.kind === "key") {
      const s = drag.list[drag.index] as Extract<Block, { step: "move" }>;
      const o = drag.orig as Extract<Block, { step: "move" }>;
      const at = Math.max(0, Math.min(s.length, snap(s.start + o.keys[drag.key].at + (px - drag.x0) * spp, e.altKey) - s.start));
      s.keys[drag.key].at = r3(at);
      host.setSteps(clone(drag.list));
      host.seek(s.start + at);
      draw();
      schedule();
      return;
    }
    // A block: the first few pixels pick sideways (time) or up and down (the lane), as EDGEwave's mix does.
    if (!drag.mode) {
      const dx = Math.abs(px - drag.x0);
      const dy = Math.abs(py - drag.y0);
      if (dx < 4 && dy < 4) return;
      drag.mode = dy > dx ? "lane" : "time";
    }
    const s = drag.list[drag.index] as Block;
    const o = drag.orig;
    if (drag.mode === "lane") {
      const lanes = lanesOf(display());
      const to = Math.max(0, Math.min(lanes.length - 1, laneAt(py)));
      if (to !== drag.laneAt0 && lanes[to] && lanes[drag.laneAt0]) {
        // The whole lane moves: which track wins is its order.
        const a = lanes[drag.laneAt0].track;
        const b = lanes[to].track;
        for (const x of drag.list) if (isTimeline(x) && "track" in x) x.track = x.track === a ? b : x.track === b ? a : x.track;
        selLane = b;
        drag.laneAt0 = to;
        host.setSteps(clone(drag.list));
        draw();
        schedule();
      }
      return;
    }
    const dt = (px - drag.x0) * spp;
    const len = lengthOf(o);
    if (drag.part === "body") s.start = snap(o.start + dt, e.altKey, drag.index);
    else if (drag.part === "left") {
      const start = Math.min(o.start + len - 1 / Fps, snap(o.start + dt, e.altKey, drag.index));
      const by = start - o.start;
      s.start = r3(start);
      s.length = r3(len - by);
      if (s.step === "anim") {
        const from = (o as Extract<Block, { step: "anim" }>).from ?? 0;
        (s as Extract<Block, { step: "anim" }>).from = r3(Math.max(0, from + by)) || undefined;
      }
      // A move's keys stay where they are in time.
      if (s.step === "move") s.keys = (o as Extract<Block, { step: "move" }>).keys.map((k) => ({ ...k, at: r3(k.at - by) })).filter((k) => k.at >= 0 && k.at <= s.length!);
    } else s.length = r3(Math.max(1 / Fps, snap(o.start + len + dt, e.altKey, drag.index) - s.start));
    // Its blend follows its end (not when only its start was dragged).
    const fi = drag.follower;
    const follower = fi === undefined ? undefined : (drag.list[fi] as Extract<Block, { step: "blend" }>);
    if (follower && drag.part !== "left") follower.start = r3(endOf(s));
    // No overlap on its lane: it stops at its neighbours.
    const moving = drag.index;
    const others = blocksOf(drag.list).filter((b) => b.index !== moving && b.index !== fi && b.s.track === s.track);
    const overlaps = (x: Block) => others.some((b) => b.s.start < endOf(x) - 1e-6 && endOf(b.s) > x.start + 1e-6);
    const clash = overlaps(s) || (!!follower && overlaps(follower));
    if (clash) {
      Object.assign(s, clone(prevOk.get(drag.index) ?? o));
      if (follower) follower.start = r3(endOf(s));
    } else prevOk.set(drag.index, clone(s));
    host.setSteps(clone(drag.list));
    draw();
    schedule();
  });
  const prevOk = new Map<number, Block>();
  const endDrag = () => {
    // One Undo for the whole drag: the list from before it.
    if (drag && drag.kind !== "scrub" && JSON.stringify(drag.before) !== JSON.stringify(display())) {
      history.push(drag.before);
      if (history.length > 100) history.shift();
      future.length = 0;
      schedule();
    }
    drag = null;
    prevOk.clear();
    redraw();
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("dblclick", (e) => {
    const r = canvas.getBoundingClientRect();
    const hit = hitAt(e.clientX - r.left, e.clientY - r.top);
    // A double click on the end marker gives the end back to the last block.
    if (hit?.kind === "end") commit(display().filter((s) => s.step !== "end"));
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const at = tAt(e.clientX - r.left);
      if (e.ctrlKey) {
        spp = Math.min(1, Math.max(0.0005, spp * (e.deltaY > 0 ? 1.2 : 1 / 1.2)));
        left = Math.max(0, at - (e.clientX - r.left) * spp);
      } else left = Math.max(0, left + (e.deltaY + e.deltaX) * spp);
      redraw();
    },
    { passive: false },
  );

  // ---- the height: the grip above the timeline, kept for the window ----
  let heightDrag: { y: number; h: number } | null = null;
  const HeightKey = "redcode.timelineHeight";
  try {
    const h = Number(localStorage.getItem(HeightKey));
    if (h > 60) lanesBox.style.height = `${h}px`;
  } catch {
    // No storage: the default height.
  }
  grip.addEventListener("pointerdown", (e) => {
    heightDrag = { y: e.clientY, h: lanesBox.offsetHeight };
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener("pointermove", (e) => {
    if (!heightDrag) return;
    const h = Math.max(60, Math.min(600, heightDrag.h - (e.clientY - heightDrag.y)));
    lanesBox.style.height = `${h}px`;
  });
  grip.addEventListener("pointerup", () => {
    heightDrag = null;
    try {
      localStorage.setItem(HeightKey, String(lanesBox.offsetHeight));
    } catch {
      // Not kept.
    }
  });
  const observer = new ResizeObserver(() => redraw());
  observer.observe(lanesBox);

  // ---- the keys ----
  const key = (e: KeyboardEvent): boolean => {
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, select")) return false;
    const ctrl = e.ctrlKey || e.metaKey;
    const run = (fn: () => void) => {
      e.preventDefault();
      fn();
      return true;
    };
    if (ctrl && e.key.toLowerCase() === "z") return run(e.shiftKey ? redoStep : undoStep);
    if (ctrl && e.key.toLowerCase() === "y") return run(redoStep);
    if (ctrl && e.key.toLowerCase() === "c") return run(copy);
    if (ctrl && e.key.toLowerCase() === "v") return run(paste);
    if (ctrl || e.altKey) return false;
    if (e.key === "Delete" || e.key === "Backspace") return run(() => (sel?.key !== undefined ? deleteKey() : deleteSelected()));
    if (e.key.toLowerCase() === "s") return run(split);
    if (e.key.toLowerCase() === "w" && grabbedBone) return run(() => setGrabMode("move"));
    if (e.key.toLowerCase() === "e" && grabbedBone) return run(() => setGrabMode("turn"));
    if (e.key === "Escape" && grabbedBone) return run(() => panel.grab(null));
    return false;
  };
  canvas.addEventListener("keydown", (e) => {
    if (key(e)) return;
    if (e.code === "Space") {
      e.preventDefault();
      host.togglePlay();
    }
  });

  // ---- grabbing a bone in the view (TL4) ----
  /** The move a drag keys: the selected one, else one under the playhead that drives the bone, else a new one. */
  let grabTarget: { index: number; list: EditStep[]; before: EditStep[] } | null = null;
  const drives = (s: Block, bone: string) =>
    s.step === "move" && ("ik" in s.on ? s.on.ik === bone : "bones" in s.on ? s.on.bones.includes(bone) : (profile?.groups[s.on.group] ?? []).includes(bone));
  const covers = (s: Block, t: number) => t >= s.start - 1e-6 && t <= endOf(s) + 1e-6;
  const findMove = (list: EditStep[], bone: string, t: number): number => {
    const chosen = sel ? list[sel.index] : undefined;
    if (chosen && isBlock(chosen) && chosen.step === "move" && drives(chosen, bone) && covers(chosen, t)) return sel!.index;
    const lanes = lanesOf(list).map((l) => l.track);
    const hit = blocksOf(list)
      .filter((b) => drives(b.s, bone) && covers(b.s, t))
      .sort((a, b) => lanes.indexOf(a.s.track) - lanes.indexOf(b.s.track))[0];
    return hit ? hit.index : -1;
  };
  const panel: TimelinePanel = {
    box,
    changed: () => {
      redraw();
      schedule();
    },
    tick: () => draw(),
    profile: () => profile,
    isChain: (bone) => !!profile?.chains[bone],
    grab: (bone) => {
      grabbedBone = bone;
      if (bone) grabMode = profile?.chains[bone] ? "move" : "turn";
      host.grabbed(bone, grabMode);
      showBar();
      showStatus();
    },
    grabStart: () => {
      if (!grabbedBone) return;
      const before = clone(display());
      const list = clone(before);
      const t = snapFrame(host.now());
      let index = findMove(list, grabbedBone, t);
      if (index < 0) index = newMove(list, grabbedBone, t);
      sel = { index };
      grabTarget = { index, list, before };
    },
    grabMove: (value) => {
      if (!grabTarget || !grabbedBone) return;
      const m = grabTarget.list[grabTarget.index] as Extract<Block, { step: "move" }>;
      const at = r3(Math.max(0, Math.min(m.length, snapFrame(host.now()) - m.start)));
      const main = "ik" in m.on ? m.on.ik : "bones" in m.on ? m.on.bones[0] : grabbedBone;
      m.keys.sort((p, q) => p.at - q.at);
      let k = m.keys.findIndex((x) => Math.abs(x.at - at) < 0.5 / Fps);
      if (k < 0) {
        const key: MoveKey = { at };
        m.keys.push(key);
        m.keys.sort((p, q) => p.at - q.at);
        k = m.keys.indexOf(key);
        if (Array.isArray(m.ease)) m.ease.splice(k, 0, "smooth");
      }
      const key = m.keys[k];
      const put = (into: { place?: MoveKey["place"]; turn?: MoveKey["turn"] }) => {
        if (value.place) into.place = r4(value.place);
        if (value.turn) into.turn = r4(value.turn);
      };
      if (grabbedBone === main) put(key);
      else {
        key.bones = key.bones ?? {};
        put((key.bones[grabbedBone] = key.bones[grabbedBone] ?? {}));
        if ("bones" in m.on && !m.on.bones.includes(grabbedBone)) m.on.bones.push(grabbedBone);
      }
      sel = { index: grabTarget.index, key: k };
      host.setSteps(clone(grabTarget.list));
      redraw();
      schedule();
    },
    grabEnd: () => {
      if (!grabTarget) return;
      if (JSON.stringify(grabTarget.list) !== JSON.stringify(grabTarget.before)) {
        history.push(grabTarget.before);
        future.length = 0;
      }
      grabTarget = null;
      redraw();
      showStatus();
    },
    key,
    dispose: () => {
      observer.disconnect();
      closeMenu();
    },
  };
  redraw();
  return panel;
}
