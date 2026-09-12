"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Bridge = require("../lib/conversation.js");

test("detects supported platforms", () => {
  assert.equal(Bridge.platformFromUrl("https://chatgpt.com/share/abc"), "chatgpt");
  assert.equal(Bridge.platformFromUrl("https://claude.ai/chat/abc"), "claude");
  assert.equal(Bridge.platformFromUrl("https://example.com"), null);
});

test("finds a share URL inside pasted text", () => {
  assert.equal(
    Bridge.findShareUrl("看看 https://chatgpt.com/share/6aa52d4e-c410-83e8-8ddf-8f83941fc2c4。"),
    "https://chatgpt.com/share/6aa52d4e-c410-83e8-8ddf-8f83941fc2c4"
  );
});

test("formats a Markdown transcript", () => {
  const result = Bridge.formatTranscript([
    { role: "user", text: "第一題" },
    { role: "assistant", text: "第一答" }
  ], { platform: "chatgpt", title: "測試對話" });
  assert.match(result, /^# 測試對話/);
  assert.match(result, /## User\n\n第一題/);
  assert.match(result, /## Assistant\n\n第一答/);
});

test("rejects empty conversations", () => {
  assert.throws(() => Bridge.formatTranscript([], {}), /找不到/);
});
