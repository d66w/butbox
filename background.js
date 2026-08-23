async function openOnActionClick() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error("사이드 패널 동작 설정 실패", error);
  }
}

chrome.runtime.onInstalled.addListener(openOnActionClick);
chrome.runtime.onStartup.addListener(openOnActionClick);
