# The game in an editor tab: the interim helper REDcode starts until REDbridge has window.* (REDbridge #22).
# It keeps the game's window on one VS Code webview and holds the release key.
#
#   helper.ps1 -title <webview document name> -dir <command folder> [-codePid <VS Code main pid>]
#              [-releaseKey ctrl+alt+backspace] [-waitSeconds 180] [-reserve <pixels>]
#
# Out: one JSON object per line on stdout: {"event":"waiting"|"docked"|"moved"|"put-back"|"hidden"|"focus"|"released"|"hung"|"answering"|"lost"|"stopped"|"error", ...}
# Only ever point -class at the game: a stand-in test on Notepad left one of its windows hung (2026-11-22).
# In:  empty files dropped in -dir: stop (undock and end), focus (give the game the focus), hide, show.
param(
  [Parameter(Mandatory = $true)][string]$title,
  [Parameter(Mandatory = $true)][string]$dir,
  [int]$codePid = 0,
  [string]$releaseKey = 'ctrl+alt+backspace',
  [int]$waitSeconds = 180,
  # pixels at the tab's bottom the game must leave free
  [int]$reserve = 0,
  [string]$class = 'W2ViewportClass'
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class GV {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsHungAppWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern int SetWindowRgn(IntPtr h, IntPtr rgn, bool redraw);
  [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int l, int t, int r, int b);
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr h, int id);
  [DllImport("user32.dll")] public static extern bool PeekMessage(out MSG m, IntPtr h, uint min, uint max, uint remove);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool ClipCursor(IntPtr r);
  [DllImport("user32.dll")] public static extern bool AdjustWindowRectEx(ref RECT r, uint style, bool menu, uint exStyle);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  // Visible top-level windows of one class, optionally of one process.
  public static List<IntPtr> Windows(string cls, uint pid) {
    var found = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var s = new StringBuilder(128); GetClassName(h, s, 128);
      if (s.ToString() != cls) return true;
      uint p; GetWindowThreadProcessId(h, out p);
      if (pid == 0 || p == pid) found.Add(h);
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
[void][GV]::SetProcessDPIAware()

function Emit($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress)); [Console]::Out.Flush() }
function Take($name) { $f = Join-Path $dir $name; if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue; return $true }; return $false }

# The release key: modifiers and one key.
function Read-Key([string]$text) {
  $mods = 0x4000 # no repeat
  $vk = 0
  $keys = @{ backspace = 0x08; pause = 0x13; home = 0x24; end = 0x23; insert = 0x2D; delete = 0x2E; escape = 0x1B; space = 0x20; scrolllock = 0x91 }
  foreach ($part in $text.ToLower().Split('+') | ForEach-Object { $_.Trim() }) {
    switch -Regex ($part) {
      '^(ctrl|control)$' { $mods = $mods -bor 2; break }
      '^alt$' { $mods = $mods -bor 1; break }
      '^shift$' { $mods = $mods -bor 4; break }
      '^win$' { $mods = $mods -bor 8; break }
      '^f([1-9]|1[0-9]|2[0-4])$' { $vk = 0x6F + [int]$Matches[1]; break }
      '^[a-z0-9]$' { $vk = [int][char]$part.ToUpper(); break }
      default { if ($keys.ContainsKey($part)) { $vk = $keys[$part] } }
    }
  }
  return @{ mods = $mods; vk = $vk }
}

New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($n in 'stop', 'focus', 'hide', 'show') { [void](Take $n) }

# 1. The game's window.
$game = [IntPtr]::Zero
$sw = [Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt $waitSeconds) {
  $game = [GV]::FindWindow($class, [NullString]::Value)
  if ($game -ne [IntPtr]::Zero) { break }
  if (Take 'stop') { Emit @{ event = 'stopped' }; exit 0 }
  if ($sw.ElapsedMilliseconds % 5000 -lt 300) { Emit @{ event = 'waiting'; seconds = [int]$sw.Elapsed.TotalSeconds } }
  Start-Sleep -Milliseconds 250
}
if ($game -eq [IntPtr]::Zero) { Emit @{ event = 'error'; why = "The game's window did not appear in $waitSeconds seconds." }; exit 1 }

