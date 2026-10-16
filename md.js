// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// Markdown, built as DOM nodes (never as HTML): the renderer of Inga's web UI
// (crates/inga-server/src/webui.html, "Markdown, built as DOM nodes"), without its
// formulas and diagrams (this page has neither library: they stay as their source).
// Code blocks, inline code, bold, italic, links (http and https only), headings, lists,
// quotes and rules. The model's text only ever becomes text nodes.

import { t } from "./i18n.js";

function el(tag, props = {}, ...children) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

function inline(parent, text) {
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)|(\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(text.slice(last, m.index));
    if (m[1]) parent.append(el("code", { textContent: m[1].slice(1, -1) }));
    else if (m[2]) parent.append(el("strong", { textContent: m[2].slice(2, -2) }));
    else if (m[3]) parent.append(el("em", { textContent: m[3].slice(1, -1) }));
    else parent.append(el("a", { textContent: m[5], href: m[6], target: "_blank", rel: "noopener noreferrer" }));
    last = re.lastIndex;
  }
  if (last < text.length) parent.append(text.slice(last));
}

function blocks(parent, text) {
  let list = null, para = null;
  for (const line of text.split("\n")) {
    let m;
    if (!line.trim()) {
      list = para = null;
      continue;
    }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      list = para = null;
      const h = el("h" + Math.min(m[1].length + 2, 6));
      inline(h, m[2]);
      parent.append(h);
    } else if ((m = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/))) {
      const tag = /\d/.test(m[1]) ? "OL" : "UL";
      if (!list || list.tagName !== tag) {
        para = null;
        list = el(tag.toLowerCase());
        parent.append(list);
      }
      const li = el("li");
      inline(li, m[2]);
      list.append(li);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      list = para = null;
      const q = el("blockquote");
      inline(q, m[1]);
      parent.append(q);
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      list = para = null;
      parent.append(el("hr"));
    } else {
      list = null;
      if (!para) {
        para = el("p");
        parent.append(para);
      } else para.append(el("br"));
      inline(para, line);
    }
  }
}

// Renders `text` into `target` (its children replaced). A code block still open (an
// answer streaming) shows what it has so far.
export function markdown(target, text) {
  target.textContent = "";
  const re = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    blocks(target, text.slice(last, m.index));
    const code = m[2].replace(/\n$/, "");
    const copy = el("button", { className: "copy", type: "button", textContent: t("md.copy") });
    copy.onclick = () => {
      navigator.clipboard?.writeText(code).then(() => (copy.textContent = t("md.copied")), () => {});
    };
    target.append(el("div", { className: "code" }, el("span", { className: "lang", textContent: m[1] }), copy,
      el("pre", { textContent: code })));
    last = re.lastIndex;
    if (m[0].length === 0) break;
  }
  blocks(target, text.slice(last));
}
