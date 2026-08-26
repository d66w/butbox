import assert from "node:assert/strict";
import test from "node:test";

import { AppError, errorMessage, isAuthError } from "../src/errors.js";

test("database exception codes become sentences a user can act on", () => {
  const cases = [
    ["BOX_LIMIT_REACHED", /한도/],
    ["SPACE_LIMIT_REACHED", /스페이스/],
    ["WRONG_PASSWORD", /비밀번호/],
    ["SPACE_NOT_FOUND", /스페이스가 없/],
    ["JOIN_DISABLED", /참여를 받지 않/],
    ["OWNER_CANNOT_LEAVE", /나갈 수 없/],
    ["BOX_LOCKED", /읽기 전용/],
    ["NOT_SPACE_MEMBER", /멤버가 아/]
  ];
  for (const [code, pattern] of cases) {
    const message = errorMessage(new Error(`db error: ${code}`));
    assert.match(message, pattern, `${code} 메시지가 이해 가능해야 합니다.`);
    assert.ok(!message.includes(code), `${code} 원문 코드가 사용자에게 노출되면 안 됩니다.`);
  }
});

test("network failures are explained, not shown as raw fetch errors", () => {
  assert.match(errorMessage(new Error("Failed to fetch")), /네트워크/);
  assert.match(errorMessage(new Error("NetworkError when attempting")), /네트워크/);
});

test("clipboard failures tell the user what to do next", () => {
  const message = errorMessage(new Error("Document is not focused."));
  assert.match(message, /클립보드/);
  assert.match(message, /클릭/);
});

test("an unknown error still yields something rather than undefined", () => {
  assert.equal(typeof errorMessage(new Error("무언가 잘못됨")), "string");
  assert.ok(errorMessage(null).length > 0);
  assert.ok(errorMessage(undefined).length > 0);
});

test("auth errors are recognised so the app can send the user back to sign in", () => {
  assert.equal(isAuthError(new AppError("SESSION_EXPIRED")), true);
  assert.equal(isAuthError(new AppError("NOT_AUTHENTICATED")), true);
  assert.equal(isAuthError(new Error("db error: SESSION_EXPIRED")), true);
  assert.equal(isAuthError(new AppError("BOX_LIMIT_REACHED")), false);
  assert.equal(isAuthError(new Error("Failed to fetch")), false);
  assert.equal(isAuthError(null), false);
});

test("AppError keeps its code and a readable message", () => {
  const error = new AppError("BOX_LIMIT_REACHED");
  assert.equal(error.code, "BOX_LIMIT_REACHED");
  assert.match(error.message, /한도/);
  assert.equal(errorMessage(error), error.message);
});

test("a custom message overrides the default for that code", () => {
  const error = new AppError("NOT_AUTHENTICATED", "로그인을 취소했습니다.");
  assert.equal(errorMessage(error), "로그인을 취소했습니다.");
});

test("a REQUEST_FAILED wrapper does not leak the raw database code", () => {
  const cases = [
    ["BOX_LIMIT_REACHED", /한도/],
    ["SPACE_LIMIT_REACHED", /스페이스/],
    ["WRONG_PASSWORD", /비밀번호/],
    ["JOIN_DISABLED", /참여를 받지 않/],
    ["BOX_LOCKED", /읽기 전용/],
    ["NOT_SPACE_MEMBER", /멤버가 아/],
    ["NOT_SPACE_OWNER", /만든 사람만/],
    ["NOT_SPACE_ADMIN", /관리할 수 있는/],
    ["SPACE_CODE_TAKEN", /이미 쓰이고/],
    ["INVITE_NOT_FOUND", /찾을 수 없/],
    ["INVITE_EXPIRED", /만료/],
    ["INVITE_EXHAUSTED", /사용 횟수/],
    ["CANNOT_CHANGE_OWNER_ROLE", /만든 사람의 권한/],
    ["CANNOT_CHANGE_OWN_ROLE", /자기 권한/],
    ["SPACE_QUOTA_EXCEEDED", /용량/]
  ];
  for (const [code, pattern] of cases) {
    const message = errorMessage(new AppError("REQUEST_FAILED", code));
    assert.match(message, pattern, `${code} 메시지가 이해 가능해야 합니다.`);
    assert.ok(!message.includes(code), `${code} 원문 코드가 사용자에게 노출되면 안 됩니다.`);
  }
});

test("raw postgres text is replaced with a sentence instead of shown", () => {
  const raw = 'new row for relation "boxes" violates check constraint "boxes_text_size"';
  const message = errorMessage(new AppError("REQUEST_FAILED", raw));
  assert.ok(!message.includes("boxes_text_size"));
  assert.ok(!message.includes("violates"));
  assert.match(message, /[가-힣]/);
});

test("an english-only server message never reaches the user untranslated", () => {
  for (const raw of ["permission denied for table boxes", "PGRST301", "duplicate key value"]) {
    const message = errorMessage(new AppError("REQUEST_FAILED", raw));
    assert.ok(!message.includes(raw), `${raw}가 그대로 노출되면 안 됩니다.`);
    assert.match(message, /[가-힣]/);
  }
});

test("the raw code stays on the error so callers can branch on it", () => {
  const error = new AppError("REQUEST_FAILED", "BOX_LIMIT_REACHED");
  assert.ok(String(error.message).includes("BOX_LIMIT_REACHED"));
  assert.notEqual(errorMessage(error), error.message);
});
