---
title: Animation Timeline
---

# Animation Timeline: moves on tracks, posed by hand

Draft 0.1, for discussion with the owner (2026-11-24). Nothing here is built, and it does not hold up the next release. It grows the [Animation Editor](animation-editor.html): AE1 and AE2 are its steps and its first panel.

## What the owner asked for

The owner, 2026-11-24, after trying the Edit panel:

> I can have a clip of a foot bone at position A at time 0 in the clip and the clip is 5 seconds long and the foot bone is moved to position B at time 5 and the rest is filled in with a chosen transition (smooth, ease-in…). Then I might have a separate clip for the hand… I click at time 5 in the clip (adds a key marker inside the clip) and move the hand up in the air, bringing the arm with it. … I can move these clips independently… They would reside on separate tracks not unlike how EDGEdir does its timeline. … The beginning of a clip would be automatically set based on where the clip is moved on the animation timeline… then the clip overrides the base animation with its new tween and key values. What happens after the clip will be up to the author.

So: an editor where the modder **clicks a bone and drags it** into place, and the motion between poses is **filled in with a chosen transition**, organised as **blocks on tracks** under the 3D view, the way EDGEdir lays out a scene.

## Terms

| Term | Meaning |
|---|---|
| **The animation** | The clip being edited, as made (Uthana's, a file's, the game's). It plays underneath everything |
| **Move** (name to agree, decision 1) | A block on a track: which bones it drives, where it starts, how long it lasts, and its keys. The owner's "clip on the timeline"; called a move here so it is not confused with the animation clip itself |
| **Track** | A lane of moves, as in EDGEdir. Moves on one track do not overlap |
| **Key** | A pose for the move's bones at a moment inside the move, with the transition that leads into it |
| **The first key** | Not stored: at the move's start, the bones are where the animation has them then. Moving the block in time takes the new moment's pose, as the owner described |

## How a move works

Take the owner's hand example on a person standing and shifting their weight:

| Time | What drives the right arm |
|---|---|
| 0 to 3 s | The animation |
| 3 s, the move's start | The first key: the arm as the animation has it at 3 s, read there, not stored |
| 3 to 8 s | The move: from the first key, through each key the modder set (the hand raised high at 8 s), each stretch with its transition (smooth, linear, ease in, ease out, overshoot) |
| After 8 s | The animation again: it snaps back, unless the move ends with a **Back** key (below) |

- **The bones a move drives** come from what the modder grabs: grabbing a hand drives the arm (shoulder, upper arm, forearm, hand) through IK, as Pin does now; grabbing a foot drives the leg; grabbing any other bone turns that bone; a group (the right hand's fingers, the head and neck) can be chosen too.
- **A key holds the pose of those bones**: a hand's or foot's place and turn (the arm or leg bends by IK), or a bone's turn. Keys are poses, not offsets, as the owner described: the move **replaces** the animation on its bones while it runs (decision 2 offers an Add mode for small changes on top).
- **A Back key** (optional, at the move's end or anywhere after its last key) eases back into the animation over a time: its value is read from the animation at that moment, as the first key's is. Without it, the bones snap back, as the owner said: what happens after a move is the author's choice.

## The screen

```
┌ 3D view ────────────────────────────────────────┬ side ─────────────┐
│  the body; the grabbed bone with rotate handles  │ the move or key   │
│  (and move handles on a hand or foot)            │ selected: its     │
│                                                  │ bones, start,     │
│                                                  │ length, the key's │
│                                                  │ transition        │
├ timeline ────────────────────────────────────────┴───────────────────┤
│ 0s     1s     2s     3s     4s     5s     6s     7s     8s           │
│ ┃ playhead                                                           │
│ Legs   [ Left foot ◆─────────────────◆ ]                             │
│ R arm                    [ Right hand ◆──────────────◆ Back ◇ ]      │
│ Feet   [ Pin LeftFoot ══════════════════════════════════════ ]      │
└──────────────────────────────────────────────────────────────────────┘
```

- **Grab a joint** in the 3D view: rotate handles on it, and move handles on a hand or foot. Dragging **at the playhead** sets a key there: in the selected move when the playhead is inside it, or in a **new move** on a free track starting at the playhead (length 1 s, stretched by dragging its end).
- **The timeline** (EDGEdir's look and keys: the ruler in seconds and frames, lanes with name, mute and lock, blocks dragged to move and by an edge to trim, snap to frames and edges with Alt to hold it off, Space plays, S splits, Delete removes, copy and paste). Keys are diamonds inside a move: drag one in time; click one to pick its transition; Back keys are hollow.
- **Live preview**: the view plays the result while the modder drags, scrubs and plays, with no rebuild. **Apply** writes the clip as now (the steps, through anim-core's `editClip`), and the game sees it after the pack swaps it in.
- **Today's steps show on the timeline too** (decision 5): a pin as a block on its foot's track, a layer as a block as long as its clip, a trim and a loop as marks on the ruler. The step list becomes the timeline.

## The data

Moves are steps in the clip's record, as AE1 keeps every edit, so the record, Undo, Apply, the MCP tools and EDGEfab's reading stay as they are:

```json
{ "step": "move", "track": 1, "start": 3, "length": 5, "on": { "ik": "RightHand" },
  "keys": [ { "at": 5, "ease": "smooth", "place": [0.31, 1.82, 0.12], "turn": [0, 0.7, 0, 0.7] },
            { "at": 5.6, "ease": "out", "back": true } ] }
```

- `on`: `{ "ik": "RightHand" }` (the arm by IK), `{ "bones": ["Head", "Neck"] }` or `{ "group": "rightFingers" }`.
- A key's `at` is from the move's start; `place` and `turn` are in the character's frame (as AE1's `turn` and `move` are), so a move still fits when the animation under it changes; `back: true` reads the animation.
- Order: trims first, then layers, then moves by track (a lower track's move over a higher one's, decision 3), then keys, then pins last, so a pin holds a foot whatever a move does.

## Built on what exists

| Part | From |
|---|---|
| Two-bone IK, turns in the character's frame, easings, the edit list, `editClip`, the record | AE1 (`packages/anim-core/src/edit.ts`) |
| The Edit panel, the bone marker, picking a joint, Apply in place | AE2 (`webview/animEdit.ts`) |
| The timeline's lanes, ruler, drag, trim, snap and keys | EDGEdir's D1 (`webview/editor.ts` in EDGEdir), copied with a note of the source version as EDGEdir copied its own; a shared package later (decision 6) |
| Rotate and move handles | three.js's TransformControls, on a bone |
| Live preview | AE1's frame math made to run in the page (it has no Node needs but `Buffer` in writing the file), so the page plays the steps on the clip's keys while the modder works |

## Stages

| Stage | What | Checked by |
|---|---|---|
| **TL1** | Moves in anim-core: the step, its first key read from the animation, Back keys, IK and turn keys, track order; the frame math also running in a page | anim-core's check: a move's first key equals the animation at its start; a hand reaches its key's place within 1 mm; a Back key ends on the animation |
| **TL2** | The timeline under the view, showing today's steps as blocks and marks, with live preview; click a block to change it in the side panel | A hand test |
| **TL3** | Moves and keys made and edited on the timeline: new move, drag, trim, split, keys as diamonds with their transitions | A hand test |
| **TL4** | Grabbing a bone in the 3D view: handles, a key at the playhead, a new move when none is under it | A hand test |
| **TL5** | The same page in the game through the Animation Tools pack (AE3), and the MCP tools for moves | A hand test in the game |

## Decisions to talk over

| # | Question | Recommendation |
|---|---|---|
| 1 | What the blocks are called in the UI | **Move** ("Add Move", "Right hand move"), since "clip" is already the animation itself. Alternatives: Motion, Segment |
| 2 | A move replaces the animation on its bones, or adds to it | **Replace** by default, as the owner described; an **Add** mode per move for small changes on top (a head turned a little more), which is what today's Key step does |
| 3 | Two moves on different tracks driving the same bone at once | The **lower track wins**, as in video editors, with the shared bones marked on both blocks |
| 4 | After a move ends | **Snap back** unless the move has a Back key, as the owner said; the side panel offers "Ease back over 0.5 s" as one click that adds the Back key |
| 5 | Today's steps on the timeline | **Yes**: pins, layers, trims and loops as blocks and marks, so there is one place to see every edit; the list goes |
| 6 | The timeline's code | **Copy EDGEdir's** lanes now with a note of its version (as EDGEdir did), and agree a shared timeline package with EDGEdir once both are settled |
| 7 | Edit in Blender (asked the same day) | Still open from the chat: Blender works on the clip as it plays now, and what it saves becomes the clip's new starting point (the steps folded in, the old one kept for Undo). It can come before or after the timeline |
