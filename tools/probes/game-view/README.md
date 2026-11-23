# Game view probes

Scratch PowerShell from the spikes of 2026-11-22 for the game in an editor tab (`docs/design/game-view.md`). They are the reference for REDbridge's `window.*` (https://github.com/Edgemodders/REDbridge/issues/22), not shipped code. Windows PowerShell 5.1, run with the game up:

    powershell -NoProfile -ExecutionPolicy Bypass -File <script> ...

| Script | Does |
|---|---|
| `win.ps1` | The game window: `info`, `place -x -y -cw -ch`, `style -style`, `own`, `disown`, `focus`, `unclip` |
| `dock.ps1` | `dock -name <webview title>` puts the game on a webview once; `clip -cw -ch` and `unclip` set a window region |
| `follow.ps1` | The loop: `-name <webview title> -minutes <n> -log <file>` keeps the game on that webview, clipped, hidden with an empty region |
| `helper.ps1` | The interim helper REDcode's **Run Game in Tab** starts (`extensions/redcode/src/gameView.ts`): the loop and the release key in one, JSON lines out, command files in. See its header |
| `release.ps1` | The release key: `-minutes <n> -log <file>`; Pause or Ctrl+Alt+Backspace frees the pointer and focuses VS Code |

They look for a VS Code window titled `* REDcode - Visual Studio Code`; change `$title` for another. The game's resolution and window mode are set through REDnode (`/video/display` `WindowMode` and `Resolution`, `SetIndex`, then `ConfirmChanges`), and put back the same way.
