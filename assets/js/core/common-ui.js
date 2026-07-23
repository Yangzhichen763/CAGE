"use strict";


window.toggleAcknowledgement = function toggleAcknowledgement() {
    const header = document.querySelector("#acknowledgement .collapsible-header");
    const content = document.getElementById("ack-content");
    if (!header || !content) return;

    header.classList.toggle("expanded");
    content.classList.toggle("open");
    header.setAttribute("aria-expanded", String(content.classList.contains("open")));
};

function initCommonUI() {
    if (window.__CAGE_COMMON_UI_INITIALIZED__) return;
    window.__CAGE_COMMON_UI_INITIALIZED__ = true;
    const themeToggle = document.getElementById("theme-toggle");
    const html = document.documentElement;

    function applyTheme(theme) {
        html.setAttribute("data-theme", theme);
    }

    function getSystemTheme() {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }

    let savedTheme = null;
    try {
        savedTheme = localStorage.getItem("theme");
    } catch (error) {
        console.warn("Theme storage is unavailable:", error);
    }
    applyTheme(savedTheme || getSystemTheme());

    themeToggle.addEventListener("click", function () {
        const current = html.getAttribute("data-theme") || "light";
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        try {
            localStorage.setItem("theme", next);
        } catch (error) {
            console.warn("Theme storage is unavailable:", error);
        }
        document.dispatchEvent(new CustomEvent("theme-change"));
    });

    const observerOptions = {
        root: null,
        rootMargin: "0px 0px -50px 0px",
        threshold: 0.1,
    };

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll(".animate-on-scroll").forEach(function (el) {
        observer.observe(el);
    });

    const navLinks = document.querySelectorAll("nav.top ul li a");
    const sections = document.querySelectorAll("section[id]");
    let rafId = null;

    function updateActiveNav() {
        let currentSection = "";
        const scrollPos = window.scrollY + 100;

        sections.forEach(function (section) {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                currentSection = section.getAttribute("id");
            }
        });

        if (!currentSection && sections.length > 0) {
            const lastSection = sections[sections.length - 1];
            if (scrollPos >= lastSection.offsetTop) {
                currentSection = lastSection.getAttribute("id");
            }
        }

        navLinks.forEach(function (link) {
            link.classList.remove("active");
            if (link.getAttribute("href") === "#" + currentSection) {
                link.classList.add("active");
            }
        });
    }

    function throttledUpdateActiveNav() {
        if (!rafId) {
            rafId = requestAnimationFrame(function () {
                updateActiveNav();
                rafId = null;
            });
        }
    }

    window.addEventListener("scroll", throttledUpdateActiveNav);
    updateActiveNav();

    document.getElementById("copy-bibtex").addEventListener("click", function () {
        const bibtexText = `@article{yang2026cage,
  title={Towards Color-faithful Low-light Image Enhancement via Adaptive Color Debiasing and Saturation Rectification},
  author={Yang, Zhichen and Li, Fusheng and Xu, Rui and Da, Hui and Niu, Yuzhen and Cheng, Ri},
  journal={Proceedings of the ACM International Conference on Multimedia},
  year={2026}
}`;

        navigator.clipboard
            .writeText(bibtexText)
            .then(function () {
                const btn = document.getElementById("copy-bibtex");
                const originalText = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                btn.style.background = "#4ecdc4";
                setTimeout(function () {
                    btn.innerHTML = originalText;
                    btn.style.background = "#e0e0e0";
                }, 2000);
            })
            .catch(function (err) {
                console.error("Failed to copy:", err);
            });
    });

    document.getElementById("copy-bibtex-urwkv").addEventListener("click", function () {
        const bibtexText = `@inproceedings{IR.URWKV,
  title     = {{URWKV}: Unified {RWKV} model with multi-state perspective for low-light image restoration},
  author    = {Xu, Rui and Niu, Yuzhen and Li, Yuezhou and Xu, Huangbiao and Liu, Wenxi and Chen, Yuzhong},
  booktitle = {Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition},
  pages     = {21267--21276},
  year      = {2025}
}`;

        navigator.clipboard
            .writeText(bibtexText)
            .then(function () {
                const btn = document.getElementById("copy-bibtex-urwkv");
                const originalText = btn.innerHTML;
                btn.innerHTML = "Copied!";
                btn.style.background = "#4CAF50";
                setTimeout(function () {
                    btn.innerHTML = originalText;
                    btn.style.background = "#e0e0e0";
                }, 2000);
            })
            .catch(function (err) {
                console.error("Failed to copy:", err);
            });
    });

    const acknowledgementHeader = document.querySelector("#acknowledgement .collapsible-header");
    if (acknowledgementHeader && acknowledgementHeader.dataset.action === "toggle-acknowledgement") {
        acknowledgementHeader.addEventListener("click", window.toggleAcknowledgement);
    }
    if (acknowledgementHeader) {
        acknowledgementHeader.setAttribute("role", "button");
        acknowledgementHeader.setAttribute("tabindex", "0");
        acknowledgementHeader.setAttribute("aria-expanded", "false");
        acknowledgementHeader.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleAcknowledgement();
            }
        });
    }

    const stickyHeader = document.getElementById("accordion-sticky");
    let activeHeader = null;

    function updateStickyHeader() {
        if (!activeHeader) {
            stickyHeader.classList.remove("visible");
            return;
        }

        const navTop = document.querySelector("nav.top");
        const navHeight = navTop ? navTop.offsetHeight : 56;
        const headerRect = activeHeader.getBoundingClientRect();
        const contentRect = activeHeader.nextElementSibling.getBoundingClientRect();

        const shouldShow = headerRect.bottom < navHeight && contentRect.bottom > navHeight;

        if (shouldShow) {
            stickyHeader.classList.add("visible");
            stickyHeader.querySelector("h3").textContent = activeHeader.querySelector("h3").textContent;
            stickyHeader.querySelector(".accordion-icon").style.transform = "rotate(180deg)";
        } else {
            stickyHeader.classList.remove("visible");
        }
    }

    window.addEventListener("scroll", function () {
        const stickyTriggers = document.querySelectorAll(".accordion-header.sticky-trigger");
        const navTop = document.querySelector("nav.top");
        const navHeight = navTop ? navTop.offsetHeight : 56;
        
        stickyTriggers.forEach(function (header) {
            const rect = header.getBoundingClientRect();
            if (rect.top <= navHeight && rect.bottom > navHeight) {
                header.classList.add("stuck");
            } else {
                header.classList.remove("stuck");
            }
        });
        
        updateStickyHeader();
    });

    document.querySelectorAll(".accordion-header").forEach(function (header) {
        header.setAttribute("role", "button");
        header.setAttribute("tabindex", "0");
        header.setAttribute("aria-expanded", "false");
        header.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                header.click();
            }
        });
        header.addEventListener("click", function () {
            const content = this.nextElementSibling;
            const icon = this.querySelector(".accordion-icon");
            const isOpen = content.classList.contains("open");

            if (!isOpen) {
                content.classList.add("open");
                this.classList.add("active");
                this.setAttribute("aria-expanded", "true");
                activeHeader = this;
            } else {
                content.classList.remove("open");
                this.classList.remove("active");
                this.setAttribute("aria-expanded", "false");
                const openHeaders = document.querySelectorAll(".accordion-header.active");
                activeHeader = openHeaders.length > 0 ? openHeaders[0] : null;
            }

            updateStickyHeader();
        });
    });

    stickyHeader.addEventListener("click", function () {
        if (activeHeader) {
            activeHeader.click();
        }
    });

    window.addEventListener("scroll", updateStickyHeader);
    window.addEventListener("resize", updateStickyHeader);

}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCommonUI, { once: true });
} else {
    initCommonUI();
}

window.CAGECommonUI = { init: initCommonUI };
