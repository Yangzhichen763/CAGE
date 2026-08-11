"use strict";

const ARENA_CONFIG = Object.assign({
    outputCount: 3,
    cardLabels: ["A", "B", "C"],
    prefetchRounds: 2,
    prefetchDelayMs: 120,
    randomImageMin: 690,
    randomImageMax: 789,
    compareInitialPercentage: 50,
}, window.CAGE_CONFIG?.arena || {});

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

const arenaImageObjectUrls = new Map();
const arenaPreloadPromises = new Map();
let arenaImageGeneration = 0;

function getArenaImageLoader() {
    return window.CAGEImageLoader || null;
}

function ensureArenaSpinner(icon) {
    const loader = getArenaImageLoader();
    if (loader?.ensureSpinner) {
        loader.ensureSpinner(icon);
        return;
    }
    if (!icon || icon.querySelector(".fa-spinner")) return;
    icon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
}

function clearArenaSpinnerMarker(icon) {
    getArenaImageLoader()?.clearSpinnerMarker?.(icon);
}

function getArenaCachedImageUrl(source) {
    if (!source) return "";
    const sharedUrl = getArenaImageLoader()?.get?.(source) || "";
    return sharedUrl || arenaImageObjectUrls.get(source) || "";
}

function setArenaCachedImageUrl(source, objectUrl) {
    if (!source || !objectUrl) return;

    const previousUrl = arenaImageObjectUrls.get(source);
    if (previousUrl && previousUrl !== objectUrl) {
        URL.revokeObjectURL(previousUrl);
    }
    arenaImageObjectUrls.set(source, objectUrl);
}

function clearArenaCachedImages() {
    arenaImageGeneration++;
    if (getArenaImageLoader()) return;
    arenaImageObjectUrls.forEach(function (objectUrl) {
        URL.revokeObjectURL(objectUrl);
    });
    arenaImageObjectUrls.clear();
}

function preloadArenaSource(source) {
    if (!source || arenaPreloadPromises.has(source)) {
        return arenaPreloadPromises.get(source) || Promise.resolve(false);
    }

    const sharedLoader = getArenaImageLoader();
    const promise = sharedLoader?.preload
        ? sharedLoader.preload(source)
        : new Promise(function (resolve) {
            const image = new Image();
            image.decoding = "async";
            image.fetchPriority = "low";
            image.onload = function () {
                if (typeof image.decode === "function") {
                    image.decode().catch(function () {}).finally(function () { resolve(true); });
                } else {
                    resolve(true);
                }
            };
            image.onerror = function () { resolve(false); };
            image.src = source;
        });

    const trackedPromise = promise.finally(function () {
        arenaPreloadPromises.delete(source);
    });
    arenaPreloadPromises.set(source, trackedPromise);
    return trackedPromise;
}

function getArenaRoundSources(data) {
    if (!data) return [];
    const sources = [];
    const input = data.input || "";
    if (input) {
        sources.push(input);
        sources.push(input.replace("/input/", "/enlightened/"));
    }

    const outputs = (data.outputs || []).filter(function (output) {
        return !(output.src || "").toLowerCase().includes("gt");
    });
    outputs.slice(0, ARENA_CONFIG.outputCount).forEach(function (output) {
        if (output.src) sources.push(output.src);
    });
    return Array.from(new Set(sources.filter(Boolean)));
}

function scheduleArenaPrefetch(roundIndex) {
    if (isRandomMode || shuffledArenaData.length === 0 || ARENA_CONFIG.prefetchRounds <= 0) return;

    const run = function () {
        for (let offset = 1; offset <= ARENA_CONFIG.prefetchRounds; offset++) {
            const index = (roundIndex + offset) % shuffledArenaData.length;
            getArenaRoundSources(shuffledArenaData[index]).forEach(preloadArenaSource);
        }
    };

    if ("requestIdleCallback" in window) {
        window.requestIdleCallback(run, { timeout: 900 });
    } else {
        window.setTimeout(run, ARENA_CONFIG.prefetchDelayMs);
    }
}

function setArenaCardLoadState(card, state) {
    if (!card) return;
    card.dataset.loadState = state;
    const busy = state === "loading";
    card.classList.toggle("is-loading", busy);
    card.setAttribute("aria-busy", String(busy));
    updateArenaGridLoadState();
}

function updateArenaGridLoadState() {
    const grid = document.getElementById("arena-grid");
    if (!grid) return;
    const loading = Array.from(document.querySelectorAll(".arena-card")).some(function (card) {
        return card.dataset.loadState === "loading";
    });
    grid.classList.toggle("is-loading", loading);
    grid.setAttribute("aria-busy", String(loading));
}

function isArenaRoundLoading() {
    return Array.from(document.querySelectorAll(".arena-card")).some(function (card) {
        return card.dataset.loadState === "loading";
    });
}

function isArenaCardReady(card) {
    if (!card || card.dataset.loadState !== "ready") return false;
    const img = card.querySelector("img.arena-img");
    return Boolean(img && img.dataset.loadedSource === card.dataset.src && img.complete && img.naturalWidth > 0);
}

