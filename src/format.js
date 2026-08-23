import {
  BOX_NAME_MAX,
  SPACE_CODE_MAX,
  SPACE_CODE_MIN,
  SPACE_NAME_MAX,
  SPACE_PASSWORD_MIN,
  TEXT_MAX_BYTES
} from "./constants.js";

const encoder = new TextEncoder();
const SPACE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{3,23}$/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function byteLength(text) {
  if (typeof text !== "string" || text.length === 0) {
    return 0;
  }
  return encoder.encode(text).length;
}

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) {
    return "0B";
  }
  if (value < 1024) {
    return `${Math.round(value)}B`;
  }
  if (value < 1024 * 1024) {
    const kb = value / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    const mb = value / (1024 * 1024);
    return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
  }
  const gb = value / (1024 * 1024 * 1024);
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)}GB`;
}

export function formatRelativeTime(isoString, now = Date.now()) {
  const target = Date.parse(isoString);
  if (!Number.isFinite(target)) {
    return "";
  }
  const seconds = Math.round((now - target) / 1000);
  if (seconds < 10) {
    return "방금";
  }
  if (seconds < 60) {
    return `${seconds}초 전`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}분 전`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}시간 전`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}일 전`;
  }
  const date = new Date(target);
  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

export function normalizeSpaceCode(raw) {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, SPACE_CODE_MAX);
}

export function isValidSpaceCode(code) {
  return SPACE_CODE_PATTERN.test(String(code ?? ""));
}

export function generatePassword(randomInt = defaultRandomInt) {
  let value = "";
  for (let index = 0; index < 10; index += 1) {
    value += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return value.toLowerCase();
}

function defaultRandomInt(max) {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % max;
}

export function validateSpaceName(name) {
  const trimmed = String(name ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "스페이스 이름을 입력하세요." };
  }
  if (trimmed.length > SPACE_NAME_MAX) {
    return { ok: false, message: `스페이스 이름은 ${SPACE_NAME_MAX}자까지 가능합니다.` };
  }
  return { ok: true, value: trimmed };
}

export function validateBoxName(name) {
  const trimmed = String(name ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, message: "박스 이름을 입력하세요." };
  }
  if (trimmed.length > BOX_NAME_MAX) {
    return { ok: false, message: `박스 이름은 ${BOX_NAME_MAX}자까지 가능합니다.` };
  }
  return { ok: true, value: trimmed };
}

export function validateSpaceCodeInput(code) {
  const normalized = normalizeSpaceCode(code);
  if (normalized.length < SPACE_CODE_MIN) {
    return { ok: false, message: `코드는 ${SPACE_CODE_MIN}자 이상이어야 합니다.` };
  }
  if (!isValidSpaceCode(normalized)) {
    return { ok: false, message: "코드는 영문 대문자, 숫자, 하이픈만 쓸 수 있습니다." };
  }
  return { ok: true, value: normalized };
}

export function validatePassword(password) {
  const value = String(password ?? "");
  if (value.length < SPACE_PASSWORD_MIN) {
    return { ok: false, message: `비밀번호는 ${SPACE_PASSWORD_MIN}자 이상이어야 합니다.` };
  }
  return { ok: true, value };
}

export function validateBoxText(text) {
  const size = byteLength(text);
  if (size > TEXT_MAX_BYTES) {
    return {
      ok: false,
      size,
      message: `한 박스에는 ${formatBytes(TEXT_MAX_BYTES)}까지 담을 수 있습니다. 지금 ${formatBytes(size)}입니다.`
    };
  }
  return { ok: true, size };
}

export function previewText(text, limit = 60) {
  const collapsed = String(text ?? "").replace(/\s+/g, " ").trim();
  if (collapsed.length <= limit) {
    return collapsed;
  }
  return `${collapsed.slice(0, limit)}…`;
}

export function usageRatio(used, quota) {
  const usedValue = Number(used) || 0;
  const quotaValue = Number(quota) || 0;
  if (quotaValue <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, usedValue / quotaValue));
}
