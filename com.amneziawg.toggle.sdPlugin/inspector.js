const configuration = document.getElementById('configuration');
const executable = document.getElementById('exe');
const message = document.getElementById('message');

function normalizePath(value) {
  return value.trim().replace(/^(["'])(.*)\1$/, '$2');
}

window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, info, actionInfo) => {
  const { action, payload } = JSON.parse(actionInfo);
  // Inspector commands use the UUID that registered this socket.
  const context = uuid;
  const saved = payload?.settings ?? {};
  const defaultExecutable = 'C:\\Program Files\\AmneziaWG\\amneziawg.exe';

  configuration.value = saved.configPath ?? (saved.directory && saved.server
    ? saved.directory.replace(/[\\/]+$/, '') + '\\' + saved.server + '.conf'
    : '');
  executable.value = saved.executable || defaultExecutable;

  const socket = new WebSocket('ws://127.0.0.1:' + port);
  let lastSent;
  function save() {
    if (socket.readyState !== 1) return;
    const command = JSON.stringify({
      event: 'setSettings',
      context,
      action,
      payload: {
        executable: normalizePath(executable.value) || defaultExecutable,
        configPath: normalizePath(configuration.value)
      }
    });
    if (command === lastSent) return;
    socket.send(command);
    lastSent = command;
  }

  for (const field of [configuration, executable]) {
    field.oninput = save;
    field.onchange = () => {
      field.value = normalizePath(field.value);
      if (field === executable && !field.value) field.value = defaultExecutable;
      save();
    };
    field.onkeydown = event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        save();
        field.blur();
      }
    };
  }

  socket.onopen = () => {
    socket.send(JSON.stringify({ event: registerEvent, uuid }));
    configuration.disabled = executable.disabled = false;
    message.textContent = '';
    socket.send(JSON.stringify({ event: 'sendToPlugin', context, action, payload: { type: 'diagnostic' } }));
  };
  socket.onmessage = ({ data }) => {
    const { event, payload } = JSON.parse(data);
    if (event === 'sendToPropertyInspector' && payload?.type === 'diagnostic') message.textContent = payload.message;
  };
  socket.onclose = socket.onerror = () => {
    configuration.disabled = executable.disabled = true;
    message.textContent = 'Stream Deck connection is unavailable.';
  };
};
