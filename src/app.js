import * as api from "./api.js";
import { CONFIG } from "../config.js";
import {
  clearSession,
  isConfigured,
  loadSession,
  redirectUrl,
  signIn,
  signOut
} from "./auth.js";
import { copyTextFrom, readClipboardText, readPastedText } from "./clipboard.js";
import { AUTOSAVE_DELAY_MS, STORAGE_KEYS, TEXT_MAX_BYTES, UPGRADE_LEVERS } from "./constants.js";
import { errorMessage, isAuthError } from "./errors.js";
import {
  byteLength,
  formatBytes,
  formatRelativeTime,
  generatePassword,
  normalizeSpaceCode,
  previewText,
  usageRatio,
  validateBoxName,
  validateBoxText,
  validatePassword,
  validateSpaceCodeInput,
  validateSpaceName
} from "./format.js";
import { BoxRealtime, REALTIME_STATUS } from "./realtime.js";
import { readLocal, removeLocal, writeLocal } from "./store.js";
import { initializeTheme, wireThemeToggle } from "./theme.js";
import { clear, el, openChoice, openConfirm, openForm, openSheet, qs, showToast } from "./ui.js";
import { collectTags, searchBoxes } from "./features/search.js";
import { fillTemplate, hasVariables, promptableVariables } from "./features/templates.js";
import { SORT_MODES, sortBoxes } from "./features/sorting.js";
import { track } from "./features/analytics.js";

const SURFACE = typeof chrome !== "undefined" && chrome.sidePanel ? "extension" : "web";
const PENDING_CAPTURE_KEY = "butbox.pendingCapture";
const FOCUS_SEARCH_KEY = "butbox.focusSearch";
const PENDING_INVITE_KEY = "butbox.pendingInvite";
const SEARCH_DEBOUNCE_MS = 120;
const NEW_BOX_NAME = "새 박스";

const state = {
  view: "loading",
  session: null,
  profile: null,
  plan: null,
  spaces: [],
  spaceId: null,
  boxes: [],
  members: [],
  plans: [],
  subscription: null,
  search: "",
  tagFilter: null,
  sortMode: SORT_MODES.manual,
  visibleIds: [],
  activeIndex: -1,
  liveStatus: REALTIME_STATUS.idle
};

const boxViews = new Map();
const inFlightSaves = new Set();

const realtime = new BoxRealtime({
  onChange: handleRealtimeChange,
  onStatus: (status) => {
    state.liveStatus = status;
    renderLiveDot();
  }
});

function currentSpace() {
  return state.spaces.find((space) => space.id === state.spaceId) ?? null;
}

function setView(view) {
  state.view = view;
  for (const section of document.querySelectorAll(".view")) {
    section.hidden = section.dataset.view !== view;
  }
}

function reportError(error) {
  if (isAuthError(error)) {
    clearSession().then(() => {
      state.session = null;
      setView("signin");
    });
  }
  showToast(errorMessage(error), "error");
}

async function boot() {
  await initializeTheme();
  const authRedirectUrl = redirectUrl();
  for (const selector of ["#redirect-url", "#signin-redirect-url"]) {
    const node = qs(selector);
    if (node) {
      node.textContent = authRedirectUrl;
    }
  }
  wireStaticHandlers();

  if (!isConfigured()) {
    setView("setup");
    return;
  }

  const session = await loadSession();
  if (!session) {
    setView("signin");
    return;
  }
  state.session = session;
  await consumePendingInvite();
  await loadWorkspace();
  await consumePendingCapture();
  await consumeFocusRequest();
  await consumeWaitlist();
}

async function consumeWaitlist() {
  if (SURFACE !== "web" || state.view !== "main") {
    return;
  }
  const plan = window.sessionStorage.getItem("butbox.waitlist");
  if (!plan) {
    return;
  }
  window.sessionStorage.removeItem("butbox.waitlist");
  await offerUpgrade(UPGRADE_LEVERS.boxLimit, {
    title: "Pro 대기 명단",
    message: "결제가 열리면 가장 먼저 알려 드립니다."
  });
}

async function consumePendingInvite() {
  const token = await readLocal(PENDING_INVITE_KEY);
  if (!token) {
    return;
  }
  await removeLocal(PENDING_INVITE_KEY);
  try {
    const spaceId = await api.redeemInvite(token);
    await writeLocal(STORAGE_KEYS.lastSpaceId, spaceId);
    track("space_joined", { surface: "invite_link" });
  } catch (error) {
    showToast(errorMessage(error), "error");
  }
}

async function consumeFocusRequest() {
  const stamp = await readLocal(FOCUS_SEARCH_KEY);
  if (!stamp) {
    return;
  }
  await removeLocal(FOCUS_SEARCH_KEY);
  if (state.view === "main") {
    focusSearch();
  }
}

async function consumePendingCapture() {
  const pending = await readLocal(PENDING_CAPTURE_KEY);
  if (!pending || !pending.text) {
    return;
  }
  await removeLocal(PENDING_CAPTURE_KEY);
  if (state.view !== "main" || !state.spaceId) {
    return;
  }
  await saveCapturedText(pending);
}

function wireStaticHandlers() {
  for (const selector of ["#btn-copy-redirect", "#btn-copy-signin-redirect"]) {
    const button = qs(selector);
    if (!button) {
      continue;
    }
    button.addEventListener("click", () => {
      copyTextFrom(() => redirectUrl())
        .then(() => showToast("로그인 콜백 주소를 복사했습니다.", "success"))
        .catch((error) => reportError(error));
    });
  }

  qs("#btn-signin").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "로그인 중…";
    try {
      const session = await signIn();
      if (session) {
        state.session = session;
        await loadWorkspace();
      }
    } catch (error) {
      const help = qs("#auth-help");
      if (error?.code === "AUTH_REDIRECT_MISCONFIGURED" && help) {
        help.hidden = false;
        help.open = true;
      }
      showToast(errorMessage(error), "error");
    }
    button.disabled = false;
    button.textContent = "Google로 시작하기";
  });

  qs("#btn-space-picker").addEventListener("click", openSpacePicker);
  qs("#btn-space-settings").addEventListener("click", openSpaceSettings);
  wireThemeToggle(qs("#btn-theme-toggle"));
  qs("#btn-add-box").addEventListener("click", handleAddBox);
  qs("#btn-account").addEventListener("click", openAccountSheet);
  qs("#meter-boxes").addEventListener("click", openPlanSheet);
  qs("#btn-first-box").addEventListener("click", handleAddBox);
  qs("#btn-starter").addEventListener("click", createStarterBoxes);

  const searchInput = qs("#box-search");
  const searchClear = qs("#btn-search-clear");
  let searchTimer = null;

  searchInput.addEventListener("input", () => {
    searchClear.hidden = searchInput.value.length === 0;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value;
      state.activeIndex = searchInput.value.trim().length > 0 ? 0 : -1;
      renderBoxes();
      if (searchInput.value.trim().length > 1) {
        track("search_used", { surface: SURFACE });
      }
    }, SEARCH_DEBOUNCE_MS);
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (searchInput.value.length > 0) {
        resetSearch();
      } else {
        searchInput.blur();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (state.activeIndex < 0) {
        state.activeIndex = 0;
        renderActiveBox();
      } else {
        moveActive(1);
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const id = state.visibleIds[state.activeIndex < 0 ? 0 : state.activeIndex];
      if (!id) {
        return;
      }
      handleBoxClick(id, "search");
    }
  });

  searchClear.addEventListener("click", () => {
    resetSearch();
    searchInput.focus();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      realtime.suspend();
      return;
    }
    realtime.resume().catch((error) => console.warn("실시간 재개 실패", error));
    if (state.spaceId) {
      refreshBoxes().catch((error) => console.warn("박스 새로고침 실패", error));
    }
  });

  window.addEventListener("pagehide", () => {
    flushAllPending();
    realtime.stop();
  });
}

