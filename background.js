const seenFilenames = new Set();
let fileCounter = 1;

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

    chrome.storage.local.get("namingMode", (storage) => {
        const isSequential = storage.namingMode === "sequential";
        const ext = base.split(".").pop() || "png";
        const targetName = isSequential
            ? `image_${String(fileCounter++).padStart(3, "0")}.${ext}`
            : base;

        // 1. In-memory check: block duplicates in same session
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
                        prev.filename.endsWith(`Flow-2K/${targetName}`) &&
                        prev.state !== "interrupted" &&
                        prev.exists !== false
            );

            if (alreadyExists) {
                console.log(`[Flow 2K] Blocked already existing file on disk: ${targetName}`);
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
        seenFilenames.clear();
    } else if (message.command === "GET_EXISTING_FILES") {
        chrome.downloads.search({ state: "complete" }, (results) => {
            const files = (results || [])
                .filter(p => p.filename && p.filename.includes("Flow-2K") && p.exists !== false)
                .map(p => p.filename.split(/[/\\]/).pop().toLowerCase());
            sendResponse({ files: Array.from(new Set(files)) });
        });
        return true;
    }
});
