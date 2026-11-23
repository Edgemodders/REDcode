# G0: keep the game on a webview: follow its rectangle, clip the game to it, hide the game when the webview is gone.
param([string]$name = 'testing.md', [int]$minutes = 15, [string]$log, [string]$title = '*REDcode - Visual Studio Code')
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class H {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern int SetWindowRgn(IntPtr h, IntPtr rgn, bool redraw);
  [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int l, int t, int r, int b);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[void][H]::SetProcessDPIAware()
function Say($t) { Add-Content -Path $log -Value ("{0:HH:mm:ss.fff} {1}" -f (Get-Date), $t) -Encoding utf8 }
$game = [H]::FindWindow("W2ViewportClass", [NullString]::Value)
if ($game -eq [IntPtr]::Zero) { Say "game window not found"; exit 1 }
$A = [System.Windows.Automation.AutomationElement]
$code = Get-Process Code | Where-Object { $_.MainWindowTitle -like $title } | Select-Object -First 1
$vs = $code.MainWindowHandle
$root = $A::FromHandle($vs)
$cond = New-Object System.Windows.Automation.AndCondition (
  (New-Object System.Windows.Automation.PropertyCondition ($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document)),
  (New-Object System.Windows.Automation.PropertyCondition ($A::NameProperty, $name)))
$c = New-Object H+RECT; [void][H]::GetClientRect($game, [ref]$c); $gw = $c.R; $gh = $c.B
[void][H]::SetWindowLongPtr($game, -16, [IntPtr]0x96000000L)
[void][H]::SetWindowLongPtr($game, -8, $vs)
Say "start: following '$name', game ${gw}x$gh"
$last = ""; $shown = $true; $ticks = 0; $ms = 0; $e = $null
$sw = [Diagnostics.Stopwatch]::StartNew(); $t = New-Object Diagnostics.Stopwatch
while ($sw.Elapsed.TotalMinutes -lt $minutes) {
  $t.Restart()
  $r = $null; if ($e) { try { $r = $e.Current.BoundingRectangle } catch { $e = $null } }
  if (-not $e -or -not $r -or $r.IsEmpty) { $e = $null; $r = $null; try { $e = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond) } catch {}; if ($e) { try { $r = $e.Current.BoundingRectangle } catch {} } }
  $gone = (-not $r) -or $r.IsEmpty -or $r.Width -lt 8 -or $r.Height -lt 8 -or [H]::IsIconic($vs)
  if ($gone) {
    if ($shown) { [void][H]::SetWindowRgn($game, [H]::CreateRectRgn(0, 0, 0, 0), $true); $shown = $false; $last = ""; Say "webview gone: game hidden (empty region)" }
  } else {
    $x = [int]$r.X; $y = [int]$r.Y; $w = [Math]::Min($gw, [int]$r.Width); $h = [Math]::Min($gh, [int]$r.Height)
    # centre the game in the webview when the webview is bigger
    $x += [Math]::Max(0, [int](($r.Width - $gw) / 2)); $y += [Math]::Max(0, [int](($r.Height - $gh) / 2))
    $key = "$x,$y ${w}x$h"
    $gr = New-Object H+RECT; [void][H]::GetWindowRect($game, [ref]$gr); $st = [H]::GetWindowLongPtr($game, -16).ToInt64()
    if ($key -eq $last -and ($gr.L -ne $x -or $gr.T -ne $y -or ($st -band 0xC00000) -ne 0)) { Say ("game moved itself to $($gr.L),$($gr.T) style 0x{0:X}: putting it back" -f $st); [void][H]::SetWindowLongPtr($game, -16, [IntPtr]0x96000000L); $last = "" }
    if ($key -ne $last) {
      [void][H]::SetWindowRgn($game, [H]::CreateRectRgn(0, 0, $w, $h), $true)
      [void][H]::SetWindowPos($game, [IntPtr]::Zero, $x, $y, $gw, $gh, 0x14)
      $shown = $true
      $last = $key; Say "moved: game at $key (webview $([int]$r.X),$([int]$r.Y) $([int]$r.Width)x$([int]$r.Height))"
    }
  }
  $ms += $t.ElapsedMilliseconds; $ticks += 1
  if ($ticks % 300 -eq 0) { Say "average tick $([int]($ms / $ticks)) ms over $ticks" }
  Start-Sleep -Milliseconds 30
}
[void][H]::SetWindowRgn($game, [IntPtr]::Zero, $true); [void][H]::ShowWindow($game, 4); Say "end"

