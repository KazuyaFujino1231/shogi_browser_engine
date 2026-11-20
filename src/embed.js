// SPDX-License-Identifier: GPL-3.0-only
import { loadEngine } from './loader.js';
import { createEngineHost } from './host.js';
import { parseParentOrigin, validConnect } from './protocol.js';
const origin = parseParentOrigin(new URL(location.href).searchParams.get('parentOrigin'));
let active = false;
let host;
window.addEventListener('message', (event) => {
  if (active || !validConnect(event, window.parent, origin)) return;
  active = true;
  const port = event.ports[0];
  port.start();
  host = createEngineHost({
    loadEngine,
    post: (message) => port.postMessage(message),
    close: () => port.close(),
  });
  // 受信は接続直後から有効にし、エンジン起動中でも dispose を受け付ける。
  port.onmessage = ({ data }) => host.handleMessage(data);
  void host.start();
});
// ページ離脱時はホストが待っていないため、通知は送らずに停止だけ行う。
window.addEventListener('pagehide', () => { void host?.dispose({ acknowledge: false }); }, { once: true });
