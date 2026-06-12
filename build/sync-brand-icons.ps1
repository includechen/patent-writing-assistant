param(
  [string]$BrandDir = '',
  [string]$OutBrandDir = (Join-Path $PSScriptRoot 'brand'),
  [string]$IcoOut = (Join-Path $PSScriptRoot 'icon.ico')
)

$ErrorActionPreference = 'Stop'

if (-not $BrandDir) {
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
  $searchRoots = @(
    $repoRoot,
    (Split-Path $repoRoot -Parent)
  ) | Select-Object -Unique

  foreach ($root in $searchRoots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $candidate = Get-ChildItem -LiteralPath $root -Directory |
      Where-Object { $_.Name -like '*-*' -and (Test-Path (Join-Path $_.FullName 'icon-source.png')) } |
      Select-Object -First 1
    if ($candidate) {
      $BrandDir = $candidate.FullName
      break
    }
  }
}

if (-not $BrandDir -or -not (Test-Path -LiteralPath $BrandDir)) {
  Write-Warning "Brand source not found under repo root"
  exit 0
}

New-Item -ItemType Directory -Force -Path $OutBrandDir | Out-Null

$copyNames = @(
  'icon.svg',
  'icon-source.png',
  'icon-1024.png',
  'icon-512.png',
  'icon-256.png',
  'icon-128.png',
  'icon-64.png',
  'icon-48.png',
  'icon-32.png',
  'icon-16.png',
  'make-icons.ps1',
  'README.md'
)

foreach ($name in $copyNames) {
  $src = Join-Path $BrandDir $name
  if (Test-Path -LiteralPath $src) {
    Copy-Item -LiteralPath $src -Destination (Join-Path $OutBrandDir $name) -Force
  }
}

$brandIco = Join-Path $BrandDir 'icon.ico'
if (Test-Path -LiteralPath $brandIco) {
  Copy-Item -LiteralPath $brandIco -Destination $IcoOut -Force
  Copy-Item -LiteralPath $brandIco -Destination (Join-Path $PSScriptRoot '..\electron\icon.ico') -Force
}

$brand256 = Join-Path $OutBrandDir 'icon-256.png'
if (Test-Path -LiteralPath $brand256) {
  Copy-Item -LiteralPath $brand256 -Destination (Join-Path $PSScriptRoot '..\electron\icon.png') -Force
}

$clientPublic = Join-Path $PSScriptRoot '..\client\public'
if (Test-Path -LiteralPath $clientPublic) {
  $logo64 = Join-Path $OutBrandDir 'icon-64.png'
  if (Test-Path -LiteralPath $logo64) {
    Copy-Item -LiteralPath $logo64 -Destination (Join-Path $clientPublic 'logo.png') -Force
    Copy-Item -LiteralPath $logo64 -Destination (Join-Path $clientPublic 'favicon.png') -Force
  }
}

Write-Host "Synced brand icons from $BrandDir"
