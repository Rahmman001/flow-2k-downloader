const statusElement = document.getElementById("status");

async function sendCommand(command) {
    try {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        if (!tab?.id) {
            statusElement.textContent = "No active tab found.";
            return;
        }

        const response = await chrome.tabs.sendMessage(
            tab.id,
            { command }
        );

        if (response?.status) {
            statusElement.textContent = response.status;
        }
    } catch (error) {
        if (command !== "STATUS") {
            statusElement.textContent = "Open Google Flow and reload the page first.";
        }
    }
}

document.getElementById("start").onclick =
    () => sendCommand("START");

document.getElementById("pause").onclick =
    () => sendCommand("PAUSE");

document.getElementById("resume").onclick =
    () => sendCommand("RESUME");

document.getElementById("stop").onclick =
    () => sendCommand("STOP");

sendCommand("STATUS");
setInterval(() => sendCommand("STATUS"), 1000);