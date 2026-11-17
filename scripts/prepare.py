#!/usr/bin/env python3
"""Build a self-contained static distribution, verifying every upstream artifact."""
import hashlib
import html
import json
from pathlib import Path
import shutil
import tarfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
LOCK = json.loads((ROOT / 'assets.lock.json').read_text())
DIST = ROOT / 'dist'
CACHE = ROOT / '.cache'

def download(url, digest):
    CACHE.mkdir(exist_ok=True)
    cached = CACHE / digest
    if not cached.exists():
        with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0 shogi-browser-engine/0.1"}), timeout=90) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != digest:
            raise RuntimeError(f'Checksum mismatch: {url}')
        cached.write_bytes(data)
    data = cached.read_bytes()
    if hashlib.sha256(data).hexdigest() != digest:
        raise RuntimeError(f'Corrupt cache: {url}')
    return data

def main():
    # No recursive removal: overwrite named output files, leaving source worktrees untouched.
    (DIST / 'engine').mkdir(parents=True, exist_ok=True)
    for source in (ROOT / 'src').iterdir():
        if source.is_file():
            shutil.copyfile(source, DIST / source.name)
    for asset in LOCK['files']:
        data = download(LOCK['packageURL'] + asset['path'], asset['sha256'])
        if len(data) != asset['size']:
            raise RuntimeError(f"Size mismatch: {asset['path']}")
        (DIST / 'engine' / asset['path']).write_bytes(data)
    upstream = LOCK['source']
    (DIST / 'yaneuraou-source.tar.gz').write_bytes(download(upstream['url'], upstream['sha256']))
    manifest = json.loads((DIST / 'engine' / 'engine.json').read_text())
    manifest.pop('assetBaseURL', None)  # Distribution is hosted entirely on our own static site.
    manifest['engine'] = {
        'name': 'YaneuraOu', 'version': upstream['commit'],
        'evaluation_model': LOCK['name'],
        'engine_build': LOCK['id'] + '-' + LOCK['version'],
    }
    (DIST / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    shutil.copyfile(ROOT / 'LICENSE', DIST / 'LICENSE')
    # Ship the complete authored bridge source and build instructions alongside the WASM.
    with tarfile.open(DIST / 'bridge-source.tar.gz', 'w:gz') as archive:
        for name in ['src', 'scripts', 'tests', 'README.md', 'LICENSE', 'package.json', 'assets.lock.json', 'render.yaml']:
            archive.add(ROOT / name, arcname='shogi-browser-engine/' + name,
                        filter=lambda member: None if '__pycache__' in member.name.split('/') or member.name.endswith('.pyc') else member)
    (DIST / 'licenses.html').write_text(f'''<!doctype html><html lang="ja"><meta charset="utf-8">
<title>ライセンス・対応ソース</title><h1>ライセンス・対応ソース</h1>
<p>やねうら王および本USIブリッジはGPLv3です。無保証です。GPLに従って改変・再配布できます。</p>
<ul><li><a href="./LICENSE">GPLv3全文</a></li>
<li><a href="./yaneuraou-source.tar.gz">配信WASMに対応するやねうら王ソース一式</a> ({html.escape(upstream['commit'])})</li>
<li><a href="./bridge-source.tar.gz">ブリッジの完全なソース・ビルド手順</a></li>
<li><a href="./engine/MIT.txt">つようら王11micro・進行度評価関数のMITライセンス</a></li></ul>
<p>配布パッケージ: {html.escape(LOCK['packageURL'])}</p><p><a href="./">単体起動画面</a></p></html>''')
    print(f'Prepared {DIST}; sources and licenses included. No deployment performed.')

if __name__ == '__main__':
    main()
