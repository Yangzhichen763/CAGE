(function () {
    "use strict";

    const MEDIA_CONFIG = window.CAGE_CONFIG?.media || {};
    const MAX_CACHE_ENTRIES = Math.max(8, Number(MEDIA_CONFIG.imageCacheEntries) || 36);
    const entries = new Map();
    let accessCounter = 0;

    // Preview support: probed once on first use. When the server doesn't
    // support ?preview=1 (returns 404), we stop trying for subsequent images.
    let previewSupported = null;

    function ensureSpinner(icon) {
        if (!icon) return;
        if (icon.dataset.cageSpinner === "true" && icon.querySelector(".fa-spinner")) return;
        icon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        icon.dataset.cageSpinner = "true";
    }

    function clearSpinnerMarker(icon) {
        if (!icon) return;
        delete icon.dataset.cageSpinner;
    }

    function notify(entry, progress) {
        entry.progress = progress;
        entry.listeners.forEach(function (listener) {
            try {
                listener(progress);
            } catch (_) {}
        });
    }

    function touch(entry) {
        entry.lastAccess = ++accessCounter;
    }

    function evictReadyEntries() {
        const readyEntries = Array.from(entries.entries())
            .filter(function ([, entry]) { return entry.state === "ready"; })
            .sort(function (left, right) { return left[1].lastAccess - right[1].lastAccess; });

        while (readyEntries.length > MAX_CACHE_ENTRIES) {
            const [source, entry] = readyEntries.shift();
            if (entry.objectUrl) {
                URL.revokeObjectURL(entry.objectUrl);
            }
            entries.delete(source);
        }
    }

    // Fetch the image as a Blob with reliable streaming progress via the
    // Fetch API's ReadableStream. Unlike Image() progress events (which are
    // not supported on mobile Safari and many other browsers), this works
    // universally and gives the user a real numeric percentage.
    async function fetchImageBlob(source, onProgress) {
        const response = await fetch(source, { cache: "force-cache" });
        if (!response.ok) throw new Error("Image request failed: " + source);

        const total = Number.parseInt(response.headers.get("content-length") || "0", 10);
        if (!response.body || !Number.isFinite(total) || total <= 0) {
            const blob = await response.blob();
            onProgress?.(100);
            return blob;
        }

        let loaded = 0;
        const chunks = [];
        const reader = response.body.getReader();
        while (true) {
            const result = await reader.read();
            if (result.done) break;
            chunks.push(result.value);
            loaded += result.value.byteLength;
            onProgress?.(Math.max(0, Math.min(100, (loaded / total) * 100)));
        }
        onProgress?.(100);
        return new Blob(chunks, { type: response.headers.get("content-type") || "image/png" });
    }

    // Try to fetch a tiny low-quality JPEG preview (?preview=1) from the
    // server. If the server doesn't support preview generation (returns 404),
    // we cache that fact and stop probing. The preview is shown immediately
    // via the onPreview callback while the full image continues downloading.
    function tryLoadPreview(source, onPreview) {
        if (previewSupported === false) return;

        const separator = source.includes("?") ? "&" : "?";
        const previewSrc = source + separator + "preview=1";

        fetch(previewSrc, { cache: "force-cache" })
            .then(function (res) {
                if (res.status === 404) {
                    previewSupported = false;
                    return null;
                }
                if (!res.ok) return null;
                previewSupported = true;
                return res.blob();
            })
            .then(function (blob) {
                if (!blob) return;
                // Skip if the full image already arrived.
                const entry = entries.get(source);
                if (entry && entry.state === "ready") return;
                const url = URL.createObjectURL(blob);
                try { onPreview(url); } catch (_) {}
            })
            .catch(function () {
                /* network error — leave previewSupported unknown and try next time */
            });
    }

    function get(source) {
        const entry = entries.get(source);
        if (!entry || entry.state !== "ready") return "";
        touch(entry);
        return entry.objectUrl || "";
    }

    function createRequest(source) {
        const entry = {
            source: source,
            state: "loading",
            progress: null,
            listeners: new Set(),
            lastAccess: ++accessCounter,
            promise: null,
            objectUrl: "",
        };

        entry.promise = fetchImageBlob(source, function (progress) {
            notify(entry, progress);
        }).then(function (blob) {
            entry.objectUrl = URL.createObjectURL(blob);
            entry.state = "ready";
            touch(entry);
            notify(entry, 100);
            evictReadyEntries();
            return {
                source: source,
                url: entry.objectUrl,
                fromCache: false,
            };
        }).catch(function (error) {
            if (entries.get(source) === entry) entries.delete(source);
            throw error;
        });

        entries.set(source, entry);
        return entry;
    }

    function load(source, options) {
        const opts = options || {};
        if (!source) return Promise.reject(new Error("Image source is empty"));

        let entry = entries.get(source);
        if (entry && entry.state === "ready") {
            touch(entry);
            if (typeof opts.onProgress === "function") {
                queueMicrotask(function () { opts.onProgress(100); });
            }
            return Promise.resolve({
                source: source,
                url: entry.objectUrl,
                fromCache: true,
            });
        }

        if (!entry) {
            entry = createRequest(source);

            // Progressive loading: ask the server for a tiny preview first.
            if (typeof opts.onPreview === "function") {
                tryLoadPreview(source, opts.onPreview);
            }
        }
        touch(entry);

        const listener = typeof opts.onProgress === "function" ? opts.onProgress : null;
        if (listener) {
            entry.listeners.add(listener);
            if (entry.progress !== null) {
                queueMicrotask(function () { listener(entry.progress); });
            }
        }

        return entry.promise.finally(function () {
            if (listener) entry.listeners.delete(listener);
        });
    }

    function preload(source) {
        return load(source).then(function () { return true; }).catch(function () { return false; });
    }

    function clear() {
        entries.forEach(function (entry) {
            if (entry.objectUrl) {
                URL.revokeObjectURL(entry.objectUrl);
            }
        });
        entries.clear();
    }

    function ensureLoadingUI(container) {
        if (!container) return null;
        container.classList.add("cage-loading-surface");

        let icon = container.querySelector(".icon");
        if (!icon) {
            icon = document.createElement("div");
            icon.className = "icon";
            container.prepend(icon);
        }

        let title = container.querySelector(".filename, .cage-loading-title");
        if (!title) {
            title = document.createElement("div");
            title.className = "filename cage-loading-title";
            icon.after(title);
        }

        let progressBar = container.querySelector(".progress-bar, .cage-loading-progress");
        if (!progressBar) {
            progressBar = document.createElement("div");
            progressBar.className = "progress-bar cage-loading-progress";
            const fill = document.createElement("div");
            fill.className = "progress-bar-fill cage-loading-progress-fill";
            progressBar.appendChild(fill);
            title.after(progressBar);
        }

        let value = container.querySelector(".label, .progress-text, .cage-loading-value");
        if (!value) {
            value = document.createElement("div");
            value.className = "label cage-loading-value";
            progressBar.after(value);
        }

        return {
            icon: icon,
            title: title,
            progressBar: progressBar,
            fill: progressBar.querySelector(".progress-bar-fill, .cage-loading-progress-fill"),
            value: value,
        };
    }

    function setLoadingUI(container, progress, options) {
        const ui = ensureLoadingUI(container);
        if (!ui) return;
        const opts = options || {};
        ensureSpinner(ui.icon);
        container.classList.remove("is-error");
        container.classList.add("is-loading");
        container.style.display = opts.display || "flex";
        ui.title.textContent = opts.title || "Loading...";

        const bounded = Number.isFinite(progress)
            ? Math.max(0, Math.min(100, Number(progress)))
            : null;
        if (ui.fill) ui.fill.style.width = bounded === null ? "0%" : bounded + "%";
        if (ui.progressBar) ui.progressBar.classList.toggle("is-indeterminate", bounded === null);
        ui.value.textContent = bounded === null
            ? (opts.indeterminateText || "Receiving image...")
            : Math.round(bounded) + "%";
    }

    function setLoadingErrorUI(container, options) {
        const ui = ensureLoadingUI(container);
        if (!ui) return;
        const opts = options || {};
        clearSpinnerMarker(ui.icon);
        ui.icon.innerHTML = '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><rect height="18" rx="2" width="18" x="3" y="3"></rect><circle cx="9" cy="9" r="2"></circle><path d="M21 15l-5-5L5 21"></path></svg>';
        container.classList.remove("is-loading");
        container.classList.add("is-error");
        container.style.display = opts.display || "flex";
        ui.title.textContent = opts.title || "Image unavailable";
        if (ui.fill) ui.fill.style.width = "0%";
        if (ui.progressBar) ui.progressBar.classList.remove("is-indeterminate");
        ui.value.textContent = opts.detail || "Unable to load image";
    }

    window.CAGELoadingUI = {
        ensure: ensureLoadingUI,
        setLoading: setLoadingUI,
        setError: setLoadingErrorUI,
    };

    window.CAGEImageLoader = {
        load: load,
        preload: preload,
        get: get,
        clear: clear,
        ensureSpinner: ensureSpinner,
        clearSpinnerMarker: clearSpinnerMarker,
    };
})();