async function loadWorkspace() {
  setView("loading");
  try {
    const [profile, plans] = await Promise.all([api.fetchProfile(), api.fetchPlans()]);
    state.profile = profile;
    state.plans = plans ?? [];
    state.plan = state.plans.find((plan) => plan.code === profile.plan) ?? null;

    api.fetchSubscription()
      .then((row) => {
        state.subscription = row;
      })
      .catch(() => {});

    await api.ensurePersonalSpace();
    state.spaces = (await api.fetchSpaces()) ?? [];

    state.sortMode = (await readLocal("butbox.sortMode")) ?? SORT_MODES.manual;

    const remembered = await readLocal(STORAGE_KEYS.lastSpaceId);
    const target =
      state.spaces.find((space) => space.id === remembered)?.id ?? state.spaces[0]?.id ?? null;

    setView("main");
    renderAccount();
    await selectSpace(target);
  } catch (error) {
    if (isAuthError(error)) {
      await clearSession();
      state.session = null;
      setView("signin");
      showToast(errorMessage(error), "error");
      return;
    }
    setView("main");
    reportError(error);
  }
}

async function refreshSpaces() {
  state.spaces = (await api.fetchSpaces()) ?? [];
  renderSpaceHeader();
}

function resetSearch() {
  const searchInput = qs("#box-search");
  const searchClear = qs("#btn-search-clear");
  searchInput.value = "";
  state.search = "";
  state.activeIndex = -1;
  searchClear.hidden = true;
  renderBoxes();
}

function focusSearch() {
  const searchInput = qs("#box-search");
  searchInput.focus();
  searchInput.select();
}

async function selectSpace(spaceId) {
  await flushAllPending();
  resetSearch();
  state.tagFilter = null;
  state.spaceId = spaceId;
  for (const view of boxViews.values()) {
    clearTimeout(view.timer);
  }
  boxViews.clear();
  clear(qs("#box-list"));
  state.boxes = [];
  state.members = [];

  if (!spaceId) {
    renderSpaceHeader();
    renderBoxes();
    return;
  }

  await writeLocal(STORAGE_KEYS.lastSpaceId, spaceId);
  renderSpaceHeader();

  try {
    const [boxes, members] = await Promise.all([api.fetchBoxes(spaceId), api.fetchMembers(spaceId)]);
    state.boxes = boxes ?? [];
    state.members = members ?? [];
    renderBoxes();
    await realtime.watch(spaceId);
  } catch (error) {
    reportError(error);
  }
}

async function refreshBoxes() {
  if (!state.spaceId) {
    return;
  }
  const boxes = await api.fetchBoxes(state.spaceId);
  state.boxes = boxes ?? [];
  renderBoxes();
  await refreshSpaces();
}

function handleRealtimeChange({ type, record, previous }) {
  if (type === "DELETE") {
    const id = previous?.id;
    if (!id) {
      return;
    }
    state.boxes = state.boxes.filter((box) => box.id !== id);
    renderBoxes();
    bumpSpaceCounts();
    return;
  }

  if (!record || record.space_id !== state.spaceId) {
    return;
  }
  const index = state.boxes.findIndex((box) => box.id === record.id);
  const local = index === -1 ? {} : state.boxes[index];
  const incoming = {
    ...local,
    id: record.id,
    space_id: record.space_id,
    name: record.name,
    kind: record.kind,
    text_content: record.text_content ?? "",
    tags: Array.isArray(record.tags) ? record.tags : local.tags ?? [],
    byte_size: Number(record.byte_size ?? 0),
    locked: Boolean(record.locked),
    sort_order: Number(record.sort_order ?? 0),
    updated_at: record.updated_at,
    updated_by: record.updated_by,
    is_favorite: Boolean(local.is_favorite),
    use_count: Number(local.use_count ?? 0),
    last_used_at: local.last_used_at ?? null
  };

  if (index === -1) {
    state.boxes = [...state.boxes, incoming].sort(compareBoxes);
  } else {
    state.boxes[index] = incoming;
  }
  renderBoxes();
  bumpSpaceCounts();
}

function compareBoxes(a, b) {
  if (a.sort_order !== b.sort_order) {
    return a.sort_order - b.sort_order;
  }
  return String(a.id).localeCompare(String(b.id));
}

function bumpSpaceCounts() {
  const space = currentSpace();
  if (!space) {
    return;
  }
  space.box_count = state.boxes.length;
  space.used_bytes = state.boxes.reduce((total, box) => total + Number(box.byte_size ?? 0), 0);
  renderMeter();
}

function renderAccount() {
  const email = state.profile?.email ?? state.session?.user?.email ?? "";
  qs("#account-email").textContent = email || "계정";
}

function renderSpaceHeader() {
  const space = currentSpace();
  qs("#space-name").textContent = space ? space.name : "스페이스 없음";
  qs("#btn-space-settings").disabled = !space;
  renderMeter();
  renderLiveDot();
}

function renderMeter() {
  const space = currentSpace();
  const fill = qs("#meter-fill");
  const counter = qs("#meter-boxes");

  if (!space) {
    fill.style.width = "0%";
    fill.dataset.level = "normal";
    counter.textContent = "0 / 0";
    counter.dataset.level = "normal";
    return;
  }

  const limit = Number(space.box_limit ?? 0);
  const count = Number(space.box_count ?? state.boxes.length);
  const ratio = usageRatio(count, limit);
  const level = ratio >= 1 ? "full" : ratio >= 0.8 ? "high" : "normal";
  fill.style.width = `${Math.round(ratio * 100)}%`;
  fill.dataset.level = level;
  counter.textContent = `${count} / ${limit}`;
  counter.dataset.level = level;
  counter.title = `박스 ${count}개 · 최대 ${limit}개`;
}

function renderLiveDot() {
  const dot = qs("#live-dot");
  dot.dataset.status = state.liveStatus;
  const labels = {
    idle: "실시간 꺼짐",
    connecting: "실시간 연결 중",
    live: "실시간 연결됨",
    retrying: "실시간 재연결 중"
  };
  dot.title = labels[state.liveStatus] ?? "";
}

function visibleBoxes() {
  const filtered = state.tagFilter
    ? state.boxes.filter((box) => (box.tags ?? []).includes(state.tagFilter))
    : state.boxes;
  const sorted = sortBoxes(filtered, state.sortMode, state.sortMode !== SORT_MODES.name);
  return searchBoxes(sorted, state.search);
}

function renderBoxes() {
  const list = qs("#box-list");
  const empty = qs("#box-empty");
  const noMatch = qs("#box-nomatch");
  const present = new Set(state.boxes.map((box) => box.id));

  for (const [id, view] of boxViews) {
    if (!present.has(id)) {
      clearTimeout(view.timer);
      view.root.remove();
      boxViews.delete(id);
    }
  }

  for (const box of state.boxes) {
    let view = boxViews.get(box.id);
    if (!view) {
      view = createBoxView(box);
      boxViews.set(box.id, view);
    }
    updateBoxView(view, box);
  }

  const visible = visibleBoxes();
  const visibleIds = new Set(visible.map((box) => box.id));

  for (const [id, view] of boxViews) {
    if (!visibleIds.has(id) && view.root.parentNode) {
      view.root.remove();
    }
  }

  visible.forEach((box, index) => {
    const view = boxViews.get(box.id);
    if (list.children[index] !== view.root) {
      list.insertBefore(view.root, list.children[index] ?? null);
    }
  });

  state.visibleIds = visible.map((box) => box.id);
  if (state.activeIndex >= visible.length) {
    state.activeIndex = visible.length - 1;
  }
  renderActiveBox();

  list.hidden = visible.length === 0;
  empty.hidden = state.boxes.length > 0;
  noMatch.hidden = state.boxes.length === 0 || visible.length > 0;
  renderTagFilter();
  renderMeter();
  renderAddButton();
}

