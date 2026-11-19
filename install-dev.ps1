$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot 'com.amneziawg.toggle.sdPlugin'
$parent = Join-Path $env:APPDATA 'Elgato\StreamDeck\Plugins'
$target = Join-Path $parent 'com.amneziawg.toggle.sdPlugin'
if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw 'Plugin source directory was not found.' }

$sessionId = (Get-Process -Id $PID).SessionId
$streamDeck = @(Get-Process -Name StreamDeck -ErrorAction SilentlyContinue |
    Where-Object { $_.SessionId -eq $sessionId })
$candidates = @($streamDeck | ForEach-Object { $_.Path })
foreach ($programFiles in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if ($programFiles) { $candidates += Join-Path $programFiles 'Elgato\StreamDeck\StreamDeck.exe' }
}
$executable = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $executable) { throw 'StreamDeck.exe was not found. Start Stream Deck once and rerun this script.' }

$updated = $false
try {
    foreach ($process in $streamDeck) {
        if ($process.HasExited) { continue }
        if ($process.CloseMainWindow() -and $process.WaitForExit(3000)) { continue }
        if (-not $process.HasExited) { Stop-Process -InputObject $process }
        if (-not $process.WaitForExit(5000)) { throw 'Stream Deck did not exit. Plugin update was cancelled.' }
    }

    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    if (Test-Path -LiteralPath $target -PathType Container) {
        Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force
    } else {
        Copy-Item -LiteralPath $source -Destination $target -Recurse
    }
    $updated = $true
} finally {
    $stillRunning = Get-Process -Name StreamDeck -ErrorAction SilentlyContinue |
        Where-Object { $_.SessionId -eq $sessionId } | Select-Object -First 1
    if (($updated -or $streamDeck.Count -gt 0) -and -not $stillRunning) {
        Start-Process -FilePath $executable
    }
}
Write-Output 'Development plugin installed or updated. Stream Deck is starting.'
Write-Output 'In the action settings, enter the full path to your .conf file.'