function getArenaSourceLabel(source) {
    if (!source) return "";
    const inputBox = document.getElementById("arena-input-box");
    if (inputBox) {
        if (source === inputBox.dataset.inputSrc) return "Low-light";
        if (source === inputBox.dataset.enlightenedSrc) return "Enlightened";
    }
    const cards = Array.from(document.querySelectorAll(".arena-card"));
    const index = cards.findIndex(function (card) { return card.dataset.src === source; });
    return index >= 0 ? (ARENA_CONFIG.cardLabels[index] || String.fromCharCode(65 + index)) : "";
}

function setArenaLoadingPlaceholder(card, progress) {
    const placeholder = card?.querySelector(".img-placeholder");
    if (!placeholder) return;
    if (window.CAGELoadingUI?.setLoading) {
        window.CAGELoadingUI.setLoading(placeholder, progress);
        return;
    }
    const icon = placeholder.querySelector(".icon");
    ensureArenaSpinner(icon);
    const filename = placeholder.querySelector(".filename");
    const label = placeholder.querySelector(".label");
    if (filename) filename.textContent = "Loading...";
    if (label) label.textContent = Number.isFinite(progress) ? Math.round(progress) + "%" : "Receiving image...";
    placeholder.style.display = "flex";
}

async function fetchArenaImageBlob(source, onProgress) {
    const response = await fetch(source, { cache: "force-cache" });
    if (!response.ok) throw new Error("Image request failed");
    const total = Number.parseInt(response.headers.get("content-length") || "0", 10);
    if (!response.body || !Number.isFinite(total) || total <= 0) {
        const blob = await response.blob();
        onProgress?.(100);
        return blob;
    }
    let loaded = 0;
    const chunks = [];
    const reader = response.body.getReader();
    while (true) {
        const result = await reader.read();
        if (result.done) break;
        chunks.push(result.value);
        loaded += result.value.byteLength;
        onProgress?.((loaded / total) * 100);
    }
    onProgress?.(100);
    return new Blob(chunks, { type: response.headers.get("content-type") || "image/png" });
}

function decodeArenaCardImage(img, objectUrl) {
    return new Promise(function (resolve, reject) {
        let settled = false;
        function finish(ok) {
            if (settled) return;
            settled = true;
            img.onload = null;
            img.onerror = null;
            if (ok) resolve(); else reject(new Error("Image decode failed"));
        }
        img.onload = async function () {
            try { if (typeof img.decode === "function") await img.decode(); } catch (_) {}
            finish(img.naturalWidth > 0);
        };
        img.onerror = function () { finish(false); };
        img.src = objectUrl;
        if (img.complete && img.naturalWidth > 0) queueMicrotask(function () { finish(true); });
    });
}

async function loadArenaCardImage(card, img, source, generation) {
    let objectUrl = "";
    let sharedManaged = false;
    try {
        const sharedLoader = getArenaImageLoader();
        if (sharedLoader?.load) {
            const resource = await sharedLoader.load(source, {
                onProgress: function (progress) {
                    if (generation !== arenaImageGeneration || card.dataset.src !== source) return;
                    setArenaLoadingPlaceholder(card, progress);
                },
            });
            objectUrl = resource.url;
            sharedManaged = true;
        } else {
            const blob = await fetchArenaImageBlob(source, function (progress) {
                if (generation !== arenaImageGeneration || card.dataset.src !== source) return;
                setArenaLoadingPlaceholder(card, progress);
            });
            objectUrl = URL.createObjectURL(blob);
        }

        if (generation !== arenaImageGeneration || card.dataset.src !== source) {
            if (objectUrl && !sharedManaged) URL.revokeObjectURL(objectUrl);
            return;
        }

        await decodeArenaCardImage(img, objectUrl);
        if (generation !== arenaImageGeneration || card.dataset.src !== source) {
            if (objectUrl && !sharedManaged) URL.revokeObjectURL(objectUrl);
            return;
        }

        if (!sharedManaged) {
            setArenaCachedImageUrl(source, objectUrl);
            objectUrl = "";
        }
        img.dataset.loadedSource = source;
        setArenaCardLoadState(card, "ready");
        hideCardPlaceholder(img);
    } catch (_) {
        if (objectUrl && !sharedManaged) URL.revokeObjectURL(objectUrl);
        if (generation !== arenaImageGeneration || card.dataset.src !== source) return;
        img.removeAttribute("src");
        img.dataset.loadedSource = "";
        setArenaCardLoadState(card, "error");
        showCardPlaceholder(img, false);
    }
}

let consecutiveCorrectCount = 0;
let totalCorrectCount = 0;
let totalWrongCount = 0;

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

const EMOJI_D_WRONG_CONFIG = [
    { condition: (wrong, correct) => wrong > 20 && correct === 0, emojis: ["😢", "😭", "😣", "😖", "😵", "😩", "😰", "😥", "😱", "💦", "🤗", "�"] },
    { condition: (wrong, correct) => correct < 5, emojis: ["💪", "🚀", "💡", "📸", "🌟", "🔍", "👀"] },
    { condition: (wrong, correct) => correct >= 5 && correct < 20, emojis: ["💪", "🤗", "😇", "😌", "😊", "😉"] },
    { condition: (wrong, correct) => correct >= 20 && correct < 50, emojis: ["💪", "🤗", "😁", "😄"] },
    { condition: (wrong, correct) => correct >= 50, emojis: ["💪", "🤗", "😁", "😄", "😚", "😘"] },
];

