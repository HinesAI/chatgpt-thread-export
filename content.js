(() => {
  if (window.__chatgptThreadExportRunning) {
    const existing = document.getElementById("cgpt-export-status");
    if (existing) existing.textContent = "Export already running…";
    return;
  }
  window.__chatgptThreadExportRunning = true;

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

  const idsFromUrl = () => {
    const path = location.pathname;
    const conv = path.match(/\/c\/([a-f0-9-]{36})/i);
    if (conv) return { kind: "conversation", id: conv[1] };
    const share = path.match(/\/share\/(?:e\/)?([a-zA-Z0-9_-]+)/i);
    if (share) return { kind: "share", id: share[1] };
    return null;
  };

  const getAccessToken = async () => {
    try {
      const res = await fetch("/api/auth/session", { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.accessToken || data?.access_token || null;
    } catch (_e) {
      return null;
    }
  };

  const fetchJson = async (url, token) => {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { credentials: "include", headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${url} → ${res.status}: ${body.slice(0, 240)}`);
    }
    return res.json();
  };

  const loadConversation = async (ref, token) => {
    if (ref.kind === "conversation") {
      return fetchJson(`/backend-api/conversation/${ref.id}`, token);
    }

    const shareCandidates = [
      `/backend-api/shared_conversations/${ref.id}`,
      `/backend-api/share/${ref.id}`,
      `/backend-api/conversation/share/${ref.id}`,
    ];
    let lastErr;
    for (const url of shareCandidates) {
      try {
        const data = await fetchJson(url, token);
        return data.mapping ? data : data.conversation || data;
      } catch (err) {
        lastErr = err;
      }
    }

    const next = document.getElementById("__NEXT_DATA__");
    if (next?.textContent) {
      try {
        const parsed = JSON.parse(next.textContent);
        const stack = [parsed];
        while (stack.length) {
          const cur = stack.pop();
          if (cur && typeof cur === "object") {
            if (cur.mapping && (cur.current_node || cur.title)) return cur;
            for (const v of Object.values(cur)) stack.push(v);
          }
        }
      } catch (_e) {
        /* ignore */
      }
    }

    throw lastErr || new Error("Could not load share conversation JSON");
  };

  const partToText = (part) => {
    if (part == null) return "";
    if (typeof part === "string") return part;
    if (typeof part === "object") {
      if (typeof part.text === "string") return part.text;
      if (typeof part.value === "string") return part.value;
      if (part.content_type === "image_asset_pointer") return "[image]";
      if (Array.isArray(part.parts)) return part.parts.map(partToText).join("");
      if (Array.isArray(part.content)) return part.content.map(partToText).join("\n");
    }
    return "";
  };

  const messageText = (msg) => {
    if (!msg) return "";
    const c = msg.content;
    if (!c) return "";
    if (typeof c === "string") return c.trim();
    if (Array.isArray(c.parts)) return c.parts.map(partToText).join("\n").trim();
    if (typeof c.text === "string") return c.text.trim();
    if (Array.isArray(c)) return c.map(partToText).join("\n").trim();
    return "";
  };

  const isHidden = (msg) => {
    const md = msg?.metadata || {};
    return Boolean(md.is_visually_hidden_from_conversation || md.is_user_system_message);
  };

  const linearizeFlat = (mapping) => {
    const msgs = [];
    for (const node of Object.values(mapping)) {
      const msg = node?.message;
      if (!msg) continue;
      const role = msg.author?.role;
      if (role !== "user" && role !== "assistant") continue;
      if (isHidden(msg)) continue;
      const text = messageText(msg);
      if (!text) continue;
      msgs.push({
        role,
        text,
        create_time: msg.create_time ?? node.create_time ?? null,
        id: msg.id || node.id,
      });
    }
    msgs.sort((a, b) => {
      const ta = a.create_time;
      const tb = b.create_time;
      if (ta == null && tb == null) return 0;
      if (ta == null) return -1;
      if (tb == null) return 1;
      return ta - tb;
    });
    const seen = new Set();
    return msgs.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  };

  /** Active branch: current_node → parents → root, then reverse. */
  const linearize = (data) => {
    const mapping = data.mapping || {};
    let startId = data.current_node;

    if (!startId) {
      const tip = Object.values(mapping).find(
        (n) => n && n.message && (!n.children || n.children.length === 0)
      );
      startId = tip?.id;
    }
    if (!startId) return linearizeFlat(mapping);

    const path = [];
    const visited = new Set();
    let nodeId = startId;
    while (nodeId && !visited.has(nodeId)) {
      visited.add(nodeId);
      const node = mapping[nodeId];
      if (!node) break;
      path.push(node);
      nodeId = node.parent;
    }
    path.reverse();

    const msgs = [];
    for (const node of path) {
      const msg = node.message;
      if (!msg) continue;
      const role = msg.author?.role;
      if (role !== "user" && role !== "assistant") continue;
      if (isHidden(msg)) continue;
      const text = messageText(msg);
      if (!text) continue;
      msgs.push({ role, text, id: msg.id || node.id });
    }

    if (msgs.length < 2) {
      const flat = linearizeFlat(mapping);
      if (flat.length > msgs.length) return flat;
    }
    return msgs;
  };

  const toText = (title, messages) => {
    const blocks = [`# ${title || "ChatGPT conversation"}`, ""];
    for (const m of messages) {
      const who = m.role === "user" ? "You" : "ChatGPT";
      blocks.push(`${who}:\n${m.text}`);
    }
    return blocks.join("\n\n----------------\n\n").trim();
  };

  const showOverlay = (text, messageCount, title) => {
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

    const titleEl = document.createElement("div");
    titleEl.innerHTML = `<strong>ChatGPT Export ready</strong><div style="opacity:.8;font-size:12px;margin-top:2px">${
      title ? title.replace(/</g, "&lt;") + " · " : ""
    }${messageCount} messages · ${text.length.toLocaleString()} characters</div>`;

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
    header.append(titleEl, actions);
    panel.append(header, ta);
    overlay.append(panel);
    document.body.append(overlay);
    ta.focus();
    ta.scrollTop = 0;
  };

  const run = async () => {
    try {
      const ref = idsFromUrl();
      if (!ref) {
        alert(
          "Open a ChatGPT conversation or share link first.\n\n" +
            "https://chatgpt.com/c/...\nor\nhttps://chatgpt.com/share/..."
        );
        return;
      }

      status(`Loading ${ref.kind} via API…`);
      const token = await getAccessToken();
      const data = await loadConversation(ref, token);
      status("Building transcript…");

      const messages = linearize(data);
      if (!messages.length) {
        alert("Loaded the conversation, but found no user/assistant messages.");
        console.log("[chatgpt-thread-export]", data);
        return;
      }

      const title = data.title || "ChatGPT conversation";
      const text = toText(title, messages);
      showOverlay(text, messages.length, title);
      status(`Done: ${messages.length} messages`);
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
