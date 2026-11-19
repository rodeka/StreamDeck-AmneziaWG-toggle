import net from 'node:net';

// Open only the service endpoint. Do not connect to AmneziaVPNInstance: a
// connection to that endpoint can raise the application's window.
export function probeService(timeout = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection('\\\\.\\pipe\\local:AmneziaVpnIpcInterface');
    let finished = false;
    function finish(result) {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(result);
    }
    socket.setTimeout(timeout);
    socket.once('connect', () => finish({ available: true }));
    socket.once('timeout', () => finish({ available: false, reason: 'timeout' }));
    socket.once('error', (error) => finish({ available: false, reason: error.code || 'unknown' }));
  });
}
if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) {
  console.log(JSON.stringify(await probeService()));
}