const NUMBER_EMOJIS = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

const ALL_CORRECT_EMOJIS = ["🤗", "🥳", "😁", "😄", "😆", "😚", "😘", "🥰"];

let lastCorrectBIndex = -1;
let lastCorrectCIndex = -1;
let lastWrongBIndex = -1;
let lastWrongCIndex = -1;
let lastWrongDIndex = -1;
let lastCorrectDIndex = -1;

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

function getWrongEmojiD(wrongCount, correctCount) {
    for (const { condition, emojis } of EMOJI_D_WRONG_CONFIG) {
        if (condition(wrongCount, correctCount)) {
            let newIndex;
            do {
                newIndex = Math.floor(Math.random() * emojis.length);
            } while (newIndex === lastWrongDIndex && emojis.length > 1);
            lastWrongDIndex = newIndex;
            return emojis[newIndex];
        }
    }
    return "💪";
}

function getCorrectEmojiD(correctCount) {
    if (correctCount > 64) {
        let newIndex;
        do {
            newIndex = Math.floor(Math.random() * ALL_CORRECT_EMOJIS.length);
        } while (newIndex === lastCorrectDIndex && ALL_CORRECT_EMOJIS.length > 1);
        lastCorrectDIndex = newIndex;
        return ALL_CORRECT_EMOJIS[newIndex];
    }
    return getEmojiByThreshold(EMOJI_D_CONFIG, correctCount);
}

function getConsecutiveEmojiA(consecutiveCount) {
    if (consecutiveCount > 36) {
        const digits = consecutiveCount.toString().split("");
        return digits.map(d => {
            const num = parseInt(d);
            return num <= 10 ? NUMBER_EMOJIS[num] : d;
        }).join("");
    }
    return getEmojiByThreshold(EMOJI_A_CONFIG, consecutiveCount);
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
        
        const emojiA = getConsecutiveEmojiA(consecutiveCorrectCount);
        const emojiD = getCorrectEmojiD(totalCorrectCount);
        
        const bIndex = getRandomIndex(SENTENCE_B_CORRECT.length, lastCorrectBIndex);
        const cIndex = getRandomIndex(SENTENCE_C_CORRECT.length, lastCorrectCIndex);
        
        lastCorrectBIndex = bIndex;
        lastCorrectCIndex = cIndex;
        
        return `${emojiA} ${SENTENCE_B_CORRECT[bIndex]} ${SENTENCE_C_CORRECT[cIndex]} ${emojiD}`;
    } else {
        consecutiveCorrectCount = 0;
        totalWrongCount++;
        
        const bIndex = getRandomIndex(SENTENCE_B_WRONG.length, lastWrongBIndex);
        const cIndex = getRandomIndex(SENTENCE_C_WRONG.length, lastWrongCIndex);
        const emojiD = getWrongEmojiD(totalWrongCount, totalCorrectCount);
        
        lastWrongBIndex = bIndex;
        lastWrongCIndex = cIndex;
        
        return `${SENTENCE_B_WRONG[bIndex]} ${SENTENCE_C_WRONG[cIndex]} ${emojiD}`;
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
    if (nextButton) nextButton.addEventListener("click", nextArenaRound);

    const inputBox = document.getElementById("arena-input-box");
    if (inputBox) {
        inputBox.addEventListener("click", function (e) { e.preventDefault(); });
        inputBox.addEventListener("contextmenu", function (e) {
            e.preventDefault();
            if (isArenaRoundLoading()) return;
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
            if (e.button !== 1 || isArenaRoundLoading()) return;
            e.preventDefault();
            const wrapper = inputBox.querySelector(".arena-compare-wrapper");
            const src = getComparisonSourceAtPoint(wrapper, e.clientX);
            if (!src) return;
            const title = src === inputBox.dataset.inputSrc ? "Low-light Input" : "GT-mean Enlightened Input";
            openImageViewerBySource(src, title, "input");
        });
    }

    document.querySelectorAll(".arena-card").forEach(function (card, index) {
        card.addEventListener("click", function (e) {
            if (isArenaRoundLoading() || !isArenaCardReady(card) || isComparisonMode) {
                e.preventDefault();
                return;
            }
            selectArenaImage(index, e);
        });
        card.addEventListener("contextmenu", function (e) {
            e.preventDefault();
            if (isArenaRoundLoading() || !isArenaCardReady(card)) return;
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
            if (e.button !== 1 || isArenaRoundLoading() || !isArenaCardReady(card)) return;
            e.preventDefault();
            const wrapper = card.querySelector(".arena-compare-wrapper");
            const src = wrapper ? getComparisonSourceAtPoint(wrapper, e.clientX) : card.dataset.src;
            if (!src) return;
            openImageViewerBySource(src, `Enhanced image ${ARENA_CONFIG.cardLabels[index] || String.fromCharCode(65 + index)}`, "enhanced");
        });
    });
}

