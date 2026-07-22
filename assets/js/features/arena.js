"use strict";

let arenaData = [];
let shuffledArenaData = [];

let currentRound = 0;
let selectedIndex = -1;
let isAnswered = false;
let isComparisonMode = false;
let comparisonBaseIndex = -1;
let comparisonBaseSource = "";
let viewerImages = [];
let currentRandomData = null;
let isRandomMode = false;
let voteCounts = {}; // loadVoteCounts();

let consecutiveCorrectCount = 0;
let totalCorrectCount = 0;

const EMOJI_A_CONFIG = [
    { threshold: 1, emoji: "🎉" },
    { threshold: 3, emoji: "🎊" },
    { threshold: 6, emoji: "🍾" },
    { threshold: 10, emoji: "🍻" },
    { threshold: 15, emoji: "🥉" },
    { threshold: 21, emoji: "🥈" },
    { threshold: 28, emoji: "🥇" },
    { threshold: 36, emoji: "🏆" },
];

const EMOJI_D_CONFIG = [
    { threshold: 1, emoji: "🤗" },
    { threshold: 4, emoji: "🥳" },
    { threshold: 8, emoji: "😁" },
    { threshold: 13, emoji: "😄" },
    { threshold: 19, emoji: "😆" },
    { threshold: 26, emoji: "😚" },
    { threshold: 34, emoji: "😘" },
    { threshold: 43, emoji: "🥰" },
];

const SENTENCE_B_CORRECT = [
    "Congratulations!",
    "That's it!",
    "Sharp eye!",
    "Excellent pick!",
    "You got it!",
    "Well spotted!",
    "Perfect pick!",
    "You found it!",
];

const SENTENCE_B_WRONG = [
    "Almost!",
    "Good try!",
    "Nice try!",
    "Keep looking!",
    "That's close!",
];

const SENTENCE_C_CORRECT = [
    "This image was enhanced with our CAGE.",
    "You found our CAGE-enhanced result.",
    "This image was produced with our CAGE.",
    "You picked the result enhanced with our CAGE.",
    "This is our CAGE-enhanced image.",
];

const SENTENCE_C_WRONG = [
    "Perfection takes time, and CAGE keeps evolving.",
    "Every method has room to grow, including ours.",
    "CAGE still has more beauty to unlock.",
    "A hundred pairs of eyes find a hundred kinds of beauty.",
    "Beauty does not always stay the same.",
    "Your eye for beauty helps us discover a wider world.",
];

const EMOJI_D_WRONG = [
    "💪",
    "🚀",
    "💡",
    "📸",
    "🌟",
    "🔍",
    "👀",
];

let lastCorrectBIndex = -1;
let lastCorrectCIndex = -1;
let lastWrongBIndex = -1;
let lastWrongCIndex = -1;
let lastWrongDIndex = -1;

function getEmojiByThreshold(config, count) {
    let emoji = config[0].emoji;
    for (let i = config.length - 1; i >= 0; i--) {
        if (count >= config[i].threshold) {
            emoji = config[i].emoji;
            break;
        }
    }
    return emoji;
}

function getRandomIndex(length, lastIndex) {
    if (length === 0) return -1;
    if (length === 1) return 0;
    let newIndex;
    do {
        newIndex = Math.floor(Math.random() * length);
    } while (newIndex === lastIndex);
    return newIndex;
}

function generateFeedbackMessage(isCorrect) {
    if (isCorrect) {
        consecutiveCorrectCount++;
        totalCorrectCount++;
        
        const emojiA = getEmojiByThreshold(EMOJI_A_CONFIG, consecutiveCorrectCount);
        const emojiD = getEmojiByThreshold(EMOJI_D_CONFIG, totalCorrectCount);
        
        const bIndex = getRandomIndex(SENTENCE_B_CORRECT.length, lastCorrectBIndex);
        const cIndex = getRandomIndex(SENTENCE_C_CORRECT.length, lastCorrectCIndex);
        
        lastCorrectBIndex = bIndex;
        lastCorrectCIndex = cIndex;
        
        return `${emojiA} ${SENTENCE_B_CORRECT[bIndex]} ${SENTENCE_C_CORRECT[cIndex]} ${emojiD}`;
    } else {
        consecutiveCorrectCount = 0;
        
        const bIndex = getRandomIndex(SENTENCE_B_WRONG.length, lastWrongBIndex);
        const cIndex = getRandomIndex(SENTENCE_C_WRONG.length, lastWrongCIndex);
        const dIndex = getRandomIndex(EMOJI_D_WRONG.length, lastWrongDIndex);
        
        lastWrongBIndex = bIndex;
        lastWrongCIndex = cIndex;
        lastWrongDIndex = dIndex;
        
        return `${SENTENCE_B_WRONG[bIndex]} ${SENTENCE_C_WRONG[cIndex]} ${EMOJI_D_WRONG[dIndex]}`;
    }
}

