import * as api from "../api.js";

const ALLOWED = new Set([
  "signup",
  "box_created",
  "box_copied",
  "box_inserted",
  "search_used",
  "favorite_used",
  "space_created",
  "space_joined",
  "upgrade_clicked",
  "upgrade_started",
  "subscription_active",
  "template_filled",
  "box_duplicated",
  "context_saved",
  "invite_created"
]);

const SAFE_KEYS = new Set(["surface", "lever", "plan", "count", "role", "mode", "reason"]);

let lastSearchAt = 0;

function sanitize(props) {
  const out = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    if (!SAFE_KEYS.has(key)) {
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "string" && value.length <= 32) {
      out[key] = value;
    }
  }
  return out;
}

export function track(event, props) {
  if (!ALLOWED.has(event)) {
    return;
  }
  if (event === "search_used") {
    const now = Date.now();
    if (now - lastSearchAt < 60000) {
      return;
    }
    lastSearchAt = now;
  }
  api.logEvent(event, sanitize(props)).catch(() => {});
}

export const TRACKED_EVENTS = [...ALLOWED];
