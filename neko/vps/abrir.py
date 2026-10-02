#!/usr/bin/env python3
"""Atalhos da Sala 3D (ícone do YouTube etc.) com o navegador na VPS.

O servidor da sala (no Render) manda POST /sala3d/abrir {"url": ...} com o token, e isto
faz no Firefox do neko o que uma pessoa faria: Ctrl+L, digita o endereço, Enter — o mesmo
docker exec do modo local (server.js). Escuta só no IP da rede do navegador; quem chega
aqui é o Caddy do catálogo, repassando https://navegador.<ip>.sslip.io/sala3d/abrir.
"""
import hmac
import json
import os
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

TOKEN = os.environ.get('BROWSER_OPEN_TOKEN', '')
ESCUTA = ('172.30.99.1', 8090)
CONTAINER = 'sala3d-navegador'
# o endereço vai como argumento ($1), nunca colado dentro do script
XDOTOOL_OPEN = '; '.join([
    'export DISPLAY="${DISPLAY:-:99.0}"',
    "w=$(xdotool search --onlyvisible --name 'Mozilla Firefox$' | head -1)",
    '[ -n "$w" ] || exit 3',
    'xdotool windowactivate --sync "$w" 2>/dev/null',
    'xdotool key --clearmodifiers ctrl+l',
    'sleep 0.2',
    'xdotool type --delay 8 "$1"',
    'xdotool key Return',
])

trava = threading.Lock()


def url_ok(url):
    if not isinstance(url, str) or len(url) > 2000 or any(c.isspace() or ord(c) < 32 for c in url):
        return False
    u = urlsplit(url)
    return u.scheme in ('http', 'https') and bool(u.netloc)


class Atalho(BaseHTTPRequestHandler):
    server_version = 'sala3d'
    sys_version = ''

    def responder(self, codigo, msg):
        corpo = json.dumps({'ok': codigo == 200, 'msg': msg}).encode()
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_POST(self):
        if self.path != '/sala3d/abrir':
            return self.responder(404, 'não existe')
        dado = self.headers.get('Authorization', '').encode()
        if not TOKEN or not hmac.compare_digest(dado, f'Bearer {TOKEN}'.encode()):
            return self.responder(401, 'token')
        try:
            n = int(self.headers.get('Content-Length') or 0)
            url = json.loads(self.rfile.read(n) if 0 < n <= 4096 else b'{}').get('url')
        except (ValueError, AttributeError):
            url = None
        if not url_ok(url):
            return self.responder(400, 'endereço inválido')
        # dois atalhos ao mesmo tempo digitariam um por cima do outro
        if not trava.acquire(blocking=False):
            return self.responder(429, 'um de cada vez')
        try:
            r = subprocess.run(['docker', 'exec', '-u', 'neko', CONTAINER, 'sh', '-c', XDOTOOL_OPEN, 'sh', url],
                               capture_output=True, timeout=15)
            time.sleep(0.3)
        except subprocess.TimeoutExpired:
            return self.responder(504, 'demorou demais')
        finally:
            trava.release()
        if r.returncode != 0:
            print(f'atalho falhou ({r.returncode}): {r.stderr.decode(errors="replace")[:300]}', file=sys.stderr)
            return self.responder(502, 'o navegador não respondeu')
        return self.responder(200, 'aberto')

    def do_GET(self):
        self.responder(404, 'não existe')

    def log_message(self, fmt, *args):
        print(f'{self.client_address[0]} {fmt % args}', file=sys.stderr)


if __name__ == '__main__':
    if not TOKEN:
        sys.exit('falta BROWSER_OPEN_TOKEN no .env')
    ThreadingHTTPServer(ESCUTA, Atalho).serve_forever()
