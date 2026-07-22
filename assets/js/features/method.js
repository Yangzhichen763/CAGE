"use strict";

if (!window.__CAGE_METHOD_INITIALIZED__) {
    window.__CAGE_METHOD_INITIALIZED__ = true;
    (function () {
        const methodRoot = document.getElementById("method");
        if (!methodRoot) return;

        const mainData = {
            input: {
                tag: "Image",
                title: "Input Low-light Image",
                equation: "\\( x \\in \\mathbb{R}^{3 \\times H \\times W} \\)",
                text: "The RGB input is captured under low illumination. Low signal-to-noise ratio, camera hardware limitations, and automatic in-camera processing can embed a chromatic disturbance in the observed image.",
                tone: "",
                visual: "input",
            },
            forward: {
                tag: "Operation",
                title: "Forward Transform",
                equation: "\\( \\hat{x}_l = G(x) \\)",
                text: "The forward transform maps the input from RGB to AdaLAB through RGB-to-LAB conversion, hue-directional chromatic debiasing, and lightness-aware chroma scaling. The transform suppresses embedded color bias before backbone enhancement.",
                tone: "forward",
                visual: "forward",
                defaultChild: "f-debias",
            },
            backbone: {
                tag: "Network",
                title: "Low-light Image Enhancement Backbone",
                equation: "\\( x_h = F_\\theta(\\hat{x}_l) \\)",
                text: "The enhancement backbone restores visibility and structures in the AdaLAB space. CAGE changes the representation entering and leaving the backbone without replacing the backbone architecture.",
                tone: "",
                visual: "backbone",
            },
            inverse: {
                tag: "Operation",
                title: "Inverse Transform",
                equation: "\\( \\hat{y} = G^{-1}(x_h) \\)",
                text: "The inverse transform reverts the lightness-aware chroma scaling, converts out-of-gamut chroma surplus into lightness compensation, and converts the final valid LAB representation back to RGB.",
                tone: "inverse",
                visual: "inverse",
                defaultChild: "i-revert",
            },
            output: {
                tag: "Image",
                title: "Output Enhanced Image",
                equation: "\\( \\hat{y} \\in \\mathbb{R}^{3 \\times H \\times W} \\)",
                text: "The output is the final enhanced RGB image after color debiasing, backbone enhancement, gamut harmonization, and inverse color-space mapping.",
                tone: "",
                visual: "output",
            },
            cnn: {
                tag: "Network",
                title: "Lightweight CNN Backbone",
                equation: "\\( z = H(x_{\\downarrow 128}) \\)",
                text: "The input is bilinearly downsampled to 128 by 128. A lightweight CNN extracts a compact representation, which is used by the lightness-interval predictor and hue-shift-direction predictor.",
                tone: "",
                visual: "cnn",
            },
            params: {
                tag: "Parameter",
                title: "Image-adaptive Cylindrical Parameters",
                equation: "\\( \\{v_k\\}_{k=0}^{p},\\ \\{c_k\\}_{k=0}^{p},\\ d,\\ \\{m_k\\}_{k=0}^{p} \\)",
                text: "The lightness intervals and shared hue-shift direction are predicted from z. The chroma-scaling intensities and hue-shift magnitudes are obtained from learned scalar values through global interaction across lightness vertices. The lightness vertices and chroma-scaling intensities are reused by the inverse transform, while the hue-shift parameters drive forward chromatic debiasing.",
                tone: "",
                visual: "params",
            },
        };

        const childData = {
            "f-input": {
                title: "Input Low-light Image (RGB space)",
                tag: "Image",
                equation: "\\( x \\in \\mathbb{R}^{3 \\times H \\times W} \\)",
                text: "The RGB low-light image is first converted to LAB and separated into the lightness map l_l and chrominance map u_l.",
                tone: "forward",
            },
            "f-debias": {
                title: "Hue-directional Chromatic Debiasing",
                tag: "Operation",
                equation:
                    "\\( \\begin{aligned} d_l &= \\operatorname{Interp}\\!\\left(l_l;\\{v_k\\}_{k=0}^{p},\\{d_k\\}_{k=0}^{p}\\right), \\\\ s_l &= \\frac{\\delta_2-\\delta_1}{2}\\frac{u_l\\cdot d_l}{\\lVert u_l\\rVert_2\\lVert d_l\\rVert_2}+\\frac{\\delta_1+\\delta_2}{2}, \\\\ \\tilde{u}_l &= u_l-s_l d_l. \\end{aligned} \\)",
                text: "Vertex-wise hue-shift vectors are interpolated according to the input lightness. A similarity-aware weight accounts for the boundary effect of color bias, and the weighted offset shifts the chrominance map toward a corrected distribution.",
                tone: "forward",
            },
            "f-scale": {
                title: "Apply Chroma-Scaling Intensity",
                tag: "Operation",
                equation:
                    "\\( \\begin{aligned} c_l &= \\operatorname{Interp}\\!\\left(l_l;\\{v_k\\}_{k=0}^{p},\\{c_k\\}_{k=0}^{p}\\right), \\\\ \\hat{u}_l &= c_l\\tilde{u}_l. \\end{aligned} \\)",
                text: "The chroma-scaling intensities are interpolated from the lightness sensitivity vertices and applied to the debiased chrominance map. The operation aligns chromatic ranges across lightness levels and constructs the AdaLAB representation.",
                tone: "forward",
            },
            "f-output": {
                title: "Input Low-light Image (AdaLAB space)",
                tag: "Image",
                equation: "\\( \\hat{x}_l=[l_l;\\hat{u}_l] \\)",
                text: "The original lightness map and reorganized chrominance map are concatenated into the AdaLAB representation used by the enhancement backbone.",
                tone: "forward",
            },
            "i-input": {
                title: "Enhanced Image (AdaLAB space)",
                tag: "Image",
                equation: "\\( x_h=[\\hat{l}_h;\\hat{u}_h] \\)",
                text: "The enhancement backbone produces an enhanced lightness map and an enhanced chrominance map in AdaLAB space.",
                tone: "inverse",
            },
            "i-revert": {
                title: "Revert Chroma-Scaling Intensity",
                tag: "Operation",
                equation:
                    "\\( \\begin{aligned} c_h &= \\operatorname{Interp}\\!\\left(\\hat{l}_h;\\{v_k\\}_{k=0}^{p},\\{c_k\\}_{k=0}^{p}\\right), \\\\ \\tilde{u}_h &= \\frac{\\hat{u}_h}{c_h+\\epsilon},\\qquad \\epsilon=10^{-12}. \\end{aligned} \\)",
                text: "The shared chroma-scaling intensities are interpolated according to the enhanced lightness map. Dividing the enhanced chrominance by the resulting scaling map returns the representation to the base LAB chroma scale.",
                tone: "inverse",
            },
            "i-gamut": {
                title: "Out-of-Gamut Lightness Compensation",
                tag: "Operation",
                equation:
                    "\\( \\begin{aligned} u_c &= \\operatorname{GamutClipping}(\\tilde{u}_h,\\hat{l}_h), \\\\ l_h &= \\hat{l}_h+\\gamma\\lVert u_c-\\tilde{u}_h\\rVert_2,\\qquad \\gamma=1.0, \\\\ u_h &= \\operatorname{GamutClipping}(u_c,l_h). \\end{aligned} \\)",
                text: "The recovered chroma is first projected to the valid gamut. The removed chroma magnitude becomes a proportional lightness gain, after which a second gamut projection ensures a valid reconstruction.",
                tone: "inverse",
            },
            "i-output": {
                title: "Output Enhanced Image (RGB space)",
                tag: "Image",
                equation:
                    "\\( \\hat{y}_h=[\\alpha_l l_h;\\alpha_c u_h]\\ \\xrightarrow{\\mathrm{LAB\\ to\\ RGB}}\\ \\hat{y} \\)",
                text: "The customized lightness and chroma channels form the final valid LAB map. Inverse color-space mapping converts this map to the enhanced RGB image.",
                tone: "inverse",
            },
        };

        const nodeList = ["input", "cnn", "params", "forward", "backbone", "inverse", "output"]
            .map(function (key) {
                return methodRoot.querySelector('.mnode[data-key="' + key + '"]');
            })
            .filter(Boolean);
        const detail = document.getElementById("mdetail");
        const detailMedia = document.getElementById("mdMedia");
        const detailStep = document.getElementById("mdStep");
        const detailTag = document.getElementById("mdTag");
        const detailTitle = document.getElementById("mdTitle");
        const detailEq = document.getElementById("mdEq");
        const detailText = document.getElementById("mdText");
        const childPanel = document.getElementById("mdChild");
        const childTag = document.getElementById("mdChildTag");
        const childTitle = document.getElementById("mdChildTitle");
        const childEq = document.getElementById("mdChildEq");
        const childText = document.getElementById("mdChildText");
        const interactive = document.getElementById("methodInteractive");
        const figure = document.getElementById("methodFigure");
        const modeButtons = Array.from(methodRoot.querySelectorAll('#methodSeg [role="tab"]'));

        function arrowMarkup() {
            return '<div class="msubconn" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15M7 14l5 5 5-5"></path></svg></div>';
        }

        function subNodeMarkup(key, label, imageNode, selected) {
            return (
                '<button type="button" class="msubnode' +
                (imageNode ? " image-node" : "") +
                '" data-subkey="' +
                key +
                '" aria-selected="' +
                String(selected) +
                '">' +
                label +
                "</button>"
            );
        }

        function buildSubflow(kind, selectedKey) {
            if (kind === "forward") {
                return (
                    '<div class="md-subflow" aria-label="Forward transform sub-blocks">' +
                    subNodeMarkup(
                        "f-input",
                        "Input Low-light Image (RGB space)",
                        true,
                        selectedKey === "f-input",
                    ) +
                    arrowMarkup() +
                    subNodeMarkup(
                        "f-debias",
                        "Hue-directional Chromatic Debiasing",
                        false,
                        selectedKey === "f-debias",
                    ) +
                    arrowMarkup() +
                    subNodeMarkup(
                        "f-scale",
                        "Apply Chroma-Scaling Intensity",
                        false,
                        selectedKey === "f-scale",
                    ) +
                    arrowMarkup() +
                    subNodeMarkup(
                        "f-output",
                        "Low-light Representation (AdaLAB space)",
                        true,
                        selectedKey === "f-output",
                    ) +
                    "</div>"
                );
            }
            return (
                '<div class="md-subflow" aria-label="Inverse transform sub-blocks">' +
                subNodeMarkup(
                    "i-input",
                    "Enhanced Representation (AdaLAB space)",
                    true,
                    selectedKey === "i-input",
                ) +
                arrowMarkup() +
                subNodeMarkup(
                    "i-revert",
                    "Revert Chroma-Scaling Intensity",
                    false,
                    selectedKey === "i-revert",
                ) +
                arrowMarkup() +
                subNodeMarkup(
                    "i-gamut",
                    "Out-of-Gamut Lightness Compensation",
                    false,
                    selectedKey === "i-gamut",
                ) +
                arrowMarkup() +
                subNodeMarkup(
                    "i-output",
                    "Output Enhanced Image (RGB space)",
                    true,
                    selectedKey === "i-output",
                ) +
                "</div>"
            );
        }

        function buildSimpleVisual(kind) {
            if (kind === "params") {
                return (
                    '<div class="md-param-visual">' +
                    '<button type="button" class="md-simple-node dashed" data-simple-key="param-v">Lightness Sensitivity Vertices<br>\\( \\{v_k\\} \\)</button>' +
                    '<button type="button" class="md-simple-node dashed" data-simple-key="param-d">Hue-shift Direction and Magnitude<br>\\( \\{d_k\\} \\)</button>' +
                    '<button type="button" class="md-simple-node dashed" data-simple-key="param-c">Chroma-Scaling Intensity<br>\\( \\{c_k\\} \\)</button>' +
                    "</div>"
                );
            }
            if (kind === "cnn") {
                return '<div class="md-simple-visual vertical-flow"><button type="button" class="md-simple-node dashed" data-simple-key="cnn-input">Downsampled Input<br>128 × 128</button><span class="md-simple-arrow">↓</span><button type="button" class="md-simple-node" data-simple-key="cnn-core">Lightweight CNN<br>Compact vector z</button><span class="md-simple-arrow">↓</span><button type="button" class="md-simple-node dashed" data-simple-key="cnn-output">Interval and Direction Predictors</button></div>';
            }
            if (kind === "backbone") {
                return '<div class="md-simple-visual vertical-flow"><button type="button" class="md-simple-node dashed" data-simple-key="backbone-input">AdaLAB Input</button><span class="md-simple-arrow">↓</span><button type="button" class="md-simple-node" data-simple-key="backbone-core">LLIE Backbone</button><span class="md-simple-arrow">↓</span><button type="button" class="md-simple-node dashed" data-simple-key="backbone-output">AdaLAB Output</button></div>';
            }
            if (kind === "input") {
                return '<div class="md-simple-visual md-image-visual"><div class="md-simple-node dashed md-image-node md-static-node"><img src="figures/example_input_00049.png" alt="Input Low-light Image" loading="lazy"><span class="md-image-label">Input Low-light Image</span></div></div>';
            }
            if (kind === "output") {
                return '<div class="md-simple-visual md-image-visual"><div class="md-simple-node dashed md-image-node md-static-node"><img src="figures/example_output_00049.png" alt="Output Enhanced Image" loading="lazy"><span class="md-image-label">Output Enhanced Image</span></div></div>';
            }
            return (
                '<div class="md-simple-visual"><button type="button" class="md-simple-node dashed" data-simple-key="single-' +
                kind +
                '">' +
                kind +
                "</button></div>"
            );
        }

        function selectChild(key) {
            const item = childData[key];
            if (!item) return;
            detailMedia.querySelectorAll(".msubnode").forEach(function (node) {
                node.setAttribute("aria-selected", String(node.dataset.subkey === key));
            });
            childPanel.hidden = false;
            childPanel.className = "md-child";
            childTag.className = "md-child-tag " + item.tone;
            childTag.textContent = item.tag;
            childTitle.textContent = item.title;
            childEq.innerHTML = item.equation;
            childText.textContent = item.text;
            interactive.classList.add("has-child");
            if (window.MathJax && typeof MathJax.typeset === "function") {
                MathJax.typeset();
            }
        }

        const simpleChildData = {
            "param-v": {
                title: "Lightness Sensitivity Vertices",
                tag: "Parameter",
                equation:
                    "\\( \\tilde{v}_k=\\frac{\\exp(\\hat{v}_k)}{\\sum_{j=1}^{p}\\exp(\\hat{v}_j)},\\quad v_0=0,\\quad v_k=v_{k-1}+\\tilde{v}_k \\)",
                text: "A linear predictor outputs p interval logits. Softmax normalization and cumulative summation convert them into p plus 1 monotonically increasing lightness sampling vertices.",
                tone: "forward",
            },
            "param-d": {
                title: "Hue-shift Direction and Magnitude",
                tag: "Parameter",
                equation:
                    "\\( d=\\phi_d(z),\\quad m_k=\\sum_{j=0}^{p}\\hat{m}_j e^{-\\tau|j-k|},\\quad d_k=m_k d \\)",
                text: "The predictor outputs one shared two-dimensional hue-shift direction. Learned magnitude values interact globally across lightness vertices and scale the shared direction at each vertex.",
                tone: "forward",
            },
            "param-c": {
                title: "Chroma-Scaling Intensity",
                tag: "Parameter",
                equation:
                    "\\( \\tilde{c}_k=\\sum_{j=0}^{p}\\hat{c}_j e^{-\\tau|j-k|},\\quad c_k=\\operatorname{softplus}(\\tilde{c}_k+1) \\)",
                text: "Learned scalar values interact across all lightness vertices through an exponentially decaying index-distance weight. Softplus keeps the final scaling values positive and the additive constant moves them toward unit scaling.",
                tone: "forward",
            },
            "cnn-input": {
                title: "Downsampled Input",
                tag: "Image",
                equation: "\\( x_{\\downarrow 128}\\in\\mathbb{R}^{3\\times128\\times128} \\)",
                text: "The low-light input is bilinearly downsampled to 128 by 128 before parameter prediction.",
                tone: "forward",
            },
            "cnn-core": {
                title: "Lightweight CNN Backbone",
                tag: "Network",
                equation: "\\( z=H(x_{\\downarrow 128}),\\quad z\\in\\mathbb{R}^{D} \\)",
                text: "The lightweight CNN extracts a compact vector representation z with limited computational overhead.",
                tone: "forward",
            },
            "cnn-output": {
                title: "Prediction Heads",
                tag: "Operation",
                equation: "\\( \\{\\hat{v}_k\\}_{k=1}^{p}\\ \\text{and}\\ d=\\phi_d(z) \\)",
                text: "A lightness-interval predictor outputs interval logits, and a hue-shift-direction predictor outputs the shared two-dimensional direction. Chroma intensity and hue magnitude originate from learned scalar values rather than direct CNN outputs.",
                tone: "forward",
            },
            "backbone-input": {
                title: "AdaLAB Input",
                tag: "Image",
                equation: "\\( \\hat{x}_l \\)",
                text: "The forward transform supplies the corrected AdaLAB representation to the retained enhancement backbone.",
                tone: "forward",
            },
            "backbone-core": {
                title: "LLIE Backbone",
                tag: "Network",
                equation: "\\( F_\\theta(\\cdot) \\)",
                text: "The retained low-light image enhancement backbone restores visibility and structures in AdaLAB space.",
                tone: "forward",
            },
            "backbone-output": {
                title: "Enhanced AdaLAB Representation",
                tag: "Image",
                equation: "\\( x_h=F_\\theta(\\hat{x}_l) \\)",
                text: "The enhanced AdaLAB representation is passed to the inverse transform for chroma-scale reversion, gamut harmonization, and RGB reconstruction.",
                tone: "inverse",
            },
            "single-input": {
                title: "Input Low-light Image",
                tag: "Image",
                equation: "\\( x\\in\\mathbb{R}^{3\\times H\\times W} \\)",
                text: "The RGB input is the low-light observation before transformation and enhancement.",
                tone: "forward",
            },
            "single-output": {
                title: "Output Enhanced Image",
                tag: "Image",
                equation: "\\( \\hat{y}\\in\\mathbb{R}^{3\\times H\\times W} \\)",
                text: "The final RGB output is reconstructed after the inverse transform.",
                tone: "inverse",
            },
        };

        function selectSimpleChild(key) {
            const item = simpleChildData[key];
            if (!item) return;
            detailMedia.querySelectorAll("[data-simple-key]").forEach(function (node) {
                node.setAttribute("aria-selected", String(node.dataset.simpleKey === key));
            });
            childPanel.hidden = false;
            childPanel.className = "md-child";
            childTag.className = "md-child-tag " + item.tone;
            childTag.textContent = item.tag;
            childTitle.textContent = item.title;
            childEq.innerHTML = item.equation;
            childText.textContent = item.text;
            interactive.classList.add("has-child");
            if (window.MathJax && typeof MathJax.typeset === "function") {
                MathJax.typeset();
            }
        }

        function bindSubflow() {
            detailMedia.querySelectorAll(".msubnode").forEach(function (node) {
                node.addEventListener("click", function () {
                    selectChild(node.dataset.subkey);
                });
                node.addEventListener("keydown", function (event) {
                    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                    const children = Array.from(detailMedia.querySelectorAll(".msubnode"));
                    const current = children.indexOf(node);
                    let next = current;
                    if (event.key === "ArrowDown") next = (current + 1) % children.length;
                    if (event.key === "ArrowUp") next = (current - 1 + children.length) % children.length;
                    if (event.key === "Home") next = 0;
                    if (event.key === "End") next = children.length - 1;
                    event.preventDefault();
                    children[next].focus();
                    selectChild(children[next].dataset.subkey);
                });
            });
        }

        function bindSimpleVisual() {
            detailMedia.querySelectorAll("[data-simple-key]").forEach(function (node) {
                node.addEventListener("click", function () {
                    selectSimpleChild(node.dataset.simpleKey);
                });
                node.addEventListener("keydown", function (event) {
                    if (!["ArrowDown", "ArrowUp", "Home", "End", "ArrowLeft", "ArrowRight"].includes(event.key))
                        return;
                    const children = Array.from(detailMedia.querySelectorAll("[data-simple-key]"));
                    const current = children.indexOf(node);
                    let next = current;
                    if (event.key === "ArrowDown" || event.key === "ArrowRight")
                        next = (current + 1) % children.length;
                    if (event.key === "ArrowUp" || event.key === "ArrowLeft")
                        next = (current - 1 + children.length) % children.length;
                    if (event.key === "Home") next = 0;
                    if (event.key === "End") next = children.length - 1;
                    event.preventDefault();
                    children[next].focus();
                    selectSimpleChild(children[next].dataset.simpleKey);
                });
            });
        }

        function selectNode(node, moveFocus) {
            const item = mainData[node.dataset.key];
            if (!item) return;

            nodeList.forEach(function (candidate) {
                const active = candidate === node;
                candidate.setAttribute("aria-selected", String(active));
                candidate.tabIndex = active ? 0 : -1;
            });

            detail.setAttribute("aria-labelledby", node.id);
            detailStep.textContent = nodeList.indexOf(node) + 1 + " / " + nodeList.length;
            detailTag.className = "md-tag" + (item.tone ? " " + item.tone : "");
            detailTag.textContent = item.tag;
            detailTitle.textContent = item.title;
            detailEq.innerHTML = item.equation;
            detailText.textContent = item.text;

            if (item.visual === "forward" || item.visual === "inverse") {
                const childKey = item.defaultChild;
                detailMedia.innerHTML = buildSubflow(item.visual, childKey);
                bindSubflow();
                selectChild(childKey);
            } else {
                detailMedia.innerHTML = buildSimpleVisual(item.visual);
                bindSimpleVisual();
                childPanel.hidden = true;
                interactive.classList.remove("has-child");
            }

            detail.scrollTop = 0;
            if (moveFocus) node.focus({ preventScroll: true });
            if (window.MathJax && typeof MathJax.typeset === "function") {
                MathJax.typeset();
            }
        }

        nodeList.forEach(function (node) {
            node.addEventListener("click", function () {
                selectNode(node, false);
            });
            node.addEventListener("keydown", function (event) {
                if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"].includes(event.key))
                    return;
                const current = nodeList.indexOf(node);
                let next = current;
                if (event.key === "ArrowDown" || event.key === "ArrowRight")
                    next = (current + 1) % nodeList.length;
                if (event.key === "ArrowUp" || event.key === "ArrowLeft")
                    next = (current - 1 + nodeList.length) % nodeList.length;
                if (event.key === "Home") next = 0;
                if (event.key === "End") next = nodeList.length - 1;
                event.preventDefault();
                selectNode(nodeList[next], true);
            });
        });

        function setMode(mode) {
            const showInteractive = mode === "interactive";
            interactive.hidden = !showInteractive;
            figure.hidden = showInteractive;
            modeButtons.forEach(function (button) {
                const active = button.id === "mode-" + mode;
                button.setAttribute("aria-selected", String(active));
                button.tabIndex = active ? 0 : -1;
            });
        }

        modeButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                setMode(button.id.replace("mode-", ""));
            });
            button.addEventListener("keydown", function (event) {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                const index = modeButtons.indexOf(button);
                let next = index;
                if (event.key === "ArrowRight") next = (index + 1) % modeButtons.length;
                if (event.key === "ArrowLeft") next = (index - 1 + modeButtons.length) % modeButtons.length;
                if (event.key === "Home") next = 0;
                if (event.key === "End") next = modeButtons.length - 1;
                event.preventDefault();
                setMode(modeButtons[next].id.replace("mode-", ""));
                modeButtons[next].focus();
            });
        });

        document.getElementById("mfigOpen").addEventListener("click", function () {
            setMode("interactive");
            setTimeout(function () {
                const inputNode = document.getElementById("mblock-input");
                selectNode(inputNode);
                inputNode.focus();
            }, 100);
        });

        selectNode(document.getElementById("mblock-input"));
    })();


    (function refineInteractiveArchitecture() {
        const method = document.getElementById("method");
        const interactive = document.getElementById("methodInteractive");
        const diagram = document.getElementById("mflow");
        const branches = diagram ? diagram.querySelector(".mbranches") : null;
        const mainBranch = diagram ? diagram.querySelector(".main-branch") : null;
        const parameterBranch = diagram ? diagram.querySelector(".parameter-branch") : null;
        const detail = document.getElementById("mdetail");
        const nodes = method ? Array.from(method.querySelectorAll('.mnode[role="tab"]')) : [];
        const stage = document.getElementById("mdStage");
        const progress = document.getElementById("mdProgressBar");
        const previous = document.getElementById("mdPrev");
        const next = document.getElementById("mdNext");

        const input = document.getElementById("mblock-input");
        const forward = document.getElementById("mblock-forward");
        const inverse = document.getElementById("mblock-inverse");
        const cnn = document.getElementById("mblock-cnn");
        const params = document.getElementById("mblock-params");

        const inputCnnPath = document.getElementById("mcurveInputCnn");
        const paramsForwardPath = document.getElementById("mcurveParamsForward");
        const paramsInversePath = document.getElementById("mcurveParamsInverse");

        if (
            !method ||
            !interactive ||
            !diagram ||
            !branches ||
            !mainBranch ||
            !parameterBranch ||
            !detail ||
            nodes.length === 0
        ) {
            return;
        }

        nodes.forEach(function (node) {
            node.removeAttribute("data-step");
        });

        const stageLabels = {
            input: "Input",
            forward: "Forward",
            backbone: "Backbone",
            inverse: "Inverse",
            output: "Output",
            cnn: "Predictor",
            params: "Parameters",
        };

        function activeIndex() {
            return nodes.findIndex(function (node) {
                return node.getAttribute("aria-selected") === "true";
            });
        }

        function syncDetailState() {
            const index = activeIndex();
            if (index < 0) return;

            const node = nodes[index];
            if (stage) {
                stage.textContent = stageLabels[node.dataset.key] || node.dataset.key;
            }
            if (progress) {
                progress.style.width = ((index + 1) / nodes.length) * 100 + "%";
            }
            if (previous) {
                previous.disabled = index === 0;
            }
            if (next) {
                next.disabled = index === nodes.length - 1;
            }

            detail.classList.remove("is-updating");
            void detail.offsetWidth;
            detail.classList.add("is-updating");

            requestAnimationFrame(function () {
                syncDetailHeight();
            });
        }

        function point(element, horizontal, vertical) {
            const rect = element.getBoundingClientRect();
            const rootRect = branches.getBoundingClientRect();

            let x = rect.left - rootRect.left;
            let y = rect.top - rootRect.top;

            if (horizontal === "center") x += rect.width / 2;
            if (horizontal === "right") x += rect.width;
            if (vertical === "center") y += rect.height / 2;
            if (vertical === "bottom") y += rect.height;

            return { x: x, y: y };
        }

        function curve(start, end, mode) {
            if (mode === "input-cnn") {
                const dx = Math.max(40, (end.x - start.x) * 0.8);
                const dy = Math.max(28, (end.y - start.y) * 0.8);
                return (
                    "M " +
                    start.x +
                    " " +
                    start.y +
                    " C " +
                    (start.x + dx) +
                    " " +
                    start.y +
                    ", " +
                    end.x +
                    " " +
                    (end.y - dy) +
                    ", " +
                    end.x +
                    " " +
                    end.y
                );
            }

            const direction = end.y < start.y ? -1 : 1;
            const spread = Math.max(46, Math.abs(end.y - start.y) * 0.54);
            return (
                "M " +
                start.x +
                " " +
                start.y +
                " C " +
                (start.x - 48) +
                " " +
                start.y +
                ", " +
                (end.x + 48) +
                " " +
                (end.y + direction * spread * 0.18) +
                ", " +
                end.x +
                " " +
                end.y
            );
        }

        function alignParameterBranch() {
            if (window.matchMedia("(max-width: 700px)").matches) {
                parameterBranch.style.paddingTop = "0px";
                return;
            }

            const branchRect = branches.getBoundingClientRect();
            const forwardRect = forward.getBoundingClientRect();
            parameterBranch.style.paddingTop = Math.max(0, forwardRect.top - branchRect.top) + "px";
        }

        function drawConnections() {
            if (interactive.hidden || window.matchMedia("(max-width: 700px)").matches) {
                return;
            }

            alignParameterBranch();

            requestAnimationFrame(function () {
                const inputStart = offsetPoint(point(input, "right", "center"), 10, 0);
                const cnnEnd = offsetPoint(point(cnn, "center", "top"), 0, -10);
                const paramsStart = offsetPoint(point(params, "left", "center"), -10, 0);
                const forwardEnd = offsetPoint(point(forward, "right", "center"), 10, 0);
                const inverseEnd = offsetPoint(point(inverse, "right", "center"), 10, 0);

                inputCnnPath.setAttribute("d", curve(inputStart, cnnEnd, "input-cnn"));
                paramsForwardPath.setAttribute("d", curve(paramsStart, forwardEnd, "parameter"));
                paramsInversePath.setAttribute("d", curve(paramsStart, inverseEnd, "parameter"));
            });
        }

        function scheduleConnectionsUpdate() {
            if (interactive.hidden) return;
            let attempts = 0;
            const maxAttempts = 10;

            function tryUpdate() {
                attempts++;
                drawConnections();

                const cnnRect = cnn.getBoundingClientRect();
                const paramsRect = params.getBoundingClientRect();

                if (attempts < maxAttempts && (cnnRect.width === 0 || paramsRect.width === 0)) {
                    setTimeout(tryUpdate, Math.pow(2, attempts) * 50);
                }
            }

            requestAnimationFrame(tryUpdate);
        }

        function offsetPoint(p, dx = 0, dy = 0) {
            return {
                x: p.x + dx,
                y: p.y + dy,
            };
        }

        function syncDetailHeight() {
            if (interactive.hidden) return;

            if (window.matchMedia("(max-width: 1020px)").matches) {
                interactive.style.removeProperty("--ia-detail-height");
                return;
            }

            const height = Math.ceil(diagram.getBoundingClientRect().height);
            if (height > 0) {
                interactive.style.setProperty("--ia-detail-height", height + "px");
            }
        }

        if (previous) {
            previous.addEventListener("click", function () {
                const index = activeIndex();
                if (index > 0) {
                    nodes[index - 1].click();
                    nodes[index - 1].focus({ preventScroll: true });
                }
            });
        }

        if (next) {
            next.addEventListener("click", function () {
                const index = activeIndex();
                if (index >= 0 && index < nodes.length - 1) {
                    nodes[index + 1].click();
                    nodes[index + 1].focus({ preventScroll: true });
                }
            });
        }

        const nodeObserver = new MutationObserver(function () {
            syncDetailState();
        });

        nodes.forEach(function (node) {
            nodeObserver.observe(node, {
                attributes: true,
                attributeFilter: ["aria-selected"],
            });
        });

        const modeObserver = new MutationObserver(function () {
            if (!interactive.hidden) {
                requestAnimationFrame(function () {
                    drawConnections();
                    syncDetailHeight();
                });
            }
        });

        modeObserver.observe(interactive, {
            attributes: true,
            attributeFilter: ["hidden"],
        });

        const resizeObserver = new ResizeObserver(function () {
            drawConnections();
            syncDetailHeight();
        });

        resizeObserver.observe(diagram);
        resizeObserver.observe(mainBranch);
        resizeObserver.observe(parameterBranch);
        resizeObserver.observe(input);
        resizeObserver.observe(cnn);
        resizeObserver.observe(params);
        resizeObserver.observe(forward);
        resizeObserver.observe(inverse);

        window.addEventListener("resize", function () {
            drawConnections();
            syncDetailHeight();
        });

        window.addEventListener("load", function () {
            scheduleConnectionsUpdate();
            syncDetailHeight();
        });

        syncDetailState();
        requestAnimationFrame(function () {
            scheduleConnectionsUpdate();
            syncDetailHeight();
        });
    })();
}
