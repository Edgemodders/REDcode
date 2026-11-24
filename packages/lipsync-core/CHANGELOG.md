# Changelog

What changed in each release of `@edgemodders/lipsync-core`. Changes are grouped as **New**, **Changed**, **Fixed** and **Other**.

## Unreleased

**New**

- **Reading the game's lip sync** through REDbridge: the characters that have lip sync, by voice tag (`lipsyncCharacters`), a character's lines scene by scene with their words and voice files (`lipsyncLines`), and one line's clip as curves (`lipsyncClip`, `sampleTrack`).
- **A head to play it on:** a character's head from the game by its face rig or appearance, exported as glTF (`headModel`), and a face solver that turns a clip's track values into the head's bones (`faceSolver`), written from the rules in plain words.
- **Lip sync from a spoken line:** when each letter is spoken into 13 mouth shapes and the game's lip sync tracks (`speechClip`, `mouthEvents`), and Audio2Face's ARKit shapes into the game's poses (`arkitClip`).
- **Ways in from other files:** a voice file to its line's lip sync (`lipsyncOfVoice`), a lip sync set to its character and scene (`lipsyncOfSet`, `lipsyncSetLanguage`), a character's clip to its scene (`lipsyncOfClip`).
- `callOf` takes REDcode's bridge client or REDnode's `kernel.bridge()`; `setLipsyncCacheDir` says where exports are kept.

**Other**

- Moved from EDGEfab (`src/core/lipsync`, never released there) on 2026-11-22.
