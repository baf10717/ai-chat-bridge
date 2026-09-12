"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist", "ai-chat-bridge.zip");
const files = ["manifest.json", "background.js", "content.js", "popup.html", "popup.js", "lib"];

fs.mkdirSync(path.dirname(output), { recursive: true });
if (fs.existsSync(output)) fs.rmSync(output);
execFileSync("zip", ["-r", output, ...files], { cwd: root, stdio: "inherit" });
console.log(`Built ${output}`);
