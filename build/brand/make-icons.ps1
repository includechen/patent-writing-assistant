param(
  [string]$Source = "$PSScriptRoot\icon-source.png",
  [string]$OutDir = $PSScriptRoot
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
$side = [Math]::Min($src.Width, $src.Height)
$x = [int](($src.Width - $side) / 2)
$y = [int](($src.Height - $side) / 2)
$srcRect = New-Object System.Drawing.Rectangle $x, $y, $side, $side

function Save-Square([string]$path, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $destRect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
  $g.DrawImage($src, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

Save-Square (Join-Path $OutDir 'icon-1024.png') 1024
Save-Square (Join-Path $OutDir 'icon-512.png') 512
Save-Square (Join-Path $OutDir 'icon-256.png') 256
Save-Square (Join-Path $OutDir 'icon-128.png') 128
Save-Square (Join-Path $OutDir 'icon-64.png') 64
$src.Dispose()
Write-Host "Icons written to $OutDir"
