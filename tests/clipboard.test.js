import assert from "node:assert/strict";
import test from "node:test";

import { copyTextFrom, readClipboardText, readPastedText } from "../src/clipboard.js";

function stubClipboard({ writeFails = false, readText = "" } = {}) {
  const calls = { write: 0, writeText: [], readText: 0, itemTypes: [] };

  globalThis.ClipboardItem = class {
    constructor(payload) {
      calls.itemTypes.push(Object.keys(payload));
      this.payload = payload;
    }
  };

  const clipboard = {
    write: async (items) => {
      calls.write += 1;
      calls.lastItem = items[0];
      if (writeFails) {
        throw new Error("Document is not focused.");
      }
    },
    writeText: async (text) => {
      calls.writeText.push(text);
    },
    readText: async () => {
      calls.readText += 1;
      return readText;
    }
  };

  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard },
    configurable: true,
    writable: true
  });

  return calls;
}

test("copy uses ClipboardItem with a promise, never awaiting the loader first", async () => {
  const calls = stubClipboard();
  let loaderResolved = false;
  const slowLoader = () =>
    new Promise((resolve) =>
      setTimeout(() => {
        loaderResolved = true;
        resolve("국민은행 123456-01-789012");
      }, 30)
    );

  const promise = copyTextFrom(slowLoader);

  assert.equal(loaderResolved, false, "loader가 끝나기 전에 write가 시작돼야 사용자 제스처가 유지됩니다.");
  assert.equal(calls.write, 1);

  const text = await promise;
  assert.equal(text, "국민은행 123456-01-789012");
  assert.deepEqual(calls.itemTypes[0], ["text/plain"]);
  assert.equal(calls.writeText.length, 0);
});

test("copy falls back to writeText when the clipboard write is refused", async () => {
  const calls = stubClipboard({ writeFails: true });
  const text = await copyTextFrom(() => "반품 안내 문구");
  assert.equal(text, "반품 안내 문구");
  assert.equal(calls.write, 1);
  assert.deepEqual(calls.writeText, ["반품 안내 문구"]);
});

test("the loader runs once even when the fallback path is taken", async () => {
  stubClipboard({ writeFails: true });
  let loads = 0;
  await copyTextFrom(() => {
    loads += 1;
    return "값";
  });
  assert.equal(loads, 1);
});

test("copy without ClipboardItem support still writes text", async () => {
  const calls = stubClipboard();
  delete globalThis.ClipboardItem;
  const text = await copyTextFrom(() => "대체 경로");
  assert.equal(text, "대체 경로");
  assert.equal(calls.write, 0);
  assert.deepEqual(calls.writeText, ["대체 경로"]);
});

test("empty and nullish values copy as an empty string, not the word null", async () => {
  const calls = stubClipboard({ writeFails: true });
  await copyTextFrom(() => null);
  await copyTextFrom(() => undefined);
  assert.deepEqual(calls.writeText, ["", ""]);
});

test("clipboard text can be read for an empty box", async () => {
  const calls = stubClipboard({ readText: "클립보드 문구" });
  assert.equal(await readClipboardText(), "클립보드 문구");
  assert.equal(calls.readText, 1);
});

test("pasted plain text is recognised", () => {
  const event = { clipboardData: { getData: () => "붙여넣은 문구", items: [] } };
  assert.deepEqual(readPastedText(event), { kind: "text", text: "붙여넣은 문구" });
});

test("pasted images and files are classified so the UI can refuse them", () => {
  const image = {
    clipboardData: { getData: () => "", items: [{ kind: "file", type: "image/png" }] }
  };
  assert.deepEqual(readPastedText(image), { kind: "image" });

  const file = {
    clipboardData: { getData: () => "", items: [{ kind: "file", type: "application/pdf" }] }
  };
  assert.deepEqual(readPastedText(file), { kind: "file" });
});

test("paste with no clipboard data is handled without throwing", () => {
  assert.equal(readPastedText({}), null);
  assert.equal(readPastedText({ clipboardData: { getData: () => "", items: [] } }), null);
});
