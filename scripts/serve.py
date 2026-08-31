from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote
import os
import sys

# Flush stdout so the startup banner appears immediately.
sys.stdout.reconfigure(line_buffering=True)

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)

# Optional preview generation via cv2. If cv2 is not installed, the
# ?preview=1 endpoint returns 404 and the frontend falls back to
# fetch-with-progress only.
try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

PREVIEW_CACHE = {}
PREVIEW_CACHE_MAX = 200
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
MIME_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
}


def generate_preview(file_path):
    """Generate a tiny low-quality JPEG preview (~48px wide)."""
    if not HAS_CV2:
        return None

    cached = PREVIEW_CACHE.get(file_path)
    if cached is not None:
        return cached

    try:
        img = cv2.imread(str(file_path), cv2.IMREAD_COLOR)
        if img is None:
            return None
        height, width = img.shape[:2]
        scale = 48.0 / width if width > 48 else 1.0
        if scale < 1.0:
            new_width = 48
            new_height = max(1, int(height * scale))
            img = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_AREA)

        ok, buffer = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 32])
        if not ok:
            return None

        if len(PREVIEW_CACHE) >= PREVIEW_CACHE_MAX:
            PREVIEW_CACHE.pop(next(iter(PREVIEW_CACHE)))
        PREVIEW_CACHE[file_path] = buffer.tobytes()
        return PREVIEW_CACHE[file_path]
    except Exception:
        return None


class CAGERequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent aggressive browser caching of JS/CSS during development.
        path = getattr(self, "_resolved_suffix", "")
        if path in (".js", ".css", ".mjs"):
            self.send_header("Cache-Control", "no-cache, must-revalidate")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        relative_path = unquote(parsed.path.lstrip("/"))
        file_path = (ROOT / relative_path).resolve()

        # Security: prevent path traversal.
        try:
            file_path.relative_to(ROOT)
        except ValueError:
            self.send_error(403, "Forbidden")
            return

        # Serve index.html for directory requests.
        if file_path.is_dir():
            file_path = file_path / "index.html"

        if not file_path.is_file():
            self.send_error(404, "Not found")
            return

        ext = file_path.suffix.lower()
        is_image = ext in IMAGE_EXTENSIONS

        # Preview endpoint: ?preview=1 on an image returns a tiny JPEG.
        if "preview" in query and is_image:
            preview = generate_preview(file_path)
            if preview is None:
                self.send_error(404, "Preview not available")
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "public, max-age=86400")
            self.send_header("Content-Length", str(len(preview)))
            self.end_headers()
            self.wfile.write(preview)
            return

        if is_image:
            stat = file_path.stat()
            self.send_response(200)
            self.send_header("Content-Type", MIME_TYPES.get(ext, "application/octet-stream"))
            self.send_header("Cache-Control", "public, max-age=3600")
            self.send_header("Content-Length", str(stat.st_size))
            self.end_headers()
            with open(file_path, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            return

        # Fallback for non-image files (HTML, CSS, JS, etc.).
        self._resolved_suffix = ext
        super().do_GET()


if __name__ == "__main__":
    print(f"Serving CAGE at http://127.0.0.1:8000")
    if HAS_CV2:
        print("Image preview generation enabled (cv2).")
    else:
        print("Image preview disabled. Install opencv-python for progressive loading: pip install opencv-python")
    ThreadingHTTPServer(("127.0.0.1", 8000), CAGERequestHandler).serve_forever()
