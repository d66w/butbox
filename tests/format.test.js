import assert from "node:assert/strict";
import test from "node:test";

import {
  byteLength,
  formatBytes,
  formatRelativeTime,
  generatePassword,
  isValidSpaceCode,
  normalizeSpaceCode,
  previewText,
  usageRatio,
  validateBoxName,
  validateBoxText,
  validatePassword,
  validateSpaceCodeInput,
  validateSpaceName
} from "../src/format.js";
import { TEXT_MAX_BYTES } from "../src/constants.js";

test("byteLength counts utf-8 bytes, not characters", () => {
  assert.equal(byteLength(""), 0);
  assert.equal(byteLength("abc"), 3);
  assert.equal(byteLength("가나다"), 9);
  assert.equal(byteLength(null), 0);
});

test("formatBytes stays short at every scale", () => {
  assert.equal(formatBytes(0), "0B");
  assert.equal(formatBytes(512), "512B");
  assert.equal(formatBytes(1536), "1.5KB");
  assert.equal(formatBytes(10240), "10KB");
  assert.equal(formatBytes(52428800), "50MB");
  assert.equal(formatBytes(1073741824), "1.0GB");
});

test("formatRelativeTime reports korean relative labels", () => {
  const now = Date.parse("2026-08-23T12:00:00.000Z");
  assert.equal(formatRelativeTime("2026-08-23T11:59:57.000Z", now), "방금");
  assert.equal(formatRelativeTime("2026-08-23T11:59:20.000Z", now), "40초 전");
  assert.equal(formatRelativeTime("2026-08-23T11:30:00.000Z", now), "30분 전");
  assert.equal(formatRelativeTime("2026-08-23T09:00:00.000Z", now), "3시간 전");
  assert.equal(formatRelativeTime("2026-08-21T12:00:00.000Z", now), "2일 전");
  assert.equal(formatRelativeTime("nope", now), "");
});

test("space codes normalize to the shareable shape", () => {
  assert.equal(normalizeSpaceCode(" abcd-2345 "), "ABCD-2345");
  assert.equal(normalizeSpaceCode("ab_cd!!2345"), "ABCD2345");
  assert.equal(normalizeSpaceCode("ab--cd"), "AB-CD");
  assert.ok(isValidSpaceCode("ABCD-2345"));
  assert.ok(!isValidSpaceCode("AB"));
  assert.ok(!isValidSpaceCode("-ABCD"));
  assert.ok(!isValidSpaceCode("abcd-2345"));
});

test("generated passwords avoid look-alike characters", () => {
  for (let index = 0; index < 50; index += 1) {
    const password = generatePassword();
    assert.equal(password.length, 10);
    assert.match(password, /^[a-hj-np-z2-9]{10}$/);
  }
});

test("box text validation uses the 10KB byte budget", () => {
  assert.equal(validateBoxText("가".repeat(100)).ok, true);
  assert.equal(validateBoxText("a".repeat(TEXT_MAX_BYTES)).ok, true);
  const tooBig = validateBoxText("a".repeat(TEXT_MAX_BYTES + 1));
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.message, /10KB/);
  assert.match(tooBig.message, /1B 줄여/, "한도와 현재값이 같은 문자열로 반올림되면 이유를 알 수 없습니다.");
  assert.match(
    validateBoxText("a".repeat(TEXT_MAX_BYTES + 760)).message,
    /760B 줄여/
  );
  assert.equal(validateBoxText("가".repeat(3414)).ok, false);
});

test("name validation trims and bounds", () => {
  assert.deepEqual(validateBoxName("  회사 계좌  "), { ok: true, value: "회사 계좌" });
  assert.equal(validateBoxName("   ").ok, false);
  assert.equal(validateBoxName("가".repeat(41)).ok, false);
  assert.deepEqual(validateSpaceName(" 고객센터 "), { ok: true, value: "고객센터" });
  assert.equal(validateSpaceName("").ok, false);
});

test("code and password inputs report their own reason", () => {
  assert.equal(validateSpaceCodeInput("ab").ok, false);
  assert.deepEqual(validateSpaceCodeInput("abcd2345"), { ok: true, value: "ABCD2345" });
  assert.equal(validatePassword("12345").ok, false);
  assert.deepEqual(validatePassword("123456"), { ok: true, value: "123456" });
});

test("previewText collapses whitespace and clips", () => {
  assert.equal(previewText("  하나   둘\n셋 "), "하나 둘 셋");
  assert.equal(previewText("abcdef", 3), "abc…");
  assert.equal(previewText(null), "");
});

test("usageRatio clamps between zero and one", () => {
  assert.equal(usageRatio(0, 100), 0);
  assert.equal(usageRatio(50, 100), 0.5);
  assert.equal(usageRatio(200, 100), 1);
  assert.equal(usageRatio(10, 0), 0);
});
