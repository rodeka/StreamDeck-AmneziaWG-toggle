import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('restores the saved configuration and persists pasted paths for the current key', async () => {
  const source = await readFile(new URL('../com.amneziawg.toggle.sdPlugin/inspector.js', import.meta.url), 'utf8');
  const elements = Object.fromEntries(['exe', 'configuration', 'message'].map(id => [id, {}]));
  class Socket {
    constructor() { this.readyState = 1; this.sent = []; Socket.instance = this; }
    send(message) { this.sent.push(JSON.parse(message)); }
  }
  const sandbox = { document: { getElementById: id => elements[id] }, window: {}, WebSocket: Socket };
  vm.runInNewContext(source, sandbox);
  sandbox.window.connectElgatoStreamDeckSocket('1234', 'inspector-id', 'register', '{}', JSON.stringify({
    context: 'action-id', action: 'test.action', payload: { settings: { configPath: 'C:\\VPN\\home.conf' } }
  }));
  const socket = Socket.instance;
  socket.onopen();
  assert.equal(socket.sent[0].uuid, 'inspector-id');
  assert.equal(elements.configuration.value, 'C:\\VPN\\home.conf');
  assert.equal(socket.sent[1].payload.type, 'diagnostic');
  assert.equal(socket.sent[1].context, 'inspector-id');
  socket.onmessage({ data: JSON.stringify({
    event: 'sendToPropertyInspector', payload: { type: 'diagnostic', message: 'Service access denied' }
  }) });
  assert.equal(elements.message.textContent, 'Service access denied');

  elements.configuration.value = ' "D:\\VPN configs\\office.conf" ';
  elements.exe.value = '"C:\\Program Files\\AmneziaWG\\amneziawg.exe"';
  elements.configuration.oninput();
  assert.deepEqual(socket.sent.at(-1), {
    event: 'setSettings', context: 'inspector-id', action: 'test.action',
    payload: { configPath: 'D:\\VPN configs\\office.conf', executable: 'C:\\Program Files\\AmneziaWG\\amneziawg.exe' }
  });
  assert.equal(elements.configuration.value, ' "D:\\VPN configs\\office.conf" ');
  const count = socket.sent.length;
  elements.configuration.onchange();
  assert.equal(socket.sent.length, count);

  elements.configuration.value = '';
  elements.configuration.onchange();
  assert.equal(socket.sent.at(-1).payload.configPath, '');
});
