// SPDX-License-Identifier: GPL-3.0-only
import { loadEngine } from './loader.js';
import { parseParentOrigin, validConnect, classifyPortMessage } from './protocol.js';
const origin = parseParentOrigin(new URL(location.href).searchParams.get('parentOrigin'));
let active = false;
let engine;
let port;
let disposed = false;

// WASM(pthread)を確実に終了し、ポートを閉じる。ホストの要求・ページ離脱のどちらからも呼ばれる。
function dispose({ acknowledge = false } = {}) {
  if (disposed) return;
  disposed = true;
  try { engine?.terminate(); } catch { /* already terminated */ }
  engine = null;
  if (acknowledge) port?.postMessage({ type: 'disposed' });
  port?.close();
}

window.addEventListener('message', async (event) => {
  if (active || !validConnect(event, window.parent, origin)) return;
  active = true;
  port = event.ports[0];
  port.start();
  // 受信は接続直後から有効にし、エンジン起動中でも dispose を受け付ける。
  let loadedEngine = false;
  port.onmessage = ({ data }) => {
    const kind = classifyPortMessage(data);
    if (kind === 'dispose') { dispose({ acknowledge: true }); return; }
    if (kind !== 'command') {
      port.postMessage({ type: 'error', message: '不正なUSIコマンドです。' });
      return;
    }
    if (loadedEngine && engine) engine.postMessage(data.line);
  };
  try {
    const loaded = await loadEngine(
      (line) => { if (!disposed) port.postMessage({ type: 'line', line }); },
      (message) => { if (!disposed) port.postMessage({ type: 'error', message }); },
    );
    if (disposed) { loaded.module?.terminate(); return; }
    engine = loaded.module;
    loadedEngine = true;
    port.postMessage({ type: 'ready', engine: loaded.engine });
  } catch (error) {
    if (!disposed) port.postMessage({ type: 'error', message: error.message || 'エンジンを起動できません。' });
  }
});
window.addEventListener('pagehide', () => dispose(), { once: true });
