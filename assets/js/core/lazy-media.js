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
        img.style.display = "none";
        placeholder.style.display = "flex";
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
        else revealImage(media);
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
