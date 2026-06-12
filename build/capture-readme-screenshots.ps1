param(
  [switch]$AutoChat,
  [string]$OutDir = (Join-Path $PSScriptRoot '..\docs\images')
)

$ErrorActionPreference = 'Stop'
$OutDir = [System.IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
public class WinCap {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, int flags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public static void Save(IntPtr hWnd, string path) {
    RECT r; GetWindowRect(hWnd, out r);
    int w = r.Right - r.Left, h = r.Bottom - r.Top;
    if (w <= 0 || h <= 0) throw new Exception("Invalid window size");
    using (var bmp = new Bitmap(w, h)) {
      using (var g = Graphics.FromImage(bmp)) {
        IntPtr hdc = g.GetHdc();
        PrintWindow(hWnd, hdc, 2);
        g.ReleaseHdc(hdc);
      }
      bmp.Save(path, ImageFormat.Png);
    }
  }
}
"@

function Get-AppWindow {
  $procs = Get-Process -Name 'patent-assistant' -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero }
  if (-not $procs) {
    $exe = Join-Path $env:LOCALAPPDATA 'Programs\patent-assistant\patent-assistant.exe'
    if (-not (Test-Path $exe)) {
      $exe = Join-Path $PSScriptRoot '..\dist\win-unpacked\patent-assistant.exe'
    }
    if (-not (Test-Path $exe)) { throw 'patent-assistant.exe not found' }
    Start-Process -FilePath $exe | Out-Null
    $deadline = (Get-Date).AddSeconds(25)
    do {
      Start-Sleep -Milliseconds 500
      $procs = Get-Process -Name 'patent-assistant' -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero }
    } while (-not $procs -and (Get-Date) -lt $deadline)
  }
  if (-not $procs) { throw 'Main window not found' }
  return ($procs | Select-Object -First 1)
}

$p = Get-AppWindow
Start-Sleep -Seconds 3
$out = Join-Path $OutDir '01-main-chat.png'
[WinCap]::Save($p.MainWindowHandle, $out)
Write-Output "Saved: $out"
