# 独立ブラウザUSIエンジン

つようら王11micro + やねうら王WASMを配信する独立した静的サイトです。
既存のReactアプリ・Django・認証・DBに依存しません。単体起動画面でUSIを実行できます。
本リポジトリのブリッジはGPL-3.0-only。探索エンジンはGPLv3、評価関数はMITです。

## ローカルで実行

Python 3、Node.jsが必要です。追加npm依存はありません。

```sh
npm test
npm run build
npm run dev
```

http://localhost:5180/ で「エンジンを起動」し、usi、isready、position startpos、go movetime 3000を順に送信できます。
ビルドはassets.lock.jsonで固定した資材を取得し、サイズ・SHA-256を全件検証します。
検証済み資材は.cacheに保持します。ハッシュ不一致でビルドを停止します。
WASMと評価関数はShogiHomeメンテナーの公開パッケージを無改変で再配信します。
対応ソースは同メンテナーが明示する完全なコミットのアーカイブを同梱します。
独立再ビルドはscripts/rebuild-wasm.shを参照してください。元のビルドとのバイト一致は保証しません。

## iframe連携

ホストはembed.html?parentOrigin=<ホストの正確なorigin>をiframeで開きます。
iframeにallow="cross-origin-isolated"を指定します。
ロード後、ホストはMessageChannelを作成し、正確なエンジンoriginへ
{protocol:'usi-bridge-v1',type:'connect',session_id:'...'}とport2を転送します。
エンジンはevent.source・event.origin・プロトコル・ポート数を照合します。
受信ポートで{type:'ready',engine:{name,version,evaluation_model,engine_build}}を返します。
{type:'command',line:'usi'}を送り、{type:'line',line:'usiok'}等を受信します。
失敗は{type:'error',message:'...'}。画面ID・認証・アプリ内部オブジェクトを扱いません。
連続して解析する場合は、同じiframe・ポートを使い回せます(usiから始めても、usinewgame以降だけでも構いません)。
探索を中断するときはstopを送り、bestmoveが返るのを待ってから次のpositionを送ってください。
ホストは終了時に{type:'dispose'}を送ってください。{type:'disposed'}は「終了完了」の通知です。
起動中(評価ファイル取得・WASM初期化の途中)に送った場合は、起動を中断し、WASM初期化の完了を待って
生成済みのモジュールを終了させてから返します。この通知のあとにiframeを削除し、次のエンジンを起動すれば、
前後のエンジンのメモリ確保が重なりません。通知後はポートが閉じ、起動時の{type:'ready'}も送られません。
ページ離脱(pagehide)時も同様に停止します。dispose後のコマンドは無視されます。
WASMが異常終了した場合(メモリ不足など)は{type:'error',message:'...'}を送ります。
このときエンジンは応答しないため、ホストはiframeを削除して作り直してください。
ホストはタイムアウト・中止時にポートを閉じてiframeを削除してください。

## 配信条件

このWASMは探索Threads=1でもpthreadを使用するため、SharedArrayBufferとcross-origin isolationが必須です。
トップレベルのホストにもCOOP: same-origin、COEP: require-corpが必要です。
iframe側にもCOEP、全AI資材にCORP: cross-originを付けます。
親のPermissions-Policyでcross-origin-isolatedを禁止せず、iframeへallow="cross-origin-isolated"を指定します。
既存の広告や外部画像・スクリプトはCOEPの影響を受けるため、本番設定前に検証してください。

## Renderへの手動デプロイ

1. このリポジトリだけを公開可能な新規Gitリポジトリへ配置する。親の非公開アプリを含めない。
2. Render Static Siteに接続し、対象の作業ブランチを明示する。
3. Build Command: python3 scripts/prepare.py / Publish Directory: dist。
4. 自動デプロイはOFFにする。render.yamlでもautoDeployTrigger: offを指定。
5. 起動・ライセンス・対応ソースの取得を検証してから、既存フロントへURLを設定する。
6. エンジン更新時はバージョン別の配信先を使い、既存フロントの参照を明示的に切り替える。

本作業ではpush、mainマージ、リモートリポジトリ作成、デプロイは行いません。
公開時はdist/licenses.htmlからWASMの対応ソースとブリッジの完全ソースを同等に取得できます。
別サイト・iframeの採用だけでアプリ側のGPL適用範囲が確定するものではありません。
