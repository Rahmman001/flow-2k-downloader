const seenUrls = new Set();
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
        const mode = storage.namingMode || "sequential_oldest";
        const isSequential = mode.startsWith("sequential");
        const ext = base.split(".").pop() || "png";
        const targetName = isSequential
            ? `image_${String(fileCounter++).padStart(3, "0")}.${ext}`
            : base;

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

        // 2. Disk check: block if exact same URL or target file already completed
        chrome.downloads.search({}, (results) => {
            const alreadyExists = (results || []).some(
                prev => prev.id !== item.id &&
                        prev.state !== "interrupted" &&
                        prev.exists !== false &&
                        (
                            (item.url && prev.url === item.url) ||
                            (!isSequential && prev.filename && prev.filename.endsWith(`Flow-2K/${targetName}`))
                        )
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
        seenUrls.clear();
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
