---
title: The game in an editor tab
---

# The game in an editor tab

Draft 0.1 for the owner, 2026-11-22. The owner asked whether REDcode can run the game inside an editor tab, for testing, without the game taking over the monitor. This page holds the research, the result of a first spike run against the game the same day, and a plan. Nothing is built in the repo yet.

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

## Spike 2: the tab's rectangle (half run)

The helper must know where the tab is on the screen, and a webview does not know its own place. UI Automation on VS Code's window read its layout from outside in about 150 ms: each tab by name, with its rectangle in real pixels. Still to do: pick out the content area of one webview by a known title, and check it at other scalings and zoom levels.

## Plan

| Stage | What | Needs |
|---|---|---|
| G0 | Finish Spike 2 with a test webview; check a window region on the game for a tab smaller than it | Nothing |
| G1 | **Run beside the editor:** today's Run Game with a size and a place, no focus taken. The helper as a real program | A decision on where the helper lives |
| G2 | **Run in Tab:** a `redcode.gameView` panel as the placeholder; the helper keeps the game over it on move, resize and split, hides it with the tab, and holds the release key. The size is set through REDnode | REDnode running; REDnode #56 for the overlay's cursor |
| G3 | Without REDnode: write `UserSettings.json` before launch | G2 |

Run in Tab starts the game's exe directly: a Steam launch hides the process from REDcode.

## Open decisions for the owner

1. **Where the helper lives.** A new `window.*` area in REDbridge (one install, but GPL code REDcode already talks to only over stdio, and a REDbridge release), or a small exe of REDcode's own. Recommended: REDbridge, since it is already the one native program REDcode installs and updates.
2. **The release key's default.** Pause/Break worked but some keyboards have none. Recommended: Ctrl+Alt+Backspace as the default, with a setting.
3. **VS Code's own popups.** The command palette, menus and hovers are hidden under the game where they overlap. Recommended: accept it in G2, with the release key also lowering the game for a moment if it proves a nuisance.
4. **The game's saved settings.** Run in Tab changes the window mode and resolution. Recommended: put the player's own values back when the tab closes or the game ends. Putting them back live worked in the spike (Borderless 3840x2160 through REDnode, saved by the game).

## Later

- **A streamed picture.** With focus on the game, no input needs injecting, so a tab could show captured frames while the real window sits off screen. It would let VS Code's popups show over the game. It costs capture, encoding and a decoder in the webview, whose codec support is unverified. REDnode's `game_image` already gives single frames to assistants.
- **Free sizes.** Any size the tab has would need the game's window code hooked inside the game, which is REDnode plugin work and its own research.
- **Sound.** The game has a Mute in Background setting (`/audio/misc` `MuteInBackground`); whether a released game should play sound is a setting to decide in G2.

## Sources

- Godot 4.4 release notes: https://godotengine.org/releases/4.4
- Godot forum, why the embedded game window is window management and not part of the engine: https://forum.godotengine.org/t/why-is-the-embedded-game-window-not-yet-fully-part-of-the-engine/106981
