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
