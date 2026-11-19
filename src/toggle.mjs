// Connection policy is independent of the Stream Deck and Amnezia adapters.
// An adapter must report real state and implement the operations below.
export async function toggle(adapter, serverId) {
  if (!serverId) throw new Error('Выберите сервер');
  const state = await adapter.getState();
  if (state.status === 'connecting' || state.status === 'disconnecting') {
    throw new Error('Дождитесь завершения переключения VPN');
  }
  if (state.status === 'connected') {
    if (!state.serverId) throw new Error('Не удалось определить подключённый сервер');
    await adapter.disconnect();
    if (state.serverId === serverId) return 'disconnected';
    const after = await adapter.getState();
    if (after.status !== 'disconnected') throw new Error('VPN ещё не отключён');
  } else if (state.status !== 'disconnected') {
    throw new Error('Не удалось определить состояние VPN');
  }
  await adapter.connect(serverId);
  return 'connecting';
}
