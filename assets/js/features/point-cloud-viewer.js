(function () {
    "use strict";

    function clamp(value, minValue, maxValue) {
        return Math.min(maxValue, Math.max(minValue, value));
    }

    function normalize3(v) {
        const length = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / length, v[1] / length, v[2] / length];
    }

    function subtract3(a, b) {
        return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }

    function cross3(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }

    function mat4Perspective(fovy, aspect, near, far) {
        const f = 1 / Math.tan(fovy / 2);
        const nf = 1 / (near - far);
        return new Float32Array([
            f / aspect,
            0,
            0,
            0,
            0,
            f,
            0,
            0,
            0,
            0,
            (far + near) * nf,
            -1,
            0,
            0,
            2 * far * near * nf,
            0,
        ]);
    }

    function mat4LookAt(eye, center, up) {
        const z = normalize3(subtract3(eye, center));
        const x = normalize3(cross3(up, z));
        const y = cross3(z, x);

        return new Float32Array([
            x[0],
            y[0],
            z[0],
            0,
            x[1],
            y[1],
            z[1],
            0,
            x[2],
            y[2],
            z[2],
            0,
            -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
            -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
            -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
            1,
        ]);
    }

    function mat4Multiply(a, b) {
        const out = new Float32Array(16);
        for (let column = 0; column < 4; column += 1) {
            for (let row = 0; row < 4; row += 1) {
                out[column * 4 + row] =
                    a[0 * 4 + row] * b[column * 4 + 0] +
                    a[1 * 4 + row] * b[column * 4 + 1] +
                    a[2 * 4 + row] * b[column * 4 + 2] +
                    a[3 * 4 + row] * b[column * 4 + 3];
            }
        }
        return out;
    }

    function compileShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader) || "Shader compilation failed";
            gl.deleteShader(shader);
            throw new Error(message);
        }
        return shader;
    }

    function createProgram(gl, vertexSource, fragmentSource) {
        const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const message = gl.getProgramInfoLog(program) || "Program linking failed";
            gl.deleteProgram(program);
            throw new Error(message);
        }
        return program;
    }

    function buildBoxLines(bounds) {
        const min = bounds.min;
        const max = bounds.max;
        const corners = [
            [min[0], min[1], min[2]],
            [max[0], min[1], min[2]],
            [max[0], max[1], min[2]],
            [min[0], max[1], min[2]],
            [min[0], min[1], max[2]],
            [max[0], min[1], max[2]],
            [max[0], max[1], max[2]],
            [min[0], max[1], max[2]],
        ];
        const edges = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
        const positions = new Float32Array(edges.length * 3);
        const colors = new Float32Array(edges.length * 3);
        for (let i = 0; i < edges.length; i += 1) {
            const p = corners[edges[i]];
            const offset = i * 3;
            positions[offset] = p[0];
            positions[offset + 1] = p[1];
            positions[offset + 2] = p[2];
            colors[offset] = 0.42;
            colors[offset + 1] = 0.44;
            colors[offset + 2] = 0.47;
        }
        return { positions: positions, colors: colors };
    }

    function buildAxesLines(length) {
        const positions = new Float32Array([
            0,
            0,
            0,
            length,
            0,
            0,
            0,
            0,
            0,
            0,
            length,
            0,
            0,
            0,
            0,
            0,
            0,
            length,
        ]);
        const colors = new Float32Array([
            0.95, 0.18, 0.15, 0.95, 0.18, 0.15, 0.2, 0.88, 0.32, 0.2, 0.88, 0.32, 0.22, 0.45, 1.0, 0.22,
            0.45, 1.0,
        ]);
        return { positions: positions, colors: colors };
    }

    function PointCloudViewer(container, options) {
        if (!container) {
            throw new Error("PointCloudViewer requires a container element.");
        }

        this.container = container;
        this.options = options || {};
        this.canvas = document.createElement("canvas");
        this.canvas.setAttribute("aria-hidden", "true");
        this.container.insertBefore(this.canvas, this.container.firstChild);

        this.gl = this.canvas.getContext("webgl2", {
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
            powerPreference: "high-performance",
        });

        if (!this.gl) {
            this.gl = this.canvas.getContext("webgl", {
                antialias: true,
                alpha: true,
                preserveDrawingBuffer: true,
            });
        }

        if (!this.gl) {
            throw new Error("WebGL is unavailable in this browser.");
        }

        this.isWebGL2 =
            typeof WebGL2RenderingContext !== "undefined" && this.gl instanceof WebGL2RenderingContext;
        this.pointCount = 0;
        this.lineCount = 0;
        this.axesCount = 0;
        this.pointSize = 3;
        this.showFrame = true;
        this.showAxes = false;
        this.dark = true;
        this.autoRotate = true;
        this.autoRotatePausedUntil = 0;
        this.onInteraction = null;
        this.camera = {
            yaw: 0.78,
            pitch: 0.42,
            distance: 7.8,
            target: [0, 0, 0],
        };
        this.defaultCamera = JSON.parse(JSON.stringify(this.camera));
        this.onCameraChange = null;
        this.syncGuard = false;
        this.pointerState = new Map();
        this.dragState = null;
        this.lastPinchDistance = null;
        this.lastPinchCenter = null;

        this._initGL();
        this._initEvents();
        this._initResize();
        this._renderLoop = this._renderLoop.bind(this);
        requestAnimationFrame(this._renderLoop);
    }

    PointCloudViewer.prototype._initGL = function () {
        const gl = this.gl;
        const vertexSource = this.isWebGL2
            ? `#version 300 es
      precision highp float;
      in vec3 aPosition;
      in vec3 aColor;
      uniform mat4 uMVP;
      uniform float uPointSize;
      out vec3 vColor;
      void main() {
        gl_Position = uMVP * vec4(aPosition, 1.0);
        gl_PointSize = uPointSize;
        vColor = aColor;
      }
    `
            : `
      precision highp float;
      attribute vec3 aPosition;
      attribute vec3 aColor;
      uniform mat4 uMVP;
      uniform float uPointSize;
      varying vec3 vColor;
      void main() {
        gl_Position = uMVP * vec4(aPosition, 1.0);
        gl_PointSize = uPointSize;
        vColor = aColor;
      }
    `;

        const fragmentSource = this.isWebGL2
            ? `#version 300 es
      precision highp float;
      in vec3 vColor;
      uniform bool uIsPoint;
      out vec4 outColor;
      vec3 linearToSrgb(vec3 c) {
        vec3 lo = 12.92 * c;
        vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
        return mix(hi, lo, lessThanEqual(c, vec3(0.0031308)));
      }
      void main() {
        if (uIsPoint) {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float d = dot(q, q);
          if (d > 1.0) discard;
          outColor = vec4(linearToSrgb(vColor), 1.0);
        } else {
          outColor = vec4(vColor, 0.72);
        }
      }
    `
            : `
      precision highp float;
      varying vec3 vColor;
      uniform bool uIsPoint;
      vec3 linearToSrgb(vec3 c) {
        vec3 lo = 12.92 * c;
        vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
        return mix(hi, lo, lessThanEqual(c, vec3(0.0031308)));
      }
      void main() {
        if (uIsPoint) {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float d = dot(q, q);
          if (d > 1.0) discard;
          gl_FragColor = vec4(linearToSrgb(vColor), 1.0);
        } else {
          gl_FragColor = vec4(vColor, 0.72);
        }
      }
    `;

        this.program = createProgram(gl, vertexSource, fragmentSource);
        this.locations = {
            position: gl.getAttribLocation(this.program, "aPosition"),
            color: gl.getAttribLocation(this.program, "aColor"),
            mvp: gl.getUniformLocation(this.program, "uMVP"),
            pointSize: gl.getUniformLocation(this.program, "uPointSize"),
            isPoint: gl.getUniformLocation(this.program, "uIsPoint"),
        };

        this.pointPositionBuffer = gl.createBuffer();
        this.pointColorBuffer = gl.createBuffer();
        this.linePositionBuffer = gl.createBuffer();
        this.lineColorBuffer = gl.createBuffer();
        this.axesPositionBuffer = gl.createBuffer();
        this.axesColorBuffer = gl.createBuffer();

        const axes = buildAxesLines(1.2);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.axesPositionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, axes.positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.axesColorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, axes.colors, gl.STATIC_DRAW);
        this.axesCount = axes.positions.length / 3;

        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    };

    PointCloudViewer.prototype._initResize = function () {
        const resize = () => {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const rect = this.container.getBoundingClientRect();
            const width = Math.max(2, Math.round(rect.width * dpr));
            const height = Math.max(2, Math.round(rect.height * dpr));
            if (this.canvas.width !== width || this.canvas.height !== height) {
                this.canvas.width = width;
                this.canvas.height = height;
            }
        };

        if (typeof ResizeObserver !== "undefined") {
            this.resizeObserver = new ResizeObserver(resize);
            this.resizeObserver.observe(this.container);
        } else {
            window.addEventListener("resize", resize);
        }
        resize();
    };

    PointCloudViewer.prototype._initEvents = function () {
        const canvas = this.canvas;
        canvas.addEventListener("contextmenu", function (event) {
            event.preventDefault();
        });

        canvas.addEventListener("pointerdown", (event) => {
            this._notifyInteraction("start");
            canvas.setPointerCapture(event.pointerId);
            this.pointerState.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (this.pointerState.size === 1) {
                const mode = event.button === 2 || event.button === 1 || event.shiftKey ? "pan" : "rotate";
                this.dragState = { x: event.clientX, y: event.clientY, mode: mode };
            }
        });

        canvas.addEventListener("pointermove", (event) => {
            if (!this.pointerState.has(event.pointerId)) {
                return;
            }
            this._notifyInteraction("move");
            this.pointerState.set(event.pointerId, { x: event.clientX, y: event.clientY });

            if (this.pointerState.size >= 2) {
                const points = Array.from(this.pointerState.values()).slice(0, 2);
                const dx = points[1].x - points[0].x;
                const dy = points[1].y - points[0].y;
                const distance = Math.hypot(dx, dy);
                const center = [(points[0].x + points[1].x) * 0.5, (points[0].y + points[1].y) * 0.5];
                if (this.lastPinchDistance !== null && this.lastPinchDistance > 0) {
                    this.camera.distance *= this.lastPinchDistance / Math.max(distance, 1);
                    this.camera.distance = clamp(this.camera.distance, 0.45, 18);
                }
                if (this.lastPinchCenter) {
                    this._pan(center[0] - this.lastPinchCenter[0], center[1] - this.lastPinchCenter[1]);
                }
                this.lastPinchDistance = distance;
                this.lastPinchCenter = center;
                this._emitCameraChange();
                return;
            }

            if (!this.dragState) {
                return;
            }
            const dx = event.clientX - this.dragState.x;
            const dy = event.clientY - this.dragState.y;
            this.dragState.x = event.clientX;
            this.dragState.y = event.clientY;

            if (this.dragState.mode === "rotate") {
                this.camera.yaw -= dx * 0.007;
                this.camera.pitch = clamp(this.camera.pitch + dy * 0.007, -1.45, 1.45);
            } else {
                this._pan(dx, dy);
            }
            this._emitCameraChange();
        });

        const endPointer = (event) => {
            this.pointerState.delete(event.pointerId);
            if (this.pointerState.size === 0) {
                this._notifyInteraction("end");
                this.dragState = null;
                this.lastPinchDistance = null;
                this.lastPinchCenter = null;
            }
        };

        canvas.addEventListener("pointerup", endPointer);
        canvas.addEventListener("pointercancel", endPointer);

        canvas.addEventListener(
            "wheel",
            (event) => {
                this._notifyInteraction("end");
                event.preventDefault();
                this.camera.distance *= Math.exp(event.deltaY * 0.0012);
                this.camera.distance = clamp(this.camera.distance, 0.45, 18);
                this._emitCameraChange();
            },
            { passive: false },
        );

        canvas.addEventListener("dblclick", () => {
            this._notifyInteraction("end");
            this.resetView();
        });
    };

    PointCloudViewer.prototype._pan = function (dx, dy) {
        const cameraData = this._cameraVectors();
        const rect = this.canvas.getBoundingClientRect();
        const scale =
            (this.camera.distance * Math.tan((42 * Math.PI) / 360) * 2) / Math.max(rect.height, 1);
        const target = this.camera.target;
        target[0] += (-cameraData.right[0] * dx + cameraData.up[0] * dy) * scale;
        target[1] += (-cameraData.right[1] * dx + cameraData.up[1] * dy) * scale;
        target[2] += (-cameraData.right[2] * dx + cameraData.up[2] * dy) * scale;
    };

    PointCloudViewer.prototype._cameraVectors = function () {
        const cp = Math.cos(this.camera.pitch);
        const sp = Math.sin(this.camera.pitch);
        const sy = Math.sin(this.camera.yaw);
        const cy = Math.cos(this.camera.yaw);
        const target = this.camera.target;
        const eye = [
            target[0] + this.camera.distance * cp * sy,
            target[1] + this.camera.distance * sp,
            target[2] + this.camera.distance * cp * cy,
        ];
        const forward = normalize3(subtract3(target, eye));
        const right = normalize3(cross3(forward, [0, 1, 0]));
        const up = normalize3(cross3(right, forward));
        return { eye: eye, forward: forward, right: right, up: up };
    };

    PointCloudViewer.prototype._emitCameraChange = function () {
        if (this.syncGuard || typeof this.onCameraChange !== "function") {
            return;
        }
        this.onCameraChange(this.getCameraState());
    };

    PointCloudViewer.prototype.getCameraState = function () {
        return {
            yaw: this.camera.yaw,
            pitch: this.camera.pitch,
            distance: this.camera.distance,
            target: this.camera.target.slice(),
        };
    };

    PointCloudViewer.prototype.setCameraState = function (state, silent) {
        if (!state) {
            return;
        }
        this.syncGuard = true;
        this.camera.yaw = state.yaw;
        this.camera.pitch = state.pitch;
        this.camera.distance = state.distance;
        this.camera.target = state.target.slice();
        this.syncGuard = false;
        if (!silent) {
            this._emitCameraChange();
        }
    };

    PointCloudViewer.prototype.setData = function (positions, colors, bounds) {
        const gl = this.gl;
        if (!(positions instanceof Float32Array) || !(colors instanceof Float32Array)) {
            throw new Error("Point positions and colors must be Float32Array values.");
        }
        if (positions.length !== colors.length) {
            throw new Error("Point position and color buffers must have equal lengths.");
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.pointPositionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.pointColorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
        this.pointCount = positions.length / 3;

        const box = buildBoxLines(bounds || { min: [-1, -1, -1], max: [1, 1, 1] });
        gl.bindBuffer(gl.ARRAY_BUFFER, this.linePositionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, box.positions, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lineColorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, box.colors, gl.STATIC_DRAW);
        this.lineCount = box.positions.length / 3;
    };

    PointCloudViewer.prototype.setPointSize = function (value) {
        this.pointSize = clamp(Number(value) || 3, 1, 18);
    };

    PointCloudViewer.prototype.setTheme = function (dark) {
        this.dark = Boolean(dark);
        this.container.classList.toggle("is-light", !this.dark);
    };

    PointCloudViewer.prototype.setHelpers = function (showFrame, showAxes) {
        this.showFrame = Boolean(showFrame);
        this.showAxes = false;
        this.showAxisGizmo = Boolean(showAxes);
        this.container.classList.toggle("show-axis-labels", this.showAxisGizmo);
    };

    PointCloudViewer.prototype._notifyInteraction = function (phase) {
        const pausedUntil = phase === "start" || phase === "move" ? Infinity : Date.now() + 5000;
        this.autoRotatePausedUntil = pausedUntil;
        if (typeof this.onInteraction === "function") {
            this.onInteraction(phase, pausedUntil);
        }
    };

    PointCloudViewer.prototype.setAutoRotatePause = function (pausedUntil) {
        this.autoRotatePausedUntil = pausedUntil;
    };

    PointCloudViewer.prototype.setAutoRotate = function (enabled) {
        this.autoRotate = Boolean(enabled);
        if (this.autoRotate) {
            this.autoRotatePausedUntil = Math.min(this.autoRotatePausedUntil, Date.now());
        }
    };

    PointCloudViewer.prototype.resetView = function () {
        this.setCameraState(this.defaultCamera, true);
        this._emitCameraChange();
    };

    PointCloudViewer.prototype._bindAttributes = function (positionBuffer, colorBuffer) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(this.locations.position);
        gl.vertexAttribPointer(this.locations.position, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
        gl.enableVertexAttribArray(this.locations.color);
        gl.vertexAttribPointer(this.locations.color, 3, gl.FLOAT, false, 0, 0);
    };

    PointCloudViewer.prototype._draw = function () {
        const gl = this.gl;
        const width = this.canvas.width;
        const height = this.canvas.height;
        if (width < 2 || height < 2) {
            return;
        }

        gl.viewport(0, 0, width, height);
        if (this.dark) {
            gl.clearColor(0.05, 0.058, 0.071, 1);
        } else {
            gl.clearColor(0.956, 0.956, 0.934, 1);
        }
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const cameraData = this._cameraVectors();
        const projection = mat4Perspective((42 * Math.PI) / 180, width / height, 0.01, 100);
        const view = mat4LookAt(cameraData.eye, this.camera.target, [0, 1, 0]);
        const mvp = mat4Multiply(projection, view);

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.locations.mvp, false, mvp);
        gl.uniform1f(this.locations.pointSize, this.pointSize * Math.min(2, window.devicePixelRatio || 1));

        if (this.showFrame && this.lineCount > 0) {
            gl.uniform1i(this.locations.isPoint, 0);
            this._bindAttributes(this.linePositionBuffer, this.lineColorBuffer);
            gl.drawArrays(gl.LINES, 0, this.lineCount);
        }

        if (this.showAxes && this.axesCount > 0) {
            gl.uniform1i(this.locations.isPoint, 0);
            this._bindAttributes(this.axesPositionBuffer, this.axesColorBuffer);
            gl.drawArrays(gl.LINES, 0, this.axesCount);
        }

        if (this.pointCount > 0) {
            gl.uniform1i(this.locations.isPoint, 1);
            this._bindAttributes(this.pointPositionBuffer, this.pointColorBuffer);
            gl.drawArrays(gl.POINTS, 0, this.pointCount);
        }
    };

    PointCloudViewer.prototype._renderLoop = function () {
        if (this.autoRotate && Date.now() >= this.autoRotatePausedUntil) {
            this.camera.yaw += 0.0022;
            this._emitCameraChange();
        }
        this._draw();
        requestAnimationFrame(this._renderLoop);
    };

    window.PointCloudViewer = PointCloudViewer;
})();