function renderActiveBox() {
  for (const [id, view] of boxViews) {
    const active = state.activeIndex >= 0 && state.visibleIds[state.activeIndex] === id;
    view.root.dataset.active = active ? "true" : "false";
    if (active && view.root.parentNode) {
      view.root.scrollIntoView({ block: "nearest" });
    }
  }
}

function moveActive(delta) {
  if (state.visibleIds.length === 0) {
    return;
  }
  const next = state.activeIndex + delta;
  state.activeIndex = Math.max(0, Math.min(state.visibleIds.length - 1, next));
  renderActiveBox();
}

function renderTagFilter() {
  const host = qs("#tag-filter");
  const tags = collectTags(state.boxes);
  clear(host);

  if (tags.length === 0) {
    host.hidden = true;
    return;
  }
  host.hidden = false;

  host.append(
    el("button", {
      class: "chip",
      type: "button",
      text: "전체",
      dataset: { on: state.tagFilter === null ? "true" : "false" },
      onclick: () => {
        state.tagFilter = null;
        state.activeIndex = -1;
        renderBoxes();
      }
    })
  );

  for (const entry of tags) {
    host.append(
      el("button", {
        class: "chip",
        type: "button",
        text: entry.tag,
        title: `${entry.tag} · ${entry.count}개`,
        dataset: { on: state.tagFilter === entry.tag ? "true" : "false" },
        onclick: () => {
          state.tagFilter = state.tagFilter === entry.tag ? null : entry.tag;
          state.activeIndex = -1;
          renderBoxes();
        }
      })
    );
  }
}

function renderAddButton() {
  const space = currentSpace();
  const button = qs("#btn-add-box");
  button.textContent = "박스 추가";
  if (!space) {
    button.disabled = true;
    button.dataset.state = "ready";
    button.title = "";
    return;
  }
  const atLimit = Number(space.box_count ?? state.boxes.length) >= Number(space.box_limit ?? 0);
  button.disabled = false;
  button.dataset.state = atLimit ? "limit" : "ready";
  button.title = atLimit ? "박스가 가득 찼습니다" : "";
}

function createBoxView(box) {
  const starEl = el("button", {
    class: "box__star",
    type: "button",
    onclick: (event) => {
      event.stopPropagation();
      toggleFavorite(box.id);
    }
  });

  const nameInput = el("input", {
    class: "box__name",
    type: "text",
    maxLength: 40,
    autocomplete: "off",
    spellcheck: false,
    "aria-label": "박스 이름",
    onclick: (event) => event.stopPropagation(),
    onkeydown: (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        commitBoxName(box.id);
        nameInput.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        restoreBoxName(box.id);
        nameInput.blur();
      }
    },
    oninput: () => {
      nameInput.dataset.dirty = "true";
    },
    onblur: () => commitBoxName(box.id)
  });
  const previewEl = el("span", { class: "box__preview" });
  const tagsEl = el("span", { class: "box__tags" });

  const editButton = el("button", {
    class: "box__act",
    type: "button",
    text: "수정",
    onclick: (event) => {
      event.stopPropagation();
      openBoxEditor(box.id);
    }
  });

  const actions = el("div", { class: "box__acts" }, [editButton]);

  const root = el(
    "article",
    {
      class: "box",
      dataset: { boxId: box.id, active: "false" },
      onclick: () => handleBoxClick(box.id, "card"),
      onkeydown: (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleBoxClick(box.id, "card");
        }
      }
    },
    [
      el("div", { class: "box__head" }, [nameInput, starEl]),
      previewEl,
      el("div", { class: "box__foot" }, [tagsEl, actions])
    ]
  );
  root.setAttribute("role", "group");
  root.setAttribute("tabindex", "0");

  return {
    root,
    starEl,
    nameInput,
    previewEl,
    tagsEl,
    editButton,
    timer: null,
    dirty: false,
    saving: false,
    resaveRequested: false,
    savedValue: box.text_content ?? "",
    draft: box.text_content ?? "",
    remote: null,
    editor: null,
    box
  };
}

function updateBoxView(view, box) {
  view.box = box;
  const editingName = document.activeElement === view.nameInput;
  if (!editingName && view.nameInput.value !== box.name) {
    view.nameInput.value = box.name;
    view.nameInput.dataset.dirty = "false";
  }
  view.nameInput.disabled = Boolean(box.locked);
  view.nameInput.title = box.locked ? "읽기 전용 박스" : "클릭해서 이름 바꾸기";
  view.root.setAttribute("aria-label", `${box.name} 박스`);
  view.root.title = "내용이 있으면 복사합니다. 빈 박스는 클립보드 텍스트를 저장합니다.";
  view.root.dataset.locked = box.locked ? "true" : "false";
  view.root.dataset.template = hasVariables(box.text_content) ? "true" : "false";

  const favorite = Boolean(box.is_favorite);
  view.starEl.textContent = favorite ? "★" : "☆";
  view.starEl.dataset.on = favorite ? "true" : "false";
  view.starEl.title = favorite ? "즐겨찾기 해제" : "즐겨찾기";
  view.starEl.setAttribute("aria-label", view.starEl.title);

  const tags = box.tags ?? [];
  view.tagsEl.textContent = tags.length > 0 ? tags.map((tag) => `#${tag}`).join(" ") : "";
  view.tagsEl.hidden = tags.length === 0;

  const serverValue = box.text_content ?? "";
  const editing = Boolean(view.editor) && document.activeElement === view.editor.textarea;

  if (serverValue === view.draft) {
    view.savedValue = serverValue;
    view.dirty = false;
    view.remote = null;
  } else if (view.dirty || editing) {
    if (serverValue !== view.savedValue) {
      view.remote = serverValue;
    }
  } else {
    view.draft = serverValue;
    view.savedValue = serverValue;
    view.remote = null;
    if (view.editor) {
      view.editor.textarea.value = serverValue;
    }
  }

  renderPreview(view);
  refreshEditor(view);
}

function renderPreview(view) {
  const preview = previewText(view.draft, 90);
  if (preview) {
    view.previewEl.textContent = preview;
    view.previewEl.dataset.empty = "false";
  } else {
    view.previewEl.textContent = "비어 있음";
    view.previewEl.dataset.empty = "true";
  }
}

function describeBox(box) {
  const who = memberName(box.updated_by);
  const when = box.updated_at ? formatRelativeTime(box.updated_at) : "";
  if (!when) {
    return "비어 있음";
  }
  return who ? `${when} · ${who}` : when;
}

function refreshEditor(view) {
  if (!view.editor) {
    return;
  }
  view.editor.textarea.readOnly = Boolean(view.box.locked);
  view.editor.badge.hidden = view.remote === null;
  updateSizeLabel(view);
  if (!view.dirty && !view.saving) {
    setStatus(view, describeBox(view.box));
  }
}

function memberName(userId) {
  if (!userId) {
    return "";
  }
  if (state.profile && userId === state.profile.id) {
    return "나";
  }
  const member = state.members.find((item) => item.user_id === userId);
  if (!member) {
    return "";
  }
  return member.display_name || member.email || "";
}

function setStatus(view, text) {
  if (view.editor) {
    view.editor.statusEl.textContent = text;
  }
}

function updateSizeLabel(view) {
  if (!view.editor) {
    return;
  }
  const size = byteLength(view.draft);
  view.editor.sizeEl.textContent = `${formatBytes(size)} / ${formatBytes(TEXT_MAX_BYTES)}`;
  view.editor.sizeEl.dataset.over = size > TEXT_MAX_BYTES ? "true" : "false";
}

