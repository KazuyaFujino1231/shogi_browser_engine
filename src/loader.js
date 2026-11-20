// SPDX-License-Identifier: GPL-3.0-only
let loading;
/**
 * onLine: エンジンの出力行。onFatal: WASMが異常終了した(メモリ不足など)ときの通知。
 * 異常終了後のエンジンは応答しないため、ホストが待ち続けず作り直せるよう必ず通知する。
 */
export async function loadEngine(onLine, onFatal = () => {}, signal) {
  if (loading) throw new Error('このエンジンは既に起動しています。');
  loading = true;
  try {
    return await load(onLine, onFatal, signal);
  } catch (error) {
    loading = false; // 失敗・中断したら、同じページで起動し直せるようにする。
    throw error;
  }
}

// signal: 中断要求。取得・初期化の各段階の前後で確認し、中断されたら確保済みのものを手放して AbortError で終える。
// WASMの初期化(factory)そのものは途中で止められないため、完了を待ってから終了させる。
function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException('エンジンの起動を中断しました。', 'AbortError');
}

async function load(onLine, onFatal, signal) {
  throwIfAborted(signal);
  const manifest = await fetch(new URL('./manifest.json', import.meta.url), { signal }).then((r) => {
    if (!r.ok) throw new Error('エンジン情報を取得できません。');
    return r.json();
  });
  throwIfAborted(signal);
  if (manifest.requiresCrossOriginIsolation && !globalThis.crossOriginIsolated) {
    throw new Error('このWASMにはcross-origin isolationが必要です。親画面とAI配信元のCOOP・COEP・埋め込み許可を確認してください。');
  }
  if (!globalThis.SharedArrayBuffer) throw new Error('このブラウザでは共有メモリを利用できません。');
  const assets = new URL('./engine/', import.meta.url);
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(manifest.module, assets).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error('エンジンJSを読み込めません。'));
    document.head.append(script);
  });
  throwIfAborted(signal);
  const factory = globalThis[manifest.exportName];
  if (typeof factory !== 'function') throw new Error('エンジンの起動関数がありません。');
  // Fetch data before instantiating to avoid orphaning pthread workers on download errors.
  const files = await Promise.all(manifest.dataFiles.map(async (file) => {
    const response = await fetch(new URL(file.url, assets), { signal });
    if (!response.ok) throw new Error(`評価関数を取得できません: ${file.url}`);
    return [file.path, new Uint8Array(await response.arrayBuffer())];
  }));
  throwIfAborted(signal);
  let module;
  try {
    module = await factory({
      locateFile: (name) => new URL(name, assets).href,
      mainScriptUrlOrBlob: new URL(manifest.module, assets).href,
      printErr: (line) => console.warn('[USI engine]', line),
      onAbort: () => {
        onLine('info string engine aborted');
        onFatal('エンジンが異常終了しました。メモリ不足の可能性があります。');
      },
    });
    throwIfAborted(signal); // 初期化の完了を待ったあとで中断されていたら、catch で終了させる。
    try { module.FS.mkdir('/eval'); } catch { /* directory may already exist */ }
    for (const [path, bytes] of files) module.FS.writeFile(path, bytes);
    // 評価関数はWASMのファイルシステムへ複製済み。JS側の控えを手放し、メモリの二重保持を避ける。
    files.length = 0;
    module.addMessageListener(onLine);
    // Set model-specific options before the host's first isready triggers evaluation loading.
    module.postMessage('setoption name EvalDir value /eval');
    module.postMessage('setoption name EvalFile value nn.bin');
    module.postMessage('setoption name FV_SCALE value 24');
    module.postMessage('setoption name Threads value 1');
    module.postMessage('setoption name USI_Hash value 32');
    module.postMessage('setoption name USI_OwnBook value false');
    return { module, engine: manifest.engine };
  } catch (error) {
    module?.terminate();
    throw error;
  }
}
