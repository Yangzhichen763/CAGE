(function () {
    "use strict";

    const DEFAULT_SOURCE_IMAGE = "figures/example_input_00049.png";
    const DEFAULT_SOURCE_NAME = DEFAULT_SOURCE_IMAGE.split("/").pop();

    const state = {
        space: "RGB",
        hsvProjection: "cylindrical",
        hviDensity: 0.2,
        labProjection: "cylindrical",
        normalizeRange: false,
        imageBudget: 32000,
        latticeResolution: 32,
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

    function selectElements() {
        const ids = [
            "imageInput",
            "dropZone",
            "previewCanvas",
            "imageMeta",
            "spaceTabs",
            "patternMode",
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
            "syncCameras",
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
    }

    function setStatus(message) {
        if (elements.statusText) {
            elements.statusText.textContent = message;
        }
    }

    function formatCount(value) {
        return new Intl.NumberFormat("en-US").format(value) + " points";
    }

    function loadDefaultSourceImage(sourcePath) {
        fetch(sourcePath)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("Network response was not ok");
                }
                return response.blob();
            })
            .then(function (blob) {
                const url = URL.createObjectURL(blob);
                const image = new Image();
                image.onload = function () {
                    URL.revokeObjectURL(url);
                    const canvas = imageToSamplingCanvas(image);
                    rebuildImageSamples(
                        canvas,
                        sourcePath.split("/").pop() || "example_input_00049.png",
                    );
                    if (elements.statusText) elements.statusText.textContent = "Default image loaded";
                };
                image.onerror = function () {
                    URL.revokeObjectURL(url);
                    const fallbackCanvas = createDefaultImage();
                    rebuildImageSamples(fallbackCanvas, "Generated color chart");
                    if (elements.statusText) elements.statusText.textContent = "Default image was unavailable; generated chart loaded";
                };
                image.src = url;
            })
            .catch(function () {
                const fallbackCanvas = createDefaultImage();
                rebuildImageSamples(fallbackCanvas, "Generated color chart");
                if (elements.statusText) elements.statusText.textContent = "Default image was unavailable; generated chart loaded";
            });
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
        const maxDimension = 1400;
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

            latticeViewer.setData(latticePositions, state.latticeLinearColors, bounds);
            if (imagePositions && state.imageLinearColors) {
                imageViewer.setData(imagePositions, state.imageLinearColors, bounds);
                elements.imagePointCount.textContent = formatCount(imagePositions.length / 3);
            }
            elements.latticePointCount.textContent = formatCount(latticePositions.length / 3);
            updateSpaceSummary(coordinateDomain);
            updateAxisGizmo(elements.imageAxisGizmo, imageViewer.getCameraState(), state.space);
            updateAxisGizmo(elements.latticeAxisGizmo, latticeViewer.getCameraState(), state.space);
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
        elements.imageMeta.textContent = state.imageName + " · " + canvas.width + "×" + canvas.height;
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
        var randomModes = ["image-random", "random", "gaussian", "perlin", "fractal", "turbulence", "voronoi", "cellular", "mosaic"];
        var lastRandomMode = null;
        
        elements.patternMode.addEventListener("change", function () {
            const mode = elements.patternMode.value;
            if (mode === "low-light") {
                loadImageFromFile("figures/example_input_00049.png", "Low-light Image");
                lastNonRandomMode = mode;
            } else if (mode === "normal-light") {
                loadImageFromFile("figures/example_output_00049.png", "Normal-light Image");
                lastNonRandomMode = mode;
            } else if (mode === "gt-mean") {
                loadImageFromFile("figures/example_gtmeanlit_00049.png", "GT-Mean Enlightened");
                lastNonRandomMode = mode;
            } else if (mode === "image-random") {
                loadRandomExampleImage();
                lastRandomMode = mode;
            } else {
                const canvas = createDefaultImage(mode);
                rebuildImageSamples(canvas, "Pattern: " + mode);
                if (randomModes.indexOf(mode) === -1) {
                    lastNonRandomMode = mode;
                } else {
                    lastRandomMode = mode;
                }
            }
        });

        elements.patternMode.addEventListener("click", function () {
            const mode = elements.patternMode.value;
            if (randomModes.indexOf(mode) !== -1) {
                if (mode === "image-random") {
                    loadRandomExampleImage();
                } else {
                    const canvas = createDefaultImage(mode);
                    rebuildImageSamples(canvas, "Pattern: " + mode);
                }
            }
        });

        function loadImageFromFile(src, name) {
            const image = new Image();
            image.onload = function () {
                const canvas = document.createElement("canvas");
                canvas.width = 720;
                canvas.height = 480;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                rebuildImageSamples(canvas, name);
            };
            image.onerror = function () {
                const canvas = createDefaultImage("structured");
                rebuildImageSamples(canvas, "Error loading image: " + name);
            };
            image.src = src;
        }

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
                " points";
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
        document.addEventListener("theme-change", syncCanvasTheme);

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

        try {
            imageViewer = new PointCloudViewer(elements.imageViewer);
            latticeViewer = new PointCloudViewer(elements.latticeViewer);
        } catch (error) {
            setStatus(error.message);
            document.getElementById("galleryColorSpace").classList.add("webgl-error");
            throw error;
        }

        imageViewer.setPointSize(3);
        latticeViewer.setPointSize(3);
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
        wireUI();

        state.latticeRGB = generateRGBLattice(state.latticeResolution);
        state.latticeLinearColors = ColorSpaces.toLinearDisplayBuffer(state.latticeRGB);
        elements.latticeResolutionHint.textContent =
            state.latticeResolution +
            " samples per axis · " +
            new Intl.NumberFormat("en-US").format(state.latticeResolution ** 3) +
            " points";
        elements.patternMode.value = "mosaic";
        const canvas = createDefaultImage("mosaic");
        rebuildImageSamples(canvas, "Pattern: mosaic");
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
