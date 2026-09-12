# AI Chat Bridge

在 ChatGPT 與 Claude 之間直接轉移完整對話的 Chrome Extension。

## 功能

- 在 Claude 貼上 ChatGPT 分享連結，自動讀取並附加成 Markdown 檔。
- 在 ChatGPT 貼上 Claude 分享連結，執行相同流程。
- 從輸入框上方的按鈕或 Chrome 工具列開啟 Extension，將目前對話傳到另一平台。
- 優先附加到另一平台最近使用的既有對話；找不到既有對話時才開啟新對話。
- 長對話會按回合自動拆成多個 Markdown 檔。
- 只有在目標頁面確實顯示附件後，才會填入接續對話提示；上傳失敗時不會誤送空提示。
- 支援沒有分享連結的 Claude Incognito Chat。
- 對話只存放於瀏覽器的短期本機暫存，不經過第三方伺服器。

## 安裝

1. 在 GitHub 按 `Code` → `Download ZIP`，下載後解壓縮。
2. 在 Chrome 開啟 `chrome://extensions`。
3. 開啟右上角「開發人員模式」。
4. 按「載入未封裝項目」，選擇解壓縮後的資料夾。

## 使用

### 貼上分享連結

直接把 ChatGPT 分享連結貼進 Claude，或把 Claude 分享連結貼進 ChatGPT。Extension 會在背景讀取分享頁，並將完整對話轉成 Markdown 檔附加到目前訊息。

### 傳送目前對話

在 ChatGPT 或 Claude 頁面按輸入框右側上方的「傳到 Claude／ChatGPT」，也可以從 Chrome 工具列中的 Extension 圖示操作。Extension 會切換到另一平台最近使用的既有對話並附加 Markdown；沒有既有對話時才開啟新對話。確認附件與提示文字後再自行送出。

## 權限

- `storage`：在兩個平台之間暫存一次轉移內容。
- `tabs`：背景開啟分享頁並在讀取後關閉。
- 網站權限僅限 `chatgpt.com` 與 `claude.ai`。

## 已知限制

- ChatGPT 或 Claude 調整頁面結構後，擷取 selector 可能需要更新。
- 極長對話會拆成多個檔案，但仍受目標 AI 的上下文容量限制。
- 分享連結仍需具備原平台允許的存取權限。

## 開發

```bash
npm test
npm run build
```

## License

MIT
