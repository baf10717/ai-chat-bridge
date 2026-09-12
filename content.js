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
      bottom: "72px",
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
  return eventTarget.closest("textarea, input, [contenteditable='true']");
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

function createImportText(transcript) {
  return `以下是從另一個 AI 匯入的完整對話，請先讀取並以此作為後續對話的上下文。\n\n${transcript}\n\n請確認已讀取，接著等待我的問題。`;
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

function addBridgeButton() {
  if (location.pathname.includes("/share/") || document.getElementById("ai-chat-bridge-button")) return;
  const button = document.createElement("button");
  button.id = "ai-chat-bridge-button";
  button.type = "button";
  button.textContent = currentPlatform === "chatgpt" ? "傳到 Claude" : "傳到 ChatGPT";
  button.title = "擷取目前完整對話並在另一平台開啟";
  Object.assign(button.style, {
    position: "fixed",
    right: "18px",
    bottom: "18px",
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
  button.addEventListener("click", sendToOtherPlatform);
  document.documentElement.appendChild(button);
}

async function consumeHandoff() {
  if (!new URL(location.href).searchParams.has("ai-chat-bridge")) return;
  const { pendingHandoff } = await chrome.storage.local.get("pendingHandoff");
  if (!pendingHandoff || !pendingHandoff.transcript) return;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const editable = document.querySelector("textarea, [contenteditable='true']");
    if (editable) {
      insertText(editable, createImportText(pendingHandoff.transcript));
      await chrome.storage.local.remove("pendingHandoff");
      toast("對話已匯入，請確認後送出");
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
    const replacement = pastedText.replace(shareUrl, createImportText(response.transcript));
    insertText(editable, replacement);
    toast("對話已匯入");
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
