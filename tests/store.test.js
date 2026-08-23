import assert from "node:assert/strict";
import test from "node:test";

class FakeLocalStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

globalThis.window = { localStorage: new FakeLocalStorage() };

const { readLocal, writeLocal, removeLocal } = await import("../src/store.js");

test("web storage falls back to localStorage when chrome is absent", async () => {
  assert.equal(await readLocal("butbox.missing"), null);
  await writeLocal("butbox.session", { accessToken: "abc", expiresAt: 1 });
  assert.deepEqual(await readLocal("butbox.session"), { accessToken: "abc", expiresAt: 1 });
  await removeLocal("butbox.session");
  assert.equal(await readLocal("butbox.session"), null);
});

test("stored values round-trip through JSON", async () => {
  await writeLocal("butbox.lastSpace", "11111111-1111-4111-8111-111111111111");
  assert.equal(await readLocal("butbox.lastSpace"), "11111111-1111-4111-8111-111111111111");
});
