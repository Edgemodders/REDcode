// The Animation Editor's panel in REDcode's animation view (docs/design/animation-editor.md, AE2): a made clip's
// edit steps as a list, the feet report with its pins, and forms that add a step at the playhead. The steps are
// changed here and sent whole on Apply: the host rebuilds the clip from them (anim-core's editClip) and opens
// the tab again on the new set, so the list always comes back from the clip's record.

// The steps' shape, as anim-core's EditStep (packages/anim-core/src/edit.ts) has it: written out here, since the
// page's type check takes no Node types and anim-core's files carry them.
export type Ease = "linear" | "in" | "out" | "smooth" | "overshoot";
export type BoneGroup = "leftHand" | "rightHand" | "leftFingers" | "rightFingers" | "leftArm" | "rightArm" | "head" | "upperBody" | "legs" | "all";
export type LayerSource = { made: string } | { game: { set: string; clip: string } } | { file: string };
export type EditStep =
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
}

export interface EditView {
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
      const src = "made" in s.source ? s.source.made : "game" in s.source ? s.source.game.clip : s.source.file.split(/[\\/]/).pop();
      const what = s.group ? BoneGroupLabels[s.group] ?? s.group : `${s.bones?.length ?? 0} bones`;
      return `Layer ${src} on ${what.toLowerCase()} from ${s2(s.at ?? 0)}`;
    }
  }
}

