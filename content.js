"use strict";

const Bridge = globalThis.AIChatBridge;
const currentPlatform = Bridge.platformFromUrl(location.href);

function toast(message, kind) {
  let node = document.getElementById("ai-chat-bridge-toast");
  if (!node) {
    node = document.createElement("div");
    node.id = "ai-chat-bridge-toast";
    Object.assign(node.style, {
      position: "fixed",
      right: "20px",
      top: "20px",
      zIndex: "2147483647",
      maxWidth: "360px",
      padding: "10px 14px",
      borderRadius: "9px",
      color: "#fff",
      font: "14px/1.45 system-ui, sans-serif",
      boxShadow: "0 5px 20px rgba(0,0,0,.25)"
    });
    document.documentElement.appendChild(node);
  }
  node.style.background = kind === "error" ? "#b42318" : "#222";
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, kind === "error" ? 5000 : 2500);
}

function getEditableTarget(eventTarget) {
  if (!(eventTarget instanceof Element)) return null;
  return eventTarget.closest("textarea, input, [contenteditable='true'], [contenteditable='plaintext-only'], [role='textbox']");
}

function setNativeValue(element, value) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertText(element, text) {
  element.focus();
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const start = element.selectionStart == null ? element.value.length : element.selectionStart;
    const end = element.selectionEnd == null ? element.value.length : element.selectionEnd;
    const next = element.value.slice(0, start) + text + element.value.slice(end);
    setNativeValue(element, next);
    element.setSelectionRange(start + text.length, start + text.length);
    return;
  }

  const selection = window.getSelection();
  if (!selection.rangeCount || !element.contains(selection.anchorNode)) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  document.execCommand("insertText", false, text);
  element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
}

function createImportText(fileCount) {
  return fileCount > 1
    ? `請讀取附加的 ${fileCount} 個 Markdown 對話紀錄檔，依檔名順序作為後續對話的上下文。`
    : "請讀取附加的 Markdown 對話紀錄檔，作為後續對話的上下文。";
}

function findComposer() {
  const selectors = "textarea, [contenteditable='true'], [contenteditable='plaintext-only'], [role='textbox']";
  const candidates = Array.from(document.querySelectorAll(selectors));
  return candidates.find((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) || candidates[0] || null;
}

function buildMarkdownFiles(payload) {
  const metadata = payload.conversation || {
    title: payload.title || "Conversation",
    platform: payload.platform || Bridge.platformFromUrl(payload.sourceUrl) || "ai"
  };
  return Bridge.createMarkdownFiles(payload.transcript, metadata).map((descriptor) =>
    new File([descriptor.content], descriptor.name, { type: "text/markdown;charset=utf-8" })
  );
}

function createTransfer(files) {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  return transfer;
}

function fileInputAcceptsMarkdown(input) {
  const accept = (input.accept || "").toLowerCase();
  return !accept || accept.includes("*") || accept.includes("text") || accept.includes(".md") || accept.includes(".txt");
}

async function attachWithFileInput(files) {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]'))
    .filter((input) => !input.disabled && fileInputAcceptsMarkdown(input));
  if (!inputs.length) return false;

  const input = inputs.find((candidate) => candidate.multiple) || inputs[0];
  if (input.multiple || files.length === 1) {
    input.files = createTransfer(files).files;
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  }

  for (const file of files) {
    input.files = createTransfer([file]).files;
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return true;
}

async function attachWithDrop(files, composer) {
  if (!composer) return false;
  const transfer = createTransfer(files);
  const target = composer.closest("form") || composer;
  for (const type of ["dragenter", "dragover", "drop"]) {
    target.dispatchEvent(new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer: transfer
    }));
  }
  await new Promise((resolve) => setTimeout(resolve, 800));
  return true;
}

async function attachMarkdown(payload, preferredComposer) {
  const files = buildMarkdownFiles(payload);
  let attached = await attachWithFileInput(files);
  if (!attached) attached = await attachWithDrop(files, preferredComposer || findComposer());
  if (!attached) throw new Error("找不到可附加 Markdown 檔案的位置");
  return files;
}

async function extractCurrent() {
  const conversation = Bridge.extractConversation(document, location.href);
  return {
    conversation,
    transcript: Bridge.formatTranscript(conversation.messages, conversation)
  };
}

async function sendToOtherPlatform() {
  try {
    toast("正在整理對話…");
    const extracted = await extractCurrent();
    const destination = currentPlatform === "chatgpt" ? "claude" : "chatgpt";
    const response = await chrome.runtime.sendMessage({
      type: "OPEN_HANDOFF",
      destination,
      payload: {
        transcript: extracted.transcript,
        conversation: extracted.conversation,
        sourceUrl: location.href,
        createdAt: Date.now()
      }
    });
    if (!response || !response.ok) throw new Error(response && response.error || "無法開啟目標平台");
    toast("已送出");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function consumeHandoff() {
  if (!new URL(location.href).searchParams.has("ai-chat-bridge")) return;
  const { pendingHandoff } = await chrome.storage.local.get("pendingHandoff");
  if (!pendingHandoff || !pendingHandoff.transcript) return;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const editable = findComposer();
    if (editable) {
      const files = await attachMarkdown(pendingHandoff, editable);
      insertText(editable, createImportText(files.length));
      await chrome.storage.local.remove("pendingHandoff");
      toast(`已附加 ${files.length} 個 Markdown 檔，請確認後送出`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  toast("找不到訊息輸入框", "error");
}

document.addEventListener("paste", async (event) => {
  const editable = getEditableTarget(event.target);
  const pastedText = event.clipboardData && event.clipboardData.getData("text/plain");
  const shareUrl = Bridge.findShareUrl(pastedText);
  if (!editable || !shareUrl) return;

  const sourcePlatform = Bridge.platformFromUrl(shareUrl);
  if (!sourcePlatform || sourcePlatform === currentPlatform) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  toast("正在讀取分享對話…");
  try {
    const response = await chrome.runtime.sendMessage({ type: "RESOLVE_SHARE_LINK", url: shareUrl });
    if (!response || !response.ok) throw new Error(response && response.error || "無法讀取分享連結");
    const files = await attachMarkdown(response, editable);
    const replacement = pastedText.trim() === shareUrl
      ? createImportText(files.length)
      : pastedText.replace(shareUrl, createImportText(files.length));
    insertText(editable, replacement);
    toast(`已附加 ${files.length} 個 Markdown 檔`);
  } catch (error) {
    insertText(editable, pastedText);
    toast(`讀取失敗：${error.message}`, "error");
  }
}, true);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTRACT_CONVERSATION") {
    try {
      const result = extractCurrent();
      Promise.resolve(result).then((value) => sendResponse({ ok: true, ...value }));
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return true;
  }
  if (message.type === "SEND_TO_OTHER_PLATFORM") {
    sendToOtherPlatform();
    sendResponse({ ok: true });
  }
});

consumeHandoff();