async function toggleFavorite(boxId) {
  const index = state.boxes.findIndex((item) => item.id === boxId);
  if (index === -1) {
    return;
  }
  const next = !state.boxes[index].is_favorite;
  state.boxes[index] = { ...state.boxes[index], is_favorite: next };
  renderBoxes();
  try {
    await api.setBoxFavorite(boxId, next);
    if (next) {
      track("favorite_used", { surface: SURFACE });
    }
  } catch (error) {
    state.boxes[index] = { ...state.boxes[index], is_favorite: !next };
    renderBoxes();
    reportError(error);
  }
}

async function resolveOutput(boxId) {
  const view = boxViews.get(boxId);
  if (!view) {
    return null;
  }
  const source = view.draft ?? "";
  const variables = promptableVariables(source);
  if (variables.length === 0) {
    return { text: fillTemplate(source, {}), direct: true };
  }

  const values = await openForm({
    title: "값을 채워 주세요",
    description: `${view.box.name}에 채울 값입니다.`,
    fields: variables.map((name) => ({
      name,
      label: name,
      placeholder: name,
      maxLength: 200
    })),
    submitLabel: "만들기"
  });
  if (!values) {
    return null;
  }
  track("template_filled", { surface: SURFACE });
  return { text: fillTemplate(source, values), direct: false };
}

function markUsed(boxId) {
  const index = state.boxes.findIndex((item) => item.id === boxId);
  if (index !== -1) {
    state.boxes[index] = {
      ...state.boxes[index],
      use_count: Number(state.boxes[index].use_count ?? 0) + 1,
      last_used_at: new Date().toISOString()
    };
  }
  api.touchBox(boxId).catch(() => {});
}

function handleBoxClick(boxId, surface) {
  const view = boxViews.get(boxId);
  if (!view) {
    return;
  }
  if ((view.draft ?? "").trim().length === 0) {
    saveClipboardToBox(boxId);
    return;
  }
  copyBox(boxId, surface);
}

async function saveClipboardToBox(boxId) {
  const view = boxViews.get(boxId);
  if (!view || view.box.locked) {
    showToast("읽기 전용 박스에는 저장할 수 없습니다.", "info");
    return;
  }
  if (view.saving) {
    showToast("저장이 끝난 뒤 다시 눌러 주세요.", "info");
    return;
  }

  let text = "";
  try {
    text = await readClipboardText();
  } catch {
    showToast("클립보드 내용을 읽지 못했습니다. 브라우저 권한을 확인해 주세요.", "info");
    return;
  }

  if (text.trim().length === 0) {
    showToast("클립보드에 저장할 텍스트가 없습니다.", "info");
    return;
  }

  const check = validateBoxText(text);
  if (!check.ok) {
    showToast(check.message, "error");
    return;
  }

  view.draft = text;
  view.dirty = true;
  renderPreview(view);
  const saved = await saveBox(boxId);
  if (saved) {
    showToast("클립보드 내용을 박스에 저장했습니다.", "success");
  }
}

function copyBox(boxId, surface) {
  const view = boxViews.get(boxId);
  if (!view) {
    return;
  }

  const variables = promptableVariables(view.draft ?? "");
  if (variables.length === 0) {
    const loader = view.dirty
      ? () => fillTemplate(view.draft, {})
      : () => api.fetchBoxText(boxId).then((text) => fillTemplate(text, {}));
    copyTextFrom(loader)
      .then((text) => finishCopy(view, boxId, text, surface))
      .catch((error) => reportError(error));
    return;
  }

  resolveOutput(boxId)
    .then((result) => {
      if (!result) {
        return null;
      }
      return copyTextFrom(() => result.text).then((text) => finishCopy(view, boxId, text, surface));
    })
    .catch((error) => reportError(error));
}

function finishCopy(view, boxId, text, surface) {
  if (!text) {
    showToast("이 박스는 비어 있습니다.", "info");
    return;
  }
  const busy = view.dirty || view.saving;
  if (!busy && !hasVariables(view.draft) && text !== view.draft) {
    view.draft = text;
    view.savedValue = text;
    renderPreview(view);
    if (view.editor) {
      view.editor.textarea.value = text;
    }
  }
  markUsed(boxId);
  track("box_copied", { surface: surface ?? SURFACE });
  showToast(`복사했습니다 · ${previewText(text, 22)}`, "success");
}

async function openBoxEditor(boxId) {
  const view = boxViews.get(boxId);
  if (!view) {
    return;
  }

  await openSheet({
    title: view.box.name,
    build: (body, close) => {
      const textarea = el("textarea", {
        class: "editor__text",
        spellcheck: false,
        placeholder: "여기에 붙여넣으세요 (Ctrl+V)",
        value: view.draft,
        dataset: { autofocus: "true" }
      });

      const statusEl = el("span", { class: "editor__status" });
      const sizeEl = el("span", { class: "editor__size" });
      const badge = el("button", {
        class: "editor__badge",
        type: "button",
        hidden: true,
        text: "팀원이 수정함 · 불러오기",
        onclick: () => applyRemote(boxId)
      });

      view.editor = { textarea, statusEl, sizeEl, badge };

      const absorb = () => {
        view.draft = textarea.value;
        view.dirty = view.draft !== view.savedValue;
        renderPreview(view);
        updateSizeLabel(view);
      };

      textarea.addEventListener("input", () => {
        absorb();
        setStatus(view, "저장 대기");
        clearTimeout(view.timer);
        view.timer = setTimeout(() => saveBox(boxId), AUTOSAVE_DELAY_MS);
      });

      textarea.addEventListener("paste", (event) => {
        const pasted = readPastedText(event);
        if (pasted && pasted.kind !== "text") {
          event.preventDefault();
          showToast("지금은 텍스트만 담을 수 있습니다.", "info");
          return;
        }
        setTimeout(() => {
          absorb();
          clearTimeout(view.timer);
          saveBox(boxId);
        }, 0);
      });

      textarea.addEventListener("blur", () => {
        absorb();
        flushPending(boxId);
      });

      const hint = el("p", {
        class: "editor__hint",
        text: "{{고객명}} 처럼 적으면 복사할 때 값을 물어봅니다. {{오늘}}은 자동으로 채워집니다."
      });

      const actions = el("div", { class: "editor__actions" }, [
        el("button", {
          class: "btn btn--primary",
          type: "button",
          text: "복사",
          onclick: () => copyBox(boxId, "editor")
        })
      ]);

      actions.append(
        el("button", {
          class: "btn",
          type: "button",
          text: "더보기",
          onclick: async () => {
            close(null);
            await openBoxMenu(boxId);
          }
        })
      );

      body.append(
        el("div", { class: "editor" }, [
          textarea,
          badge,
          el("div", { class: "editor__meta" }, [statusEl, sizeEl]),
          hint
        ]),
        actions
      );

      refreshEditor(view);
    }
  });

  view.editor = null;
  flushPending(boxId);
}

function flushPending(boxId) {
  const view = boxViews.get(boxId);
  if (!view || !view.dirty) {
    return null;
  }
  clearTimeout(view.timer);
  return saveBox(boxId);
}

function flushAllPending() {
  const pending = [];
  for (const boxId of boxViews.keys()) {
    const saving = flushPending(boxId);
    if (saving) {
      pending.push(saving);
    }
  }
  return Promise.all([...pending, ...inFlightSaves]);
}

function saveBox(boxId) {
  const promise = runSave(boxId);
  inFlightSaves.add(promise);
  promise.catch(() => {}).then(() => inFlightSaves.delete(promise));
  return promise;
}

