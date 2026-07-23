# ChatGPT Thread Export

Browser extension for **Chrome** and **Firefox** that scrolls a long ChatGPT conversation, collects every loaded message, and shows an on-page export overlay you can copy into Word.

ChatGPT virtualizes long threads, so a normal select/copy often misses older messages. This extension sweeps the thread and accumulates messages as they appear.

## Install from this repo

### Chrome / Edge / Brave

1. Clone or download this repository
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select this folder (the one that contains `manifest.json`)

### Firefox

Temporary install (resets when Firefox restarts):

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` from this folder

For a permanent Firefox install you need a signed `.xpi` (Mozilla Add-ons or self-distribution). This repo is ready for that packaging step.

## Use

1. Open a conversation on [chatgpt.com](https://chatgpt.com)
2. Click once inside the message area
3. Click the extension icon in the toolbar
4. Wait while it loads older messages, then sweeps downward
5. When the overlay appears, click **Copy all**
6. Paste into Word with `Cmd+V` (macOS) or `Ctrl+V` (Windows/Linux)

Leave the ChatGPT tab focused while it runs. Very long threads can take a few minutes.

## What you should see

- Bottom status toast while scrolling (`Loading oldest…`, `Sweeping…`)
- Final overlay titled **ChatGPT Export ready**
- Message count and character count
- A filled text box with the transcript

## Permissions

- `activeTab` / `scripting` — run the exporter when you click the icon
- Host access to `chatgpt.com` and `chat.openai.com` — read the open conversation in your tab

The extension does not send chat contents to a remote server. Copying uses your local clipboard.

## Firefox notes

- Manifest V3 + `browser_specific_settings.gecko`
- Add-on id: `chatgpt-thread-export@hinesai`
- Uses the `chrome.*` extension APIs (supported by Firefox for compatibility)

## Development

```text
chatgpt-thread-export/
  manifest.json
  background.js
  content.js
  icons/
  README.md
  LICENSE
```

After changing files, reload the extension on `chrome://extensions` or reload the temporary add-on in Firefox, then run it again on a ChatGPT tab.

## Packaging a release ZIP

```bash
zip -r chatgpt-thread-export-v1.0.0.zip . \
  -x '.git/*' '.gitignore' '*.zip'
```

Attach the zip to a GitHub Release for easy download.

## Limitations

- Depends on ChatGPT’s current DOM (`[data-message-author-role]`)
- If OpenAI changes the page structure, selectors may need an update
- Firefox temporary installs do not survive browser restart until signed

## License

MIT