function loadRound(roundIndex) {
    exitComparisonMode(false);
    clearArenaCachedImages();
    const generation = arenaImageGeneration;

    let data;
    if (isRandomMode && currentRandomData) data = currentRandomData;
    else {
        if (shuffledArenaData.length === 0 && arenaData.length === 0) {
            const feedback = document.getElementById("arena-feedback");
            if (feedback) feedback.textContent = "No arena data available. Enable random mode to load images.";
            return;
        }
        data = shuffledArenaData[roundIndex % shuffledArenaData.length] || arenaData[roundIndex % arenaData.length];
    }

    const outputs = (data.outputs || []).filter(function (output) {
        return !(output.src || "").toLowerCase().includes("gt");
    });
    const cards = document.querySelectorAll(".arena-card");
    const outputCount = Math.min(ARENA_CONFIG.outputCount, cards.length);
    if (outputs.length < outputCount) {
        const feedback = document.getElementById("arena-feedback");
        if (feedback) {
            feedback.textContent = "At least " + outputCount + " enhanced results are required.";
            feedback.className = "arena-feedback";
        }
        return;
    }

    const inputSrc = data.input;
    renderInputComparison(inputSrc, inputSrc.replace("/input/", "/enlightened/"));
    const indices = Array.from({ length: outputCount }, function (_, index) { return index; });
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
        card.dataset.src = output.src || "";
        setArenaCardLoadState(card, "loading");

        card.querySelector(".arena-compare-wrapper")?.remove();
        let img = card.querySelector("img.arena-img");
        if (!img) {
            img = document.createElement("img");
            img.className = "arena-img";
            img.dataset.index = i;
            card.insertBefore(img, card.querySelector(".img-placeholder"));
        }
        img.onload = null;
        img.onerror = null;
        img.removeAttribute("src");
        img.dataset.loadedSource = "";
        img.style.display = "none";
        setArenaLoadingPlaceholder(card, null);

        const indexEl = card.querySelector(".arena-card-index");
        if (indexEl) indexEl.textContent = ARENA_CONFIG.cardLabels[i] || String.fromCharCode(65 + i);
        card.classList.remove("selected", "correct", "comparison-base", "comparison-active");

        if (!output.src) {
            setArenaCardLoadState(card, "error");
            showCardPlaceholder(img, false);
            return;
        }
        loadArenaCardImage(card, img, output.src, generation);
    });

    selectedIndex = -1;
    isAnswered = false;
    comparisonBaseIndex = -1;
    comparisonBaseSource = "";
    const feedback = document.getElementById("arena-feedback");
    if (feedback) { feedback.textContent = ""; feedback.className = "arena-feedback"; }
    const nextBtn = document.getElementById("arena-next-btn");
    if (nextBtn) nextBtn.style.display = "none";

    scheduleArenaPrefetch(roundIndex);
}

function enterComparisonMode(baseIndex) {
    const cards = document.querySelectorAll(".arena-card");
    if (baseIndex < 0 || baseIndex >= cards.length) return;
    const baseSrc = cards[baseIndex].dataset.src;
    enterComparisonModeFromSource(baseSrc);
}

function enterComparisonModeFromSource(baseSrc) {
    if (!baseSrc || isArenaRoundLoading()) return;
    const sourceCard = Array.from(document.querySelectorAll(".arena-card")).find(function (card) { return card.dataset.src === baseSrc; });
    if (sourceCard && !isArenaCardReady(sourceCard)) return;

    isComparisonMode = true;
    comparisonBaseSource = baseSrc;
    comparisonBaseIndex = -1;
    const rightBadge = getArenaSourceLabel(baseSrc);
    document.querySelectorAll(".arena-card").forEach(function (card, index) {
        const compareSrc = card.dataset.src;
        card.classList.add("comparison-active");
        if (compareSrc === baseSrc) {
            comparisonBaseIndex = index;
            card.classList.add("comparison-base");
            return;
        }
        if (!isArenaCardReady(card)) return;
        displayBeforeAfterImage(card, compareSrc, baseSrc, {
            beforeBadge: getArenaSourceLabel(compareSrc),
            afterBadge: rightBadge,
        });
    });
}

