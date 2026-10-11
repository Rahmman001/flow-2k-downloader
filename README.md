# Flow 2K Downloader

A lightweight Google Chrome extension (Manifest V3) that automates batch downloading images in **2K resolution** from Google Flow projects.

---

## 🛑 The Problem

Google Flow (`labs.google` / `flow.google.com`) is powerful for generative visuals, but exporting your work at maximum quality is tedious:

- **Batch download only gives you 1K:** Google Flow's built-in project download feature only exports lower-resolution **1K** images.
- **2K requires painful manual clicking:** If you want the ultra-sharp **2K Upscaled** versions, you have to do it by hand for every single image:
  1. Hover over the card
  2. Click the options menu (`⋮` or download icon)
  3. Click **Download**
  4. Click **2K**
  5. Repeat 50 to 200+ times for your entire project!
- **Messy downloads folder:** Downloading dozens of files individually scatters them across your main Downloads folder with no grouping.

---

## 💡 Why This Extension Exists

**Flow 2K Downloader** was built to eliminate this repetitive manual grind with one click.

It automates the entire sequence for you:
- Finds every image card in your gallery.
- Handles the hover, menu clicks, and selects **2K Upscaled**.
- Auto-scrolls through the project so lazy-loaded images aren't missed.
- Neatly organizes all images into a clean `Downloads/Flow-2K/` folder without renaming them.

---

## Features

- **Automated 2K Batch Download:** Loops through generated image cards on Google Flow, opens their menu, and selects the 2K resolution option.
- **Dedicated Folder Routing:** Automatically saves all downloaded images into a `Downloads/Flow-2K/` subfolder, keeping your Downloads directory tidy.
- **Original Filename Preservation:** Keeps the original image filenames provided by Flow while organizing them into the `Flow-2K` folder.
- **Smart Auto-Scroll:** Detects when more images need to be loaded and scrolls down the page smoothly to trigger lazy rendering.
- **Clean Popup Controls:** Easily **Start**, **Pause**, **Resume**, and **Stop** the download loop with real-time status updates.

---

## Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/Rahmman001/flow-2k-downloader.git
   ```
2. Open Google Chrome and navigate to:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select this repository folder.

---

## How to Use

1. Open your project on [Google Flow](https://labs.google/) (or `flow.google.com`).
2. Reload the page once after loading the extension.
3. Click the **Flow 2K Downloader** extension icon in your Chrome toolbar.
4. Click **Start Download**.
5. The extension will automatically scroll, open menus, and download each 2K image into `Downloads/Flow-2K/`.

> **Tip:** In Chrome Settings (**Settings → Downloads**), make sure *"Ask where to save each file before downloading"* is **turned OFF** so images save automatically without prompt dialogs.

---

## File Structure

```text
├── manifest.json   # Chrome Extension Manifest V3 configuration
├── popup.html      # Extension toolbar popup interface
├── popup.js        # Controller and message sender for popup UI
├── content.js      # Page automation script injected into Google Flow
├── background.js   # Background service worker routing downloads to Flow-2K/
└── README.md       # Project documentation
```

---

## License

MIT License. Feel free to use and modify!
