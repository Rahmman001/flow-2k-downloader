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

function getImageCards() {
    const items = [];
    const seenCards = new Set();

    for (const img of getVisibleElements("img")) {
        if (img.naturalWidth < 80 || img.naturalHeight < 80) continue;

        const card = img.closest("[data-item], [role='listitem'], [class*='card' i], [class*='tile' i]") || img.parentElement?.parentElement || img.parentElement;
        if (!card || seenCards.has(card)) continue;
        seenCards.add(card);

        // Normalize image key (strip resolution suffixes like =s512 so upscale doesn't change key)
        const rawSrc = img.currentSrc || img.src || "";
        const cleanSrc = rawSrc.split("=")[0].split("?")[0];
        const key = card.getAttribute("data-id") || card.id || cleanSrc;

        if (!key || card.dataset.flowProcessed === "true") continue;

        const label = (img.alt || img.title || card.getAttribute("aria-label") || card.innerText || "").trim().toLowerCase();
        items.push({ card, key, label });
    }

    return items;
}

function scrollGallery() {
    window.scrollBy({ top: 800, behavior: "smooth" });
    const scroller = document.querySelector("main, [role='main'], [class*='scroll' i], [class*='gallery' i], [class*='grid' i]");
    if (scroller) scroller.scrollBy({ top: 800, behavior: "smooth" });
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

    let existingFiles = new Set();
    try {
        const resp = await chrome.runtime.sendMessage({ command: "GET_EXISTING_FILES" });
        if (resp?.files) existingFiles = new Set(resp.files);
    } catch (e) {}

    while (running) {
        await waitIfPaused();
        if (!running) break;

        const items = getImageCards();
        const nextItem = items.find(item => !processedKeys.has(item.key));

        if (!nextItem) {
            if (scrollRetries < 5) {
                scrollRetries++;
                updateHUD(`⚡ Flow 2K: Loading more images (${scrollRetries}/5)...`);
                scrollGallery();
                await sleep(1500);
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