import test from 'node:test';
import assert from 'node:assert/strict';
import { AmneziaWgAdapter } from '../com.amneziawg.toggle.sdPlugin/amneziawg.mjs';
const dir = 'C:\\VPN';
const file = name => ({ name, isFile: () => true });
function make(run) { return new AmneziaWgAdapter({ executable: 'C:\\Program Files\\AmneziaWG\\amneziawg.exe', directory: dir, run, list: async () => [file('home.conf'),file('bad name.conf')] }); }
test('lists valid configurations and starts exact selected file', async () => {
  const calls = []; const a = make(async (...args) => calls.push(args));
  assert.deepEqual(await a.servers(), ['home']); await a.connect('home');
  assert.deepEqual(calls[0][1], ['/installtunnelservice','C:\\VPN\\home.conf']);
});
test('refuses arbitrary paths', async () => { const a = make(async () => {}); await assert.rejects(a.connect('../secret')); });
test('reports unknown service output conservatively', async () => { const a = make(async () => ({stdout:'unexpected'})); assert.equal(await a.status('home'), 'unknown'); });
test('distinguishes missing service from access denial', async () => {
  const missing = make(async () => { throw Object.assign(new Error(), {code:1060}); });
  assert.equal(await missing.status('home'), 'disconnected');
  const denied = make(async () => { throw Object.assign(new Error(), {code:5}); });
  await assert.rejects(denied.status('home'));
});
test('starts and stops an existing prepared service without installing it', async () => {
  const commands = [];
  const adapter = make(async (command, args) => {
    assert.equal(command, 'sc.exe');
    commands.push(args);
    return { stdout: 'STATE : 1 STOPPED' };
  });
  assert.equal(await adapter.managedStatus('C:\\VPN\\Home.conf'), 'disconnected');
  await adapter.toggleManaged('c:\\vpn\\home.conf', 'disconnected');
  await adapter.toggleManaged('C:\\VPN\\Home.conf', 'connected');
  const name = commands[0][1];
  assert.match(name, /^AmneziaWGTunnel\$sd-[0-9a-f]{16}$/);
  assert.deepEqual(commands, [['query', name], ['start', name], ['stop', name]]);
});
test('waits for the service to run and reports a startup exit code', async () => {
  const states = ['STATE : 2 START_PENDING', 'STATE : 4 RUNNING'];
  const adapter = make(async () => ({ stdout: states.shift() }));
  const options = { pause: async () => {}, attempts: 2 };
  await adapter.waitForManagedState('C:\\VPN\\home.conf', 'connected', options);
  assert.equal(states.length, 0);
  const failed = make(async () => ({ stdout: 'STATE : 1 STOPPED\nWIN32_EXIT_CODE : 1066\nSERVICE_EXIT_CODE : 2' }));
  await assert.rejects(
    failed.waitForManagedState('C:\\VPN\\home.conf', 'connected', options),
    { message: 'service-exited', serviceCodes: [1066, 2] }
  );
});
