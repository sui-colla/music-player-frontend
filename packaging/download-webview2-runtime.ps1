$ErrorActionPreference = "Stop"

$outputDirectory = Join-Path $PSScriptRoot "dependencies"
$outputFile = Join-Path $outputDirectory "MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
$downloadUrl = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"

New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
Invoke-WebRequest -Uri $downloadUrl -OutFile $outputFile

if (-not (Test-Path $outputFile) -or (Get-Item $outputFile).Length -lt 1MB) {
  throw "The WebView2 Runtime download did not produce a valid installer."
}

Write-Host "Downloaded $outputFile"
