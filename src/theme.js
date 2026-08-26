import { readLocal, writeLocal } from "./store.js";

const THEME_KEY = "butbox.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

export const THEME_OPTIONS = ["system", "light", "dark"];

const LABELS = {
  system: "시스템 설정 따르기",
  light: "라이트",
  dark: "다크"
};

function normalizeTheme(value) {
  return THEME_OPTIONS.includes(value) ? value : "system";
}

function readMirror() {
  try {
    return normalizeTheme(JSON.parse(window.localStorage.getItem(THEME_KEY)));
  } catch {
    return "system";
  }
}

function writeMirror(value) {
  try {
    window.localStorage.setItem(THEME_KEY, JSON.stringify(value));
  } catch {
    return;
  }
}

let preference = readMirror();

function resolveTheme(value = preference) {
  if (value === "system") {
    return media.matches ? "dark" : "light";
  }
  return value;
}

function renderToggle(button) {
  if (!button) {
    return;
  }
  const theme = resolveTheme();
  const nextLabel = theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환";
  const suffix = preference === "system" ? " (지금은 시스템 설정을 따릅니다)" : "";
  button.dataset.theme = theme;
  button.dataset.preference = preference;
  button.setAttribute("aria-label", nextLabel + suffix);
  button.setAttribute("title", nextLabel + suffix);
  button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}

function applyTheme(value = preference) {
  const theme = resolveTheme(value);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themePreference = value;
  root.style.colorScheme = theme;
  renderToggle(document.querySelector("#btn-theme-toggle"));
}

applyTheme();

export function themePreference() {
  return preference;
}

export function themeLabel(value = preference) {
  return LABELS[normalizeTheme(value)];
}

export async function setThemePreference(value) {
  preference = normalizeTheme(value);
  applyTheme();
  writeMirror(preference);
  try {
    await writeLocal(THEME_KEY, preference);
  } catch {
    return;
  }
}

export async function initializeTheme() {
  let stored = preference;
  try {
    stored = normalizeTheme(await readLocal(THEME_KEY));
  } catch {
    stored = preference;
  }
  if (stored !== preference) {
    preference = stored;
    applyTheme();
  }
  writeMirror(preference);
}

export function wireThemeToggle(button) {
  renderToggle(button);
  button.addEventListener("click", () => {
    setThemePreference(resolveTheme() === "dark" ? "light" : "dark");
  });
}

media.addEventListener("change", () => {
  if (preference === "system") {
    applyTheme();
  }
});
