export const SORT_MODES = {
  manual: "manual",
  recent: "recent",
  name: "name"
};

function byManual(a, b) {
  if (a.sort_order !== b.sort_order) {
    return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
  }
  return String(a.id).localeCompare(String(b.id));
}

function byRecent(a, b) {
  const left = a.last_used_at ? Date.parse(a.last_used_at) : 0;
  const right = b.last_used_at ? Date.parse(b.last_used_at) : 0;
  if (left !== right) {
    return right - left;
  }
  return byManual(a, b);
}

function byName(a, b) {
  return String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko") || byManual(a, b);
}

const COMPARATORS = {
  [SORT_MODES.manual]: byManual,
  [SORT_MODES.recent]: byRecent,
  [SORT_MODES.name]: byName
};

export function sortBoxes(boxes, mode = SORT_MODES.manual, favoritesFirst = true) {
  const compare = COMPARATORS[mode] ?? byManual;
  const list = Array.isArray(boxes) ? boxes.slice() : [];
  return list.sort((a, b) => {
    if (favoritesFirst) {
      const left = a.is_favorite ? 0 : 1;
      const right = b.is_favorite ? 0 : 1;
      if (left !== right) {
        return left - right;
      }
    }
    return compare(a, b);
  });
}

export function reorderIds(boxes, movedId, targetId) {
  const ids = boxes.map((box) => box.id);
  const from = ids.indexOf(movedId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) {
    return null;
  }
  ids.splice(from, 1);
  ids.splice(to, 0, movedId);
  return ids;
}
