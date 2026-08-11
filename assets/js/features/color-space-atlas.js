(function () {
    "use strict";

    const COLOR_CONFIG = Object.assign({
        defaultSourceMode: "normal-light",
        defaultSourceImage: "figures/example_output_00049.png",
        imageBudget: 32000,
        latticeResolution: 32,
        hviDensity: 0.2,
        maxSamplingDimension: 1400,
        loadedCanvasWidth: 720,
        loadedCanvasHeight: 480,
        pointSize: 3,
    }, window.CAGE_CONFIG?.colorSpace || {});
    const SLICE_CONFIG = Object.assign({
        min: 0.45,
        max: 0.55,
        step: 0.001,
        canvasWidth: 680,
        canvasHeight: 420,
        popoverWidth: 356,
        horizontalViewportInset: 12,
        anchorGap: 10,
    }, COLOR_CONFIG.slice || {});
    const DEFAULT_SOURCE_MODE = COLOR_CONFIG.defaultSourceMode;
    const DEFAULT_SOURCE_IMAGE = COLOR_CONFIG.defaultSourceImage;
    const DEFAULT_SOURCE_NAME = DEFAULT_SOURCE_IMAGE.split("/").pop();

    const state = {
        space: "RGB",
        hsvProjection: "cylindrical",
        hviDensity: COLOR_CONFIG.hviDensity,
        labProjection: "cylindrical",
        normalizeRange: true,
        imageBudget: COLOR_CONFIG.imageBudget,
        latticeResolution: COLOR_CONFIG.latticeResolution,
        imageRGB: null,
        imageLinearColors: null,
        latticeRGB: null,
        latticeLinearColors: null,
        imageWidth: 0,
        imageHeight: 0,
        imageName: DEFAULT_SOURCE_NAME,
        renderToken: 0,
    };

    const elements = {};
    let imageViewer;
    let latticeViewer;
    let updateTimer = null;
    const randomModes = ["image-random", "random", "gaussian", "perlin", "fractal", "turbulence", "voronoi", "cellular", "mosaic"];
    let isInitializing = true;
    const sharedSliceRange = { min: SLICE_CONFIG.min, max: SLICE_CONFIG.max };
    const sliceStates = {
        image: { enabled: false },
        lattice: { enabled: false },
    };
    const sliceDatasets = { image: null, lattice: null };
    let activeSliceKind = null;
    let sliceUI = null;
    let slicePreviewFrame = 0;
    let sliceWindowDrag = null;
    let slicePopoverDrag = null;
    let slicePositionFrame = 0;
    let sliceSectionObserver = null;
    let colorImageLoadToken = 0;
    const slicePopoverOffsets = {
        image: { x: 0, y: 0, userPlaced: false },
        lattice: { x: 0, y: 0, userPlaced: false },
    };

    function selectElements() {
        const ids = [
            "imageInput",
            "dropZone",
            "previewCanvas",
            "colorInputLoading",
            "imageMeta",
            "spaceTabs",
            "patternMode",
            "rerandomBtn",
            "imageBudget",
            "latticeResolution",
            "hsvProjectionField",
            "hsvProjection",
            "hviDensityField",
            "hviDensity",
            "hviDensityValue",
            "labProjectionField",
            "labProjection",
            "normalizeRange",
            "autoRotate",
            "showFrame",
            "showAxes",
            "resetView",
            "latticeResolutionHint",
            "spaceTitle",
            "axisChips",
            "spaceDescription",
            "formulaToggle",
            "conversionGrid",
            "spaceFormulaForward",
            "spaceFormulaInverse",
            "forwardSpaceName",
            "inverseSpaceName",
            "imagePointCount",
            "latticePointCount",
            "imageViewer",
            "latticeViewer",
            "imageAxisGizmo",
            "latticeAxisGizmo",
            "imageLightbox",
            "lightboxImage",
        ];
        ids.forEach(function (id) {
            elements[id] = document.getElementById(id);
        });

        const requiredIds = [
            "imageInput",
            "dropZone",
            "previewCanvas",
            "imageMeta",
            "spaceTabs",
            "patternMode",
            "imageBudget",
            "latticeResolution",
            "normalizeRange",
            "autoRotate",
            "showFrame",
            "showAxes",
            "imageViewer",
            "latticeViewer",
            "imageAxisGizmo",
            "latticeAxisGizmo",
            "formulaToggle",
            "conversionGrid",
        ];
        const missingIds = requiredIds.filter(function (id) {
            return !elements[id];
        });
        if (missingIds.length > 0) {
            throw new Error("Missing Color Space elements: " + missingIds.join(", "));
        }

        if (typeof window.PointCloudViewer !== "function") {
            throw new Error("PointCloudViewer is unavailable.");
        }
        if (!window.ColorSpaces) {
            throw new Error("ColorSpaces is unavailable.");
        }
        if (typeof window.createDefaultImage !== "function") {
            throw new Error("Color pattern generator is unavailable.");
        }
    }

    function setStatus(message) {
        if (elements.statusText) {
            elements.statusText.textContent = message;
        }
    }

    function formatCount(value) {
        return new Intl.NumberFormat("en-US").format(value) + " pts.";
    }


    function clampSliceValue(value) {
        return Math.min(1, Math.max(0, Number(value) || 0));
    }

    function getSliceViewer(kind) {
        return kind === "image" ? imageViewer : latticeViewer;
    }

    function getSliceStage(kind) {
        return kind === "image" ? elements.imageViewer : elements.latticeViewer;
    }

    function getSliceCountElement(kind) {
        return kind === "image" ? elements.imagePointCount : elements.latticePointCount;
    }

    function getSliceTitle(kind) {
        return kind === "image" ? "Image Brightness Slice" : "Gamut Brightness Slice";
    }

    function isSlicePopoverOpen() {
        return Boolean(sliceUI && sliceUI.popover.classList.contains("is-open"));
    }

    function getSliceAnchorPosition(kind, panelWidth, panelHeight) {
        const button = sliceUI?.buttons?.[kind];
        if (!button) return null;

        const buttonRect = button.getBoundingClientRect();
        const anchorGap = Math.max(0, Number(SLICE_CONFIG.anchorGap) || 10);

        // Keep the floating panel geometrically attached to the toggle.
        // Do not clamp it to the viewport: when the page moves, the panel moves
        // by exactly the same amount as the active Mapping toggle.
        return {
            left: buttonRect.right - panelWidth,
            top: buttonRect.top - anchorGap - panelHeight,
        };
    }

    function positionSlicePopover() {
        if (!sliceUI || !activeSliceKind) return;

        const panelWidth = Math.max(1, Number(SLICE_CONFIG.popoverWidth) || 356);
        sliceUI.popover.style.width = panelWidth + "px";
        sliceUI.popover.style.maxHeight = "none";

        const panelHeight = Math.max(1, sliceUI.popover.getBoundingClientRect().height);
        const anchor = getSliceAnchorPosition(activeSliceKind, panelWidth, panelHeight);
        if (!anchor) return;

        const offset = slicePopoverOffsets[activeSliceKind];
        const left = anchor.left + (offset?.userPlaced ? offset.x : 0);
        const top = anchor.top + (offset?.userPlaced ? offset.y : 0);

        sliceUI.popover.style.left = left + "px";
        sliceUI.popover.style.top = top + "px";
    }

    function scheduleSlicePopoverPosition() {
        if (slicePositionFrame) cancelAnimationFrame(slicePositionFrame);
        slicePositionFrame = requestAnimationFrame(function () {
            slicePositionFrame = 0;
            positionSlicePopover();
        });
    }

    function getBrightnessAxisMeta() {
        if (state.space === "RGB") {
            return {
                label: "RGB diagonal brightness axis",
                detail: "(0, 0, 0) → (1, 1, 1)",
                horizontalX: "Chroma u",
                horizontalY: "Chroma v",
            };
        }

        const info = ColorSpaces.getSpaceInfo(state.space, currentTransformOptions());
        const verticalAxis = info.axes[1] || "Lightness";
        return {
            label: info.displayName + " vertical brightness axis",
            detail: verticalAxis + " ∈ [0, 1]",
            horizontalX: info.axes[0] || "x",
            horizontalY: info.axes[2] || "z",
        };
    }

    function computeSliceProjectionBounds(coordinateDomain) {
        if (!coordinateDomain) {
            return null;
        }

        let minU = Infinity;
        let maxU = -Infinity;
        let minV = Infinity;
        let maxV = -Infinity;

        if (state.space === "RGB") {
            const xValues = [coordinateDomain.min[0], coordinateDomain.max[0]];
            const yValues = [coordinateDomain.min[1], coordinateDomain.max[1]];
            const zValues = [coordinateDomain.min[2], coordinateDomain.max[2]];

            xValues.forEach(function (x) {
                yValues.forEach(function (y) {
                    zValues.forEach(function (z) {
                        const projectedU = (x - z) / Math.sqrt(2);
                        const projectedV = (x + z - 2 * y) / Math.sqrt(6);
                        if (projectedU < minU) minU = projectedU;
                        if (projectedU > maxU) maxU = projectedU;
                        if (projectedV < minV) minV = projectedV;
                        if (projectedV > maxV) maxV = projectedV;
                    });
                });
            });
        } else {
            minU = coordinateDomain.min[0];
            maxU = coordinateDomain.max[0];
            minV = coordinateDomain.min[2];
            maxV = coordinateDomain.max[2];
        }

        if (![minU, maxU, minV, maxV].every(Number.isFinite)) {
            return null;
        }
        if (Math.abs(maxU - minU) < 1e-8) {
            minU -= 0.5;
            maxU += 0.5;
        }
        if (Math.abs(maxV - minV) < 1e-8) {
            minV -= 0.5;
            maxV += 0.5;
        }

        return {
            minU: minU,
            maxU: maxU,
            minV: minV,
            maxV: maxV,
        };
    }

    function computeBrightnessBuffer(rgbBuffer, transformedCoordinates) {
        const count = Math.floor(rgbBuffer.length / 3);
        const brightness = new Float32Array(count);

        for (let index = 0; index < count; index += 1) {
            const offset = index * 3;
            const r = rgbBuffer[offset];
            const g = rgbBuffer[offset + 1];
            const b = rgbBuffer[offset + 2];
            let value;

            if (state.space === "RGB") {
                value = (r + g + b) / 3;
            } else if (state.space === "HSV" || state.space === "HVI") {
                value = Math.max(r, g, b);
            } else {
                value = transformedCoordinates[offset + 1];
            }

            brightness[index] = clampSliceValue(value);
        }

        return brightness;
    }

    function buildBrightnessHistogram(brightness) {
        const binCount = 1000;
        const bins = new Uint32Array(binCount + 1);
        for (let index = 0; index < brightness.length; index += 1) {
            const bin = Math.min(binCount, Math.max(0, Math.round(brightness[index] * binCount)));
            bins[bin] += 1;
        }

        const prefix = new Uint32Array(binCount + 2);
        for (let index = 0; index <= binCount; index += 1) {
            prefix[index + 1] = prefix[index] + bins[index];
        }
        return { binCount: binCount, prefix: prefix };
    }

    function countBrightnessRange(dataset, minValue, maxValue) {
        if (!dataset || !dataset.histogram) return 0;
        const histogram = dataset.histogram;
        const lower = Math.min(
            histogram.binCount,
            Math.max(0, Math.ceil(clampSliceValue(minValue) * histogram.binCount - 1e-8)),
        );
        const upper = Math.min(
            histogram.binCount,
            Math.max(lower, Math.floor(clampSliceValue(maxValue) * histogram.binCount + 1e-8)),
        );
        return histogram.prefix[upper + 1] - histogram.prefix[lower];
    }

    function buildSlicePreviewData(rgbBuffer, displayCoordinates, brightness, projectionBounds) {
        const totalCount = Math.floor(rgbBuffer.length / 3);
        const u = new Float32Array(totalCount);
        const v = new Float32Array(totalCount);
        const lightness = new Float32Array(totalCount);
        const colors = new Uint8ClampedArray(totalCount * 3);
        let minU = Infinity;
        let maxU = -Infinity;
        let minV = Infinity;
        let maxV = -Infinity;

        // Keep every point from the current 3D mapping dataset. The slice preview
        // does not apply a second sampling limit, so its visual density matches the
        // Image 3D Mapping or Gamut 3D Mapping data used for the current view.
        for (let index = 0; index < totalCount; index += 1) {
            const offset = index * 3;
            const x = displayCoordinates[offset];
            const y = displayCoordinates[offset + 1];
            const z = displayCoordinates[offset + 2];
            let projectedU;
            let projectedV;

            if (state.space === "RGB") {
                projectedU = (x - z) / Math.sqrt(2);
                projectedV = (x + z - 2 * y) / Math.sqrt(6);
            } else {
                projectedU = x;
                projectedV = z;
            }

            u[index] = projectedU;
            v[index] = projectedV;
            lightness[index] = brightness[index];
            colors[offset] = Math.round(clampSliceValue(rgbBuffer[offset]) * 255);
            colors[offset + 1] = Math.round(clampSliceValue(rgbBuffer[offset + 1]) * 255);
            colors[offset + 2] = Math.round(clampSliceValue(rgbBuffer[offset + 2]) * 255);

            if (projectedU < minU) minU = projectedU;
            if (projectedU > maxU) maxU = projectedU;
            if (projectedV < minV) minV = projectedV;
            if (projectedV > maxV) maxV = projectedV;
        }

        if (
            projectionBounds &&
            [
                projectionBounds.minU,
                projectionBounds.maxU,
                projectionBounds.minV,
                projectionBounds.maxV,
            ].every(Number.isFinite)
        ) {
            minU = projectionBounds.minU;
            maxU = projectionBounds.maxU;
            minV = projectionBounds.minV;
            maxV = projectionBounds.maxV;
        } else {
        if (!Number.isFinite(minU) || !Number.isFinite(maxU)) {
            minU = -1;
            maxU = 1;
            minV = -1;
            maxV = 1;
        }
        if (Math.abs(maxU - minU) < 1e-8) {
            minU -= 0.5;
            maxU += 0.5;
        }
        if (Math.abs(maxV - minV) < 1e-8) {
            minV -= 0.5;
            maxV += 0.5;
            }
        }

        const brightnessDrawOrder = new Uint32Array(totalCount);
        for (let index = 0; index < totalCount; index += 1) {
            brightnessDrawOrder[index] = index;
        }
        brightnessDrawOrder.sort(function (leftIndex, rightIndex) {
            const brightnessDelta = lightness[leftIndex] - lightness[rightIndex];
            return brightnessDelta !== 0 ? brightnessDelta : leftIndex - rightIndex;
        });

        return {
            u: u,
            v: v,
            brightness: lightness,
            colors: colors,
            brightnessDrawOrder: brightnessDrawOrder,
            minU: minU,
            maxU: maxU,
            minV: minV,
            maxV: maxV,
        };
    }

    function buildSliceDataset(rgbBuffer, rawCoordinates, displayCoordinates, projectionBounds) {
        const brightness = computeBrightnessBuffer(rgbBuffer, rawCoordinates);
        return {
            brightness: brightness,
            histogram: buildBrightnessHistogram(brightness),
            preview: buildSlicePreviewData(
                rgbBuffer,
                displayCoordinates,
                brightness,
                projectionBounds,
            ),
            totalCount: brightness.length,
        };
    }

    function applySliceState(kind) {
        const viewer = getSliceViewer(kind);
        if (!viewer) return;

        viewer.setSliceRange(0, 1, false);
        updateSlicePointCount(kind);
    }

    function updateSlicePointCount(kind) {
        const countElement = getSliceCountElement(kind);
        const dataset = sliceDatasets[kind];
        if (!countElement || !dataset) return;
        countElement.textContent = formatCount(dataset.totalCount);
    }

    function getThemeColor(name, fallback) {
        const rootStyle = getComputedStyle(document.documentElement);
        const value = rootStyle.getPropertyValue(name).trim();
        return value || fallback;
    }

    function drawSlicePreview(kind) {
        if (!sliceUI || activeSliceKind !== kind) return;
        const canvas = sliceUI.canvas;
        const context = canvas.getContext("2d");
        const dataset = sliceDatasets[kind];
        const sliceRange = sharedSliceRange;
        const width = canvas.width;
        const height = canvas.height;
        const padding = { left: 38, right: 16, top: 16, bottom: 32 };
        const availableWidth = width - padding.left - padding.right;
        const availableHeight = height - padding.top - padding.bottom;
        const panelColor = getThemeColor("--surface", "#ffffff");
        const lineColor = getThemeColor("--line", "#d7d9de");
        const mutedColor = getThemeColor("--muted", "#69707c");
        const inkColor = getThemeColor("--ink", "#15171b");

        context.clearRect(0, 0, width, height);
        context.fillStyle = panelColor;
        context.fillRect(0, 0, width, height);

        if (!dataset || !dataset.preview || dataset.preview.u.length === 0) {
            context.strokeStyle = lineColor;
            context.lineWidth = 1;
            for (let index = 0; index <= 4; index += 1) {
                const x = padding.left + (availableWidth * index) / 4;
                const y = padding.top + (availableHeight * index) / 4;
                context.beginPath();
                context.moveTo(x, padding.top);
                context.lineTo(x, padding.top + availableHeight);
                context.stroke();
                context.beginPath();
                context.moveTo(padding.left, y);
                context.lineTo(padding.left + availableWidth, y);
                context.stroke();
            }
            context.strokeStyle = mutedColor;
            context.strokeRect(padding.left, padding.top, availableWidth, availableHeight);
            context.fillStyle = mutedColor;
            context.font = "600 14px system-ui, sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText("Preparing slice preview…", width / 2, height / 2);
            sliceUI.selectedCount.textContent = "0 pts.";
            return;
        }

        const preview = dataset.preview;
        const spanU = Math.max(1e-8, preview.maxU - preview.minU);
        const spanV = Math.max(1e-8, preview.maxV - preview.minV);
        const uniformScale = Math.min(availableWidth / spanU, availableHeight / spanV);
        const plotWidth = spanU * uniformScale;
        const plotHeight = spanV * uniformScale;
        const plotLeft = padding.left + (availableWidth - plotWidth) * 0.5;
        const plotTop = padding.top + (availableHeight - plotHeight) * 0.5;
        const pointSize = kind === "lattice" ? 6.0 : 4.8;
        let selectedPreviewCount = 0;

        context.strokeStyle = lineColor;
        context.lineWidth = 1;
        for (let index = 0; index <= 4; index += 1) {
            const x = plotLeft + (plotWidth * index) / 4;
            const y = plotTop + (plotHeight * index) / 4;
            context.beginPath();
            context.moveTo(x, plotTop);
            context.lineTo(x, plotTop + plotHeight);
            context.stroke();
            context.beginPath();
            context.moveTo(plotLeft, y);
            context.lineTo(plotLeft + plotWidth, y);
            context.stroke();
        }
        context.strokeStyle = mutedColor;
        context.strokeRect(plotLeft, plotTop, plotWidth, plotHeight);

        context.save();
        context.globalCompositeOperation = "source-over";
        context.fillStyle = mutedColor;
        context.globalAlpha = 0.055;
        for (let index = 0; index < preview.u.length; index += 1) {
            const x = plotLeft + (preview.u[index] - preview.minU) * uniformScale;
            const y = plotTop + plotHeight - (preview.v[index] - preview.minV) * uniformScale;
            context.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
        }
        context.restore();

        context.save();
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = kind === "lattice" ? 1.0 : 0.5;
        const brightnessDrawOrder = preview.brightnessDrawOrder;
        const orderedPointCount = brightnessDrawOrder
            ? brightnessDrawOrder.length
            : preview.u.length;

        for (let drawIndex = 0; drawIndex < orderedPointCount; drawIndex += 1) {
            const index = brightnessDrawOrder
                ? brightnessDrawOrder[drawIndex]
                : drawIndex;
            const brightness = preview.brightness[index];
            if (brightness < sliceRange.min || brightness > sliceRange.max) continue;

            const x = plotLeft + (preview.u[index] - preview.minU) * uniformScale;
            const y = plotTop + plotHeight - (preview.v[index] - preview.minV) * uniformScale;
            const colorOffset = index * 3;
            context.fillStyle =
                "rgb(" +
                preview.colors[colorOffset] +
                "," +
                preview.colors[colorOffset + 1] +
                "," +
                preview.colors[colorOffset + 2] +
                ")";
            context.fillRect(x - pointSize * 0.5, y - pointSize * 0.5, pointSize, pointSize);
            selectedPreviewCount += 1;
        }
        context.restore();

        const axis = getBrightnessAxisMeta();
        context.fillStyle = mutedColor;
        context.font = "600 11px system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "alphabetic";
        context.fillText(axis.horizontalX, plotLeft + plotWidth / 2, height - 8);

        context.save();
        context.translate(12, plotTop + plotHeight / 2);
        context.rotate(-Math.PI / 2);
        context.fillText(axis.horizontalY, 0, 0);
        context.restore();

        if (selectedPreviewCount === 0) {
            context.fillStyle = inkColor;
            context.globalAlpha = 0.82;
            context.font = "600 14px system-ui, sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText("No points in this interval", plotLeft + plotWidth / 2, plotTop + plotHeight / 2);
            context.globalAlpha = 1;
        }

        const selectedTotal = countBrightnessRange(dataset, sliceRange.min, sliceRange.max);
        sliceUI.selectedCount.textContent =
            new Intl.NumberFormat("en-US").format(selectedTotal) +
            " of " +
            new Intl.NumberFormat("en-US").format(dataset.totalCount) +
            " pts.";
    }

    function scheduleSlicePreview(kind) {
        if (slicePreviewFrame) cancelAnimationFrame(slicePreviewFrame);
        slicePreviewFrame = requestAnimationFrame(function () {
            slicePreviewFrame = 0;
            drawSlicePreview(kind);
        });
    }

    function syncSliceControls(kind) {
        if (!sliceUI || activeSliceKind !== kind) return;
        const axis = getBrightnessAxisMeta();
        sliceUI.title.textContent = getSliceTitle(kind);
        sliceUI.axisLabel.textContent = axis.label;
        sliceUI.axisDetail.textContent = axis.detail;
        sliceUI.minInput.value = sharedSliceRange.min.toFixed(3);
        sliceUI.maxInput.value = sharedSliceRange.max.toFixed(3);
        sliceUI.minValue.textContent = sharedSliceRange.min.toFixed(3);
        sliceUI.maxValue.textContent = sharedSliceRange.max.toFixed(3);
        sliceUI.rangeRoot.style.setProperty("--slice-min", (sharedSliceRange.min * 100).toFixed(3) + "%");
        sliceUI.rangeRoot.style.setProperty("--slice-max", (sharedSliceRange.max * 100).toFixed(3) + "%");
        sliceUI.rangeWindow.setAttribute(
            "aria-valuetext",
            sharedSliceRange.min.toFixed(3) + " to " + sharedSliceRange.max.toFixed(3),
        );
        scheduleSlicePreview(kind);
        scheduleSlicePopoverPosition();
    }

    function setSliceRange(kind, minValue, maxValue) {
        if (!sliceStates[kind]) return;
        let min = clampSliceValue(minValue);
        let max = clampSliceValue(maxValue);
        if (min > max) {
            if (Math.abs(min - sharedSliceRange.min) > Math.abs(max - sharedSliceRange.max)) {
                min = max;
            } else {
                max = min;
            }
        }
        sharedSliceRange.min = min;
        sharedSliceRange.max = max;
        applySliceState("image");
        applySliceState("lattice");
        syncSliceControls(kind);
    }

    function closeSlicePanel() {
        if (!sliceUI) return;
        if (activeSliceKind) {
            sliceStates[activeSliceKind].enabled = false;
            applySliceState(activeSliceKind);
        }

        Object.keys(sliceUI.buttons).forEach(function (buttonKind) {
            sliceUI.buttons[buttonKind].classList.remove("is-active");
            sliceUI.buttons[buttonKind].setAttribute("aria-pressed", "false");
        });

        activeSliceKind = null;
        sliceUI.popover.classList.remove("is-open");
        sliceUI.popover.setAttribute("aria-hidden", "true");
        sliceUI.popover.setAttribute("inert", "");
    }

    function openSlicePanel(kind) {
        if (!sliceUI) return;
        if (activeSliceKind === kind && isSlicePopoverOpen()) {
            closeSlicePanel();
            return;
        }

        if (activeSliceKind && activeSliceKind !== kind) {
            sliceStates[activeSliceKind].enabled = false;
            applySliceState(activeSliceKind);
        }

        activeSliceKind = kind;
        sliceStates[kind].enabled = true;
        Object.keys(sliceUI.buttons).forEach(function (buttonKind) {
            const active = buttonKind === kind;
            sliceUI.buttons[buttonKind].classList.toggle("is-active", active);
            sliceUI.buttons[buttonKind].setAttribute("aria-pressed", String(active));
        });

        sliceUI.popover.removeAttribute("inert");
        sliceUI.popover.setAttribute("aria-hidden", "false");
        applySliceState(kind);
        syncSliceControls(kind);
        positionSlicePopover();
        requestAnimationFrame(function () {
            if (activeSliceKind !== kind) return;
            sliceUI.popover.classList.add("is-open");
            requestAnimationFrame(function () {
                if (activeSliceKind === kind) {
                    drawSlicePreview(kind);
                    positionSlicePopover();
                }
            });
        });
    }

    function createSliceToggleButton(kind) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "cs-slice-toggle";
        button.setAttribute("aria-label", "Open Chroma Distribution Map for " + getSliceTitle(kind).toLowerCase());
        button.setAttribute("aria-pressed", "false");
        button.title = "Chroma Distribution Map";
        button.innerHTML =
            '<svg aria-hidden="true" viewBox="0 0 24 24">' +
            '<path d="M5 7.5 12 4l7 3.5-7 3.5-7-3.5Z"></path>' +
            '<path d="m5 12 7 3.5 7-3.5"></path>' +
            '<path d="m5 16.5 7 3.5 7-3.5"></path>' +
            '</svg>';
        button.addEventListener("pointerdown", function (event) {
            event.stopPropagation();
        });
        button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            openSlicePanel(kind);
        });
        getSliceStage(kind).appendChild(button);
        return button;
    }

    function setupSliceVisualization() {
        if (sliceUI) return;

        const overlay = document.createElement("div");
        overlay.className = "cs-slice-overlay-layer";

        const popover = document.createElement("section");
        popover.className = "cs-slice-popover";
        popover.setAttribute("aria-label", "Brightness slice controls and preview");
        popover.setAttribute("aria-hidden", "true");
        popover.setAttribute("inert", "");
        popover.style.setProperty("--cs-slice-popover-width", SLICE_CONFIG.popoverWidth + "px");
        popover.style.setProperty("--cs-slice-preview-ratio", SLICE_CONFIG.canvasWidth + " / " + SLICE_CONFIG.canvasHeight);
        popover.innerHTML =
            '<div class="cs-slice-popover-head">' +
            '<div><h3 class="cs-slice-title">Brightness Slice</h3></div>' +
            '<button class="cs-slice-close" type="button" aria-label="Close brightness slice">×</button>' +
            '</div>' +
            '<div class="cs-slice-preview-shell cs-slice-overview">' +
            '<canvas class="cs-slice-preview" width="' + SLICE_CONFIG.canvasWidth + '" height="' + SLICE_CONFIG.canvasHeight + '" aria-label="Orthographic brightness slice preview"></canvas>' +
            '<span class="cs-slice-preview-caption">Chroma Distribution Map</span>' +
            '</div>' +
            '<div class="cs-slice-range-head"><span>Brightness interval</span><strong class="cs-slice-selected-count">0 points</strong></div>' +
            '<p class="cs-slice-axis"><span></span><small></small></p>' +
            '<div class="cs-dual-range">' +
            '<div class="cs-dual-range-rail">' +
            '<div class="cs-dual-range-window" role="slider" tabindex="0" aria-label="Move the complete brightness interval" aria-valuemin="0" aria-valuemax="1"></div>' +
            '<span class="cs-dual-range-handle cs-dual-range-handle-min" aria-hidden="true"></span>' +
            '<span class="cs-dual-range-handle cs-dual-range-handle-max" aria-hidden="true"></span>' +
            '</div>' +
            '<input class="cs-dual-range-input cs-dual-range-min" type="range" min="0" max="1" step="' + SLICE_CONFIG.step + '" value="' + SLICE_CONFIG.min + '" aria-label="Minimum brightness">' +
            '<input class="cs-dual-range-input cs-dual-range-max" type="range" min="0" max="1" step="' + SLICE_CONFIG.step + '" value="' + SLICE_CONFIG.max + '" aria-label="Maximum brightness">' +
            '</div>' +
            '<div class="cs-slice-values"><output class="cs-slice-min-value">' + Number(SLICE_CONFIG.min).toFixed(3) + '</output><span class="cs-slice-scale"><i>0</i><i>1</i></span><output class="cs-slice-max-value">' + Number(SLICE_CONFIG.max).toFixed(3) + '</output></div>' +
            '<div class="cs-slice-actions"><span>Drag either handle, or drag the highlighted interval to move both bounds.</span><button type="button" class="cs-slice-reset">Full range</button></div>';

        overlay.appendChild(popover);
        document.body.appendChild(overlay);

        const axisParts = popover.querySelectorAll(".cs-slice-axis > *");
        sliceUI = {
            overlay: overlay,
            popover: popover,
            head: popover.querySelector(".cs-slice-popover-head"),
            title: popover.querySelector(".cs-slice-title"),
            axisLabel: axisParts[0],
            axisDetail: axisParts[1],
            canvas: popover.querySelector(".cs-slice-preview"),
            selectedCount: popover.querySelector(".cs-slice-selected-count"),
            minInput: popover.querySelector(".cs-dual-range-min"),
            maxInput: popover.querySelector(".cs-dual-range-max"),
            rangeWindow: popover.querySelector(".cs-dual-range-window"),
            rangeRail: popover.querySelector(".cs-dual-range-rail"),
            rangeRoot: popover.querySelector(".cs-dual-range"),
            minValue: popover.querySelector(".cs-slice-min-value"),
            maxValue: popover.querySelector(".cs-slice-max-value"),
            close: popover.querySelector(".cs-slice-close"),
            reset: popover.querySelector(".cs-slice-reset"),
            buttons: {},
        };

        sliceUI.buttons.image = createSliceToggleButton("image");
        sliceUI.buttons.lattice = createSliceToggleButton("lattice");

        sliceUI.head.addEventListener("pointerdown", function (event) {
            if (event.button !== 0 || event.target.closest("button") || !activeSliceKind) return;
            const rect = sliceUI.popover.getBoundingClientRect();
            event.preventDefault();
            slicePopoverDrag = {
                pointerId: event.pointerId,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
                kind: activeSliceKind,
            };
            sliceUI.head.setPointerCapture(event.pointerId);
            sliceUI.popover.classList.add("is-dragging");
        });

        sliceUI.head.addEventListener("pointermove", function (event) {
            if (!slicePopoverDrag || event.pointerId !== slicePopoverDrag.pointerId) return;
            const kind = slicePopoverDrag.kind;
            const panelRect = sliceUI.popover.getBoundingClientRect();
            const anchor = getSliceAnchorPosition(kind, panelRect.width, panelRect.height);
            if (!anchor) return;

            const desiredLeft = event.clientX - slicePopoverDrag.offsetX;
            const desiredTop = event.clientY - slicePopoverDrag.offsetY;
            slicePopoverOffsets[kind].x = desiredLeft - anchor.left;
            slicePopoverOffsets[kind].y = desiredTop - anchor.top;
            slicePopoverOffsets[kind].userPlaced = true;
            positionSlicePopover();
        });

        function endSlicePopoverDrag(event) {
            if (!slicePopoverDrag || event.pointerId !== slicePopoverDrag.pointerId) return;
            sliceUI.popover.classList.remove("is-dragging");
            if (sliceUI.head.hasPointerCapture(event.pointerId)) {
                sliceUI.head.releasePointerCapture(event.pointerId);
            }
            slicePopoverDrag = null;
        }

        sliceUI.head.addEventListener("pointerup", endSlicePopoverDrag);
        sliceUI.head.addEventListener("pointercancel", endSlicePopoverDrag);
        sliceUI.close.addEventListener("click", closeSlicePanel);

        sliceUI.reset.addEventListener("click", function () {
            if (activeSliceKind) setSliceRange(activeSliceKind, 0, 1);
        });

        sliceUI.minInput.addEventListener("input", function () {
            if (!activeSliceKind) return;
            const max = sharedSliceRange.max;
            setSliceRange(activeSliceKind, Math.min(Number(sliceUI.minInput.value), max), max);
        });

        sliceUI.maxInput.addEventListener("input", function () {
            if (!activeSliceKind) return;
            const min = sharedSliceRange.min;
            setSliceRange(activeSliceKind, min, Math.max(Number(sliceUI.maxInput.value), min));
        });

        sliceUI.rangeWindow.addEventListener("pointerdown", function (event) {
            if (!activeSliceKind || event.button !== 0) return;
            event.preventDefault();
            sliceWindowDrag = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startMin: sharedSliceRange.min,
                startMax: sharedSliceRange.max,
                kind: activeSliceKind,
            };
            sliceUI.rangeWindow.setPointerCapture(event.pointerId);
            sliceUI.rangeWindow.classList.add("is-dragging");
        });

        sliceUI.rangeWindow.addEventListener("pointermove", function (event) {
            if (!sliceWindowDrag || event.pointerId !== sliceWindowDrag.pointerId) return;
            const rect = sliceUI.rangeRail.getBoundingClientRect();
            if (rect.width <= 1) return;
            const delta = (event.clientX - sliceWindowDrag.startX) / rect.width;
            const intervalWidth = sliceWindowDrag.startMax - sliceWindowDrag.startMin;
            const min = Math.min(1 - intervalWidth, Math.max(0, sliceWindowDrag.startMin + delta));
            setSliceRange(sliceWindowDrag.kind, min, min + intervalWidth);
        });

        function endSliceWindowDrag(event) {
            if (!sliceWindowDrag || event.pointerId !== sliceWindowDrag.pointerId) return;
            sliceUI.rangeWindow.classList.remove("is-dragging");
            if (sliceUI.rangeWindow.hasPointerCapture(event.pointerId)) {
                sliceUI.rangeWindow.releasePointerCapture(event.pointerId);
            }
            sliceWindowDrag = null;
        }

        sliceUI.rangeWindow.addEventListener("pointerup", endSliceWindowDrag);
        sliceUI.rangeWindow.addEventListener("pointercancel", endSliceWindowDrag);
        sliceUI.rangeWindow.addEventListener("keydown", function (event) {
            if (!activeSliceKind || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
            event.preventDefault();
            const width = sharedSliceRange.max - sharedSliceRange.min;
            const step = event.shiftKey ? 0.05 : 0.01;
            const direction = event.key === "ArrowLeft" ? -1 : 1;
            const min = Math.min(1 - width, Math.max(0, sharedSliceRange.min + direction * step));
            setSliceRange(activeSliceKind, min, min + width);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && activeSliceKind) closeSlicePanel();
        });
        window.addEventListener("scroll", scheduleSlicePopoverPosition, { passive: true });
        window.addEventListener("resize", scheduleSlicePopoverPosition);

        if (typeof ResizeObserver === "function") {
            const stageObserver = new ResizeObserver(scheduleSlicePopoverPosition);
            stageObserver.observe(getSliceStage("image"));
            stageObserver.observe(getSliceStage("lattice"));
        }

        const colorSpaceSection = document.getElementById("galleryColorSpace");
        if (colorSpaceSection && typeof IntersectionObserver === "function") {
            sliceSectionObserver = new IntersectionObserver(function (entries) {
                const entry = entries[0];
                if (entry && !entry.isIntersecting && activeSliceKind) {
                    closeSlicePanel();
                }
            }, { threshold: 0 });
            sliceSectionObserver.observe(colorSpaceSection);
        }

        // The floating Slice window starts closed. The toggle buttons remain available.
        closeSlicePanel();
    }

    function showColorImageLoadingState(show, progress) {
        const placeholder = elements.colorInputLoading;
        if (!placeholder) return;

        if (!show) {
            placeholder.classList.add("is-hidden");
            placeholder.style.display = "none";
            return;
        }

        placeholder.classList.remove("is-hidden");
        if (window.CAGELoadingUI?.setLoading) {
            window.CAGELoadingUI.setLoading(placeholder, progress);
        } else {
            placeholder.style.display = "flex";
            const label = placeholder.querySelector(".label");
            if (label) label.textContent = Number.isFinite(progress) ? Math.round(progress) + "%" : "Receiving image...";
        }
    }

    function decodeColorImage(sourceUrl) {
        return new Promise(function (resolve, reject) {
            const image = new Image();
            image.decoding = "async";
            image.onload = async function () {
                try { if (typeof image.decode === "function") await image.decode(); } catch (_) {}
                if (image.naturalWidth > 0) resolve(image);
                else reject(new Error("Image decode failed"));
            };
            image.onerror = function () { reject(new Error("Image decode failed")); };
            image.src = sourceUrl;
            if (image.complete && image.naturalWidth > 0) resolve(image);
        });
    }

    function cancelColorImageLoad() {
        colorImageLoadToken += 1;
    }

    async function loadImageFromFile(src, name) {
        const token = ++colorImageLoadToken;
        showColorImageLoadingState(true, null);

        try {
            let sourceUrl = src;
            if (window.CAGEImageLoader?.load) {
                const resource = await window.CAGEImageLoader.load(src, {
                    onProgress: function (progress) {
                        if (token !== colorImageLoadToken) return;
                        showColorImageLoadingState(true, progress);
                    },
                });
                sourceUrl = resource.url;
            }

            if (token !== colorImageLoadToken) return;
            const image = await decodeColorImage(sourceUrl);
            if (token !== colorImageLoadToken) return;

            const canvas = document.createElement("canvas");
            canvas.width = COLOR_CONFIG.loadedCanvasWidth;
            canvas.height = COLOR_CONFIG.loadedCanvasHeight;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

                showColorImageLoadingState(false);
            rebuildImageSamples(canvas, name);
        } catch (error) {
            if (token !== colorImageLoadToken) return;
                showColorImageLoadingState(false);
            console.error("Error loading image:", error);
            const canvas = createDefaultImage("structured");
            rebuildImageSamples(canvas, "Error loading image: " + name);
        }
    }

    function loadDefaultSourceImage(sourcePath) {
        const name = DEFAULT_SOURCE_MODE === "low-light"
            ? "Low-light Image"
            : DEFAULT_SOURCE_MODE === "gt-mean"
                ? "GT-Mean Enlightened"
                : "Normal-light Image";
        loadImageFromFile(sourcePath, name);
    }

    function drawPreview(sourceCanvas) {
        const preview = elements.previewCanvas;
        const ctx = preview.getContext("2d");
        const sourceWidth = Math.max(1, sourceCanvas.width);
        const sourceHeight = Math.max(1, sourceCanvas.height);
        const rect = elements.dropZone.getBoundingClientRect();
        const style = window.getComputedStyle(elements.dropZone);
        const paddingX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        const paddingY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);

        const availableWidth = Math.max(1, rect.width - paddingX);
        const availableHeight = Math.max(1, rect.height - paddingY);
        const fitScale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);

        const cssWidth = Math.max(1, Math.round(sourceWidth * fitScale));
        const cssHeight = Math.max(1, Math.round(sourceHeight * fitScale));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.max(2, Math.round(cssWidth * dpr));
        const height = Math.max(2, Math.round(cssHeight * dpr));

        preview.style.width = cssWidth + "px";
        preview.style.height = cssHeight + "px";
        preview.width = width;
        preview.height = height;

        ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(sourceCanvas, 0, 0, width, height);
    }

    function imageToSamplingCanvas(imageSource) {
        const maxDimension = COLOR_CONFIG.maxSamplingDimension;
        const sourceWidth = imageSource.naturalWidth || imageSource.width;
        const sourceHeight = imageSource.naturalHeight || imageSource.height;
        const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth * scale));
        canvas.height = Math.max(1, Math.round(sourceHeight * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(imageSource, 0, 0, canvas.width, canvas.height);
        return canvas;
    }

    function sampleCanvasRGB(canvas, pointBudget) {
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const total = canvas.width * canvas.height;
        const budget = pointBudget === "all" ? total : pointBudget;
        const stride = Math.max(1, Math.sqrt(total / Math.max(1, budget)));
        const estimated = Math.min(
            total,
            Math.ceil(canvas.width / stride) * Math.ceil(canvas.height / stride),
        );
        const values = new Float32Array(estimated * 3);
        let count = 0;

        const start = stride * 0.5;
        for (let y = start; y < canvas.height; y += stride) {
            const iy = Math.min(canvas.height - 1, Math.floor(y));
            for (let x = start; x < canvas.width; x += stride) {
                const ix = Math.min(canvas.width - 1, Math.floor(x));
                const pixelOffset = (iy * canvas.width + ix) * 4;
                if (pixels[pixelOffset + 3] < 8) {
                    continue;
                }
                const offset = count * 3;
                values[offset] = pixels[pixelOffset] / 255;
                values[offset + 1] = pixels[pixelOffset + 1] / 255;
                values[offset + 2] = pixels[pixelOffset + 2] / 255;
                count += 1;
            }
        }

        return values.slice(0, count * 3);
    }

    function generateRGBLattice(resolution) {
        const count = resolution * resolution * resolution;
        const rgb = new Float32Array(count * 3);
        const denom = Math.max(1, resolution - 1);
        let cursor = 0;
        for (let ri = 0; ri < resolution; ri += 1) {
            const r = ri / denom;
            for (let gi = 0; gi < resolution; gi += 1) {
                const g = gi / denom;
                for (let bi = 0; bi < resolution; bi += 1) {
                    rgb[cursor] = r;
                    rgb[cursor + 1] = g;
                    rgb[cursor + 2] = bi / denom;
                    cursor += 3;
                }
            }
        }
        return rgb;
    }

    function computeDomain(points) {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < points.length; i += 3) {
            for (let axis = 0; axis < 3; axis += 1) {
                const value = points[i + axis];
                if (value < min[axis]) min[axis] = value;
                if (value > max[axis]) max[axis] = value;
            }
        }
        const span = [
            Math.max(max[0] - min[0], 1e-8),
            Math.max(max[1] - min[1], 1e-8),
            Math.max(max[2] - min[2], 1e-8),
        ];
        return { min: min, max: max, span: span };
    }

    function normalizeBufferToUnit(points, domain) {
        const output = new Float32Array(points.length);
        for (let i = 0; i < points.length; i += 3) {
            for (let axis = 0; axis < 3; axis += 1) {
                output[i + axis] = Math.min(
                    1,
                    Math.max(0, (points[i + axis] - domain.min[axis]) / domain.span[axis]),
                );
            }
        }
        return output;
    }

    function fitDomainToScene(domain) {
        const sceneExtent = 2.2;
        const maxSpan = Math.max(domain.span[0], domain.span[1], domain.span[2], 1e-8);
        const scale = sceneExtent / maxSpan;
        const center = [
            (domain.min[0] + domain.max[0]) * 0.5,
            (domain.min[1] + domain.max[1]) * 0.5,
            (domain.min[2] + domain.max[2]) * 0.5,
        ];
        return { scale: scale, center: center };
    }

    function fitPointsToScene(points, domain) {
        const fit = fitDomainToScene(domain);
        const output = new Float32Array(points.length);
        for (let i = 0; i < points.length; i += 3) {
            output[i] = (points[i] - fit.center[0]) * fit.scale;
            output[i + 1] = (points[i + 1] - fit.center[1]) * fit.scale;
            output[i + 2] = (points[i + 2] - fit.center[2]) * fit.scale;
        }
        return output;
    }

    function fittedBounds(domain) {
        const fit = fitDomainToScene(domain);
        return {
            min: [
                (domain.min[0] - fit.center[0]) * fit.scale,
                (domain.min[1] - fit.center[1]) * fit.scale,
                (domain.min[2] - fit.center[2]) * fit.scale,
            ],
            max: [
                (domain.max[0] - fit.center[0]) * fit.scale,
                (domain.max[1] - fit.center[1]) * fit.scale,
                (domain.max[2] - fit.center[2]) * fit.scale,
            ],
        };
    }

    function currentTransformOptions() {
        return {
            hsvProjection: state.hsvProjection,
            hviDensity: state.hviDensity,
            labProjection: state.labProjection,
        };
    }

    function formatAxisValue(value) {
        if (!Number.isFinite(value)) return "–";
        const clean = Math.abs(value) < 5e-5 ? 0 : value;
        if (Math.abs(clean) >= 100 || (Math.abs(clean) > 0 && Math.abs(clean) < 0.001)) {
            return clean.toExponential(2);
        }
        return Number(clean.toFixed(3)).toString();
    }

    function updateSpaceSummary(coordinateDomain) {
        const info = ColorSpaces.getSpaceInfo(state.space, currentTransformOptions());
        elements.spaceTitle.textContent = "Info Card";
        elements.spaceDescription.textContent = info.description;
        elements.forwardSpaceName.textContent = info.displayName;
        elements.inverseSpaceName.textContent = info.displayName;

        const hasConversion = state.space !== "RGB";
        elements.conversionGrid.classList.toggle("cs-is-hidden", !hasConversion);
        elements.formulaToggle.classList.toggle("cs-is-hidden", !hasConversion);

        const formulaTargets = [elements.spaceFormulaForward, elements.spaceFormulaInverse];
        if (window.MathJax && typeof MathJax.typesetClear === "function") {
            MathJax.typesetClear(formulaTargets);
        }

        function renderConversion(target, lines, note) {
            target.innerHTML = "";
            if (note) {
                const textLine = document.createElement("span");
                textLine.className = "cs-formula-note";
                textLine.textContent = note;
                target.appendChild(textLine);
            }
            lines.forEach(function (line) {
                const formulaLine = document.createElement("span");
                formulaLine.className = "cs-formula-line";
                formulaLine.textContent = "\\[" + line + "\\]";
                target.appendChild(formulaLine);
            });
        }

        renderConversion(elements.spaceFormulaForward, info.forwardLines, info.forwardText);
        renderConversion(elements.spaceFormulaInverse, info.inverseLines, info.inverseText);

        if (window.MathJax && typeof MathJax.typesetPromise === "function") {
            MathJax.typesetPromise(formulaTargets).catch(function () {
                setStatus("Formula rendering failed");
            });
        }

        elements.axisChips.innerHTML = "";
        info.axes.forEach(function (axis, index) {
            const minValue = coordinateDomain ? formatAxisValue(coordinateDomain.min[index]) : "–";
            const maxValue = coordinateDomain ? formatAxisValue(coordinateDomain.max[index]) : "–";
            const chip = document.createElement("span");
            chip.textContent = axis + " ∈ [" + minValue + ", " + maxValue + "]";
            elements.axisChips.appendChild(chip);
        });



        elements.hsvProjectionField.classList.toggle("cs-is-hidden", state.space !== "HSV");
        elements.hviDensityField.classList.toggle("cs-is-hidden", state.space !== "HVI");
        elements.labProjectionField.classList.toggle("cs-is-hidden", state.space !== "OKLAB");
    }

    function scheduleRender(reason) {
        if (updateTimer) {
            window.clearTimeout(updateTimer);
        }
        updateTimer = window.setTimeout(function () {
            renderClouds(reason);
        }, 30);
    }

    function renderClouds(reason) {
        if (!state.latticeRGB) return;
        const token = ++state.renderToken;
        setStatus("Updating " + state.space + " 3D voxel");

        window.requestAnimationFrame(function () {
            if (token !== state.renderToken) {
                return;
            }

            const options = currentTransformOptions();
            const latticeRaw = ColorSpaces.transformBuffer(state.latticeRGB, state.space, options);
            const imageRaw = state.imageRGB ? ColorSpaces.transformBuffer(state.imageRGB, state.space, options) : null;

            let latticeCoordinates = latticeRaw;
            let imageCoordinates = imageRaw;
            let coordinateDomain = computeDomain(latticeRaw);

            if (state.normalizeRange) {
                latticeCoordinates = normalizeBufferToUnit(latticeRaw, coordinateDomain);
                if (imageRaw) {
                    imageCoordinates = normalizeBufferToUnit(imageRaw, coordinateDomain);
                }
                coordinateDomain = {
                    min: [0, 0, 0],
                    max: [1, 1, 1],
                    span: [1, 1, 1],
                };
            }

            const latticePositions = fitPointsToScene(latticeCoordinates, coordinateDomain);
            const imagePositions = imageRaw ? fitPointsToScene(imageCoordinates, coordinateDomain) : null;
            const bounds = fittedBounds(coordinateDomain);
            const sliceProjectionBounds = computeSliceProjectionBounds(coordinateDomain);

            sliceDatasets.lattice = buildSliceDataset(
                state.latticeRGB,
                latticeRaw,
                latticeCoordinates,
                sliceProjectionBounds,
            );
            latticeViewer.setData(
                latticePositions,
                state.latticeLinearColors,
                bounds,
                sliceDatasets.lattice.brightness,
            );

            if (imagePositions && state.imageLinearColors) {
                sliceDatasets.image = buildSliceDataset(
                    state.imageRGB,
                    imageRaw,
                    imageCoordinates,
                    sliceProjectionBounds,
                );
                imageViewer.setData(
                    imagePositions,
                    state.imageLinearColors,
                    bounds,
                    sliceDatasets.image.brightness,
                );
            } else {
                sliceDatasets.image = null;
            }

            applySliceState("image");
            applySliceState("lattice");
            updateSpaceSummary(coordinateDomain);
            updateAxisGizmo(elements.imageAxisGizmo, imageViewer.getCameraState(), state.space);
            updateAxisGizmo(elements.latticeAxisGizmo, latticeViewer.getCameraState(), state.space);
            if (activeSliceKind) syncSliceControls(activeSliceKind);
            setStatus((reason || "Updated") + " · " + state.space + " ready");
        });
    }

    function rebuildImageSamples(canvas, name) {
        state.lastSourceCanvas = canvas;
        state.imageWidth = canvas.width;
        state.imageHeight = canvas.height;
        state.imageName = name || state.imageName;
        state.imageRGB = sampleCanvasRGB(canvas, state.imageBudget);
        state.imageLinearColors = ColorSpaces.toLinearDisplayBuffer(state.imageRGB);
        elements.imageMeta.textContent = canvas.width + "×" + canvas.height;
        drawPreview(canvas);
        scheduleRender("Image updated");
    }

    function rebuildLattice() {
        state.latticeRGB = generateRGBLattice(state.latticeResolution);
        state.latticeLinearColors = ColorSpaces.toLinearDisplayBuffer(state.latticeRGB);
        scheduleRender("Lattice updated");
    }

    function loadFile(file) {
        if (!file || !file.type.startsWith("image/")) {
            setStatus("The selected file is not an image");
            return;
        }

        cancelColorImageLoad();
        setStatus("Reading " + file.name);
        const reader = new FileReader();
        reader.onerror = function () {
            setStatus("Failed to read " + file.name);
        };
        reader.onload = function () {
            const image = new Image();
            image.onerror = function () {
                setStatus("Failed to decode " + file.name);
            };
            image.onload = function () {
                const canvas = imageToSamplingCanvas(image);
                rebuildImageSamples(canvas, file.name);
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    function updateAxisGizmo(gizmo, cameraState, space) {
        if (!gizmo || !cameraState) return;

        const yaw = cameraState.yaw;
        const pitch = cameraState.pitch;
        const cp = Math.cos(pitch);
        const sp = Math.sin(pitch);
        const sy = Math.sin(yaw);
        const cy = Math.cos(yaw);

        const forward = [-cp * sy, -sp, -cp * cy];
        const right = [cy, 0, -sy];
        const up = [-sy * sp, cp, -cy * sp];
        const centerX = 45;
        const centerY = 45;
        const dotDistance = 18;

        const axisLabels = {};
        if (space) {
            const info = ColorSpaces.getSpaceInfo(space, currentTransformOptions());
            axisLabels.x = info.axes[0];
            axisLabels.y = info.axes[1];
            axisLabels.z = info.axes[2];
        } else {
            axisLabels.x = "X";
            axisLabels.y = "Y";
            axisLabels.z = "Z";
        }

        const items = [
            { type: "line", key: "x", dir: [1, 0, 0], groupKey: "x-pos" },
            { type: "dot", key: "x", dir: [1, 0, 0], sign: "positive", groupKey: "x-pos" },
            { type: "dot", key: "x", dir: [-1, 0, 0], sign: "negative", groupKey: "x-neg" },
            { type: "line", key: "y", dir: [0, 1, 0], groupKey: "y-pos" },
            { type: "dot", key: "y", dir: [0, 1, 0], sign: "positive", groupKey: "y-pos" },
            { type: "dot", key: "y", dir: [0, -1, 0], sign: "negative", groupKey: "y-neg" },
            { type: "line", key: "z", dir: [0, 0, 1], groupKey: "z-pos" },
            { type: "dot", key: "z", dir: [0, 0, 1], sign: "positive", groupKey: "z-pos" },
            { type: "dot", key: "z", dir: [0, 0, -1], sign: "negative", groupKey: "z-neg" },
            { type: "label", key: "x", dir: [1, 0, 0], sign: "positive", groupKey: "x-pos" },
            { type: "label", key: "x", dir: [-1, 0, 0], sign: "negative", groupKey: "x-neg" },
            { type: "label", key: "y", dir: [0, 1, 0], sign: "positive", groupKey: "y-pos" },
            { type: "label", key: "y", dir: [0, -1, 0], sign: "negative", groupKey: "y-neg" },
            { type: "label", key: "z", dir: [0, 0, 1], sign: "positive", groupKey: "z-pos" },
            { type: "label", key: "z", dir: [0, 0, -1], sign: "negative", groupKey: "z-neg" },
        ].map(function (item) {
            const sx = item.dir[0] * right[0] + item.dir[1] * right[1] + item.dir[2] * right[2];
            const sy2 = item.dir[0] * up[0] + item.dir[1] * up[1] + item.dir[2] * up[2];
            const depth = item.dir[0] * forward[0] + item.dir[1] * forward[1] + item.dir[2] * forward[2];
            const planarLength = Math.max(1.0, Math.hypot(sx, sy2));
            return {
                type: item.type,
                key: item.key,
                sign: item.sign,
                groupKey: item.groupKey,
                nx: sx / planarLength,
                ny: sy2 / planarLength,
                depth: depth,
                planarLength: planarLength,
            };
        });

        items.sort(function (a, b) {
            const aEffectiveDepth = (a.type === "line" || a.type === "label") ? a.depth - 0.001 : a.depth;
            const bEffectiveDepth = (b.type === "line" || b.type === "label") ? b.depth - 0.001 : b.depth;
            return bEffectiveDepth - aEffectiveDepth;
        });

        items.forEach(function (item) {
            let element;
            if (item.type === "dot") {
                element = gizmo.querySelector('.axis-dot[data-axis="' + item.key + '"][data-dir="' + item.sign + '"]');
            } else if (item.type === "line") {
                element = gizmo.querySelector('.axis-line[data-axis="' + item.key + '"]');
            } else if (item.type === "label") {
                element = gizmo.querySelector('.axis-label[data-axis="' + item.key + '"][data-dir="' + item.sign + '"]');
            }
            if (!element) return;
            element.parentNode.appendChild(element);

            const x = centerX + item.nx * dotDistance;
            const y = centerY - item.ny * dotDistance;

            if (item.type === "dot") {
                element.setAttribute("cx", x);
                element.setAttribute("cy", y);
            } else if (item.type === "line") {
                element.setAttribute("x1", centerX);
                element.setAttribute("y1", centerY);
                element.setAttribute("x2", x);
                element.setAttribute("y2", y);
            } else if (item.type === "label") {
                element.setAttribute("x", x);
                element.setAttribute("y", y + 1);
                element.textContent = axisLabels[item.key];
            }

            if (item.type === 'dot' || item.type === 'line') {
                if (item.depth > 0) {
                    element.style.stroke = "color-mix(in srgb, var(--axis-" + item.key + ") 50%, var(--surface) 50%)";
                    element.style.fill = "color-mix(in srgb, var(--axis-" + item.key + ") 50%, var(--surface) 50%)";
                } else {
                    element.style.stroke = "";
                    element.style.fill = "";
                }
            }
        });
    }

    function wireCameraSync() {
        imageViewer.onCameraChange = function (cameraState) {
            latticeViewer.setCameraState(cameraState, true);
            updateAxisGizmo(elements.imageAxisGizmo, cameraState, state.space);
            updateAxisGizmo(elements.latticeAxisGizmo, cameraState, state.space);
        };
        latticeViewer.onCameraChange = function (cameraState) {
            imageViewer.setCameraState(cameraState, true);
            updateAxisGizmo(elements.imageAxisGizmo, cameraState, state.space);
            updateAxisGizmo(elements.latticeAxisGizmo, cameraState, state.space);
        };
    }

    function wireInteractionPause() {
        function mirrorPause(phase, pausedUntil) {
            imageViewer.setAutoRotatePause(pausedUntil);
            latticeViewer.setAutoRotatePause(pausedUntil);
            setStatus(
                phase === "start" || phase === "move"
                    ? "Auto rotation paused during interaction"
                    : "Auto rotation resumes in 5 seconds",
            );
        }

        imageViewer.onInteraction = mirrorPause;
        latticeViewer.onInteraction = mirrorPause;
    }

    function updateRerandomButton() {
        const mode = elements.patternMode.value;
        if (randomModes.indexOf(mode) !== -1) {
            elements.rerandomBtn.style.display = "flex";
        } else {
            elements.rerandomBtn.style.display = "none";
        }
    }

        function wireUI() {
        elements.formulaToggle.addEventListener("click", function () {
            const isCollapsed = elements.conversionGrid.classList.toggle("cs-is-collapsed");
            elements.formulaToggle.setAttribute("aria-expanded", String(!isCollapsed));
        });

        elements.spaceTabs.addEventListener("click", function (event) {
            const button = event.target.closest("[data-space]");
            if (!button) return;
            state.space = button.dataset.space;
            elements.spaceTabs.querySelectorAll("[data-space]").forEach(function (item) {
                const active = item === button;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-selected", String(active));
            });
            scheduleRender("Space changed");
        });

        elements.imageInput.addEventListener("change", function () {
            loadFile(elements.imageInput.files[0]);
        });

        ["dragenter", "dragover"].forEach(function (type) {
            elements.dropZone.addEventListener(type, function (event) {
                event.preventDefault();
                elements.dropZone.classList.add("is-dragging");
            });
        });

        ["dragleave", "drop"].forEach(function (type) {
            elements.dropZone.addEventListener(type, function (event) {
                event.preventDefault();
                elements.dropZone.classList.remove("is-dragging");
            });
        });

        elements.dropZone.addEventListener("drop", function (event) {
            loadFile(event.dataTransfer.files[0]);
        });

        elements.previewCanvas.addEventListener("mousedown", function (event) {
            if (event.button === 1) {
                event.preventDefault();
                if (state.lastSourceCanvas) {
                    elements.lightboxImage.src = state.lastSourceCanvas.toDataURL();
                    elements.imageLightbox.classList.add("is-active");
                }
            }
        });

        elements.imageLightbox.addEventListener("click", function () {
            elements.imageLightbox.classList.remove("is-active");
            elements.lightboxImage.src = "";
        });

        elements.lightboxImage.addEventListener("click", function (e) {
            e.stopPropagation();
        });

        let lightboxScale = 1;
        let lightboxOffsetX = 0;
        let lightboxOffsetY = 0;
        let isDragging = false;
        let dragStartX = 0;
        let dragStartY = 0;

        elements.lightboxImage.addEventListener("wheel", function (event) {
            event.preventDefault();
            const delta = event.deltaY > 0 ? 0.9 : 1.1;
            lightboxScale = Math.max(0.5, Math.min(10, lightboxScale * delta));
            elements.lightboxImage.style.transform = `scale(${lightboxScale}) translate(${lightboxOffsetX}px, ${lightboxOffsetY}px)`;
        });

        elements.lightboxImage.addEventListener("mousedown", function (event) {
            if (lightboxScale > 1) {
                isDragging = true;
                dragStartX = event.clientX - lightboxOffsetX;
                dragStartY = event.clientY - lightboxOffsetY;
            }
        });

        document.addEventListener("mousemove", function (event) {
            if (isDragging) {
                lightboxOffsetX = event.clientX - dragStartX;
                lightboxOffsetY = event.clientY - dragStartY;
                elements.lightboxImage.style.transform = `scale(${lightboxScale}) translate(${lightboxOffsetX}px, ${lightboxOffsetY}px)`;
            }
        });

        document.addEventListener("mouseup", function () {
            isDragging = false;
        });

        elements.imageBudget.addEventListener("change", function () {
            state.imageBudget = elements.imageBudget.value === "all" ? "all" : Number(elements.imageBudget.value);
            const previewSource = createCanvasFromPreview();
            rebuildImageSamples(previewSource, state.imageName);
        });

        var lastNonRandomMode = "structured";
        var lastRandomMode = null;

        elements.patternMode.addEventListener("change", function () {
            const mode = elements.patternMode.value;
            updateRerandomButton();
            
            if (isInitializing) return;
            
            if (randomModes.indexOf(mode) !== -1) {
                if (mode === "image-random") {
                    loadRandomExampleImage();
                } else {
                    cancelColorImageLoad();
                    const canvas = createDefaultImage(mode);
                    rebuildImageSamples(canvas, "Pattern: " + mode);
                }
                return;
            }
            
            if (mode === "low-light") {
                loadImageFromFile("figures/example_input_00049.png", "Low-light Image");
                lastNonRandomMode = mode;
            } else if (mode === "normal-light") {
                loadImageFromFile("figures/example_output_00049.png", "Normal-light Image");
                lastNonRandomMode = mode;
            } else if (mode === "gt-mean") {
                loadImageFromFile("figures/example_gtmeanlit_00049.png", "GT-Mean Enlightened");
                lastNonRandomMode = mode;
            } else {
                cancelColorImageLoad();
                const canvas = createDefaultImage(mode);
                rebuildImageSamples(canvas, "Pattern: " + mode);
                lastNonRandomMode = mode;
            }
        });

        elements.rerandomBtn.addEventListener("click", function () {
            const mode = elements.patternMode.value;
            if (mode === "image-random") {
                loadRandomExampleImage();
            } else {
                const canvas = createDefaultImage(mode);
                rebuildImageSamples(canvas, "Pattern: " + mode);
            }
        });


        function loadRandomExampleImage() {
            const subfolders = [
                "BreaD", "CAGE-CIDNet", "CAGE-DarkIR", "CAGE-Retinexformer",
                "CWNet", "DarkIR", "FourLLIE", "HVI-CIDNet",
                "LLFlow", "LLFormer", "MIRNet", "RetinexMamba",
                "Retinexformer", "SNR-Net", "enlightened", "gt", "input",
            ];
            const minNum = 690;
            const maxNum = 789;
            const randomFolder = subfolders[Math.floor(Math.random() * subfolders.length)];
            const randomNum = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
            const filename = String(randomNum).padStart(5, "0") + ".png";
            const src = "examples/" + randomFolder + "/" + filename;
            loadImageFromFile(src, "Random Image");
        }

        elements.latticeResolution.addEventListener("change", function () {
            state.latticeResolution = Number(elements.latticeResolution.value);
            const latticeCount = state.latticeResolution ** 3;
            elements.latticeResolutionHint.textContent =
                state.latticeResolution +
                " samples per axis · " +
                new Intl.NumberFormat("en-US").format(latticeCount) +
                " pts.";
            rebuildLattice();
        });



        elements.hsvProjection.addEventListener("change", function () {
            state.hsvProjection = elements.hsvProjection.value;
            scheduleRender("HSV coordinates changed");
        });

        elements.hviDensity.addEventListener("input", function () {
            state.hviDensity = Number(elements.hviDensity.value);
            elements.hviDensityValue.value = state.hviDensity.toFixed(2);
            scheduleRender("HVI density changed");
        });

        elements.labProjection.addEventListener("change", function () {
            state.labProjection = elements.labProjection.value;
            scheduleRender("LAB projection changed");
        });

        elements.normalizeRange.addEventListener("change", function () {
            state.normalizeRange = elements.normalizeRange.checked;
            scheduleRender(
                state.normalizeRange ? "Min–max normalization enabled" : "Native coordinates restored",
            );
        });

        elements.autoRotate.addEventListener("change", function () {
            imageViewer.setAutoRotate(elements.autoRotate.checked);
            latticeViewer.setAutoRotate(elements.autoRotate.checked);
        });

        function updateHelpers() {
            imageViewer.setHelpers(elements.showFrame.checked, elements.showAxes.checked);
            latticeViewer.setHelpers(elements.showFrame.checked, elements.showAxes.checked);
        }

        elements.showFrame.addEventListener("change", updateHelpers);
        elements.showAxes.addEventListener("change", updateHelpers);

        function syncCanvasTheme() {
            const isDark = document.documentElement.getAttribute("data-theme") === "dark";
            imageViewer.setTheme(isDark);
            latticeViewer.setTheme(isDark);
        }

        syncCanvasTheme();
        document.addEventListener("theme-change", function () {
            syncCanvasTheme();
            if (activeSliceKind) scheduleSlicePreview(activeSliceKind);
        });

        function setupSelectArrowToggle() {
            const selects = document.querySelectorAll("#gallery .cs-field select");

            selects.forEach(function (select) {
                let control = select.closest(".cs-select-control");
                if (!control) {
                    control = document.createElement("span");
                    control.className = "cs-select-control";
                    select.parentNode.insertBefore(control, select);
                    control.appendChild(select);

                    const chevron = document.createElement("i");
                    chevron.className = "cs-select-chevron";
                    chevron.setAttribute("aria-hidden", "true");
                    control.appendChild(chevron);
                }

                function openChevron() {
                    control.classList.add("is-open");
                }

                function closeChevron() {
                    control.classList.remove("is-open");
                }

                select.addEventListener("pointerdown", openChevron);
                select.addEventListener("change", closeChevron);
                select.addEventListener("blur", closeChevron);
                select.addEventListener("keydown", function (event) {
                    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
                        openChevron();
                    }
                    if (["Escape", "Tab"].includes(event.key)) {
                        closeChevron();
                    }
                });

                document.addEventListener("pointerdown", function (event) {
                    if (!control.contains(event.target)) closeChevron();
                });
            });
        }
        setupSelectArrowToggle();

        function syncMappingPanelHeight() {
            const combinedPanel = document.querySelector("#gallery .cs-combined-panel");
            const mappingPanel = document.querySelector("#gallery .cs-mapping-panel");
            if (!combinedPanel || !mappingPanel) return;

            if (window.matchMedia("(max-width: 980px)").matches) {
                mappingPanel.style.removeProperty("--cs-mapping-max-height");
                return;
            }

            const combinedHeight = Math.ceil(combinedPanel.getBoundingClientRect().height);
            const stickyTop = parseFloat(getComputedStyle(document.getElementById("gallery")).getPropertyValue("--cs-sticky-top")) || 72;
            const viewportLimit = Math.max(280, window.innerHeight - stickyTop - 16);
            const cappedHeight = Math.min(combinedHeight, viewportLimit);
            mappingPanel.style.setProperty("--cs-mapping-max-height", cappedHeight + "px");
        }

        const combinedPanel = document.querySelector("#gallery .cs-combined-panel");
        if (combinedPanel && typeof ResizeObserver !== "undefined") {
            const panelObserver = new ResizeObserver(syncMappingPanelHeight);
            panelObserver.observe(combinedPanel);
        }
        window.addEventListener("resize", syncMappingPanelHeight);
        requestAnimationFrame(syncMappingPanelHeight);

        if (elements.resetView) {
            elements.resetView.addEventListener("click", function () {
                imageViewer.resetView();
                latticeViewer.resetView();
            });
        }

        window.addEventListener("resize", function () {
            if (state.imageRGB) {
                drawPreview(createCanvasFromPreview());
            }
        });
    }

    function createCanvasFromPreview() {
        const source = document.createElement("canvas");
        source.width = Math.max(1, state.imageWidth || elements.previewCanvas.width);
        source.height = Math.max(1, state.imageHeight || elements.previewCanvas.height);
        const ctx = source.getContext("2d", { willReadFrequently: true });

        if (state.lastSourceCanvas) {
            ctx.drawImage(state.lastSourceCanvas, 0, 0, source.width, source.height);
            return source;
        }

        ctx.drawImage(elements.previewCanvas, 0, 0, source.width, source.height);
        return source;
    }

    function initialize() {
        if (window.__CAGE_COLORSPACE_INITIALIZED__) return;
        selectElements();

        let webglAvailable = true;
        
        try {
            imageViewer = new PointCloudViewer(elements.imageViewer);
            latticeViewer = new PointCloudViewer(elements.latticeViewer);
        } catch (error) {
            webglAvailable = false;
            setStatus("WebGL unavailable. Color space visualization disabled.");
            document.getElementById("galleryColorSpace").classList.add("webgl-error");
            
            const fallbackMessage = document.createElement("div");
            fallbackMessage.className = "webgl-fallback";
            fallbackMessage.innerHTML = `
                <div class="webgl-fallback-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="webgl-fallback-text">
                    <p><strong>WebGL Not Available</strong></p>
                    <p>The 3D color space visualization requires WebGL, which is not supported in this browser.</p>
                    <p>Please try using a modern browser like Chrome, Firefox, or Edge.</p>
                </div>
            `;
            
            const viewerContainer = document.querySelector(".cs-viewer-container");
            if (viewerContainer) {
                viewerContainer.appendChild(fallbackMessage);
            }
            
            return;
        }

        imageViewer.setPointSize(COLOR_CONFIG.pointSize);
        latticeViewer.setPointSize(COLOR_CONFIG.pointSize);
        imageViewer.setTheme(document.documentElement.getAttribute("data-theme") === "dark");
        latticeViewer.setTheme(document.documentElement.getAttribute("data-theme") === "dark");
        imageViewer.setHelpers(elements.showFrame.checked, elements.showAxes.checked);
        latticeViewer.setHelpers(elements.showFrame.checked, elements.showAxes.checked);
        imageViewer.setAutoRotate(elements.autoRotate.checked);
        latticeViewer.setAutoRotate(elements.autoRotate.checked);
        wireCameraSync();
        updateAxisGizmo(elements.imageAxisGizmo, imageViewer.getCameraState(), state.space);
        updateAxisGizmo(elements.latticeAxisGizmo, latticeViewer.getCameraState(), state.space);
        wireInteractionPause();
        setupSliceVisualization();
        wireUI();

        state.latticeRGB = generateRGBLattice(state.latticeResolution);
        state.latticeLinearColors = ColorSpaces.toLinearDisplayBuffer(state.latticeRGB);
        elements.latticeResolutionHint.textContent =
            state.latticeResolution +
            " samples per axis · " +
            new Intl.NumberFormat("en-US").format(state.latticeResolution ** 3) +
            " pts.";
        elements.patternMode.value = DEFAULT_SOURCE_MODE;
        updateRerandomButton();
        loadDefaultSourceImage(DEFAULT_SOURCE_IMAGE);
        
        setTimeout(function () {
            isInitializing = false;
            }, 500);
        
        window.ColorSpaceAtlas = {
            refresh: function () {
                window.dispatchEvent(new Event("resize"));
                drawPreview(createCanvasFromPreview());
                scheduleRender("View refreshed");
            },
            getState: function () {
                return {
                    imageCamera: imageViewer.getCameraState(),
                    latticeCamera: latticeViewer.getCameraState(),
                    imageAutoRotate: imageViewer.autoRotate,
                    latticeAutoRotate: latticeViewer.autoRotate,
                    imagePausedUntil: imageViewer.autoRotatePausedUntil,
                    latticePausedUntil: latticeViewer.autoRotatePausedUntil,
                };
            },
        };
        window.__CAGE_COLORSPACE_INITIALIZED__ = true;
    }

    window.CAGEColorSpaceAtlas = { init: initialize };
})();
