// SPDX-License-Identifier: GPL-3.0-only
let loading;
export async function loadEngine(onLine) {
  if (loading) throw new Error('このエンジンは既に起動しています。');
  loading = true;
  const manifest = await fetch(new URL('./manifest.json', import.meta.url)).then((r) => {
    if (!r.ok) throw new Error('エンジン情報を取得できません。');
    return r.json();
  });
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
  const factory = globalThis[manifest.exportName];
  if (typeof factory !== 'function') throw new Error('エンジンの起動関数がありません。');
  // Fetch data before instantiating to avoid orphaning pthread workers on download errors.
  const files = await Promise.all(manifest.dataFiles.map(async (file) => {
    const response = await fetch(new URL(file.url, assets));
    if (!response.ok) throw new Error(`評価関数を取得できません: ${file.url}`);
    return [file.path, new Uint8Array(await response.arrayBuffer())];
  }));
  let module;
  try {
    module = await factory({
      locateFile: (name) => new URL(name, assets).href,
      mainScriptUrlOrBlob: new URL(manifest.module, assets).href,
      printErr: (line) => console.warn('[USI engine]', line),
      onAbort: () => onLine('info string engine aborted'),
    });
    try { module.FS.mkdir('/eval'); } catch { /* directory may already exist */ }
    for (const [path, bytes] of files) module.FS.writeFile(path, bytes);
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
