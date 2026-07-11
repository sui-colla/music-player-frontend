$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $PSScriptRoot "MusicPlayerHost\MusicPlayerHost.csproj"
$distDirectory = Join-Path $root "dist"
$publishDirectory = Join-Path $root "dist\MusicPlayer"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  throw ".NET 8 SDK is required to build the desktop player. Install it from https://dotnet.microsoft.com/download/dotnet/8.0"
}

if (-not (Test-Path $project)) {
  throw "Missing project file: $project"
}

if (Test-Path $publishDirectory) {
  Remove-Item -LiteralPath $publishDirectory -Recurse -Force
}

if (Test-Path $distDirectory) {
  Get-ChildItem -LiteralPath $distDirectory -File -Filter "*.exe" |
    Where-Object { $_.Name -notin @("StarFileSetup.exe", "StarFiLeSetup.exe") } |
    Remove-Item -Force
}

& dotnet publish $project --configuration Release --runtime win-x64 --self-contained true --output $publishDirectory `
  -p:PublishSingleFile=false `
  -p:PublishTrimmed=false `
  -p:DebugType=None `
  -p:DebugSymbols=false

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$exePath = Join-Path $publishDirectory "MusicPlayer.exe"
if (-not (Test-Path $exePath)) {
  throw "Publish completed but the player executable was not created: $exePath"
}

Write-Host "Built portable player directory: $publishDirectory"
