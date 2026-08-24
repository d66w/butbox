import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

function extensionIdFromKey(key) {
  const der = Buffer.from(String(key), "base64");
  const hash = createHash("sha256").update(der).digest("hex").slice(0, 32);
  return [...hash].map((c) => String.fromCharCode(parseInt(c, 16) + 97)).join("");
}

test("manifest pins a key so every developer gets the same extension id", () => {
  assert.ok(manifest.key, "manifest.key가 없으면 개발자마다 확장 ID가 달라집니다.");
  const id = extensionIdFromKey(manifest.key);
  assert.match(id, /^[a-p]{32}$/);
});

test("the pinned key derives one stable id, not a random one", () => {
  const first = extensionIdFromKey(manifest.key);
  const second = extensionIdFromKey(manifest.key);
  assert.equal(first, second);
});

test("the extension never hardcodes an extension id in source", () => {
  for (const path of ["src/auth.js", "src/app.js", "background.js", "config.js", "config.example.js"]) {
    const source = readFileSync(new URL(path, `file://${root.replace(/\\/g, "/")}`), "utf8");
    assert.equal(
      /[a-p]{32}/.test(source),
      false,
      `${path}에 확장 ID로 보이는 문자열이 있습니다. 런타임에서 도출해야 합니다.`
    );
  }
});

test("auth redirect is derived at runtime, not from config", () => {
  const source = readFileSync(new URL("src/auth.js", `file://${root.replace(/\\/g, "/")}`), "utf8");
  assert.ok(source.includes("chrome.identity.getRedirectURL"));
});
