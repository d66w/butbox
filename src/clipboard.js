export function copyTextFrom(loadText) {
  const pending = Promise.resolve().then(loadText).then((value) => String(value ?? ""));
  pending.catch(() => {});

  const supportsItems =
    typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";

  if (supportsItems) {
    const blob = pending.then((text) => new Blob([text], { type: "text/plain" }));
    blob.catch(() => {});
    return navigator.clipboard
      .write([new ClipboardItem({ "text/plain": blob })])
      .then(() => pending)
      .catch(async () => {
        const text = await pending;
        await navigator.clipboard.writeText(text);
        return text;
      });
  }

  return pending.then(async (text) => {
    await navigator.clipboard.writeText(text);
    return text;
  });
}

export async function readClipboardText() {
  if (typeof navigator.clipboard?.readText !== "function") {
    throw new Error("Clipboard read is unavailable.");
  }
  return String((await navigator.clipboard.readText()) ?? "");
}

export function readPastedText(event) {
  const data = event.clipboardData;
  if (!data) {
    return null;
  }
  const text = data.getData("text/plain");
  if (text) {
    return { kind: "text", text };
  }
  const items = Array.from(data.items ?? []);
  const image = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
  if (image) {
    return { kind: "image" };
  }
  const file = items.find((item) => item.kind === "file");
  if (file) {
    return { kind: "file" };
  }
  return null;
}
