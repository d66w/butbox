import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedEvent, isSafeKey, sanitize, TRACKED_EVENTS } from "../src/features/analytics.js";

test("only the documented events are ever sent", () => {
  const documented = [
    "signup", "box_created", "box_copied", "search_used",
    "favorite_used", "space_created", "space_joined", "upgrade_clicked",
    "upgrade_started", "subscription_active", "template_filled",
    "box_duplicated", "context_saved", "invite_created"
  ];
  assert.deepEqual([...TRACKED_EVENTS].sort(), [...documented].sort());
  for (const event of documented) {
    assert.equal(isAllowedEvent(event), true, `${event}가 허용 목록에 없습니다.`);
  }
});

test("undocumented events are refused", () => {
  for (const event of ["box_read", "keystroke", "page_view", "", "drop table"]) {
    assert.equal(isAllowedEvent(event), false);
  }
});

test("box content can never reach analytics", () => {
  const leaky = {
    text: "국민은행 123456-01-789012 예금주 (주)한빛상사",
    text_content: "고객 개인정보가 담긴 문구",
    content: "환불 안내 전문",
    name: "회사 계좌",
    query: "환불",
    email: "simh2719@example.com",
    box_id: "11111111-1111-4111-8111-111111111111",
    url: "https://example.com/private"
  };
  assert.deepEqual(sanitize(leaky), {});
  for (const key of Object.keys(leaky)) {
    assert.equal(isSafeKey(key), false, `${key}는 안전 키가 아니어야 합니다.`);
  }
});

test("only the safe metadata keys survive", () => {
  const props = { surface: "extension", lever: "box_limit", count: 3, mode: "recent", secret: "x" };
  assert.deepEqual(sanitize(props), {
    surface: "extension",
    lever: "box_limit",
    count: 3,
    mode: "recent"
  });
});

test("long strings are dropped so nothing large can leak through a safe key", () => {
  assert.deepEqual(sanitize({ surface: "a".repeat(33) }), {});
  assert.deepEqual(sanitize({ surface: "a".repeat(32) }), { surface: "a".repeat(32) });
});

test("non finite numbers and objects are dropped", () => {
  assert.deepEqual(sanitize({ count: Number.NaN }), {});
  assert.deepEqual(sanitize({ count: Infinity }), {});
  assert.deepEqual(sanitize({ surface: { nested: "object" } }), {});
  assert.deepEqual(sanitize({ surface: ["array"] }), {});
});

test("sanitize tolerates null and undefined props", () => {
  assert.deepEqual(sanitize(null), {});
  assert.deepEqual(sanitize(undefined), {});
});

test("booleans on safe keys are kept", () => {
  assert.deepEqual(sanitize({ mode: true }), { mode: true });
});
