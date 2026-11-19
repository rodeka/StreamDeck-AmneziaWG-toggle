param(
    [Parameter(Mandatory=$true)][string]$ConfigPath,
    [string]$UserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
)

$ErrorActionPreference = 'Stop'
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script once in PowerShell as Administrator.'
}
$sid = [Security.Principal.SecurityIdentifier]::new($UserSid)
$exe = Join-Path $env:ProgramFiles 'AmneziaWG\amneziawg.exe'
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw 'AmneziaWG is missing from Program Files.' }
$source = Get-Item -LiteralPath $ConfigPath
if ($source.PSIsContainer -or $source.Extension -ine '.conf') { throw 'Select an AmneziaWG .conf file.' }

$sha = [Security.Cryptography.SHA256]::Create()
try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($source.FullName.ToLowerInvariant())
    $hash = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant()
} finally { $sha.Dispose() }
$tunnel = 'sd-' + $hash.Substring(0, 16)
$service = 'AmneziaWGTunnel$' + $tunnel
$folder = Join-Path $env:ProgramFiles ('StreamDeck-AmneziaWG-' + $tunnel)
$destination = Join-Path $folder ($tunnel + '.conf')
$sc = Join-Path $env:SystemRoot 'System32\sc.exe'
$command = '"{0}" /tunnelservice "{1}"' -f $exe, $destination

function Set-TunnelServiceSid {
    # The tunnel uses its service SID when installing Windows firewall rules.
    & $sc sidtype $service unrestricted | Out-Null
    if ($LASTEXITCODE) { throw 'Cannot configure the tunnel service SID.' }
}

$existingService = Get-Service -Name $service -ErrorAction SilentlyContinue
if ($existingService) {
    $key = 'HKLM:\SYSTEM\CurrentControlSet\Services\' + $service
    $imagePath = Get-ItemPropertyValue -LiteralPath $key -Name ImagePath
    if ($imagePath -ine $command -or -not (Test-Path -LiteralPath $destination -PathType Leaf)) {
        throw 'The existing service does not match the expected tunnel setup.'
    }
    Set-TunnelServiceSid
    Write-Output 'Tunnel service SID configured. The change applies on the next tunnel start.'
    return
}
if (Test-Path -LiteralPath $folder) {
    throw 'A prepared configuration already exists without its service.'
}

# Snapshot the selected config once. Reject tunnel hooks before giving the service a copy.
$content = [IO.File]::ReadAllBytes($source.FullName)
$parsed = [Text.Encoding]::UTF8.GetString($content).TrimStart([char]0xFEFF)
if ($parsed.Contains([char]0) -or $parsed -notmatch '(?im)^\s*\[Interface\]\s*$' -or
    $parsed -notmatch '(?im)^\s*\[Peer\]\s*$' -or $parsed -match '(?im)^\s*(PreUp|PostUp|PreDown|PostDown)\s*=') {
    throw 'The file must be a UTF-8 tunnel configuration without command hooks.'
}

$created = $false
New-Item -Path $folder -ItemType Directory | Out-Null
try {
    $acl = Get-Acl -LiteralPath $folder
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) }
    foreach ($id in 'S-1-5-18', 'S-1-5-32-544') {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            [Security.Principal.SecurityIdentifier]::new($id), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $folder -AclObject $acl
    [IO.File]::WriteAllBytes($destination, $content)

    New-Service -Name $service -BinaryPathName $command -DisplayName ('Stream Deck AmneziaWG - ' + $source.BaseName) -StartupType Manual -DependsOn 'Nsi','TcpIp' | Out-Null
    $created = $true
    Set-TunnelServiceSid
    $output = & $sc sdshow $service
    if ($LASTEXITCODE) { throw 'Cannot read service permissions.' }
    $sddl = $output | Where-Object { $_ -match '^\s*(O:|G:|D:|S:)' } | Select-Object -First 1
    $descriptor = [Security.AccessControl.RawSecurityDescriptor]::new($sddl.Trim())
    # SERVICE_QUERY_STATUS | SERVICE_START | SERVICE_STOP.
    $ace = [Security.AccessControl.CommonAce]::new('None', 'AccessAllowed', 0x34, $sid, $false, $null)
    $descriptor.DiscretionaryAcl.InsertAce($descriptor.DiscretionaryAcl.Count, $ace)
    $newSddl = $descriptor.GetSddlForm([Security.AccessControl.AccessControlSections]::Access)
    & $sc sdset $service $newSddl | Out-Null
    if ($LASTEXITCODE) { throw 'Cannot grant the selected account access to the tunnel service.' }
} catch {
    if ($created) {
        & $sc delete $service | Out-Null
        if ($LASTEXITCODE) { throw 'Setup failed and the service could not be removed. It remains stopped.' }
    }
    if (Test-Path -LiteralPath $destination) { Remove-Item -LiteralPath $destination -Force }
    Remove-Item -LiteralPath $folder
    throw
}
Write-Output 'Tunnel prepared and stopped. Use the original .conf path in Stream Deck.'

