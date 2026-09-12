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
    new File([descriptor.content], descriptor.name, { type: "text/markdown" })
  );
}

function createTransfer(files) {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  return transfer;
}

function fileInputAcceptsMarkdown(input) {
  const accept = (input.accept || "").toLowerCase();
  return !accept || accept.split(",").some((value) => {
    const type = value.trim();
    return type === "*" || type === "*/*" || type === "text/*" ||
      type === "application/*" || type === "text/plain" ||
      type === "text/markdown" || type === ".md" || type === ".txt";
  });
}

function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function attachmentButton() {
  const candidates = Array.from(document.querySelectorAll("button, [role='button']"));
  const labelPattern = /新增檔案|加入檔案|附加|附件|add files|add content|attach|upload/i;
  return candidates.find((element) => {
    if (element.id === "ai-chat-bridge-button" || !isVisible(element)) return false;
    const label = [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
      element.textContent
    ].filter(Boolean).join(" ");
    return labelPattern.test(label);
  }) || null;
}

function attachmentInputs() {
  return Array.from(document.querySelectorAll('input[type="file"]'))
    .filter((input) => !input.disabled && fileInputAcceptsMarkdown(input))
    .sort((left, right) => {
      const score = (input) => /upload|file|attach/i.test([
        input.id,
        input.name,
        input.getAttribute("data-testid"),
        input.getAttribute("aria-label")
      ].filter(Boolean).join(" ")) ? 1 : 0;
      return score(right) - score(left);
    });
}

async function revealAttachmentInputs() {
  let inputs = attachmentInputs();
  if (inputs.length) return inputs;

  const button = attachmentButton();
  if (button && button.getAttribute("aria-expanded") !== "true") {
    button.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  inputs = attachmentInputs();
  return inputs;
}

function attachmentSnapshot(files) {
  const bodyText = document.body && document.body.innerText || "";
  const matchedNames = files.filter((file) => bodyText.includes(file.name)).length;
  const markers = document.querySelectorAll([
    '[data-testid*="attachment" i]',
    '[data-testid*="file-thumbnail" i]',
    '[data-testid*="file-preview" i]',
    '[class*="attachment" i]',
    '[class*="file-chip" i]',
    'button[aria-label*="remove file" i]',
    'button[aria-label*="移除檔案" i]',
    'button[aria-label*="刪除檔案" i]'
  ].join(",")).length;
  return { matchedNames, markers };
}

async function waitForAttachments(files, baseline, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = attachmentSnapshot(files);
    if (current.matchedNames === files.length || current.markers >= baseline.markers + files.length) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function dispatchFilesToInput(input, files) {
  const baseline = attachmentSnapshot(files);
  input.files = createTransfer(files).files;
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  return waitForAttachments(files, baseline, 6000);
}

async function attachWithFileInput(files) {
  const inputs = await revealAttachmentInputs();
  if (!inputs.length) return false;

  for (const input of inputs) {
    try {
      if (input.multiple || files.length === 1) {
        if (await dispatchFilesToInput(input, files)) return true;
        continue;
      }

      let complete = true;
      for (const file of files) {
        if (!await dispatchFilesToInput(input, [file])) {
          complete = false;
          break;
        }
      }
      if (complete) return true;
    } catch (_) {}
  }
  return false;
}

async function attachWithDrop(files, composer) {
  if (!composer) return false;
  const baseline = attachmentSnapshot(files);
  const transfer = createTransfer(files);
  const target = composer.closest("form") || composer;
  const dispatchDragEvent = (eventTarget, type) => {
    eventTarget.dispatchEvent(new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer: transfer
    }));
  };

  try {
    for (const type of ["dragenter", "dragover", "drop"]) dispatchDragEvent(target, type);
    return await waitForAttachments(files, baseline, 3000);
  } finally {
    for (const eventTarget of [target, document.body, document.documentElement]) {
      if (!eventTarget) continue;
      dispatchDragEvent(eventTarget, "dragleave");
      dispatchDragEvent(eventTarget, "dragend");
    }
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true
    }));
  }
}

async function attachWithPaste(files, composer) {
  if (!composer) return false;
  const baseline = attachmentSnapshot(files);
  const transfer = createTransfer(files);
  composer.dispatchEvent(new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    composed: true,
    clipboardData: transfer
  }));
  return waitForAttachments(files, baseline, 3000);
}

async function attachMarkdown(payload, preferredComposer) {
  const files = buildMarkdownFiles(payload);
  let attached = await attachWithFileInput(files);
  if (!attached) attached = await attachWithDrop(files, preferredComposer || findComposer());
  if (!attached) attached = await attachWithPaste(files, preferredComposer || findComposer());
  if (!attached) throw new Error("Markdown 附件沒有成功加入；對話內容仍已保留，請重新整理後再試");
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
    const message = /找不到可匯出的對話內容/.test(error.message)
      ? "目前沒有對話內容可傳送"
      : error.message;
    toast(message, "error");
  }
}

function addBridgeButton() {
  if (location.pathname.includes("/share/") || document.getElementById("ai-chat-bridge-button")) return;
  const button = document.createElement("button");
  button.id = "ai-chat-bridge-button";
  button.type = "button";
  button.textContent = currentPlatform === "chatgpt" ? "傳到 Claude" : "傳到 ChatGPT";
  button.title = "將目前完整對話轉成 Markdown 並傳到另一平台";
  Object.assign(button.style, {
    position: "fixed",
    right: "18px",
    bottom: "96px",
    zIndex: "2147483646",
    border: "1px solid rgba(127,127,127,.35)",
    borderRadius: "9px",
    padding: "9px 13px",
    background: "#fff",
    color: "#222",
    font: "600 13px system-ui, sans-serif",
    cursor: "pointer",
    boxShadow: "0 3px 12px rgba(0,0,0,.16)"
  });
  button.addEventListener("mouseenter", () => { button.style.opacity = "1"; });
  button.addEventListener("mouseleave", () => { button.style.opacity = ".86"; });
  button.style.opacity = ".86";
  button.addEventListener("click", sendToOtherPlatform);
  document.documentElement.appendChild(button);
}

async function consumeHandoff() {
  if (!new URL(location.href).searchParams.has("ai-chat-bridge")) return;
  const { pendingHandoff } = await chrome.storage.local.get("pendingHandoff");
  if (!pendingHandoff || !pendingHandoff.transcript) return;

  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const editable = findComposer();
      if (editable) {
        const files = await attachMarkdown(pendingHandoff, editable);
        insertText(editable, createImportText(files.length));
        await chrome.storage.local.remove("pendingHandoff");
        const currentUrl = new URL(location.href);
        currentUrl.searchParams.delete("ai-chat-bridge");
        history.replaceState(history.state, "", currentUrl);
        toast(`已確認附加 ${files.length} 個 Markdown 檔，請確認後送出`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    toast("找不到訊息輸入框", "error");
  } catch (error) {
    toast(error.message, "error");
  }
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
    toast(`已確認附加 ${files.length} 個 Markdown 檔`);
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

addBridgeButton();
consumeHandoff();
