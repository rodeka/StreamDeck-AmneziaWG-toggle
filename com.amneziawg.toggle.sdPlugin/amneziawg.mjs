import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const execFile = promisify(execFileCallback);
export const validName = name => typeof name === 'string' && /^[a-zA-Z0-9_=+.-]{1,32}$/.test(name) && name !== '.' && name !== '..';
const managedName = filename => 'sd-' + createHash('sha256')
  .update(path.win32.resolve(filename).toLowerCase()).digest('hex').slice(0, 16);

// AmneziaWG Windows tunnel service. A .conf remains in the chosen directory;
// it contains secrets and must not be placed inside the Stream Deck plugin.
export class AmneziaWgAdapter {
  constructor({ executable, directory, run = execFile, list = readdir }) {
    if (!path.win32.isAbsolute(executable) || !path.win32.isAbsolute(directory)) throw new Error('Expected absolute Windows paths');
    this.executable = executable;
    this.directory = directory;
    this.run = run;
    this.list = list;
  }
  async servers() {
    const files = await this.list(this.directory, { withFileTypes: true });
    return files.filter(f => f.isFile() && f.name.endsWith('.conf'))
      .map(f => f.name.slice(0, -5)).filter(validName).sort();
  }
  async status(name) {
    return (await this.query(name)) ?? 'disconnected';
  }
  async query(name, checkingStartup = false) {
    if (!validName(name)) throw new Error('Invalid tunnel name');
    let stdout;
    try {
      ({ stdout } = await this.run('sc.exe', ['query', `AmneziaWGTunnel$${name}`], { windowsHide: true }));
    } catch (error) {
      // 1060 is ERROR_SERVICE_DOES_NOT_EXIST. Other errors are not proof of disconnection.
      if (error.code === 1060 || /\b1060\b/.test(`${error.stdout || ''}\n${error.stderr || ''}`)) return null;
      throw new Error('Cannot query tunnel service', { cause: error });
    }
    const state = stdout.match(/STATE\s*:\s*(\d+)/i)?.[1];
    if (checkingStartup && state === '1') {
      const codes = [...stdout.matchAll(/(?:WIN32|SERVICE)_EXIT_CODE\s*:\s*(\d+)/gi)]
        .map(match => Number(match[1])).filter(Boolean);
      if (codes.length) throw Object.assign(new Error('service-exited'), { serviceCodes: codes });
    }
    return ({ '1': 'disconnected', '2': 'connecting', '3': 'disconnecting', '4': 'connected' })[state] ?? 'unknown';
  }
  async managedStatus(filename) {
    return this.query(managedName(filename));
  }
  async prepare(filename) {
    const configPath = Buffer.from(filename, 'utf16le').toString('base64');
    const script = await readFile(new URL('./prepare-tunnel.ps1', import.meta.url));
    const setup = gzipSync(script).toString('base64');
    const command = `
      $ErrorActionPreference = 'Stop'
      $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
      $config = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${configPath}'))
      $config64 = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($config))
      $inner = '$ErrorActionPreference = ''Stop''; $bytes = [Convert]::FromBase64String(''{0}''); $stream = [IO.Compression.GZipStream]::new([IO.MemoryStream]::new($bytes), [IO.Compression.CompressionMode]::Decompress); $reader = [IO.StreamReader]::new($stream); $script = $reader.ReadToEnd(); $reader.Dispose(); & ([scriptblock]::Create($script)) -ConfigPath ([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String(''{1}''))) -UserSid ''{2}''' -f '${setup}', $config64, $sid
      $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))
      $process = Start-Process -FilePath "$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', $encoded) -PassThru -Wait
      if ($process.ExitCode -ne 0) { exit $process.ExitCode }
    `;
    await this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true });
  }
  async toggleManaged(filename, status) {
    if (status !== 'connected' && status !== 'disconnected') throw new Error('transition');
    const command = status === 'connected' ? 'stop' : 'start';
    await this.run('sc.exe', [command, `AmneziaWGTunnel$${managedName(filename)}`], { windowsHide: true });
  }
  async waitForManagedState(filename, expected, { pause = delay, attempts = 20 } = {}) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      await pause(500);
      const status = await this.query(managedName(filename), expected === 'connected');
      if (status === expected) return;
      if (status === null || status === 'unknown') break;
    }
    throw new Error(expected === 'connected' ? 'service-not-started' : 'service-not-stopped');
  }
  async connect(name) {
    if (!validName(name) || !(await this.servers()).includes(name)) throw new Error('Configuration not found');
    await this.run(this.executable, ['/installtunnelservice', path.win32.join(this.directory, `${name}.conf`)], { windowsHide: true });
  }
  async connectFile(filename) {
    if (!path.win32.isAbsolute(filename) || !/\.conf$/i.test(filename)) throw new Error('Invalid configuration path');
    const name = path.win32.basename(filename).slice(0, -5);
    if (!validName(name)) throw new Error('Invalid tunnel name');
    const files = await this.list(path.win32.dirname(filename), { withFileTypes: true });
    if (!files.some(f => f.isFile() && f.name.toLowerCase() === path.win32.basename(filename).toLowerCase())) throw new Error('Configuration not found');
    await this.run(this.executable, ['/installtunnelservice', filename], { windowsHide: true });
  }
  async disconnect(name) {
    if (!validName(name)) throw new Error('Invalid tunnel name');
    await this.run(this.executable, ['/uninstalltunnelservice', name], { windowsHide: true });
  }
}

