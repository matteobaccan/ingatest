// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The beta's report (docs/wasm-beta.md): gathers what a tester would otherwise copy by
// hand (the browser, its WebGPU adapter, the model and how it loaded, the speeds, the
// load log, the errors the page met) and opens GitHub's new issue form
// (.github/ISSUE_TEMPLATE/wasm-beta-report.yml) with its fields filled. Nothing is
// sent: the tester reads the issue on GitHub and submits it, or not. Reads the page's
// elements and app.js's `window.ingaState()`; changes nothing of the page's state.
//
// The repository and the form are the page's `inga-report-repo` and
// `inga-report-template` meta tags, which the Pages workflow sets for the public build
// (matteobaccan/ingatest, whose issues anyone can open). An empty template opens a
// plain issue with the report as its text, for a repository without the form.

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() ?? "";
const REPO = `https://github.com/${meta("inga-report-repo") || "matteobaccan/inga"}`;
const TEMPLATE = meta("inga-report-template");
// GitHub refuses addresses much longer than 8 KB: the log is cut (its start first) to fit.
const MAX_URL = 7500;

const $ = (id) => document.getElementById(id);
const mib = (b) => (b == null ? "?" : (b / (1 << 20)).toFixed(1) + " MiB");
const errors = [];

function note(text) {
  const t = String(text).replace(/\s+/g, " ").trim().slice(0, 400);
  if (t && errors[errors.length - 1] !== t) errors.push(t);
  if (errors.length > 20) errors.shift();
}

// The errors the page meets: its own, and those its status line shows (the worker's).
window.addEventListener("error", (e) => note(`page error: ${e.message} (${e.filename?.split("/").pop()}:${e.lineno})`));
window.addEventListener("unhandledrejection", (e) => note(`unhandled rejection: ${e.reason?.message ?? e.reason}`));
new MutationObserver(() => {
  const s = $("status");
  if (s.className === "err") note(s.textContent);
}).observe($("status"), { attributes: true, childList: true, characterData: true, subtree: true });

const BETA = location.hostname.endsWith(".github.io") || new URLSearchParams(location.search).has("beta");
if (BETA) $("beta-note").hidden = false;
// The guide's link, where the page has one (the redesigned page's beta note has none).
if (meta("inga-guide") && $("beta-guide")) $("beta-guide").href = meta("inga-guide");

function build() {
  return document.querySelector('meta[name="inga-build"]')?.content || "dev";
}

