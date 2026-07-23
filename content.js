(() => {
  if (window.__chatgptThreadExportRunning) {
    const existing = document.getElementById("cgpt-export-status");
    if (existing) existing.textContent = "Export already running…";
    return;
  }
  window.__chatgptThreadExportRunning = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const status = (msg) => {
    let el = document.getElementById("cgpt-export-status");
    if (!el) {
      el = document.createElement("div");
      el.id = "cgpt-export-status";
      el.style.cssText =
        "position:fixed;z-index:2147483646;left:50%;bottom:20px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 14px;border-radius:10px;font:13px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:90vw;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.35);";
      document.body.appendChild(el);
    }
    el.textContent = msg;
  };

  const isScrollable = (el) => {
    if (!el) return false;
    const st = getComputedStyle(el);
    return /(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 40;
  };

  const collectScrollers = () =>
    [...document.querySelectorAll("div, main, section")]
      .filter(isScrollable)
      .sort((a, b) => b.scrollHeight - a.scrollHeight)
      .slice(0, 8);

  const messageNodes = () =>
    [...document.querySelectorAll("[data-message-author-role]")].filter((el) => {
      const t = (el.innerText || "").trim();
      return t.length > 0;
    });

  const showOverlay = (text, messageCount) => {
    document.getElementById("cgpt-export-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "cgpt-export-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:24px;";

    const panel = document.createElement("div");
    panel.style.cssText =
      "width:min(1100px,96vw);height:min(860px,92vh);background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden;";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;gap:10px;align-items:center;justify-content:space-between;padding:14px 16px;background:#111;color:#fff;font:14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;";

    const title = document.createElement("div");
    title.innerHTML = `<strong>ChatGPT Export ready</strong><div style="opacity:.8;font-size:12px;margin-top:2px">${messageCount} messages · ${text.length.toLocaleString()} characters</div>`;

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:8px;";

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "Copy all";
    copyBtn.style.cssText =
      "padding:8px 12px;border:0;border-radius:8px;background:#4ea1ff;color:#fff;font-weight:600;cursor:pointer;";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.style.cssText =
      "padding:8px 12px;border:0;border-radius:8px;background:#333;color:#fff;cursor:pointer;";

    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "readonly");
    ta.style.cssText =
      "flex:1;width:100%;border:0;padding:16px;box-sizing:border-box;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;resize:none;color:#111;background:#fff;";

    copyBtn.onclick = async () => {
      ta.focus();
      ta.select();
      try {
        await navigator.clipboard.writeText(ta.value);
        copyBtn.textContent = "Copied";
        alert("Copied. Paste into Word with Cmd+V / Ctrl+V.");
      } catch (_err) {
        document.execCommand("copy");
        copyBtn.textContent = "Copied";
        alert("Copied. Paste into Word with Cmd+V / Ctrl+V.");
      }
    };

    closeBtn.onclick = () => overlay.remove();
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });

    actions.append(copyBtn, closeBtn);
    header.append(title, actions);
    panel.append(header, ta);
    overlay.append(panel);
    document.body.append(overlay);
    ta.focus();
    ta.scrollTop = 0;
  };

  const run = async () => {
    try {
      const scrollers = collectScrollers();
      if (!scrollers.length) {
        alert("No scroll area found. Click once inside the chat messages, then run the extension again.");
        return;
      }

      const store = new Map();
      const order = [];

      const harvest = () => {
        messageNodes().forEach((el) => {
          const role = el.getAttribute("data-message-author-role") || "unknown";
          const text = (el.innerText || "").trim();
          if (!text) return;
          const id =
            el.getAttribute("data-message-id") ||
            `${role}:${text.length}:${text.slice(0, 120)}`;
          if (store.has(id)) return;
          store.set(id, { role, text });
          order.push(id);
        });
      };

      const scrollTop = () => {
        for (const s of scrollers) s.scrollTop = 0;
        window.scrollTo(0, 0);
      };

      const scrollDown = () => {
        for (const s of scrollers) {
          const step = Math.max(400, Math.floor(s.clientHeight * 0.8));
          s.scrollTop = Math.min(s.scrollTop + step, s.scrollHeight);
        }
      };

      status("Loading oldest messages…");
      let stable = 0;
      let prev = -1;
      for (let i = 0; i < 500; i++) {
        scrollTop();
        await sleep(280);
        harvest();
        status(`Loading oldest… ${store.size} messages`);
        if (store.size === prev) stable += 1;
        else stable = 0;
        prev = store.size;
        if (stable >= 12) break;
      }

      status("Sweeping full thread…");
      stable = 0;
      prev = store.size;
      let prevTop = "";
      for (let i = 0; i < 3000; i++) {
        scrollDown();
        await sleep(220);
        harvest();
        const sig = scrollers.map((s) => Math.round(s.scrollTop)).join("/");
        status(`Sweeping… ${store.size} messages | scroll ${sig}`);
        if (store.size === prev && sig === prevTop) stable += 1;
        else stable = 0;
        prev = store.size;
        prevTop = sig;
        if (stable >= 15) break;
      }

      harvest();

      const text = order
        .map((id) => {
          const m = store.get(id);
          const who =
            m.role === "user" ? "You" : m.role === "assistant" ? "ChatGPT" : m.role;
          return `${who}:\n${m.text}`;
        })
        .join("\n\n----------------\n\n")
        .trim();

      if (!text) {
        alert("Captured 0 messages. Open a conversation and try again.");
        return;
      }

      showOverlay(text, store.size);
      status(`Done: ${store.size} messages ready`);
    } catch (err) {
      console.error(err);
      alert(`Export failed: ${err && err.message ? err.message : err}`);
    } finally {
      window.__chatgptThreadExportRunning = false;
      setTimeout(() => {
        document.getElementById("cgpt-export-status")?.remove();
      }, 2500);
    }
  };

  run();
})();