async function runSave(boxId) {
  const view = boxViews.get(boxId);
  if (!view) {
    return false;
  }
  if (view.saving) {
    view.resaveRequested = true;
    return false;
  }

  const value = view.draft;
  if (value === view.savedValue) {
    view.dirty = false;
    refreshEditor(view);
    return true;
  }

  const check = validateBoxText(value);
  if (!check.ok) {
    setStatus(view, "너무 큽니다");
    showToast(check.message, "error");
    return false;
  }

  view.saving = true;
  view.resaveRequested = false;
  let succeeded = false;
  setStatus(view, "저장 중");
  try {
    const rows = await api.saveBoxText(boxId, value);
    const saved = Array.isArray(rows) ? rows[0] : null;
    view.savedValue = value;
    view.dirty = view.draft !== value;
    view.remote = null;
    if (view.editor) {
      view.editor.badge.hidden = true;
    }
    if (saved) {
      const index = state.boxes.findIndex((box) => box.id === boxId);
      if (index !== -1) {
        state.boxes[index] = { ...state.boxes[index], ...saved, text_content: value };
        view.box = state.boxes[index];
      }
    }
    setStatus(view, "저장됨");
    renderPreview(view);
    bumpSpaceCounts();
    succeeded = true;
  } catch (error) {
    setStatus(view, "저장 실패");
    reportError(error);
  } finally {
    view.saving = false;
  }

  const wantsResave = view.resaveRequested || view.draft !== view.savedValue;
  view.resaveRequested = false;
  if (succeeded && wantsResave && boxViews.has(boxId)) {
    return runSave(boxId);
  }
  return succeeded;
}

function applyRemote(boxId) {
  const view = boxViews.get(boxId);
  if (!view || view.remote === null) {
    return;
  }
  view.draft = view.remote;
  view.savedValue = view.remote;
  view.remote = null;
  view.dirty = false;
  if (view.editor) {
    view.editor.textarea.value = view.draft;
    view.editor.badge.hidden = true;
  }
  renderPreview(view);
  refreshEditor(view);
  showToast("팀원이 저장한 내용을 불러왔습니다.", "success");
}

async function commitBoxName(boxId) {
  const view = boxViews.get(boxId);
  if (!view || view.box.locked || view.nameInput.dataset.dirty !== "true") {
    return;
  }

  const input = view.nameInput;
  const check = validateBoxName(input.value);
  if (!check.ok) {
    input.value = view.box.name;
    input.dataset.dirty = "false";
    showToast(check.message, "info");
    return;
  }

  if (check.value === view.box.name) {
    input.value = check.value;
    input.dataset.dirty = "false";
    return;
  }

  input.value = check.value;
  input.dataset.dirty = "false";
  input.disabled = true;
  try {
    const rows = await api.renameBox(boxId, check.value);
    const saved = Array.isArray(rows) ? rows[0] : rows;
    const index = state.boxes.findIndex((box) => box.id === boxId);
    if (index !== -1) {
      state.boxes[index] = { ...state.boxes[index], ...saved, name: check.value };
      view.box = state.boxes[index];
    }
    renderBoxes();
  } catch (error) {
    input.value = view.box.name;
    reportError(error);
  } finally {
    input.disabled = Boolean(view.box.locked);
  }
}

function restoreBoxName(boxId) {
  const view = boxViews.get(boxId);
  if (!view) {
    return;
  }
  view.nameInput.value = view.box.name;
  view.nameInput.dataset.dirty = "false";
}

function focusBoxName(boxId) {
  const input = boxViews.get(boxId)?.nameInput;
  if (!input || input.disabled) {
    return;
  }
  input.focus();
  input.select();
}

async function moveBox(boxId, delta) {
  const index = state.boxes.findIndex((item) => item.id === boxId);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= state.boxes.length) {
    return;
  }

  const ordered = [...state.boxes];
  const [moved] = ordered.splice(index, 1);
  ordered.splice(target, 0, moved);
  state.boxes = ordered.map((box, position) => ({ ...box, sort_order: position }));
  renderBoxes();

  try {
    await api.reorderBoxes(state.spaceId, state.boxes.map((box) => box.id));
  } catch (error) {
    reportError(error);
    await refreshBoxes();
  }
}

async function openBoxMenu(boxId) {
  const index = state.boxes.findIndex((item) => item.id === boxId);
  const box = state.boxes[index];
  if (!box) {
    return;
  }

  const options = [
    { value: "tags", label: "태그", description: (box.tags ?? []).join(", ") || "태그 없음" },
    {
      value: "favorite",
      label: box.is_favorite ? "즐겨찾기 해제" : "즐겨찾기에 추가"
    },
    { value: "duplicate", label: "복제" }
  ];
  if (index > 0) {
    options.push({ value: "up", label: "위로 옮기기" });
  }
  if (index < state.boxes.length - 1) {
    options.push({ value: "down", label: "아래로 옮기기" });
  }
  options.push(
    { value: "clear", label: "내용 비우기", description: "이름표는 그대로 두고 안만 비웁니다." },
    { value: "delete", label: "박스 삭제", danger: true }
  );

  const choice = await openChoice({ title: box.name, options });

  if (choice === "tags") {
    await editBoxTags(boxId);
    return;
  }

  if (choice === "favorite") {
    await toggleFavorite(boxId);
    return;
  }

  if (choice === "duplicate") {
    await duplicateBox(boxId);
    return;
  }

  if (choice === "up" || choice === "down") {
    await moveBox(boxId, choice === "up" ? -1 : 1);
    return;
  }

  if (choice === "clear") {
    const view = boxViews.get(boxId);
    if (!view) {
      return;
    }
    view.draft = "";
    view.dirty = view.savedValue !== "";
    renderPreview(view);
    clearTimeout(view.timer);
    await saveBox(boxId);
    return;
  }

  if (choice === "delete") {
    const confirmed = await openConfirm({
      title: "박스를 삭제할까요?",
      message: `"${box.name}" 박스와 그 안의 내용이 사라집니다.`,
      confirmLabel: "삭제",
      danger: true
    });
    if (!confirmed) {
      return;
    }
    try {
      await api.deleteBox(boxId);
      state.boxes = state.boxes.filter((item) => item.id !== boxId);
      renderBoxes();
      await refreshSpaces();
      showToast("박스를 삭제했습니다.", "success");
    } catch (error) {
      reportError(error);
    }
  }
}

async function handleAddBox() {
  const space = currentSpace();
  if (!space) {
    return;
  }

  if (Number(space.box_count ?? state.boxes.length) >= Number(space.box_limit ?? 0)) {
    await offerUpgrade(UPGRADE_LEVERS.boxLimit, boxLimitCopy());
    return;
  }

  try {
    const boxId = await api.createBox(space.id, NEW_BOX_NAME);
    await refreshBoxes();
    focusBoxName(boxId);
    track("box_created", { surface: SURFACE });
    showToast("새 박스를 만들었습니다. 이름을 바로 입력해 보세요.", "success");
  } catch (error) {
    reportError(error);
  }
}

async function openSpacePicker() {
  const options = state.spaces.map((space) => ({
    value: `space:${space.id}`,
    label: space.id === state.spaceId ? `${space.name} · 보는 중` : space.name,
    description: `박스 ${space.box_count} / ${space.box_limit} · 멤버 ${space.member_count}명`
  }));

  options.push({ value: "create", label: "새 스페이스 만들기" });
  options.push({ value: "join", label: "코드로 참여하기", description: "받은 코드와 비밀번호를 넣습니다." });

  const choice = await openChoice({ title: "스페이스", options });
  if (!choice) {
    return;
  }
  if (choice.startsWith("space:")) {
    const spaceId = choice.slice("space:".length);
    if (spaceId !== state.spaceId) {
      await selectSpace(spaceId);
    }
    return;
  }
  if (choice === "create") {
    await handleCreateSpace();
    return;
  }
  if (choice === "join") {
    await handleJoinSpace();
  }
}

