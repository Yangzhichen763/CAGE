import { initLazyMedia } from "./core/lazy-media.js";
import { loadMathJax, loadScript, whenNearViewport } from "./core/feature-loader.js";

function initFeatureLoading() {
    initLazyMedia();

    const arena = document.querySelector('[data-feature="arena"]');
    whenNearViewport(arena, async () => {
        await loadScript("assets/js/features/arena-viewer.js");
        await loadScript("assets/js/features/fireworks.js");
        await loadScript("assets/js/features/arena.js");
        await window.CAGEArena?.init();
    });

    const method = document.querySelector('[data-feature="method"]');
    whenNearViewport(method, async () => {
        await loadMathJax();
        await loadScript("assets/js/features/method.js");
        window.CAGELazyMedia?.refresh(method);
    });

    const colorSpace = document.querySelector('[data-feature="color-space"]');
    whenNearViewport(colorSpace, async () => {
        await loadMathJax();
        await loadScript("assets/js/features/color-spaces.js");
        await loadScript("assets/js/features/point-cloud-viewer.js");
        await loadScript("assets/js/features/color-patterns.js");
        await loadScript("assets/js/features/color-space-atlas.js");
        window.CAGEColorSpaceAtlas?.init();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFeatureLoading, { once: true });
} else {
    initFeatureLoading();
}
