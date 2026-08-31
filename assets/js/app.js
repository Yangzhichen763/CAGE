import { initLazyMedia } from "./core/lazy-media.js";
import { loadMathJax, loadScript, whenNearViewport } from "./core/feature-loader.js";

async function initColorSpace() {
    const colorSpace = document.querySelector('[data-feature="color-space"]');
    if (!colorSpace) return;
    
    colorSpace.dataset.featureState = "loading";
    try {
        await loadMathJax();
        await loadScript("assets/js/features/color-spaces.js");
        await loadScript("assets/js/features/point-cloud-viewer.js");
        await loadScript("assets/js/features/color-patterns.js");
        await loadScript("assets/js/features/color-space-atlas.js");
        window.CAGEColorSpaceAtlas?.init();
        colorSpace.dataset.featureState = "ready";
        colorSpace.dispatchEvent(new CustomEvent("cage:feature-ready", { bubbles: true }));
    } catch (error) {
        colorSpace.dataset.featureState = "error";
        console.error(error);
    }
}

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

    const results = document.querySelector('[data-feature="results"], #results');
    whenNearViewport(results, async () => {
        await loadScript("assets/js/features/quantitative-results.js");
        window.CAGEQuantResults?.init();
    });

    initColorSpace();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFeatureLoading, { once: true });
} else {
    initFeatureLoading();
}
