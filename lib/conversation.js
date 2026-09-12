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

  function decodeFlatData(values) {
    if (!Array.isArray(values)) return null;
    const cache = new Map();

    function resolveReference(value) {
      if (Number.isInteger(value) && value >= 0 && value < values.length) return decodeIndex(value);
      if (Number.isInteger(value) && value < 0) return null;
      return value;
    }

    function decodeIndex(index) {
      if (cache.has(index)) return cache.get(index);
      const value = values[index];

      if (Array.isArray(value)) {
        const output = [];
        cache.set(index, output);
        for (const item of value) output.push(resolveReference(item));
        return output;
      }

      if (value && typeof value === "object") {
        const output = {};
        cache.set(index, output);
        for (const [encodedKey, encodedValue] of Object.entries(value)) {
          const keyIndex = Number(encodedKey.slice(1));
          const key = values[keyIndex];
          if (typeof key === "string") output[key] = resolveReference(encodedValue);
        }
        return output;
      }

      return value;
    }

    return decodeIndex(0);
  }

  function findConversationData(value, visited) {
    if (!value || typeof value !== "object") return null;
    if (visited.has(value)) return null;
    visited.add(value);
    if (Array.isArray(value.linear_conversation)) return value;

    for (const child of Object.values(value)) {
      const found = findConversationData(child, visited);
      if (found) return found;
    }
    return null;
  }

  function contentToText(content) {
    if (!content) return "";
    if (typeof content === "string") return content;
    const parts = Array.isArray(content.parts) ? content.parts : [];
    return parts.map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part.text === "string") return part.text;
      if (part && typeof part.content === "string") return part.content;
      return "";
    }).filter(Boolean).join("\n\n");
  }

  function extractEmbeddedChatGPT(document) {
    const scripts = Array.from(document.scripts || []);
    for (const script of scripts) {
      const source = script.textContent || "";
      if (!source.includes("streamController.enqueue") || !source.includes("linear_conversation")) continue;
      const matches = source.matchAll(/streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/g);
      for (const match of matches) {
        try {
          const payload = JSON.parse(match[1]);
          if (!payload.startsWith("[")) continue;
          const decoded = decodeFlatData(JSON.parse(payload));
          const data = findConversationData(decoded, new Set());
          if (!data) continue;

          const messages = data.linear_conversation.map((node) => node && node.message).filter(Boolean)
            .filter((message) => {
              const role = message.author && message.author.role;
              return (role === "user" || role === "assistant") &&
                !(message.metadata && message.metadata.is_visually_hidden_from_conversation);
            })
            .map((message) => ({
              role: message.author.role,
              text: contentToText(message.content)
            }));

          if (messages.some((message) => normalizeText(message.text))) {
            return { title: normalizeText(data.title), messages };
          }
        } catch (_) {}
      }
    }
    return null;
  }

  function extractChatGPT(document) {
    const embedded = extractEmbeddedChatGPT(document);
    if (embedded) return embedded.messages;

    const nodes = Array.from(document.querySelectorAll("[data-message-author-role], [data-turn]"));
    return uniqueMessages(nodes.map((element) => ({
      element,
      role: element.getAttribute("data-message-author-role") || element.getAttribute("data-turn"),
      text: element.innerText || element.textContent || ""
    })));
  }

  function extractClaude(document) {
    const selectors = [
      '[data-testid*="user-message"]',
      '[data-testid*="assistant-message"]',
      '.font-user-message',
      '.font-claude-response',
      '.font-claude-response-body'
    ];
    const nodes = Array.from(document.querySelectorAll(selectors.join(",")));
    nodes.sort((a, b) => {
      if (a === b) return 0;
      return a.compareDocumentPosition(b) & 2 ? 1 : -1;
    });

    const messages = nodes.map((element) => {
      const testId = element.getAttribute("data-testid") || "";
      const role = testId.includes("user") || element.classList.contains("font-user-message") ? "user" : "assistant";
      return { element, role, text: element.innerText || element.textContent || "" };
    });
    return uniqueMessages(messages);
  }

  function extractConversation(document, url) {
    const platform = platformFromUrl(url);
    const embedded = platform === "chatgpt" ? extractEmbeddedChatGPT(document) : null;
    const messages = embedded ? embedded.messages : platform === "chatgpt" ? extractChatGPT(document) : extractClaude(document);
    return {
      platform,
      title: embedded && embedded.title || normalizeText(document.title).replace(/\s*[|–-]\s*(ChatGPT|Claude)\s*$/i, "") || "Conversation",
      messages
    };
  }

  return {
    SHARE_PATTERNS,
    platformFromUrl,
    findShareUrl,
    normalizeText,
    formatTranscript,
    decodeFlatData,
    extractEmbeddedChatGPT,
    extractConversation
  };
});
