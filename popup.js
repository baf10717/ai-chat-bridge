"use strict";

document.getElementById("send").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "正在整理…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/^https:\/\/(chatgpt\.com|claude\.ai)\//.test(tab.url || "")) {
      throw new Error("請先開啟 ChatGPT 或 Claude 對話");
    }
    await chrome.tabs.sendMessage(tab.id, { type: "SEND_TO_OTHER_PLATFORM" });
    window.close();
  } catch (error) {
    status.textContent = error.message;
  }
});
