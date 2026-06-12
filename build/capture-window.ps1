param(
  [string]$OutDir = (Join-Path $PSScriptRoot '..\docs\images'),
  [string]$FileName = '01-main-chat.png'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$OutDir = [System.IO.Path]::GetFullPath($OutDir)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$cs = @'
using System;
using System.Runtime.InteropServices;
using System.Drawing;
using System.Drawing.Imaging;
public static class PatentWinCap {
  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")]
  public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, int nFlags);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public static void Capture(IntPtr hWnd, string path) {
    RECT r;
    GetWindowRect(hWnd, out r);
    int w = r.Right - r.Left;
    int h = r.Bottom - r.Top;
    using (Bitmap bmp = new Bitmap(w, h)) {
      using (Graphics g = Graphics.FromImage(bmp)) {
        IntPtr hdc = g.GetHdc();
        PrintWindow(hWnd, hdc, 2);
        g.ReleaseHdc(hdc);
      }
      bmp.Save(path, ImageFormat.Png);
    }
  }
}
'@

if (-not ('PatentWinCap' -as [type])) {
  Add-Type -TypeDefinition $cs -ReferencedAssemblies @('System.Drawing.dll')
}

$exe = Join-Path $env:LOCALAPPDATA 'Programs\patent-assistant\patent-assistant.exe'
if (-not (Test-Path $exe)) {
  $exe = Join-Path $PSScriptRoot '..\dist\win-unpacked\patent-assistant.exe'
}
if (-not (Test-Path $exe)) {
  throw 'patent-assistant.exe not found'
}

$proc = Get-Process -Name 'patent-assistant' -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
  Select-Object -First 1

if (-not $proc) {
  Start-Process -FilePath $exe | Out-Null
  $deadline = (Get-Date).AddSeconds(25)
  do {
    Start-Sleep -Milliseconds 500
    $proc = Get-Process -Name 'patent-assistant' -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
      Select-Object -First 1
  } while (-not $proc -and (Get-Date) -lt $deadline)
}

if (-not $proc) {
  throw 'Main window not found'
}

Start-Sleep -Seconds 2
$out = Join-Path $OutDir $FileName
[PatentWinCap]::Capture($proc.MainWindowHandle, $out)
Write-Output $out
