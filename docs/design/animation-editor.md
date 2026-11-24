---
title: Animation Editor
---

# Animation Editor: change a clip after it is made

Draft 0.1. Agreed with the owner on 2026-11-24, with the three recommendations under Decisions; details may change in testing. Nothing here is built. It comes after the Animation Tools pack's hand test (AT3) passes.

A clip from Uthana, from a file or from the game is rarely exactly right. The test of the Animation Tools pack (AT3, 2026-11-24) showed it: a foot that slides a few centimetres, a tap that should land elsewhere, a hand that should be a fist. The owner wants one editor for that, shared by REDcode and the Animation Tools pack in the game, each opening it from an **Edit** button where a clip is shown, with MCP tools so an assistant can make the same edits. The idea in the owner's words: a starting body animation, from Uthana, a file or the game, added to or altered by other animations or by keys and tweens.

The owner, 2026-11-24: EDGEfab's scope is reduced to props and clothes for now; REDcode takes on most animation editing, so modders do not hop between tools. This replaces EDGEfab's planned manual editing (timing, trim, loop, mirror, posing) on the [Animation Tools](animation-tools.html) page.

## What Uthana can and cannot do

Read from Uthana's API docs on 2026-11-24 (https://uthana.com/docs/api; Uthana calls the stitch API a preview):

| | |
|---|---|
| **Cannot** | Take an existing motion and add to it (text to motion takes only the words, a model, a character and a length); make one body part only (`torso_only` is a download option that holds the legs still, not a generation mask); edit keys or poses |
| **Can** | Join two motions with a transition (`stitch`: trims, a 0.1 to 3 s transition, a step forward, right or a turn; $0.01 a second of output); loop a motion (`create_looped_motion`, closed or open); video to motion (its 3.0 model says hands and fingers improved) |

So "send it the body animation and have it add the hand gesture" is not possible today. The same result comes from a separate clip ("a man slowly closes his right hand into a fist") laid onto the hand's bones by the editor (**Layer**, below).

## The shape

| Part | What it is | Where |
|---|---|---|
| **Edit steps** | The operations, as plain functions over a clip's channels: no VS Code, no game | `packages/anim-core` (`src/edit.ts`) |
| **The edit list** | Each made clip keeps its source motion beside it (as now) and a list of steps in its record; the clip in the game is rebuilt from the source, the fit and the steps | The record's `edits`, the shape agreed with EDGEfab (#7): `{ "step": "trim", "from": 0.4, "to": 2.1 }`, plus `edited` (the date). The `id` stays |
| **The editor page** | A 3D body on the clip's rig, a timeline with keys and ranges, a bone picker on the body and in a list, the steps as a list with Undo | One page, built once: a tab in REDcode (the animation view's **Edit**), and a REDnode overlay window in the game (the pack's **Edit**) |
| **Try in game** | Rebuild, pack, swap and play on the spawned character, as the pack's Play does today (a few seconds a round) | The pack; from REDcode through the `redcode` REDnode package when the game runs |
| **MCP** | The same steps for an assistant: list, add, change, remove a step; rebuild | redcode-mcp `anim_edit_*` |

Scrubbing frame by frame happens in the page's own 3D view: the game plays whole clips through a workspot and cannot hold a frame. The in-game window is the same page as REDcode's tab, so what the modder sees in either place is the same.

**Never destructive.** A step can be changed, moved or removed at any time, and the whole list can be run again on a new motion (Make Again keeps the steps, and says which ones no longer fit, such as a key past the new end). A game clip being edited is copied into the project first, as Replace Clip does today.

## The steps

| Step | What it does | The owner's example |
|---|---|---|
| **Trim** | Cuts the start or the end | |
| **Loop** | The end flows back into the start over a blend time | |
| **Key** | A bone's rotation, or a foot's or hand's place, set at a frame; the frames between keys are filled in with an easing per stretch: linear, ease in, ease out, smooth, slight overshoot | A sliding foot: move its start and end places, and the frames between are worked out again |
| **Pin** | A foot (or hand) held where it is over a range of frames, the leg (or arm) bending to keep it there: two-bone IK on the thigh, shin and foot | The few centimetres of slide Uthana leaves |
| **Layer** | Another clip's motion on chosen bones only, with a time offset, a blend in and out, and a weight. The other clip is any clip on the same rig: from the game, Uthana or a file | A right hand closing into a fist, from a separate clip |
| **Hand pose** | A fist, an open hand, pointing, a relaxed hand, laid on a hand as a Layer with a blend; taken from the game's own clips, so they look like the game | A closed fist without a second clip |
| **Join** | Two clips one after the other with a transition, through Uthana's `stitch` (costs a little) | A wave, then crossed arms |

**Bone groups** make the selection quick: left or right hand, fingers of a hand, arm, upper body, head and neck, legs, all. They come from the rig's bone names, which every made clip shares (`man_base`, `woman_base`).

The order of steps matters and is the list's order: Trim first, then Layers and Hand poses, then Keys, then Pins last, so a pin holds the foot whatever came before.

## Stages

| Stage | What | Checked by |
|---|---|---|
| **AE1** | The steps in anim-core (Trim, Loop, Key with easings, Pin, Layer), the edit list in the record and the rebuild; MCP `anim_edit_*` | anim-core's check: a pinned foot stays within 1 mm, a layer moves only its bones, a rebuild from the list is the same clip |
| **AE2** | The editor page in REDcode's animation view: **Edit** on a made clip (and on a game clip, copied in first) | A hand test |
| **AE3** | The same page in the game: the pack's **Edit**, an overlay window, and **Try in game** | A hand test in the game |
| **AE4** | Hand poses from the game's clips, and Join through Uthana | A hand test |

AE1 alone already lets an assistant fix a clip ("pin the left foot from 1.2 s to 3 s, then lay a fist on the right hand from 2 s").

## Decisions (agreed 2026-11-24)

| # | Question | Agreed |
|---|---|---|
| 1 | The editor in the game | **The full editor page in a REDnode overlay window**, the same page as REDcode's tab (not a smaller window of the pack's own buttons) |
| 2 | Where hand poses come from | **The game's own clips first** (free, in the game's style), then clips from Uthana |
| 3 | Who edits animations | **REDcode and the Animation Tools pack.** EDGEfab is reduced to props and clothes for now; it is told on its repo, and the shared record shape lets it read the edits |

## Open, for the build

- Which game clips hold good hand poses on `man_base` and `woman_base` (a probe in AE4).
- Whether a REDnode overlay window can host the editor's 3D view at a usable frame rate over the game (AE3; REDnode's overlay apps run Chromium pages).
- How a Layer from a clip of another length lines up: by time from its start (the first answer), or stretched.
