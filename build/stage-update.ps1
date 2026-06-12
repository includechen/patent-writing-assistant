param(

  [string]$DistDir = (Join-Path $PSScriptRoot '..\dist'),

  [string]$OutDir = (Join-Path $PSScriptRoot '..\dist\releases')

)



$ErrorActionPreference = 'Stop'

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null



$pkg = Get-Content (Join-Path $PSScriptRoot '..\package.json') -Raw | ConvertFrom-Json

$version = $pkg.version

$names = @(

  'latest.yml',

  "PatentAssistant-Setup-$version.exe",

  "PatentAssistant-Setup-$version.exe.blockmap"

)

$copied = 0

foreach ($name in $names) {

  $src = Join-Path $DistDir $name

  if (Test-Path -LiteralPath $src) {

    Copy-Item -LiteralPath $src -Destination (Join-Path $OutDir $name) -Force

    $copied++

  }

}



if ($copied -eq 0) {

  Write-Error "No update artifacts found in $DistDir. Run npm run build first."

}



# Remove stale installers from previous builds

Get-ChildItem -LiteralPath $OutDir -File -ErrorAction SilentlyContinue | ForEach-Object {

  if ($_.Name -match 'Setup-.*\.(exe|blockmap)$' -and $names -notcontains $_.Name) {

    Remove-Item -LiteralPath $_.FullName -Force

  }

}



$readmeTemplate = Join-Path $PSScriptRoot 'releases-README.md'
$readmeDest = Join-Path $OutDir 'README.md'
$readmeContent = Get-Content -LiteralPath $readmeTemplate -Raw -Encoding UTF8
$readmeContent = $readmeContent.Replace('{{VERSION}}', $version)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($readmeDest, $readmeContent, $utf8NoBom)



Write-Host "Staged $copied file(s) to $OutDir"

Write-Host "Next: npm run publish:gitee"


