// The Animation Editor's panel in REDcode's animation view (docs/design/animation-editor.md, AE2): a made clip's
// edit steps as a list, the feet report with its pins, and forms that add a step at the playhead. The steps are
// changed here and sent whole on Apply: the host rebuilds the clip from them (anim-core's editClip) and opens
// the tab again on the new set, so the list always comes back from the clip's record.

// The steps' shape, as anim-core's EditStep (packages/anim-core/src/edit.ts) has it: written out here, since edit.ts
// carries Node types. The timeline's steps come from timeline.ts, which has none (docs/design/animation-timeline.md).
import type { LayerSource, TimelineStep } from "../../../packages/anim-core/src/timeline";
export type { LayerSource, TimelineStep };
export type Ease = "linear" | "in" | "out" | "smooth" | "overshoot";
export type BoneGroup = "leftHand" | "rightHand" | "leftFingers" | "rightFingers" | "leftArm" | "rightArm" | "head" | "upperBody" | "legs" | "all";
export type EditStep =
  | TimelineStep
  | { step: "trim"; from?: number; to?: number }
  | { step: "loop"; blend?: number }
  | { step: "key"; bone: string; at: number; turn?: { yaw?: number; pitch?: number; roll?: number }; move?: [number, number, number]; ease?: Ease; blend?: number }
  | { step: "pin"; bone: string; from: number; to: number; blend?: number; keepTurn?: boolean }
  | { step: "layer"; source: LayerSource; bones?: string[]; group?: BoneGroup; at?: number; blendIn?: number; blendOut?: number; weight?: number };
import { el } from "./viewerKit";

/** What the host says of a made clip (src/animCommands.ts, EditInfo). */
export interface EditInfo {
  clip: string;
  seconds: number;
  steps: EditStep[];
  edited?: string;
  canUndo: boolean;
  canRedo?: boolean;
  /** Just rebuilt from the panel: the reopened tab shows it again. */
  open?: boolean;
  bones: string[];
  groups: Record<string, string[]>;
  ikBones: string[];
  feet: { contacts: { bone: string; from: number; to: number; slide: number }[]; suggestedPins: EditStep[] };
  others: string[];
}

export interface EditApi {
  /** The shown file's made clip, or null when it is not a made clip's own set. */
  info(): Promise<EditInfo | null>;
  /** The clip rebuilt from these steps; the tab then opens again on it. */
  apply(steps: EditStep[]): Promise<unknown>;
  /** The steps before the last Apply, put back. */
  undo(): Promise<unknown>;
  /** The last Undo taken back. */
  redo?(): Promise<unknown>;
  /** AE5: the clip as it plays now opens in Blender; each save there becomes its new starting point. False when Blender was not found. */
  blender?(): Promise<boolean>;
  /** The Animation Timeline (TL2): the clip as made (no source), or an animation block's clip, as a one-clip .glb. */
  clip?(source?: LayerSource): Promise<ArrayBuffer>;
}

export interface EditView {
  /** The steps changed here (a form, a click, Revert): the timeline draws them again. */
  changed?(steps: EditStep[]): void;
  /** The playhead, in seconds. */
  now(): number;
  seek(t: number): void;
  /** A marker on a bone in the 3D view, or none. */
  showBone(name: string | null): void;
  say(message: string): void;
}

const BoneGroupLabels: Record<string, string> = {
  leftHand: "Left hand",
  rightHand: "Right hand",
  leftFingers: "Left fingers",
  rightFingers: "Right fingers",
  leftArm: "Left arm",
  rightArm: "Right arm",
  head: "Head and neck",
  upperBody: "Upper body",
  legs: "Legs",
  all: "Whole body",
};
const Eases = ["smooth", "linear", "in", "out", "overshoot"];
const TimelineKinds = new Set(["anim", "move", "blend", "track", "line", "end"]);
const isTimeline = (s: EditStep): s is TimelineStep => TimelineKinds.has(s.step);
const s2 = (t: number | undefined) => (typeof t === "number" ? `${t.toFixed(2)} s` : "?");

