(function () {
    "use strict";

    const PI = Math.PI;
    const TWO_PI = 2 * Math.PI;
    const EPS = 1e-12;

    const SPACE_INFO = {
        RGB: {
            label: "RGB coordinates",
            displayName: "RGB",
            axes: ["B", "G", "R"],
            description: "Each point retains its sRGB channel coordinates and source color.",
            forwardText: "No conversion is applied. The point coordinates are the normalized sRGB channels (R, G, B).",
            inverseText: "No inverse conversion is required. The stored channels are read directly as sRGB.",
            forwardLines: [],
            inverseLines: [],
        },
        YUV: {
            label: "YUV coordinates",
            displayName: "YUV",
            axes: ["V", "Y", "U"],
            description: "BT.601-style luma and chroma coordinates are derived from linear RGB. Luma is placed on the vertical axis.",
            forwardLines: [
                String.raw`Y=0.299R+0.587G+0.114B`,
                String.raw`U=-0.169R-0.331G+0.500B`,
                String.raw`V=0.500R-0.419G-0.081B`,
            ],
            inverseLines: [
                String.raw`R=Y+1.402V`,
                String.raw`G=Y-0.344U-0.714V`,
                String.raw`B=Y+1.772U`,
            ],
        },
        HSV: {
            label: "HSV cylindrical coordinates",
            displayName: "HSV",
            axes: ["v", "V", "h"],
            description: "describes color through hue, saturation, and value, offering an intuitive structure for color selection and adjustment.",
            forwardLines: [
                String.raw`M=\max(R,G,B),\quad m=\min(R,G,B),\quad \Delta=M-m`,
                String.raw`V=M,\qquad S=\begin{cases}0,&M=0\\ \Delta/M,&M>0\end{cases}`,
                String.raw`H=\frac{1}{6}\begin{cases}0,&\Delta=0\\ ((G-B)/\Delta)\bmod 6,&M=R\\ (B-R)/\Delta+2,&M=G\\ (R-G)/\Delta+4,&M=B\end{cases}`,
            ],
            inverseLines: [
                String.raw`C=VS,\quad X=C\left(1-\left|((6H)\bmod 2)-1\right|\right),\quad m=V-C`,
                String.raw`(R',G',B')=\begin{cases}(C,X,0),&0\leq6H<1\\(X,C,0),&1\leq6H<2\\(0,C,X),&2\leq6H<3\\(0,X,C),&3\leq6H<4\\(X,0,C),&4\leq6H<5\\(C,0,X),&5\leq6H<6\end{cases}`,
                String.raw`(R,G,B)=(R'+m,G'+m,B'+m)`,
            ],
        },
        HVI: {
            label: "HVI coordinates",
            displayName: "HVI",
            axes: ["v", "I", "h"],
            description: "HVI maps hue into two chromatic axes and uses intensity to organize low-light color distributions more continuously.",
            forwardLines: [
                String.raw`(H,S,I)=T_\operatorname{RGB \rightarrow HSV}(R,G,B)`,
                String.raw`\kappa(I)=\left[\sin\left(\frac{\pi I}{2}\right)+\varepsilon\right]^k`,
                String.raw`C_h=\kappa(I)S\cos(2\pi H),\qquad C_v=\kappa(I)S\sin(2\pi H)`,
                String.raw`\mathbf{p}=(C_h,I,C_v)`,
            ],
            inverseLines: [
                String.raw`H=\left(\frac{\operatorname{arctan2}(C_v,C_h)}{2\pi}\right)\bmod 1`,
                String.raw`S=\frac{\sqrt{C_h^2+C_v^2}}{\kappa(I)},\qquad V=I`,
                String.raw`(R,G,B)=T_\operatorname{HSV \rightarrow RGB}(H,S,V)`,
            ],
        },
        OKLAB: {
            label: "OKLab cylindrical coordinates",
            displayName: "OKLab",
            axes: ["B", "L", "A"],
            description: "sRGB is converted to linear RGB, mapped to LMS, cube-rooted, and expressed with opponent channels a, lightness L, and b.",
            forwardLines: [
                String.raw`\begin{bmatrix}l\\m\\s\end{bmatrix}=M_1\begin{bmatrix}R  \\G  \\B  \end{bmatrix}`,
                String.raw`\begin{bmatrix}L\\a\\b\end{bmatrix}=M_2\begin{bmatrix}\sqrt[3]{l}\\\sqrt[3]{m}\\\sqrt[3]{s}\end{bmatrix}`,
                String.raw`C=\sqrt{a^2+b^2},\qquad h=\operatorname{atan2}(b,a)`,
                String.raw`\mathbf{p}=(C\cos h,L,C\sin h)=(a,L,b)`,
            ],
            inverseLines: [
                String.raw`a=C\cos h,\qquad b=C\sin h`,
                String.raw`\begin{bmatrix}l'\\m'\\s'\end{bmatrix}=M_2^{-1}\begin{bmatrix}L\\a\\b\end{bmatrix}`,
                String.raw`\begin{bmatrix}R'\\G'\\B'\end{bmatrix}=M_1^{-1}\begin{bmatrix}(l')^3\\(m')^3\\(s')^3\end{bmatrix}`,
                String.raw`(R,G,B)=\operatorname{sRGBCompand}(R',G',B')`,
            ],
        },
    };

    function clamp01(value) {
        return Math.min(1, Math.max(0, value));
    }

    function srgbToLinearTransform(value) {
        const c = clamp01(value);
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    function srgbToLinearDisplay(value) {
        const c = clamp01(value);
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }

    function rgbToHSV(r, g, b) {
        r = clamp01(r);
        g = clamp01(g);
        b = clamp01(b);

        const maxValue = Math.max(r, g, b);
        const minValue = Math.min(r, g, b);
        const delta = maxValue - minValue;
        const value = maxValue;

        let hue = 0;
        if (delta > 1e-8) {
            if (maxValue === r) {
                hue = ((g - b) / delta) % 6;
            } else if (maxValue === g) {
                hue = 2 + (b - r) / delta;
            } else {
                hue = 4 + (r - g) / delta;
            }
            hue = (((hue / 6) % 1) + 1) % 1;
        }

        const saturation = value > 1e-8 ? delta / value : 0;
        return [hue, saturation, value];
    }

    function rgbToYUV(r, g, b) {
        const rl = srgbToLinearTransform(r);
        const gl = srgbToLinearTransform(g);
        const bl = srgbToLinearTransform(b);

        const y = 0.299 * rl + 0.587 * gl + 0.114 * bl;
        const u = -0.168736 * rl - 0.331264 * gl + 0.5 * bl;
        const v = 0.5 * rl - 0.418688 * gl - 0.081312 * bl;
        return [u, y, v];
    }

    function rgbToHVI(r, g, b, density) {
        const hsv = rgbToHSV(r, g, b);
        const hue = hsv[0];
        const saturation = hsv[1];
        const intensity = hsv[2];
        const k = Number.isFinite(density) ? density : 0.2;
        const colorSensitive = Math.pow(Math.sin(intensity * 0.5 * PI) + EPS, k);
        const angle = TWO_PI * hue;
        const ch = colorSensitive * saturation * Math.cos(angle);
        const cv = colorSensitive * saturation * Math.sin(angle);
        return [ch, intensity, cv];
    }

    function rgbToOKLab(r, g, b, projection) {
        const rl = srgbToLinearTransform(r);
        const gl = srgbToLinearTransform(g);
        const bl = srgbToLinearTransform(b);

        const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
        const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
        const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

        const lc = Math.sign(l) * Math.pow(Math.max(Math.abs(l), EPS), 1 / 3);
        const mc = Math.sign(m) * Math.pow(Math.max(Math.abs(m), EPS), 1 / 3);
        const sc = Math.sign(s) * Math.pow(Math.max(Math.abs(s), EPS), 1 / 3);

        const L = 0.2104542553 * lc + 0.793617785 * mc - 0.0040720468 * sc;
        const a = 1.9779984951 * lc - 2.428592205 * mc + 0.4505937099 * sc;
        const bb = 0.0259040371 * lc + 0.7827717662 * mc - 0.808675766 * sc;

        const C = Math.sqrt(a * a + bb * bb);
        const h = ((Math.atan2(bb, a) / (2 * Math.PI)) + 1) % 1;
        if (projection === "cylindrical") {
            return [a, L, bb];
        }
        return [C, L, h];
    }

    function transformPoint(r, g, b, space, options) {
        const opts = options || {};
        switch (space) {
            case "RGB":
                return [r, g, b];
            case "YUV":
                return rgbToYUV(r, g, b);
            case "HSV": {
                const hsv = rgbToHSV(r, g, b);
                if (opts.hsvProjection === "raw") {
                    return [hsv[0], hsv[1], hsv[2]];
                }
                const angle = TWO_PI * hsv[0];
                return [hsv[1] * Math.cos(angle), hsv[2], hsv[1] * Math.sin(angle)];
            }
            case "HVI":
                return rgbToHVI(r, g, b, opts.hviDensity);
            case "OKLAB":
                return rgbToOKLab(r, g, b, opts.labProjection);
            default:
                throw new Error("Unsupported color space: " + space);
        }
    }

    function transformBuffer(rgbBuffer, space, options) {
        const count = Math.floor(rgbBuffer.length / 3);
        const output = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) {
            const offset = i * 3;
            const p = transformPoint(
                rgbBuffer[offset],
                rgbBuffer[offset + 1],
                rgbBuffer[offset + 2],
                space,
                options,
            );
            output[offset] = p[2];
            output[offset + 1] = p[1];
            output[offset + 2] = p[0];
        }
        return output;
    }

    function toLinearDisplayBuffer(rgbBuffer) {
        const output = new Float32Array(rgbBuffer.length);
        for (let i = 0; i < rgbBuffer.length; i += 1) {
            output[i] = srgbToLinearDisplay(rgbBuffer[i]);
        }
        return output;
    }

    function getSpaceInfo(space, options) {
        const opts = options || {};
        const base = SPACE_INFO[space] || SPACE_INFO.RGB;
        const info = {
            label: base.label,
            displayName: base.displayName,
            axes: base.axes.slice(),
            description: base.description,
            forwardText: base.forwardText || "",
            inverseText: base.inverseText || "",
            forwardLines: (base.forwardLines || []).slice(),
            inverseLines: (base.inverseLines || []).slice(),
        };

        if (space === "HSV" && opts.hsvProjection === "raw") {
            info.label = "HSV raw channel coordinates";
            info.axes = ["V", "S", "H"];
            info.description = "Hue, saturation, and value are placed directly on the three axes; the hue seam remains visible at H = 0 and H = 1.";
        }

        if (space === "OKLAB" && opts.labProjection === "cylindrical") {
            info.label = "OKLab cylindrical coordinates";
            info.axes = ["B", "L", "A"];
            info.description = "Opponent channels a and b are placed around the vertical lightness axis, forming a cylindrical gamut.";
        } else if (space === "OKLAB" && opts.labProjection === "cartesian") {
            info.label = "OKLab cartesian coordinates";
            info.axes = ["H", "L", "C"];
            info.description = "Chroma C, lightness L, and hue h are placed directly on the three axes as raw coordinate values.";
        }

        return info;
    }

    window.ColorSpaces = {
        SPACE_INFO: SPACE_INFO,
        transformBuffer: transformBuffer,
        transformPoint: transformPoint,
        toLinearDisplayBuffer: toLinearDisplayBuffer,
        getSpaceInfo: getSpaceInfo,
        clamp01: clamp01,
    };
})();