async function handleCreateSpace() {
  const values = await openForm({
    title: "새 스페이스",
    description: "팀이나 용도별로 박스를 나눠 담는 공간입니다.",
    fields: [
      {
        name: "name",
        label: "스페이스 이름",
        placeholder: "고객센터",
        maxLength: 40,
        validate: validateSpaceName
      }
    ],
    submitLabel: "만들기"
  });
  if (!values) {
    return;
  }

  try {
    const spaceId = await api.createSpace(validateSpaceName(values.name).value);
    await refreshSpaces();
    await selectSpace(spaceId);
    track("space_created", { surface: SURFACE });
    showToast("스페이스를 만들었습니다.", "success");
  } catch (error) {
    if (String(error?.message ?? "").includes("SPACE_LIMIT_REACHED")) {
      await offerUpgrade(UPGRADE_LEVERS.spaceLimit, {
        title: "스페이스를 다 썼습니다",
        message: "무료 플랜에서는 스페이스를 1개까지 만들 수 있습니다. 참여는 개수 제한이 없습니다."
      });
      return;
    }
    reportError(error);
  }
}

async function handleJoinSpace() {
  const values = await openForm({
    title: "스페이스 연결하기",
    description: "팀에서 받은 코드와 비밀번호를 넣으세요.",
    fields: [
      {
        name: "code",
        label: "스페이스 코드",
        placeholder: "ABCD-2345",
        maxLength: 24,
        transform: normalizeSpaceCode,
        validate: validateSpaceCodeInput
      },
      {
        name: "password",
        label: "비밀번호",
        type: "password",
        maxLength: 64,
        validate: validatePassword
      }
    ],
    submitLabel: "참여"
  });
  if (!values) {
    return;
  }

  try {
    const spaceId = await api.joinSpace(
      validateSpaceCodeInput(values.code).value,
      values.password
    );
    await refreshSpaces();
    await selectSpace(spaceId);
    track("space_joined", { surface: SURFACE });
    showToast("스페이스에 참여했습니다.", "success");
  } catch (error) {
    reportError(error);
  }
}

async function openSpaceSettings() {
  const space = currentSpace();
  if (!space) {
    return;
  }
  const isOwner = space.role === "owner";

  await openSheet({
    title: space.name,
    build: (body, close) => {
      body.append(
        el("div", { class: "row" }, [
          el("span", { class: "row__label", text: "스페이스 코드" }),
          el("div", { class: "row__value" }, [
            el("code", { class: "code", text: space.space_code }),
            el("button", {
              class: "btn btn--tiny",
              type: "button",
              text: "복사",
              onclick: () => {
                copyTextFrom(() => space.space_code)
                  .then(() => showToast("코드를 복사했습니다.", "success"))
                  .catch((error) => reportError(error));
              }
            })
          ])
        ])
      );

      body.append(
        el("div", { class: "row" }, [
          el("span", { class: "row__label", text: "참여" }),
          el("span", {
            class: "row__value",
            text: space.join_enabled ? "코드와 비밀번호로 참여 가능" : "잠김 (참여 받지 않음)"
          })
        ])
      );

      body.append(
        el("div", { class: "row" }, [
          el("span", { class: "row__label", text: "멤버" }),
          el(
            "div",
            { class: "members" },
            state.members.map((member) =>
              el("div", { class: "members__item" }, [
                el("span", {
                  class: "members__name",
                  text: member.display_name || member.email || "이름 없음"
                }),
                el("span", {
                  class: "members__role",
                  text: member.role === "owner" ? "만든 사람" : "멤버"
                }),
                isOwner && member.role !== "owner"
                  ? el("button", {
                      class: "btn btn--tiny btn--danger",
                      type: "button",
                      text: "내보내기",
                      onclick: async () => {
                        close(null);
                        await removeMember(space.id, member.user_id, member.display_name || member.email);
                      }
                    })
                  : null
              ])
            )
          )
        ])
      );

      const actions = el("div", { class: "sheet__actions" });

      if (isOwner) {
        actions.append(
          el("button", {
            class: "btn btn--block",
            type: "button",
            text: "이름 바꾸기",
            onclick: async () => {
              close(null);
              await renameCurrentSpace(space);
            }
          }),
          el("button", {
            class: "btn btn--block",
            type: "button",
            text: "코드 바꾸기",
            onclick: async () => {
              close(null);
              await changeSpaceCode(space);
            }
          }),
          el("button", {
            class: "btn btn--block",
            type: "button",
            text: "팀원 초대",
            onclick: async () => {
              close(null);
              await openInvitePanel(space);
            }
          })
        );
        if (space.join_enabled) {
          actions.append(
            el("button", {
              class: "btn btn--block",
              type: "button",
              text: "참여 잠그기",
              onclick: async () => {
                close(null);
                await lockJoin(space);
              }
            })
          );
        }
        actions.append(
          el("button", {
            class: "btn btn--block btn--danger",
            type: "button",
            text: "스페이스 삭제",
            onclick: async () => {
              close(null);
              await removeSpace(space);
            }
          })
        );
      } else {
        actions.append(
          el("button", {
            class: "btn btn--block btn--danger",
            type: "button",
            text: "스페이스 나가기",
            onclick: async () => {
              close(null);
              await leaveCurrentSpace(space);
            }
          })
        );
      }

      body.append(actions);
    }
  });
}

async function renameCurrentSpace(space) {
  const values = await openForm({
    title: "스페이스 이름 바꾸기",
    fields: [
      { name: "name", label: "이름", value: space.name, maxLength: 40, validate: validateSpaceName }
    ],
    submitLabel: "저장"
  });
  if (!values) {
    return;
  }
  try {
    await api.renameSpace(space.id, validateSpaceName(values.name).value);
    await refreshSpaces();
    renderSpaceHeader();
    showToast("이름을 바꿨습니다.", "success");
  } catch (error) {
    reportError(error);
  }
}

async function changeSpaceCode(space) {
  const values = await openForm({
    title: "스페이스 코드 바꾸기",
    description: "팀원이 이 코드로 참여합니다. 영문 대문자, 숫자, 하이픈만 쓸 수 있습니다.",
    fields: [
      {
        name: "code",
        label: "코드",
        value: space.space_code,
        maxLength: 24,
        transform: normalizeSpaceCode,
        validate: validateSpaceCodeInput
      }
    ],
    submitLabel: "저장"
  });
  if (!values) {
    return;
  }
  try {
    await api.setSpaceCode(space.id, validateSpaceCodeInput(values.code).value);
    await refreshSpaces();
    showToast("코드를 바꿨습니다.", "success");
  } catch (error) {
    reportError(error);
  }
}

async function setupInvite(space) {
  const suggested = generatePassword();
  const values = await openForm({
    title: "팀원 초대",
    description: "코드와 비밀번호를 함께 알려 주면 팀원이 참여합니다. 비밀번호는 지금 화면에서만 보이니 꼭 복사해 두세요.",
    fields: [
      {
        name: "password",
        label: "비밀번호",
        value: suggested,
        maxLength: 64,
        validate: validatePassword
      }
    ],
    submitLabel: "설정"
  });
  if (!values) {
    return;
  }
  try {
    await api.setSpacePassword(space.id, values.password);
    await refreshSpaces();
    const invite = `스페이스 코드: ${space.space_code}\n비밀번호: ${values.password}`;
    const copied = await openConfirm({
      title: "초대 준비 완료",
      message: `${invite}\n\n이 안내문을 복사할까요? 비밀번호는 다시 볼 수 없습니다.`,
      confirmLabel: "복사"
    });
    if (copied) {
      await copyTextFrom(() => invite);
      showToast("초대 안내를 복사했습니다.", "success");
    }
  } catch (error) {
    reportError(error);
  }
}

