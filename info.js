// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The model's Info panel (the ⓘ next to the model chip): how the loaded model is set up
// here, so a tester can see, and send, why it runs slow or fast: the model, its
// context, the device (the WebGPU adapter and its limits), where its layers went, the
// CPU, the speeds, the page, and what the fit estimate was judged on. Built from
// app.js's `window.ingaState()` (the state the beta's report reads too) and the
// browser's own answers (the adapter, userAgentData); every label in the page's
// language (i18n.js), the numbers too. The same text goes into the report.

import { t, num, size } from "./i18n.js";

const yes = (b) => t(b ? "info.yes" : "info.no");
const mb = (b) => (b == null ? "?" : size(b));

// The adapter the page would use (the one chooseDevice asks for), or null.
async function adapter() {
  try {
    return (await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" })) ?? null;
  } catch {
    return null;
  }
}

async function browserLine() {
  const n = navigator;
  try {
    const d = await n.userAgentData?.getHighEntropyValues?.(["platformVersion", "fullVersionList"]);
    if (d) {
      const v = (d.fullVersionList || d.brands || []).filter((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(", ");
      return `${v || "?"} · ${d.platform || ""} ${d.platformVersion || ""}`.trim();
    }
  } catch {}
  return n.userAgent;
}

// The panel's sections: [{title, rows: [[label, value]]}], from `st` (ingaState).
export async function infoSections(st) {
  const i = st.info;
  const out = [];
  if (i) {
    out.push({ title: t("info.model"), rows: [
      [t("info.name"), i.name || st.model || "?"],
      [t("info.file"), st.model ?? "?"],
      [t("info.size"), mb(i.bytes)],
      [t("info.arch"), `${i.architecture ?? "?"}, ${num(i.layers)} ${t("info.layers")}`],
      [t("info.params"), i.params ? (i.params >= 1e9 ? num(i.params / 1e9, 2) + " B" : num(i.params / 1e6, 0) + " M") : "?"],
      [t("info.quant"), i.quant || "?"],
      ...(st.variant ? [[t("info.variant"), st.variant]] : []),
      [t("info.trained"), i.trained_ctx ? num(i.trained_ctx) : "?"],
    ] });
    const kvBytes = st.ctx_auto?.bytes ?? i.kv_cache ?? 0;
    out.push({ title: t("info.ctx"), rows: [
      [t("info.ctx.used"), num(i.ctx)],
      [t("info.ctx.why"), st.ctxWhy || "?"],
      [t("info.ctx.tokens"), `${num(st.ctxUsed ?? 0)} / ${num(i.ctx)}`],
      [t("info.kv"), `${(i.kv_type || "?").toUpperCase()}${kvBytes ? " · " + size(kvBytes) : ""}`],
    ] });
  } else {
    out.push({ title: t("info.model"), rows: [[t("info.name"), t("info.nomodel")]] });
  }
  // The device: the one chosen for the load, and the adapter as the browser tells it.
  const dev = [[t("info.device"), i ? (i.device === "webgpu" ? "WebGPU" : "CPU") + (st.device ? ` (${st.device})` : "") : st.device || "?"]];
  const a = await adapter();
  if (a) {
    const ai = a.info || {};
    const feats = ["shader-f16", "subgroups"].filter((f) => a.features?.has?.(f));
    dev.push(
      [t("info.adapter"), [ai.vendor, ai.architecture, ai.device, ai.description].filter(Boolean).join(" · ") || "?"],
      [t("info.fallback"), yes(a.isFallbackAdapter || ai.isFallbackAdapter)],
      [t("info.features"), feats.join(", ") || t("info.none")],
      ["maxBufferSize", mb(a.limits?.maxBufferSize)],
      ["maxStorageBufferBindingSize", mb(a.limits?.maxStorageBufferBindingSize)],
    );
    if (i?.gpu?.line) dev.push([t("info.gpuline"), i.gpu.line]);
  } else dev.push([t("info.adapter"), navigator.gpu ? t("info.noadapter") : t("info.nowebgpu")]);
  dev.push([t("info.gpulimit"), st.gpuLimit || "?"]);
  out.push({ title: t("info.dev"), rows: dev });
  if (i) {
    const onGpu = i.device === "webgpu" ? i.gpu_layers : 0;
    const streamed = i.streamed_layers || 0;
    const rows = [
      [t("info.l.gpu"), `${num(onGpu)} / ${num(i.layers)}${i.gpu_head ? " + " + t("info.head") : ""}`],
      [t("info.l.cpu"), num(Math.max(0, i.layers - onGpu - streamed))],
      [t("info.l.storage"), num(streamed)],
    ];
    if (st.gpu) rows.push([t("info.gpumem"), t("info.gpumem.v", size(st.gpu.weight_bytes), size(st.gpu.other_bytes))]);
    rows.push([t("info.wasm"), `${mb(st.memory)} · ${st.limit || "?"}`]);
    if (st.slow) rows.push([t("info.slow"), st.slow]);
    out.push({ title: t("info.place"), rows });
  }
  out.push({ title: t("info.cpu"), rows: [
    [t("info.threads"), i ? num(i.threads) : String(navigator.hardwareConcurrency ?? "?")],
    [t("info.simd"), i?.isa ?? "?"],
    [t("info.coi"), yes(self.crossOriginIsolated) + ` · SharedArrayBuffer ${yes(typeof SharedArrayBuffer !== "undefined")}`],
  ] });
  const s = st.stats;
  out.push({ title: t("info.speed"), rows: [
    [t("info.sp.prompt"), s ? `${num(s.prompt_tps, 1)} tok/s` : "—"],
    [t("info.sp.answer"), s ? `${num(s.gen_tps, 1)} tok/s` : "—"],
    [t("info.sp.live"), st.live != null ? `${num(st.live, 1)} tok/s` : "—"],
  ] });
  // What the picker's fit estimate (and the question before a model too big) judged on.
  const e = st.env;
  if (e) {
    out.push({ title: t("info.fit"), rows: [
      [t("info.fit.mem"), e.memory == null ? t("info.fit.all") : size(e.memory)],
      [t("info.fit.wasm"), size(e.wasmMax)],
      [t("info.fit.dm"), e.deviceMemory ? `${num(e.deviceMemory)} GB` : "?"],
      [t("info.fit.gpu"), e.gpu ? `${size(e.gpu.budget)}${e.gpu.guess ? " (" + t("info.fit.guess") + ")" : ""}` : t("info.none")],
      [t("info.fit.free"), e.free != null ? size(e.free) : "?"],
    ] });
  }
  out.push({ title: t("info.page"), rows: [
    [t("info.version"), st.version || "dev"],
    [t("info.browser"), await browserLine()],
    [t("info.preset"), st.preset || "—"],
  ] });
  return out;
}

// The sections as plain text, for Copy and the report.
export function infoText(sections) {
  return sections.map((s) => [`${s.title}`, ...s.rows.map(([k, v]) => `  ${k}: ${v}`)].join("\n")).join("\n");
}

// The sections into `el`: a heading and a table each.
export function renderInfo(el, sections) {
  el.textContent = "";
  for (const s of sections) {
    const h = document.createElement("h3");
    h.textContent = s.title;
    const tb = document.createElement("table");
    for (const [k, v] of s.rows) {
      const tr = tb.insertRow();
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = k;
      const td = tr.insertCell();
      td.textContent = v;
      tr.prepend(th);
    }
    el.append(h, tb);
  }
}
