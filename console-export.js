/**
 * ChatGPT single-conversation export (no extension, no DOM scraping).
 *
 * Works on:
 *   https://chatgpt.com/c/<conversation-id>
 *   https://chatgpt.com/share/<share-id>   (and /share/e/...)
 *
 * How to use:
 * 1. Open the conversation or share link
 * 2. F12 → Console
 * 3. Paste this whole file and press Enter
 * 4. A .md file downloads (clipboard copy when allowed)
 */
(async () => {
  const idsFromUrl = () => {
    const path = location.pathname;
    const conv = path.match(/\/c\/([a-f0-9-]{36})/i);
    if (conv) return { kind: "conversation", id: conv[1] };
    // Share links: /share/<id> or /share/e/<id> (id may be uuid or slug)
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

    // Share pages: try a few known endpoints (ChatGPT has shuffled these).
    const shareCandidates = [
      `/backend-api/shared_conversations/${ref.id}`,
      `/backend-api/share/${ref.id}`,
      `/backend-api/conversation/share/${ref.id}`,
    ];
    let lastErr;
    for (const url of shareCandidates) {
      try {
        const data = await fetchJson(url, token);
        // Some share payloads nest the conversation
        return data.mapping ? data : data.conversation || data;
      } catch (err) {
        lastErr = err;
      }
    }

    // Fallback: conversation embedded in the share page itself
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
    if (!c) {
      // Rare: text only on metadata / raw content
      if (typeof msg.parts === "string") return msg.parts.trim();
      return "";
    }
    if (typeof c === "string") return c.trim();
    if (Array.isArray(c.parts)) return c.parts.map(partToText).join("\n").trim();
    if (typeof c.text === "string") return c.text.trim();
    if (Array.isArray(c)) return c.map(partToText).join("\n").trim();
    return "";
  };

  const isHidden = (msg) => {
    const md = msg?.metadata || {};
    if (md.is_visually_hidden_from_conversation) return true;
    if (md.is_user_system_message) return true;
    return false;
  };

  /**
   * Walk the ACTIVE branch: current_node → parent → … → root, then reverse.
   * This keeps the first user turn and the latest assistant reply that the
   * share/conversation page is actually showing (flat timestamp sorts drop them).
   */
  const linearize = (data) => {
    const mapping = data.mapping || {};
    let startId = data.current_node;

    if (!startId) {
      // Tip = node with a message and no children
      const tip = Object.values(mapping).find(
        (n) => n && n.message && (!n.children || n.children.length === 0)
      );
      startId = tip?.id;
    }
    if (!startId) {
      // Last resort: any root child path via flat list
      return linearizeFlat(mapping);
    }

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
      msgs.push({
        role,
        text,
        id: msg.id || node.id,
      });
    }

    // If the walk somehow missed ends, merge in flat extras by id order
    if (msgs.length < 2) {
      const flat = linearizeFlat(mapping);
      if (flat.length > msgs.length) return flat;
    }
    return msgs;
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
    // Stable-ish: null times keep relative insertion order within mapping values
    msgs.sort((a, b) => {
      const ta = a.create_time;
      const tb = b.create_time;
      if (ta == null && tb == null) return 0;
      if (ta == null) return -1; // unknown times usually early system/user
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

  const toMarkdown = (title, messages) => {
    const lines = [`# ${title || "ChatGPT conversation"}`, ""];
    for (const m of messages) {
      const who = m.role === "user" ? "You" : "ChatGPT";
      lines.push(`## ${who}`, "", m.text, "", "---", "");
    }
    return lines.join("\n").trim() + "\n";
  };

  const download = (filename, text) => {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const safeName = (s) =>
    (s || "chatgpt")
      .replace(/[\/\\?%*:|"<>]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "chatgpt";

  try {
    const ref = idsFromUrl();
    if (!ref) {
      alert(
        "Open a conversation or share link first.\n\n" +
          "Expected:\nhttps://chatgpt.com/c/<id>\nor\nhttps://chatgpt.com/share/..."
      );
      return;
    }

    console.log("[chatgpt-export] Loading", ref);
    const token = await getAccessToken();
    const data = await loadConversation(ref, token);
    console.log("[chatgpt-export] current_node=", data.current_node, "nodes=", Object.keys(data.mapping || {}).length);

    const messages = linearize(data);
    if (!messages.length) {
      alert("API returned data, but no user/assistant messages were found.");
      console.log(data);
      return;
    }

    const title = data.title || "ChatGPT conversation";
    const md = toMarkdown(title, messages);
    const filename = `${safeName(title)}.md`;

    download(filename, md);
    try {
      await navigator.clipboard.writeText(md);
      console.log("[chatgpt-export] Copied to clipboard too");
    } catch (_e) {
      console.log("[chatgpt-export] Clipboard blocked; file download is enough");
    }

    const first = messages[0];
    const last = messages[messages.length - 1];
    alert(
      `Done.\n\n"${title}"\n${messages.length} messages\n` +
        `First: ${first.role} (${first.text.slice(0, 60).replace(/\n/g, " ")}…)\n` +
        `Last: ${last.role} (${last.text.slice(0, 60).replace(/\n/g, " ")}…)\n\n` +
        `Downloaded: ${filename}`
    );
  } catch (err) {
    console.error(err);
    alert(`Export failed: ${err && err.message ? err.message : err}`);
  }
})();
