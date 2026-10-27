param([switch]$Build)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot

$candidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'),
  (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin\docker.exe')
)
$docker = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $docker) { throw 'Docker Desktop is not installed.' }
$dockerInstall = Split-Path (Split-Path (Split-Path $docker -Parent) -Parent) -Parent
$env:PATH = (Split-Path $docker -Parent) + ';' + $env:PATH

function Test-DockerReady {
  try {
    & $docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  } catch { return $false }
}

if (-not (Test-DockerReady)) {
  $profileRoot = Join-Path $projectRoot '.local\docker-profile'
  $savedAppData = $env:APPDATA
  $savedLocalAppData = $env:LOCALAPPDATA
  try {
    # This machine needs a separate Docker profile due to atomic-write failures
    # in its original AppData directory. Never change global Windows variables.
    if (Test-Path -LiteralPath $profileRoot) {
      $env:APPDATA = Join-Path $profileRoot 'roaming'
      $env:LOCALAPPDATA = Join-Path $profileRoot 'local'
    }
    Start-Process -FilePath (Join-Path $dockerInstall 'Docker Desktop.exe') -ArgumentList '--background' -WindowStyle Hidden
  } finally {
    $env:APPDATA = $savedAppData
    $env:LOCALAPPDATA = $savedLocalAppData
  }
  $deadline = (Get-Date).AddSeconds(120)
  while (-not (Test-DockerReady)) {
    if ((Get-Date) -gt $deadline) { throw 'Docker engine did not become ready. Check Docker Desktop.' }
    Start-Sleep -Seconds 2
  }
}

# Docker build authentication uses the CLI process network configuration.
$proxy = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
if ($proxy.ProxyEnable -eq 1 -and $proxy.ProxyServer -match '^[^=;]+:\d+$') {
  if (-not $env:HTTPS_PROXY) { $env:HTTPS_PROXY = 'http://' + $proxy.ProxyServer }
  if (-not $env:HTTP_PROXY) { $env:HTTP_PROXY = 'http://' + $proxy.ProxyServer }
}
$env:NO_PROXY = 'localhost,127.0.0.1,::1'

if ($Build) { & $docker compose up -d --build } else { & $docker compose up -d }
if ($LASTEXITCODE -ne 0) { throw 'Project startup failed. See Docker output above.' }

$port = 80
foreach ($line in Get-Content -LiteralPath '.env') {
  if ($line -match '^WEB_PORT=(\d+)$') { $port = [int]$Matches[1] }
}
$url = 'http://127.0.0.1:' + $port
$deadline = (Get-Date).AddSeconds(90)
while ($true) {
  try {
    $health = Invoke-RestMethod -Uri ($url + '/api/health') -TimeoutSec 5
    if ($health.status -eq 'ok') { break }
  } catch { }
  if ((Get-Date) -gt $deadline) { throw 'Project started but dependencies are not healthy. Run docker compose logs.' }
  Start-Sleep -Seconds 2
}
Write-Host ('Project ready: ' + $url)
Start-Process $url
