# Changelog

What changed in each release of `@edgemodders/anim-core`. Changes are grouped as **New**, **Changed**, **Fixed** and **Other**.

## Unreleased

**New**

- **Made animations from words:** `generate` runs Uthana's text to motion onto a stand-in character with the game's own skeleton, fits the motion onto the game's rig, and imports it into a WolvenKit project through REDbridge, as a new clip or in place of a game clip. Each stage is reported, and the clip's source is kept beside it.
- **The parts:** the Uthana client (`uthana`, `cost`), the rigs (`man_base`, `woman_base`), the stand-in (`standIn`), the fit (`fitClip`, with every channel the game needs and the hips grounded to the game's foot height), `addClip`, `replaceClip`, `clipsIn`, and the `.glb` helpers.
- **Made clips as EDGEfab and EDGEdir agreed** (EDGEfab #7): each in its own set, with its record `<name>.edgefab.json` (`kind: "anim"`, an id kept when the clip is made again, the facts EDGEdir reads, and a `license` like EDGEfab's prop records'). `madeClips` lists a project's made clips; `recordOf` and `hasEdits` read one. A clip EDGEfab has edited is not made again unless the caller allows it (`EditedClipError`), and `generate` checks that before Uthana is paid.
- **Facing and the ground:** `fitClip` turns the motion so its first frame faces as the game's clip does (Uthana's start 146 degrees off; `face: false` keeps it). `generate` sends `GroundingRule` with the words (`promptFor`; `feet: "free"` leaves it out), and `upperBodyOnly` downloads with Uthana's `torso_only`.
- **Editing a made clip** (REDcode's Animation Editor): `applyEdits` runs steps on a clip (`trim`, `loop`, `key` with easings and the character's yaw, pitch and roll or a foot or hand moved by IK, `pin` a foot or hand by two-bone IK, `layer` another clip on bones or a `BoneGroup`); `editClip` keeps the steps in the record's `edits` (EDGEfab #7's shape) and rebuilds from the clip as made (`<name>.base.glb`); `footContacts` and `suggestPins` say where the feet rest and slide; `framesOf`, `writeFrames`, `worldPath` and `writeClipGlb` for tools that work on frames.
- **In place without sliding feet:** `fitClip`'s `inPlace` takes the Root's travel out as a straight line from the first frame to the last and keeps the rest, the body's sway and steps, on the hips; the report's `travel` says how far it went (`net`) and how much sway stayed (`kept`). `generate` downloads the motion with its travel and fits it so, since Uthana's own `in_place` holds the hips still and the feet slide whenever the body shifts its weight.