const ARENA_DATA_DEFAULT = [
    {
        input: "examples/input/00700.png",
        outputs: [
            { src: "examples/SNR-Net/00700.png", isCAGE: false },
            { src: "examples/CAGE-DarkIR/00700.png", isCAGE: true },
            { src: "examples/BreaD/00700.png", isCAGE: false },
        ],
    },
    {
        input: "examples/input/00710.png",
        outputs: [
            { src: "examples/DarkIR/00710.png", isCAGE: false },
            { src: "examples/CAGE-DarkIR/00710.png", isCAGE: true },
            { src: "examples/SNR-Net/00710.png", isCAGE: false },
        ],
    },
    {
        input: "examples/input/00720.png",
        outputs: [
            { src: "examples/BreaD/00720.png", isCAGE: false },
            { src: "examples/DarkIR/00720.png", isCAGE: false },
            { src: "examples/CAGE-DarkIR/00720.png", isCAGE: true },
        ],
    },
];

let arenaFileHandle = null;
const ARENA_DB_NAME = "cage_arena_db";
const ARENA_DB_STORE = "file_handles";
const ARENA_DB_KEY = "datas/arena_data_json";

function shuffleArenaData() {
    shuffledArenaData = [...arenaData].sort(() => Math.random() - 0.5);
}

function openArenaDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(ARENA_DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(ARENA_DB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveArenaFileHandle(handle) {
    const db = await openArenaDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ARENA_DB_STORE, "readwrite");
        tx.objectStore(ARENA_DB_STORE).put(handle, ARENA_DB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function loadArenaFileHandle() {
    const db = await openArenaDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ARENA_DB_STORE, "readonly");
        const req = tx.objectStore(ARENA_DB_STORE).get(ARENA_DB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function clearArenaFileHandle() {
    arenaFileHandle = null;
    const db = await openArenaDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(ARENA_DB_STORE, "readwrite");
        tx.objectStore(ARENA_DB_STORE).delete(ARENA_DB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function verifyArenaPermission(handle, readWrite) {
    const opts = { mode: readWrite ? "readwrite" : "read" };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if ((await handle.requestPermission(opts)) === "granted") return true;
    return false;
}

function updateArenaLinkUI(linked) {
    const btn = document.getElementById("arena-link-btn");
    const label = document.getElementById("arena-link-label");
    if (!btn || !label) return;
    if (linked) {
        btn.classList.add("linked");
        label.textContent = "File Linked";
        btn.title = "arena_data.json is linked. Click to relink.";
    } else {
        btn.classList.remove("linked");
        label.textContent = "Link File";
        btn.title = "Link arena_data.json file for persistence";
    }
}

async function linkArenaFile() {
    if (!window.showOpenFilePicker) {
        alert(
            "Your browser does not support the File System Access API. Please use Chrome or Edge (v86+) to enable file persistence. Submissions will fall back to localStorage.",
        );
        return;
    }
    try {
        const [handle] = await window.showOpenFilePicker({
            types: [{ description: "JSON file", accept: { "application/json": [".json"] } }],
            multiple: false,
            suggestedName: "arena_data.json",
        });
        arenaFileHandle = handle;
        await saveArenaFileHandle(handle);
        updateArenaLinkUI(true);
        await loadArenaData();
        loadRound(currentRound);
        const feedback = document.getElementById("arena-feedback");
        if (feedback) {
            feedback.textContent = "✓ arena_data.json linked successfully!";
            feedback.className = "arena-feedback correct";
            setTimeout(() => {
                if (feedback.textContent.startsWith("✓ arena_data.json")) {
                    feedback.textContent = "";
                    feedback.className = "arena-feedback";
                }
            }, 2000);
        }
    } catch (e) {
        if (e.name !== "AbortError") {
            console.error("Failed to link arena_data.json:", e);
        }
    }
}

async function ensureArenaFileHandle(readWrite) {
    if (!arenaFileHandle) {
        try {
            arenaFileHandle = await loadArenaFileHandle();
        } catch (e) {
            /* ignore */
        }
    }
    if (!arenaFileHandle) return false;
    const hasPermission = await verifyArenaPermission(arenaFileHandle, readWrite);
    if (!hasPermission) {
        await clearArenaFileHandle();
    }
    return hasPermission;
}

function cleanArenaPaths(data) {
    if (!data || !Array.isArray(data)) return data;
    return data.map((item) => ({
        ...item,
        input: item.input.replace(/\.examples\/images\//g, "examples/").replace("/images/", "/"),
        outputs: item.outputs.map((output) => ({
            ...output,
            src: output.src.replace(/\.examples\/images\//g, "examples/").replace("/images/", "/"),
        })),
    }));
}

async function loadArenaData() {
    console.log("loadArenaData called");
    const hasAccess = await ensureArenaFileHandle(false);
    console.log("hasAccess:", hasAccess);
    if (hasAccess) {
        try {
            const file = await arenaFileHandle.getFile();
            const text = await file.text();
            arenaData = cleanArenaPaths(JSON.parse(text));
            updateArenaLinkUI(true);
            console.log("Loaded from linked file:", arenaData.length);
            shuffleArenaData();
            currentRound = 0;
            return;
        } catch (e) {
            console.error("Failed to read linked arena_data.json:", e);
            if (e.name === "NotFoundError") {
                await clearArenaFileHandle();
            }
        }
    }
    try {
        const response = await fetch("datas/arena_data.json");
        if (response.ok) {
            const data = await response.json();
            arenaData = cleanArenaPaths(data);
            console.log("Loaded from datas/arena_data.json:", arenaData.length);
        } else {
            throw new Error("HTTP error " + response.status);
        }
    } catch (error) {
        console.warn("Failed to load arena_data.json:", error);
        arenaData = [...ARENA_DATA_DEFAULT];
        console.log("Loaded embedded arena data:", arenaData.length);
    }
    shuffleArenaData();
    currentRound = 0;
    updateArenaLinkUI(!!arenaFileHandle);
}

async function submitCurrentArena() {
    if (!currentRandomData) return;

    try {
        await loadArenaData();
        arenaData.push(currentRandomData);

        const hasAccess = await ensureArenaFileHandle(true);
        const feedback = document.getElementById("arena-feedback");

        if (hasAccess) {
            const writable = await arenaFileHandle.createWritable();
            await writable.write(JSON.stringify(arenaData, null, 2));
            await writable.close();
            feedback.textContent = "✓ Arena data successfully submitted to .json file!";
            feedback.className = "arena-feedback correct";
        } else {
            localStorage.setItem("cage_arena_submissions", JSON.stringify(arenaData));
            feedback.textContent =
                '✓ Saved to browser storage. Click "Link File" to persist to arena_data.json.';
            feedback.className = "arena-feedback correct";
        }

        document.getElementById("arena-submit-btn").style.display = "none";
        document.getElementById("arena-next-btn").style.display = "flex";
    } catch (error) {
        console.error("Error submitting arena data:", error);
        const feedback = document.getElementById("arena-feedback");
        feedback.textContent = "⚠ Failed to submit arena data.";
        feedback.className = "arena-feedback";
    }
}

// function loadVoteCounts() {
//   try {
//     const stored = localStorage.getItem('cage_arena_votes');
//     if (stored) {
//       return JSON.parse(stored);
//     }
//   } catch (error) {
//     console.error('Failed to load vote counts:', error);
//   }
//   return {};
// }

// function saveVoteCounts() {
//   try {
//     localStorage.setItem('cage_arena_votes', JSON.stringify(voteCounts));
//   } catch (error) {
//     console.error('Failed to save vote counts:', error);
//   }
// }

async function initArena() {
    if (window.__CAGE_ARENA_INITIALIZED__) return;
    window.__CAGE_ARENA_INITIALIZED__ = true;
    console.log("initArena called");
    try {
        await loadArenaData();
        console.log("Arena data loaded:", arenaData.length);
        loadRound(currentRound);
        console.log("Round loaded");
    } catch (error) {
        console.error("Error initializing arena:", error);
        arenaData = [...ARENA_DATA_DEFAULT];
        loadRound(currentRound);
    }
    addArenaListeners();
    console.log("Arena listeners added");
    initializeImageViewer();
    console.log("Image viewer initialized");
}

function getComparisonSourceAtPoint(wrapper, clientX) {
    if (!wrapper) return "";
    const slider = wrapper.querySelector(".slider");
    const split = slider ? Number(slider.value) : 50;
    const rect = wrapper.getBoundingClientRect();
    const localX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return localX < (rect.width * split) / 100 ? wrapper.dataset.beforeSrc : wrapper.dataset.afterSrc;
}

function addArenaListeners() {
    const nextButton = document.querySelector('[data-action="next-arena-round"]');
    if (nextButton) {
        nextButton.addEventListener("click", nextArenaRound);
    }

    document.querySelectorAll(".arena-card img.arena-img").forEach(function (img) {
        img.onerror = function () { showCardPlaceholder(this); };
        img.onload = function () { hideCardPlaceholder(this); };
    });

    const inputBox = document.getElementById("arena-input-box");

    if (inputBox) {
        inputBox.addEventListener("click", function (e) {
            // The input area is always a comparison view. Left click does not vote.
            e.preventDefault();
        });

        inputBox.addEventListener("contextmenu", function (e) {
            e.preventDefault();
            const wrapper = inputBox.querySelector(".arena-compare-wrapper");
            const baseSrc = getComparisonSourceAtPoint(wrapper, e.clientX);
            if (!baseSrc) return;

            if (isComparisonMode && baseSrc === comparisonBaseSource) {
                exitComparisonMode();
                renderInputComparison(inputBox.dataset.inputSrc, inputBox.dataset.enlightenedSrc);
            } else {
                exitComparisonMode();
                enterComparisonModeFromSource(baseSrc);
            }
        });

        inputBox.addEventListener("mousedown", function (e) {
            if (e.button !== 1) return;
            e.preventDefault();

            const wrapper = inputBox.querySelector(".arena-compare-wrapper");
            const src = getComparisonSourceAtPoint(wrapper, e.clientX);
            if (!src) return;

            const title =
                src === inputBox.dataset.inputSrc ? "Low-light Input" : "GT-mean Enlightened Input";

            openImageViewerBySource(src, title, "input");
        });
    }

    document.querySelectorAll(".arena-card").forEach(function (card, index) {
        card.addEventListener("click", function (e) {
            if (isComparisonMode) {
                e.preventDefault();
                return;
            }
            selectArenaImage(index, e);
        });

        card.addEventListener("contextmenu", function (e) {
            e.preventDefault();

            const wrapper = card.querySelector(".arena-compare-wrapper");
            const baseSrc = wrapper ? getComparisonSourceAtPoint(wrapper, e.clientX) : card.dataset.src;

            if (!baseSrc) return;

            if (isComparisonMode && baseSrc === comparisonBaseSource) {
                exitComparisonMode();
                return;
            }

            exitComparisonMode();
            enterComparisonModeFromSource(baseSrc);
        });

        card.addEventListener("mousedown", function (e) {
            if (e.button !== 1) return;
            e.preventDefault();

            const wrapper = card.querySelector(".arena-compare-wrapper");
            const src = wrapper ? getComparisonSourceAtPoint(wrapper, e.clientX) : card.dataset.src;

            if (!src) return;

            openImageViewerBySource(src, `Enhanced image ${String.fromCharCode(65 + index)}`, "enhanced");
        });
    });
}

function loadRound(roundIndex) {
    exitComparisonMode();

    let data;
    if (isRandomMode && currentRandomData) {
        data = currentRandomData;
    } else {
        if (shuffledArenaData.length === 0 && arenaData.length === 0) {
            const feedback = document.getElementById("arena-feedback");
            if (feedback) {
                feedback.textContent = "No arena data available. Enable random mode to load images.";
            }
            return;
        }
        data =
            shuffledArenaData[roundIndex % shuffledArenaData.length] ||
            arenaData[roundIndex % arenaData.length];
    }

    const outputs = (data.outputs || []).filter(function (output) {
        const path = output.src || "";
        return !path.toLowerCase().includes("gt");
    });

    if (outputs.length < 3) {
        const feedback = document.getElementById("arena-feedback");
        if (feedback) {
            feedback.textContent = "At least three enhanced results are required.";
            feedback.className = "arena-feedback";
        }
        return;
    }

    const inputSrc = data.input;
    const enlightenedSrc = inputSrc.replace("/input/", "/enlightened/");
    renderInputComparison(inputSrc, enlightenedSrc);

    const cards = document.querySelectorAll(".arena-card");
    const indices = [0, 1, 2];

    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    cards.forEach(function (card, i) {
        const idx = indices[i];
        const output = outputs[idx];

        card.dataset.index = i;
        card.dataset.originalIndex = idx;
        card.dataset.isCAGE = String(output.isCAGE);
        card.dataset.src = output.src;

        const oldWrapper = card.querySelector(".arena-compare-wrapper");
        if (oldWrapper) {
            oldWrapper.remove();
        }

        let img = card.querySelector("img.arena-img");
        if (!img) {
            img = document.createElement("img");
            img.className = "arena-img";
            img.dataset.index = i;
            img.onerror = function () {
                showCardPlaceholder(this);
            };
            img.onload = function () {
                hideCardPlaceholder(this);
            };
            card.insertBefore(img, card.querySelector(".img-placeholder"));
        }

        img.onerror = function () {
            showCardPlaceholder(this);
        };
        img.onload = function () {
            hideCardPlaceholder(this);
        };
        img.style.display = "block";
        img.src = output.src;

        const placeholder = card.querySelector(".img-placeholder");
        if (placeholder) {
            placeholder.style.display = "none";
        }

        const indexEl = card.querySelector(".arena-card-index");
        if (indexEl) {
            indexEl.textContent = String.fromCharCode(65 + i);
        }

        card.classList.remove("selected", "correct", "comparison-base", "comparison-active");
    });

    selectedIndex = -1;
    isAnswered = false;
    comparisonBaseIndex = -1;
    comparisonBaseSource = "";

    const feedback = document.getElementById("arena-feedback");
    if (feedback) {
        feedback.textContent = "";
        feedback.className = "arena-feedback";
    }

    const nextBtn = document.getElementById("arena-next-btn");
    if (nextBtn) {
        nextBtn.style.display = "none";
    }
}

function enterComparisonMode(baseIndex) {
    const cards = document.querySelectorAll(".arena-card");
    if (baseIndex < 0 || baseIndex >= cards.length) return;
    const baseSrc = cards[baseIndex].dataset.src;
    enterComparisonModeFromSource(baseSrc);
}

function enterComparisonModeFromSource(baseSrc) {
    if (!baseSrc) return;

    isComparisonMode = true;
    comparisonBaseSource = baseSrc;
    comparisonBaseIndex = -1;

    document.querySelectorAll(".arena-card").forEach(function (card, index) {
        const afterSrc = card.dataset.src;
        card.classList.add("comparison-active");

        if (afterSrc === baseSrc) {
            comparisonBaseIndex = index;
            card.classList.add("comparison-base");
            return;
        }

        displayBeforeAfterImage(card, baseSrc, afterSrc);
    });
}

function renderInputComparison(inputSrc, enlightenedSrc) {
    const inputBox = document.getElementById("arena-input-box");
    if (!inputBox || !inputSrc || !enlightenedSrc) return;

    inputBox.dataset.inputSrc = inputSrc;
    inputBox.dataset.enlightenedSrc = enlightenedSrc;
    inputBox.classList.add("comparison-base");

    const existingImage = inputBox.querySelector("#arena-input-img");
    if (existingImage) {
        existingImage.remove();
    }

    const placeholder = document.getElementById("arena-input-placeholder");
    if (placeholder) {
        placeholder.style.display = "none";
    }

    displayBeforeAfterImageInput(inputBox, inputSrc, enlightenedSrc);
}

function enterInputComparisonMode() {
    const inputBox = document.getElementById("arena-input-box");
    if (!inputBox) return;

    renderInputComparison(inputBox.dataset.inputSrc, inputBox.dataset.enlightenedSrc);
}

function exitComparisonMode() {
    document.querySelectorAll(".arena-card").forEach(function (card, index) {
        card.classList.remove("comparison-base", "comparison-active");

        const wrapper = card.querySelector(".arena-compare-wrapper");
        if (!wrapper) return;

        const img = document.createElement("img");
        img.src = card.dataset.src || wrapper.dataset.afterSrc;
        img.className = "arena-img";
        img.dataset.index = index;
        img.onerror = function () {
            showCardPlaceholder(this);
        };
        img.onload = function () {
            hideCardPlaceholder(this);
        };
        wrapper.replaceWith(img);
    });

    isComparisonMode = false;
    comparisonBaseIndex = -1;
    comparisonBaseSource = "";
}

async function toggleRandomMode() {
    const toggle = document.getElementById("arena-random-toggle");
    isRandomMode = toggle.checked;

    if (isRandomMode) {
        await generateRandomArenaData();
        loadRound(0);
        document.getElementById("arena-submit-btn").style.display = "flex";
        document.getElementById("arena-next-btn").style.display = "none";
    } else {
        currentRandomData = null;
        currentRound = 0;
        loadRound(0);
        document.getElementById("arena-submit-btn").style.display = "none";
    }
}

async function generateRandomArenaData() {
    const imagePatterns = [
        { prefix: "CAGE-CIDNet", isCAGE: true },
        { prefix: "CAGE-DarkIR", isCAGE: true },
        { prefix: "CAGE-Retinexformer", isCAGE: true },
        { prefix: "BreaD", isCAGE: false },
        { prefix: "CWNet", isCAGE: false },
        { prefix: "DarkIR", isCAGE: false },
        { prefix: "HVI-CIDNet", isCAGE: false },
        { prefix: "FourLLIE", isCAGE: false },
        { prefix: "HVI-CIDNet", isCAGE: false },
        { prefix: "LLFlow", isCAGE: false },
        { prefix: "LLFormer", isCAGE: false },
        { prefix: "MIRNet", isCAGE: false },
        { prefix: "Retinexformer", isCAGE: false },
        { prefix: "RetinexMamba", isCAGE: false },
        { prefix: "SNR-Net", isCAGE: false },
    ];

    const cagePatterns = imagePatterns.filter((p) => p.isCAGE && !p.prefix.toLowerCase().includes("gt"));
    const nonCagePatterns = imagePatterns.filter(
        (p) => !p.isCAGE && !p.prefix.toLowerCase().includes("gt"),
    );

    const randomNum = String(Math.floor(Math.random() * 100) + 690).padStart(5, "0");

    const cagePattern = cagePatterns[Math.floor(Math.random() * cagePatterns.length)];
    const cageSrc = `examples/${cagePattern.prefix}/${randomNum}.png`;

    const shuffledNonCage = [...nonCagePatterns].sort(() => Math.random() - 0.5);
    const nonCagePattern1 = shuffledNonCage[0];
    const nonCagePattern2 = shuffledNonCage[1] || shuffledNonCage[0];

    const nonCageSrc1 = `examples/${nonCagePattern1.prefix}/${randomNum}.png`;
    const nonCageSrc2 = `examples/${nonCagePattern2.prefix}/${randomNum}.png`;

    currentRandomData = {
        input: `examples/input/${randomNum}.png`,
        outputs: [
            { src: cageSrc, isCAGE: true },
            { src: nonCageSrc1, isCAGE: false },
            { src: nonCageSrc2, isCAGE: false },
        ],
    };
}

function showInputPlaceholder(img) {
    img.style.display = "none";
    const placeholder = document.getElementById("arena-input-placeholder");
    if (placeholder) {
        placeholder.style.display = "flex";
        const filenameEl = placeholder.querySelector(".filename");
        if (filenameEl) {
            const path = img.currentSrc || img.getAttribute("src") || img.src || "";
            filenameEl.textContent = path.split(/[\\/]/).pop()?.split("?")[0] || "input.png";
        }
    }
}

function hideInputPlaceholder(img) {
    img.style.display = "block";
    const placeholder = document.getElementById("arena-input-placeholder");
    if (placeholder) {
        placeholder.style.display = "none";
    }
}

function showCardPlaceholder(img) {
    img.style.display = "none";
    const card = img.closest(".arena-card");
    if (card) {
        const placeholder = card.querySelector(".img-placeholder");
        if (placeholder) {
            placeholder.style.display = "flex";
            const filenameEl = placeholder.querySelector(".filename");
            if (filenameEl && img.src) {
                const path = img.currentSrc || img.getAttribute("src") || img.src || "";
                filenameEl.textContent = path.split(/[\\/]/).pop()?.split("?")[0] || "image.png";
            }
        }
    }
}

function hideCardPlaceholder(img) {
    img.style.display = "block";
    const card = img.closest(".arena-card");
    if (card) {
        const placeholder = card.querySelector(".img-placeholder");
        if (placeholder) {
            placeholder.style.display = "none";
        }
    }
}

function createComparisonView(beforeImageUrl, afterImageUrl, initialPercentage) {
    const wrapper = document.createElement("div");
    wrapper.className = "arena-compare-wrapper";
    wrapper.dataset.beforeSrc = beforeImageUrl;
    wrapper.dataset.afterSrc = afterImageUrl;

    const sliderContainer = document.createElement("div");
    sliderContainer.className = "slider-container";

    const afterImage = document.createElement("img");
    afterImage.className = "img compare-layer background-img";
    afterImage.src = afterImageUrl;
    afterImage.alt = "";
    afterImage.draggable = false;
    afterImage.onerror = function () {
        showInputPlaceholder(this);
    };

    const beforeImage = document.createElement("img");
    beforeImage.className = "img compare-layer foreground-img";
    beforeImage.src = beforeImageUrl;
    beforeImage.alt = "";
    beforeImage.draggable = false;
    beforeImage.onerror = function () {
        showInputPlaceholder(this);
    };

    const divider = document.createElement("div");
    divider.className = "compare-divider";
    divider.setAttribute("role", "separator");
    divider.setAttribute("aria-orientation", "vertical");

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = String(initialPercentage || 50);
    slider.className = "slider";
    slider.tabIndex = -1;
    slider.setAttribute("aria-hidden", "true");

    const sliderButton = document.createElement("div");
    sliderButton.className = "slider-button";

    sliderContainer.append(afterImage, beforeImage, divider, slider, sliderButton);
    wrapper.appendChild(sliderContainer);

    const percentage = initialPercentage || 50;
    beforeImage.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
    divider.style.left = `${percentage}%`;
    sliderButton.style.left = `${percentage}%`;

    function updateSlider(clientX) {
        const rect = sliderContainer.getBoundingClientRect();
        if (!rect.width) return;

        const percentage = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));

        slider.value = String(percentage);
        beforeImage.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
        divider.style.left = `${percentage}%`;
        sliderButton.style.left = `${percentage}%`;
    }

    let dragging = false;

    divider.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        dragging = true;
        divider.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
        updateSlider(e.clientX);
    });

    divider.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        e.preventDefault();
        updateSlider(e.clientX);
    });

    function stopDragging(e) {
        if (!dragging) return;
        dragging = false;

        if (divider.hasPointerCapture(e.pointerId)) {
            divider.releasePointerCapture(e.pointerId);
        }
    }

    divider.addEventListener("pointerup", stopDragging);
    divider.addEventListener("pointercancel", stopDragging);

    sliderButton.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        dragging = true;
        sliderButton.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
        updateSlider(e.clientX);
    });

    sliderButton.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        e.preventDefault();
        updateSlider(e.clientX);
    });

    sliderButton.addEventListener("pointerup", stopDragging);
    sliderButton.addEventListener("pointercancel", stopDragging);

    return wrapper;
}