async function lockJoin(space) {
  const confirmed = await openConfirm({
    title: "참여를 잠글까요?",
    message: "이미 들어온 멤버는 그대로 남고, 새 참여만 막힙니다.",
    confirmLabel: "잠그기"
  });
  if (!confirmed) {
    return;
  }
  try {
    await api.clearSpacePassword(space.id);
    await refreshSpaces();
    showToast("참여를 잠갔습니다.", "success");
  } catch (error) {
    reportError(error);
  }
}

async function removeMember(spaceId, userId, label) {
  const confirmed = await openConfirm({
    title: "멤버를 내보낼까요?",
    message: `${label} 님이 이 스페이스의 박스를 더 볼 수 없게 됩니다.`,
    confirmLabel: "내보내기",
    danger: true
  });
  if (!confirmed) {
    return;
  }
  try {
    await api.removeMember(spaceId, userId);
    state.members = (await api.fetchMembers(spaceId)) ?? [];
    await refreshSpaces();
    showToast("멤버를 내보냈습니다.", "success");
  } catch (error) {
    reportError(error);
  }
}

async function leaveCurrentSpace(space) {
  const confirmed = await openConfirm({
    title: "스페이스를 나갈까요?",
    message: "다시 들어오려면 코드와 비밀번호가 필요합니다.",
    confirmLabel: "나가기",
    danger: true
  });
  if (!confirmed) {
    return;
  }
  try {
    await api.leaveSpace(space.id);
    realtime.stop();
    await refreshSpaces();
    await selectSpace(state.spaces[0]?.id ?? null);
    showToast("스페이스에서 나왔습니다.", "success");
  } catch (error) {
    reportError(error);
  }
}

async function removeSpace(space) {
  const values = await openForm({
    title: "스페이스 삭제",
    description: `"${space.name}"의 박스 ${space.box_count}개가 모두 사라집니다. 되돌릴 수 없습니다. 확인을 위해 스페이스 이름을 그대로 입력하세요.`,
    fields: [
      {
        name: "name",
        label: "스페이스 이름",
        placeholder: space.name,
        maxLength: 40,
        validate: (value) =>
          String(value).trim() === space.name
            ? { ok: true }
            : { ok: false, message: "이름이 일치하지 않습니다." }
      }
    ],
    submitLabel: "삭제",
    danger: true
  });
  if (!values) {
    return;
  }
  try {
    await api.deleteSpace(space.id);
    realtime.stop();
    await api.ensurePersonalSpace();
    await refreshSpaces();
    await selectSpace(state.spaces[0]?.id ?? null);
    showToast("스페이스를 삭제했습니다.", "success");
  } catch (error) {
    reportError(error);
  }
}

async function openAccountSheet() {
  const planLabel = state.plan?.label ?? "Free";
  const choice = await openChoice({
    title: state.profile?.email ?? "계정",
    description: `${planLabel} 플랜 · 스페이스 ${state.spaces.length}개`,
    options: [
      { value: "plan", label: "요금제 보기", description: "무료 한도와 Pro 준비안 비교" },
      { value: "sort", label: `정렬 · ${sortLabel(state.sortMode)}`, description: "내 순서 / 최근 사용 / 이름" },
      { value: "refresh", label: "새로고침", description: "서버에서 최신 상태를 다시 받아옵니다." },
      { value: "signout", label: "로그아웃", danger: true }
    ]
  });

  if (choice === "plan") {
    await openPlanSheet();
    return;
  }

  if (choice === "sort") {
    await pickSortMode();
    return;
  }

  if (choice === "refresh") {
    await loadWorkspace();
    showToast("새로 불러왔습니다.", "success");
    return;
  }
  if (choice === "signout") {
    realtime.stop();
    await signOut();
    state.session = null;
    state.profile = null;
    state.spaces = [];
    state.boxes = [];
    boxViews.clear();
    clear(qs("#box-list"));
    setView("signin");
  }
}

function sortLabel(mode) {
  if (mode === SORT_MODES.recent) {
    return "최근 사용";
  }
  if (mode === SORT_MODES.name) {
    return "이름";
  }
  return "내 순서";
}

async function pickSortMode() {
  const choice = await openChoice({
    title: "정렬",
    description: "즐겨찾기는 항상 위에 붙습니다.",
    options: [
      { value: SORT_MODES.manual, label: "내 순서", description: "직접 옮긴 순서 그대로" },
      { value: SORT_MODES.recent, label: "최근 사용", description: "방금 쓴 박스가 위로" },
      { value: SORT_MODES.name, label: "이름", description: "가나다순" }
    ]
  });
  if (!choice) {
    return;
  }
  state.sortMode = choice;
  await writeLocal("butbox.sortMode", choice);
  renderBoxes();
  showToast(`${sortLabel(choice)} 순서로 봅니다.`, "success");
}

async function saveCapturedText(capture) {
  const space = currentSpace();
  if (!space) {
    return;
  }

  const suggested = previewText(capture.text, 24) || "새 박스";
  const values = await openForm({
    title: "붙박스에 저장",
    description: previewText(capture.text, 140),
    fields: [
      {
        name: "name",
        label: "이름표",
        value: suggested,
        maxLength: 40,
        validate: validateBoxName
      }
    ],
    submitLabel: "저장"
  });
  if (!values) {
    return;
  }

  let body = capture.text;
  if (capture.url) {
    const withSource = await openConfirm({
      title: "출처도 같이 넣을까요?",
      message: `${capture.title || "제목 없음"}\n${capture.url}`,
      confirmLabel: "같이 저장"
    });
    if (withSource) {
      body = `${capture.text}\n\n${capture.title || ""}\n${capture.url}`.trim();
    }
  }

  try {
    const boxId = await api.createBox(space.id, validateBoxName(values.name).value);
    await api.saveBoxText(boxId, body.slice(0, 10240));
    await refreshBoxes();
    track("context_saved", { surface: SURFACE });
    track("box_created", { surface: "context_menu" });
    showToast("박스에 저장했습니다.", "success");
  } catch (error) {
    if (String(error?.message ?? "").includes("BOX_LIMIT_REACHED")) {
      await offerUpgrade(UPGRADE_LEVERS.boxLimit, boxLimitCopy());
      return;
    }
    reportError(error);
  }
}

function planByCode(code) {
  return state.plans.find((plan) => plan.code === code) ?? null;
}

function formatWon(value) {
  return `${Number(value ?? 0).toLocaleString("ko-KR")}원`;
}

function boxLimitCopy() {
  const space = currentSpace();
  const pro = planByCode("pro");
  const limit = space ? space.box_limit : 10;
  const message = pro
    ? `박스 ${limit}개를 모두 쓰고 있습니다.\nPro 준비안은 ${pro.box_limit}개입니다. 가격은 검증 후 확정합니다.`
    : `박스 ${limit}개를 모두 쓰고 있습니다.`;
  return { title: "박스가 가득 찼습니다", message };
}

async function offerUpgrade(lever, { title, message }) {
  track("upgrade_clicked", { lever, surface: SURFACE });
  const confirmed = await openConfirm({
    title,
    message: `${message}\n\n아직 결제는 준비 중입니다. 관심을 남겨 주시면 열릴 때 가장 먼저 알려 드립니다.`,
    confirmLabel: "관심 있어요"
  });
  if (!confirmed) {
    return;
  }
  try {
    await api.logUpgradeIntent(lever, state.spaceId);
    track("upgrade_started", { lever, surface: SURFACE });
    showToast("신청을 남겼습니다. 고맙습니다.", "success");
  } catch (error) {
    reportError(error);
  }
}