$key = Read-Key $releaseKey
$hot = $key.vk -ne 0 -and [GV]::RegisterHotKey([IntPtr]::Zero, 1, [uint32]$key.mods, [uint32]$key.vk)
if (-not $hot) { Emit @{ event = 'error'; why = "The release key $releaseKey could not be registered; another program may hold it. Alt+Tab leaves the game."; fatal = $false } }

$A = [System.Windows.Automation.AutomationElement]
$cond = New-Object System.Windows.Automation.AndCondition (
  (New-Object System.Windows.Automation.PropertyCondition ($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document)),
  (New-Object System.Windows.Automation.PropertyCondition ($A::NameProperty, $title)))

# The webview, in any VS Code window (a tab can be dragged to another one).
function Find-Webview {
  foreach ($w in [GV]::Windows('Chrome_WidgetWin_1', [uint32]$codePid)) {
    if ([GV]::IsIconic($w)) { continue }
    try {
      $e = $A::FromHandle($w).FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
      if ($e) { return @{ element = $e; window = $w } }
    } catch {}
  }
  return $null
}

$style0 = [GV]::GetWindowLongPtr($game, -16)
$plain = [IntPtr]0x96000000L
$e = $null; $owner = [IntPtr]::Zero; $last = ''; $shown = $true; $hidden = $false; $docked = $false
$focused = $false; $stripped = $false; $hung = $false; $nextFind = 0; $m = New-Object GV+MSG
$clock = [Diagnostics.Stopwatch]::StartNew()

function Hide-Game { if ($script:shown) { [void][GV]::SetWindowRgn($game, [GV]::CreateRectRgn(0, 0, 0, 0), $true); $script:shown = $false; $script:last = ''; Emit @{ event = 'hidden' } } }

