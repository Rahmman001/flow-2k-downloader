const DELAY = 1800;

let running = false;
let paused = false;
let processedKeys = new Set();
let downloaded = 0;
let failed = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getVisibleElements(selector) {
    return [...document.querySelectorAll(selector)].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && el.offsetParent !== null;
    });
}

function findText(pattern) {
    const isRegex = pattern instanceof RegExp;
    return getVisibleElements("button, [role='menuitem'], [role='button'], li, span, a").find(el => {
        const text = (el.innerText || el.getAttribute("aria-label") || "").trim();
        return isRegex ? pattern.test(text) : text.toLowerCase().includes(pattern.toLowerCase());
    });
}

function findMenuButton(card) {
    const buttons = card.querySelectorAll("button, [role='button']");
    return [...buttons].find(b => {
        const t = (b.getAttribute("aria-label") || b.getAttribute("title") || b.innerText || "").toLowerCase();
        return t.includes("more") || t.includes("menu") || t.includes("option") || t.includes("download");
    }) || buttons[0];
}

async function waitFor(predicate, timeout = 1500) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const res = predicate();
        if (res) return res;
        await sleep(100);
    }
    return null;
}

function extractCardTime(card) {
    const raw = card.getAttribute("data-timestamp") || card.getAttribute("data-created") || card.getAttribute("data-time");
    if (raw) {
        const n = Number(raw);
        if (!isNaN(n)) return n;
        const d = Date.parse(raw);
        if (!isNaN(d)) return d;
    }
    const timeEl = card.querySelector("time");
    if (timeEl) {
        const d = Date.parse(timeEl.getAttribute("datetime") || timeEl.innerText);
        if (!isNaN(d)) return d;
    }
    for (const el of card.querySelectorAll("span, p, div")) {
        const t = el.innerText?.trim();
        if (t && /(?:am|pm|\b\d{1,2}:\d{2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b)/i.test(t)) {
            const d = Date.parse(t);
            if (!isNaN(d)) return d;
        }
    }
    return null;
}

function getImageCards() {
    const items = [];
    const seenCards = new Set();

    for (const img of getVisibleElements("img")) {
        const w = img.naturalWidth || img.getBoundingClientRect().width;
        const h = img.naturalHeight || img.getBoundingClientRect().height;
        if (w < 80 || h < 80) continue;

        const card = img.closest("[data-item], [role='listitem'], [class*='card' i], [class*='tile' i]") || img.parentElement?.parentElement || img.parentElement;
        if (!card || seenCards.has(card)) continue;
        seenCards.add(card);

        // Normalize image key (strip resolution suffixes like =s512 so upscale doesn't change key)
        const rawSrc = img.currentSrc || img.src || img.getAttribute("src") || "";
        const cleanSrc = rawSrc.split("=")[0].split("?")[0];
        const key = card.getAttribute("data-id") || card.id || cleanSrc;

        if (!key || card.dataset.flowProcessed === "true") continue;

        const label = (img.alt || img.title || card.getAttribute("aria-label") || card.innerText || "").trim().toLowerCase();
        const time = extractCardTime(card);
        items.push({ card, key, label, time });
    }

    return items;
}

function scrollGallery(direction = "down") {
    const delta = direction === "up" ? -1000 : 1000;
    window.scrollBy({ top: delta, behavior: "smooth" });
    if (document.scrollingElement) {
        document.scrollingElement.scrollBy({ top: delta, behavior: "smooth" });
    }

    // Scroll any scrollable container on Google Flow
    document.querySelectorAll("div, main, section, [role='feed'], [role='main']").forEach(el => {
        if (el.scrollHeight > el.clientHeight + 40) {
            const overflow = window.getComputedStyle(el).overflowY;
            if (overflow === "auto" || overflow === "scroll") {
                el.scrollBy({ top: delta, behavior: "smooth" });
            }
        }
    });

    // Native scrollIntoView on the edge image to trigger infinite scroll
    const imgs = document.querySelectorAll("img");
    if (imgs.length > 0) {
        const target = direction === "up" ? imgs[0] : imgs[imgs.length - 1];
        target.scrollIntoView({ behavior: "smooth", block: direction === "up" ? "start" : "end" });
    }
}

function updateHUD(text) {
    let hud = document.getElementById("flow-2k-hud");
    if (!text) {
        if (hud) hud.remove();
        return;
    }
    if (!hud) {
        hud = document.createElement("div");
        hud.id = "flow-2k-hud";
        hud.style.cssText = "position:fixed;bottom:24px;right:24px;background:#181818;color:#fff;padding:8px 16px;border-radius:24px;font-family:Arial,sans-serif;font-size:12px;font-weight:600;z-index:999999;box-shadow:0 4px 16px rgba(0,0,0,0.5);border:1px solid #333;pointer-events:none;";
        document.body.appendChild(hud);
    }
    hud.textContent = text;
}

async function clickDownload2K(card) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(100);

    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    card.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    card.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    card.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(300);

    const menuButton = findMenuButton(card);
    if (!menuButton) throw new Error("Image menu not found");
    menuButton.click();

    let option2K = await waitFor(() => findText(/\b2k\b/i), 800);
    if (!option2K) {
        const downloadOption = await waitFor(() => findText(/download/i), 600);
        if (downloadOption) {
            downloadOption.click();
            option2K = await waitFor(() => findText(/\b2k\b/i), 1200);
        }
    }

    if (!option2K) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        throw new Error("2K option not found");
    }

    option2K.click();
    await sleep(DELAY);
}

