---
title: Animation Timeline
---

# Animation Timeline: moves on tracks, posed by hand

Draft 0.2, **agreed with the owner on 2026-11-24 with every recommendation under Decisions** (0.2 took the owner's second message: implied entry and exit keys, tracks stacked from the bottom up, moves on one bone combined by what each changes). Details may change in testing. Nothing here is built, and it does not hold up the next release. It grows the [Animation Editor](animation-editor.html): AE1 and AE2 are its steps and its first panel.

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
| **Key** | A pose for the move's bones at a moment inside the move |
| **Entry and exit keys** | Implied, never stored: at the move's start its bones are where the tracks beneath have them then, and at its end they are back where the tracks beneath have them then. Moving or stretching the block in time takes the new moments' poses |
| **Stretch** | The part of a move between two keys (entry, the author's keys, exit), each with its own transition: smooth, linear, ease in, ease out, overshoot, or hold |
| **Beneath** | The tracks below a move, already combined: the animation at the bottom, then each track above it in order |

## How a move works

The owner's example: the bottom track is a game animation of a person standing and swaying, 10 s long. On a track above it, a 5 s hand move starts at 3 s with one key, the hand held high, at 5.5 s.

| Time | What drives the right arm |
|---|---|
| 0 to 3 s | Beneath: the animation shows through |
| 3 s | The entry key: the arm where beneath has it at 3 s |
| 3 to 5.5 s | The first stretch, from the entry key to the hand held high, with its transition |
| 5.5 to 8 s | The second stretch, from the hand held high back to the exit key, with its transition |
| 8 s | The exit key: the arm where beneath has it at 8 s, so control drops back without a jump |
| After 8 s | Beneath again |

The author never sets how a move starts or ends: where it sits on the timeline decides it. A move that should keep a pose to the end of the animation runs to the end with its last stretch set to **hold** (it stays on its last key, and the clip ends there).

- **The bones a move drives** come from what the modder grabs: grabbing a hand drives the arm (shoulder, upper arm, forearm, hand) through IK, as Pin does now; grabbing a foot drives the leg; grabbing any other bone turns that bone; a group (the right hand's fingers, the head and neck) can be chosen too.
- **A key holds only what the author changed**: a hand's or foot's place (the arm or leg bends by IK to reach it), a bone's turn, or both. What a key does not hold, the move leaves to beneath.
- **Keys are poses** (the move replaces beneath on what it changes), or with **Add** (decision 2) changes on top of beneath (a head turned 10° more than it already turns).

## Stacking

Tracks apply from the bottom up; each move works on the result of everything below it, so its entry and exit keys are read from that result, not from the animation alone.

Two moves on the same bone at the same time, on different tracks:

| They change | Result |
|---|---|
| **Different things** (one raises the hand: its place, the arm by IK; the other turns the hand: its turn) | **Both take effect**, whichever track each is on: the arm lifts the hand, and the hand turns as the other move says. IK keeps the hand's turn from beneath unless its own key turns it |
| **The same thing** (both turn the head) | The **upper track wins** while both run; at the upper move's edges its entry and exit keys come from the lower move, so the hand-over is smooth |
| **The same thing, mixed on purpose** | Each move has a **Weight** (0 to 1): at 0.5 it goes halfway between beneath and its own keys |

Averaging two moves by default is left out on purpose: it gives a pose neither move asked for (a hand half raised and half turned), and it changes when a third move is added. The weight makes a mix a choice.

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
│ Legs   [◇ Left foot ──────◆──────────◇]                             │
│ R arm                    [◇ Right hand ──◆──────────◇]             │
│ Feet   [ Pin LeftFoot ══════════════════════════════════════ ]      │
└──────────────────────────────────────────────────────────────────────┘
```

- **Grab a joint** in the 3D view: rotate handles on it, and move handles on a hand or foot. Dragging **at the playhead** sets a key there: in the selected move when the playhead is inside it, or in a **new move** on a free track around the playhead (1 s either side, stretched by dragging its edges); its entry and exit keys are implied.
- **The timeline** (EDGEdir's look and keys: the ruler in seconds and frames, lanes with name, mute and lock, blocks dragged to move and by an edge to trim, snap to frames and edges with Alt to hold it off, Space plays, S splits, Delete removes, copy and paste). Keys are diamonds inside a move, the entry and exit shown hollow at its edges: drag a key in time; click a stretch between keys to pick its transition.
- **Live preview**: the view plays the result while the modder drags, scrubs and plays, with no rebuild. **Apply** writes the clip as now (the steps, through anim-core's `editClip`), and the game sees it after the pack swaps it in.
- **Today's steps show on the timeline too** (decision 5): a pin as a block on its foot's track, a layer as a block as long as its clip, a trim and a loop as marks on the ruler. The step list becomes the timeline.

## The data

Moves are steps in the clip's record, as AE1 keeps every edit, so the record, Undo, Apply, the MCP tools and EDGEfab's reading stay as they are:

```json
{ "step": "move", "track": 1, "start": 3, "length": 5, "on": { "ik": "RightHand" }, "weight": 1,
  "keys": [ { "at": 2.5, "place": [0.31, 1.82, 0.12] } ],
  "ease": ["out", "in"] }
```

- `on`: `{ "ik": "RightHand" }` (the arm by IK), `{ "bones": ["Head", "Neck"] }` or `{ "group": "rightFingers" }`.
- A key's `at` is from the move's start; it holds only what was changed: `place` (a hand or foot, in the character's frame, as AE1's `move` is) and `turn` (in the character's frame). The entry and exit keys are not stored.
- `ease` has one transition per stretch: with n keys, n + 1 stretches (entry to the first key, between keys, the last key to exit); `hold` keeps the last key to the move's end. `mode` is `replace` (left out) or `add`.
- Order: trims first, then layers, then moves by track from the bottom up, then today's keys, then pins last, so a pin holds a foot whatever a move does.

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
| **TL1** | Moves in anim-core: the step, its entry and exit read from beneath, stretches with their transitions, place and turn keys (IK keeping the hand's turn from beneath), tracks from the bottom up, weight and Add; the frame math also running in a page | anim-core's check: a move starts and ends exactly on beneath; a hand reaches its key's place within 1 mm; a raise and a turn on the same hand both show; on the same thing the upper track wins; weight 0.5 is halfway |
| **TL2** | The timeline under the view, showing today's steps as blocks and marks, with live preview; click a block to change it in the side panel | A hand test |
| **TL3** | Moves and keys made and edited on the timeline: new move, drag, trim, split, keys as diamonds with their transitions | A hand test |
| **TL4** | Grabbing a bone in the 3D view: handles, a key at the playhead, a new move when none is under it | A hand test |
| **TL5** | The same page in the game through the Animation Tools pack (AE3), and the MCP tools for moves | A hand test in the game |

## Decisions (agreed 2026-11-24)

| # | Question | Recommendation |
|---|---|---|
| 1 | What the blocks are called in the UI | **Move** ("Add Move", "Right hand move"), since "clip" is already the animation itself. Alternatives: Motion, Segment |
| 2 | A move replaces beneath on what it changes, or adds to it | **Replace** by default, as the owner described; an **Add** mode per move for small changes on top (a head turned a little more), which is what today's Key step does |
| 3 | Two moves on different tracks on the same bone at once | **By what each changes** (Stacking above): different things both take effect; the same thing, the **upper track wins**; a **Weight** per move to mix on purpose. Not an average by default |
| 4 | How a move starts and ends | **Implied entry and exit keys** from beneath, as the owner proposed in 0.2; a last stretch can **hold** instead of returning |
| 5 | Today's steps on the timeline | **Yes**: pins, layers, trims and loops as blocks and marks, so there is one place to see every edit; the list goes |
| 6 | The timeline's code | **Copy EDGEdir's** lanes now with a note of its version (as EDGEdir did), and agree a shared timeline package with EDGEdir once both are settled |
| 7 | Edit in Blender (asked the same day) | Blender works on the clip as it plays now, and what it saves becomes the clip's new starting point (the steps folded in, the old one kept for Undo). It comes first, as the Animation Editor's AE5, ahead of the timeline and of AE3 |
