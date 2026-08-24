import assert from "node:assert/strict";
import test from "node:test";

import {
  chosung,
  collectTags,
  compact,
  isChosungQuery,
  normalize,
  parseQuery,
  scoreBox,
  searchBoxes
} from "../src/features/search.js";

const boxes = [
  { id: "1", name: "환불 안내", text_content: "환불은 7일 이내 가능합니다.", tags: ["CS", "환불"], sort_order: 0 },
  { id: "2", name: "회사 계좌", text_content: "국민은행 123456-01-789012", tags: ["경리"], sort_order: 1 },
  { id: "3", name: "배송 안내", text_content: "택배는 보통 2일 걸립니다.", tags: ["CS", "배송"], sort_order: 2 },
  { id: "4", name: "Meeting Link", text_content: "https://meet.example.com/team", tags: [], sort_order: 3 }
];

test("normalize collapses whitespace and lowercases", () => {
  assert.equal(normalize("  Hello   World  "), "hello world");
  assert.equal(normalize("환불   안내"), "환불 안내");
  assert.equal(normalize(null), "");
});

test("compact removes every space so spacing differences stop mattering", () => {
  assert.equal(compact("환불 안내"), "환불안내");
  assert.equal(compact("환 불 안 내"), "환불안내");
});

test("chosung extracts korean initial consonants", () => {
  assert.equal(chosung("환불 안내"), "ㅎㅂㅇㄴ");
  assert.equal(chosung("회사 계좌"), "ㅎㅅㄱㅈ");
  assert.equal(chosung("Meeting"), "meeting");
});

test("isChosungQuery only accepts pure consonant queries", () => {
  assert.equal(isChosungQuery("ㅎㅂ"), true);
  assert.equal(isChosungQuery("ㅎㅂㅇㄴ"), true);
  assert.equal(isChosungQuery("환불"), false);
  assert.equal(isChosungQuery("cs"), false);
  assert.equal(isChosungQuery(""), false);
});

test("parseQuery separates #tag tokens from words", () => {
  assert.deepEqual(parseQuery("#cs 환불"), { text: "환불", tags: ["cs"] });
  assert.deepEqual(parseQuery("환불"), { text: "환불", tags: [] });
  assert.deepEqual(parseQuery("#cs #배송"), { text: "", tags: ["cs", "배송"] });
});

test("name matches outrank content matches", () => {
  const nameHit = scoreBox(boxes[0], "환불");
  const contentHit = scoreBox(boxes[2], "택배");
  assert.ok(nameHit > contentHit);
});

test("search finds boxes by name ignoring spacing", () => {
  assert.deepEqual(searchBoxes(boxes, "환불안내").map((b) => b.id), ["1"]);
  assert.deepEqual(searchBoxes(boxes, "환 불").map((b) => b.id), ["1"]);
});

test("search finds boxes by korean initial consonants", () => {
  assert.deepEqual(searchBoxes(boxes, "ㅎㅂ").map((b) => b.id), ["1"]);
  assert.deepEqual(searchBoxes(boxes, "ㅂㅅ").map((b) => b.id), ["3"]);
});

test("search finds boxes by content and by tag", () => {
  assert.deepEqual(searchBoxes(boxes, "국민은행").map((b) => b.id), ["2"]);
  assert.deepEqual(searchBoxes(boxes, "#cs").map((b) => b.id), ["1", "3"]);
});

test("tag filter combines with text", () => {
  assert.deepEqual(searchBoxes(boxes, "#cs 배송").map((b) => b.id), ["3"]);
  assert.deepEqual(searchBoxes(boxes, "#경리 배송").map((b) => b.id), []);
});

test("search is case insensitive for latin text", () => {
  assert.deepEqual(searchBoxes(boxes, "meeting").map((b) => b.id), ["4"]);
  assert.deepEqual(searchBoxes(boxes, "MEETING").map((b) => b.id), ["4"]);
});

test("empty query returns every box unchanged", () => {
  assert.equal(searchBoxes(boxes, "").length, 4);
  assert.equal(searchBoxes(boxes, "   ").length, 4);
});

test("no match returns an empty list", () => {
  assert.deepEqual(searchBoxes(boxes, "존재하지않는문구"), []);
});

test("collectTags counts and ranks tags", () => {
  assert.deepEqual(collectTags(boxes), [
    { tag: "CS", count: 2 },
    { tag: "경리", count: 1 },
    { tag: "배송", count: 1 },
    { tag: "환불", count: 1 }
  ]);
});
