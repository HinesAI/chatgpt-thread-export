# ChatGPT Thread Export

Browser extension that exports a ChatGPT conversation (via **share link**) into a
copyable overlay for Word. Fast — uses ChatGPT’s conversation API, not page scrolling.

**Proven workflow:** open the share link in an **Incognito / Private** window, click
the extension, Copy all → paste into Word.

## Recommended use (share link + Incognito)

1. In your normal ChatGPT session, open the conversation → **Share** → copy the link  
   (`https://chatgpt.com/share/...`)
2. Open an **Incognito / Private** window
3. Paste the share link and load it
4. Click the **ChatGPT Thread Export** extension icon
5. When **ChatGPT Export ready** appears, click **Copy all**
6. Paste into Word (`Ctrl+V` / `Cmd+V`)

That’s it. First and last messages are included.

> Why Incognito? On some setups the share page exports cleanly there. If a normal
> window works for you, fine — use that. If not, Incognito + share link is the path.

## Install

### Chrome / Edge / Brave

1. Download the latest release zip, **or** clone this repo
2. Unzip if needed so you have a folder containing `manifest.json`
3. Open `chrome://extensions` (or `edge://extensions`)
4. Enable **Developer mode**
5. **Load unpacked** → select that folder
6. Pin the extension  
   For Incognito: on the extension card, enable **Allow in Incognito**

### Firefox

1. `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** → select `manifest.json`  
   (Temporary add-ons reset when Firefox restarts until signed.)

## Also works on

- Regular conversation URLs: `https://chatgpt.com/c/<id>` (logged-in tab)

Prefer **share + Incognito** when you want the reliable one-shot export.

## What it does

- Reads the open `/c/...` or `/share/...` URL
- Fetches the conversation JSON ChatGPT already uses
- Walks the active branch (`current_node` → parents → root)
- Shows an overlay with the full transcript → **Copy all**

Nothing is sent to a third-party server.

## Packaging (dev)

```bash
./scripts/package.sh
# → dist/chatgpt-thread-export-v<version>.zip
```

## License

MIT
