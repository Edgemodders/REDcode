---
title: Keys
---

# Keys: REDcode keeps the shared key store for every EDGE tool

Draft 0.1, 2026-11-19, agreed with the owner the same day, with every recommendation below. Written from the REDnode session. The store itself is REDnode's: [Shared keys](https://edgemodders.github.io/REDnode/keys.html).

## Why

On 2026-11-11 the EDGE VS Code extensions moved their AI service keys into VS Code's own secret storage, each extension asking for its keys itself. The reason was a guess: the VS Code Marketplace had refused EDGEhack ("suspicious content"), and the shared store's PowerShell decryption looked like the likely cause. That move had costs:

- A modder types the same key into each tool.
- Keys typed in VS Code never reach the game, whose tools (REDnode's Keys view, REDagent, `edgewave-voice`) use the shared files.
- MCP servers started by Claude Code get keys only from their environment, so EDGEwave's **Connect an Assistant** writes the ElevenLabs key in plain text into `claude mcp add -e`.

Then Marketplace support said keywords trigger the rejection. EDGEhack 0.1.1, which had no key code, was refused as well, and 0.1.2 went on the Marketplace on 2026-11-19 after support's review. So the store was likely not the cause (unverified). The owner chose to bring the shared store back for every tool, with REDcode as its keeper.

## The design

| Part | What it does |
|---|---|
| **The store** | The shared files, unchanged: `%APPDATA%\Edgemodders\keys\<service>.txt`, Windows DPAPI for the current user, `used-by.json` beside them. A key set in the game or in VS Code is there for both |
| **Who decrypts** | REDbridge, in .NET (`ProtectedData`, no PowerShell). No VS Code package carries decryption code. The `.txt` files are PowerShell's `ConvertFrom-SecureString` hex, which is DPAPI with no extra entropy, so .NET reads them as they are (checked in K4a, both ways) |
| **Who may ask REDbridge** | Only a client that started it with `--keys`: REDcode, and MCP servers that read keys. REDnode's host starts its REDbridge without it, because it lends that REDbridge to packages and in-game servers |
| **The keeper** | REDcode is the only VS Code extension that reads or writes the store, through REDbridge. Other extensions hold no key code |
| **The interface** | REDcode's extension API (`REDcodeApi`, beside `revealInProject`): `keys.get(service, caller)`, `keys.ask(service, caller)` (asks the modder and saves the key for every tool), `keys.onDidChange`. Another extension calls it through `vscode.extensions.getExtension("edgemodders.redcode-cyberpunk").exports` |
| **Keys view** | One place in REDcode to see, set, replace and clear every key, with the tools that read each one (`used-by.json`), as REDnode's in-game Keys view does |
| **Consent** | The first time a tool asks for a service, REDcode asks "EDGEhack wants your OpenAI key" and remembers the answer per tool and service. VS Code does not tell REDcode who calls, so the caller names itself: a courtesy, not a lock. VS Code extensions are trusted code in one process anyway |
| **Environment** | A variable still wins (`OPENAI_API_KEY` and the rest), for CI and clients that pass keys |

## Decisions (the owner, 2026-11-19)

| # | Question | Decided |
|---|---|---|
| 1 | Who decrypts for REDcode: `keys.mjs` through PowerShell, or REDbridge | **REDbridge.** It keeps PowerShell decryption out of REDcode, the flagship with the verified badge, and removes the 1 s each PowerShell read costs |
| 2 | Hard or soft dependency on REDcode | **Hard:** each key-using extension lists REDcode in `extensionDependencies`. EDGEhack and EDGEwave already do; EDGEmat and EDGEfab gain it |
| 3 | MCP servers started by Claude Code, outside VS Code | **They read the store through REDbridge** when their environment has no key, so no key goes into `claude mcp add -e` |
| 4 | Keys saved in a tool's own secret storage | **Moved once** into the shared store, with a notice, so nobody is asked again |

## Phases

| Phase | Where | What |
|---|---|---|
| K4a | REDbridge | **Built on REDbridge's main, 2026-11-20:** `keys.get`, `keys.set`, `keys.delete`, `keys.info`, `keys.list` on the store, with `used-by.json` kept as REDnode's library keeps it. Off unless REDbridge is started with `--keys`. Checked both ways against REDnode's `keys.mjs` and against the dev PC's own keys |
| K4b | REDcode | **Built on REDcode's main, 2026-11-20** (below): the Keys view, `REDcodeApi.keys`, the consent prompt. Hand test given to the owner; needs REDbridge 0.18.0 (built from REDbridge's main until it is released) |
| K4c | EDGEwave first | The pilot: its extension asks REDcode, its MCP server reads through REDbridge, its saved ElevenLabs key moves over, and **Connect an Assistant** stops writing the key |
| K4d | Every other key-using tool | EDGEhack, EDGEmat, EDGEfab (and REDnode's host, through REDbridge in place of PowerShell, if the owner wants it). A request issue each |

## Releases (the owner, 2026-11-19)

- **No Marketplace release of REDcode with the key API** until one tool has run the whole key lifecycle on it, MCP use included: K4c's pilot, set, asked, read, changed and cleared, in VS Code and through its MCP server.
- **Then every tool that uses keys moves to this design, and they are all released at once.**

## K4b as built (2026-11-20)

| Part | Where |
|---|---|
| The calls | `src/keys.ts`, no VS Code imports: `listKeys`, `keyInfo`, `getKey`, `setKey`, `deleteKey` over REDbridge's `keys.*`, the service id check, the store's folder (`EDGEMODDERS_KEYS_DIR`, else `%APPDATA%\Edgemodders\keys`), the view's lines (`describeKey`, never the key) and REDbridge's refusals turned into what to do ("needs REDbridge 0.18.0", "Restart REDbridge") |
| Who may call `keys.*` | REDcode starts its REDbridge with `--keys` (0.17.0 ignores the flag). `BridgeClient.request()`, which `REDcodeApi.bridge()` hands out and the MCP server uses, refuses `keys.*`; REDcode's own calls go through a symbol-keyed method (`KeyAccess`). A courtesy, as the design says |
| The view and the API | `src/keysView.ts`: the Keys view (collapsed by default, after LocKeys), its commands, the consent prompt (modal, Allow or Don't Allow, kept in global state `redcode.keyConsent` per caller and service, one question at a time), `REDcodeApi.keys` (`get`, `ask`, `onDidChange`), and a watch on the store's folder so a key set in the game or another window shows and fires `onDidChange` |
| Consent | Asked only when there is a key to hand over: `get` for an unset key answers `undefined` without asking. `ask` allows its caller, who just had the modder type the key |
| Checked | Unit checks (3, 74 in all): ids, folder, consent names, refusals, the view's lines, `request()` refusing `keys.*`, the calls through a stand-in bridge. Against REDbridge built from main on a scratch folder with test keys: the whole life of a key (set, read with `used-by.json` recording the caller, removed), a refused key, the variable winning, REDbridge without `--keys`, and REDbridge 0.17.0 starting with `--keys` and saying 0.18.0 is needed |

**Release:** the owner's rule stands. REDcode's main now carries the key API, so no REDcode goes to the stores until EDGEwave's pilot (K4c) has run the whole key lifecycle on it, MCP use included.

## Open

- **Linux:** DPAPI is Windows only. A Linux REDbridge needs another store (libsecret, or a file it encrypts). See REDbridge's docs/linux.md.
- **REDcode without REDbridge:** a modder who has not installed REDbridge yet. REDcode's Install REDbridge comes first; until then, `keys.get` answers that the key store needs REDbridge.
