const CHATGPT_HOSTS = /https:\/\/(chatgpt\.com|chat\.openai\.com)\//;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;

  const url = tab.url || "";
  if (!CHATGPT_HOSTS.test(url)) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          alert("Open a ChatGPT conversation on chatgpt.com, then click the extension again.");
        },
      });
    } catch (_err) {
      // Tab may not allow scripting (chrome:// pages, etc.)
    }
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch (err) {
    console.error("ChatGPT Thread Export failed to inject:", err);
  }
});