async function browserText() {
  const n = navigator;
  const lines = [`User agent: ${n.userAgent}`];
  try {
    const d = await n.userAgentData?.getHighEntropyValues?.(["platformVersion", "architecture", "model", "fullVersionList"]);
    if (d) {
      const v = (d.fullVersionList || d.brands || []).filter((b) => !/Not.?A.?Brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(", ");
      lines.push(`Browser: ${v}; platform ${d.platform} ${d.platformVersion || ""} ${d.architecture || ""} ${d.model || ""}`.trim());
    }
  } catch {}
  const st = window.ingaState?.() ?? {};
  lines.push(`Cores: ${n.hardwareConcurrency ?? "?"}; device memory: ${n.deviceMemory ? n.deviceMemory + " GB (rounded)" : "not told"}`);
  lines.push(`Cross-origin isolated: ${window.crossOriginIsolated ? "yes" : "no"}; service worker: ${n.serviceWorker?.controller ? "active" : "none"}; ` +
    `OPFS: ${n.storage?.getDirectory ? "yes" : "no"}; WebGPU: ${n.gpu ? "yes" : "no"}`);
  if (st.info) lines.push(`Engine: ${st.info.isa} kernels on ${st.info.threads} thread${st.info.threads === 1 ? "" : "s"}`);
  try {
    const e = await n.storage?.estimate?.();
    if (e) lines.push(`Storage: ${mib(e.usage)} used of ${mib(e.quota)}`);
  } catch {}
  lines.push(`Page: ${location.origin}${location.pathname}, version ${document.querySelector('meta[name="inga-version"]')?.content || "dev"}, build ${build()}${st.version ? ` (${st.version})` : ""}`);
  return lines.join("\n");
}

async function gpuText() {
  if (!navigator.gpu) return "No WebGPU in this browser (navigator.gpu is missing).";
  let a = null;
  try {
    a = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  } catch (e) {
    return `requestAdapter failed: ${e?.message ?? e}`;
  }
  if (!a) return "WebGPU is there but offers no adapter.";
  const i = a.info || {};
  const l = a.limits;
  const f = ["shader-f16", "subgroups", "timestamp-query"].map((x) => `${x} ${a.features.has(x) ? "yes" : "no"}`).join(", ");
  const sgLo = i.subgroupMinSize ?? l.minSubgroupSize;
  const sgHi = i.subgroupMaxSize ?? l.maxSubgroupSize;
  const lines = [
    `Adapter: vendor "${i.vendor || ""}", architecture "${i.architecture || ""}", device "${i.device || ""}", description "${i.description || ""}"` +
      (a.isFallbackAdapter || i.isFallbackAdapter ? " (a fallback adapter: software)" : ""),
    `Features: ${f}${sgLo ? `; subgroup widths ${sgLo}-${sgHi}` : ""}`,
    `Limits: maxBufferSize ${mib(l.maxBufferSize)}, maxStorageBufferBindingSize ${mib(l.maxStorageBufferBindingSize)}, ` +
      `maxComputeWorkgroupStorageSize ${l.maxComputeWorkgroupStorageSize} B`,
  ];
  return lines.join("\n");
}

function modelText() {
  const st = window.ingaState?.() ?? {};
  if (!st.info) return st.model ? `${st.model} (not loaded: see the log)` : "No model loaded.";
  const i = st.info;
  const lines = [
    `File: ${st.model ?? "?"} (${i.name || "?"}), ${i.architecture}, ${i.layers} layers, ${mib(i.bytes)} of weights, context ${i.ctx}`,
    `Device: ${st.device || "?"}; ${i.device === "webgpu" ? `${i.gpu_layers}/${i.layers} layers on the GPU (${i.gpu?.name || "WebGPU"})` : "CPU"}`,
    `Loaded in ${st.secs?.toFixed(1) ?? "?"} s; ${st.limit || ""}; WebAssembly memory ${mib(st.memory)}`,
  ];
  if (i.streamed_layers) lines.push(`Layers read from storage: ${i.streamed_layers}`);
  if (st.note) lines.push(`Note: ${st.note}`);
  if (i.gpu_note) lines.push(`GPU note: ${i.gpu_note}`);
  return lines.join("\n");
}

function tableText(el) {
  const rows = [...el.querySelectorAll("tr")].map((r) => [...r.cells].map((c) => c.textContent.trim()).join(" | "));
  const p = el.querySelector("p")?.textContent;
  return [p, ...rows].filter(Boolean).join("\n");
}

function speedsText() {
  const st = window.ingaState?.() ?? {};
  const s = st.stats;
  const lines = [];
  if (s) {
    lines.push(`Last answer: prompt ${s.prompt_tokens - s.cached_tokens} tokens at ${s.prompt_tps.toFixed(2)} tok/s, ` +
      `answer ${s.gen_tokens} tokens at ${s.gen_tps.toFixed(2)} tok/s (${s.stop})`);
  }
  const std = $("std-line")?.textContent;
  if (std) lines.push(`Standard test: ${std}`);
  const bench = tableText($("bench"));
  if (bench) lines.push("", "GPU benchmark:", bench);
  const k = tableText($("kernels"));
  if (k) lines.push("", "Kernel times:", k);
  return lines.join("\n") || "No answer yet (the Standard test gives a comparable line).";
}

function logText() {
  const log = $("load-log")?.textContent?.trimEnd() || "(empty)";
  const errs = errors.length ? errors.join("\n") : "none";
  return `Load log:\n${log}\n\nErrors seen by the page:\n${errs}`;
}

// The issue's address for these fields, the log cut from its start until it fits.
function issueUrl(f) {
  const title = `WASM beta: ${f.modelShort} on ${f.browserShort}`;
  let log = f.log;
  for (;;) {
    const q = TEMPLATE
      ? new URLSearchParams({ template: TEMPLATE, title, browser: f.browser, gpu: f.gpu, model: f.model, speeds: f.speeds, log })
      : new URLSearchParams({ title, body: "### What you did, what went well, what went wrong\n\n\n\n" + asText({ ...f, log }) });
    const url = `${REPO}/issues/new?${q}`;
    if (url.length <= MAX_URL || log.length < 200) return { url, cut: log !== f.log };
    log = "[…cut: Copy report has all of it]\n" + log.slice(Math.ceil(log.length * 0.25) + 40);
  }
}

async function gather() {
  const st = window.ingaState?.() ?? {};
  const ua = navigator.userAgent;
  const browserShort = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "a browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return {
    modelShort: st.model || "no model",
    browserShort: `${browserShort}${os ? " " + os : ""}`,
    browser: await browserText(),
    gpu: await gpuText(),
    model: modelText(),
    speeds: speedsText(),
    log: logText(),
  };
}

function asText(f) {
  return [["Browser", f.browser], ["GPU", f.gpu], ["Model", f.model], ["Speeds", f.speeds], ["Log", f.log]]
    .map(([h, t]) => `### ${h}\n\n\`\`\`\n${t}\n\`\`\``).join("\n\n");
}

$("report-go").onclick = async () => {
  const f = await gather();
  $("report-text").textContent = asText(f);
  const { url, cut } = issueUrl(f);
  $("report-out").textContent = (cut ? "The log was cut to fit the address: paste Copy report's text in the issue for all of it. " : "") +
    "GitHub's form opened in a new tab: add what you did and what went wrong, then submit.";
  window.open(url, "_blank", "noopener");
};

$("report-copy").onclick = async () => {
  const text = asText(await gather());
  $("report-text").textContent = text;
  try {
    await navigator.clipboard.writeText(text);
    $("report-out").textContent = "Copied: paste it in an issue.";
  } catch {
    $("report-text").closest("details").open = true;
    $("report-out").textContent = "The clipboard was refused: the text is below, select and copy it.";
  }
};
