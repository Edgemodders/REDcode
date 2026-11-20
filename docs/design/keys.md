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
| **Who decrypts** | REDbridge, in .NET (`ProtectedData`, no PowerShell). No VS Code package carries decryption code. The `.txt` files are PowerShell's `ConvertFrom-SecureString` hex, which is DPAPI with no extra entropy, so .NET reads them as they are (unverified: K4a checks it against keys REDnode wrote) |
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
| K4a | REDbridge | `keys.get`, `keys.set`, `keys.list`, `keys.delete` on the store, with `used-by.json` kept as REDnode's library keeps it. Checked against keys REDnode's Keys view wrote |
| K4b | REDcode | The Keys view, `REDcodeApi.keys`, the consent prompt |
| K4c | EDGEwave first | The pilot: its extension asks REDcode, its MCP server reads through REDbridge, its saved ElevenLabs key moves over, and **Connect an Assistant** stops writing the key |
| K4d | Every other key-using tool | EDGEhack, EDGEmat, EDGEfab (and REDnode's host, through REDbridge in place of PowerShell, if the owner wants it). A request issue each |

## Releases (the owner, 2026-11-19)

- **No Marketplace release of REDcode with the key API** until one tool has run the whole key lifecycle on it, MCP use included: K4c's pilot, set, asked, read, changed and cleared, in VS Code and through its MCP server.
- **Then every tool that uses keys moves to this design, and they are all released at once.**

## Open

- **Linux:** DPAPI is Windows only. A Linux REDbridge needs another store (libsecret, or a file it encrypts). See REDbridge's docs/linux.md.
- **REDcode without REDbridge:** a modder who has not installed REDbridge yet. REDcode's Install REDbridge comes first; until then, `keys.get` answers that the key store needs REDbridge.
