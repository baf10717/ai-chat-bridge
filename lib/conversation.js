(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AIChatBridge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SHARE_PATTERNS = {
    chatgpt: /^https:\/\/chatgpt\.com\/share\/[a-zA-Z0-9-]+(?:[/?#].*)?$/,
    claude: /^https:\/\/claude\.ai\/share\/[a-zA-Z0-9-]+(?:[/?#].*)?$/
  };

  function platformFromUrl(url) {
    try {
      const host = new URL(url).hostname;
      if (host === "chatgpt.com") return "chatgpt";
      if (host === "claude.ai") return "claude";
    } catch (_) {}
    return null;
  }

  function findShareUrl(text) {
    const candidates = String(text || "").match(/https:\/\/(?:chatgpt\.com|claude\.ai)\/share\/[a-zA-Z0-9-]+[^\s<>)]*/g) || [];
    for (const candidate of candidates) {
      const cleaned = candidate.replace(/[.,;!?，。；！？、]+$/, "");
      if (SHARE_PATTERNS.chatgpt.test(cleaned) || SHARE_PATTERNS.claude.test(cleaned)) return cleaned;
    }
    return null;
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function roleLabel(role) {
    return role === "user" ? "User" : "Assistant";
  }

  function formatTranscript(messages, metadata) {
    const clean = (messages || [])
      .map((message) => ({ role: message.role, text: normalizeText(message.text) }))
      .filter((message) => (message.role === "user" || message.role === "assistant") && message.text);

    if (!clean.length) throw new Error("找不到可匯出的對話內容");

    const source = metadata && metadata.platform ? metadata.platform : "AI";
    const title = metadata && metadata.title ? normalizeText(metadata.title) : "Conversation";
    const body = clean.map((message) => `## ${roleLabel(message.role)}\n\n${message.text}`).join("\n\n---\n\n");

    return `# ${title}\n\n> Imported from ${source === "chatgpt" ? "ChatGPT" : source === "claude" ? "Claude" : source}\n\n${body}`;
  }

  function uniqueMessages(messages) {
    const seenElements = new Set();
    const result = [];
    for (const message of messages) {
      if (!message.element || seenElements.has(message.element)) continue;
      seenElements.add(message.element);
      const text = normalizeText(message.text);
      if (!text) continue;
      const previous = result[result.length - 1];
      if (previous && previous.role === message.role && previous.text === text) continue;
      result.push({ role: message.role, text });
    }
    return result;
  }

  function extractChatGPT(document) {
    const nodes = Array.from(document.querySelectorAll("[data-message-author-role]"));
    return uniqueMessages(nodes.map((element) => ({
      element,
      role: element.getAttribute("data-message-author-role"),
      text: element.innerText || element.textContent || ""
    })));
  }

  function extractClaude(document) {
    const selectors = [
      '[data-testid="user-message"]',
      '[data-testid="assistant-message"]',
      '[data-testid="assistant-message-content"]',
      '.font-claude-response-body'
    ];
    const nodes = Array.from(document.querySelectorAll(selectors.join(",")));
    nodes.sort((a, b) => {
      if (a === b) return 0;
      return a.compareDocumentPosition(b) & 2 ? 1 : -1;
    });

    const messages = nodes.map((element) => {
      const testId = element.getAttribute("data-testid") || "";
      const role = testId.includes("user") ? "user" : "assistant";
      return { element, role, text: element.innerText || element.textContent || "" };
    });
    return uniqueMessages(messages);
  }

  function extractConversation(document, url) {
    const platform = platformFromUrl(url);
    const messages = platform === "chatgpt" ? extractChatGPT(document) : extractClaude(document);
    return {
      platform,
      title: normalizeText(document.title).replace(/\s*[|–-]\s*(ChatGPT|Claude)\s*$/i, "") || "Conversation",
      messages
    };
  }

  return {
    SHARE_PATTERNS,
    platformFromUrl,
    findShareUrl,
    normalizeText,
    formatTranscript,
    extractConversation
  };
});
