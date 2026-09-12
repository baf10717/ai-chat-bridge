"use strict";

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

function destinationTabScore(tab, destination) {
  try {
    const url = new URL(tab.url || "");
    const expectedHost = destination === "claude" ? "claude.ai" : "chatgpt.com";
    if (url.hostname !== expectedHost || url.pathname.includes("/share/")) return 0;
    if (destination === "claude") {
      if (url.pathname.includes("/chat/")) return 2;
      return url.pathname === "/" || url.pathname === "/new" ? 1 : 0;
    }
    if (url.pathname.includes("/c/")) return 2;
    return url.pathname === "/" ? 1 : 0;
  } catch (_) {
    return 0;
  }
}

async function findExistingConversation(destination) {
  const urlPattern = destination === "claude"
    ? "https://claude.ai/*"
    : "https://chatgpt.com/*";
  const tabs = await chrome.tabs.query({ url: urlPattern });
  return tabs
    .filter((tab) => tab.id && destinationTabScore(tab, destination) > 0)
    .sort((left, right) => {
      const conversationDifference = destinationTabScore(right, destination) - destinationTabScore(left, destination);
      if (conversationDifference) return conversationDifference;
      const activeDifference = Number(right.active) - Number(left.active);
      if (activeDifference) return activeDifference;
      return (right.lastAccessed || 0) - (left.lastAccessed || 0);
    })[0] || null;
}

function handoffUrl(url) {
  const target = new URL(url);
  target.searchParams.set("ai-chat-bridge", "1");
  return target.toString();
}

async function openHandoffDestination(destination) {
  const existing = await findExistingConversation(destination);
  if (existing) {
    const url = handoffUrl(existing.url);
    if (url === existing.url) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.tabs.reload(existing.id);
    } else {
      await chrome.tabs.update(existing.id, { active: true, url });
    }
    if (existing.windowId != null) {
      await chrome.windows.update(existing.windowId, { focused: true }).catch(() => {});
    }
    return { reused: true, tabId: existing.id };
  }

  const url = destination === "claude"
    ? "https://claude.ai/new?ai-chat-bridge=1"
    : "https://chatgpt.com/?ai-chat-bridge=1";
  const tab = await chrome.tabs.create({ url, active: true });
  return { reused: false, tabId: tab.id };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "RESOLVE_SHARE_LINK") {
    resolveShareLink(message.url)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === "OPEN_HANDOFF") {
    chrome.storage.local.set({ pendingHandoff: message.payload })
      .then(() => openHandoffDestination(message.destination))
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
