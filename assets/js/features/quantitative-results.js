/**
 * Quantitative Results — checkpoint download interaction.
 *
 * Enhances every "+Ours" metric cell (tr.mine:not(.delta) > td:not(:first-child))
 * with an external-link icon and a hover-driven slide animation: the metric
 * slides out and a "get ckpt. & results" button slides in.  The button either
 * links to a download URL (read from a JSON file keyed by "method|dataset") or
 * shows "coming soon" when no URL is available.
 */

const CAGEQuantResults = (() => {
    const ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`;
    const DOWNLOAD_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;

    let linkMap = null;

    async function loadLinks() {
        if (linkMap !== null) return linkMap;
        try {
            const res = await fetch("assets/data/checkpoint-links.json", { cache: "no-cache" });
            linkMap = await res.json();
        } catch (err) {
            console.warn("[CAGEQuantResults] Failed to load checkpoint-links.json:", err);
            linkMap = {};
        }
        return linkMap;
    }

    function buildButton(method, dataset) {
        const key = `${method}|${dataset}`;
        const url = (linkMap && linkMap[key]) || "";

        if (url) {
            const a = document.createElement("a");
            a.className = "ckpt-btn";
            a.href = url;
            a.target = "_blank";
            a.rel = "noopener";
            a.innerHTML = `${DOWNLOAD_SVG}get ckpt. &amp; results`;
            return a;
        }

        const span = document.createElement("span");
        span.className = "ckpt-btn ckpt-soon";
        span.textContent = "coming soon";
        return span;
    }

    function buildIcon() {
        const wrap = document.createElement("span");
        wrap.className = "ckpt-icon";
        wrap.innerHTML = ICON_SVG;
        return wrap;
    }

    function enhanceCell(td, method, dataset) {
        if (td.dataset.ckptReady) return;

        // Wrap existing content in .ckpt-metric
        const metric = document.createElement("span");
        metric.className = "ckpt-metric";
        while (td.firstChild) metric.appendChild(td.firstChild);

        td.appendChild(metric);
        td.appendChild(buildIcon());
        td.appendChild(buildButton(method, dataset));

        td.dataset.ckptReady = "1";
    }

    function init() {
        const tables = document.querySelectorAll("#results table.results");

        tables.forEach((table) => {
            const headers = Array.from(table.querySelectorAll("thead th")).slice(1).map((th) => th.textContent.trim());
            const oursRows = table.querySelectorAll("tbody tr.mine:not(.delta)");

            oursRows.forEach((tr) => {
                const firstTd = tr.querySelector("td");
                if (!firstTd) return;
                const method = firstTd.textContent.trim();
                const metricTds = Array.from(tr.querySelectorAll("td")).slice(1);

                metricTds.forEach((td, i) => {
                    const dataset = headers[i] || `col${i + 1}`;
                    enhanceCell(td, method, dataset);
                });
            });
        });
    }

    async function initAsync() {
        await loadLinks();
        init();
    }

    return { init: initAsync };
})();

window.CAGEQuantResults = CAGEQuantResults;
