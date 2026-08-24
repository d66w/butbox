const CHOSUNG = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
];

const CHOSUNG_SET = new Set(CHOSUNG);
const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const JAMO_BLOCK = 588;

export function normalize(text) {
  return String(text ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function compact(text) {
  return normalize(text).replace(/\s+/g, "");
}

export function chosung(text) {
  let out = "";
  for (const char of String(text ?? "").normalize("NFC")) {
    const code = char.codePointAt(0);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      out += CHOSUNG[Math.floor((code - HANGUL_START) / JAMO_BLOCK)];
    } else if (!/\s/.test(char)) {
      out += char.toLowerCase();
    }
  }
  return out;
}

export function isChosungQuery(query) {
  const value = compact(query);
  if (value.length === 0) {
    return false;
  }
  for (const char of value) {
    if (!CHOSUNG_SET.has(char)) {
      return false;
    }
  }
  return true;
}

export function parseQuery(raw) {
  const tokens = String(raw ?? "").split(/\s+/).filter(Boolean);
  const tags = [];
  const words = [];
  for (const token of tokens) {
    if (token.startsWith("#") && token.length > 1) {
      tags.push(normalize(token.slice(1)));
    } else {
      words.push(token);
    }
  }
  return { text: words.join(" "), tags };
}

export function scoreBox(box, query) {
  const parsed = parseQuery(query);

  if (parsed.tags.length > 0) {
    const boxTags = (box.tags ?? []).map((tag) => normalize(tag));
    for (const tag of parsed.tags) {
      if (!boxTags.some((item) => item.includes(tag))) {
        return 0;
      }
    }
  }

  const needle = compact(parsed.text);
  if (needle.length === 0) {
    return parsed.tags.length > 0 ? 1 : 1;
  }

  const name = compact(box.name);
  const tagText = compact((box.tags ?? []).join(" "));
  const content = compact(box.text_content);

  if (name.startsWith(needle)) {
    return 100;
  }
  if (name.includes(needle)) {
    return 80;
  }
  if (isChosungQuery(parsed.text)) {
    const nameChosung = chosung(box.name);
    if (nameChosung.startsWith(needle)) {
      return 70;
    }
    if (nameChosung.includes(needle)) {
      return 60;
    }
  }
  if (tagText.includes(needle)) {
    return 50;
  }
  if (content.includes(needle)) {
    return 30;
  }
  return 0;
}

export function searchBoxes(boxes, query) {
  const list = Array.isArray(boxes) ? boxes : [];
  const raw = String(query ?? "").trim();
  if (raw.length === 0) {
    return list.slice();
  }
  return list
    .map((box, index) => ({ box, index, score: scoreBox(box, raw) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.box);
}

export function collectTags(boxes) {
  const counts = new Map();
  for (const box of boxes ?? []) {
    for (const tag of box.tags ?? []) {
      const key = String(tag).trim();
      if (key.length === 0) {
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], "ko"))
    .map(([tag, count]) => ({ tag, count }));
}
