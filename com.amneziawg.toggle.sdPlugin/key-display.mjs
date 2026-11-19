import { labelPaths } from './key-labels.mjs';

const frameCount = 16;
const frameDelay = 75;
const target = 0; // Update the hardware key and the Stream Deck editor.

function ringImage(label, color, opacity, highlight = '') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 72 72">
    <rect width="72" height="72" fill="#111113"/>
    <g fill="none" stroke="${color}" opacity="${opacity}">
      <circle cx="36" cy="36" r="28" stroke-width="6" opacity=".08"/>
      <circle cx="36" cy="36" r="28" stroke-width="4" opacity=".16"/>
      <circle cx="36" cy="36" r="28" stroke-width="2.5" opacity=".27"/>
      <circle cx="36" cy="36" r="28" stroke-width=".9"/>
    </g>
    ${highlight}
    <path aria-label="${label}" fill="${label === 'connected' ? color : '#fff'}" d="${labelPaths[label]}"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// Stream Deck displays static images, so advance the highlight one frame at a time.
const connectingFrames = Array.from({ length: frameCount }, (_, frame) => ringImage('connecting', '#fff', '.25', `
  <g transform="rotate(${frame * 360 / frameCount} 36 36)" fill="none" stroke="#fff" stroke-linecap="round">
    <path d="M 36 8 A 28 28 0 0 1 63 43" stroke-width="5" opacity=".18"/>
    <path d="M 36 8 A 28 28 0 0 1 63 43" stroke-width="1.4"/>
  </g>`));
const stillImages = {
  disconnected: ringImage('connect', '#fff', '.94'),
  connected: ringImage('connected', '#ad7f52', '1'),
  disconnecting: ringImage('...', '#fff', '.94'),
  error: ringImage('!', '#fff', '.94')
};

export function createKeyDisplay(send) {
  const keys = new Map();
  const sendImage = (context, image) => send({ event: 'setImage', context, payload: { image, target } });

  function forget(context) {
    clearInterval(keys.get(context)?.timer);
    keys.delete(context);
  }

  return {
    show(context, status) {
      if (keys.get(context)?.status === status) return;
      forget(context);
      let timer;
      if (status === 'connecting') {
        let frame = 0;
        sendImage(context, connectingFrames[frame]);
        timer = setInterval(() => {
          frame = (frame + 1) % frameCount;
          sendImage(context, connectingFrames[frame]);
        }, frameDelay);
      } else {
        sendImage(context, stillImages[status]);
      }
      keys.set(context, { status, timer });
    },
    forget,
    clear() {
      for (const context of keys.keys()) forget(context);
    }
  };
}
