# G0: dock the game on a webview's rectangle (found by its document name), and clip it with a window region.
# dock.ps1 dock [-name 'Claude Code']      strip the frame, own by VS Code, put the game's corner on the webview's corner
# dock.ps1 clip -cw 960 -ch 540            show only that much of the game (from its top-left)
# dock.ps1 unclip
param([string]$cmd = "dock", [string]$name = 'Claude Code', [int]$cw = 0, [int]$ch = 0, [string]$title = '*REDcode - Visual Studio Code')
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class G {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll", SetLastError=true)] public static extern int SetWindowRgn(IntPtr h, IntPtr rgn, bool redraw);
  [DllImport("user32.dll")] public static extern int GetWindowRgnBox(IntPtr h, out RECT r);
  [DllImport("gdi32.dll")] public static extern IntPtr CreateRectRgn(int l, int t, int r, int b);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[void][G]::SetProcessDPIAware()
$game = [G]::FindWindow("W2ViewportClass", [NullString]::Value)
if ($game -eq [IntPtr]::Zero) { "game window not found"; exit 1 }
function Show { $r = New-Object G+RECT; $c = New-Object G+RECT; $b = New-Object G+RECT; [void][G]::GetWindowRect($game, [ref]$r); [void][G]::GetClientRect($game, [ref]$c); $k = [G]::GetWindowRgnBox($game, [ref]$b)
  "game: window $($r.L),$($r.T) $($r.R - $r.L)x$($r.B - $r.T) client $($c.R)x$($c.B) style 0x$('{0:X}' -f [G]::GetWindowLongPtr($game, -16).ToInt64()) region kind $k box $($b.L),$($b.T) $($b.R - $b.L)x$($b.B - $b.T)" }

switch ($cmd) {
  "dock" {
    $A = [System.Windows.Automation.AutomationElement]
    $code = Get-Process Code | Where-Object { $_.MainWindowTitle -like $title } | Select-Object -First 1
    $root = $A::FromHandle($code.MainWindowHandle)
    $cond = New-Object System.Windows.Automation.AndCondition (
      (New-Object System.Windows.Automation.PropertyCondition ($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document)),
      (New-Object System.Windows.Automation.PropertyCondition ($A::NameProperty, $name)))
    $e = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
    if (-not $e) { "webview '$name' not found"; exit 1 }
    $w = $e.Current.BoundingRectangle
    "webview '$name': $([int]$w.X),$([int]$w.Y) $([int]$w.Width)x$([int]$w.Height)"
    $c = New-Object G+RECT; [void][G]::GetClientRect($game, [ref]$c); $gw = $c.R; $gh = $c.B
    "game client before: ${gw}x$gh"
    [void][G]::SetWindowLongPtr($game, -16, [IntPtr]0x96000000L)
    [void][G]::SetWindowLongPtr($game, -8, $code.MainWindowHandle)
    "place: " + [G]::SetWindowPos($game, [IntPtr]::Zero, [int]$w.X, [int]$w.Y, $gw, $gh, 0x34)
    Start-Sleep -Milliseconds 1500; Show
  }
  "clip" { $rgn = [G]::CreateRectRgn(0, 0, $cw, $ch); $ok = [G]::SetWindowRgn($game, $rgn, $true); "SetWindowRgn: $ok (error $([Runtime.InteropServices.Marshal]::GetLastWin32Error()))"; Start-Sleep -Milliseconds 1500; Show }
  "unclip" { "SetWindowRgn(null): " + [G]::SetWindowRgn($game, [IntPtr]::Zero, $true); Show }
}
