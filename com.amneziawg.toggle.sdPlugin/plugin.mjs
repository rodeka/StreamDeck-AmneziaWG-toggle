import path from 'node:path';
import { stat } from 'node:fs/promises';
import { AmneziaWgAdapter, validName } from './amneziawg.mjs';
import { createKeyDisplay } from './key-display.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((out, value, i, all) => { if (value.startsWith('-') && all[i+1]) out.push([value, all[i+1]]); return out; }, []));
if (!args['-port'] || !args['-pluginUUID'] || !args['-registerEvent']) throw new Error('Stream Deck launch arguments missing');
const ws = new WebSocket(`ws://127.0.0.1:${args['-port']}`), actions = new Map();
let busy = false;
let pressId = 0;
const pressErrors = new Map();
const statusErrors = new Map();
const send = data => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
const display = createKeyDisplay(send);
const defaultExecutable = 'C:\\Program Files\\AmneziaWG\\amneziawg.exe';
const notify = (context, message) => send({ event: 'sendToPropertyInspector', context, payload: { type: 'diagnostic', message } });

function selected(settings) {
  if (!settings?.configPath || !path.win32.isAbsolute(settings.configPath) || !/\.conf$/i.test(settings.configPath)) throw new Error('config-path');
  const name = path.win32.basename(settings.configPath).slice(0, -5);
  if (!validName(name)) throw new Error('config-name');
  const executable = settings.executable || defaultExecutable;
  if (!path.win32.isAbsolute(executable) || !/\.exe$/i.test(executable)) throw new Error('exe-path');
  return { name, executable, adapter: new AmneziaWgAdapter({ directory:path.win32.dirname(settings.configPath), executable }) };
}

async function checkFile(filename, errorId) {
  const info = await stat(filename).catch(() => null);
  if (!info?.isFile()) throw new Error(errorId);
}

function explain(error, fallback) {
  const messages = {
    'config-path': 'Enter the full path to the .conf file.',
    'config-name': 'The file name can contain up to 32 letters, digits, and the characters _ = + . -.',
    'exe-path': 'Enter the full path to amneziawg.exe.',
    'config-missing': 'The .conf file is missing or inaccessible.',
    'exe-missing': 'The amneziawg.exe file is missing or inaccessible.',
    'setup-executable': 'Automatic setup requires AmneziaWG in its default Program Files location.',
    'transition': 'Wait for the tunnel to finish switching.',
    'service-not-started': 'The AmneziaWG service did not reach the running state.',
    'service-not-stopped': 'The AmneziaWG service did not stop in time.'
  };
  if (error.serviceCodes?.length) return 'The AmneziaWG service stopped during startup. Windows error codes: ' + error.serviceCodes.join(', ') + '.';
  if (Object.hasOwn(messages, error.message)) return messages[error.message];
  const detail = error.cause || error;
  if ([5, 740, 'EACCES', 'EPERM'].includes(detail.code) ||
      /access is denied|access denied|requires elevation|отказано в доступе|требует повышения/i.test(`${detail.stdout || ''}\n${detail.stderr || ''}`)) {
    return 'Windows denied access to the tunnel service. This operation may require administrator privileges.';
  }
  return fallback;
}

