import assert from "node:assert/strict";
import test from "node:test";
import { authFlowError } from "../src/auth.js";

test("auth flow maps a failed authorization page to redirect setup", () => {
  const error = authFlowError(new Error("Authorization page could not be loaded."));
  assert.equal(error.code, "AUTH_REDIRECT_MISCONFIGURED");
});

test("auth flow keeps user cancellation separate from setup errors", () => {
  const error = authFlowError(new Error("The user closed the window."));
  assert.equal(error.code, "NOT_AUTHENTICATED");
  assert.equal(error.message, "로그인을 취소했습니다.");
});
