param(
  [string]$RepoUrl = 'https://gitee.com/quanzhouuniversity/patent-writing-assistant.git',
  [string]$GiteeOwner = 'quanzhouuniversity',
  [string]$GiteeRepo = 'patent-writing-assistant',
  [string]$Branch = 'master',
  [string]$ReleaseDir = '',
  [string]$ReleasesSource = (Join-Path $PSScriptRoot '..\dist\releases'),
  [string]$WorkDir = (Join-Path $env:TEMP 'patent-gitee-publish'),
  [switch]$SkipPush,
  [switch]$SkipGiteeRelease
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $ReleasesSource)) {
  Write-Error "Missing $ReleasesSource. Run: npm run build:release"
}

$latest = Join-Path $ReleasesSource 'latest.yml'
if (-not (Test-Path -LiteralPath $latest)) {
  Write-Error "Missing latest.yml in $ReleasesSource"
}

$versionLine = (Get-Content -LiteralPath $latest | Where-Object { $_ -match '^version:' } | Select-Object -First 1)
$version = ($versionLine -replace '^version:\s*', '').Trim()
$exeName = "PatentAssistant-Setup-$version.exe"
$exePath = Join-Path $ReleasesSource $exeName
$tag = "v$version"

function Write-ReleasesReadme {
  param([string]$DestPath, [string]$Ver)
  $template = Join-Path $PSScriptRoot 'releases-README.md'
  $content = (Get-Content -LiteralPath $template -Raw -Encoding UTF8).Replace('{{VERSION}}', $Ver)
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($DestPath, $content, $utf8NoBom)
}

if (-not (Test-Path -LiteralPath $exePath)) {
  Write-Error "Missing installer $exePath"
}

$mb = [math]::Round((Get-Item -LiteralPath $exePath).Length / 1MB, 2)
Write-Host "Installer size: ${mb} MB"
if ($mb -gt 95) {
  Write-Warning "Installer exceeds 95 MB — Gitee single-file limit is 100 MB."
}

function Publish-GiteeReleaseAsset {
  param([string]$Token, [string]$FilePath, [string]$TagName, [string]$ReleaseTitle)

  $apiBase = "https://gitee.com/api/v5/repos/$GiteeOwner/$GiteeRepo"
  $headers = @{ 'User-Agent' = 'patent-desktop-publish' }

  $existing = Invoke-RestMethod -Uri "$apiBase/releases/tags/$TagName?access_token=$Token" -Headers $headers -ErrorAction SilentlyContinue
  $releaseId = $null
  if ($existing -and $existing.id) {
    $releaseId = $existing.id
    Write-Host "Reusing Gitee Release tag $TagName (id=$releaseId)"
  } else {
    $body = @{
      tag_name = $TagName
      name = $ReleaseTitle
      body = "Patent Assistant desktop installer $version"
      target_commitish = $Branch
    } | ConvertTo-Json
    $created = Invoke-RestMethod -Method Post -Uri "$apiBase/releases?access_token=$Token" -Headers $headers -Body $body -ContentType 'application/json; charset=utf-8'
    $releaseId = $created.id
    Write-Host "Created Gitee Release tag $TagName (id=$releaseId)"
  }

  $boundary = [System.Guid]::NewGuid().ToString()
  $fileBytes = [System.IO.File]::ReadAllBytes($FilePath)
  $fileName = [System.IO.Path]::GetFileName($FilePath)
  $enc = [System.Text.Encoding]::UTF8
  $crlf = "`r`n"
  $bodyLines = @(
    "--$boundary",
    'Content-Disposition: form-data; name="file"; filename="' + $fileName + '"',
    'Content-Type: application/octet-stream',
    '',
    ''
  )
  $headerBytes = $enc.GetBytes(($bodyLines -join $crlf))
  $footerBytes = $enc.GetBytes("$crlf--$boundary--$crlf")
  $bodyStream = New-Object System.IO.MemoryStream
  $bodyStream.Write($headerBytes, 0, $headerBytes.Length)
  $bodyStream.Write($fileBytes, 0, $fileBytes.Length)
  $bodyStream.Write($footerBytes, 0, $footerBytes.Length)

  $uploadUri = "$apiBase/releases/$releaseId/attach_files?access_token=$Token"
  $response = Invoke-RestMethod -Method Post -Uri $uploadUri -Headers @{
    'User-Agent' = 'patent-desktop-publish'
    'Content-Type' = "multipart/form-data; boundary=$boundary"
  } -Body $bodyStream.ToArray()

  $downloadUrl = "https://gitee.com/$GiteeOwner/$GiteeRepo/releases/download/$TagName/$fileName"
  Write-Host "Uploaded $fileName to Gitee Release -> $downloadUrl"
  return $downloadUrl
}

function Test-ReleaseDownloadUrl {
  param([string]$Url)
  try {
    $resp = Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -TimeoutSec 30
    return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
  } catch {
    return $false
  }
}

