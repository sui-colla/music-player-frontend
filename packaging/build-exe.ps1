$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $root "dist"
$localizedExeName = [string]([char]0x97F3) + [string]([char]0x4E50) + [string]([char]0x64AD) + [string]([char]0x653E) + [string]([char]0x5668) + ".exe"
$outputExe = Join-Path $outputDir $localizedExeName
$asciiOutputExeName = "MusicPlayer.exe"
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("music-player-exe-build-" + $PID)
$stagingSrc = Join-Path $stagingRoot "src"
$stagingProgram = Join-Path $stagingRoot "Program.cs"
$stagingExe = Join-Path $stagingRoot $asciiOutputExeName
$compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"

if (-not (Test-Path $compiler)) {
  $compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework\v4.0.30319\csc.exe"
}

if (-not (Test-Path $compiler)) {
  throw "Cannot find the .NET Framework C# compiler."
}

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
New-Item -ItemType Directory -Force -Path $stagingSrc | Out-Null

Copy-Item -LiteralPath (Join-Path $PSScriptRoot "MusicPlayerHost\Program.cs") -Destination $stagingProgram -Force
Copy-Item -LiteralPath (Join-Path $root "index.html") -Destination (Join-Path $stagingRoot "index.html") -Force
Copy-Item -LiteralPath (Join-Path $root "sisi.jpg") -Destination (Join-Path $stagingRoot "sisi.jpg") -Force
Copy-Item -Path (Join-Path $root "src\*") -Destination $stagingSrc -Recurse -Force

$resources = New-Object System.Collections.ArrayList
[void]$resources.Add(@{ Path = Join-Path $stagingRoot "index.html"; Name = "index.html" })
[void]$resources.Add(@{ Path = Join-Path $stagingRoot "sisi.jpg"; Name = "sisi.jpg" })

foreach ($file in Get-ChildItem -Path $stagingSrc -Recurse -File) {
  $relative = $file.FullName.Substring($stagingRoot.Length + 1).Replace("\", "/")
  [void]$resources.Add(@{ Path = $file.FullName; Name = $relative })
}

$args = @(
  "/nologo",
  "/target:winexe",
  "/optimize+",
  "/out:$stagingExe",
  "/reference:System.Windows.Forms.dll",
  "/reference:System.Drawing.dll",
  $stagingProgram
)

foreach ($resource in $resources) {
  if (Test-Path $resource.Path) {
    $args += "/resource:$($resource.Path),$($resource.Name)"
  }
}

& $compiler @args
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Copy-Item -LiteralPath $stagingExe -Destination (Join-Path $outputDir $asciiOutputExeName) -Force

try {
  Copy-Item -LiteralPath $stagingExe -Destination $outputExe -Force
} catch {
  Write-Warning "Could not update $outputExe. Close the running player and rebuild if you need this localized copy. $($_.Exception.Message)"
}

Write-Host "Built $(Join-Path $outputDir $asciiOutputExeName)"
