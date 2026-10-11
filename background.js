const seenFilenames = new Set();

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    const isFlow = (
        (item.url && (item.url.includes("google") || item.url.includes("flow") || item.url.includes("aisandbox"))) ||
        (item.referrer && (item.referrer.includes("labs.google") || item.referrer.includes("flow.google")))
    );

    if (!isFlow) {
        suggest();
        return;
    }

    const base = item.filename.split(/[/\\]/).pop();

    // 1. In-memory check: block duplicates in same session (even while first is downloading)
    if (seenFilenames.has(base)) {
        console.log(`[Flow 2K] Blocked duplicate download in session: ${base}`);
        chrome.downloads.cancel(item.id, () => {
            chrome.downloads.erase({ id: item.id });
        });
        suggest();
        return;
    }
    seenFilenames.add(base);

    // 2. Disk check: block duplicates already completed in previous sessions
    chrome.downloads.search({}, (results) => {
        const alreadyExists = (results || []).some(
            prev => prev.id !== item.id &&
                    prev.filename &&
                    prev.filename.endsWith(`Flow-2K/${base}`) &&
                    prev.state !== "interrupted" &&
                    prev.exists !== false
        );

        if (alreadyExists) {
            console.log(`[Flow 2K] Blocked already existing file on disk: ${base}`);
            chrome.downloads.cancel(item.id, () => {
                chrome.downloads.erase({ id: item.id });
            });
            suggest();
            return;
        }

        suggest({ filename: `Flow-2K/${base}`, conflictAction: "uniquify" });
    });

    return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === "GET_EXISTING_FILES") {
        chrome.downloads.search({ state: "complete" }, (results) => {
            const files = (results || [])
                .filter(p => p.filename && p.filename.includes("Flow-2K") && p.exists !== false)
                .map(p => p.filename.split(/[/\\]/).pop().toLowerCase());
            sendResponse({ files: Array.from(new Set(files)) });
        });
        return true;
    }
});