async function waitIfPaused() {
    while (paused && running) {
        updateHUD(`⏸ Flow 2K: Paused (${downloaded} saved)`);
        await sleep(250);
    }
}

async function startDownloading() {
    if (running) return;

    running = true;
    paused = false;
    let scrollRetries = 0;

    let namingMode = "original";
    try {
        const s = await chrome.storage.local.get("namingMode");
        if (s.namingMode) namingMode = s.namingMode;
    } catch (e) {}

    let existingFiles = new Set();
    try {
        const resp = await chrome.runtime.sendMessage({ command: "GET_EXISTING_FILES" });
        if (resp?.files) existingFiles = new Set(resp.files);
    } catch (e) {}

    // If downloading from oldest to newest, load the timeline downwards to reveal the oldest items first
    if (namingMode === "sequential_oldest") {
        updateHUD("⚡ Flow 2K: Scanning project timeline to reach 1st image...");
        let lastCount = 0;
        for (let i = 0; i < 40; i++) {
            if (!running) break;
            scrollGallery("down");
            await sleep(900);
            const count = document.querySelectorAll("img").length;
            if (count === lastCount && i > 5) break;
            lastCount = count;
        }
    }

    while (running) {
        await waitIfPaused();
        if (!running) break;

        let items = getImageCards();

        // Order by creation time:
        if (namingMode === "sequential_oldest") {
            const hasTimes = items.some(it => it.time !== null);
            if (hasTimes) {
                // Earliest timestamp first
                items.sort((a, b) => (a.time || Infinity) - (b.time || Infinity));
            } else {
                // Google Flow lists newest at top, oldest at bottom -> reverse so bottom (oldest) comes first
                items.reverse();
            }
        }

        const nextItem = items.find(item => !processedKeys.has(item.key));

        if (!nextItem) {
            if (scrollRetries < 8) {
                scrollRetries++;
                updateHUD(`⚡ Flow 2K: Loading more images (${scrollRetries}/8)...`);
                // If oldest mode, scroll upwards towards top/newest; otherwise scroll down
                scrollGallery(namingMode === "sequential_oldest" ? "up" : "down");
                await sleep(1800);
                continue;
            }
            break;
        }

        scrollRetries = 0;
        processedKeys.add(nextItem.key);
        nextItem.card.dataset.flowProcessed = "true";

        // Skip if label matches any existing file in Downloads/Flow-2K/
        const isExisting = Array.from(existingFiles).some(file => {
            const base = file.replace(/\.[^/.]+$/, "");
            return base.length > 5 && nextItem.label.includes(base);
        });

        if (isExisting) {
            console.log(`[Flow 2K] Skipping "${nextItem.label}" (already saved on disk).`);
            continue;
        }

        updateHUD(`⚡ Flow 2K: Saving image (${downloaded + 1} saved, ${items.length} detected)`);

        try {
            await clickDownload2K(nextItem.card);
            downloaded++;
        } catch (error) {
            failed++;
            console.error("Image download failed:", error);
        }
    }

    running = false;
    paused = false;

    updateHUD(`✅ Flow 2K: Finished! ${downloaded} saved.`);
    setTimeout(() => updateHUD(null), 4000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.command) {
        case "START":
            chrome.runtime.sendMessage({ command: "RESET_COUNTER" });
            if (!running) startDownloading();
            sendResponse({ status: "Downloading..." });
            break;
        case "PAUSE":
            paused = true;
            updateHUD(`⏸ Flow 2K: Paused (${downloaded} saved)`);
            sendResponse({ status: "Paused." });
            break;
        case "RESUME":
            paused = false;
            sendResponse({ status: "Resumed." });
            break;
        case "STOP":
            running = false;
            paused = false;
            updateHUD(null);
            sendResponse({ status: "Stopped." });
            break;
        case "STATUS":
            sendResponse({
                status: running
                    ? (paused ? `Paused (${downloaded} saved).` : `Downloading (${downloaded} saved, ${failed} failed)...`)
                    : (downloaded > 0 ? `Finished: ${downloaded} saved (${failed} failed).` : "Ready to start.")
            });
            break;
        default:
            sendResponse({ status: "Unknown command." });
    }
    return true;
});