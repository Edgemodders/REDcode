# Spike 1: a release key that lives for a while. Pause frees the cursor and gives focus to VS Code. Logs each press.
param([int]$minutes = 15, [string]$log)
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class R {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int x; public int y; }
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint vk);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr h, int id);
  [DllImport("user32.dll")] public static extern bool PeekMessage(out MSG m, IntPtr h, uint min, uint max, uint remove);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetClipCursor(out RECT r);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern bool ClipCursor(IntPtr r);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[void][R]::SetProcessDPIAware()
function Say($t) { $line = "{0:HH:mm:ss} {1}" -f (Get-Date), $t; Add-Content -Path $log -Value $line -Encoding utf8 }
function Get-Spot { $c = New-Object R+RECT; [void][R]::GetClipCursor([ref]$c); $p = New-Object R+POINT; [void][R]::GetCursorPos([ref]$p); $s = New-Object Text.StringBuilder 256; [void][R]::GetWindowText([R]::GetForegroundWindow(), $s, 256); "foreground='$s' clip=$($c.L),$($c.T) $($c.R - $c.L)x$($c.B - $c.T) cursor=$($p.X),$($p.Y)" }
$code = (Get-Process Code | Where-Object { $_.MainWindowTitle -like '*REDcode - Visual Studio Code' } | Select-Object -First 1).MainWindowHandle
Say ("start; Pause registered: " + [R]::RegisterHotKey([IntPtr]::Zero, 1, 0x4000, 0x13) + "; Ctrl+Alt+Backspace registered: " + [R]::RegisterHotKey([IntPtr]::Zero, 2, 0x4003, 0x08))
$m = New-Object R+MSG; $sw = [Diagnostics.Stopwatch]::StartNew(); $last = ""
while ($sw.Elapsed.TotalMinutes -lt $minutes) {
  if ([R]::PeekMessage([ref]$m, [IntPtr]::Zero, 0x312, 0x312, 1)) {
    Say ("RELEASE KEY pressed (id $($m.wParam)); " + (Get-Spot))
    [void][R]::ClipCursor([IntPtr]::Zero); $ok = [R]::SetForegroundWindow($code)
    Start-Sleep -Milliseconds 300
    Say ("released (focus back: $ok); " + (Get-Spot))
  }
  # note each change of the focused window, so the log shows the game's cursor lock
  $s = New-Object Text.StringBuilder 256; [void][R]::GetWindowText([R]::GetForegroundWindow(), $s, 256)
  if ($s.ToString() -ne $last) { $last = $s.ToString(); Start-Sleep -Milliseconds 400; Say ("focus changed; " + (Get-Spot)) }
  Start-Sleep -Milliseconds 15
}
[void][R]::UnregisterHotKey([IntPtr]::Zero, 1); Say "end"


