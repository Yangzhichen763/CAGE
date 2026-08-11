(function () {
    "use strict";

    window.CAGE_CONFIG = {
        media: {
            lazyRootMargin: "1400px 0px",
            optimizedFigureDirectory: "figures/web",
        },
        arena: {
            outputCount: 3,
            cardLabels: ["A", "B", "C"],
            prefetchRounds: 2,
            prefetchDelayMs: 120,
            randomImageMin: 690,
            randomImageMax: 789,
            compareInitialPercentage: 50,
        },
        colorSpace: {
            defaultSourceMode: "normal-light",
            defaultSourceImage: "figures/example_output_00049.png",
            imageBudget: 32000,
            latticeResolution: 32,
            hviDensity: 0.2,
            maxSamplingDimension: 1400,
            loadedCanvasWidth: 720,
            loadedCanvasHeight: 480,
            pointSize: 3,
            slice: {
                min: 0.45,
                max: 0.55,
                step: 0.001,
                canvasWidth: 680,
                canvasHeight: 420,
                popoverWidth: 356,
                horizontalViewportInset: 12,
                anchorGap: 10,
            },
        },
    };
})();
