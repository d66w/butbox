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

const storage = new FakeLocalStorage();
const mediaListeners = new Set();
const media = {
  matches: false,
  addEventListener: (_event, listener) => mediaListeners.add(listener)
};

function setSystemDark(value) {
  media.matches = value;
  for (const listener of mediaListeners) {
    listener({ matches: value });
  }
}

const toggle = {
  dataset: {},
  attributes: {},
  handlers: {},
  setAttribute(name, value) {
    this.attributes[name] = value;
  },
  addEventListener(event, handler) {
    this.handlers[event] = handler;
  },
  click() {
    this.handlers.click?.();
  }
};

const root = { dataset: {}, style: {} };

globalThis.window = {
  localStorage: storage,
  matchMedia: () => media
};
globalThis.document = {
  documentElement: root,
  querySelector: (selector) => (selector === "#btn-theme-toggle" ? toggle : null)
};

storage.setItem("butbox.theme", JSON.stringify("dark"));

const theme = await import("../src/theme.js");

test("a stored preference is applied before anything awaits, so there is no flash", () => {
  assert.equal(root.dataset.theme, "dark");
  assert.equal(root.dataset.themePreference, "dark");
  assert.equal(root.style.colorScheme, "dark");
  assert.equal(theme.themePreference(), "dark");
});

test("initializeTheme reconciles with the shared store without changing a matching value", async () => {
  await theme.initializeTheme();
  assert.equal(theme.themePreference(), "dark");
  assert.equal(storage.getItem("butbox.theme"), JSON.stringify("dark"));
});

test("an explicit choice is persisted to both the store and the sync mirror", async () => {
  await theme.setThemePreference("light");
  assert.equal(theme.themePreference(), "light");
  assert.equal(root.dataset.theme, "light");
  assert.equal(storage.getItem("butbox.theme"), JSON.stringify("light"));
});

test("an explicit choice outranks the system setting", async () => {
  await theme.setThemePreference("light");
  setSystemDark(true);
  assert.equal(root.dataset.theme, "light", "사용자가 고른 라이트를 시스템 다크가 덮어써서는 안 됩니다.");
  setSystemDark(false);
  assert.equal(root.dataset.theme, "light");
});

test("system mode follows the operating system in both directions", async () => {
  await theme.setThemePreference("system");
  setSystemDark(true);
  assert.equal(root.dataset.theme, "dark");
  assert.equal(root.dataset.themePreference, "system");
  setSystemDark(false);
  assert.equal(root.dataset.theme, "light");
  assert.equal(root.dataset.themePreference, "system");
});

test("the user can always get back to system mode", async () => {
  await theme.setThemePreference("dark");
  assert.equal(theme.themePreference(), "dark");
  await theme.setThemePreference("system");
  assert.equal(theme.themePreference(), "system");
});

test("an unknown stored value falls back to system rather than breaking", async () => {
  await theme.setThemePreference("chartreuse");
  assert.equal(theme.themePreference(), "system");
  await theme.setThemePreference(null);
  assert.equal(theme.themePreference(), "system");
});

test("clicking the toggle flips the theme and stores the new choice", async () => {
  theme.wireThemeToggle(toggle);
  await theme.setThemePreference("light");

  toggle.click();
  await Promise.resolve();
  assert.equal(root.dataset.theme, "dark");
  assert.equal(theme.themePreference(), "dark");

  toggle.click();
  await Promise.resolve();
  assert.equal(root.dataset.theme, "light");
  assert.equal(theme.themePreference(), "light");
});

test("the quick toggle resolves system mode to a concrete opposite", async () => {
  await theme.setThemePreference("system");
  setSystemDark(true);
  toggle.click();
  await Promise.resolve();
  assert.equal(theme.themePreference(), "light", "시스템이 다크였으니 라이트로 넘어가야 합니다.");
  setSystemDark(false);
});

test("the toggle announces the action it will take, not the current state", async () => {
  await theme.setThemePreference("light");
  theme.wireThemeToggle(toggle);
  assert.match(toggle.attributes["aria-label"], /다크 모드로 전환/);
  assert.equal(toggle.attributes["aria-pressed"], "false");

  await theme.setThemePreference("dark");
  assert.match(toggle.attributes["aria-label"], /라이트 모드로 전환/);
  assert.equal(toggle.attributes["aria-pressed"], "true");
});

test("the toggle says when the theme is currently coming from the system", async () => {
  await theme.setThemePreference("system");
  assert.match(toggle.attributes["aria-label"], /시스템 설정을 따릅니다/);
});

test("labels exist for every option the settings sheet offers", () => {
  for (const option of theme.THEME_OPTIONS) {
    assert.equal(typeof theme.themeLabel(option), "string");
    assert.ok(theme.themeLabel(option).length > 0, `${option} 라벨이 비어 있습니다.`);
  }
  assert.deepEqual([...theme.THEME_OPTIONS].sort(), ["dark", "light", "system"]);
});