function renderInputComparison(inputSrc, enlightenedSrc) {
    const inputBox = document.getElementById("arena-input-box");
    if (!inputBox) return;

    const placeholder = document.getElementById("arena-input-placeholder");
    
    if (!inputSrc && !enlightenedSrc) {
        if (placeholder) {
            placeholder.style.display = "flex";
            const icon = placeholder.querySelector(".icon");
            if (icon) {
                icon.innerHTML = '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><rect height="18" rx="2" width="18" x="3" y="3"></rect><circle cx="9" cy="9" r="2"></circle><path d="M21 15l-5-5L5 21"></path></svg>';
            }
            const label = placeholder.querySelector(".label");
            if (label) label.textContent = "Image unavailable";
        }
        return;
    }

    inputBox.dataset.inputSrc = inputSrc || "";
    inputBox.dataset.enlightenedSrc = enlightenedSrc || "";
    inputBox.classList.add("comparison-base");

    const existingImage = inputBox.querySelector("#arena-input-img");
    if (existingImage) {
        existingImage.remove();
    }

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

function hideArenaCardIndexForComparison(card) {
    const indexEl = card?.querySelector(".arena-card-index");
    if (!indexEl) return;
    if (indexEl.dataset.comparisonPreviousHidden === undefined) {
        indexEl.dataset.comparisonPreviousHidden = String(indexEl.hidden);
    }
    indexEl.hidden = true;
    indexEl.classList.add("is-comparison-hidden");
}

function restoreArenaCardIndexAfterComparison(card) {
    const indexEl = card?.querySelector(".arena-card-index");
    if (!indexEl) return;
    indexEl.classList.remove("is-comparison-hidden");
    const previousHidden = indexEl.dataset.comparisonPreviousHidden;
    if (previousHidden !== undefined) {
        indexEl.hidden = previousHidden === "true";
        delete indexEl.dataset.comparisonPreviousHidden;
    } else {
        indexEl.hidden = false;
    }
}

function exitComparisonMode(restoreImages = true) {
    document.querySelectorAll(".arena-card").forEach(function (card) {
        card.classList.remove("comparison-base", "comparison-active");
        card.querySelector(".arena-compare-wrapper")?.remove();
        restoreArenaCardIndexAfterComparison(card);
        if (!restoreImages) return;
        const img = card.querySelector("img.arena-img");
        if (!img) return;
        if (card.dataset.loadState === "loading") { showCardPlaceholder(img, true); return; }
        if (card.dataset.loadState !== "ready") { showCardPlaceholder(img, false); return; }
        const source = card.dataset.src || "";
        const cachedUrl = getArenaCachedImageUrl(source);
        if (!cachedUrl || img.dataset.loadedSource !== source) { showCardPlaceholder(img, false); return; }
        if (img.getAttribute("src") !== cachedUrl) img.src = cachedUrl;
        hideCardPlaceholder(img);
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

    const randomSpan = Math.max(1, ARENA_CONFIG.randomImageMax - ARENA_CONFIG.randomImageMin + 1);
    const randomNum = String(
        Math.floor(Math.random() * randomSpan) + ARENA_CONFIG.randomImageMin,
    ).padStart(5, "0");

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
        
        const icon = placeholder.querySelector(".icon");
        if (icon) {
            icon.innerHTML = '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><rect height="18" rx="2" width="18" x="3" y="3"></rect><circle cx="9" cy="9" r="2"></circle><path d="M21 15l-5-5L5 21"></path></svg>';
        }
        
        const filenameEl = placeholder.querySelector(".filename");
        if (filenameEl) {
            const path = img.currentSrc || img.getAttribute("src") || img.src || "";
            filenameEl.textContent = path.split(/[\\/]/).pop()?.split("?")[0] || "input.png";
        }
        
        const labelEl = placeholder.querySelector(".label");
        if (labelEl) {
            labelEl.textContent = "Image unavailable";
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

function showCardPlaceholder(img, isLoading = false) {
    img.style.display = "none";
    const card = img.closest(".arena-card");
    if (card) {
        const placeholder = card.querySelector(".img-placeholder");
        if (placeholder) {
            placeholder.style.display = "flex";
            
            const icon = placeholder.querySelector(".icon");
            if (icon) {
                if (isLoading) {
                    ensureArenaSpinner(icon);
                } else {
                    clearArenaSpinnerMarker(icon);
                    icon.innerHTML = '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><rect height="18" rx="2" width="18" x="3" y="3"></rect><circle cx="9" cy="9" r="2"></circle><path d="M21 15l-5-5L5 21"></path></svg>';
                }
            }
            
            const filenameEl = placeholder.querySelector(".filename");
            const labelEl = placeholder.querySelector(".label");
            if (isLoading) {
                if (filenameEl) filenameEl.textContent = "Loading...";
                if (labelEl) labelEl.textContent = "Loading...";
            } else {
                if (img.src) {
                    const path = img.currentSrc || img.getAttribute("src") || img.src || "";
                    if (filenameEl) filenameEl.textContent = path.split(/[\\/]/).pop()?.split("?")[0] || "image.png";
                }
                if (labelEl) labelEl.textContent = "Image unavailable";
            }
        }
    }
}

function hideCardPlaceholder(img) {
    const card = img.closest(".arena-card");
    if (card && card.dataset.loadState !== "ready") return;
    img.style.display = "block";
    if (card) {
        const placeholder = card.querySelector(".img-placeholder");
        if (placeholder) placeholder.style.display = "none";
    }
}

function createComparisonView(beforeImageUrl, afterImageUrl, initialPercentage = ARENA_CONFIG.compareInitialPercentage, options = {}) {
    const useSplitPlaceholders = options.splitLoadingPlaceholders === true;
    const beforeLabel = options.beforeLabel || "Before image";
    const afterLabel = options.afterLabel || "After image";

    const wrapper = document.createElement("div");
    wrapper.className = "arena-compare-wrapper";
    wrapper.dataset.beforeSrc = beforeImageUrl || "";
    wrapper.dataset.afterSrc = afterImageUrl || "";

    const sliderContainer = document.createElement("div");
    sliderContainer.className = "slider-container";

    const compareBadges = document.createElement("div");
    compareBadges.className = "compare-corner-labels";
    const beforeBadge = document.createElement("span");
    beforeBadge.className = "compare-corner-label compare-corner-label-left";
    beforeBadge.textContent = options.beforeBadge || getArenaSourceLabel(beforeImageUrl) || "L";
    const afterBadge = document.createElement("span");
    afterBadge.className = "compare-corner-label compare-corner-label-right";
    afterBadge.textContent = options.afterBadge || getArenaSourceLabel(afterImageUrl) || "R";
    compareBadges.append(beforeBadge, afterBadge);

    const afterImage = document.createElement("img");
    afterImage.className = "img compare-layer background-img";
    afterImage.alt = afterLabel;
    afterImage.draggable = false;
    afterImage.style.opacity = "0";

    const beforeImage = document.createElement("img");
    beforeImage.className = "img compare-layer foreground-img";
    beforeImage.alt = beforeLabel;
    beforeImage.draggable = false;
    beforeImage.style.opacity = "0";

    function createSplitPlaceholder(side, label, source, isCached) {
        const placeholder = document.createElement("div");
        placeholder.className = `img-placeholder cage-loading-surface compare-image-placeholder ${side}-placeholder`;
        placeholder.dataset.source = source || "";
        placeholder.setAttribute("aria-label", `${label} loading state`);
        placeholder.innerHTML = `
            <div class="icon"><i class="fas fa-spinner fa-spin"></i></div>
            <div class="filename"></div>
            <div class="label">Loading...</div>
        `;
        const filename = placeholder.querySelector(".filename");
        if (filename) filename.textContent = "Loading...";
        placeholder.style.display = isCached ? "none" : "flex";
        return placeholder;
    }

    const beforeCachedUrl = getArenaCachedImageUrl(beforeImageUrl);
    const afterCachedUrl = getArenaCachedImageUrl(afterImageUrl);
    const afterPlaceholder = useSplitPlaceholders
        ? createSplitPlaceholder("background", afterLabel, afterImageUrl, Boolean(afterCachedUrl))
        : null;
    const beforePlaceholder = useSplitPlaceholders
        ? createSplitPlaceholder("foreground", beforeLabel, beforeImageUrl, Boolean(beforeCachedUrl))
        : null;

    const loadingIndicator = document.createElement("div");
    loadingIndicator.className = "compare-loading cage-loading-surface";
    loadingIndicator.innerHTML = `
        <div class="icon"><i class="fas fa-spinner fa-spin"></i></div>
        <div class="filename">Loading...</div>
        <div class="progress-bar">
            <div class="progress-bar-fill"></div>
        </div>
        <div class="progress-text">Receiving image...</div>
    `;

    window.CAGELoadingUI?.ensure?.(loadingIndicator);
    const progressBarFill = loadingIndicator.querySelector(".progress-bar-fill");
    const progressText = loadingIndicator.querySelector(".progress-text");
    const progressBySource = new Map([
        [beforeImageUrl, beforeCachedUrl ? 100 : null],
        [afterImageUrl, afterCachedUrl ? 100 : null],
    ]);

    const states = [
        {
            image: afterImage,
            source: afterImageUrl,
            label: afterLabel,
            placeholder: afterPlaceholder,
            finished: false,
            failed: false,
        },
        {
            image: beforeImage,
            source: beforeImageUrl,
            label: beforeLabel,
            placeholder: beforePlaceholder,
            finished: false,
            failed: false,
        },
    ];

    let loadedCount = 0;
    let errorCount = 0;
    const generation = arenaImageGeneration;

    function updateProgress(state, progress) {
        const hasProgress = Number.isFinite(progress);
        const boundedProgress = hasProgress ? Math.max(0, Math.min(100, progress)) : null;

        if (useSplitPlaceholders) {
            if (window.CAGELoadingUI?.setLoading && state.placeholder) {
                window.CAGELoadingUI.setLoading(state.placeholder, boundedProgress);
            } else {
                const label = state.placeholder?.querySelector(".label");
                if (label) label.textContent = boundedProgress === null ? "Receiving image..." : Math.round(boundedProgress) + "%";
            }
            return;
        }

        if (boundedProgress !== null) progressBySource.set(state.source, boundedProgress);
        const values = Array.from(progressBySource.values()).filter(Number.isFinite);
        const average = values.length
            ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
            : null;
        if (progressBarFill && average !== null) progressBarFill.style.width = average + "%";
        if (progressText) progressText.textContent = average === null ? "Receiving image..." : average + "%";
    }

    function showSplitError(state) {
        if (!state.placeholder) return;

        state.placeholder.style.display = "flex";
        const icon = state.placeholder.querySelector(".icon");
        if (icon) {
            icon.innerHTML = '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><rect height="18" rx="2" width="18" x="3" y="3"></rect><circle cx="9" cy="9" r="2"></circle><path d="M21 15l-5-5L5 21"></path></svg>';
        }
        const filename = state.placeholder.querySelector(".filename");
        if (filename) filename.textContent = state.label;
        const label = state.placeholder.querySelector(".label");
        if (label) label.textContent = "Image unavailable";
    }

    function showGenericError() {
        const progressBar = loadingIndicator.querySelector(".progress-bar");
        if (progressBar) progressBar.style.display = "none";
        const icon = loadingIndicator.querySelector("i");
        if (icon) {
            icon.outerHTML = '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" viewBox="0 0 24 24"><rect height="18" rx="2" width="18" x="3" y="3"></rect><circle cx="9" cy="9" r="2"></circle><path d="M21 15l-5-5L5 21"></path></svg>';
        }
        if (progressText) progressText.textContent = "Image unavailable";
    }

    function finishState(state) {
        if (state.finished) return;
        state.finished = true;
        state.image.style.opacity = "1";
        updateProgress(state, 100);

        if (useSplitPlaceholders) {
            if (state.placeholder) state.placeholder.style.display = "none";
            return;
        }

        loadedCount++;
        if (loadedCount < states.length) return;
        if (errorCount >= states.length) {
            showGenericError();
            return;
        }
        loadingIndicator.remove();
    }

    function failState(state) {
        if (state.finished) return;
        state.finished = true;
        state.failed = true;
        state.image.style.opacity = "0";
        errorCount++;
        updateProgress(state, 100);

        if (useSplitPlaceholders) {
            showSplitError(state);
            return;
        }

        loadedCount++;
        if (loadedCount < states.length) return;
        if (errorCount >= states.length) {
            showGenericError();
            return;
        }
        loadingIndicator.remove();
    }

    function assignImageSource(state, sourceUrl) {
        state.image.onload = function () {
            if (generation === arenaImageGeneration && wrapper.isConnected) {
                finishState(state);
            }
        };
        state.image.onerror = function () {
            if (generation === arenaImageGeneration && wrapper.isConnected) {
                failState(state);
            }
        };
        state.image.src = sourceUrl;

        if (state.image.complete && state.image.naturalWidth > 0) {
            finishState(state);
        }
    }

    function loadImageWithProgress(state) {
        if (!state.source) {
            failState(state);
            return;
        }

        const cachedUrl = getArenaCachedImageUrl(state.source);
        if (cachedUrl) {
            updateProgress(state, 100);
            assignImageSource(state, cachedUrl);
            return;
        }

        const sharedLoader = getArenaImageLoader();
        if (sharedLoader?.load) {
            sharedLoader.load(state.source, {
                onProgress: function (progress) {
                    if (generation === arenaImageGeneration && wrapper.isConnected) {
                        updateProgress(state, progress);
                    }
                },
            }).then(function (resource) {
                if (generation !== arenaImageGeneration || !wrapper.isConnected) return;
                assignImageSource(state, resource.url);
            }).catch(function () {
                if (generation === arenaImageGeneration && wrapper.isConnected) failState(state);
            });
            return;
        }

        fetch(state.source, { cache: "force-cache" })
            .then(function (response) {
                if (!response.ok) throw new Error("Network response was not ok");
                return response.blob();
            })
            .then(function (blob) {
                if (!blob || generation !== arenaImageGeneration || !wrapper.isConnected) return;
                const objectUrl = URL.createObjectURL(blob);
                setArenaCachedImageUrl(state.source, objectUrl);
                updateProgress(state, 100);
                assignImageSource(state, objectUrl);
            })
            .catch(function () {
                if (generation === arenaImageGeneration && wrapper.isConnected) failState(state);
            });
    }

    const divider = document.createElement("div");
    divider.className = "compare-divider";
    divider.setAttribute("role", "separator");
    divider.setAttribute("aria-orientation", "vertical");

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    const parsedPercentage = Number(initialPercentage);
    const percentage = Number.isFinite(parsedPercentage)
        ? Math.max(0, Math.min(100, parsedPercentage))
        : 50;
    slider.value = String(percentage);
    slider.className = "slider";
    slider.tabIndex = -1;
    slider.setAttribute("aria-hidden", "true");

    const sliderButton = document.createElement("div");
    sliderButton.className = "slider-button";

    sliderContainer.appendChild(afterImage);
    if (afterPlaceholder) sliderContainer.appendChild(afterPlaceholder);
    sliderContainer.appendChild(beforeImage);
    if (beforePlaceholder) sliderContainer.appendChild(beforePlaceholder);
    sliderContainer.append(divider, slider, sliderButton, compareBadges);

    const needsLoading = !beforeCachedUrl || !afterCachedUrl;
    if (!useSplitPlaceholders && needsLoading) {
        sliderContainer.appendChild(loadingIndicator);
    }
    wrapper.appendChild(sliderContainer);

    beforeImage.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
    if (beforePlaceholder) {
        beforePlaceholder.style.left = "0";
        beforePlaceholder.style.right = "auto";
        beforePlaceholder.style.width = `${percentage}%`;
    }
    if (afterPlaceholder) {
        afterPlaceholder.style.left = `${percentage}%`;
        afterPlaceholder.style.right = "0";
        afterPlaceholder.style.width = "auto";
    }
    divider.style.left = `${percentage}%`;
    sliderButton.style.left = `${percentage}%`;

    states.forEach(loadImageWithProgress);

    function updateSlider(clientX, clientY) {
        const rect = sliderContainer.getBoundingClientRect();
        if (!rect.width) return;

        const nextPercentage = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));

        slider.value = String(nextPercentage);
        beforeImage.style.clipPath = `inset(0 ${100 - nextPercentage}% 0 0)`;
        if (beforePlaceholder) {
            beforePlaceholder.style.width = `${nextPercentage}%`;
        }
        if (afterPlaceholder) {
            afterPlaceholder.style.left = `${nextPercentage}%`;
        }
        divider.style.left = `${nextPercentage}%`;
        sliderButton.style.left = `${nextPercentage}%`;

        if (clientY !== undefined) {
            const verticalPercentage = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
            sliderButton.style.top = `${verticalPercentage}%`;
        }
    }

    let dragging = false;

    divider.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        dragging = true;
        divider.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
        updateSlider(e.clientX, e.clientY);
    });

    divider.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        e.preventDefault();
        updateSlider(e.clientX, e.clientY);
    });

    function stopDragging(e) {
        if (!dragging) return;
        dragging = false;

        if (divider.hasPointerCapture(e.pointerId)) {
            divider.releasePointerCapture(e.pointerId);
        }

        sliderButton.style.transition = "top 0.2s ease-out";
        sliderButton.style.top = "50%";

        setTimeout(function () {
            sliderButton.style.transition = "";
        }, 300);
    }

    divider.addEventListener("pointerup", stopDragging);
    divider.addEventListener("pointercancel", stopDragging);

    sliderButton.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        dragging = true;
        sliderButton.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
        updateSlider(e.clientX, e.clientY);
    });

    sliderButton.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        e.preventDefault();
        updateSlider(e.clientX, e.clientY);
    });

    sliderButton.addEventListener("pointerup", stopDragging);
    sliderButton.addEventListener("pointercancel", stopDragging);

    return wrapper;
}

