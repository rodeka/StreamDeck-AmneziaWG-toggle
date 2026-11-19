import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const execFile = promisify(execFileCallback);
const validName = name => typeof name === 'string' && /^[a-zA-Z0-9_=+.-]{1,32}$/.test(name) && name !== '.' && name !== '..';

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
    if (!validName(name)) throw new Error('Invalid tunnel name');
    try {
      const { stdout } = await this.run('sc.exe', ['query', `AmneziaWGTunnel$${name}`], { windowsHide: true });
      const state = stdout.match(/STATE\s*:\s*(\d+)/i)?.[1];
      return ({ '1': 'disconnected', '2': 'connecting', '3': 'disconnecting', '4': 'connected' })[state] ?? 'unknown';
    } catch (error) {
      // 1060 is ERROR_SERVICE_DOES_NOT_EXIST. Other errors are not proof of disconnection.
      if (error.code === 1060 || /\b1060\b/.test(error.stdout || '')) return 'disconnected';
      throw new Error('Cannot query tunnel service', { cause: error });
    }
  }
  async connect(name) {
    if (!validName(name) || !(await this.servers()).includes(name)) throw new Error('Configuration not found');
    await this.run(this.executable, ['/installtunnelservice', path.win32.join(this.directory, `${name}.conf`)], { windowsHide: true });
  }
  async disconnect(name) {
    if (!validName(name)) throw new Error('Invalid tunnel name');
    await this.run(this.executable, ['/uninstalltunnelservice', name], { windowsHide: true });
  }
}

