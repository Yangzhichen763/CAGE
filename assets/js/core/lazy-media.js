const observed = new WeakSet();

function revealImage(img) {
    if (img.dataset.src) {
        img.src = img.dataset.src;
        delete img.dataset.src;
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
    }
    markState(img, "is-loaded");
}

function showMediaFallback(img) {
    const placeholder = img.nextElementSibling;
    if (placeholder?.classList.contains("img-placeholder")) {
        img.style.visibility = "hidden";
        placeholder.style.display = "flex";
        const filename = placeholder.querySelector(".filename");
        const label = placeholder.querySelector(".label");
        if (filename) filename.textContent = img.dataset.placeholderFile || "image.png";
        if (label) label.textContent = img.dataset.placeholderLabel || img.alt || "Image unavailable";
    }
    markState(img, "is-error");
}

function showLoadingPlaceholder(img) {
    const placeholder = img.nextElementSibling;
    if (placeholder?.classList.contains("img-placeholder")) {
        img.style.visibility = "hidden";
        placeholder.style.display = "flex";
        
        const icon = placeholder.querySelector(".icon");
        if (icon) {
            icon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        
        const filename = placeholder.querySelector(".filename");
        if (filename) filename.textContent = "Loading...";
        
        const label = placeholder.querySelector(".label");
        if (label) label.textContent = "";
    }
}

const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const target = entry.target;
                if (target.tagName === "IMG") {
                    showLoadingPlaceholder(target);
                }
                revealImage(target);
                observer.unobserve(target);
            });
        },
        { rootMargin: "600px 0px", threshold: 0.01 },
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
            if (media.tagName === "IMG") {
                showLoadingPlaceholder(media);
            }
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
