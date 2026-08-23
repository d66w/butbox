import { CONFIG } from "../config.js";
import { forceRefresh, getAccessToken } from "./auth.js";
import { AppError } from "./errors.js";

async function send(path, options, token) {
  const headers = {
    apikey: CONFIG.supabaseAnonKey,
    "Content-Type": "application/json",
    ...options.headers
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    return await fetch(`${CONFIG.supabaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch (error) {
    throw new AppError("NETWORK", undefined, error);
  }
}

async function parse(response) {
  if (response.status === 204 || response.status === 205) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(path, options = {}) {
  let token = await getAccessToken();
  if (!token) {
    throw new AppError("SESSION_EXPIRED");
  }

  let response = await send(path, options, token);
  if (response.status === 401) {
    token = await forceRefresh();
    response = await send(path, options, token);
  }

  const payload = await parse(response);
  if (!response.ok) {
    const message =
      (payload && (payload.message || payload.error_description || payload.error)) ||
      `요청이 실패했습니다. (${response.status})`;
    throw new AppError(response.status === 401 ? "SESSION_EXPIRED" : "REQUEST_FAILED", message);
  }
  return payload;
}

function rpc(name, args = {}) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body: args });
}

function query(table, search) {
  return request(`/rest/v1/${table}?${search}`);
}

export function fetchPlans() {
  return query("plans", "select=*&order=sort_order.asc");
}

export function fetchProfile() {
  return rpc("current_profile");
}

export function fetchSpaces() {
  return query("space_summaries", "select=*&order=joined_at.asc");
}

export function fetchMembers(spaceId) {
  return query(
    "space_member_list",
    `select=*&space_id=eq.${encodeURIComponent(spaceId)}&order=joined_at.asc`
  );
}

export function fetchBoxes(spaceId) {
  return query(
    "boxes",
    `select=id,space_id,name,kind,text_content,byte_size,locked,sort_order,updated_at,updated_by&space_id=eq.${encodeURIComponent(
      spaceId
    )}&order=sort_order.asc,created_at.asc`
  );
}

export async function fetchBoxText(boxId) {
  const rows = await query("boxes", `select=text_content&id=eq.${encodeURIComponent(boxId)}&limit=1`);
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }
  return rows[0].text_content ?? "";
}

export function ensurePersonalSpace() {
  return rpc("ensure_personal_space");
}

export function createSpace(name) {
  return rpc("create_space", { p_name: name });
}

export function renameSpace(spaceId, name) {
  return rpc("rename_space", { p_space_id: spaceId, p_name: name });
}

export function setSpaceCode(spaceId, code) {
  return rpc("set_space_code", { p_space_id: spaceId, p_code: code });
}

export function setSpacePassword(spaceId, password) {
  return rpc("set_space_password", { p_space_id: spaceId, p_password: password });
}

export function clearSpacePassword(spaceId) {
  return rpc("clear_space_password", { p_space_id: spaceId });
}

export function joinSpace(code, password) {
  return rpc("join_space", { p_code: code, p_password: password });
}

export function leaveSpace(spaceId) {
  return rpc("leave_space", { p_space_id: spaceId });
}

export function removeMember(spaceId, userId) {
  return rpc("remove_space_member", { p_space_id: spaceId, p_user_id: userId });
}

export function deleteSpace(spaceId) {
  return rpc("delete_space", { p_space_id: spaceId });
}

export function createBox(spaceId, name) {
  return rpc("create_box", { p_space_id: spaceId, p_name: name });
}

export function reorderBoxes(spaceId, boxIds) {
  return rpc("reorder_boxes", { p_space_id: spaceId, p_box_ids: boxIds });
}

export function logUpgradeIntent(lever, spaceId) {
  return rpc("log_upgrade_intent", { p_lever: lever, p_space_id: spaceId ?? null });
}

export function renameBox(boxId, name) {
  return request(`/rest/v1/boxes?id=eq.${encodeURIComponent(boxId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: { name }
  });
}

export function saveBoxText(boxId, text) {
  return request(`/rest/v1/boxes?id=eq.${encodeURIComponent(boxId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: { text_content: text }
  });
}

export function deleteBox(boxId) {
  return request(`/rest/v1/boxes?id=eq.${encodeURIComponent(boxId)}`, { method: "DELETE" });
}
