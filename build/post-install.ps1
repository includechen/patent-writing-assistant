param(
  [string]$UserData = "$env:APPDATA\patent-assistant",
  [string]$SeedDir = "",
  [string]$Version = "unknown"
)

$ErrorActionPreference = 'Stop'

function Ensure-Dir([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

try {
  Ensure-Dir $UserData
  Ensure-Dir (Join-Path $UserData 'data')
  Ensure-Dir (Join-Path $UserData 'data\outputs')
  Ensure-Dir (Join-Path $UserData 'data\feedback')
  Ensure-Dir (Join-Path $UserData 'skill')

  $envExample = Join-Path $SeedDir '.env.example'
  $envFile = Join-Path $UserData '.env'
  if (-not (Test-Path -LiteralPath $envFile) -and (Test-Path -LiteralPath $envExample)) {
    Copy-Item -LiteralPath $envExample -Destination $envFile -Force
  }

  $uiFile = Join-Path $UserData 'ui.json'
  if (-not (Test-Path -LiteralPath $uiFile)) {
    @{ locale = 'zh' } | ConvertTo-Json | Set-Content -LiteralPath $uiFile -Encoding UTF8
  }

  $manifest = Join-Path $UserData 'install.json'
  @{
    version = $Version
    installedAt = (Get-Date).ToUniversalTime().ToString('o')
    userData = $UserData
  } | ConvertTo-Json | Set-Content -LiteralPath $manifest -Encoding UTF8

  exit 0
} catch {
  $log = Join-Path $UserData 'install-error.log'
  Ensure-Dir $UserData
  "$(Get-Date -Format o)`n$($_.Exception.Message)`n$($_.ScriptStackTrace)" | Set-Content -LiteralPath $log -Encoding UTF8
  exit 1
}
