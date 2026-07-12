$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $root "dist"
$publishDirectory = Join-Path $distDir "MusicPlayer"
$exePath = Join-Path $publishDirectory "MusicPlayer.exe"
$installerScript = Join-Path $PSScriptRoot "installer.iss"
$installerPath = Join-Path $distDir "StarFileSetup.exe"
$buildExeScript = Join-Path $PSScriptRoot "build-exe.ps1"
$projectFile = Join-Path $PSScriptRoot "MusicPlayerHost\MusicPlayerHost.csproj"
$runtimeInstaller = Join-Path $PSScriptRoot "dependencies\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
$downloadRuntimeScript = Join-Path $PSScriptRoot "download-webview2-runtime.ps1"

[xml]$projectXml = Get-Content -LiteralPath $projectFile
$versionNode = $projectXml.SelectSingleNode("/Project/PropertyGroup/Version")
$appVersion = if ($versionNode) { $versionNode.InnerText.Trim() } else { "" }
if (-not $appVersion -or $appVersion -notmatch '^\d+\.\d+\.\d+(?:\.\d+)?$') {
  throw "MusicPlayerHost.csproj does not contain a valid numeric Version."
}

function Find-InnoCompiler {
  $command = Get-Command ISCC -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 6\ISCC.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:ProgramFiles "Inno Setup 6\ISCC.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Inno Setup 5\ISCC.exe"),
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

& powershell -NoProfile -ExecutionPolicy Bypass -File $buildExeScript
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not (Test-Path $exePath)) {
  throw "Expected application executable was not created: $exePath"
}

if (-not (Test-Path $runtimeInstaller)) {
  if (-not (Test-Path $downloadRuntimeScript)) {
    throw "Missing WebView2 Runtime download script: $downloadRuntimeScript"
  }

  & powershell -NoProfile -ExecutionPolicy Bypass -File $downloadRuntimeScript
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

if (-not (Test-Path $runtimeInstaller)) {
  throw "Missing WebView2 Runtime installer: $runtimeInstaller"
}

$iscc = Find-InnoCompiler
if (-not $iscc) {
  throw "Inno Setup compiler was not found. Install Inno Setup 6, then run this script again: https://jrsoftware.org/isinfo.php"
}

& $iscc "/DAppVersion=$appVersion" $installerScript
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if (-not (Test-Path $installerPath)) {
  throw "Installer build completed but output was not found: $installerPath"
}

Write-Host "Built $installerPath"