function displayBeforeAfterImage(card, beforeImageUrl, afterImageUrl) {
    if (!card || !beforeImageUrl || !afterImageUrl) return;

    const wrapper = createComparisonView(beforeImageUrl, afterImageUrl);
    const visual = card.querySelector("img.arena-img, .arena-compare-wrapper");

    if (visual) {
        visual.replaceWith(wrapper);
    } else {
        card.insertBefore(wrapper, card.querySelector(".img-placeholder"));
    }
}

function displayBeforeAfterImageInput(box, beforeImageUrl, afterImageUrl) {
    if (!box || !beforeImageUrl || !afterImageUrl) return;

    const existingWrapper = box.querySelector(".arena-compare-wrapper");
    let initialPercentage = 50;
    if (existingWrapper) {
        const slider = existingWrapper.querySelector(".slider");
        if (slider) {
            initialPercentage = parseInt(slider.value, 10);
        }
    }

    const wrapper = createComparisonView(beforeImageUrl, afterImageUrl, initialPercentage);
    const visual = box.querySelector(":scope > #arena-input-img, :scope > .arena-compare-wrapper");
    const placeholder = box.querySelector(".img-placeholder");

    if (visual) {
        visual.replaceWith(wrapper);
    } else if (placeholder) {
        box.insertBefore(wrapper, placeholder);
    } else {
        box.appendChild(wrapper);
    }
}

