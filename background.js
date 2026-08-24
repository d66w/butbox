const MENU_ID = "butbox-save-selection";
const PENDING_KEY = "butbox.pendingCapture";
const FOCUS_KEY = "butbox.focusSearch";

async function openOnActionClick() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error("사이드 패널 동작 설정 실패", error);
  }
}

function installMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "붙박스에 저장",
      contexts: ["selection"]
    });
  });
}

async function openPanel(tab) {
  try {
    if (tab && typeof tab.windowId === "number") {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      return true;
    }
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (active && typeof active.windowId === "number") {
      await chrome.sidePanel.open({ windowId: active.windowId });
      return true;
    }
  } catch (error) {
    console.warn("사이드 패널을 열지 못했습니다", error);
  }
  return false;
}

chrome.runtime.onInstalled.addListener(() => {
  openOnActionClick();
  installMenu();
});

chrome.runtime.onStartup.addListener(() => {
  openOnActionClick();
  installMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) {
    return;
  }
  const selection = String(info.selectionText ?? "").slice(0, 10240);
  if (selection.trim().length === 0) {
    return;
  }
  await chrome.storage.local.set({
    [PENDING_KEY]: {
      text: selection,
      title: tab?.title ?? "",
      url: info.pageUrl ?? tab?.url ?? "",
      capturedAt: Date.now()
    }
  });
  await openPanel(tab);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "quick-search") {
    return;
  }
  await chrome.storage.local.set({ [FOCUS_KEY]: Date.now() });
  await openPanel(null);
});
