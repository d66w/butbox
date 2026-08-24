import * as api from "../src/api.js";
import { loadSession, signIn } from "../src/auth.js";
import { errorMessage } from "../src/errors.js";
import { writeLocal } from "../src/store.js";

const PENDING_INVITE = "butbox.pendingInvite";

function show(view) {
  for (const section of document.querySelectorAll(".view")) {
    section.hidden = section.dataset.view !== view;
  }
}

function fail(message) {
  document.querySelector("#invite-error").textContent = message;
  show("failed");
}

function token() {
  return new URLSearchParams(window.location.search).get("t") ?? "";
}

async function start() {
  const value = token().trim();
  if (value.length === 0) {
    fail("초대 링크가 올바르지 않습니다.");
    return;
  }

  const session = await loadSession();

  if (session) {
    try {
      await api.redeemInvite(value);
      window.location.replace("app.html");
    } catch (error) {
      fail(errorMessage(error));
    }
    return;
  }

  try {
    const rows = await api.peekInvite(value);
    const info = Array.isArray(rows) ? rows[0] : rows;
    if (!info) {
      fail("초대를 찾을 수 없습니다.");
      return;
    }
    if (info.expired) {
      fail("이 초대 링크는 만료됐습니다. 팀에 새 링크를 요청하세요.");
      return;
    }
    document.querySelector("#invite-space").textContent = `${info.space_name} 팀에 초대받았습니다`;
    document.querySelector("#invite-detail").textContent =
      `현재 ${info.member_count}명이 함께 쓰고 있습니다. 로그인하면 바로 참여됩니다.`;
  } catch (error) {
    document.querySelector("#invite-space").textContent = "팀에 초대받았습니다";
    document.querySelector("#invite-detail").textContent = "로그인하면 참여할 수 있습니다.";
  }

  show("signin");

  document.querySelector("#btn-join").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "이동 중…";
    await writeLocal(PENDING_INVITE, value);
    try {
      await signIn();
    } catch (error) {
      button.disabled = false;
      button.textContent = "Google로 로그인하고 참여";
      fail(errorMessage(error));
    }
  });
}

start().catch((error) => fail(errorMessage(error)));
