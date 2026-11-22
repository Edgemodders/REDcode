# Changelog

What changed in each release of `@edgemodders/anim-core`. Changes are grouped as **New**, **Changed**, **Fixed** and **Other**.

## Unreleased

**New**

- **Made animations from words:** `generate` runs Uthana's text to motion onto a stand-in character with the game's own skeleton, fits the motion onto the game's rig, and imports it into a WolvenKit project through REDbridge, as a new clip or in place of a game clip. Each stage is reported, and the clip's source is kept beside it.
- **The parts:** the Uthana client (`uthana`, `cost`), the rigs (`man_base`, `woman_base`), the stand-in (`standIn`), the fit (`fitClip`, with every channel the game needs and the hips grounded to the game's foot height), `addClip`, `replaceClip`, `clipsIn`, and the `.glb` helpers.
