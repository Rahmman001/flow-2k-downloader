const DELAY = 1000;

let running = false;
let paused = false;
let processed = new WeakSet();

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

async function waitFor(predicate, timeout = 1200) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const res = predicate();
        if (res) return res;
        await sleep(100);
    }
    return null;
}

function getImageCards() {
    const cards = [];
    const seen = new Set();

    for (const image of getVisibleElements("img")) {
        if (!image.complete || image.naturalWidth < 100 || image.naturalHeight < 100) {
            continue;
        }

        // Walk upward to find the card container
        let element = image.parentElement;
        let card = null;

        for (let depth = 0; element && depth < 6; depth++) {
            const rect = element.getBoundingClientRect();
            if (rect.width >= 120 && rect.height >= 100) {
                card = element;
                if (findMenuButton(element) || element.getAttribute('role') || /card|item|tile/i.test(element.className || '')) {
                    break;
                }
            }
            element = element.parentElement;
        }

        if (card && !seen.has(card)) {
            seen.add(card);
            cards.push(card);
        }
    }

    return cards;
}

async function clickDownload2K(card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    card.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await sleep(200);

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
            option2K = await waitFor(() => findText(/\b2k\b/i), 1000);
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
        await sleep(200);
    }
}

async function startDownloading() {
    if (running) return;

    running = true;
    paused = false;

    while (running) {
        await waitIfPaused();

        if (!running) break;

        const cards = getImageCards();

        const nextCard = cards.find(card => !processed.has(card));

        if (!nextCard) {
            // Scroll to reveal more images.
            window.scrollBy({
                top: Math.max(400, window.innerHeight * 0.7),
                behavior: "smooth"
            });

            await sleep(1200);

            const newCards = getImageCards();
            const hasNewCard = newCards.some(
                card => !processed.has(card)
            );

            if (!hasNewCard) {
                // Check once more after allowing lazy-loaded images to appear.
                await sleep(1500);

                const finalCards = getImageCards();

                if (!finalCards.some(card => !processed.has(card))) {
                    break;
                }
            }

            continue;
        }

        // Mark before processing to prevent duplicate attempts.
        processed.add(nextCard);

        try {
            await clickDownload2K(nextCard);
            downloaded++;
        } catch (error) {
            failed++;
            console.error("Image download failed:", error);
        }

        console.log({
            downloaded,
            failed,
            remainingOnScreen: cards.length
        });
    }

    running = false;
    paused = false;

    console.log("Flow download process finished.", {
        downloaded,
        failed
    });
}

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
        switch (message.command) {
            case "START":
                if (!running) {
                    downloaded = 0;
                    failed = 0;
                    processed = new WeakSet();

                    startDownloading();
                }

                sendResponse({ status: "Downloading..." });
                break;

            case "PAUSE":
                paused = true;
                sendResponse({ status: "Paused." });
                break;

            case "RESUME":
                paused = false;
                sendResponse({ status: "Resumed." });
                break;

            case "STOP":
                running = false;
                paused = false;
                sendResponse({ status: "Stopped." });
                break;

            case "STATUS":
                sendResponse({
                    status: running
                        ? (paused ? `Paused (${downloaded} saved).` : `Downloading (${downloaded} saved)...`)
                        : (downloaded > 0 ? `Finished: ${downloaded} saved.` : "Ready to start.")
                });
                break;

            default:
                sendResponse({ status: "Unknown command." });
        }

        return true;
    }
);