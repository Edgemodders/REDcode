---
title: The Speaking Scene
---

# The Speaking Scene: the goal the animation and lip sync work builds to

Set by the owner on 2026-11-25. Nothing on this page is a new design: it is the end result that the [Animation Timeline](animation-timeline.html), [Lip Sync](lipsync.html) and the other tools' work are measured against. Each missing piece is designed on its tool's own page and agreed there; this page keeps the list of what is missing, and who has it.

## The goal

An author makes a character act a moment of a scene: **Judy walks, gestures and says a line the author wrote, in her voice, her lips moving with the words**, watches it play in REDcode, puts it in a scene, and sees it in the game, where a quest starts it during play.

The owner, 2026-11-25: an author "wants to animate a character body in the context of some scene (which EDGEdir has control over and EDGEquest will trigger during gameplay) and the character's body movements are accompanied by their head possibly speaking lines." The output is **body, head and lip sync with the voice, together**, and that output drives what each tool needs to add.

## The chain

| # | Step | Tool | Where it stands |
|---|---|---|---|
| 1 | The body's moves: walking, gestures, posed by hand on tracks | REDcode, Animation Timeline (TL1 to TL4) | Designed (draft 0.4, agreed). **TL1 built** (2026-11-25, its check passes); TL2 to TL4 next |
| 2 | The body's clip in the game | REDcode and anim-core (`addClip`, the Animation Tools pack) | **Passed in the game** (Probe A, Probe D, AT3) |
| 3 | The line's words: a subtitle | REDcode (LocKeys) | Reading and adding entries built; writing a made line's entry is part of Lip Sync L2 |
| 4 | The line's voice: a take in the character's voice | EDGEwave (`speakLine`, takes) | Built (EDGEwave 0.3.0). The `.wem` for the game through the modder's own Wwise is spiked, not built |
| 5 | The line's lip sync: made from the words and the voice, edited, saved | REDcode, Lip Sync L2 | **Not designed yet** (L2's page is next). Needs REDbridge #14's float tracks to write the game's `.anims` |
| 6 | **Body, head and line together in REDcode**: the line as a block on the timeline, the head on the body, the face moving to the voice | REDcode, Animation Timeline TL6 | Designed in outline (TL6); needs TL1 to TL4 and L2 |
| 7 | The moment in a scene: the made clip and the line on the actor's track, with other actors, camera and sound | EDGEdir (actor tracks, D2.7 made animations, D3 preview, D6b audio) | EDGEdir reads made clips (EDGEfab #7's layout, which REDcode writes); a line with lip sync is "later" there and **faces are left out** of its preview. Asked of EDGEdir once steps 5 and 6 exist: a line clip, and the face in its preview through a shared package from REDcode |
| 8 | The scene in the game, the line heard with the lips moving | EDGEdir (D5 player over REDnode workspots) or the game's own `.scene` (EDGEquest) | **Unverified**: whether a made line with its lip sync plays on an NPC. REDnode does no faces or lip sync. The game's own scenes play a voiced line's lip sync themselves, so a line registered as the game's are may play there with no new runtime; **a probe** decides (below) |
| 9 | Started during play | EDGEquest (quests, `.scene` files with lines and choices) | EDGEquest 0.1.1 writes scenes with lines; using EDGEdir's scenes or REDcode's lines in them is to agree with EDGEquest |

## The probe that decides step 8 (P-line)

Before step 8 is designed by anyone: in the game, a made line (a subtitle, a `.wem` from EDGEwave, a lip sync `.anims` from L2 written as the game's own) on an NPC, played two ways:

| Way | Shows |
|---|---|
| In a game `.scene` made by EDGEquest, the line as a normal dialogue line of that NPC | Whether the game finds and plays a made line's lip sync by itself, as it does for its own lines |
| From a REDnode package on a spawned NPC (EDGEdir's route), the voice played and the face clip started | Whether REDnode can play a face clip on a head at all (LS1's jaw is the only face movement made in the game so far) |

The probe belongs with Lip Sync L2 (it needs L2's files) and is listed on its page.

## How this page is kept

- When a step changes state, its row here changes in the same piece of work as the tool's own page.
- A request to another tool names this page and the step it serves.
- The owner decides the order across tools; within REDcode the order is on [CLAUDE.md](https://github.com/Edgemodders/REDcode/blob/main/CLAUDE.md)'s Next.
