import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngineHost } from '../src/host.js';

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(loader) {
  const posted = [];
  const log = [];
  const host = createEngineHost({
    loadEngine: loader,
    post: (m) => { posted.push(m); log.push(`post:${m.type}`); },
    close: () => log.push('close'),
  });
  return { host, posted, log };
}
function fakeModule(log) {
  return { terminate: () => log.push('terminate'), postMessage: (line) => log.push(`cmd:${line}`) };
}

test('dispose while starting waits for the start to settle, terminates the module, then acknowledges', async () => {
  const gate = deferred();
  let signal;
  const log = [];
  const { host, posted } = setup(async (_onLine, _onFatal, s) => { signal = s; return gate.promise; });
  const module = fakeModule(log);
  void host.start();
  const disposing = host.dispose();
  await tick();
  assert.equal(signal.aborted, true, 'the loader is told to abort');
  assert.deepEqual(posted, [], 'no ack while the WASM is still initialising');
  gate.resolve({ module, engine: { name: 'x' } });
  await disposing;
  assert.deepEqual(log, ['terminate'], 'the module created during the abort window is terminated');
  assert.deepEqual(posted.map((m) => m.type), ['disposed'], 'no ready is sent after dispose');
});

test('an aborted start (AbortError) is acknowledged without reporting an error', async () => {
  const { host, posted, log } = setup(async (_a, _b, signal) => {
    await tick();
    if (signal.aborted) throw new DOMException('aborted', 'AbortError');
    return { module: fakeModule(log), engine: {} };
  });
  void host.start();
  await host.dispose();
  assert.deepEqual(posted.map((m) => m.type), ['disposed']);
});

test('dispose after ready terminates once, acknowledges, closes, and ignores later commands', async () => {
  const log = [];
  const module = fakeModule(log);
  const { host, posted } = setup(async () => ({ module, engine: { name: 'x' } }));
  await host.start();
  host.handleMessage({ type: 'command', line: 'isready' });
  await host.dispose();
  await host.dispose(); // idempotent
  host.handleMessage({ type: 'command', line: 'isready' });
  assert.deepEqual(log, ['cmd:isready', 'terminate']);
  assert.deepEqual(posted.map((m) => m.type), ['ready', 'disposed']);
});

test('termination happens before the acknowledgement and the port is closed last', async () => {
  const order = [];
  const host = createEngineHost({
    loadEngine: async () => ({ module: { terminate: () => order.push('terminate'), postMessage() {} }, engine: {} }),
    post: (m) => order.push(m.type),
    close: () => order.push('close'),
  });
  await host.start();
  await host.dispose();
  assert.deepEqual(order, ['ready', 'terminate', 'disposed', 'close']);
});

test('fatal errors and output after dispose are not forwarded; commands before ready are dropped', async () => {
  let onFatal; let onLine;
  const { host, posted } = setup(async (line, fatal) => { onLine = line; onFatal = fatal; return { module: fakeModule([]), engine: {} }; });
  await host.start();
  onFatal('crash');
  await host.dispose();
  onFatal('late');
  onLine('late line');
  assert.deepEqual(posted.map((m) => m.type), ['ready', 'error', 'disposed']);

  const early = setup(() => deferred().promise);
  void early.host.start();
  early.host.handleMessage({ type: 'command', line: 'usi' });
  assert.deepEqual(early.posted, []);
});

test('invalid messages are rejected with an error', async () => {
  const { host, posted } = setup(async () => ({ module: fakeModule([]), engine: {} }));
  await host.start();
  host.handleMessage({ type: 'command', line: 'learn' });
  assert.equal(posted.at(-1).type, 'error');
});
