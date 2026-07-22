"use strict";

const viewerState = {
    items: [],
    index: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    startX: 0,
    startY: 0,
};

function resetViewerTransform() {
    viewerState.scale = 1;
    viewerState.offsetX = 0;
    viewerState.offsetY = 0;
    applyViewerTransform();
}

function applyViewerTransform() {
    const viewerImage = document.getElementById("arena-viewer-img");
    if (!viewerImage) return;
    viewerImage.style.transform = `translate(${viewerState.offsetX}px, ${viewerState.offsetY}px) scale(${viewerState.scale})`;
}

function renderViewerImage(resetTransform = false) {
    const viewerImage = document.getElementById("arena-viewer-img");
    const viewerIndex = document.getElementById("arena-viewer-index");
    const item = viewerState.items[viewerState.index];

    if (!viewerImage || !viewerIndex || !item) return;

    viewerImage.src = item.src;
    viewerImage.alt = item.alt;
    viewerIndex.textContent = `${viewerState.index + 1} / ${viewerState.items.length}`;

    if (resetTransform) {
        resetViewerTransform();
    } else {
        applyViewerTransform();
    }
}

function openImageViewerBySource(source, alt = "Image", viewerGroup = "enhanced") {
    const viewer = document.getElementById("arena-image-viewer");
    if (!viewer || !source) return;

    const arenaSection = document.getElementById("gallery");
    if (arenaSection) {
        const rect = arenaSection.getBoundingClientRect();
        viewer.style.top = `${Math.max(0, rect.top)}px`;
        viewer.style.height = `${Math.min(window.innerHeight, rect.height)}px`;
    } else {
        viewer.style.top = "0px";
        viewer.style.height = "100vh";
    }

    const enhancedItems = collectEnhancedViewerItems();

    if (viewerGroup === "input") {
        const inputBox = document.getElementById("arena-input-box");
        const inputItems = [
            {
                src: inputBox?.dataset.inputSrc || "",
                alt: "Low-light Input",
            },
            {
                src: inputBox?.dataset.enlightenedSrc || "",
                alt: "GT-mean Enlightened Input",
            },
        ].filter(function (item) {
            return item.src;
        });

        viewerState.items = [...inputItems, ...enhancedItems];
    } else {
        viewerState.items = enhancedItems;
    }

    let index = viewerState.items.findIndex(function (item) {
        return item.src === source;
    });

    if (index < 0) {
        viewerState.items.push({ src: source, alt });
        index = viewerState.items.length - 1;
    }

    viewerState.index = index;
    renderViewerImage(true);
    viewer.classList.add("active");
}

function collectEnhancedViewerItems() {
    const items = [];
    document.querySelectorAll(".arena-card").forEach((card, index) => {
        const src = card.dataset.src;
        if (src) {
            items.push({
                src: src,
                alt: `Enhanced image ${String.fromCharCode(65 + index)}`,
            });
        } else {
            const wrapper = card.querySelector(".arena-compare-wrapper");
            if (wrapper) {
                items.push({
                    src: wrapper.dataset.afterSrc,
                    alt: `Enhanced image ${String.fromCharCode(65 + index)}`,
                });
            }
        }
    });
    return items;
}

function closeImageViewer() {
    const viewer = document.getElementById("arena-image-viewer");
    viewer.classList.remove("active");
    viewerState.dragging = false;
    document.getElementById("arena-viewer-img")?.classList.remove("is-dragging");
}

function initializeImageViewer() {
    const viewer = document.getElementById("arena-image-viewer");
    const viewerImage = document.getElementById("arena-viewer-img");
    if (!viewer || !viewerImage) return;

    viewer.addEventListener("click", closeImageViewer);
    viewerImage.addEventListener("click", function (e) {
        e.stopPropagation();
    });

    viewer.addEventListener(
        "wheel",
        function (e) {
            e.preventDefault();

            if (e.target === viewer) {
                if (viewerState.items.length <= 1) return;
                const direction = e.deltaY > 0 ? 1 : -1;
                console.log("Wheel direction:", direction);
                viewerState.index =
                    (viewerState.index + direction + viewerState.items.length) % viewerState.items.length;
                renderViewerImage(false);
                return;
            }

            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            viewerState.scale = Math.min(8, Math.max(0.2, viewerState.scale * zoomFactor));
            applyViewerTransform();
        },
        { passive: false },
    );

    viewerImage.addEventListener("mousedown", function (e) {
        if (e.button !== 1) return;
        e.preventDefault();
        e.stopPropagation();
        viewerState.dragging = true;
        viewerState.startX = e.clientX - viewerState.offsetX;
        viewerState.startY = e.clientY - viewerState.offsetY;
        viewerImage.classList.add("is-dragging");
    });

    window.addEventListener("mousemove", function (e) {
        if (!viewerState.dragging) return;
        viewerState.offsetX = e.clientX - viewerState.startX;
        viewerState.offsetY = e.clientY - viewerState.startY;
        applyViewerTransform();
    });

    window.addEventListener("mouseup", function (e) {
        if (e.button === 1) {
            viewerState.dragging = false;
            viewerImage.classList.remove("is-dragging");
        }
    });

    window.addEventListener("keydown", function (e) {
        if (!viewer.classList.contains("active")) return;

        if (e.key === "Escape") {
            closeImageViewer();
        } else if (e.key === "ArrowLeft") {
            viewerState.index =
                (viewerState.index - 1 + viewerState.items.length) % viewerState.items.length;
            renderViewerImage(false);
        } else if (e.key === "ArrowRight") {
            viewerState.index = (viewerState.index + 1) % viewerState.items.length;
            renderViewerImage(false);
        } else if (/^[1-9]$/.test(e.key)) {
            const index = parseInt(e.key) - 1;
            if (index < viewerState.items.length) {
                viewerState.index = index;
                renderViewerImage(true);
            }
        }
    });

    let scrollFrameId;
    window.addEventListener("scroll", function () {
        if (!viewer.classList.contains("active")) return;
        if (scrollFrameId) cancelAnimationFrame(scrollFrameId);
        scrollFrameId = requestAnimationFrame(function () {
            const arenaSection = document.getElementById("image-arena");
            if (arenaSection) {
                const rect = arenaSection.getBoundingClientRect();
                if (rect.bottom < 0 || rect.top > window.innerHeight) {
                    closeImageViewer();
                    return;
                }
                viewer.style.top = `${rect.top}px`;
                viewer.style.height = `${rect.height}px`;
            }
        });
    });
}

window.CAGEArenaViewer = {
    initialize: initializeImageViewer,
    open: openImageViewerBySource,
    close: closeImageViewer,
};
