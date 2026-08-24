const VARIABLE_PATTERN = /\{\{\s*([^{}]{1,40}?)\s*\}\}/g;

const BUILTINS = {
  오늘: () => formatDate(new Date()),
  날짜: () => formatDate(new Date()),
  올해: () => String(new Date().getFullYear()),
  지금: () => formatTime(new Date())
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function extractVariables(text) {
  const source = String(text ?? "");
  const seen = [];
  VARIABLE_PATTERN.lastIndex = 0;
  let match = VARIABLE_PATTERN.exec(source);
  while (match !== null) {
    const name = match[1].trim();
    if (name.length > 0 && !seen.includes(name)) {
      seen.push(name);
    }
    match = VARIABLE_PATTERN.exec(source);
  }
  return seen;
}

export function builtinValue(name) {
  const resolver = BUILTINS[String(name ?? "").trim()];
  return resolver ? resolver() : null;
}

export function promptableVariables(text) {
  return extractVariables(text).filter((name) => builtinValue(name) === null);
}

export function hasVariables(text) {
  return extractVariables(text).length > 0;
}

export function fillTemplate(text, values = {}) {
  const source = String(text ?? "");
  VARIABLE_PATTERN.lastIndex = 0;
  return source.replace(VARIABLE_PATTERN, (whole, rawName) => {
    const name = rawName.trim();
    if (Object.prototype.hasOwnProperty.call(values, name)) {
      const value = values[name];
      return value === null || value === undefined ? "" : String(value);
    }
    const builtin = builtinValue(name);
    return builtin === null ? whole : builtin;
  });
}
