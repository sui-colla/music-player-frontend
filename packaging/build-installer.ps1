$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $root "dist"
$exePath = Join-Path $distDir "MusicPlayer.exe"
$installerScript = Join-Path $PSScriptRoot "installer.iss"
$installerPath = Join-Path $distDir "StarFiLeSetup.exe"
$buildExeScript = Join-Path $PSScriptRoot "build-exe.ps1"
$appDisplayName = "StarFiLe " + [string]([char]0x97F3) + [string]([char]0x4E50) + [string]([char]0x64AD) + [string]([char]0x653E) + [string]([char]0x5668)
$appDisplayNameDefine = "/DAppDisplayName=`"$appDisplayName`""

function Find-InnoCompiler {
  $command = Get-Command ISCC -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 5\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 5\ISCC.exe")
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  return $null
}

if (-not (Test-Path $buildExeScript)) {
  throw "Missing build script: $buildExeScript"
}

if (-not (Test-Path $installerScript)) {
  throw "Missing installer script: $installerScript"
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $buildExeScript
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not (Test-Path $exePath)) {
  throw "Expected application executable was not created: $exePath"
}

$iscc = Find-InnoCompiler
if (-not $iscc) {
  throw "Inno Setup compiler was not found. Install Inno Setup 6, then run this script again: https://jrsoftware.org/isinfo.php"
}

& $iscc $appDisplayNameDefine $installerScript
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not (Test-Path $installerPath)) {
  throw "Installer build completed but output was not found: $installerPath"
}

Write-Host "Built $installerPath"
