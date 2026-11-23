---
title: The game in an editor tab
---

# The game in an editor tab

Draft 0.2, 2026-11-22, agreed with the owner the same day (the four decisions below). The owner asked whether REDcode can run the game inside an editor tab, for testing, without the game taking over the monitor. This page holds the research, the result of a first spike run against the game the same day, and a plan. Nothing is built in the repo yet.

## The answer

Yes, as a **docked window**: the game stays its own process and its own window, with no border, kept exactly over an editor tab by a small helper. It looks embedded, and the picture and the input are the game's own. Godot 4.4 ships its embedded game window the same way on Windows and Linux.

| Idea | Verdict |
|---|---|
| A native plugin in the webview | Not possible: a VS Code webview is a sandboxed page with no native plugins |
| WebAssembly | Not possible: it cannot run a native DirectX 12 game |
| A wrapper `.exe` around the game | Not needed: the game's window can be styled, moved and owned from outside |
| A remote viewer of one app (VNC, RDP RemoteApp, Sunshine) | Possible to view, poor to play: on one PC the viewer and the game share one pointer and one keyboard focus. RemoteApp also needs Windows Pro |
| **A docked window** | **Works, proven by Spike 1 below** |
| A streamed picture in the webview | Possible later, behind the same tab; see Later |

## How it behaves (agreed with the owner in chat)

- The tab shows the game. A click on it gives the game the focus: the game then has the mouse and the keyboard, and VS Code has neither.
- A **release key** gives focus back to VS Code and frees the pointer. It is a system hotkey, since VS Code cannot see keys while the game has focus. Not Esc, which the game uses. The spike used Pause/Break; the key is a setting.
- While released, the game keeps running, so a modder can edit and watch.

## Sizes (the owner, 2026-11-22)

- **The game's listed sizes are enough.** The tab shows the game at one of them, one to one.
- **VS Code's own window is never touched.** It stays resizable and can fill the desktop while the game runs at 1920x1080 in its tab. The helper only moves and shows the game's window.
- **A tab smaller than the game.** The owner accepts a tab that cannot shrink below the game's size. An extension cannot stop a tab from shrinking, so the helper has to handle a smaller tab itself: drop to the next listed size when one fits, and otherwise show only the part of the game that fits the tab (a window region, unverified with the game's swap chain: a G0 check), with a line in the tab saying the game is cut off.

## Spike 1: window control (run 2026-11-22, with the owner)

Scratch PowerShell scripts over user32, outside the repo. The game ran with REDnode 0.69.0 on a 3840x2160 screen at 200% scaling.

| Check | Result |
|---|---|
| Find the window | Class `W2ViewportClass`. Once owned, it is no longer the process's main window, so find it by class |
| Border | Borderless Windowed has none. Windowed adds a title bar; the helper strips it and the game leaves it stripped |
| Move and resize from outside | Works, without taking focus |
| Above VS Code | Works by making VS Code's window the game's owner (`GWLP_HWNDPARENT`). Topmost was ignored by the game |
| Runs without focus | Yes: no pause menu, animation carries on, the same frame rate |
| Release key during mouse-look | Passed with the real key, twice (the owner), with Pause/Break; Ctrl+Alt+Backspace worked as well. The game holds the pointer at the window's middle; the helper frees it and focus returns to VS Code |
| Release from the pause menu | The game does not hold the pointer in menus, so a click on VS Code leaves too |
| The game's pointer and mouse-look | Right across the whole window, once the window is the game's own size (the owner) |
| REDnode's overlay cursor | **Fails:** it looks frozen or off when the real pointer leaves the window. Asked of REDnode in https://github.com/Edgemodders/REDnode/issues/56 |

### What the spike fixed in the design

1. **The window must be exactly the game's resolution.** The game does not follow an outside resize, in either window mode: it keeps drawing at its set resolution and Windows scales the picture. Scaled, the picture squashes at another shape, the GPU cost stays, and the game's pointer maps wrongly (the first hand check failed on this).
2. **REDnode changes the resolution live.** `GameInstance.GetSettingsSystem()`, `/video/display` `WindowMode` and `Resolution` with `SetIndex`, then `ConfirmChanges()`: the game re-rendered at 1920x1080 in about three seconds, with no restart. This is REDnode's part, not REDbridge's: REDbridge works on files, REDnode is in the running game.
3. **Only the game's listed sizes.** Here 1280x720, 1920x1080 and 3840x2160. A size added to the list with `SetValues` was ignored. So the tab shows the game at the largest listed size that fits, centred, with bars around it.
4. **An owned window follows its owner's stacking only.** The helper must still move it with the tab and hide it when the tab is hidden.

One oddity, unexplained: a window read back once at twice its size and place while the owner was switching tasks, and read right a moment later.

## Spike 2: the tab's rectangle (G0, run 2026-11-22)

The helper must know where the tab is on the screen, and a webview does not know its own place. UI Automation on VS Code's window answers it from outside:

| Check | Result |
|---|---|
| VS Code's layout | Readable: 6,401 elements in about 700 ms for the whole window, each with its DOM class and its rectangle in real pixels |
| One webview | Each webview is a `Document` element named by its page's `<title>`, inside a `webview-overlay-content` group. So the game tab's page gets a title of its own and the helper asks for that name |
| Speed | Finding one webview by name: 8 to 17 ms. Reading its rectangle again from the found element: under 2 ms. Fast enough to follow a tab by polling |

### The loop, tried with the owner the same evening

A scratch loop kept the game on a markdown preview tab: every 30 ms it read the webview's rectangle, moved the game there (centred when the tab is bigger), clipped it to the tab with a window region, and hid it when the tab was covered. The owner: it looks contained, follows a dragged divider, stays put when clicked, and the release key works.