function selectArenaImage(index, event) {
    console.log("selectArenaImage called:", index);
    if (isComparisonMode || isAnswered) return;

    isAnswered = true;
    selectedIndex = index;

    const cards = document.querySelectorAll(".arena-card");
    cards.forEach((card) => card.classList.remove("selected"));

    const selectedCard = cards[index];
    if (!selectedCard) return;
    selectedCard.classList.add("selected");

    const isCorrect = selectedCard.dataset.isCAGE === "true";
    const originalIndex = selectedCard.dataset.originalIndex;
    const roundData =
        isRandomMode && currentRandomData ? currentRandomData : shuffledArenaData[currentRound];
    const outputData = roundData ? roundData.outputs[originalIndex] : null;
    const methodName = outputData ? outputData.src.split("/")[1] : "unknown";

    if (!voteCounts[methodName]) {
        voteCounts[methodName] = 0;
    }
    voteCounts[methodName]++;
    // saveVoteCounts();

    try {
        updateVoteChart();
    } catch (error) {
        console.error("Error updating vote chart:", error);
    }

    cards.forEach((card) => {
        if (card.dataset.isCAGE === "true") {
            card.classList.add("correct");
        }
    });

    const feedback = document.getElementById("arena-feedback");
    if (isCorrect && feedback) {
        const message = generateFeedbackMessage(true);
        feedback.textContent = message;
        feedback.classList.add("correct");
        feedback.classList.remove("wrong");
        const mouseX = event ? event.clientX : null;
        const mouseY = event ? event.clientY : null;
        const correctCard = document.querySelector('.arena-card[data-isCAGE="true"]');
        const correctRect = correctCard ? correctCard.getBoundingClientRect() : null;
        const targetX = correctRect ? correctRect.left + correctRect.width / 2 : mouseX;
        const targetY = correctRect ? correctRect.bottom : mouseY;
        try {
            launchFireworks(mouseX, mouseY, targetX, targetY);
        } catch (error) {
            console.error("Error launching fireworks:", error);
        }
    } else if (feedback) {
        const message = generateFeedbackMessage(false);
        feedback.textContent = message;
        feedback.classList.add("wrong");
        feedback.classList.remove("correct");
    }

    const nextBtn = document.getElementById("arena-next-btn");
    if (nextBtn) {
        nextBtn.style.display = "flex";
    }
}

