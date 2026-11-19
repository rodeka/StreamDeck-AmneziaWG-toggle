$ErrorActionPreference = 'Stop'
$pluginPath = Join-Path $PSScriptRoot 'com.amneziawg.toggle.sdPlugin'
$outputPath = Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

$cli = Get-Command streamdeck -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cli) {
    & $cli.Source pack $pluginPath --output $outputPath --force --no-update-check
} else {
    $npx = Get-Command npx.cmd -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $npx) {
        throw 'Install Node.js 24 or later and npm, or install the Elgato Stream Deck CLI.'
    }
    & $npx.Source --yes @elgato/cli pack $pluginPath --output $outputPath --force --no-update-check
}
if ($LASTEXITCODE -ne 0) { throw 'Stream Deck plugin packaging failed.' }
