"""Local-only demo server; camera images stay on this machine."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

WEB = Path(__file__).parent / 'web'

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == '/api/image':
            relative = parse_qs(url.query).get('file', [''])[0]
            root = self.server.data_root / 'images'
            path = (root / relative).resolve()
            if not path.is_relative_to(root.resolve()) or path.suffix.lower() not in {'.jpg', '.jpeg', '.png'} or not path.is_file():
                self.send_error(404)
                return
            try:
                from PIL import Image
                from io import BytesIO
                with Image.open(path) as im:
                    im.thumbnail((640, 480))
                    buffer = BytesIO()
                    im.convert('RGB').save(buffer, format='JPEG', quality=80)
                payload = buffer.getvalue()
                self.send_response(200)
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            except ImportError:
                self.send_error(503, 'Install Pillow for local image previews')
            return
        super().do_GET()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--data-root', type=Path, default=Path('/data/JR_CAMERA_TRAPS'))
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.data_root = args.data_root
    print(f'Recurio+ running at http://{args.host}:{args.port}', flush=True)
    server.serve_forever()
