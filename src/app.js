import * as api from "./api.js";
import {
  clearSession,
  isConfigured,
  loadSession,
  redirectUrl,
  signIn,
  signOut
} from "./auth.js";
import { copyTextFrom, readPastedText } from "./clipboard.js";
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
import { readLocal, writeLocal } from "./store.js";
import { clear, el, openChoice, openConfirm, openForm, openSheet, qs, showToast } from "./ui.js";

const state = {
  view: "loading",
  session: null,
  profile: null,
  plan: null,
  spaces: [],
  spaceId: null,
  boxes: [],
  members: [],
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
  qs("#redirect-url").textContent = redirectUrl();
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
  await loadWorkspace();
}

function wireStaticHandlers() {
  qs("#btn-copy-redirect").addEventListener("click", () => {
    copyTextFrom(() => redirectUrl())
      .then(() => showToast("리디렉션 주소를 복사했습니다.", "success"))
      .catch((error) => reportError(error));
  });

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
      showToast(errorMessage(error), "error");
    }
    button.disabled = false;
    button.textContent = "Google로 시작하기";
  });

  qs("#btn-space-picker").addEventListener("click", openSpacePicker);
  qs("#btn-space-settings").addEventListener("click", openSpaceSettings);
  qs("#btn-add-box").addEventListener("click", handleAddBox);
  qs("#btn-account").addEventListener("click", openAccountSheet);

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
    state.plan = (plans ?? []).find((plan) => plan.code === profile.plan) ?? null;

    await api.ensurePersonalSpace();
    state.spaces = (await api.fetchSpaces()) ?? [];

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

