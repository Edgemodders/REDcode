---
title: Animation Timeline
---

# Animation Timeline: blocks on tracks, posed by hand

Draft 0.4, **agreed with the owner on 2026-11-25**: three kinds of block (animation, move, blend), a block starts from **what shows through** before it, a move ends on its last pose with no implied return, **blends** carry one pose into the next, a new move comes with a blend after it, and the clip ends at the last block (the owner's design, with the recommendations under Decisions). Draft 0.3 (2026-11-25) took **EDGEwave's mix** look and lane behaviour in place of EDGEdir's; draft 0.2 (agreed 2026-11-24) had implied entry and exit keys, which 0.4 replaces. Details may change in testing. **TL1 to TL4 are built (2026-11-25)**: [TL1 as built](#tl1-as-built-2026-11-25), [TL2 to TL4 as built](#tl2-to-tl4-as-built-2026-11-25); TL4's hand test is pending, and the rest is not built. It does not hold up the next release. It grows the [Animation Editor](animation-editor.html): AE1 and AE2 are its steps and its first panel. Its goal is [The Speaking Scene](speaking-scene.html) (the owner, 2026-11-25): a character's body, head and lip sync with the voice, together, which TL6 brings into the timeline.

## What the owner asked for

The owner, 2026-11-24, after trying the Edit panel:

> I can have a clip of a foot bone at position A at time 0 in the clip and the clip is 5 seconds long and the foot bone is moved to position B at time 5 and the rest is filled in with a chosen transition (smooth, ease-in…). Then I might have a separate clip for the hand… I click at time 5 in the clip (adds a key marker inside the clip) and move the hand up in the air, bringing the arm with it. … I can move these clips independently… They would reside on separate tracks not unlike how EDGEdir does its timeline.

And on 2026-11-25: a clip right after another on its lane **starts from where the first one ended**; a clip with a gap before it starts from whatever **shows through** from the layers below at that moment, which can be other clips, pieces of a cut clip or the base animation; a jump is smoothed by a **blend** block with a length and a type, which goes from what shows before it to what shows after it, on the same lane or a lower one; and starting from nothing (no base animation, a prompted clip dropped on the timeline) should be possible.

So: an editor where the modder **clicks a bone and drags it** into place, the motion between poses **filled in with a chosen transition**, organised as **blocks on tracks** under the 3D view, the way EDGEwave lays out a mix (EDGEwave's timeline fits one body better than EDGEdir's, whose coloured clips tell actors apart in large scenes).

## Terms

| Term | Meaning |
|---|---|
| **Track** | A lane of blocks, as in EDGEwave's mix. Blocks on one track do not overlap. Tracks apply from the bottom up |
| **Animation block** | Plays a stretch of a clip's own frames: from a file, the game, or made from a prompt (AT2's Make). Cut one into pieces and each piece keeps its stretch, so moving a piece moves those frames in time. It can be limited to chosen bones (today's Layer step). The clip as made opens as one animation block on the bottom track; it is not special, and can be cut, moved or left out |
| **Move** | Keys posed by hand: which bones it drives, where it starts, how long it lasts, and its keys (the owner's "clip on the timeline"; called a move so it is not confused with an animation clip) |
| **Blend** | A block with a length and a transition that carries what shows through before it into what shows through after it |
| **Key** | A pose for a move's bones at a moment inside the move |
| **Stretch** | The part of a move between two keys, each with its own transition |
| **Shows through** | At a moment, everything on a track and the tracks below it, combined |
| **Rest pose** | The rig's own pose, under everything: what shows through when nothing is below |
| **Jump** | A moment where the pose changes from one frame to the next because one block ends and what shows through is somewhere else |

## The rules

| Part | Rule |
|---|---|
| **A block's start** | A move starts from **what shows through just before it** on its own track and below. Touching the block before it on its lane, that is that block's last pose; after a gap, it is whatever the lower tracks show then. A move with its own key on its first frame starts there instead, which is a jump unless a blend comes before it |
| **A move's end** | Nothing implied: the move ends on its last pose, and what shows through takes over, which is a jump unless a blend follows |
| **A blend** | Goes from what shows through just before it to what shows through just after it, over its length, with its transition. The end is the **live** motion: the blend fades into the animation as it plays, not to a still frame, so a swaying body keeps swaying. A blend works the same on the lane of the block before or after it or on a lower track, as long as nothing above covers it |
| **An animation block** | Plays its own frames, replacing what is below on its bones (or adding, with Add). Its start and end are jumps if they differ from what shows through; a blend smooths them like any other |
| **Nothing below** | The rest pose. A timeline can start empty |
| **The clip's length** | The end of the last block, with an **end marker** on the ruler that can be dragged to change it |

A blend before a move whose start is taken from what shows through has nothing to hide (the move starts where the pose already is). The two would otherwise each read the other's pose, so a blend's target reads through such a move to what is below it.

## How it works: the owner's example

The bottom track is a game animation with the arm hanging relaxed. On a track above it: **Clip A**, a move that raises the arm above the head and opens the hand wide, then **Clip B**, a move that lowers the hand to the chest and closes it into a fist.

| Layout | What happens |
|---|---|
| A, then B touching it | A starts from the hanging arm (what shows through), ends with the arm raised. B starts from the arm raised, ends at the chest in a fist |
| B moved later, a gap after A | A ends raised, then a **jump** back to the hanging arm (marked on the ruler). B now starts from the hanging arm, so it raises the arm to the chest and closes the fist |
| A blend after A (2 s, Smooth) | A's raised arm is carried into the game animation as it plays; no jump. The animation plays until B |
| B starts with its own key on its first frame | A jump into B's first pose, smoothed by a blend before B, on its lane or below |
| A new track below A and B, with **Clip C** (an animation block) on the base | After a gap, A and B start from what Clip C shows then. Cut C into pieces, put blends around them and move them: A and B follow what shows through at their new times |

## Stacking

Each block works on the result of everything below it. Two blocks on the same bone at the same time, on different tracks:

| They change | Result |
|---|---|
| **Different things** (one raises the hand: its place, the arm by IK; the other turns the hand: its turn) | **Both take effect**, whichever track each is on. IK keeps the hand's turn from below unless its own key turns it |
| **The same thing** (both turn the head) | The **upper track wins** while both run. Its edges are jumps or blends as above |
| **The same thing, mixed on purpose** | Each block has a **Weight** (0 to 1): at 0.5 it goes halfway between what is below and its own pose |

Averaging two blocks by default is left out on purpose: it gives a pose neither asked for, and it changes when a third block is added. The weight makes a mix a choice.

- **The bones a move drives** come from what the modder grabs: a hand drives the arm (shoulder, upper arm, forearm, hand) through IK, as Pin does now; a foot drives the leg; any other bone turns that bone; a group (the right hand's fingers, the head and neck) can be chosen too.
- **A key holds only what the author changed**: a hand's or foot's place, a bone's turn, or both. What a key does not hold, the move leaves to what is below.
- **Replace or Add** per block: Replace (the default) puts its pose in place of what is below on what it changes; Add puts its change on top (a head turned 10° more than it already turns).

## The screen

```
┌ 3D view ────────────────────────────────────────┬ side ─────────────┐
│  the body; the grabbed bone with rotate handles  │ the block or key  │
│  (and move handles on a hand or foot)            │ selected          │
├ selected block: Right hand · Replace · Weight 1 · Smooth ───────────┤
│ 0s     1s     2s     3s     4s     5s     6s     7s     8s    ▼end  │
│ ┃ playhead                          ˈjump                           │
│ ☑ R arm          [◇ A ──◆──◆][◇ B ──◆][≈ blend ≈]                 │
│ ☑ Clip C   [ walk 0–3 s ][≈≈][ walk 5–8 s ]                         │
│ ☑ Base     [ stand_idle ══════════════════════════════════════ ]   │
├ splitter ───────────────────────────────────────────────────────────┤
│ the selected block's keys and stretches over time                    │
└──────────────────────────────────────────────────────────────────────┘
```

- **Grab a joint** in the 3D view: rotate handles on it, and move handles on a hand or foot. Dragging **at the playhead** sets a key there: in the selected move when the playhead is inside it, or in a **new move** on a free track around the playhead (1 s either side, stretched by dragging its edges). A new move comes with a **0.5 s Smooth blend after it**, an ordinary block that can be changed or deleted, so the first move a modder makes does not snap back.
- **The timeline**, in EDGEwave's mix look and behaviour (its A2 Mix, `webview/editor.ts` and `media/editor.css` in EDGEwave): the ruler in seconds and frames; one lane per track, the selected one shaded with the accent bar at its left and its block outlined in the accent colour, the others plain (no colour per lane); a **checkbox** at each lane's left for in the clip or not, with right-click **Only This Track** and **All Tracks**; a lane dragged **up or down** moves it (the order is which track wins), **sideways** moves its block in time, the first 4 px deciding; **Move Up** and **Move Down** in the lane's menu; the **selected block's controls** in a bar above the lanes (its bones, Replace or Add, Weight, its transitions, a blend's type); a **splitter** between the lanes and the selected block's detail below, its height kept per tab. Added to EDGEwave's mix: a block trimmed by an edge, snap to frames and edges (Alt holds it off), Space plays, S splits (an animation block's pieces keep their frames), Delete removes, copy and paste.
- **The three kinds look different** in the same palette: an animation block as a plain bar with its clip's name and stretch, a move with its keys as diamonds (drag one in time; click a stretch to pick its transition), a blend hatched.
- **Jumps are marked** with a tick on the ruler; clicking one adds a blend there. Touching means within a frame: snap makes it easy, and a one-frame gap is a jump, which the tick shows.
- **Add** in the timeline's menu: Move, Blend, Animation (from a file, the game, or a prompt through Make, dropped at the playhead).
- **The end marker** on the ruler: the clip's end, at the last block unless dragged.
- **Live preview**: the view plays the result while the modder drags, scrubs and plays, with no rebuild. **Apply** writes the clip as now (the steps, through anim-core's `editClip`), and the game sees it after the pack swaps it in.
- **Today's steps show on the timeline**: a layer is an animation block on chosen bones, a pin a block on its foot's track, a trim the clip's start and end marker, a loop a mark on the ruler. The step list becomes the timeline.

## Not only people (the owner, 2026-11-25)

The timeline does not care whether a rig is a person or an AV with its doors: blocks, tracks, blends, the end marker and keys that turn or slide a bone work on any rig. What only a person's rig has comes from a **rig profile**, read from the bones' names:

| | A person's rig (man_base, woman_base and the like) | Any other rig (an AV, a door, a prop) |
|---|---|---|
| Animation blocks, blends, tracks | Yes | Yes |
| A move's keys: a bone turned or slid | Yes | Yes: a door turned on its hinge, a ramp slid out |
| A hand or foot moved with its arm or leg by IK | Yes | No: there is no arm or leg; a move names its bones |
| Bone groups (fingers, head and neck, legs) | Yes | One group, every bone |
| Made from words (Uthana), hand poses, the head and lip sync | Yes | No |

**Unverified**, for later stages: that REDcode's animation view draws a vehicle's or a prop's entity on its rig as it draws a character (A2 was tried on people only), and how such a clip plays in the game (a vehicle's doors are driven by its own animation graph, not a workspot; the scene's side is EDGEdir's).

## A line on the timeline (TL6)

Asked by the owner on 2026-11-25 for [The Speaking Scene](speaking-scene.html): a spoken line made in the Lip Sync editor, played with the body's moves so the gestures can be timed to the words.

- **A Line lane** at the top of the timeline holds **line blocks**: a voice line with its lip sync, from the game or made in the Lip Sync editor (L2), its length the voice's. Slid in time like any block; its waveform on the block and its words under it, each word where it is spoken.
- **For watching and timing only.** In the game the face plays apart from the body, so a line block changes nothing in the clip Apply writes: the body clip stays body only. The line's start is kept in the record (`{ "step": "line", "start": 1.2, "line": ... }`), so the timing travels with the clip to EDGEdir.
- **The lip sync is edited in one place**: the line block's **Open in Lip Sync** opens the Lip Sync editor on that line; the timeline never edits curves.
- **The head on the body**: the Lip Sync tab's head and face solve (`webview/lipsyncHead.ts`, `faceSolve` in lipsync-core) in the animation view, on the body's head bone, with the voice played on the transport's clock. **Unverified**: whether a character's body export carries the head's face bones, or the head is a second model placed on the head bone; a short check comes first.
- A character with no head in the export (V: the game builds V's head from the save) shows the line on the head picked in the Lip Sync editor.

## The data

Blocks are steps in the clip's record, as AE1 keeps every edit, so the record, Undo, Apply, the MCP tools and EDGEfab's reading stay as they are:

```json
{ "step": "anim", "track": 0, "start": 0, "length": 10, "clip": "base", "from": 0 }
{ "step": "anim", "track": 1, "start": 2, "length": 3, "clip": { "file": "...\\walk.anims", "name": "walk" }, "from": 0, "bones": ["Hips", "LeftUpLeg", "..."] }
{ "step": "move", "track": 2, "start": 3, "length": 2.5, "on": { "ik": "RightHand" }, "weight": 1,
  "keys": [ { "at": 1.2, "place": [0.31, 1.82, 0.12] }, { "at": 2.5, "place": [0.33, 1.95, 0.10] } ],
  "ease": ["out", "smooth"] }
{ "step": "blend", "track": 2, "start": 5.5, "length": 2, "ease": "smooth" }
{ "step": "end", "at": 8 }
```

- `anim`: `clip` is `"base"` (the clip as made) or another clip; `from` is where in that clip the block starts, so a cut piece keeps its frames; `bones` limits it (left out: all).
- `move`: `on` is `{ "ik": "RightHand" }` (the arm by IK), `{ "bones": ["Head", "Neck"] }` or `{ "group": "rightFingers" }`. A key's `at` is from the move's start and holds only `place` (a hand or foot, in the character's frame, as AE1's `move` is) and `turn`. With n keys there are n stretches: from the start to the first key, and between keys; after its last key a move holds it to its end; a key at `at` 0 replaces the start taken from what shows through.
- `blend`: its `ease` is one of the transitions.
- Transitions, for stretches and blends alike: `smooth`, `linear`, `in`, `out`, `hold`.
- `mode` is `replace` (left out) or `add`; `weight` defaults to 1. `end` is written only when the marker was dragged.
- A record from before the timeline (no `anim` step) reads as the clip as made on track 0 under its steps.
- Order: per frame, tracks from the bottom up, each block on what shows through below it; pins last, so a pin holds a foot whatever a block does.

## TL1 as built (2026-11-25)

In anim-core, with no Node imports, so the page runs the same code for the live preview (its browser bundle is 24 KB):

| Part | Where |
|---|---|
| The blocks, the rules, the rig profile, jumps | `packages/anim-core/src/timeline.ts`: `evaluateTimeline(base, steps, { sources })` gives the frames, the profile and the **jumps** (seconds, the ruler's ticks); `rigProfile`, `withBase`, `isTimelineStep` |
| The pose math, moved out of `edit.ts` so a page can bundle it | `src/pose.ts`: vectors and quaternions, `Frames`, forward kinematics, two-bone IK, the bone groups |
| Records | `applyEdits` runs a record's timeline steps first (each animation block's clip read beforehand), then the other steps on the result, pins last. A record with no timeline steps runs as before |
| The check | `npm run check:timeline` in `packages/anim-core` after `npm run build` there: 34 checks on made-up rigs, a person's and an AV's, no game needed |

Settled while building, within the agreed rules:

- **Relative keys** (degrees about the character's axes, metres along them: the form an assistant writes) are a change from **what is beneath the move** at its start, not from its start: a blend before a move would otherwise move where its keys land, and its jump with them. Poses (quaternions and places: the form the 3D handles will write) are where the bone goes.
- **A move's start is the frame before it**, so its first frame is already on the way and nothing stalls for a frame. **A key at the move's end** lands on its last frame, since the frame at its end is the next block's.
- **A blend's two ends both ride the live motion**: it fades the earlier pose's offset from the motion below into the later one's, so a swaying spine keeps swaying through it and the raised arm comes down into the moving animation.
- **The elbow or knee keeps the way it pointed** at the move's start, in the body's frame, so it never flips as the arm straightens; a limb that starts straight bends elbows back and knees forward. Found: near full stretch the arm solver swings the elbow fast for a small change of the hand's place. That is how IK behaves, but a move from a straight arm starts with a quick elbow.
- **A jump** is a bone turning or sliding at a block's edge far more than in the frames either side of it (over 3 degrees or 2 cm, and 2.5 times its neighbours): a fast start that carries on is not one.
- **The clip as made** is an animation block like any other, written into the record when the timeline first changes it (`withBase`); a timeline with no animation block shows the rest pose.

## TL2 to TL4 as built (2026-11-25)

| Part | Where |
|---|---|
| The timeline under the animation view, on a project's made clip | `webview/animTimeline.ts`, mounted by `webview/animViewer.ts` between the view and the transport, with a **Timeline** button in the view's bar to hide it; its styles at the end of `media/cr2w/editor.css` |
| Live preview | The page reads the clip as made (and each animation block's clip) through the host's `animsEditClip` (anim-core's `editSourceGlb`), runs `evaluateTimeline` on each change (anim-core's `clipData.ts` reads a `.glb` from bytes with no Node imports) and plays the frames in place of the applied clip; the length shown follows the end |
| One step list | The timeline and the Edit tab share it: a change in either shows in the other, and **Apply** in either sends it (`editPanel`'s `steps`, `setSteps`, `choose`, `apply`, `dirty`) |
| Grabbing (TL4) | A click near a joint grabs it, with three.js's TransformControls: **Move** (W) for a hand or foot (the arm or leg by IK) or a sliding bone, **Turn** (E), **Let Go** (Esc). A drag keys the move under the playhead that drives the bone (the selected one first), else makes a move around the playhead (1 s either side) on a free track with its 0.5 s Smooth blend after it. The key is the pose, as TL1 keeps it: an arm's or leg's end in its chain's frame, any other bone's local turn or place |

How it works on screen:

- **Lanes:** one per track, the highest on top (it wins), each with its checkbox; right-click a lane for **Only This Track**, **All Tracks**, **Move Up**, **Move Down**, **Rename** and **Add Blend Here**. Dragging a block up or down moves its whole lane, as in EDGEwave's mix.
- **Blocks:** an animation block is a plain bar with its clip and stretch, a move shows its keys as diamonds, a blend is hatched. The selected block's settings are in the bar above the lanes: start and length; an animation block's from, bones (a group) and Replace or Add with a weight; a move's transition into each key, a key's time, Delete Key.
- **Editing:** drag a block sideways (it stops at its neighbours on the lane), an edge to trim it (an animation block's left edge keeps its frames where they were; a move's keys stay where they are in time), a diamond to move a key. Snap is to frames, block edges, the playhead and the end; Alt holds it off. **S** splits at the playhead, **Delete** removes, **Ctrl+C** and **Ctrl+V** copy and paste at the playhead, **Ctrl+Z** and **Ctrl+Y** (or ↶ ↷) undo on the timeline; the wheel scrolls, Ctrl+wheel zooms, **Fit** shows it all.
- **Add:** Move (on the grabbed bone, else the right hand), Blend, an animation block of another made clip, a game clip (set and clip by name) or the clip as made, at the playhead.
- **Ruler:** the playhead (click or drag to scrub), red ticks at the jumps (a click adds a blend after the block that ends there, else before the one that starts there, on its lane when free), and the end marker (drag it; a double click gives the end back to the last block).
- **The clip's other steps** (pins, keys, layers, trim, loop) are drawn in a **Steps** lane as marks; a click names the step and **Edit It** opens it in the Edit tab's form.

Settled while building:

- **A jump counts only what a block's edge adds** to the motion below the block (anim-core's check: a step already in that motion is not one). The harness found a game clip whose pinky turns 5.8 degrees in one frame at 1.4 s, where a move without keys started; it was marked as a jump before.
- **A click on a joint both grabs it and fills the Edit tab's form**, when the form has a bone: before, the form took every click while the Edit tab was open, and nothing was grabbed.

Not built, or not as the screen sketch has it:

- **The clip's other steps are not in the live preview:** the preview runs the timeline only, and says so while those steps are there; Apply puts them on top, as before.
- **The detail pane under a splitter** is the bar above the lanes for now; a grip above the timeline sets its height (kept per window).
- An animation block made from a prompt through Make, or from a `.glb` file, is not in Add yet (the Clip tab makes the clip; then Add, a made clip).
- Unverified: whether VS Code takes Ctrl+Z inside the webview for its own Undo before the timeline sees it (the ↶ and ↷ buttons work either way); whether a key made on a lower track lands right when an upper track turns the arm's anchor (the key is read from the view's pose).

Checked: anim-core's checks (`check-timeline` 35 of 35, `check.mjs` all pass against the game), REDcode's unit checks and type checks, and the page in Chrome on Probe D's made clip (`docs/testing.md`, Animation Timeline TL2 to TL4).

## Built on what exists

| Part | From |
|---|---|
| Two-bone IK, turns in the character's frame, easings, the edit list, `editClip`, the record | AE1 (`packages/anim-core/src/edit.ts`) |
| The Edit panel, the bone marker, picking a joint, Apply in place | AE2 (`webview/animEdit.ts`) |
| An animation made from a prompt | AT2's Make (`src/animMake.ts`) |
| The timeline's lanes, ruler, checkboxes, lane moves, splitter and selected block's bar | EDGEwave's A2 Mix (`webview/editor.ts`, `media/editor.css` in EDGEwave), copied with a note of the source version; trim, snap, split, blends and jump ticks added in the same look; a shared timeline package later (decision 6) |
| Rotate and move handles | three.js's TransformControls, on a bone |
| Live preview | AE1's frame math made to run in the page (it has no Node needs but `Buffer` in writing the file), so the page plays the blocks on the clips' keys while the modder works |

## Stages

| Stage | What | Checked by |
|---|---|---|
| **TL1** (built 2026-11-25, its check passes) | The three blocks in anim-core: animation blocks (pieces keeping their frames, chosen bones), moves (start from what shows through, keys of place and turn, stretches with their transitions, IK keeping the hand's turn from below), blends into the live motion, the rest pose under everything, tracks from the bottom up, weight and Add, the end; the frame math also running in a page | anim-core's check: a move touching another starts on its last pose; after a gap it starts on what shows through (a piece of a cut clip); a blend has no step at either edge and ends on the moving animation; a cut piece plays its own frames; nothing below gives the rest pose; a hand reaches its key's place within 1 mm; a raise and a turn on the same hand both show; on the same thing the upper track wins; weight 0.5 is halfway |
| **TL2** (built 2026-11-25, hand test pending) | The timeline under the view, showing today's steps as blocks and marks, with live preview; click a block to change it in the bar | A hand test |
| **TL3** (built 2026-11-25, hand test pending) | Blocks made and edited on the timeline: Add (move, blend, animation), drag, trim, split, keys as diamonds with their transitions, jump ticks, the end marker | A hand test |
| **TL4** (built 2026-11-25, hand test pending) | Grabbing a bone in the 3D view: handles, a key at the playhead, a new move with its blend when none is under it | A hand test |
| **TL5** | The same page in the game through the Animation Tools pack (AE3), and the MCP tools for blocks | A hand test in the game |
| **TL6** | [A line on the timeline](#a-line-on-the-timeline-tl6): the Line lane, the head on the body with the face moving to the voice, Open in Lip Sync. Needs TL1 to TL4 and Lip Sync L2 | The check on the head's bones first, then a hand test: Judy walks, gestures and speaks a made line |

## Decisions

| # | Question | Agreed |
|---|---|---|
| 1 | What the hand-posed blocks are called in the UI (2026-11-24) | **Move** ("Add Move", "Right hand move"), since "clip" is the animation itself |
| 2 | A block replaces what is below on what it changes, or adds to it (2026-11-24) | **Replace** by default; an **Add** mode per block for small changes on top |
| 3 | Two blocks on different tracks on the same bone at once (2026-11-24) | **By what each changes** (Stacking): different things both take effect; the same thing, the **upper track wins**; a **Weight** per block to mix on purpose. Not an average by default |
| 4 | How a block starts and ends (the owner's design, 2026-11-25, replacing 0.2's implied entry and exit keys) | It **starts from what shows through** before it (the block it touches, else the tracks below, else the rest pose); a move **ends on its last pose**; **blends** smooth what would jump, into the live motion |
| 5 | Today's steps on the timeline (2026-11-24) | **Yes**: layers, pins, trims and loops as blocks and marks; the list goes |
| 6 | The timeline's code (the owner, 2026-11-25) | **Copy EDGEwave's** mix lanes with a note of its version; a shared timeline package with EDGEwave (and EDGEdir, if it wants one) once both are settled |
| 7 | Edit in Blender (2026-11-24) | Blender works on the clip as it plays now, and what it saves becomes the clip's new starting point; built as AE5 |
| 8 | The base animation (2026-11-25) | **A block like any other** on the bottom track: cut, moved or left out; a timeline can start empty |
| 9 | A blend after a new move (2026-11-25) | **Yes, automatically**: 0.5 s Smooth, an ordinary block |
| 10 | The clip's length (2026-11-25) | **The end of the last block**, with an end marker that can be dragged |
