"""Local server: static frontend + JSON API. Run: .venv/bin/python server.py"""
import json
import os
import sys
import traceback
import warnings
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, urlparse

warnings.filterwarnings("ignore")  # LibreSSL noise from the system Python

import config
from services import charts, companies, forecasts, macro, news, sectors, sentiment

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")

# Add a feature: write services/<thing>.py with payload(q) (q = query-string dict) and register it here.
ROUTES = {
    "/api/sectors": sectors.payload,
    "/api/macro": macro.payload,
    "/api/news": news.payload,
    "/api/em": sectors.em_payload,
    "/api/charts": charts.payload,       # ?id=ES&tf=1M for bars; no params for the asset list
    "/api/sentiment": sentiment.payload,
    "/api/companies": companies.payload,
    "/api/forecasts": forecasts.payload,
}
# POST endpoints take the parsed JSON body.
POST_ROUTES = {
    "/api/forecasts": forecasts.save_guess,
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def do_GET(self):
        url = urlparse(self.path)
        path = url.path
        if path in ROUTES:
            try:
                body, status = json.dumps(ROUTES[path](dict(parse_qsl(url.query)))).encode(), 200
            except Exception as e:  # noqa: BLE001
                traceback.print_exc()
                body, status = json.dumps({"error": str(e)}).encode(), 502
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        fn = POST_ROUTES.get(path)
        if not fn:
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(min(n, 65536)) or b"{}")
            out, status = fn(body), 200
        except (ValueError, TypeError) as e:
            out, status = {"error": str(e)}, 400
        payload = json.dumps(out).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        msg = fmt % args
        if "/api/" in msg or "code " in msg:  # skip routine static-file hits
            sys.stderr.write(msg + "\n")


def main():
    port = int(os.environ.get("PORT", config.PORT))
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Market dashboard on http://localhost:{port}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
