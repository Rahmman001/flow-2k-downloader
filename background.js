chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    const isFlow = (
        (item.url && (item.url.includes("google") || item.url.includes("flow") || item.url.includes("aisandbox"))) ||
        (item.referrer && (item.referrer.includes("labs.google") || item.referrer.includes("flow.google")))
    );

    if (isFlow) {
        const base = item.filename.split(/[/\\]/).pop();
        suggest({ filename: `Flow-2K/${base}`, conflictAction: "uniquify" });
    } else {
        suggest();
    }
});