async function selectSpace(spaceId) {
  await flushAllPending();
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
  const incoming = {
    id: record.id,
    space_id: record.space_id,
    name: record.name,
    kind: record.kind,
    text_content: record.text_content ?? "",
    byte_size: Number(record.byte_size ?? 0),
    locked: Boolean(record.locked),
    sort_order: Number(record.sort_order ?? 0),
    updated_at: record.updated_at,
    updated_by: record.updated_by
  };

  const index = state.boxes.findIndex((box) => box.id === incoming.id);
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
  const boxLabel = qs("#meter-boxes");
  const usageLabel = qs("#meter-usage");

  if (!space) {
    fill.style.width = "0%";
    boxLabel.textContent = "박스 0 / 0";
    usageLabel.textContent = "";
    return;
  }

  const limit = Number(space.box_limit ?? 0);
  const count = Number(space.box_count ?? state.boxes.length);
  const ratio = usageRatio(count, limit);
  fill.style.width = `${Math.round(ratio * 100)}%`;
  fill.dataset.level = ratio >= 1 ? "full" : ratio >= 0.8 ? "high" : "normal";
  boxLabel.textContent = `박스 ${count} / ${limit}`;
  usageLabel.textContent = `텍스트 ${formatBytes(space.used_bytes ?? 0)}`;
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

function renderBoxes() {
  const list = qs("#box-list");
  const empty = qs("#box-empty");
  const seen = new Set();

  state.boxes.forEach((box, index) => {
    seen.add(box.id);
    let view = boxViews.get(box.id);
    if (!view) {
      view = createBoxView(box);
      boxViews.set(box.id, view);
    }
    updateBoxView(view, box);
    if (list.children[index] !== view.root) {
      list.insertBefore(view.root, list.children[index] ?? null);
    }
  });

  for (const [id, view] of boxViews) {
    if (!seen.has(id)) {
      clearTimeout(view.timer);
      view.root.remove();
      boxViews.delete(id);
    }
  }

  empty.hidden = state.boxes.length > 0;
  renderMeter();
  renderAddButton();
}

function renderAddButton() {
  const space = currentSpace();
  const button = qs("#btn-add-box");
  if (!space) {
    button.disabled = true;
    button.textContent = "박스 추가";
    return;
  }
  const atLimit = Number(space.box_count ?? state.boxes.length) >= Number(space.box_limit ?? 0);
  button.disabled = false;
  button.textContent = atLimit ? "박스가 가득 찼습니다" : "박스 추가";
  button.dataset.state = atLimit ? "limit" : "ready";
}

function createBoxView(box) {
  const nameEl = el("button", {
    class: "box__name",
    type: "button",
    title: "이름 바꾸기",
    onclick: () => renameBox(box.id)
  });

  const badge = el("button", {
    class: "box__badge",
    type: "button",
    hidden: true,
    text: "팀원이 수정함 · 불러오기",
    onclick: () => applyRemote(box.id)
  });

  const textarea = el("textarea", {
    class: "box__text",
    rows: 3,
    spellcheck: false,
    placeholder: "여기에 붙여넣으세요 (Ctrl+V)"
  });

  const statusEl = el("span", { class: "box__status" });
  const sizeEl = el("span", { class: "box__size" });

  const copyButton = el("button", {
    class: "icon-btn icon-btn--copy",
    type: "button",
    text: "복사",
    onclick: () => copyBox(box.id)
  });

  const menuButton = el("button", {
    class: "icon-btn",
    type: "button",
    title: "더보기",
    text: "···",
    onclick: () => openBoxMenu(box.id)
  });

  const root = el("article", { class: "box", dataset: { boxId: box.id } }, [
    el("header", { class: "box__head" }, [
      nameEl,
      el("div", { class: "box__tools" }, [copyButton, menuButton])
    ]),
    textarea,
    badge,
    el("footer", { class: "box__foot" }, [statusEl, sizeEl])
  ]);

  const view = {
    root,
    nameEl,
    textarea,
    statusEl,
    sizeEl,
    badge,
    copyButton,
    timer: null,
    dirty: false,
    saving: false,
    resaveRequested: false,
    savedValue: box.text_content ?? "",
    remote: null,
    box
  };

  textarea.addEventListener("input", () => {
    view.dirty = true;
    updateSizeLabel(view);
    setStatus(view, "저장 대기");
    clearTimeout(view.timer);
    view.timer = setTimeout(() => saveBox(box.id), AUTOSAVE_DELAY_MS);
  });

  textarea.addEventListener("paste", (event) => {
    const pasted = readPastedText(event);
    if (pasted && pasted.kind !== "text") {
      event.preventDefault();
      showToast("지금은 텍스트만 담을 수 있습니다. 파일과 이미지는 다음 단계입니다.", "info");
      return;
    }
    setTimeout(() => {
      clearTimeout(view.timer);
      saveBox(box.id);
    }, 0);
  });

  textarea.addEventListener("blur", () => {
    flushPending(box.id);
  });

  return view;
}

function updateBoxView(view, box) {
  view.box = box;
  const label = box.locked ? `${box.name} · 읽기 전용` : box.name;
  if (view.nameEl.textContent !== label) {
    view.nameEl.textContent = label;
  }
  view.textarea.readOnly = Boolean(box.locked);
  view.root.dataset.locked = box.locked ? "true" : "false";

  const serverValue = box.text_content ?? "";
  const focused = document.activeElement === view.textarea;

  if (serverValue === view.textarea.value) {
    view.savedValue = serverValue;
    view.dirty = false;
    view.remote = null;
    view.badge.hidden = true;
  } else if (view.dirty || focused) {
    if (serverValue !== view.savedValue) {
      view.remote = serverValue;
      view.badge.hidden = false;
    }
  } else {
    view.textarea.value = serverValue;
    view.savedValue = serverValue;
    view.remote = null;
    view.badge.hidden = true;
  }

  updateSizeLabel(view);
  updateFootStatus(view, box);
}

function updateFootStatus(view, box) {
  if (view.dirty) {
    return;
  }
  const who = memberName(box.updated_by);
  const when = box.updated_at ? formatRelativeTime(box.updated_at) : "";
  if (!when) {
    setStatus(view, "비어 있음");
    return;
  }
  setStatus(view, who ? `${when} · ${who}` : when);
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
  view.statusEl.textContent = text;
}

function updateSizeLabel(view) {
  const size = byteLength(view.textarea.value);
  view.sizeEl.textContent = `${formatBytes(size)} / ${formatBytes(TEXT_MAX_BYTES)}`;
  view.sizeEl.dataset.over = size > TEXT_MAX_BYTES ? "true" : "false";
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
    return;
  }
  if (view.saving) {
    view.resaveRequested = true;
    return;
  }

  const value = view.textarea.value;
  if (value === view.savedValue) {
    view.dirty = false;
    updateFootStatus(view, view.box);
    return;
  }

  const check = validateBoxText(value);
  if (!check.ok) {
    setStatus(view, "너무 큽니다");
    showToast(check.message, "error");
    return;
  }

  view.saving = true;
  view.resaveRequested = false;
  let succeeded = false;
  setStatus(view, "저장 중…");
  try {
    const rows = await api.saveBoxText(boxId, value);
    const saved = Array.isArray(rows) ? rows[0] : null;
    view.savedValue = value;
    view.dirty = view.textarea.value !== value;
    view.remote = null;
    view.badge.hidden = true;
    if (saved) {
      const index = state.boxes.findIndex((box) => box.id === boxId);
      if (index !== -1) {
        state.boxes[index] = { ...state.boxes[index], ...saved, text_content: value };
        view.box = state.boxes[index];
      }
    }
    setStatus(view, "저장됨");
    bumpSpaceCounts();
    succeeded = true;
  } catch (error) {
    setStatus(view, "저장 실패");
    reportError(error);
  } finally {
    view.saving = false;
  }

  const wantsResave = view.resaveRequested || view.textarea.value !== view.savedValue;
  view.resaveRequested = false;
  if (succeeded && wantsResave && boxViews.has(boxId)) {
    await runSave(boxId);
  }
}

