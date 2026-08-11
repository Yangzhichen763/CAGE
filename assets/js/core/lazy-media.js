const observed = new WeakSet();
const MEDIA_CONFIG = window.CAGE_CONFIG?.media || {};
const LAZY_ROOT_MARGIN = MEDIA_CONFIG.lazyRootMargin || "1200px 0px";

function ensureSpinner(icon) {
    if (window.CAGEImageLoader?.ensureSpinner) {
        window.CAGEImageLoader.ensureSpinner(icon);
        return;
    }
    if (!icon || icon.querySelector(".fa-spinner")) return;
    icon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
}

function clearSpinnerMarker(icon) {
    window.CAGEImageLoader?.clearSpinnerMarker?.(icon);
}

function updateLoadingPlaceholder(img, progress) {
    const placeholder = img.nextElementSibling;
    if (!placeholder?.classList.contains("img-placeholder")) return;
    img.style.visibility = "hidden";
    placeholder.style.display = "flex";

    if (window.CAGELoadingUI?.setLoading) {
        window.CAGELoadingUI.setLoading(placeholder, progress);
        return;
    }

    const icon = placeholder.querySelector(".icon");
    ensureSpinner(icon);
    const filename = placeholder.querySelector(".filename");
    if (filename) filename.textContent = "Loading...";
    const label = placeholder.querySelector(".label");
    if (label) label.textContent = Number.isFinite(progress) ? Math.round(progress) + "%" : "Receiving image...";
}

async function revealImage(img) {
    if (img.dataset.src) {
        const src = img.dataset.src;
        delete img.dataset.src;

        if (!src) {
            showMediaFallback(img);
            return;
        }

        img.decoding = img.decoding || "async";
        if (window.CAGEImageLoader?.load) {
            try {
                const resource = await window.CAGEImageLoader.load(src, {
                    onProgress: function (progress) {
                        updateLoadingPlaceholder(img, progress);
                    },
                });
                img.src = resource.url;
            } catch (_) {
                showMediaFallback(img);
            }
        } else {
            img.src = src;
        }
    }

    if (img.dataset.srcset) {
        img.srcset = img.dataset.srcset;
        delete img.dataset.srcset;
    }
}

function markState(img, state) {
    img.classList.add(state);
}

function showMedia(img) {
    img.style.display = "block";
    img.style.visibility = "";
    const placeholder = img.nextElementSibling;
    if (placeholder?.classList.contains("img-placeholder")) {
        img.style.padding = "4px";
        placeholder.style.display = "none";
        clearSpinnerMarker(placeholder.querySelector(".icon"));
    }
    markState(img, "is-loaded");
}

function showMediaFallback(img) {
    const placeholder = img.nextElementSibling;
    if (placeholder?.classList.contains("img-placeholder")) {
        img.style.visibility = "hidden";
        placeholder.style.display = "flex";

        const icon = placeholder.querySelector(".icon");
        if (icon) {
            clearSpinnerMarker(icon);
            icon.innerHTML = '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><rect height="18" rx="2" width="18" x="3" y="3"></rect><circle cx="9" cy="9" r="2"></circle><path d="M21 15l-5-5L5 21"></path></svg>';
        }

        const filename = placeholder.querySelector(".filename");
        const label = placeholder.querySelector(".label");
        if (filename) filename.textContent = img.dataset.placeholderFile || "image.png";
        if (label) label.textContent = img.dataset.placeholderLabel || img.alt || "Image unavailable";
    }
    markState(img, "is-error");
}

const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const target = entry.target;
                if (target.tagName === "IMG") updateLoadingPlaceholder(target, null);
                revealImage(target);
                observer.unobserve(target);
            });
        },
        { rootMargin: LAZY_ROOT_MARGIN, threshold: 0.01 },
    )
    : null;

export function observeLazyMedia(root = document) {
    root.querySelectorAll("img[data-src], source[data-srcset]").forEach(media => {
        if (observed.has(media)) return;
        observed.add(media);

        if (media.tagName === "IMG") {
            media.addEventListener("load", () => showMedia(media), { once: true });
            media.addEventListener("error", () => showMediaFallback(media), { once: true });
        }

        if (observer) observer.observe(media);
        else {
            if (media.tagName === "IMG") updateLoadingPlaceholder(media, null);
            revealImage(media);
        }
    });
}

export function initLazyMedia() {
    observeLazyMedia(document);

    const mutationObserver = new MutationObserver(records => {
        records.forEach(record => {
            record.addedNodes.forEach(node => {
                if (!(node instanceof Element)) return;
                if (node.matches?.("img[data-src], source[data-srcset]")) {
                    observeLazyMedia(node.parentElement || document);
                } else {
                    observeLazyMedia(node);
                }
            });
        });
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.CAGELazyMedia = { refresh: observeLazyMedia };
}
