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

test("decodes ChatGPT flattened route data", () => {
  const result = Bridge.decodeFlatData([
    { _1: 2 },
    "loaderData",
    { _3: 4 },
    "title",
    "Demo"
  ]);
  assert.deepEqual(result, { loaderData: { title: "Demo" } });
});

test("creates one Markdown file for a normal conversation", () => {
  const files = Bridge.createMarkdownFiles("# Demo\n\n## User\n\nHello", {
    title: "Demo / Test",
    platform: "chatgpt"
  }, 10000);
  assert.equal(files.length, 1);
  assert.equal(files[0].name, "chatgpt-Demo-Test.md");
});

test("splits a long Markdown conversation on turn boundaries", () => {
  const turn = "## User\n\n" + "A".repeat(7000);
  const transcript = [turn, turn, turn].join("\n\n---\n\n");
  const files = Bridge.createMarkdownFiles(transcript, { title: "Long", platform: "claude" }, 10000);
  assert.equal(files.length, 3);
  assert.match(files[0].name, /part-01-of-03\.md$/);
  assert.match(files[2].content, /Part 3 of 3/);
});

test("extracts a Claude snapshot ID", () => {
  assert.equal(
    Bridge.claudeSnapshotIdFromUrl("https://claude.ai/share/f592fd2b-3abd-4157-ba1b-853f9926626d"),
    "f592fd2b-3abd-4157-ba1b-853f9926626d"
  );
  assert.equal(Bridge.claudeSnapshotIdFromUrl("https://claude.ai/chat/demo"), null);
});

test("extracts structured Claude snapshot messages", () => {
  const conversation = Bridge.extractClaudeSnapshot({
    snapshot_name: "Shared demo",
    chat_messages: [
      { sender: "human", text: "First question" },
      { sender: "assistant", content: [{ type: "text", text: "First answer" }] }
    ]
  });
  assert.equal(conversation.title, "Shared demo");
  assert.deepEqual(conversation.messages, [
    { role: "user", text: "First question" },
    { role: "assistant", text: "First answer" }
  ]);
});
