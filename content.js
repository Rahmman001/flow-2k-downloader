const DELAY = 1800;

let running = false;
let paused = false;
let processedSrcs = new Set();

let downloaded = 0;
let failed = 0;

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

function getVisibleElements(selector) {
    return [...document.querySelectorAll(selector)].filter(element => {
        const rect = element.getBoundingClientRect();

        return (
            rect.width > 0 &&
            rect.height > 0 &&
            getComputedStyle(element).visibility !== "hidden"
        );
    });
}

function findText(pattern) {
    const isRegex = pattern instanceof RegExp;
    return getVisibleElements(
        "button, [role='menuitem'], [role='button'], li, span, a"
    ).find(element => {
        const text = (element.innerText || element.getAttribute("aria-label") || "").trim();
        return isRegex ? pattern.test(text) : text.toLowerCase().includes(pattern.toLowerCase());
    });
}

function findMenuButton(card) {
    const buttons = card.querySelectorAll("button, [role='button']");

    return [...buttons].find(button => {
        const text = (
            button.getAttribute("aria-label") ||
            button.getAttribute("title") ||
            button.innerText || ""
        ).toLowerCase();

        return (
            text.includes("more") ||
            text.includes("menu") ||
            text.includes("option") ||
            text.includes("download")
        );
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
    const seenSrcs = new Set();

    for (const image of getVisibleElements("img")) {
        const src = image.currentSrc || image.src || "";
        if (!src || image.naturalWidth < 80 || image.naturalHeight < 80) {
            continue;
        }

        if (seenSrcs.has(src)) continue;
        seenSrcs.add(src);

        // Walk upward to find the card container
        let element = image.parentElement;
        let card = element;

        for (let depth = 0; element && depth < 6; depth++) {
            const rect = element.getBoundingClientRect();
            if (rect.width >= 120 && rect.height >= 100) {
                card = element;
                if (findMenuButton(element) || element.getAttribute("role") || /card|item|tile/i.test(element.className || "")) {
                    break;
                }
            }
            element = element.parentElement;
        }

        const label = (image.alt || image.title || card.getAttribute("aria-label") || card.innerText || "").trim().toLowerCase();
        items.push({ card, src, label });
    }

    return items;
}

function scrollGallery() {
    window.scrollBy({ top: 800, behavior: "smooth" });
    const scrollers = document.querySelectorAll("main, [role='main'], [class*='scroll' i], [class*='gallery' i], [class*='grid' i], div");
    for (const el of scrollers) {
        if (el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 200) {
            el.scrollBy({ top: 800, behavior: "smooth" });
        }
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
    // Dismiss any stuck menus first
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(100);

    card.scrollIntoView({ behavior: "smooth", block: "center" });

    // Modern Material 3 Pointer Events + legacy Mouse Events
    card.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    card.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    card.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    card.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(300);

    const menuButton = findMenuButton(card);
    if (!menuButton) {
        throw new Error("Image menu not found");
    }

    menuButton.click();

    // Check if 2K option appears directly, or if Download submenu needs clicking
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
        const nextItem = items.find(item => !processedSrcs.has(item.src));

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
        processedSrcs.add(nextItem.src);

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

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
        switch (message.command) {
            case "START":
                if (!running) {
                    startDownloading();
                }
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
    }
);