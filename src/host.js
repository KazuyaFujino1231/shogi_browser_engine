// SPDX-License-Identifier: GPL-3.0-only
import { classifyPortMessage } from './protocol.js';

/**
 * iframe内のエンジンの寿命を管理する。DOM・MessagePortに依存しないので単体テストできる。
 *
 * - `disposed` は「終了完了」の通知: 起動処理(取得・WASM初期化)の完了または中断を待ち、
 *   生成済みのモジュールを terminate してから送る。ホストはこれを受けてから次のエンジンを起動できる。
 * - 起動中の dispose は signal で起動を中断する。WASM初期化(factory)自体は止められないため、完了を待って終了させる。
 */
export function createEngineHost({ loadEngine, post, close }) {
  const controller = new AbortController();
  let disposed = false;
  let engine = null;
  let started = null;
  let disposing = null;

  const safePost = (message) => { if (!disposed) post(message); };

  function start() {
    started = (async () => {
      try {
        const loaded = await loadEngine(
          (line) => safePost({ type: 'line', line }),
          (message) => safePost({ type: 'error', message }),
          controller.signal,
        );
        if (disposed) {
          loaded.module?.terminate();
          return;
        }
        engine = loaded.module;
        post({ type: 'ready', engine: loaded.engine });
      } catch (error) {
        if (error?.name === 'AbortError') return;
        safePost({ type: 'error', message: error?.message || 'エンジンを起動できません。' });
      }
    })();
    return started;
  }

  /** 終了が完了したら解決する。複数回呼んでも終了処理と通知は1回だけ。 */
  function dispose({ acknowledge = true } = {}) {
    if (disposing) return disposing;
    disposed = true;
    controller.abort();
    disposing = (async () => {
      await started?.catch(() => {});
      try { engine?.terminate(); } catch { /* already terminated */ }
      engine = null;
      if (acknowledge) post({ type: 'disposed' });
      close();
    })();
    return disposing;
  }

  function handleMessage(data) {
    const kind = classifyPortMessage(data);
    if (kind === 'dispose') { void dispose(); return; }
    if (disposed) return;
    if (kind !== 'command') {
      post({ type: 'error', message: '不正なUSIコマンドです。' });
      return;
    }
    // 起動が終わるまでは、エンジンがないためコマンドを受け付けない。
    engine?.postMessage(data.line);
  }

  return { start, dispose, handleMessage };
}
