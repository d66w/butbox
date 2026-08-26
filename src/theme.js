import { readLocal, writeLocal } from "./store.js";

const THEME_KEY = "butbox.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

let preference = "system";

function normalizeTheme(value) {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

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
  button.dataset.theme = theme;
  button.setAttribute("aria-label", nextLabel);
  button.setAttribute("title", nextLabel);
}

function applyTheme(value = preference) {
  const theme = resolveTheme(value);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themePreference = value;
  root.style.colorScheme = theme;
  renderToggle(document.querySelector("#btn-theme-toggle"));
}

export async function initializeTheme() {
  try {
    preference = normalizeTheme(await readLocal(THEME_KEY));
  } catch {
    preference = "system";
  }
  applyTheme();
}

export function wireThemeToggle(button) {
  renderToggle(button);
  button.addEventListener("click", async () => {
    preference = resolveTheme() === "dark" ? "light" : "dark";
    applyTheme();
    try {
      await writeLocal(THEME_KEY, preference);
    } catch {
      return;
    }
  });
}

media.addEventListener("change", () => {
  if (preference === "system") {
    applyTheme();
  }
});
