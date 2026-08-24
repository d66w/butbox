const HOST_PERMISSION = { origins: ["http://*/*", "https://*/*"] };

const BLOCKED_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "devtools://",
  "view-source:",
  "https://chromewebstore.google.com",
  "https://chrome.google.com/webstore"
];

export function isSupported() {
  return (
    typeof chrome !== "undefined" &&
    Boolean(chrome.scripting) &&
    Boolean(chrome.tabs) &&
    Boolean(chrome.permissions)
  );
}

export function isInsertableUrl(url) {
  const value = String(url ?? "");
  if (value.length === 0) {
    return false;
  }
  return !BLOCKED_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function hasPermission() {
  if (!isSupported()) {
    return Promise.resolve(false);
  }
  return chrome.permissions.contains(HOST_PERMISSION).catch(() => false);
}

export function requestPermission() {
  if (!isSupported()) {
    return Promise.resolve(false);
  }
  return chrome.permissions.request(HOST_PERMISSION).catch(() => false);
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] ?? null;
}

function injected(text) {
  const target = document.activeElement;
  const isEditable =
    target &&
    ((target.tagName === "INPUT" &&
      !["password", "hidden", "file", "checkbox", "radio", "submit", "button", "image", "range", "color"].includes(
        (target.type || "text").toLowerCase()
      )) ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable);

  if (!isEditable) {
    return { ok: false, reason: "NO_FIELD" };
  }
  if (target.readOnly || target.disabled) {
    return { ok: false, reason: "READ_ONLY" };
  }
  if (target.tagName === "INPUT" && (target.type || "").toLowerCase() === "password") {
    return { ok: false, reason: "PASSWORD" };
  }
  if (target.closest && target.closest("[data-butbox-block]")) {
    return { ok: false, reason: "BLOCKED" };
  }

  target.focus();
  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, text);
  } catch {
    inserted = false;
  }

  if (!inserted) {
    if (target.isContentEditable) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.setEndAfter(node);
        selection.removeAllRanges();
        selection.addRange(range);
        inserted = true;
      }
    } else {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? target.value.length;
      target.value = target.value.slice(0, start) + text + target.value.slice(end);
      const caret = start + text.length;
      target.setSelectionRange(caret, caret);
      inserted = true;
    }
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return { ok: inserted, reason: inserted ? "OK" : "FAILED" };
}

export async function insertIntoActiveTab(text) {
  if (!isSupported()) {
    return { ok: false, reason: "UNSUPPORTED" };
  }
  const tab = await activeTab();
  if (!tab || typeof tab.id !== "number") {
    return { ok: false, reason: "NO_TAB" };
  }
  if (!isInsertableUrl(tab.url)) {
    return { ok: false, reason: "BLOCKED_PAGE" };
  }
  if (!(await hasPermission())) {
    return { ok: false, reason: "NO_PERMISSION" };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injected,
      args: [String(text ?? "")]
    });
    const result = results?.[0]?.result;
    if (result && result.ok) {
      return { ok: true, reason: "OK" };
    }
    return { ok: false, reason: result?.reason ?? "FAILED" };
  } catch (error) {
    return { ok: false, reason: "SCRIPT_ERROR", detail: String(error?.message ?? error) };
  }
}

export const INSERT_MESSAGES = {
  UNSUPPORTED: "이 화면에서는 삽입을 쓸 수 없습니다. 대신 복사했습니다.",
  NO_TAB: "삽입할 탭을 찾지 못했습니다. 대신 복사했습니다.",
  BLOCKED_PAGE: "이 페이지에는 삽입할 수 없습니다. 대신 복사했습니다.",
  NO_PERMISSION: "삽입 권한이 없어 복사했습니다.",
  NO_FIELD: "커서를 입력창에 둔 뒤 다시 눌러 주세요. 일단 복사했습니다.",
  READ_ONLY: "읽기 전용 입력창입니다. 대신 복사했습니다.",
  PASSWORD: "비밀번호 입력창에는 삽입하지 않습니다. 대신 복사했습니다.",
  BLOCKED: "이 입력창은 삽입을 막아두었습니다. 대신 복사했습니다.",
  SCRIPT_ERROR: "이 페이지에 접근하지 못했습니다. 대신 복사했습니다.",
  FAILED: "삽입하지 못해 대신 복사했습니다."
};
