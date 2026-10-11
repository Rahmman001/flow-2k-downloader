const seenUrls = new Set();
let fileCounter = 1;

function cleanFilename(filename) {
    const lastDot = filename.lastIndexOf(".");
    const ext = lastDot > 0 ? filename.slice(lastDot + 1) : "png";
    let name = lastDot > 0 ? filename.slice(0, lastDot) : filename;

    // 1. Full ISO date-time: 2026-10-11T10:45:12, 2026-10-11 10-45-12, 2026-10-11T10_45_12_345Z
    name = name.replace(/(?:[\s_(-]+|\b)\d{4}[-_/]\d{2}[-_/]\d{2}[T\s_ -]\d{2}[:._-]\d{2}(?:[:._-]\d{2})?(?:\.\d{1,6}|[._-]\d{3,6}Z?)?(?:Z|[+-]\d{2,4})?[)\]]?(?=[\s_\-.)\]]|$)/gi, "");

    // 2. Compact YYYYMMDD_HHMMSS or YYYYMMDDTHHMMSS
    name = name.replace(/(?:[\s_(-]+|\b)\d{8}[T_\s-]\d{6}[)\]]?(?=[\s_\-.)\]]|$)/gi, "");

    // 3. Date only: 2026-10-11, 2026_10_11, (2026-10-11)
    name = name.replace(/(?:[\s_(-]+|\b)\d{4}[-_/]\d{2}[-_/]\d{2}[)\]]?(?=[\s_\-.)\]]|$)/g, "");

    // 4. Unix epoch timestamps (10 to 13 digits)
    name = name.replace(/(?:[\s_(-]+|\b)[12]\d{9,12}[)\]]?(?=[\s_\-.)\]]|$)/g, "");

    // 5. 8-digit date like _20261011 (from 1900 to 2099)
    name = name.replace(/(?:[\s_(-]+|\b)(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[)\]]?(?=[\s_\-.)\]]|$)/g, "");

    // 6. Time only: _10-45-12 or _10_45_12 or (10:45:12)
    name = name.replace(/(?:[\s_(-]+|\b)\d{2}[:._-]\d{2}[:._-]\d{2}[)\]]?(?=[\s_\-.)\]]|$)/g, "");

    // Clean up trailing / leading separators (dashes, underscores, dots, spaces, brackets)
    name = name.replace(/^[\s_.\-()[\]{}]+|[\s_.\-()[\]{}]+$/g, "");

    if (!name) {
        name = lastDot > 0 ? filename.slice(0, lastDot) : "image";
    }

    return `${name}.${ext}`;
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    const isFlow = (
        (item.url && (item.url.includes("google") || item.url.includes("flow") || item.url.includes("aisandbox"))) ||
        (item.finalUrl && (item.finalUrl.includes("google") || item.finalUrl.includes("flow") || item.finalUrl.includes("aisandbox"))) ||
        (item.referrer && (item.referrer.includes("labs.google") || item.referrer.includes("flow.google") || item.referrer.includes("google")))
    );

    if (!isFlow) {
        suggest();
        return;
    }

    const base = item.filename.split(/[/\\]/).pop();

    chrome.storage.local.get("namingMode", (storage) => {
        const mode = storage.namingMode || "original";
        const isSequential = mode.startsWith("sequential");
        const ext = base.split(".").pop() || "png";
        const targetName = isSequential
            ? `image_${String(fileCounter++).padStart(3, "0")}.${ext}`
            : cleanFilename(base);

        // 1. In-memory check: block duplicate download of exact same URL in same session
        if (item.url && seenUrls.has(item.url)) {
            console.log(`[Flow 2K] Blocked duplicate download of URL: ${item.url}`);
            chrome.downloads.cancel(item.id, () => {
                chrome.downloads.erase({ id: item.id });
            });
            suggest();
            return;
        }
        if (item.url) seenUrls.add(item.url);

        // 2. Disk check: block if exact same URL already completed
        chrome.downloads.search({}, (results) => {
            const alreadyExists = (results || []).some(
                prev => prev.id !== item.id &&
                        prev.state !== "interrupted" &&
                        prev.exists !== false &&
                        item.url && prev.url === item.url
            );

            if (alreadyExists) {
                console.log(`[Flow 2K] Blocked already existing download: ${targetName}`);
                chrome.downloads.cancel(item.id, () => {
                    chrome.downloads.erase({ id: item.id });
                });
                suggest();
                return;
            }

            suggest({ filename: `Flow-2K/${targetName}`, conflictAction: "uniquify" });
        });
    });

    return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === "RESET_COUNTER") {
        fileCounter = 1;
        seenUrls.clear();
    } else if (message.command === "GET_EXISTING_FILES") {
        chrome.downloads.search({ state: "complete" }, (results) => {
            const files = (results || [])
                .filter(p => p.filename && p.filename.includes("Flow-2K") && p.exists !== false)
                .map(p => cleanFilename(p.filename.split(/[/\\]/).pop()).toLowerCase());
            sendResponse({ files: Array.from(new Set(files)) });
        });
        return true;
    }
});
