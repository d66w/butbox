import assert from "node:assert/strict";
import test from "node:test";

import {
  builtinValue,
  extractVariables,
  fillTemplate,
  hasVariables,
  promptableVariables
} from "../src/features/templates.js";
import { SORT_MODES, reorderIds, sortBoxes } from "../src/features/sorting.js";

const sample = "안녕하세요 {{고객명}}님.\n주문번호 {{주문번호}}의 환불 요청이 접수되었습니다.";

test("extractVariables finds each placeholder once, in order", () => {
  assert.deepEqual(extractVariables(sample), ["고객명", "주문번호"]);
  assert.deepEqual(extractVariables("{{a}} {{a}} {{b}}"), ["a", "b"]);
  assert.deepEqual(extractVariables("no variables here"), []);
});

test("extractVariables tolerates inner spacing", () => {
  assert.deepEqual(extractVariables("{{ 고객명 }}"), ["고객명"]);
});

test("hasVariables reports template boxes", () => {
  assert.equal(hasVariables(sample), true);
  assert.equal(hasVariables("plain text"), false);
  assert.equal(hasVariables(null), false);
});

test("fillTemplate substitutes provided values", () => {
  const filled = fillTemplate(sample, { 고객명: "김민수", 주문번호: "A-1024" });
  assert.ok(filled.includes("안녕하세요 김민수님."));
  assert.ok(filled.includes("주문번호 A-1024의"));
  assert.ok(!filled.includes("{{"));
});

test("fillTemplate leaves unknown placeholders untouched", () => {
  assert.equal(fillTemplate("{{알수없음}}", {}), "{{알수없음}}");
});

test("fillTemplate treats missing values as empty strings", () => {
  assert.equal(fillTemplate("[{{x}}]", { x: null }), "[]");
  assert.equal(fillTemplate("[{{x}}]", { x: "" }), "[]");
});

test("builtin date variables resolve without asking the user", () => {
  assert.match(builtinValue("오늘"), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(builtinValue("지금"), /^\d{2}:\d{2}$/);
  assert.equal(builtinValue("고객명"), null);
  assert.deepEqual(promptableVariables("{{오늘}} {{고객명}}"), ["고객명"]);
  assert.equal(fillTemplate("{{오늘}}", {}).includes("{{"), false);
});

const boxes = [
  { id: "a", name: "나중", sort_order: 2, is_favorite: false, last_used_at: "2026-08-20T00:00:00Z" },
  { id: "b", name: "가장먼저", sort_order: 0, is_favorite: false, last_used_at: null },
  { id: "c", name: "즐겨찾기", sort_order: 3, is_favorite: true, last_used_at: "2026-08-01T00:00:00Z" },
  { id: "d", name: "다음", sort_order: 1, is_favorite: false, last_used_at: "2026-08-24T00:00:00Z" }
];

test("manual sort keeps user order with favorites pinned first", () => {
  assert.deepEqual(sortBoxes(boxes, SORT_MODES.manual).map((b) => b.id), ["c", "b", "d", "a"]);
});

test("manual sort can ignore favorites when asked", () => {
  assert.deepEqual(sortBoxes(boxes, SORT_MODES.manual, false).map((b) => b.id), ["b", "d", "a", "c"]);
});

test("recent sort ranks by last use, never-used last", () => {
  assert.deepEqual(sortBoxes(boxes, SORT_MODES.recent, false).map((b) => b.id), ["d", "a", "c", "b"]);
});

test("name sort uses korean collation", () => {
  assert.deepEqual(sortBoxes(boxes, SORT_MODES.name, false).map((b) => b.id), ["b", "a", "d", "c"]);
});

test("sortBoxes does not mutate its input", () => {
  const before = boxes.map((b) => b.id);
  sortBoxes(boxes, SORT_MODES.recent);
  assert.deepEqual(boxes.map((b) => b.id), before);
});

test("reorderIds drops the moved box into the target slot", () => {
  assert.deepEqual(reorderIds(boxes, "a", "b"), ["b", "a", "c", "d"]);
  assert.deepEqual(reorderIds(boxes, "b", "d"), ["a", "c", "d", "b"]);
  assert.deepEqual(reorderIds(boxes, "d", "a"), ["d", "a", "b", "c"]);
  assert.equal(reorderIds(boxes, "a", "a"), null);
  assert.equal(reorderIds(boxes, "zzz", "b"), null);
});
