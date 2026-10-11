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

    chrome.downloads.search({ state: "complete" }, (results) => {
        const alreadyExists = (results || []).some(
            prev => prev.id !== item.id &&
                    prev.filename &&
                    prev.filename.endsWith(`Flow-2K/${base}`) &&
                    prev.exists !== false
        );

        if (alreadyExists) {
            chrome.downloads.cancel(item.id, () => {
                chrome.downloads.erase({ id: item.id });
            });
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
