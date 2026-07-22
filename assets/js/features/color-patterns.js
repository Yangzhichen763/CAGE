"use strict";

function createDefaultImage(mode) {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 480;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    const numPixels = canvas.width * canvas.height;

    function vanDerCorput(n, base) {
        const seq = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            let denom = 1.0;
            let index = i + 1;
            let result = 0.0;
            while (index > 0) {
                denom *= base;
                result += (index % base) / denom;
                index = Math.floor(index / base);
            }
            seq[i] = result;
        }
        return seq;
    }

    if (mode === "structured") {
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = y * canvas.width + x;
                const offset = i * 4;
                const nx = x / canvas.width;
                const ny = y / canvas.height;
                data[offset] = Math.round(nx * 255);
                data[offset + 1] = Math.round(ny * 255);
                const b = 0.5 * (Math.sin(2 * Math.PI * nx) * Math.cos(2 * Math.PI * ny) + 1.0);
                data[offset + 2] = Math.round(b * 255);
                data[offset + 3] = 255;
            }
        }
    } else if (mode === "grid") {
        const n = Math.ceil(Math.pow(numPixels, 1 / 3));
        const r = new Float32Array(numPixels);
        const g = new Float32Array(numPixels);
        const b = new Float32Array(numPixels);
        for (let i = 0; i < numPixels; i++) {
            r[i] = (i % n) / (n - 1);
            g[i] = Math.floor(i / n) % n / (n - 1);
            b[i] = Math.floor(i / (n * n)) / (n - 1);
        }
        for (let i = 0; i < numPixels; i++) {
            const offset = i * 4;
            data[offset] = Math.round(r[i] * 255);
            data[offset + 1] = Math.round(g[i] * 255);
            data[offset + 2] = Math.round(b[i] * 255);
            data[offset + 3] = 255;
        }
    } else if (mode === "random") {
        for (let i = 0; i < numPixels; i++) {
            const offset = i * 4;
            data[offset] = Math.round(Math.random() * 255);
            data[offset + 1] = Math.round(Math.random() * 255);
            data[offset + 2] = Math.round(Math.random() * 255);
            data[offset + 3] = 255;
        }
    } else if (mode === "rainbow") {
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = y * canvas.width + x;
                const offset = i * 4;
                const nx = x / canvas.width;
                const ny = y / canvas.height;
                const hue = (nx + ny * 0.3) % 1;
                const saturation = 0.7 + ny * 0.3;
                const lightness = 0.4 + Math.sin(ny * Math.PI) * 0.2;
                const [r, g, b] = hslToRgb(hue, saturation, lightness);
                data[offset] = Math.round(r * 255);
                data[offset + 1] = Math.round(g * 255);
                data[offset + 2] = Math.round(b * 255);
                data[offset + 3] = 255;
            }
        }
    } else if (mode === "gradient") {
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = y * canvas.width + x;
                const offset = i * 4;
                const nx = x / canvas.width;
                const ny = y / canvas.height;
                const r = Math.pow(nx, 1.5);
                const g = Math.sin(nx * Math.PI) * Math.cos(ny * Math.PI) * 0.5 + 0.5;
                const b = Math.pow(1 - ny, 1.5);
                data[offset] = Math.round(r * 255);
                data[offset + 1] = Math.round(g * 255);
                data[offset + 2] = Math.round(b * 255);
                data[offset + 3] = 255;
            }
        }
    } else if (mode === "voronoi") {
        const numCells = 64;
        const cells = [];
        for (let c = 0; c < numCells; c++) {
            cells.push({
                x: Math.random(),
                y: Math.random(),
                r: Math.random(),
                g: Math.random(),
                b: Math.random(),
            });
        }
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = y * canvas.width + x;
                const offset = i * 4;
                const nx = x / canvas.width;
                const ny = y / canvas.height;
                let minDist1 = Infinity;
                let minDist2 = Infinity;
                let closest1 = null;
                let closest2 = null;
                for (const cell of cells) {
                    const dx = nx - cell.x;
                    const dy = ny - cell.y;
                    const dist = dx * dx + dy * dy;
                    if (dist < minDist1) {
                        minDist2 = minDist1;
                        closest2 = closest1;
                        minDist1 = dist;
                        closest1 = cell;
                    } else if (dist < minDist2) {
                        minDist2 = dist;
                        closest2 = cell;
                    }
                }
                const epsilon = 0.0001;
                const weight1 = 1 / (minDist1 + epsilon);
                const weight2 = 1 / (minDist2 + epsilon);
                const totalWeight = weight1 + weight2;
                const t1 = weight1 / totalWeight;
                const t2 = weight2 / totalWeight;
                const r = closest1.r * t1 + closest2.r * t2;
                const g = closest1.g * t1 + closest2.g * t2;
                const b = closest1.b * t1 + closest2.b * t2;
                data[offset] = Math.round(r * 255);
                data[offset + 1] = Math.round(g * 255);
                data[offset + 2] = Math.round(b * 255);
                data[offset + 3] = 255;
            }
        }
    } else if (mode === "perlin") {
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = y * canvas.width + x;
                const offset = i * 4;
                const nx = x / canvas.width * 4;
                const ny = y / canvas.height * 4;
                const r = (noise2D(nx, ny) + 1) / 2;
                const g = (noise2D(nx + 100, ny + 50) + 1) / 2;
                const b = (noise2D(nx + 200, ny + 150) + 1) / 2;
                data[offset] = Math.round(r * 255);
                data[offset + 1] = Math.round(g * 255);
                data[offset + 2] = Math.round(b * 255);
                data[offset + 3] = 255;
            }
        }
    } else if (mode === "mosaic") {
        const tileSize = 30;
        for (let ty = 0; ty < canvas.height; ty += tileSize) {
            for (let tx = 0; tx < canvas.width; tx += tileSize) {
                const tr = Math.random();
                const tg = Math.random();
                const tb = Math.random();
                for (let y = ty; y < Math.min(ty + tileSize, canvas.height); y++) {
                    for (let x = tx; x < Math.min(tx + tileSize, canvas.width); x++) {
                        const i = y * canvas.width + x;
                        const offset = i * 4;
                        const noise = (Math.random() - 0.5) * 20;
                        data[offset] = Math.max(0, Math.min(255, Math.round(tr * 255) + noise));
                        data[offset + 1] = Math.max(0, Math.min(255, Math.round(tg * 255) + noise));
                        data[offset + 2] = Math.max(0, Math.min(255, Math.round(tb * 255) + noise));
                        data[offset + 3] = 255;
                    }
                }
            }
        }
    } else if (mode === "bijection") {
        for (let y = 0; y < canvas.height; y++) {
            for (let x = 0; x < canvas.width; x++) {
                const i = y * canvas.width + x;
                const offset = i * 4;
                const nx = x / canvas.width;
                const ny = y / canvas.height;
                const t = (nx + ny) / 2;
                let r, g, b;
                if (t < 1 / 7) {
                    r = 7 * t; g = 0; b = 0;
                } else if (t < 2 / 7) {
                    r = 1; g = 7 * (t - 1 / 7); b = 0;
                } else if (t < 3 / 7) {
                    r = 1 - 7 * (t - 2 / 7); g = 1; b = 0;
                } else if (t < 4 / 7) {
                    r = 0; g = 1; b = 7 * (t - 3 / 7);
                } else if (t < 5 / 7) {
                    r = 0; g = 1 - 7 * (t - 4 / 7); b = 1;
                } else if (t < 6 / 7) {
                    r = 7 * (t - 5 / 7); g = 0; b = 1;
                } else {
                    r = 1; g = 7 * (t - 6 / 7); b = 1;
                }
                data[offset] = Math.round(r * 255);
                data[offset + 1] = Math.round(g * 255);
                data[offset + 2] = Math.round(b * 255);
                data[offset + 3] = 255;
            }
        }
    } else {
        const r = vanDerCorput(numPixels, 2);
        const g = vanDerCorput(numPixels, 3);
        const b = vanDerCorput(numPixels, 5);

        for (let i = 0; i < numPixels; i++) {
            const offset = i * 4;
            data[offset] = Math.round(r[i] * 255);
            data[offset + 1] = Math.round(g[i] * 255);
            data[offset + 2] = Math.round(b[i] * 255);
            data[offset + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const A = p[X] + Y;
    const B = p[X + 1] + Y;
    return lerp(v, lerp(u, grad(p[A], x, y), grad(p[B], x - 1, y)), lerp(u, grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1)));
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(t, a, b) { return a + t * (b - a); }
function grad(hash, x, y) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

const p = new Uint8Array(512);
for (let i = 0; i < 256; i++) p[i] = i;
for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
}
for (let i = 0; i < 256; i++) p[256 + i] = p[i];

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = function hue2rgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [r, g, b];
}

function createRandomImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 480;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    const data = imageData.data;
    const numPixels = canvas.width * canvas.height;

    const scale = 6;
    const lowWidth = Math.max(1, Math.floor(canvas.width / scale));
    const lowHeight = Math.max(1, Math.floor(canvas.height / scale));
    const lowPixels = lowWidth * lowHeight;
    const lowData = new Uint8Array(lowPixels * 4);

    for (let i = 0; i < lowPixels; i++) {
        const offset = i * 4;
        lowData[offset] = Math.round(Math.random() * 255);
        lowData[offset + 1] = Math.round(Math.random() * 255);
        lowData[offset + 2] = Math.round(Math.random() * 255);
        lowData[offset + 3] = 255;
    }

    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const i = y * canvas.width + x;
            const offset = i * 4;
            const lowX = Math.min(lowWidth - 1, Math.floor(x / scale));
            const lowY = Math.min(lowHeight - 1, Math.floor(y / scale));
            const lowIndex = lowY * lowWidth + lowX;
            const lowOffset = lowIndex * 4;
            const noise = (Math.random() - 0.5) * 30;
            data[offset] = Math.max(0, Math.min(255, lowData[lowOffset] + noise));
            data[offset + 1] = Math.max(0, Math.min(255, lowData[lowOffset + 1] + noise));
            data[offset + 2] = Math.max(0, Math.min(255, lowData[lowOffset + 2] + noise));
            data[offset + 3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

window.CAGEColorPatterns = {
    create: createDefaultImage,
    createRandom: createRandomImage,
};