async function editBoxTags(boxId) {
  const box = state.boxes.find((item) => item.id === boxId);
  if (!box) {
    return;
  }
  const values = await openForm({
    title: "태그",
    description: "쉼표로 구분해서 적으세요. 검색창에서 #태그로 걸러 볼 수 있습니다.",
    fields: [
      {
        name: "tags",
        label: "태그",
        value: (box.tags ?? []).join(", "),
        placeholder: "CS, 환불",
        maxLength: 200
      }
    ],
    submitLabel: "저장"
  });
  if (!values) {
    return;
  }
  const list = String(values.tags)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  try {
    const saved = await api.setBoxTags(boxId, list);
    const index = state.boxes.findIndex((item) => item.id === boxId);
    if (index !== -1) {
      state.boxes[index] = { ...state.boxes[index], tags: saved ?? [] };
    }
    renderBoxes();
    showToast("태그를 저장했습니다.", "success");
  } catch (error) {
    reportError(error);
  }
}

async function duplicateBox(boxId) {
  try {
    await api.duplicateBox(boxId);
    await refreshBoxes();
    track("box_duplicated", { surface: SURFACE });
    showToast("박스를 복제했습니다.", "success");
  } catch (error) {
    if (String(error?.message ?? "").includes("BOX_LIMIT_REACHED")) {
      await offerUpgrade(UPGRADE_LEVERS.boxLimit, boxLimitCopy());
      return;
    }
    reportError(error);
  }
}

async function openInvitePanel(space) {
  const origin = webOrigin();
  if (!origin) {
    await openConfirm({
      title: "초대 링크를 만들 수 없습니다",
      message: "config.js의 webOrigin에 실제 웹 주소를 넣어야 초대 링크가 만들어집니다. 지금은 코드와 비밀번호로 초대해 주세요.",
      confirmLabel: "코드로 초대"
    });
    await setupInvite(space);
    return;
  }

  let token = null;
  try {
    token = await api.createInvite(space.id, "member", 7);
    track("invite_created", { surface: SURFACE });
  } catch (error) {
    reportError(error);
    return;
  }

  const link = `${origin}/join.html?t=${token}`;
  await openSheet({
    title: "팀원 초대",
    build: (body, close) => {
      body.append(
        el("p", { class: "modal__desc", text: "이 링크를 받은 사람은 7일 안에 이 스페이스에 참여할 수 있습니다." }),
        el("div", { class: "row" }, [
          el("span", { class: "row__label", text: "초대 링크" }),
          el("code", { class: "code code--wrap", text: link })
        ]),
        el("div", { class: "sheet__actions" }, [
          el("button", {
            class: "btn btn--primary btn--block",
            type: "button",
            text: "링크 복사",
            onclick: () => {
              copyTextFrom(() => link)
                .then(() => showToast("초대 링크를 복사했습니다.", "success"))
                .catch((error) => reportError(error));
            }
          }),
          el("button", {
            class: "btn btn--block",
            type: "button",
            text: "코드와 비밀번호로 초대하기",
            onclick: async () => {
              close(null);
              await setupInvite(space);
            }
          }),
          el("button", {
            class: "btn btn--block btn--danger",
            type: "button",
            text: "발급한 링크 모두 취소",
            onclick: async () => {
              close(null);
              try {
                await api.revokeInvites(space.id);
                showToast("초대 링크를 모두 취소했습니다.", "success");
              } catch (error) {
                reportError(error);
              }
            }
          })
        ])
      );
    }
  });
}

function webOrigin() {
  if (SURFACE === "web") {
    return window.location.origin;
  }
  const configured = String(CONFIG.webOrigin ?? "").replace(/\/$/, "");
  let host = "";
  try {
    const parsed = new URL(configured);
    host = parsed.protocol === "https:" ? parsed.hostname : "";
  } catch {
    return null;
  }
  if (!host.includes(".") || host !== host.toLowerCase()) {
    return null;
  }
  return configured;
}

async function changeMemberRole(space, member) {
  const next = member.role === "admin" ? "member" : "admin";
  const confirmed = await openConfirm({
    title: next === "admin" ? "관리자로 올릴까요?" : "일반 멤버로 내릴까요?",
    message:
      next === "admin"
        ? `${member.display_name || member.email} 님이 팀원을 초대하고 관리할 수 있게 됩니다.`
        : `${member.display_name || member.email} 님의 관리 권한을 거둡니다.`,
    confirmLabel: "변경"
  });
  if (!confirmed) {
    return;
  }
  try {
    await api.setMemberRole(space.id, member.user_id, next);
    state.members = (await api.fetchMembers(space.id)) ?? [];
    showToast("권한을 바꿨습니다.", "success");
  } catch (error) {
    reportError(error);
  }
}

const STARTER_BOXES = [
  { name: "환불 안내", text: "안녕하세요 {{고객명}}님.\n주문번호 {{주문번호}}의 환불이 접수되었습니다. 영업일 기준 3일 이내에 처리됩니다." },
  { name: "배송 안내", text: "주문하신 상품은 오늘 출고되었습니다. 송장번호는 {{송장번호}}입니다." },
  { name: "회사 계좌", text: "국민은행 123456-01-789012\n예금주 (주)한빛상사" }
];

async function createStarterBoxes() {
  const space = currentSpace();
  if (!space) {
    return;
  }
  try {
    for (const starter of STARTER_BOXES) {
      const boxId = await api.createBox(space.id, starter.name);
      await api.saveBoxText(boxId, starter.text);
    }
    await refreshBoxes();
    track("box_created", { surface: "starter", count: STARTER_BOXES.length });
    showToast("예시 박스를 만들었습니다. 내용을 바꿔서 쓰세요.", "success");
  } catch (error) {
    reportError(error);
  }
}

function renderPlanRow(plan, current) {
  const price = plan.code === "free"
    ? "무료"
    : plan.price_monthly_krw > 0
      ? `월 ${formatWon(plan.price_monthly_krw)}`
      : "가격 미정";
  const members = plan.member_limit == null ? "참여 무제한" : `멤버 ${plan.member_limit}명`;
  return el("div", { class: "plan", dataset: { current: current ? "true" : "false" } }, [
    el("div", { class: "plan__head" }, [
      el("strong", { class: "plan__name", text: plan.label }),
      el("span", {
        class: "plan__price",
        text: price
      })
    ]),
    el("span", {
      class: "plan__detail",
      text: `박스 ${plan.box_limit}개 · 스페이스 ${plan.space_limit}개 · ${members}`
    })
  ]);
}

async function openPlanSheet() {
  const current = state.profile?.plan ?? "free";
  await openSheet({
    title: "요금제",
    build: (body) => {
      for (const plan of state.plans.filter((item) => item.code !== "team" || current === "team")) {
        body.append(renderPlanRow(plan, plan.code === current));
      }
      body.append(
        el("p", {
          class: "modal__desc",
          text: "지금은 무료 플랜만 실제로 쓸 수 있습니다. 결제는 준비 중이며, 관심을 남기면 열릴 때 알려 드립니다."
        }),
        el("div", { class: "sheet__actions" }, [
          el("button", {
            class: "btn btn--primary btn--block",
            type: "button",
            text: "Pro에 관심 있어요",
            onclick: async () => {
              await offerUpgrade(UPGRADE_LEVERS.boxLimit, {
                title: "Pro 대기 명단",
                message: "결제가 열리면 가장 먼저 알려 드립니다."
              });
            }
          })
        ])
      );
    }
  });
}

boot().catch((error) => {
  console.error("초기화 실패", error);
  setView("signin");
  showToast(errorMessage(error), "error");
});
