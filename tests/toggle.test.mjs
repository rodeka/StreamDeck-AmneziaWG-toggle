import test from 'node:test';
import assert from 'node:assert/strict';
import { toggle } from '../src/toggle.mjs';

function adapter(initial) {
  let state = initial;
  const calls = [];
  return { calls, getState: async () => state,
    disconnect: async () => { calls.push('disconnect'); state = {status:'disconnected'}; },
    connect: async id => { calls.push(`connect:${id}`); } };
}
test('connects selected server', async () => {
  const a = adapter({status:'disconnected'});
  assert.equal(await toggle(a, 'one'), 'connecting');
  assert.deepEqual(a.calls, ['connect:one']);
});
test('disconnects the selected connected server', async () => {
  const a = adapter({status:'connected',serverId:'one'});
  assert.equal(await toggle(a, 'one'), 'disconnected');
  assert.deepEqual(a.calls, ['disconnect']);
});
test('disconnects before switching servers', async () => {
  const a = adapter({status:'connected',serverId:'one'});
  await toggle(a, 'two');
  assert.deepEqual(a.calls, ['disconnect','connect:two']);
});
test('does not act when state is unknown', async () => {
  const a = adapter({status:'unknown'});
  await assert.rejects(toggle(a, 'one'));
  assert.deepEqual(a.calls, []);
});
