"""
serve.py — UI server with built-in ADK proxy (no CORS issues).
Run: python serve.py
Open: http://localhost:3000
"""
import http.server
import socketserver
import urllib.request
import urllib.error
import os
import json
import mimetypes

UI_PORT = 3000
ADK_BASE = "http://localhost:8000"
UI_DIR = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self._cors(200)

    def do_GET(self):
        if self.path.startswith("/adk"):
            self._proxy("GET", None)
        else:
            self._serve_file()

    def do_POST(self):
        if self.path.startswith("/adk"):
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
            self._proxy("POST", body)
        else:
            self._cors(404)

    def _proxy(self, method, body):
        # Strip /adk prefix to get the actual ADK path
        adk_path = self.path[4:]  # remove "/adk"
        if not adk_path.startswith("/"):
            adk_path = "/" + adk_path
        url = ADK_BASE + adk_path
        try:
            req = urllib.request.Request(
                url, data=body, method=method,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=300) as r:
                data = r.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def _serve_file(self):
        path = self.path.split("?")[0]
        if path == "/":
            path = "/index.html"
        file_path = os.path.join(UI_DIR, path.lstrip("/"))
        if not os.path.isfile(file_path):
            self._cors(404)
            return
        mime, _ = mimetypes.guess_type(file_path)
        with open(file_path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", mime or "text/plain")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _cors(self, code):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, format, *args):
        pass  # suppress request logs


print(f"UI running at:     http://localhost:{UI_PORT}")
print(f"ADK proxy target:  {ADK_BASE}")
print("Open http://localhost:3000 in your browser.\n")

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", UI_PORT), Handler) as httpd:
    httpd.serve_forever()
