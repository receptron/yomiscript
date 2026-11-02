import functools
import http.server
import json
import pathlib
import sys

# the accent editor's records (web/accent_edit.html), one JSON object per line
EDITS = pathlib.Path(__file__).resolve().parents[2] / "dict/accent_edits/edits.jsonl"
FIELDS = ("text", "input", "dictionary", "edited", "listener")


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        if not self.path.endswith((".onnx", ".bin")):
            self.send_header("Cache-Control", "no-cache")  # pick up edited JS/JSON on reload
        super().end_headers()

    def do_POST(self):
        if self.path != "/accent_edit":
            self.send_error(404)
            return
        try:
            r = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))
            if not isinstance(r, dict) or not all(isinstance(r.get(k), str) and r[k] for k in FIELDS) or not r["edited"].startswith("ja /"):
                raise ValueError("missing fields")
        except ValueError as e:
            self.send_error(400, str(e))
            return
        EDITS.parent.mkdir(parents=True, exist_ok=True)
        with EDITS.open("a", encoding="utf-8") as f:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
        with EDITS.open(encoding="utf-8") as f:
            body = json.dumps({"count": sum(1 for _ in f)}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), functools.partial(H, directory=sys.argv[2])).serve_forever()
