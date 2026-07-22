import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 8000);

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

createServer((request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
        const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
        let filePath = resolve(root, relativePath);

        if (filePath !== root && !filePath.startsWith(root + sep)) {
            response.writeHead(403).end("Forbidden");
            return;
        }

        if (statSync(filePath).isDirectory()) {
            filePath = resolve(filePath, "index.html");
        }

        response.writeHead(200, {
            "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
            "Cache-Control": "no-cache",
        });
        createReadStream(filePath).pipe(response);
    } catch (error) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
    }
}).listen(port, "127.0.0.1", () => {
    console.log(`Serving CAGE at http://127.0.0.1:${port}`);
});
