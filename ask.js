// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The page's own question box, in place of the browser's confirm() and prompt(): one
// <dialog id="ask"> (index.html) with a title, a message, an optional text field, Cancel,
// an optional secondary action and the main button (red for something deleted).
// A modal <dialog> keeps the focus inside it; Escape and a click on the backdrop
// cancel; the focus goes back to what had it.
//
//   ask({ title, message, strong, ok, cancel, danger, secondary: { label, act }, input })
//
// `message` may hold "{0}", shown as `strong` in bold. `secondary.act()` runs without
// closing the box (Delete all's "Export first"). Resolves to true (the main button) or
// false; with `input` ({ value, label }), to the text entered, or null.

const $ = (id) => document.getElementById(id);
let pending = null;

function finish(ok) {
  const d = $("ask");
  if (!pending) return;
  const { resolve, input, back } = pending;
  pending = null;
  if (d.open) d.close();
  resolve(input ? (ok ? $("ask-input").value : null) : ok);
  back?.focus?.();
}

export function ask(o) {
  if (pending) finish(false);
  const d = $("ask");
  $("ask-title").textContent = o.title ?? "";
  const msg = $("ask-msg");
  msg.textContent = "";
  const [before, after = ""] = String(o.message ?? "").split("{0}");
  msg.append(before);
  if (o.strong != null && String(o.message ?? "").includes("{0}")) {
    const b = document.createElement("strong");
    b.textContent = o.strong;
    msg.append(b, after);
  }
  msg.hidden = !o.message;
  const input = $("ask-input");
  input.hidden = !o.input;
  input.value = o.input?.value ?? "";
  input.setAttribute("aria-label", o.input?.label ?? o.title ?? "");
  const ok = $("ask-ok");
  ok.textContent = o.ok ?? "OK";
  ok.className = o.danger ? "danger" : "";
  $("ask-cancel").textContent = o.cancel ?? "Cancel";
  const second = $("ask-second");
  second.hidden = !o.secondary;
  second.textContent = o.secondary?.label ?? "";
  second.onclick = () => o.secondary?.act?.();
  return new Promise((resolve) => {
    pending = { resolve, input: !!o.input, back: document.activeElement };
    d.showModal();
    (o.input ? input : o.danger ? $("ask-cancel") : ok).focus();
    if (o.input) input.select();
  });
}

// Wired once: the buttons, Enter in the field, Escape (cancel), the backdrop.
export function setupAsk() {
  const d = $("ask");
  $("ask-ok").onclick = () => finish(true);
  $("ask-cancel").onclick = () => finish(false);
  $("ask-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      finish(true);
    }
  });
  d.addEventListener("cancel", (e) => {
    e.preventDefault();
    finish(false);
  });
  d.addEventListener("close", () => finish(false));
  // A click on the backdrop (outside the box's rectangle) cancels.
  d.addEventListener("click", (e) => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) finish(false);
  });
}
