// SPDX-License-Identifier: GPL-3.0-only
import { loadEngine } from './loader.js';
import { parseParentOrigin, validConnect, validCommand } from './protocol.js';
const origin = parseParentOrigin(new URL(location.href).searchParams.get('parentOrigin'));
let active = false;
let engine;
let port;
window.addEventListener('message', async (event) => {
  if (active || !validConnect(event, window.parent, origin)) return;
  active = true;
  port = event.ports[0];
  port.start();
  try {
    const loaded = await loadEngine((line) => port.postMessage({ type: 'line', line }));
    engine = loaded.module;
    port.onmessage = ({ data }) => {
      if (data?.type !== 'command' || !validCommand(data.line)) {
        port.postMessage({ type: 'error', message: '不正なUSIコマンドです。' });
        return;
      }
      engine.postMessage(data.line);
    };
    port.postMessage({ type: 'ready', engine: loaded.engine });
  } catch (error) {
    port.postMessage({ type: 'error', message: error.message || 'エンジンを起動できません。' });
  }
});
window.addEventListener('pagehide', () => { engine?.terminate(); port?.close(); }, { once: true });
