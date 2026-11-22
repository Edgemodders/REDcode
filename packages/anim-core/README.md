# @edgemodders/anim-core

Made animations for Cyberpunk 2077, for the EDGE tools. REDcode's animation view, its MCP server and the Animation Tools pack for REDnode use it. The design is at https://edgemodders.github.io/REDcode/design/animation-tools.html.

It turns words into a clip the game plays: Uthana's text to motion onto a stand-in character made from the game's own body and rig, so the motion comes back on the game's bones, then a fit onto the rig as WolvenKit's import and the game want it, then REDbridge's import into a WolvenKit project, as a new clip or in place of a game clip. Node 18 or later, no dependencies. It needs [REDbridge](https://github.com/Edgemodders/REDbridge) 0.15.0 or later (`.anims` import) and an [Uthana](https://uthana.com) API key. Not published to npm yet.

```js
import { asBridge, ensureProject, generate, Rigs, uthana } from "@edgemodders/anim-core";

const bridge = asBridge(redbridge);           // REDcode's BridgeClient, or REDnode's kernel.bridge()
const project = ensureProject("C:/Users/me/Documents/MyMod");
const made = await generate({
  bridge,
  uthana: uthana(key),
  key,                                        // only a fingerprint of it is kept
  rig: Rigs.man_base,
  project,
  cacheDir,                                   // REDbridge's exports for anim-core are kept here
  prompt: "A man stands relaxed, raises his right hand and waves hello",
  length: 5,                                  // seconds; text-to-motion-3.0 costs $0.10 a second
  onStage: (stage, detail) => console.log(stage, detail),
});
// made.set: "mymod\\anims\\man_stands_relaxed_raises\\man_stands_relaxed_raises.anims", made.record: EDGEdir's facts
```

| Part | |
|---|---|
| `uthana(key)` | Uthana's API: `createCharacter`, `textToMotion`, `job`, `wait`, `download`; `cost(model, seconds)` |
| `Rigs`, `rigFor(path)` | `man_base` and `woman_base`: the base body, the deformations rig, and a standing idle as the fit's reference |
| `standIn(bridge, client, key, rig, cacheDir)` | The rig's Uthana character, uploaded once per account with auto-rig off; ids kept in `%LOCALAPPDATA%\Edgemodders\anim\characters.json` by a fingerprint of the key |
| `fitClip(motion, reference, name)` | A motion on the game's skeleton onto the reference clip's rig: every channel the game's clips have, the hips grounded to the game's foot height, WolvenKit's extras without fallback frames. Answers the `.glb` and a report |
| `addClip`, `madeClips` | A made clip in its own set (`<mod>\anims\<name>\<name>.anims`) with its record `<name>.edgefab.json` (`kind: "anim"`, as EDGEfab and EDGEdir agreed in EDGEfab #7), and the project's made clips by their records |
| `replaceClip` | Over a game clip, in a copy of its set at the game's path |
| `generate(options)` | The whole chain, each stage reported |
| `clipsIn(bridge, file)` | The clips of a set |
| `readGlb`, `writeGlb`, `clipOf`, `readAccessor` | The `.glb` helpers it uses |

Each made clip keeps the motion as it came (`<name>.source.glb`) and, in its record's `source`, the prompt, model, length and Uthana's ids. Uthana's terms (https://uthana.com/terms) give a paying customer the output, and let Uthana train on inputs and outputs.

`scripts/check.mjs` checks it on a PC with the game and an Uthana key, without starting a paid job.