$releaseDownloadUrl = "https://gitee.com/$GiteeOwner/$GiteeRepo/releases/download/$tag/$exeName"
$releaseReady = $false

$token = $env:GITEE_TOKEN
if ($SkipGiteeRelease) {
  Write-Host "SkipGiteeRelease: checking whether Release already exists..."
  $releaseReady = Test-ReleaseDownloadUrl -Url $releaseDownloadUrl
  if (-not $releaseReady) {
    Write-Error @"
Gitee Release $tag is missing ($releaseDownloadUrl returns 404).
Create the Release manually and attach $exeName, or run without -SkipGiteeRelease and set GITEE_TOKEN.
"@
  }
} else {
  if (-not $token) {
    Write-Error @"
GITEE_TOKEN is not set. Installers must be uploaded to Gitee Release before pushing latest.yml.
  `$env:GITEE_TOKEN = 'your-token'
  npm run publish:gitee
Or create Release tag $tag manually, then: npm run publish:gitee -SkipGiteeRelease
"@
  }
  Publish-GiteeReleaseAsset -Token $token -FilePath $exePath -TagName $tag -ReleaseTitle "Patent Assistant $version" | Out-Null
  Start-Sleep -Seconds 2
  $releaseReady = Test-ReleaseDownloadUrl -Url $releaseDownloadUrl
  if (-not $releaseReady) {
    Write-Error "Release upload finished but download URL still unavailable: $releaseDownloadUrl"
  }
}

if (-not $releaseReady) {
  Write-Error "Release installer is not reachable — aborting before rewriting latest.yml"
}

& (Join-Path $PSScriptRoot 'rewrite-latest-yml.ps1') -LatestYmlPath $latest -Version $version -GiteeOwner $GiteeOwner -GiteeRepo $GiteeRepo
Write-Host "Verified Release URL: $releaseDownloadUrl"

$localRepo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\patent-writing-assistant') -ErrorAction SilentlyContinue)?.Path

if (-not (Test-Path -LiteralPath (Join-Path $WorkDir '.git'))) {
  if (Test-Path -LiteralPath $WorkDir) {
    Remove-Item -LiteralPath $WorkDir -Recurse -Force
  }
  Write-Host "Cloning $RepoUrl ..."
  git clone -b $Branch --depth 1 $RepoUrl $WorkDir 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Git clone failed (exit $LASTEXITCODE). Will try local repo or manual-copy fallback."
    if ($localRepo -and (Test-Path -LiteralPath (Join-Path $localRepo '.git'))) {
      $WorkDir = $localRepo
      Write-Host "Using local repo: $WorkDir"
    } else {
      $fallback = if ($localRepo) { $localRepo } else { Join-Path $PSScriptRoot '..\gitee-patent-writing-assistant' }
      $destFallback = if ($ReleaseDir) { Join-Path $fallback $ReleaseDir } else { $fallback }
      New-Item -ItemType Directory -Force -Path $destFallback | Out-Null
      Copy-Item -LiteralPath $latest -Destination (Join-Path $destFallback 'latest.yml') -Force
      Write-ReleasesReadme -DestPath (Join-Path $destFallback 'README.md') -Ver $version
      Write-Host "Copied latest.yml to: $destFallback"
      Write-Host "Create Gitee Release $tag with $exeName, then git push latest.yml manually."
      exit 2
    }
  }
}

$dest = if ($ReleaseDir) { Join-Path $WorkDir $ReleaseDir } else { $WorkDir }
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Copy-Item -LiteralPath $latest -Destination (Join-Path $dest 'latest.yml') -Force
Write-ReleasesReadme -DestPath (Join-Path $dest 'README.md') -Ver $version

Get-ChildItem -LiteralPath $dest -File -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.Name -match 'PatentAssistant-Setup-.*\.(exe|blockmap)$') {
    Remove-Item -LiteralPath $_.FullName -Force
    Write-Host "Removed git-tracked installer (use Gitee Release): $($_.Name)"
  }
}

Set-Location -LiteralPath $WorkDir
$gitPath = if ($ReleaseDir) { $ReleaseDir } else { 'latest.yml README.md' }
git add $gitPath
$status = git status --porcelain -- $(if ($ReleaseDir) { $ReleaseDir } else { 'latest.yml'; 'README.md' })
if (-not $status) {
  $label = if ($ReleaseDir) { $ReleaseDir } else { 'repo root (latest.yml)' }
  Write-Host "No changes in $label — nothing to publish."
  exit 0
}

git commit -m "chore(desktop): release PatentAssistant $version (latest.yml only)"
if ($SkipPush) {
  Write-Host "Committed locally in $WorkDir (SkipPush)."
  exit 0
}

Write-Host 'Pushing latest.yml to Gitee...'
git push origin $Branch
$metaPath = if ($ReleaseDir) { "$ReleaseDir/latest.yml" } else { 'latest.yml' }
Write-Host "Published $version — installer via Gitee Release tag $tag, metadata at $metaPath"