async function nextArenaRound() {
    if (isRandomMode) {
        await generateRandomArenaData();
        loadRound(0);

        const submitBtn = document.getElementById("arena-submit-btn");
        if (submitBtn) {
            submitBtn.style.display = "flex";
        }
        return;
    }

    if (currentRound + 1 >= shuffledArenaData.length) {
        shuffleArenaData();
        currentRound = 0;
    } else {
        currentRound++;
    }
    loadRound(currentRound);
}

function updateVoteChart() {
    console.log("updateVoteChart called, voteCounts:", voteCounts);
    const voteChart = document.getElementById("arena-vote-chart");
    const chartBars = document.getElementById("vote-chart-bars");
    console.log("voteChart:", !!voteChart, "chartBars:", !!chartBars);
    if (!voteChart || !chartBars) return;

    const sortedMethods = Object.entries(voteCounts)
        .filter(([, count]) => count > 0)
        .sort((a, b) => a[1] - b[1]);

    if (sortedMethods.length === 0) {
        voteChart.style.display = "none";
        return;
    }

    voteChart.style.display = "block";

    const counts = sortedMethods.map(([, count]) => count);
    const maxCount = Math.max(...counts);
    const minCount = 0; // Math.min(...counts);
    const maxBarHeight = 80;

    chartBars.innerHTML = "";

    sortedMethods.forEach(([method, count]) => {
        const barItem = document.createElement("div");
        barItem.className = "vote-bar-item";

        const bar = document.createElement("div");
        bar.className = "vote-bar" + (method.startsWith("CAGE") ? " cage" : "");

        let heightPercent;
        if (sortedMethods.length === 1 || maxCount === minCount) {
            heightPercent = 100;
        } else {
            heightPercent = ((count - minCount) / (maxCount - minCount)) * 100;
        }
        bar.style.height = `${Math.max(2, (heightPercent / 100) * maxBarHeight)}px`;

        const label = document.createElement("div");
        label.className = "vote-label";
        label.textContent = method;

        const countSpan = document.createElement("div");
        countSpan.className = "vote-count";
        countSpan.textContent = count;

        const barGroup = document.createElement("div");
        barGroup.className = "vote-bar-group";
        barGroup.appendChild(countSpan);
        barGroup.appendChild(bar);

        barItem.appendChild(barGroup);
        barItem.appendChild(label);

        chartBars.appendChild(barItem);
    });
}

window.CAGEArena = {
    init: initArena,
    next: nextArenaRound,
    reload: loadArenaData,
};
