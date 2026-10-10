import json, os, sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "datos")
DATA_FILE = os.path.join(DATA_DIR, "data.json")
PUBLIC = {"index.html", "js", "css", "assets"}
os.makedirs(DATA_DIR, exist_ok=True)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/data":
            body = b"null"
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, "rb") as f:
                    body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/":
            self.path = "/index.html"
        elif path.lstrip("/").split("/")[0] not in PUBLIC:
            self.send_error(404)
            return
        super().do_GET()

    def do_PUT(self):
        if self.path.split("?")[0] != "/api/data":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        if length > 20_000_000:
            self.send_error(413)
            return
        raw = self.rfile.read(length)
        try:
            json.loads(raw)
        except ValueError:
            self.send_error(400)
            return
        tmp = DATA_FILE + ".tmp"
        with open(tmp, "wb") as f:
            f.write(raw)
        os.replace(tmp, DATA_FILE)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    print(f"RRHH Hospital en http://localhost:{port}")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