try {
  while ($true) {
    if (-not [GV]::IsWindow($game)) { Emit @{ event = 'lost' }; break }
    if (Take 'stop') { break }
    # A game that stops answering (a long load, a crash) must not stay owned: window calls on it block, and
    # UI Automation on its owner blocks with them. Let it go until it answers again.
    if ([GV]::IsHungAppWindow($game)) {
      if (-not $hung) { $hung = $true; [void][GV]::SetWindowLongPtr($game, -8, [IntPtr]::Zero); Emit @{ event = 'hung' } }
      Start-Sleep -Milliseconds 250; continue
    } elseif ($hung) {
      $hung = $false; if ($owner -ne [IntPtr]::Zero) { [void][GV]::SetWindowLongPtr($game, -8, $owner) }; $last = ''; Emit @{ event = 'answering' }
    }
    if (Take 'hide') { $hidden = $true }
    if (Take 'show') { $hidden = $false; $nextFind = 0 }
    if (Take 'focus') {
      # a background process may not take the foreground; a tap of Alt lifts that lock
      [GV]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [GV]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
      [void][GV]::SetForegroundWindow($game)
    }
    if ([GV]::PeekMessage([ref]$m, [IntPtr]::Zero, 0x312, 0x312, 1)) {
      if ([GV]::GetForegroundWindow() -eq $game) {
        [void][GV]::ClipCursor([IntPtr]::Zero)
        if ($owner -ne [IntPtr]::Zero) { [void][GV]::SetForegroundWindow($owner) }
        Emit @{ event = 'released' }
      }
    }
    $now = [GV]::GetForegroundWindow() -eq $game
    if ($now -ne $focused) { $focused = $now; Emit @{ event = 'focus'; game = $focused } }

    # the webview's rectangle: from the kept element, or by a new search (not more than once a second)
    $r = $null
    if (-not $hidden) {
      if ($e) { try { $r = $e.Current.BoundingRectangle } catch { $e = $null } }
      if ((-not $e -or -not $r -or $r.IsEmpty) -and $clock.ElapsedMilliseconds -ge $nextFind) {
        $e = $null; $r = $null
        $f = Find-Webview
        if ($f) {
          $e = $f.element
          if ($f.window -ne $owner) { $owner = $f.window; [void][GV]::SetWindowLongPtr($game, -8, $owner); $last = '' }
          try { $r = $e.Current.BoundingRectangle } catch { $e = $null }
        }
        $nextFind = $clock.ElapsedMilliseconds + 1000
      }
    }
    $gone = $hidden -or (-not $r) -or $r.IsEmpty -or $r.Width -lt 8 -or $r.Height -lt 8 -or ($owner -ne [IntPtr]::Zero -and [GV]::IsIconic($owner))
    if ($gone) {
      if ($docked) { Hide-Game }
    } else {
      $c = New-Object GV+RECT; [void][GV]::GetClientRect($game, [ref]$c); $gw = $c.R; $gh = $c.B
      $st = [GV]::GetWindowLongPtr($game, -16).ToInt64()
      if (($st -band 0xC00000) -ne 0) {
        # the game has a frame (Windowed mode, or a change of mode): strip it, and keep the picture's own size,
        # which is the client size it had with the frame on
        [void][GV]::SetWindowLongPtr($game, -16, $plain); [void][GV]::SetWindowPos($game, [IntPtr]::Zero, 0, 0, $gw, $gh, 0x36); $stripped = $true; $last = ''
      } elseif ($gw -gt 0 -and $gh -gt 0) {
        # the tab's own status line, at its bottom, stays free of the game
        $ah = [Math]::Max(8, [int]$r.Height - $reserve)
        $w = [Math]::Min($gw, [int]$r.Width); $h = [Math]::Min($gh, $ah)
        $x = [int]$r.X + [Math]::Max(0, [int](($r.Width - $gw) / 2)); $y = [int]$r.Y + [Math]::Max(0, [int](($ah - $gh) / 2))
        $k = "$x,$y ${w}x$h ${gw}x$gh"
        $gr = New-Object GV+RECT; [void][GV]::GetWindowRect($game, [ref]$gr)
        if ($k -ne $last -or $gr.L -ne $x -or $gr.T -ne $y) {
          [void][GV]::SetWindowRgn($game, [GV]::CreateRectRgn(0, 0, $w, $h), $true)
          # place, never resize: the game does not follow a resize
          [void][GV]::SetWindowPos($game, [IntPtr]::Zero, $x, $y, 0, 0, 0x15)
          $shown = $true
          $o = @{ x = $x; y = $y; shown = @($w, $h); game = @($gw, $gh); tab = @([int]$r.Width, [int]$r.Height) }
          if (-not $docked) { $docked = $true; $o.event = 'docked' } elseif ($k -ne $last) { $o.event = 'moved' } else { $o.event = 'put-back' }
          Emit $o
          $last = $k
        }
      }
    }
    Start-Sleep -Milliseconds 30
  }
} finally {
  if ($hot) { [void][GV]::UnregisterHotKey([IntPtr]::Zero, 1) }
  if ([GV]::IsWindow($game)) {
    # leave the game as an ordinary window again
    [void][GV]::SetWindowLongPtr($game, -8, [IntPtr]::Zero)
    if ([GV]::IsHungAppWindow($game)) { Emit @{ event = 'stopped' }; exit 0 }
    [void][GV]::SetWindowRgn($game, [IntPtr]::Zero, $true)
    if ($stripped) {
      # the frame back on, around the same picture size
      $c = New-Object GV+RECT; [void][GV]::GetClientRect($game, [ref]$c)
      [void][GV]::SetWindowLongPtr($game, -16, $style0)
      [void][GV]::AdjustWindowRectEx([ref]$c, [uint32]($style0.ToInt64() -band 0xFFFFFFFFL), $false, [uint32]([GV]::GetWindowLongPtr($game, -20).ToInt64() -band 0xFFFFFFFFL))
      [void][GV]::SetWindowPos($game, [IntPtr]::Zero, 0, 0, $c.R - $c.L, $c.B - $c.T, 0x36)
    }
  }
  Emit @{ event = 'stopped' }
}
