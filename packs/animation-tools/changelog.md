# Animation Tools changelog

What changed in each release of Animation Tools, a REDnode app shipped beside REDcode, for its Nexus page and its GitHub release. The same rules as REDcode's changelog: a line under **Unreleased** with each change a player would notice, grouped **New**, **Changed**, **Fixed**, **Other**; before a release, rename **Unreleased** to `## <version> (<date>)`, with the version from `pack.json`, and add the short Nexus summary under the heading (`<!-- nexus` ... `-->`).

## Unreleased

**New**

- The first version: pick a character (the Trauma Team medic, a corpo plaza man or woman, or another record on a man's or woman's rig) and **Spawn** them 3 m in front of V, on the ground even where it slopes (on a slope the clips played in the air).
- Say what they should do and **Generate**: Uthana makes the motion from your words on the game's own skeleton (with your Uthana key; $0.10 a second, charged only when it finishes). The clip goes into REDcode's open project, or the app's own when none is open, is swapped into the running game and plays at once.
- **Custom animations** lists the clips made for that character's rig, newest first, with their words: pick one and **Play**, or **Stop**. Works with REDcode closed.
- While a clip is being made, **Generate** is greyed out with a spinner, the stage and the time so far, a progress bar and a line saying what it is doing, and its tooltip says it is generating (with a REDnode that has tooltips, REDnode #55); the other buttons wait until it ends.
- The character keeps facing V when a clip starts, and every clip asks Uthana for feet that respect the ground (lifting a leg, stepping, running and jumping are fine; floating and sliding are not). **Upper body only** holds the legs still for arm motions. **In place** keeps the character where they stand without sliding their feet: only the travel across the floor is taken out, so their hips and feet move as Uthana made them, dances included.
