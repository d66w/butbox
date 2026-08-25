import test from "node:test";
import assert from "node:assert/strict";
import { isInsertableUrl, permissionForUrl } from "../src/features/insert.js";

test("permissionForUrl requests only the active origin", () => {
  assert.deepEqual(permissionForUrl("https://example.com/orders/1"), {
    origins: ["https://example.com/*"]
  });
  assert.deepEqual(permissionForUrl("http://localhost:3000/form"), {
    origins: ["http://localhost:3000/*"]
  });
});

test("permissionForUrl rejects non-web protocols", () => {
  assert.equal(permissionForUrl("chrome://settings"), null);
  assert.equal(permissionForUrl("file:///tmp/form.html"), null);
  assert.equal(permissionForUrl("not a url"), null);
});

test("isInsertableUrl blocks browser and store pages", () => {
  assert.equal(isInsertableUrl("https://example.com/form"), true);
  assert.equal(isInsertableUrl("chrome://extensions"), false);
  assert.equal(isInsertableUrl("https://chromewebstore.google.com/detail/example"), false);
});
