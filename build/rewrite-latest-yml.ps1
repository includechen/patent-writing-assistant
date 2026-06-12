param(
  [Parameter(Mandatory = $true)][string]$LatestYmlPath,
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$GiteeOwner = 'quanzhouuniversity',
  [string]$GiteeRepo = 'patent-writing-assistant'
)

$exeName = "PatentAssistant-Setup-$Version.exe"
$tag = "v$Version"
$exeUrl = "https://gitee.com/$GiteeOwner/$GiteeRepo/releases/download/$tag/$exeName"

if (-not (Test-Path -LiteralPath $LatestYmlPath)) {
  Write-Error "Missing $LatestYmlPath"
}

$lines = Get-Content -LiteralPath $LatestYmlPath -Encoding UTF8
$out = New-Object System.Collections.Generic.List[string]
$inFiles = $false
$urlReplaced = $false

foreach ($line in $lines) {
  if ($line -match '^files:\s*$') {
    $inFiles = $true
    $out.Add($line)
    continue
  }
  if ($inFiles -and $line -match '^\s+- url:\s*') {
    $out.Add("  - url: $exeUrl")
    $urlReplaced = $true
    continue
  }
  if ($line -match '^path:\s*') {
    $out.Add("path: $exeUrl")
    continue
  }
  $out.Add($line)
}

if (-not $urlReplaced) {
  Write-Warning "Could not find files[].url in $LatestYmlPath"
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($LatestYmlPath, $out.ToArray(), $utf8NoBom)
Write-Host "latest.yml -> release download URL: $exeUrl"