| Finding | Detail |
|---|---|
| A region set from outside | `SetWindowRgn` from another process works on the game's window; the cut is clean and the game runs on |
| Never hide the window | After `ShowWindow` hide and show, the game put its window back in the middle of the screen on the next click. Hiding with an empty region instead cured it: no self-move in the run after |
| Guard anyway | The loop compares the game's real position and style each tick and puts them back |
| Keep the found element | Asking the kept element for its rectangle makes a tick 1 ms on average, against 95 ms when finding it again each time. Find again only when it answers with nothing |
| One owner | The game follows the VS Code window that owns it. Behind another VS Code window it is covered with its owner, which is right |
| Lighter | About 91 fps at 1920x1080 against about 32 at 3840x2160 on the owner's machine |

Not tried: another display scaling or VS Code zoom level, a tab dragged to another window, and a second monitor with a different scaling.

### A hung window (found 2026-11-22, by accident)

A stand-in test of the helper left a Notepad window owned by VS Code with its thread hung. While it was owned, UI Automation on VS Code's window did not answer at all (over 60 s), and `SetWindowRgn` and `SetWindowPos` on the hung window blocked the caller. Clearing the owner still worked, and UI Automation answered again at once (277 ms). So the helper must expect a game that hangs or crashes while docked: do its window calls with a timeout or the async flag, and clear the owner first when the game stops answering (`IsHungAppWindow`). It must also find the game by its process and class, never by a class alone.

## REDcode's side (G2, built 2026-11-22, hand test passed 2026-11-23)

The owner ran all eight steps on 2026-11-23 and they pass (`docs/testing.md`, Run Game in Tab), with two fixes waiting on a retest: the game leaves the tab's status line free, and the release key is read while the game does not answer (then the window in front is Windows' stand-in of class `Ghost`, not the game's own). The game goes by the value in `UserSettings.json`, so the size written before the start holds.

- **The command** `redcode.runInTab` (**Run Game in Tab**) opens a `redcode.gameView` webview panel whose page has a title of its own, by which the helper finds it. The page is black with one status line: **Play**, **Undock** and the release key.
- **The size** comes from the tab's real pixels (`pickResolution` in `src/gameDisplay.ts`: the largest of 1280x720 and 1920x1080 that fits, or `redcode.gameView.resolution`).
- **Before the start** REDcode writes Windowed and that size into `UserSettings.json` (`setWindowed`), since Run in Tab starts the game itself. The file keeps an index beside each value; the resolution's index is left as it was, and the game goes by the value (the hand test, 2026-11-23).
- **After the end** the player's two values are put back (`restoreDisplay`), once the game's process is gone; what to put back is kept in global state, so a restart of VS Code still does it.
- **The helper** is `tools/probes/game-view/helper.ps1` for now: JSON lines out (`docked`, `moved`, `hidden`, `focus`, `released`, `lost`), files dropped in a folder in (`stop`, `focus`, `hide`, `show`). The command shows only when the script is found, so not in a released build. REDbridge's `window.*` replaces it behind the same events.
- **A game already running** is docked as it is. Setting its size through REDnode (a function in the `redcode` REDnode package) is the next step, with REDnode #56.

## Plan

| Stage | What | Needs |
|---|---|---|
| G0 | Spike 2 and the loop: **done 2026-11-22**, scripts kept in `tools/probes/game-view` | Nothing |
| G1 | **Run beside the editor:** today's Run Game with a size and a place, no focus taken. The helper as a real program | A decision on where the helper lives |
| G2 | **Run in Tab:** a `redcode.gameView` panel as the placeholder; the helper keeps the game over it on move, resize and split, hides it with the tab, and holds the release key. The size is set through REDnode | REDnode running; REDnode #56 for the overlay's cursor |
| G3 | Without REDnode: write `UserSettings.json` before launch | G2 |

Run in Tab starts the game's exe directly: a Steam launch hides the process from REDcode.

## Decisions (agreed with the owner, 2026-11-22)

1. **The helper lives in REDbridge**, as a new `window.*` area: it is already the one native program REDcode installs and updates, and REDcode talks to it only over stdio. It needs a REDbridge release, asked in https://github.com/Edgemodders/REDbridge/issues/22 with the loop as it was proven.
2. **The release key** is Ctrl+Alt+Backspace by default, with a setting. Pause/Break worked too, but some keyboards have none.
3. **VS Code's own popups** (the command palette, menus, hovers) are hidden under the game where they overlap. Accepted for G2; if it proves a nuisance, the release key can also lower the game for a moment.
4. **The game's saved settings:** Run in Tab changes the window mode and resolution, and puts the player's own values back when the tab closes or the game ends. Putting them back live worked in the spike (Borderless 3840x2160 through REDnode, saved by the game).

## Later

- **A streamed picture.** With focus on the game, no input needs injecting, so a tab could show captured frames while the real window sits off screen. It would let VS Code's popups show over the game. It costs capture, encoding and a decoder in the webview, whose codec support is unverified. REDnode's `game_image` already gives single frames to assistants.
- **Free sizes.** Any size the tab has would need the game's window code hooked inside the game, which is REDnode plugin work and its own research.
- **Sound.** The game has a Mute in Background setting (`/audio/misc` `MuteInBackground`); whether a released game should play sound is a setting to decide in G2.

## Sources

- Godot 4.4 release notes: https://godotengine.org/releases/4.4
- Godot forum, why the embedded game window is window management and not part of the engine: https://forum.godotengine.org/t/why-is-the-embedded-game-window-not-yet-fully-part-of-the-engine/106981
