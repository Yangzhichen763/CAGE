const scriptPromises = new Map();

export function loadScript(src, options = {}) {
    if (scriptPromises.has(src)) return scriptPromises.get(src);

    const promise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-runtime-src="${CSS.escape(src)}"]`);
        if (existing) {
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", reject, { once: true });
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = false;
        script.dataset.runtimeSrc = src;
        if (options.crossOrigin) script.crossOrigin = options.crossOrigin;
        if (options.referrerPolicy) script.referrerPolicy = options.referrerPolicy;
        script.addEventListener("load", resolve, { once: true });
        script.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
        document.head.appendChild(script);
    });

    scriptPromises.set(src, promise);
    return promise;
}

let mathJaxPromise;
export function loadMathJax() {
    if (window.MathJax?.typesetPromise) return Promise.resolve(window.MathJax);
    if (!mathJaxPromise) {
        mathJaxPromise = loadScript("assets/js/vendor/mathjax-config.js")
            .then(() => loadScript("https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"))
            .then(() => window.MathJax);
    }
    return mathJaxPromise;
}

export function whenNearViewport(target, loader, options = {}) {
    if (!target) return;
    let started = false;

    const start = async () => {
        if (started) return;
        started = true;
        target.dataset.featureState = "loading";
        try {
            await loader();
            target.dataset.featureState = "ready";
            target.dispatchEvent(new CustomEvent("cage:feature-ready", { bubbles: true }));
        } catch (error) {
            target.dataset.featureState = "error";
            console.error(error);
            const errorBox = document.createElement("p");
            errorBox.className = "feature-load-error";
            errorBox.textContent = "This interactive module could not be loaded. Open the browser console for details.";
            target.prepend(errorBox);
        }
    };

    if (!("IntersectionObserver" in window)) {
        start();
        return;
    }

    const observer = new IntersectionObserver(
        entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            observer.disconnect();
            start();
        },
        { rootMargin: options.rootMargin || "800px 0px", threshold: 0.01 },
    );
    observer.observe(target);
}
