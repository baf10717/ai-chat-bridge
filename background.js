"use strict";

const pendingResolvers = new Map();

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("分享頁載入逾時"));
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function requestExtraction(tabId) {
  let lastError = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_CONVERSATION" });
      if (response && response.ok && response.transcript) return response;
      lastError = new Error((response && response.error) || "頁面尚未出現對話內容");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError || new Error("無法讀取分享頁");
}

async function resolveShareLink(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabComplete(tab.id, 15000);
    return await requestExtraction(tab.id);
  } finally {
    if (tab.id) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RESOLVE_SHARE_LINK") {
    resolveShareLink(message.url)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "OPEN_HANDOFF") {
    chrome.storage.local.set({ pendingHandoff: message.payload }).then(() => {
      const url = message.destination === "claude"
        ? "https://claude.ai/new?ai-chat-bridge=1"
        : "https://chatgpt.com/?ai-chat-bridge=1";
      return chrome.tabs.create({ url, active: true });
    }).then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