function applyRemote(boxId) {
  const view = boxViews.get(boxId);
  if (!view || view.remote === null) {
    return;
  }
  view.textarea.value = view.remote;
  view.savedValue = view.remote;
  view.remote = null;
  view.dirty = false;
  view.badge.hidden = true;
  updateSizeLabel(view);
  updateFootStatus(view, view.box);
  showToast("팀원이 저장한 내용을 불러왔습니다.", "success");
}

function copyBox(boxId) {
  const view = boxViews.get(boxId);
  if (!view) {
    return;
  }
  const loader = view.dirty ? () => view.textarea.value : () => api.fetchBoxText(boxId);
  copyTextFrom(loader)
    .then((text) => {
      if (!text) {
        showToast("이 박스는 비어 있습니다.", "info");
        return;
      }
      const busy = view.dirty || view.saving || document.activeElement === view.textarea;
      if (!busy && text !== view.textarea.value) {
        view.textarea.value = text;
        view.savedValue = text;
        updateSizeLabel(view);
      }
      showToast(`복사했습니다 · ${previewText(text, 24)}`, "success");
    })
    .catch((error) => reportError(error));
}

async function renameBox(boxId) {
  const box = state.boxes.find((item) => item.id === boxId);
  if (!box) {
    return;
  }
  const values = await openForm({
    title: "박스 이름 바꾸기",
    fields: [
      {
        name: "name",
        label: "이름표",
        value: box.name,
        maxLength: 40,
        validate: validateBoxName
      }
    ],
    submitLabel: "저장"
  });
  if (!values) {
    return;
  }
  try {
    await api.renameBox(boxId, validateBoxName(values.name).value);
    box.name = validateBoxName(values.name).value;
    renderBoxes();
  } catch (error) {
    reportError(error);
  }
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

  const options = [{ value: "rename", label: "이름 바꾸기" }];
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

  if (choice === "rename") {
    await renameBox(boxId);
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
    view.textarea.value = "";
    view.dirty = true;
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
    await offerUpgrade(UPGRADE_LEVERS.boxLimit, {
      title: "박스를 다 썼습니다",
      message: `이 스페이스는 박스 ${space.box_limit}개까지 쓸 수 있습니다. 더 필요하면 알려 주세요. 지금은 신청만 받아 두고, 수요가 모이면 늘려 드립니다.`
    });
    return;
  }

  const values = await openForm({
    title: "새 박스",
    description: "무엇을 넣어둘 자리인지 이름표를 붙여 주세요.",
    fields: [
      {
        name: "name",
        label: "이름표",
        placeholder: "회사 계좌",
        maxLength: 40,
        validate: validateBoxName
      }
    ],
    submitLabel: "만들기"
  });
  if (!values) {
    return;
  }

  try {
    await api.createBox(space.id, validateBoxName(values.name).value);
    await refreshBoxes();
    showToast("박스를 만들었습니다.", "success");
  } catch (error) {
    reportError(error);
  }
}

async function offerUpgrade(lever, { title, message }) {
  const confirmed = await openConfirm({
    title,
    message,
    confirmLabel: "더 필요해요"
  });
  if (!confirmed) {
    return;
  }
  try {
    await api.logUpgradeIntent(lever, state.spaceId);
    showToast("신청을 남겼습니다. 고맙습니다.", "success");
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
            text: space.join_enabled ? "비밀번호 다시 만들기" : "팀원 초대 열기",
            onclick: async () => {
              close(null);
              await setupInvite(space);
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
      { value: "refresh", label: "새로고침", description: "서버에서 최신 상태를 다시 받아옵니다." },
      { value: "signout", label: "로그아웃", danger: true }
    ]
  });

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

boot().catch((error) => {
  console.error("초기화 실패", error);
  setView("signin");
  showToast(errorMessage(error), "error");
});
