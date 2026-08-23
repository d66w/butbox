import { CONFIG } from "../config.js";
import { STORAGE_KEYS, TOKEN_REFRESH_MARGIN_S } from "./constants.js";
import { AppError } from "./errors.js";
import { readLocal, removeLocal, writeLocal } from "./store.js";

let cachedSession = null;
let refreshPromise = null;
const listeners = new Set();

export function isConfigured() {
  const url = String(CONFIG.supabaseUrl ?? "");
  const key = String(CONFIG.supabaseAnonKey ?? "");
  return (
    url.startsWith("https://") &&
    !url.includes("YOUR_PROJECT_REF") &&
    key.length > 20 &&
    !key.includes("YOUR_SUPABASE_ANON_KEY")
  );
}

function isExtensionContext() {
  return typeof chrome !== "undefined" && !!chrome.identity && typeof chrome.identity.launchWebAuthFlow === "function";
}

export function redirectUrl() {
  if (isExtensionContext()) {
    return chrome.identity.getRedirectURL("supabase-auth");
  }
  return `${window.location.origin}/auth/callback.html`;
}

export function onSessionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(session) {
  for (const listener of listeners) {
    try {
      listener(session);
    } catch (error) {
      console.error("세션 리스너 오류", error);
    }
  }
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createVerifier() {
  return base64Url(crypto.getRandomValues(new Uint8Array(48)));
}

async function createChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function normalizeSession(payload) {
  if (!payload || !payload.access_token) {
    throw new AppError("SESSION_EXPIRED");
  }
  const expiresAt = Number(payload.expires_at) ||
    Math.floor(Date.now() / 1000) + Number(payload.expires_in ?? 3600);
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt,
    user: payload.user ?? null
  };
}

async function persist(session) {
  cachedSession = session;
  if (session) {
    await writeLocal(STORAGE_KEYS.session, session);
  } else {
    await removeLocal(STORAGE_KEYS.session);
  }
  emit(session);
}

export async function loadSession() {
  if (cachedSession) {
    return cachedSession;
  }
  const stored = await readLocal(STORAGE_KEYS.session);
  if (stored && stored.accessToken) {
    cachedSession = stored;
  }
  return cachedSession;
}

async function authFetch(path, body) {
  let response;
  try {
    response = await fetch(`${CONFIG.supabaseUrl}${path}`, {
      method: "POST",
      headers: {
        apikey: CONFIG.supabaseAnonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw new AppError("NETWORK", undefined, error);
  }
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const detail = payload.error_description || payload.msg || payload.message || response.statusText;
    throw new AppError("SESSION_EXPIRED", `로그인 처리에 실패했습니다. (${detail})`);
  }
  return payload;
}

async function exchangeAuthResult(resultUrl, verifier) {
  const url = new URL(resultUrl);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const query = url.searchParams;
  const failure =
    query.get("error_description") ||
    hash.get("error_description") ||
    query.get("error") ||
    hash.get("error");
  if (failure) {
    throw new AppError("NOT_AUTHENTICATED", `로그인이 거부됐습니다. (${failure})`);
  }

  const code = query.get("code") || hash.get("code");
  if (code) {
    if (!verifier) {
      throw new AppError("NOT_AUTHENTICATED", "로그인 요청 정보를 찾을 수 없습니다. 다시 시도해 주세요.");
    }
    return authFetch("/auth/v1/token?grant_type=pkce", {
      auth_code: code,
      code_verifier: verifier
    });
  }
  if (hash.get("access_token")) {
    return Object.fromEntries(hash.entries());
  }
  throw new AppError("NOT_AUTHENTICATED", "인증 응답에 토큰이 없습니다.");
}

function authorizeUrl(challenge) {
  const params = new URLSearchParams({
    provider: "google",
    redirect_to: redirectUrl(),
    code_challenge: challenge,
    code_challenge_method: "s256"
  });
  return `${CONFIG.supabaseUrl}/auth/v1/authorize?${params.toString()}`;
}

async function signInViaExtensionPopup() {
  const verifier = createVerifier();
  const challenge = await createChallenge(verifier);
  await writeLocal(STORAGE_KEYS.pkceVerifier, verifier);

  let resultUrl;
  try {
    resultUrl = await chrome.identity.launchWebAuthFlow({
      url: authorizeUrl(challenge),
      interactive: true
    });
  } catch (error) {
    await removeLocal(STORAGE_KEYS.pkceVerifier);
    const reason = String(error?.message ?? error);
    if (reason.includes("canceled") || reason.includes("closed")) {
      throw new AppError("NOT_AUTHENTICATED", "로그인을 취소했습니다.");
    }
    throw new AppError("NOT_AUTHENTICATED", `로그인 창을 열지 못했습니다. (${reason})`, error);
  }

  if (!resultUrl) {
    await removeLocal(STORAGE_KEYS.pkceVerifier);
    throw new AppError("NOT_AUTHENTICATED", "로그인이 완료되지 않았습니다.");
  }

  let payload;
  try {
    payload = await exchangeAuthResult(resultUrl, verifier);
  } finally {
    await removeLocal(STORAGE_KEYS.pkceVerifier);
  }

  const session = normalizeSession(payload);
  await persist(session);
  return session;
}

async function beginWebRedirect() {
  const verifier = createVerifier();
  const challenge = await createChallenge(verifier);
  await writeLocal(STORAGE_KEYS.pkceVerifier, verifier);
  window.location.assign(authorizeUrl(challenge));
  return null;
}

export async function signIn() {
  if (!isConfigured()) {
    throw new AppError("NOT_AUTHENTICATED", "config.js에 Supabase 주소와 anon key를 먼저 입력하세요.");
  }
  if (isExtensionContext()) {
    return signInViaExtensionPopup();
  }
  return beginWebRedirect();
}

export async function completeWebSignIn() {
  const verifier = await readLocal(STORAGE_KEYS.pkceVerifier);
  let payload;
  try {
    payload = await exchangeAuthResult(window.location.href, verifier);
  } finally {
    await removeLocal(STORAGE_KEYS.pkceVerifier);
  }
  const session = normalizeSession(payload);
  await persist(session);
  return session;
}

async function refreshSession(session) {
  if (!session?.refreshToken) {
    await persist(null);
    throw new AppError("SESSION_EXPIRED");
  }
  if (!refreshPromise) {
    refreshPromise = authFetch("/auth/v1/token?grant_type=refresh_token", {
      refresh_token: session.refreshToken
    })
      .then(async (payload) => {
        const next = normalizeSession(payload);
        await persist(next);
        return next;
      })
      .catch(async (error) => {
        await persist(null);
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function getAccessToken() {
  const session = await loadSession();
  if (!session) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (session.expiresAt - TOKEN_REFRESH_MARGIN_S > now) {
    return session.accessToken;
  }
  const refreshed = await refreshSession(session);
  return refreshed.accessToken;
}

export async function forceRefresh() {
  const session = await loadSession();
  if (!session) {
    throw new AppError("SESSION_EXPIRED");
  }
  const refreshed = await refreshSession(session);
  return refreshed.accessToken;
}

export async function signOut() {
  const session = await loadSession();
  if (session?.accessToken) {
    try {
      await fetch(`${CONFIG.supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: CONFIG.supabaseAnonKey,
          Authorization: `Bearer ${session.accessToken}`
        }
      });
    } catch (error) {
      console.warn("로그아웃 요청 실패", error);
    }
  }
  await persist(null);
}

export async function clearSession() {
  await persist(null);
}