/** One line for a step, as the list shows it. */
export function stepText(s: EditStep): string {
  switch (s.step) {
    case "trim":
      return `Trim to ${s2(s.from ?? 0)}–${s.to === undefined ? "end" : s2(s.to)}`;
    case "loop":
      return `Loop, ${s2(s.blend ?? 0.4)} blend`;
    case "pin":
      return `Pin ${s.bone} ${s2(s.from)}–${s2(s.to)}`;
    case "key": {
      const t = s.turn ?? {};
      const turn = [t.yaw ? `yaw ${t.yaw}°` : "", t.pitch ? `pitch ${t.pitch}°` : "", t.roll ? `roll ${t.roll}°` : ""].filter(Boolean).join(", ");
      const move = s.move && s.move.some((v) => v) ? `move ${s.move.map((v) => Math.round(v * 100)).join(", ")} cm` : "";
      return `Key ${s.bone} at ${s2(s.at)}: ${[turn, move].filter(Boolean).join("; ") || "no change"} (${s.ease ?? "smooth"})`;
    }
    case "layer": {
      const what = s.group ? BoneGroupLabels[s.group] ?? s.group : `${s.bones?.length ?? 0} bones`;
      return `Layer ${sourceName(s.source)} on ${what.toLowerCase()} from ${s2(s.at ?? 0)}`;
    }
    // The timeline's steps (docs/design/animation-timeline.md): shown here as lines, changed on the timeline.
    case "anim":
      return `Animation ${s.clip && s.clip !== "base" ? sourceName(s.clip) : "as made"} on track ${s.track}, ${s2(s.start)}${s.length !== undefined ? `–${s2(s.start + s.length)}` : ""}${s.from ? ` (from ${s2(s.from)})` : ""}`;
    case "move":
      return `Move ${moveOnText(s.on)} on track ${s.track}, ${s2(s.start)}–${s2(s.start + s.length)}, ${s.keys.length} key${s.keys.length === 1 ? "" : "s"}`;
    case "blend":
      return `Blend on track ${s.track}, ${s2(s.start)}–${s2(s.start + s.length)} (${s.ease ?? "smooth"})`;
    case "track":
      return `Track ${s.track}${s.name ? ` "${s.name}"` : ""}${s.off ? ", off" : ""}`;
    case "line":
      return `Line at ${s2(s.start)}`;
    case "end":
      return `End at ${s2(s.at)}`;
  }
}

/** A clip's name for a line: a made clip's, a game clip's, or a file's. */
export function sourceName(src: LayerSource): string {
  return "made" in src ? src.made : "game" in src ? src.game.clip : src.file.split(/[\\/]/).pop() ?? src.file;
}

/** What a move drives, in words. */
export function moveOnText(on: { ik: string } | { bones: string[] } | { group: string }): string {
  if ("ik" in on) return `${on.ik} (by IK)`;
  if ("group" in on) return (BoneGroupLabels[on.group] ?? on.group).toLowerCase();
  return on.bones.length === 1 ? on.bones[0] : `${on.bones.length} bones`;
}

/** The Edit panel: shown by the bar's Edit button on a made clip. */
export interface EditPanel {
  box: HTMLElement;
  pickBone(name: string, quiet?: boolean): void;
  wantsBone(): boolean;
  /** The steps as the panel has them now, applied or not: shared with the timeline. */
  steps(): EditStep[];
  /** The timeline's change: the whole list, which waits for Apply as the panel's own changes do. */
  setSteps(next: EditStep[]): void;
  /** The step at this place in the list, chosen: its time shown, its values in the form. */
  choose(index: number): void;
  /** Apply, as the panel's button does. */
  apply(): void;
  /** Steps waiting for Apply. */
  dirty(): boolean;
}

