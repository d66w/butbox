import { TOAST_DURATION_MS } from "./constants.js";

const HTML_SINK_PROPS = new Set(["innerHTML", "outerHTML", "srcdoc"]);

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) {
      continue;
    }
    if (key === "class") {
      node.className = value;
    } else if (key === "text") {
      node.textContent = value;
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "dataset") {
      for (const [dataKey, dataValue] of Object.entries(value)) {
        node.dataset[dataKey] = dataValue;
      }
    } else if (HTML_SINK_PROPS.has(key)) {
      continue;
    } else if (key in node && key !== "list") {
      node[key] = value;
    } else {
      node.setAttribute(key, value);
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

let toastTimer = null;

export function showToast(message, tone = "info") {
  const host = qs("#toast");
  if (!host) {
    return;
  }
  host.textContent = message;
  host.dataset.tone = tone;
  host.classList.add("is-visible");
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    host.classList.remove("is-visible");
    toastTimer = null;
  }, TOAST_DURATION_MS);
}

function modalRoot() {
  return qs("#modal");
}

function openModal(build) {
  const dialog = modalRoot();
  clear(dialog);
  return new Promise((resolve) => {
    let settled = false;

    function finish(value) {
      if (settled) {
        return;
      }
      settled = true;
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
      if (dialog.open) {
        dialog.close();
      }
      clear(dialog);
      resolve(value);
    }

    function onCancel(event) {
      event.preventDefault();
      finish(null);
    }

    function onClose() {
      if (dialog.open) {
        return;
      }
      finish(null);
    }

    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("close", onClose);
    dialog.append(build(finish));
    dialog.showModal();
    const focusTarget = dialog.querySelector("[data-autofocus]");
    if (focusTarget) {
      focusTarget.focus();
      if (typeof focusTarget.select === "function") {
        focusTarget.select();
      }
    }
  });
}

export function openForm({ title, description, fields, submitLabel = "확인", danger = false }) {
  return openModal((finish) => {
    const inputs = new Map();
    const errorLine = el("p", { class: "modal__error", hidden: true });

    const body = el("div", { class: "modal__body" });
    fields.forEach((field, index) => {
      const input = el("input", {
        class: "input",
        type: field.type ?? "text",
        value: field.value ?? "",
        placeholder: field.placeholder ?? "",
        maxLength: field.maxLength ?? 200,
        autocomplete: "off",
        spellcheck: false
      });
      if (index === 0) {
        input.dataset.autofocus = "true";
      }
      if (field.transform) {
        input.addEventListener("input", () => {
          const start = input.selectionStart;
          input.value = field.transform(input.value);
          input.setSelectionRange(start, start);
        });
      }
      inputs.set(field.name, input);
      body.append(
        el("label", { class: "field" }, [
          el("span", { class: "field__label", text: field.label }),
          input,
          field.hint ? el("span", { class: "field__hint", text: field.hint }) : null
        ])
      );
    });

    const form = el("form", {
      class: "modal",
      method: "dialog",
      onsubmit: (event) => {
        event.preventDefault();
        const values = {};
        for (const [name, input] of inputs) {
          values[name] = input.value;
        }
        const field = fields.find((item) => item.validate && item.validate(values[item.name]).ok === false);
        if (field) {
          errorLine.textContent = field.validate(values[field.name]).message;
          errorLine.hidden = false;
          inputs.get(field.name).focus();
          return;
        }
        finish(values);
      }
    });

    form.append(
      el("h2", { class: "modal__title", text: title }),
      description ? el("p", { class: "modal__desc", text: description }) : null,
      body,
      errorLine,
      el("div", { class: "modal__actions" }, [
        el("button", {
          type: "button",
          class: "btn btn--ghost",
          text: "취소",
          onclick: () => finish(null)
        }),
        el("button", {
          type: "submit",
          class: danger ? "btn btn--danger" : "btn btn--primary",
          text: submitLabel
        })
      ])
    );
    return form;
  });
}

export function openConfirm({ title, message, confirmLabel = "확인", danger = false }) {
  return openModal((finish) =>
    el("div", { class: "modal" }, [
      el("h2", { class: "modal__title", text: title }),
      message ? el("p", { class: "modal__desc", text: message }) : null,
      el("div", { class: "modal__actions" }, [
        el("button", {
          type: "button",
          class: "btn btn--ghost",
          text: "취소",
          onclick: () => finish(false)
        }),
        el("button", {
          type: "button",
          class: danger ? "btn btn--danger" : "btn btn--primary",
          text: confirmLabel,
          dataset: { autofocus: "true" },
          onclick: () => finish(true)
        })
      ])
    ])
  );
}

export function openChoice({ title, description, options }) {
  return openModal((finish) =>
    el("div", { class: "modal" }, [
      el("h2", { class: "modal__title", text: title }),
      description ? el("p", { class: "modal__desc", text: description }) : null,
      el(
        "div",
        { class: "choice" },
        options.map((option) =>
          el(
            "button",
            {
              type: "button",
              class: option.danger ? "choice__item choice__item--danger" : "choice__item",
              onclick: () => finish(option.value)
            },
            [
              el("span", { class: "choice__label", text: option.label }),
              option.description ? el("span", { class: "choice__desc", text: option.description }) : null
            ]
          )
        )
      ),
      el("div", { class: "modal__actions" }, [
        el("button", {
          type: "button",
          class: "btn btn--ghost",
          text: "닫기",
          onclick: () => finish(null)
        })
      ])
    ])
  );
}

export function openSheet({ title, build }) {
  return openModal((finish) => {
    const body = el("div", { class: "sheet__body" });
    const sheet = el("div", { class: "modal" }, [
      el("h2", { class: "modal__title", text: title }),
      body,
      el("div", { class: "modal__actions" }, [
        el("button", {
          type: "button",
          class: "btn btn--ghost",
          text: "닫기",
          onclick: () => finish(null)
        })
      ])
    ]);
    build(body, finish);
    return sheet;
  });
}