/** The Edit panel: shown by the bar's Edit button on a made clip. */
export function editPanel(api: EditApi, info: EditInfo, view: EditView): { box: HTMLElement; pickBone(name: string): void; wantsBone(): boolean } {
  const box = el("div", "animmake animedit");
  box.hidden = true;
  box.append(el("div", "label", `Edit ${info.clip}`));
  const applied = JSON.stringify(info.steps);
  let steps: EditStep[] = JSON.parse(applied);
  let busy = false;

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
  const clear = el("button", "", "Clear");
  clear.title = "No steps: the clip as made (Apply to rebuild)";
  const dirty = () => JSON.stringify(steps) !== applied;
  const renderSteps = () => {
    list.replaceChildren();
    if (!steps.length) list.append(el("div", "dim", "No steps."));
    steps.forEach((s, i) => {
      const row = el("div", "editstep");
      const text = el("span", "edittext", `${i + 1}. ${stepText(s)}`);
      const at = "at" in s && typeof s.at === "number" ? s.at : "from" in s && typeof s.from === "number" ? s.from : undefined;
      // Click: go to its time and mark its bone (the owner's AE2 run: the marker showed the form's bone, not the step's).
      text.addEventListener("click", () => {
        if (at !== undefined) view.seek(at);
        if ("bone" in s && s.bone) view.showBone(s.bone);
      });
      text.title = `${JSON.stringify(s)}
Click: go to its time and mark its bone`;
      const tool = (label: string, title: string, run: () => void, off = false) => {
        const b = el("button", "icon", label);
        b.title = title;
        b.disabled = off || busy;
        b.addEventListener("click", run);
        return b;
      };
      row.append(
        text,
        tool("↑", "Earlier: steps run in order", () => { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; renderSteps(); }, i === 0),
        tool("↓", "Later", () => { [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; renderSteps(); }, i === steps.length - 1),
        tool("×", "Take this step out", () => { steps.splice(i, 1); renderSteps(); }),
      );
      list.append(row);
    });
    apply.disabled = busy || !dirty();
    revert.disabled = busy || !dirty();
    clear.disabled = busy || !steps.length;
    // Added steps change nothing until Apply: said in the accent colour, with Apply lit (the owner's AE2 run).
    const pending = dirty() && !busy;
    status.classList.toggle("editpending", pending);
    apply.classList.toggle("editready", pending);
    if (pending) status.textContent = `Not applied yet: ${steps.length} step${steps.length === 1 ? "" : "s"} wait for Apply, which rebuilds the clip.`;
  };
  const run = async (what: string, job: () => Promise<unknown>) => {
    busy = true;
    renderSteps();
    status.replaceChildren(el("span", "makespin"), document.createTextNode(` ${what}… the tab opens again when it is done.`));
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
  revert.addEventListener("click", () => { steps = JSON.parse(applied); renderSteps(); });
  clear.addEventListener("click", () => { steps = []; renderSteps(); });
  const add = (s: EditStep) => {
    steps.push(s);
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
  const buildForm = () => {
    form.replaceChildren();
    boneTarget = null;
    view.showBone(null);
    const addButton = el("button", "on", "Add Step");
    switch (kind.value) {
      case "pin": {
        const bone = boneSelect(info.ikBones, "LeftFoot");
        boneTarget = bone;
        const from = timeBox("From", view.now());
        const to = timeBox("To", info.seconds);
        addButton.addEventListener("click", () => add({ step: "pin", bone: bone.value, from: read(from.input), to: read(to.input) }));
        form.append(row(bone), row(from.wrap, to.wrap));
        break;
      }
      case "key": {
        const bone = boneSelect(info.bones, info.bones.includes("Head") ? "Head" : info.bones[0]);
        boneTarget = bone;
        const at = timeBox("At", view.now());
        const yaw = number(0, 1, "Yaw: degrees about the character's up; + turns to its left");
        const pitch = number(0, 1, "Pitch: degrees about the character's right");
        const roll = number(0, 1, "Roll: degrees about the character's forward");
        const mx = number(0, 1, "Move right, in cm (feet and hands only: the leg or arm bends)");
        const my = number(0, 1, "Move up, in cm");
        const mz = number(0, 1, "Move forward, in cm");
        const ease = select(Eases.map((e) => [e, e]), "smooth", "How the change runs into this key");
        // 0.6 s each side: a single key reads as a turn, not a flick (the owner's AE2 run: 0.3 s was easy to miss).
        const blend = number(0.6, 0.05, "Seconds the change fades in before the first key on this bone and out after the last; two keys hold it between them");
        const moveRow = row(el("span", "dim", "Move cm"), mx, my, mz);
        const showMove = () => (moveRow.hidden = !info.ikBones.includes(bone.value));
        bone.addEventListener("change", showMove);
        showMove();
        addButton.addEventListener("click", () => {
          const turn = { ...(read(yaw) ? { yaw: read(yaw) } : {}), ...(read(pitch) ? { pitch: read(pitch) } : {}), ...(read(roll) ? { roll: read(roll) } : {}) };
          const move: [number, number, number] = [read(mx) / 100, read(my) / 100, read(mz) / 100];
          const moving = !moveRow.hidden && move.some((v) => v);
          if (!Object.keys(turn).length && !moving) return view.say("A key needs a turn or a move");
          add({ step: "key", bone: bone.value, at: read(at.input), ...(Object.keys(turn).length ? { turn } : {}), ...(moving ? { move } : {}), ease: ease.value as Ease, blend: read(blend) });
        });
        form.append(row(bone, at.wrap), row(el("span", "dim", "Yaw"), yaw, el("span", "dim", "Pitch"), pitch, el("span", "dim", "Roll"), roll), moveRow, row(el("span", "dim", "Ease"), ease, el("span", "dim", "Blend s"), blend));
        break;
      }
      case "layer": {
        const source = select([...info.others.map((o): [string, string] => [`made:${o}`, o]), ["game", "A game clip…"]], info.others.length ? `made:${info.others[0]}` : "game", "The clip whose motion goes on the bones");
        const gameSet = el("input");
        gameSet.type = "text";
        gameSet.placeholder = "the game's .anims set, by game path";
        const gameClip = el("input");
        gameClip.type = "text";
        gameClip.placeholder = "the clip in it, by name";
        const gameRow = row(gameSet, gameClip);
        const showGame = () => (gameRow.hidden = source.value !== "game");
        source.addEventListener("change", showGame);
        showGame();
        const group = select(Object.keys(info.groups).filter((g) => g !== "all").map((g) => [g, BoneGroupLabels[g] ?? g]), "rightHand", "The bones the layer moves");
        const at = timeBox("From", view.now());
        const weight = number(1, 0.1, "How much of the layer: 0 to 1");
        const blendIn = number(0.2, 0.05, "Seconds it blends in");
        const blendOut = number(0.2, 0.05, "Seconds it blends out");
        addButton.addEventListener("click", () => {
          const src = source.value === "game" ? (gameSet.value.trim() && gameClip.value.trim() ? { game: { set: gameSet.value.trim(), clip: gameClip.value.trim() } } : null) : { made: source.value.slice("made:".length) };
          if (!src) return view.say("Name the game's set and the clip in it");
          add({ step: "layer", source: src, group: group.value as BoneGroup, at: read(at.input), weight: Math.min(1, Math.max(0, read(weight))), blendIn: read(blendIn), blendOut: read(blendOut) });
        });
        form.append(row(source), gameRow, row(el("span", "dim", "On"), group), row(at.wrap), row(el("span", "dim", "Weight"), weight, el("span", "dim", "In s"), blendIn, el("span", "dim", "Out s"), blendOut));
        break;
      }
      case "trim": {
        const from = timeBox("From", 0);
        const to = timeBox("To", info.seconds);
        addButton.addEventListener("click", () => add({ step: "trim", from: read(from.input), to: read(to.input) }));
        form.append(row(from.wrap, to.wrap));
        break;
      }
      case "loop": {
        const blend = number(0.4, 0.05, "Seconds at the end that flow back into the first frame");
        addButton.addEventListener("click", () => add({ step: "loop", blend: read(blend) }));
        form.append(row(el("span", "dim", "Blend s"), blend));
        break;
      }
    }
    form.append(row(addButton));
    // The form's bone is marked at once, not only after it changes.
    if (boneTarget) view.showBone(boneTarget.value);
  };
  kind.addEventListener("change", buildForm);
  buildForm();

  box.append(
    list,
    row(apply, revert, undo, clear),
    status,
    el("div", "label", "Feet"),
    feet,
    row(pinAll),
    el("div", "label", "Add a Step"),
    row(kind),
    form,
  );
  renderSteps();
  return {
    box,
    pickBone: (name: string) => {
      if (!boneTarget) return;
      if (![...boneTarget.options].some((o) => o.value === name)) return view.say(`${name} cannot be used here`);
      boneTarget.value = name;
      boneTarget.dispatchEvent(new Event("change"));
    },
    wantsBone: () => !box.hidden && !!boneTarget,
  };
}