export function editPanel(api: EditApi, info: EditInfo, view: EditView): EditPanel {
  const box = el("div", "animmake animedit");
  box.hidden = true;
  box.append(el("div", "label", `Edit ${info.clip}`));
  const applied = JSON.stringify(info.steps);
  let steps: EditStep[] = JSON.parse(applied);
  let busy = false;
  /** The step clicked last, drawn yellow like the bone marker it shows (the owner's AE2 run). */
  let chosen = -1;
  /** The step the form changes, or -1 when it adds a new one. */
  let editing = -1;
  const formLabel = el("div", "label", "Add a Step");

  // ---- the steps -------------------------------------------------------------------------------
  const list = el("div", "editsteps");
  const status = el("div", "dim makestatus", info.edited ? `Edited ${new Date(info.edited).toLocaleString()}.` : "As made: no edits yet.");
  const apply = el("button", "on", "Apply");
  apply.title = "Rebuild the clip from these steps; the clip as made is kept, so any step can change later";
  const revert = el("button", "", "Revert");
  revert.title = "Back to the steps applied last";
  const undo = el("button", "", "Undo");
  undo.title = "Put back the steps before the last Apply";
  undo.disabled = !info.canUndo;
  const redo = el("button", "", "Redo");
  redo.title = "Take back the last Undo";
  redo.disabled = !info.canRedo;
  redo.hidden = !api.redo;
  const clear = el("button", "", "Clear");
  clear.title = "No steps: the clip as made (Apply to rebuild)";
  // AE5: Edit in Blender, for what the panel cannot do.
  const blender = el("button", "", "Edit in Blender");
  blender.title = "Open the clip as it plays now in Blender, on the base body. Each save there (Ctrl+S) becomes the clip's new starting point, its steps folded in; Undo here puts the old one back";
  blender.hidden = !api.blender;
  blender.addEventListener("click", () => {
    if (dirty()) return view.say("Apply or Revert the steps first: Blender opens the clip as it plays now");
    blender.disabled = true;
    status.textContent = "Opening Blender…";
    api.blender!().then(
      (opened) => {
        blender.disabled = false;
        status.textContent = opened ? "In Blender: save there (Ctrl+S) and the clip here rebuilds from it, its steps folded in." : "Blender was not found: set redcode.blenderPath.";
      },
      (e) => {
        blender.disabled = false;
        status.textContent = e instanceof Error ? e.message : String(e);
      },
    );
  });
  const dirty = () => JSON.stringify(steps) !== applied;
  const renderSteps = () => {
    list.replaceChildren();
    if (!steps.length) list.append(el("div", "dim", "No steps."));
    steps.forEach((s, i) => {
      const row = el("div", `editstep${i === chosen ? " chosen" : ""}`);
      const text = el("span", "edittext", `${i + 1}. ${stepText(s)}`);
      const at = "at" in s && typeof s.at === "number" ? s.at : "from" in s && typeof s.from === "number" ? s.from : undefined;
      // Click: go to its time and mark its bone (the owner's AE2 run: the marker showed the form's bone, not the step's).
      text.addEventListener("click", () => {
        chosen = i;
        editing = i;
        for (const r of list.querySelectorAll(".editstep")) r.classList.remove("chosen");
        row.classList.add("chosen");
        if (at !== undefined) view.seek(at);
        else if ("start" in s && typeof s.start === "number") view.seek(s.start);
        if (isTimeline(s)) return;
        // The form below takes the step's values: change them and Update Step.
        kind.value = s.step;
        buildForm(s);
      });
      text.title = `${JSON.stringify(s)}
Click: go to its time, mark its bone, and change it in the form below`;
      const tool = (label: string, title: string, run: () => void, off = false) => {
        const b = el("button", "icon", label);
        b.title = title;
        b.disabled = off || busy;
        b.addEventListener("click", run);
        return b;
      };
      row.append(
        text,
        tool("↑", "Earlier: steps run in order", () => { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; startNew(); }, i === 0),
        tool("↓", "Later", () => { [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; startNew(); }, i === steps.length - 1),
        tool("×", "Take this step out", () => { steps.splice(i, 1); startNew(); }),
      );
      list.append(row);
    });
    apply.disabled = busy || !dirty();
    revert.disabled = busy || !dirty();
    clear.disabled = busy || !steps.length;
    undo.disabled = busy || !info.canUndo;
    redo.disabled = busy || !info.canRedo;
    // Added steps change nothing until Apply: said in the accent colour, with Apply lit (the owner's AE2 run).
    const pending = dirty() && !busy;
    status.classList.toggle("editpending", pending);
    apply.classList.toggle("editready", pending);
    if (pending) status.textContent = `Not applied yet: ${steps.length} step${steps.length === 1 ? "" : "s"} wait for Apply, which rebuilds the clip.`;
    view.changed?.(steps);
  };
  const run = async (what: string, job: () => Promise<unknown>) => {
    busy = true;
    renderSteps();
    status.replaceChildren(el("span", "makespin"), document.createTextNode(` ${what}… the view reloads when it is done.`));
    try {
      await job();
    } catch (e) {
      busy = false;
      status.textContent = e instanceof Error ? e.message : String(e);
      renderSteps();
    }
  };
  apply.addEventListener("click", () => void run("Rebuilding the clip", () => api.apply(steps)));
  undo.addEventListener("click", () => void run("Putting the last steps back", () => api.undo()));
  redo.addEventListener("click", () => void run("Taking back the Undo", () => api.redo!()));
  revert.addEventListener("click", () => { steps = JSON.parse(applied); startNew(); });
  clear.addEventListener("click", () => { steps = []; startNew(); });
  const add = (s: EditStep) => {
    steps.push(s);
    renderSteps();
  };
  /** The form's step: in place of the one being changed, or added at the end. */
  const commit = (s: EditStep) => {
    if (editing >= 0 && editing < steps.length) {
      steps[editing] = s;
      chosen = editing;
    } else steps.push(s);
    renderSteps();
  };

  // ---- the feet ----------------------------------------------------------------------------------
  const feet = el("div", "editfeet");
  if (!info.feet.contacts.length) feet.append(el("div", "dim", "The feet rest nowhere long enough to pin."));
  for (const c of info.feet.contacts) {
    const row = el("div", "editstep");
    const sliding = c.slide > 0.01;
    const text = el("span", "edittext", `${c.bone} rests ${s2(c.from)}–${s2(c.to)}, slides ${(c.slide * 100).toFixed(1)} cm`);
    text.title = "Click: go to where it starts";
    text.addEventListener("click", () => view.seek(c.from));
    const pin = el("button", sliding ? "on" : "", "Pin");
    pin.title = `Hold ${c.bone} where it is from ${s2(c.from)} to ${s2(c.to)}; the leg bends to keep it there`;
    pin.addEventListener("click", () => add({ step: "pin", bone: c.bone, from: Math.round(c.from * 100) / 100, to: Math.round(c.to * 100) / 100 }));
    row.append(text, pin);
    feet.append(row);
  }
  const pinAll = el("button", "", "Pin All Sliding");
  pinAll.title = "A pin for each foot that slides more than 1 cm where it rests";
  pinAll.disabled = !info.feet.suggestedPins.length;
  pinAll.addEventListener("click", () => {
    for (const p of info.feet.suggestedPins) add(p);
  });

  // ---- adding a step -----------------------------------------------------------------------------
  const number = (value: number, step = 0.01, title = "") => {
    const i = el("input", "editnum");
    i.type = "text";
    i.inputMode = "decimal";
    i.value = String(value);
    i.title = title;
    i.dataset.step = String(step);
    return i;
  };
  const read = (i: HTMLInputElement) => {
    const v = Number(i.value);
    return Number.isFinite(v) ? v : 0;
  };
  /** A time box with a button that takes the playhead. */
  const timeBox = (label: string, value: number) => {
    const input = number(Math.round(value * 100) / 100, 0.01, `${label}, in seconds`);
    const now = el("button", "", "Now");
    now.title = `Set ${label.toLowerCase()} to the playhead`;
    now.addEventListener("click", () => (input.value = (Math.round(view.now() * 100) / 100).toFixed(2)));
    const wrap = el("span", "edittime");
    wrap.append(el("span", "dim", label), input, now);
    return { wrap, input };
  };
  const select = (options: [string, string][], value?: string, title = "") => {
    const s = el("select");
    s.title = title;
    for (const [v, l] of options) {
      const o = el("option", "", l);
      o.value = v;
      s.append(o);
    }
    if (value !== undefined) s.value = value;
    return s;
  };
  const row = (...kids: HTMLElement[]) => {
    const r = el("div", "makerow");
    r.append(...kids);
    return r;
  };
  /** The bone box the 3D view's picking fills, when a form has one. */
  let boneTarget: HTMLSelectElement | null = null;
  const boneSelect = (bones: string[], value: string) => {
    const s = select(bones.map((b) => [b, b]), value, "The bone, marked yellow in the 3D view; or click near a joint there");
    s.addEventListener("change", () => view.showBone(s.value));
    s.addEventListener("focus", () => view.showBone(s.value));
    return s;
  };

  const kind = select([["pin", "Pin a foot or hand"], ["key", "Key a bone"], ["layer", "Layer another clip"], ["trim", "Trim"], ["loop", "Loop"]], "pin", "What the step does");
  const form = el("div", "editform");
  /**
   * The form, empty for a new step or filled from a step to change (the owner's AE2 run: a step could only be
   * taken out and made again). Its button adds the step, or puts it in place of the one being changed.
   */
  const buildForm = (fill?: EditStep) => {
    form.replaceChildren();
    boneTarget = null;
    view.showBone(null);
    formLabel.textContent = editing >= 0 ? `Change Step ${editing + 1}` : "Add a Step";
    const addButton = el("button", "on", editing >= 0 ? "Update Step" : "Add Step");
    addButton.title = editing >= 0 ? `Put these values in step ${editing + 1}; Apply rebuilds the clip` : "Add this step at the end of the list; Apply rebuilds the clip";
    const f = fill as Record<string, any> | undefined;
    switch (kind.value) {
      case "pin": {
        const bone = boneSelect(info.ikBones, f?.bone ?? "LeftFoot");
        boneTarget = bone;
        const from = timeBox("From", f?.from ?? view.now());
        const to = timeBox("To", f?.to ?? info.seconds);
        addButton.addEventListener("click", () => commit({ step: "pin", bone: bone.value, from: read(from.input), to: read(to.input), ...(f?.blend !== undefined ? { blend: f.blend } : {}), ...(f?.keepTurn !== undefined ? { keepTurn: f.keepTurn } : {}) }));
        form.append(row(bone), row(from.wrap, to.wrap));
        break;
      }
      case "key": {
        const bone = boneSelect(info.bones, f?.bone ?? (info.bones.includes("Head") ? "Head" : info.bones[0]));
        boneTarget = bone;
        const at = timeBox("At", f?.at ?? view.now());
        const yaw = number(f?.turn?.yaw ?? 0, 1, "Yaw: degrees about the character's up; + turns to its left");
        const pitch = number(f?.turn?.pitch ?? 0, 1, "Pitch: degrees about the character's right");
        const roll = number(f?.turn?.roll ?? 0, 1, "Roll: degrees about the character's forward");
        const cm = (i: number) => Math.round((f?.move?.[i] ?? 0) * 1000) / 10;
        const mx = number(cm(0), 1, "Move right, in cm (feet and hands only: the leg or arm bends)");
        const my = number(cm(1), 1, "Move up, in cm");
        const mz = number(cm(2), 1, "Move forward, in cm");
        const ease = select(Eases.map((e) => [e, e]), f?.ease ?? "smooth", "How the change runs into this key");
        // 0.6 s each side: a single key reads as a turn, not a flick (the owner's AE2 run: 0.3 s was easy to miss).
        const blend = number(f?.blend ?? 0.6, 0.05, "Seconds the change fades in before the first key on this bone and out after the last; two keys hold it between them");
        const moveRow = row(el("span", "dim", "Move cm"), mx, my, mz);
        const showMove = () => (moveRow.hidden = !info.ikBones.includes(bone.value));
        bone.addEventListener("change", showMove);
        showMove();
        addButton.addEventListener("click", () => {
          const turn = { ...(read(yaw) ? { yaw: read(yaw) } : {}), ...(read(pitch) ? { pitch: read(pitch) } : {}), ...(read(roll) ? { roll: read(roll) } : {}) };
          const move: [number, number, number] = [read(mx) / 100, read(my) / 100, read(mz) / 100];
          const moving = !moveRow.hidden && move.some((v) => v);
          if (!Object.keys(turn).length && !moving) return view.say("A key needs a turn or a move");
          commit({ step: "key", bone: bone.value, at: read(at.input), ...(Object.keys(turn).length ? { turn } : {}), ...(moving ? { move } : {}), ease: ease.value as Ease, blend: read(blend) });
        });
        form.append(row(bone, at.wrap), row(el("span", "dim", "Yaw"), yaw, el("span", "dim", "Pitch"), pitch, el("span", "dim", "Roll"), roll), moveRow, row(el("span", "dim", "Ease"), ease, el("span", "dim", "Blend s"), blend));
        break;
      }
      case "layer": {
        const src = f?.source as LayerSource | undefined;
        const choices: [string, string][] = info.others.map((o): [string, string] => [`made:${o}`, o]);
        // A source the list does not offer (a made clip since renamed, a .glb an assistant named) stays as it was.
        if (src && "made" in src && !info.others.includes(src.made)) choices.unshift([`made:${src.made}`, src.made]);
        if (src && "file" in src) choices.unshift([`file:${src.file}`, src.file.split(/[\\/]/).pop() ?? src.file]);
        choices.push(["game", "A game clip…"]);
        const first = src ? ("made" in src ? `made:${src.made}` : "file" in src ? `file:${src.file}` : "game") : info.others.length ? `made:${info.others[0]}` : "game";
        const source = select(choices, first, "The clip whose motion goes on the bones");
        const gameSet = el("input");
        gameSet.type = "text";
        gameSet.placeholder = "the game's .anims set, by game path";
        const gameClip = el("input");
        gameClip.type = "text";
        gameClip.placeholder = "the clip in it, by name";
        if (src && "game" in src) {
          gameSet.value = src.game.set;
          gameClip.value = src.game.clip;
        }
        const gameRow = row(gameSet, gameClip);
        const showGame = () => (gameRow.hidden = source.value !== "game");
        source.addEventListener("change", showGame);
        showGame();
        const groups: [string, string][] = Object.keys(info.groups).filter((g) => g !== "all").map((g) => [g, BoneGroupLabels[g] ?? g]);
        // A layer on bones by name (an assistant's) keeps its bones unless a group is picked.
        const keptBones: string[] | undefined = !f?.group && Array.isArray(f?.bones) && f.bones.length ? f.bones : undefined;
        if (keptBones) groups.unshift(["", `${keptBones.length} bones, as given`]);
        const group = select(groups, keptBones ? "" : f?.group ?? "rightHand", "The bones the layer moves");
        const at = timeBox("From", f?.at ?? view.now());
        const weight = number(f?.weight ?? 1, 0.1, "How much of the layer: 0 to 1");
        const blendIn = number(f?.blendIn ?? 0.2, 0.05, "Seconds it blends in");
        const blendOut = number(f?.blendOut ?? 0.2, 0.05, "Seconds it blends out");
        addButton.addEventListener("click", () => {
          const v = source.value;
          const picked: LayerSource | null = v === "game" ? (gameSet.value.trim() && gameClip.value.trim() ? { game: { set: gameSet.value.trim(), clip: gameClip.value.trim() } } : null) : v.startsWith("file:") ? { file: v.slice(5) } : { made: v.slice("made:".length) };
          if (!picked) return view.say("Name the game's set and the clip in it");
          const on = group.value ? { group: group.value as BoneGroup } : { bones: keptBones ?? [] };
          commit({ step: "layer", source: picked, ...on, at: read(at.input), weight: Math.min(1, Math.max(0, read(weight))), blendIn: read(blendIn), blendOut: read(blendOut) });
        });
        form.append(row(source), gameRow, row(el("span", "dim", "On"), group), row(at.wrap), row(el("span", "dim", "Weight"), weight, el("span", "dim", "In s"), blendIn, el("span", "dim", "Out s"), blendOut));
        break;
      }
      case "trim": {
        const from = timeBox("From", f?.from ?? 0);
        const to = timeBox("To", f?.to ?? info.seconds);
        addButton.addEventListener("click", () => commit({ step: "trim", from: read(from.input), to: read(to.input) }));
        form.append(row(from.wrap, to.wrap));
        break;
      }
      case "loop": {
        const blend = number(f?.blend ?? 0.4, 0.05, "Seconds at the end that flow back into the first frame");
        addButton.addEventListener("click", () => commit({ step: "loop", blend: read(blend) }));
        form.append(row(el("span", "dim", "Blend s"), blend));
        break;
      }
    }
    const buttons = row(addButton);
    if (editing >= 0) {
      const fresh = el("button", "", "New Step");
      fresh.title = "Stop changing this step: the form adds a new one";
      fresh.addEventListener("click", () => startNew());
      buttons.append(fresh);
    }
    form.append(buttons);
    // The form's bone is marked at once, not only after it changes.
    if (boneTarget) view.showBone(boneTarget.value);
  };
  /** Back to adding: no step chosen, the form empty. */
  const startNew = () => {
    editing = -1;
    chosen = -1;
    renderSteps();
    buildForm();
  };
  kind.addEventListener("change", () => {
    // Another kind is another step: the form adds it.
    editing = -1;
    buildForm();
  });
  buildForm();

  box.append(
    list,
    row(apply, revert, undo, redo, clear),
    row(blender),
    status,
    el("div", "label", "Feet"),
    feet,
    row(pinAll),
    formLabel,
    row(kind),
    form,
  );
  renderSteps();
  return {
    box,
    steps: () => steps,
    setSteps: (next: EditStep[]) => {
      steps = next;
      // The timeline drew it already; the list follows without calling it back.
      const tell = view.changed;
      view.changed = undefined;
      renderSteps();
      view.changed = tell;
    },
    choose: (index: number) => {
      const row = list.querySelectorAll(".editstep")[index]?.querySelector(".edittext") as HTMLElement | null;
      row?.click();
      row?.scrollIntoView({ block: "nearest" });
    },
    apply: () => apply.click(),
    dirty,
    pickBone: (name: string, quiet?: boolean) => {
      if (!boneTarget) return;
      if (![...boneTarget.options].some((o) => o.value === name)) return quiet ? undefined : view.say(`${name} cannot be used here`);
      boneTarget.value = name;
      boneTarget.dispatchEvent(new Event("change"));
    },
    wantsBone: () => !box.hidden && !!boneTarget,
  };
}