function displayBeforeAfterImage(card, beforeImageUrl, afterImageUrl, options = {}) {
    if (!card || !beforeImageUrl || !afterImageUrl) return;

    const existingWrapper = card.querySelector(".arena-compare-wrapper");
    if (existingWrapper) {
        existingWrapper.remove();
    }

    hideArenaCardIndexForComparison(card);

    const img = card.querySelector("img.arena-img");
    if (img) {
        img.style.display = "none";
    }

    const placeholder = card.querySelector(".img-placeholder");
    if (placeholder) {
        placeholder.style.display = "none";
        card.insertBefore(createComparisonView(beforeImageUrl, afterImageUrl, undefined, options), placeholder);
    } else {
        card.appendChild(createComparisonView(beforeImageUrl, afterImageUrl, undefined, options));
    }
}

function displayBeforeAfterImageInput(box, beforeImageUrl, afterImageUrl) {
    if (!box || !beforeImageUrl || !afterImageUrl) return;

    const existingWrapper = box.querySelector(".arena-compare-wrapper");
    let initialPercentage = ARENA_CONFIG.compareInitialPercentage;
    if (existingWrapper) {
        const slider = existingWrapper.querySelector(".slider");
        if (slider) {
            initialPercentage = parseInt(slider.value, 10);
        }
    }

    const wrapper = createComparisonView(beforeImageUrl, afterImageUrl, initialPercentage, {
        splitLoadingPlaceholders: true,
        beforeLabel: "Low-light image",
        afterLabel: "GT-mean Enlightened image",
        beforeBadge: "Low-light",
        afterBadge: "Enlightened",
    });
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
    if (isComparisonMode || isAnswered || isArenaRoundLoading()) return;
    const candidateCard = document.querySelectorAll(".arena-card")[index];
    if (!isArenaCardReady(candidateCard)) return;

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

function clearArenaImages() {
    const inputBox = document.getElementById("arena-input-box");
    if (inputBox) {
        const visual = inputBox.querySelector(":scope > #arena-input-img, :scope > .arena-compare-wrapper");
        if (visual) {
            visual.remove();
        }
        const placeholder = document.getElementById("arena-input-placeholder");
        if (placeholder) {
            placeholder.style.display = "flex";
        }
    }

    document.querySelectorAll(".arena-card").forEach(function (card) {
        const img = card.querySelector("img.arena-img");
        if (img) {
            img.onload = null;
            img.onerror = null;
            img.removeAttribute("src");
            img.dataset.loadedSource = "";
            img.style.display = "none";
        }
        card.dataset.loadState = "loading";
        card.setAttribute("aria-busy", "true");
        const wrapper = card.querySelector(".arena-compare-wrapper");
        if (wrapper) {
            wrapper.remove();
        }
        const placeholder = card.querySelector(".img-placeholder");
        if (placeholder) {
            placeholder.style.display = "flex";
        }
        card.classList.remove("selected", "correct", "comparison-base", "comparison-active");
    });
}

async function nextArenaRound() {
    clearArenaImages();

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
