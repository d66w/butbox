const hasChromeStorage = typeof chrome !== "undefined" && !!chrome.storage && !!chrome.storage.local;

export async function readLocal(key) {
  if (hasChromeStorage) {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
  }
  const raw = window.localStorage.getItem(key);
  return raw === null ? null : JSON.parse(raw);
}

export async function writeLocal(key, value) {
  if (hasChromeStorage) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  window.localStorage.setItem(key, JSON.stringify(value));
}

export async function removeLocal(key) {
  if (hasChromeStorage) {
    await chrome.storage.local.remove(key);
    return;
  }
  window.localStorage.removeItem(key);
}
