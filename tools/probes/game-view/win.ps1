# Spike 1 helper: window control for the game. Usage: win.ps1 <command> [args]
param([string]$cmd = "info", [int]$x = 0, [int]$y = 0, [int]$cw = 0, [int]$ch = 0,[long]$style = 0, [long]$exstyle = 0)

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class W {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
  [DllImport("user32.dll", EntryPoint="SetWindowLongPtrW")] public static extern IntPtr SetWindowLongPtr(IntPtr h, int i, IntPtr v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetClipCursor(out RECT r);
  [DllImport("user32.dll")] public static extern bool ClipCursor(IntPtr r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[void][W]::SetProcessDPIAware()

$p = Get-Process -Name Cyberpunk2077 -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $p) { "game process not found"; exit 1 }
# an owned window is not a "main window" to .NET, so find it by class
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class F { [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title); }'
$h = [F]::FindWindow("W2ViewportClass", [NullString]::Value)
if ($h -eq [IntPtr]::Zero) { "game has no main window"; exit 1 }

function Info {
  $r = New-Object W+RECT; $c = New-Object W+RECT; $clip = New-Object W+RECT
  [void][W]::GetWindowRect($h, [ref]$r); [void][W]::GetClientRect($h, [ref]$c); [void][W]::GetClipCursor([ref]$clip)
  $cls = New-Object Text.StringBuilder 256; [void][W]::GetClassName($h, $cls, 256)
  $ttl = New-Object Text.StringBuilder 256; [void][W]::GetWindowText($h, $ttl, 256)
  $fg = [W]::GetForegroundWindow(); $fgt = New-Object Text.StringBuilder 256; [void][W]::GetWindowText($fg, $fgt, 256)
  [pscustomobject]@{
    hwnd = $h; pid = $p.Id; class = $cls.ToString(); title = $ttl.ToString()
    style = ('0x{0:X}' -f [W]::GetWindowLongPtr($h, -16).ToInt64()); exstyle = ('0x{0:X}' -f [W]::GetWindowLongPtr($h, -20).ToInt64())
    window = "$($r.L),$($r.T) $($r.R - $r.L)x$($r.B - $r.T)"; client = "$($c.R)x$($c.B)"
    minimized = [W]::IsIconic($h); visible = [W]::IsWindowVisible($h); foreground = ($fg -eq $h); foregroundTitle = $fgt.ToString()
    clip = "$($clip.L),$($clip.T) $($clip.R - $clip.L)x$($clip.B - $clip.T)"
    screen = "$([W]::GetSystemMetrics(0))x$([W]::GetSystemMetrics(1))"; virtual = "$([W]::GetSystemMetrics(76)),$([W]::GetSystemMetrics(77)) $([W]::GetSystemMetrics(78))x$([W]::GetSystemMetrics(79))"
    dpi = [W]::GetDpiForWindow($h)
  } | Format-List
}

switch ($cmd) {
  "info" { Info }
  # move/resize without activating or changing z-order: NOACTIVATE 0x10 | NOZORDER 0x4 | FRAMECHANGED 0x20
  "place" { "SetWindowPos: " + [W]::SetWindowPos($h, [IntPtr]::Zero, $x, $y, $cw, $ch, 0x34); Start-Sleep -Milliseconds 800; Info }
  "style" { [void][W]::SetWindowLongPtr($h, -16, [IntPtr]$style); if ($exstyle) { [void][W]::SetWindowLongPtr($h, -20, [IntPtr]$exstyle) }; [void][W]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, 0, 0, 0x37); Info }
  "top" { "topmost: " + [W]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x13); Start-Sleep -Milliseconds 800; Info }
  "notop" { "notopmost: " + [W]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x13); Info }
  # make the game owned by the foreground window (VS Code): an owned window stays above its owner
  "own" { $o = (Get-Process Code | Where-Object { $_.MainWindowTitle -like '*REDcode - Visual Studio Code' } | Select-Object -First 1).MainWindowHandle; "owner was: " + [W]::SetWindowLongPtr($h, -8, $o); "owner now: " + [W]::GetWindowLongPtr($h, -8) + " (wanted $o)"; "raise: " + [W]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, 0, 0, 0x13); Start-Sleep -Milliseconds 800; Info }
  "disown" { "owner was: " + [W]::SetWindowLongPtr($h, -8, [IntPtr]::Zero); Info }
  "focus" { "SetForegroundWindow: " + [W]::SetForegroundWindow($h); Start-Sleep -Milliseconds 500; Info }
  "unclip" { "ClipCursor(null): " + [W]::ClipCursor([IntPtr]::Zero); Info }
}
