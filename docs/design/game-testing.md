---
title: Game tests by an assistant
---

# Game tests by an assistant

Draft 0.1, 2026-11-23. The list was agreed with the owner in chat the same day; REDcode's row is built, REDnode's rows are asked for.

The owner's goal for [the game in an editor tab](game-view.html), beyond faster testing by hand: a Claude session in the same VS Code runs a test of a mod in the game by itself, while the modder watches the game in a tab and keeps working.

## What a session can do today

| Step of a test | Today | Through |
|---|---|---|
| Change the mod, pack it, install it | Yes | redcode-mcp `project_pack`, EDGEdeck's tools |
| Swap changed archives into the running game | Yes | REDnode `archives_reload` |
| See the game: its picture, state, logs | Yes | REDnode `game_image`, `game_state`, `logs`, `window_text` |
| Read and call the game's functions | Yes, with an ask in the game before every changing call | REDnode `api_read`, `api_call` |
| Start and stop the game, know when it is ready | **No** | |
| Get from the main menu into a save | **No** | |
| Run many changing calls without a person at the game | **No**: each one asks | |
| Press keys and move the mouse in the game | **No** | |

## What closes each gap

| Gap | What | Whose | State |
|---|---|---|---|
| Start, stop, ready | `game_start`, `game_stop`, `game_status` in redcode-mcp | REDcode | Built 2026-11-23, not run against the game |
| Into a save | A call that loads a save by name, or continues the last one, from the main menu | REDnode | Asked: REDnode #57 |
| Asking every time | A consent the player gives once for a test session, with an end | REDnode | Asked: REDnode #57 |
| Input | A call that sends keys and mouse moves to the game without it having the focus | REDnode | Asked: REDnode #57 |

## REDcode's row, as built

The three tools are in `packages/redcode-mcp`, over `extensions/redcode/src/gameRun.ts` (no VS Code imports).

- **`game_start`** starts the game's exe so that it does not take over the monitor.
  - **With a REDcode window that offers the game tab:** it writes `game-tab-request.json` in `%LOCALAPPDATA%\REDcode`. The window in front takes it (a claim file made new, so one window only) and runs **Run Game in Tab**, which starts the game at a size that fits the tab.
  - **Otherwise:** it writes Windowed and a size (default 1920x1080) into the game's settings file and starts the exe. The player's own values are kept in `display-restore.json`.
- **`game_status`** says whether the game runs and whether REDnode in it answers, by asking the `redcode` REDnode package for the display (its request file, see the game view's design). REDnode's `game_state` then says whether a save is loaded.
- **`game_stop`** asks the game to close and ends its process when it has not gone after 15 seconds. Unverified: whether the game closes cleanly when asked this way.
- **The player's values go back** when the game has ended: in `game_stop`, in `game_status` after the game closed, or when a REDcode window starts.

The tools' descriptions tell an assistant to ask the player before starting the game, and before stopping one it did not start.

## A whole test, once REDnode's rows exist

1. `game_start`, then `game_status` until REDnode answers.
2. Load a named test save (REDnode).
3. `game_state` until the save is loaded.
4. The test's calls and inputs, under one consent (REDnode).
5. `game_image`, `logs` and reads for the result.
6. `game_stop`, or leave the game for the next change and `archives_reload`.

## Not planned here

- **Assertions and a test runner.** A session writes its own checks from the tools above. A runner comes only when the same tests are run again and again.
- **A second copy of the game.** One game, one test at a time.
