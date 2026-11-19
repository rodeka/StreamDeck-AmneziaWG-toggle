$pipe = [System.IO.Pipes.NamedPipeClientStream]::new('.', 'local:AmneziaVpnIpcInterface', [System.IO.Pipes.PipeDirection]::InOut)
try {
    $pipe.Connect(1500)
    Write-Output 'IPC: available; no commands sent'
} catch {
    Write-Output ('IPC: unavailable: ' + $_.Exception.Message)
} finally {
    $pipe.Dispose()
}
