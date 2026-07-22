"use strict";
window.MathJax = {
                tex: {
                    inlineMath: [["\\(", "\\)"]],
                    displayMath: [["\\[", "\\]"]],
                },
                startup: {
                    ready: function () {
                        MathJax.startup.defaultReady();
                        if (typeof MathJax.typesetPromise === "function") {
                            MathJax.typesetPromise();
                        }
                    },
                },
            };
