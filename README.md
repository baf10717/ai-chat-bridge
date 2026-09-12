# AI Chat Bridge

在 ChatGPT 與 Claude 之間直接轉移完整對話的 Chrome Extension。

## 功能

- 在 Claude 貼上 ChatGPT 分享連結，自動讀取並替換成完整對話。
- 在 ChatGPT 貼上 Claude 分享連結，執行相同流程。
- 在目前對話按「傳到 Claude」或「傳到 ChatGPT」，直接開啟另一平台並匯入內容。
- 支援沒有分享連結的 Claude Incognito Chat。
- 對話只存放於瀏覽器的短期本機暫存，不經過第三方伺服器。

## 安裝

1. 下載 Release 中的 `ai-chat-bridge.zip` 並解壓縮。
2. 在 Chrome 開啟 `chrome://extensions`。
3. 開啟右上角「開發人員模式」。
4. 按「載入未封裝項目」，選擇解壓縮後的資料夾。

## 使用

### 貼上分享連結

直接把 ChatGPT 分享連結貼進 Claude，或把 Claude 分享連結貼進 ChatGPT。Extension 會在背景開啟分享頁、讀取對話、關閉背景分頁，並把連結替換成 Markdown 對話。

### 傳送目前對話

在 ChatGPT 或 Claude 頁面右下角按傳送按鈕。另一個平台開啟後，對話會放入輸入框；確認內容後再自行送出。

## 權限

- `storage`：在兩個平台之間暫存一次轉移內容。
- `tabs`：背景開啟分享頁並在讀取後關閉。
- 網站權限僅限 `chatgpt.com` 與 `claude.ai`。

## 已知限制

- ChatGPT 或 Claude 調整頁面結構後，擷取 selector 可能需要更新。
- 極長對話可能超過平台單次輸入長度。
- 分享連結仍需具備原平台允許的存取權限。

## 開發

```bash
npm test
npm run build
```

## License

MIT
