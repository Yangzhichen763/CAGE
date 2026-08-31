import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 8000);

// Optional image processing for low-quality preview generation.
// The server works fine without sharp — previews are simply disabled
// and the frontend falls back to fetch-with-progress only.
let sharp = null;
try {
    sharp = (await import("sharp")).default;
} catch (_) {
    // sharp is not installed — preview generation disabled.
}

const mimeTypes = {
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
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

// In-memory cache for generated previews so repeated requests are instant.
const previewCache = new Map();
const PREVIEW_CACHE_MAX = 200;

async function generatePreview(filePath) {
    if (!sharp) return null;

    const cached = previewCache.get(filePath);
    if (cached) return cached;

    try {
        // Resize to ~48px wide (maintaining aspect ratio) and encode as a
        // low-quality progressive JPEG. This produces a ~1-3 KB preview that
        // the browser can download almost instantly and display as a blurry
        // placeholder while the full-resolution image continues loading.
        const buffer = await sharp(filePath)
            .resize(48, null, { withoutEnlargement: true })
            .jpeg({ quality: 32, progressive: true })
            .toBuffer();

        if (previewCache.size >= PREVIEW_CACHE_MAX) {
            const firstKey = previewCache.keys().next().value;
            previewCache.delete(firstKey);
        }
        previewCache.set(filePath, buffer);
        return buffer;
    } catch (_) {
        return null;
    }
}

createServer(async (request, response) => {
    try {
        const requestUrl = new URL(request.url || "/", "http://localhost");
        const pathname = decodeURIComponent(requestUrl.pathname);
        const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
        let filePath = resolve(root, relativePath);

        if (filePath !== root && !filePath.startsWith(root + sep)) {
            response.writeHead(403).end("Forbidden");
            return;
        }

        const stats = statSync(filePath);
        if (stats.isDirectory()) {
            filePath = resolve(filePath, "index.html");
        }

        const ext = extname(filePath).toLowerCase();
        const isImage = IMAGE_EXTENSIONS.has(ext);

        // Low-quality preview endpoint: ?preview=1 on an image path returns a
        // tiny progressive JPEG. Returns 404 when sharp is unavailable so the
        // frontend can detect this and skip the preview phase.
        if (requestUrl.searchParams.has("preview") && isImage) {
            if (!sharp) {
                response.writeHead(404, { "Content-Type": "text/plain" });
                response.end("Preview not available");
                return;
            }
            const previewBuffer = await generatePreview(filePath);
            if (!previewBuffer) {
                response.writeHead(500, { "Content-Type": "text/plain" });
                response.end("Preview generation failed");
                return;
            }
            response.writeHead(200, {
                "Content-Type": "image/jpeg",
                "Cache-Control": "public, max-age=86400",
                "Content-Length": previewBuffer.length,
            });
            response.end(previewBuffer);
            return;
        }

        const headers = {
            "Content-Type": mimeTypes[ext] || "application/octet-stream",
            "Cache-Control": isImage ? "public, max-age=3600" : "no-cache",
        };
        response.writeHead(200, headers);
        createReadStream(filePath).pipe(response);
    } catch (error) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
    }
}).listen(port, "127.0.0.1", () => {
    console.log(`Serving CAGE at http://127.0.0.1:${port}`);
    if (sharp) {
        console.log("Image preview generation enabled (sharp).");
    } else {
        console.log("Image preview disabled. Install sharp for progressive loading: npm install sharp");
    }
});