async function update(context) {
  const settings = actions.get(context);
  if (busy || !settings?.configPath) return;
  const requestedAt = pressId;
  const isCurrent = () => !busy && pressId === requestedAt && actions.get(context) === settings;
  try {
    const { adapter, name } = selected(settings);
    const status = (await adapter.managedStatus(settings.configPath)) ?? await adapter.status(name);
    if (!isCurrent()) return;
    if (status === 'unknown') throw new Error('unknown-status');
    if (statusErrors.delete(context) && !pressErrors.has(context)) notify(context, '');
    display.show(context, status);
  } catch (error) {
    if (!isCurrent()) return;
    const message = explain(error, 'Could not read the AmneziaWG service status.');
    if (statusErrors.get(context) !== message) {
      statusErrors.set(context, message);
      if (!pressErrors.has(context)) notify(context, message);
    }
    display.show(context, 'error');
  }
}
ws.onopen = () => send({event:args['-registerEvent'],uuid:args['-pluginUUID']});
ws.onmessage = async ({data}) => {
  let msg; try { msg = JSON.parse(data); } catch { return; }
  const {event, context, payload = {}} = msg;
  if (event === 'willAppear' || event === 'didReceiveSettings') {
    const settings = { ...payload.settings };
    if (!settings.configPath && path.win32.isAbsolute(settings.directory || '') && validName(settings.server)) {
      settings.configPath = path.win32.join(settings.directory, settings.server + '.conf');
    }
    if (event === 'willAppear') display.forget(context);
    if (event === 'willAppear' || !settings.configPath || actions.get(context)?.configPath !== settings.configPath) {
      display.show(context, 'disconnected');
    }
    actions.set(context, settings);
    pressErrors.delete(context);
    statusErrors.delete(context);
    notify(context, '');
    await update(context);
  } else if (event === 'willDisappear') {
    actions.delete(context);
    display.forget(context);
    pressErrors.delete(context);
    statusErrors.delete(context);
  } else if (event === 'propertyInspectorDidAppear' || (event === 'sendToPlugin' && payload.type === 'diagnostic')) {
    notify(context, pressErrors.get(context) || statusErrors.get(context) || '');
  }
  else if (event === 'keyUp') {
    if (busy) return;
    const settings = actions.get(context) ?? payload.settings;
    busy = true;
    pressId++;
    let fallback = 'Could not read the AmneziaWG service status.';
    try {
      const { adapter, name, executable } = selected(settings);
      await checkFile(executable, 'exe-missing');
      let managedStatus = await adapter.managedStatus(settings.configPath);
      let status = managedStatus ?? await adapter.status(name);
      if (managedStatus === null && status === 'disconnected') {
        await checkFile(settings.configPath, 'config-missing');
        if (executable.toLowerCase() !== defaultExecutable.toLowerCase()) throw new Error('setup-executable');
        fallback = 'Tunnel preparation failed or administrator approval was cancelled. Check the configuration and try again.';
        notify(context, 'Approve the Windows administrator prompt to prepare this tunnel.');
        await adapter.prepare(settings.configPath);
        managedStatus = await adapter.managedStatus(settings.configPath);
        if (managedStatus === null) throw new Error('setup-failed');
        status = managedStatus;
      }
      if (status === 'disconnected' && actions.get(context) === settings) display.show(context, 'connecting');
      if (managedStatus !== null) {
        fallback = 'Could not switch the prepared AmneziaWG service.';
        await adapter.toggleManaged(settings.configPath, status);
        await adapter.waitForManagedState(settings.configPath, status === 'connected' ? 'disconnected' : 'connected');
      } else if (status === 'connected') {
        fallback = 'AmneziaWG could not stop the tunnel service.';
        await adapter.disconnect(name);
      } else if (status === 'disconnected') {
        await checkFile(settings.configPath, 'config-missing');
        fallback = 'AmneziaWG could not start the tunnel service. Check Windows permissions and the AmneziaWG log.';
        await adapter.connectFile(settings.configPath);
      } else if (status !== 'unknown') throw new Error('transition');
      else throw new Error('unknown-status');
      pressErrors.delete(context);
      notify(context, '');
    } catch (error) {
      const message = explain(error, fallback);
      pressErrors.set(context, message);
      notify(context, message);
      send({event:'showAlert',context});
    } finally { busy = false; }
    await update(context);
  }
};
const statusTimer = setInterval(() => {
  for (const context of actions.keys()) update(context);
}, 5000);
ws.onclose = () => {
  clearInterval(statusTimer);
  display.clear();
  actions.clear();
};
