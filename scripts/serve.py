#!/usr/bin/env python3
"""Local static host with the same isolation headers required in production."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Resource-Policy', 'cross-origin')
        self.send_header('Permissions-Policy', 'cross-origin-isolated=(self "http://localhost:5173" "http://127.0.0.1:5173")')
        # Public, non-credentialed static files (manifest.json, embed.html, wasm/eval
        # assets): a generic wildcard is safe since no auth/cookies are ever sent here.
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=5180)
    args = parser.parse_args()
    directory = str(Path(__file__).resolve().parent.parent / 'dist')
    server = ThreadingHTTPServer(('0.0.0.0', args.port), partial(Handler, directory=directory))
    print(f'Engine static files: http://localhost:{args.port}', flush=True)
    server.serve_forever()
