// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The demo page: picks a model (a suggested one, a link, a file of this device), keeps
// downloads in OPFS, runs Inga in a Web Worker (worker.js) and streams its answers with
// their speed. Every path is relative: the folder can be served as static files from
// anywhere (HTTPS needed for OPFS and workers off localhost).

import { markdown } from "./md.js";
import { createPicker } from "./picker.js";
import * as chats from "./chats.js";
import { t, setLang } from "./i18n.js";
import { fmt, createRate, downloadLine, estimate, lastSpeed, saveSpeed } from "./eta.js";
import { gauge, gaugeTitle, promptLimit, detail } from "./ctx.js";
import { PRESET_FIELDS, catalogEntry, presetOf, presetValues, handFromSaved, describePreset } from "./preset.js";

// The test models: a fixed list, so runs on different devices compare (the maintainer's
// matrix of models x CPU / GPU, with the Standard test). Sizes are approximate.
const HF = "https://huggingface.co/";
const SUGGESTED = [
  { label: "SmolLM2-135M-Instruct, Q8_0", size: "about 0.15 GB", licence: "Apache-2.0",
    url: HF + "bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q8_0.gguf" },
  { label: "Qwen3-0.6B, Q4_K_M (the draft model for Qwen3-4B)", size: "about 0.4 GB", licence: "Apache-2.0",
    url: HF + "unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf" },
  { label: "Llama-3.2-1B-Instruct, Q4_K_M", size: "about 0.8 GB", licence: "Llama 3.2 Community License",
    url: HF + "bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf" },
  { label: "Qwen3-4B, Q4_K_M", size: "about 2.5 GB", licence: "Apache-2.0",
    url: HF + "unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf" },
  // Check the link: this repository path could not be verified from where the list was
  // written (no access to huggingface.co); a 404 shows as the download's HTTP error.
  { label: "Gemma 4 E4B, IQ2_M", size: "about 3.3 GB", licence: "Gemma Terms of Use",
    url: HF + "unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-UD-IQ2_M.gguf" },
];

const $ = (id) => document.getElementById(id);
const fileName = (url) => decodeURIComponent(new URL(url).pathname.split("/").pop() || "model.gguf");

let worker = null;
let source = null; // what the loaded model came from: {name} (OPFS) or {file}
let busy = false;
let messages = []; // the current conversation's messages ({role, content, ...}: chats.js)
let chat = null; // the current conversation (chats.js), null until its first message
let answer = null; // the element of the answer streaming
let answerBox = null; // its message (the bubble with the speed line)
let answerText = ""; // its raw text (what goes back to the model), rendered as Markdown
let renderTimer = null; // a render of the answer pending (at most one every RENDER_MS)
const RENDER_MS = 100;
let thinking = null; // the <details> of its reasoning, once a thinking model reasons
let used = false; // this worker has loaded a model: its WebAssembly memory never shrinks
let stopFlag = null;
let keepChat = false; // the model loads again after a stop: the chat stays
let limitUsed = ""; // the memory limit the model being loaded was given, as the load line says it
let deviceUsed = { device: "cpu", label: "" }; // the device chosen for it (chooseDevice)
let onGpu = false; // the loaded model runs on the GPU (WebGPU)
let lastStats = null; // the last answer's statistics ("done"), for the beta's report
let modelName = ""; // the loaded model's name, on its answers
let loadedInfo = null; // the last "loaded" message: info, memory, gpu, note
// Whether the loaded model can think (its chat template's marks, `info.thinks`; a module
// that does not say counts as yes): Think shows, and `thinking` is sent, only then.
const thinks = () => loadedInfo?.info?.thinks !== false;
// The options without `thinking` for a model that cannot think.
const thinkOpts = (opts) => {
  if (thinks()) return opts;
  const { thinking: _, ...rest } = opts;
  return rest;
};
// Shows the Think switch for a model that can think, hides it otherwise.
const drawThink = () => { $("think").closest("label").hidden = !thinks(); };
// The public beta (GitHub Pages, docs/wasm-beta.md; `?beta` elsewhere): Device defaults to
// the GPU where the browser has WebGPU, off iOS (report.js reads the page's state).
const BETA = location.hostname.endsWith(".github.io") || new URLSearchParams(location.search).has("beta");

function status(text, err = false) {
  $("status").textContent = text;
  $("status").className = err ? "err" : "";
}

function progress(done, total, text = "") {
  const p = $("progress");
  p.hidden = !total;
  p.title = text;
  if (total) {
    p.max = total;
    p.value = done;
  }
}

// The download running (fromUrl): its smoothed rate (eta.js), on this session's bytes.
let dlRate = null;

function setBusy(b) {
  busy = b;
  for (const id of ["url-go", "file"]) $(id).disabled = b;
  document.querySelectorAll("button[data-act]").forEach((x) => (x.disabled = b));
  const loaded = !!source;
  $("send").disabled = b || !loaded;
  $("stdtest").disabled = b || !loaded;
  $("prompt").disabled = !loaded;
  $("reset").disabled = b;
  $("new-chat").disabled = b;
  for (const x of document.querySelectorAll("#convs button")) x.disabled = b;
  $("gpubench").disabled = b || !loaded || !onGpu;
  $("gpuprofile").disabled = b || !loaded || !onGpu;
  // Free again: the context gauge counts what the model would now read.
  if (!b) countSoon(0);
  else drawGauge();
}

// ---- The context gauge: the ring next to Send (ctx.js) ----

let ctxUsed = 0; // the tokens of the conversation as the model reads it, the draft included
let countId = 0; // the last count asked of the worker (older answers are ignored)
let countTimer = null;
let trimmedNote = ""; // the oldest messages left out of the answer running, said
let ctxParts = null; // the parts of the last count made with the panel open (ctx.js's breakdown); null: not counted
const COUNT_MS = 400; // the pause in typing before the draft is counted

// The context the loaded model has (its n_ctx), else the Settings' context.
function ctxSize() {
  return loadedInfo?.info?.ctx || ctx();
}

// The Settings' Max tokens: what the answer may take.
function maxTokens() {
  return Number($("max").value) || 256;
}

function drawGauge() {
  const size = ctxSize();
  const g = gauge(ctxUsed, size);
  const el = $("ctx-gauge");
  el.hidden = !source || !g.show;
  $("ctx-ring").setAttribute("stroke-dasharray", g.pct.toFixed(1) + " 100");
  $("ctx-pct").textContent = g.shown + "%";
  el.title = gaugeTitle(t, ctxUsed, size);
  el.setAttribute("aria-label", el.title);
  el.classList.toggle("warn", g.level === "warn");
  el.classList.toggle("full", g.level === "full");
  if (el.hidden) closeDetail();
  else if (!$("ctx-pop").hidden) drawDetail();
}

// The ring's panel, as inga serve's web UI's: the tokens used of the context, what fills
// it (the system prompt, the past messages sent, the draft) and the room kept for the
// answer, the messages the next question would leave out, and the context's size and
// where it comes from. Its parts are counted when it opens and with each count while it
// is open (`countSoon`); closed, the gauge counts only the total.
function drawDetail() {
  const pop = $("ctx-pop");
  const size = ctxSize();
  const d = detail(ctxUsed, size, ctxParts, maxTokens());
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  pop.textContent = "";
  const head = el("b", null, t("ctx.title") + " · " + t("ctx.of", d.used, d.size));
  head.id = "ctx-pop-h";
  pop.append(head, el("div", "note", t("ctx.used", d.shown, d.free)));
  const list = el("div", "parts");
  // Not counted yet (the worker busy with an answer, or the count on its way).
  if (ctxParts === null && ctxUsed) list.append(el("div", "note", t("ctx.counting")));
  for (const r of d.rows) {
    const bar = el("span", "bar " + r.key);
    bar.style.width = (r.n ? Math.max(1, r.w) : 0) + "%";
    const track = el("span", "track");
    track.append(bar);
    const row = el("div", "part " + r.key);
    row.dataset.part = r.key;
    row.append(el("span", "lbl", t("ctx.part." + r.key)), track, el("span", "num", String(r.n)));
    list.append(row);
  }
  pop.append(list);
  if (d.dropped) pop.append(el("div", "note warn", t(d.dropped === 1 ? "ctx.drop.one" : "ctx.drop", d.dropped)));
  pop.append(el("div", "note small", t("ctx.size", size, t(loadedInfo?.info?.ctx ? "ctx.src.model" : "ctx.src.set"))));
}

function openDetail() {
  $("ctx-pop").hidden = false;
  $("ctx-gauge").setAttribute("aria-expanded", "true");
  drawDetail();
  // The parts: counted now.
  countSoon(0);
}

function closeDetail(focus = false) {
  if ($("ctx-pop").hidden) return;
  $("ctx-pop").hidden = true;
  $("ctx-gauge").setAttribute("aria-expanded", "false");
  if (focus) $("ctx-gauge").focus();
}

// Counts, after `ms`, the tokens of what the model would read now: the system prompt,
// the messages "Past messages sent" keeps and the draft being written. Not while the
// worker is busy (it counts after the answer).
function countSoon(ms = COUNT_MS) {
  clearTimeout(countTimer);
  countTimer = setTimeout(() => {
    countTimer = null;
    if (!source || !worker || busy) return drawGauge();
    const draft = $("prompt").value.trim();
    const sent = wire(draft ? messages.concat({ role: "user", content: draft }) : messages);
    if (!sent.length) {
      ctxUsed = 0;
      ctxParts = { total: 0, system: 0, past: 0, draft: 0, kept: 0, dropped: 0 };
      return drawGauge();
    }
    // The panel open: its parts too, and what the next question would leave out.
    const open = !$("ctx-pop").hidden;
    worker.postMessage({ type: "count", id: ++countId, messages: sent, opts: thinkOpts({ thinking: $("think").checked }),
      detail: open, draft: !!draft, fit: open ? promptLimit(ctxSize(), maxTokens()) : undefined });
  }, ms);
}

// Renders the answer streaming from its raw text: now, or (`soon`) within RENDER_MS,
// so a fast stream does not rebuild it at every piece.
function renderAnswer(soon) {
  if (soon) {
    renderTimer ??= setTimeout(() => {
      renderTimer = null;
      if (answer) {
        const box = $("chat");
        const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
        markdown(answer, answerText);
        if (atEnd) box.scrollTop = box.scrollHeight;
      }
    }, RENDER_MS);
    return;
  }
  clearTimeout(renderTimer);
  renderTimer = null;
  if (answer) {
    const box = $("chat");
    const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    markdown(answer, answerText);
    // The text as the model wrote it, for the browser tests (the rendering drops marks).
    answer.dataset.raw = answerText;
    if (atEnd) box.scrollTop = box.scrollHeight;
  }
}

// The answer is over (done, stopped, failed): its last render, and no element left.
function endAnswer() {
  reloadLater();
  clearTimeout(quietTimer);
  quietTimer = null;
  quietShown = false;
  renderAnswer(false);
  answer = null;
  thinking = null;
}

function startWorker() {
  worker = new Worker("worker.js", { type: "module" });
  used = false;
  worker.onmessage = ({ data: m }) => onMessage(m);
  worker.onerror = (e) => {
    e.preventDefault?.();
    workerLost(`The worker failed: ${e.message || "an error with no message"}`);
  };
  worker.onmessageerror = () => workerLost("The worker sent a message the page could not read");
}

// ---- The watchdog of loads: a worker the browser stopped answers nothing more ----

// While a model loads, the worker reports at least every few MiB read; with no message
// for WATCHDOG_MS the browser most likely stopped it (Safari on iOS ends a worker that
// passes the tab's memory without an error event), and the page would wait forever.
// `?watchdog_ms=N` in the page's address shortens it (the browser tests).
const WATCHDOG_MS = Number(new URLSearchParams(location.search).get("watchdog_ms")) || 45000;
let watchdog = null;
let loading = false; // a load is in progress (a load message sent, no answer yet)

function armWatchdog() {
  clearTimeout(watchdog);
  watchdog = loading ? setTimeout(() => workerLost(null), WATCHDOG_MS) : null;
}

// The answers' watch: the watchdog covers loads only, so a worker the browser ends
// during an answer (Safari on iOS does it without an error event) left the page
// waiting with no word. With no message from the worker for QUIET_MS while an answer
// runs, the page says so (and logs it); it does not end the worker, as a long prompt
// on a phone's CPU may take that long before its first token.
const QUIET_MS = Number(new URLSearchParams(location.search).get("quiet_ms")) || 60000;
let quietTimer = null;
let quietShown = false;
function armQuiet() {
  clearTimeout(quietTimer);
  // A word after the warning: the worker is alive, the answer goes on.
  if (quietShown) {
    quietShown = false;
    status("Answering…");
  }
  quietTimer = setTimeout(() => {
    if (!answer) return;
    const t = `No word from the model's worker for ${QUIET_MS / 1000} s: it is still reading the prompt, or the browser ` +
      "stopped it (probably memory); Stop, or reload the page and load the model again";
    loadLog(t);
    // A warning, not an error: the answer may still come.
    status(t);
    quietShown = true;
  }, QUIET_MS);
}

function startLoading() {
  loading = true;
  armWatchdog();
}

function stopLoading() {
  loading = false;
  armWatchdog();
}

// The worker is gone or stuck: say so, start a fresh one, and let the user try again.
// `why`: an error the worker raised; null for the watchdog's silence.
function workerLost(why) {
  const wasLoading = loading;
  stopLoading();
  if (!wasLoading && !why) return;
  status(why ? `${why}. A new worker was started: load the model again.`
    : `The browser stopped the model's worker (probably memory: no word from it for ${WATCHDOG_MS / 1000} s); ` +
      'try Device CPU or a lower limit ("Memory for the model"), then load again.', true);
  progress(0, 0);
  stdRunning = false;
  if (answer) {
    endAnswer();
    messages.pop();
  }
  source = null;
  worker.terminate();
  startWorker();
  $("stop").disabled = true;
  setBusy(false);
}

// The load log: each step the worker reports, with its time, shown under the status
// line (a load that stops says where; Copy it into a report). The Settings' "Load log"
// keeps every step, only the start, the end and the errors, or nothing.
let logT0 = null;
const LOG_SUMMARY = /^(load asked|ready to chat|page error|No word|the page received)/;
function loadLog(text, reset = false) {
  const level = $("loglevel")?.value ?? "all";
  if (level === "off" || (level === "summary" && !LOG_SUMMARY.test(text) && !/error|fail|refus|stopp/i.test(text))) return;
  let el = document.getElementById("load-log");
  if (!el) {
    el = document.createElement("pre");
    el.id = "load-log";
    el.style.cssText = "white-space:pre-wrap;font-size:0.75rem;margin:4px 0;max-height:12em;overflow:auto;color:var(--muted)";
    $("status").after(el);
  }
  if (reset) {
    el.textContent = "";
    logT0 = null;
  }
  const now = performance.now();
  logT0 ??= now;
  el.textContent += `${((now - logT0) / 1000).toFixed(1).padStart(6)} s  ${text}\n`;
  el.scrollTop = el.scrollHeight;
}

function onMessage(m) {
  try {
    handleMessage(m);
  } catch (e) {
    // An error of the page itself (not the worker's): said, never swallowed.
    loadLog(`page error on "${m?.type}": ${e?.message ?? e}`);
    status(`The page failed on the worker's "${m?.type}" message: ${e?.message ?? e}`, true);
    try { setBusy(false); } catch {}
  }
}

function handleMessage(m) {
  // Any word from the worker during a load or an answer: it is alive.
  if (loading) armWatchdog();
  if (answer) armQuiet();
  switch (m.type) {
    case "step":
      if (m.text.startsWith("load asked")) loadLog(m.text, true);
      else loadLog(m.text);
      break;
    case "ready":
      // A worker started again to load a model: its progress follows.
      // An error shown (a worker lost) stays until the next action.
      if (!busy && $("status").className !== "err") status("Ready: pick a model.");
      worker.postMessage({ type: "list" });
      break;
    case "progress": {
      if (m.what === "download") {
        // Downloaded of the whole file, the speed and the time left (eta.js).
        dlRate ??= createRate();
        dlRate.update(m.done - (m.start ?? 0), performance.now() / 1000);
        const line = downloadLine({ done: m.done, total: m.total, rate: dlRate.rate }, t);
        status(line);
        progress(m.done, m.total, line);
        break;
      }
      const what = { download: "Downloading", copy: "Copying into this site's storage", disktest: "Disk speed test" }[m.what] ?? "Loading";
      status(`${what}: ${fmt(m.done)}${m.total ? " of " + fmt(m.total) : ""}`);
      progress(m.done, m.total);
      break;
    }
    case "models":
      showStored(m.models);
      showStorage();
      break;
    case "retry":
      // The GPU refused the model while loading it: a fresh worker (an empty memory)
      // loads it on the CPU, the reason kept for the load line.
      if (lastLoad) {
        worker.terminate();
        startWorker();
        used = true;
        status("The GPU did not take this model: loading it on the CPU…");
        startLoading();
        worker.postMessage({ ...lastLoad, device: "cpu", auto: false, note: m.note });
      }
      break;
    case "loaded": {
      loadLog("the page received the model: showing it");
      stopLoading();
      progress(0, 0);
      loadedInfo = m;
      drawThink();
      ctxUsed = 0;
      ctxParts = null;
      const i = m.info;
      onGpu = i.device === "webgpu";
      modelName = i.name || source?.name || source?.file?.name || "model";
      modelMark = (source?.name && markOf[source.name]) || null;
      reloadLater();
      showMark();
      $("model-name").textContent = modelName;
      $("model-chip").title = `${source?.name ?? source?.file?.name ?? ""}: ${i.architecture}, ${i.layers} layers; click for another model`;
      const cpu = `${i.isa} kernels on ${i.threads} thread${i.threads === 1 ? "" : "s"}`;
      let where = cpu;
      if (onGpu) {
        const g = i.gpu.name || "WebGPU";
        where = i.gpu_layers >= i.layers
          ? `all ${i.layers} layers${i.gpu_head ? " and the output layer" : ""} on the GPU (${g})`
          : `${i.gpu_layers} of ${i.layers} layers on the GPU (${g}), the others on the CPU (${cpu})`;
      }
      // Why the GPU runs fewer layers, or none: the model, the GPU memory, the limit.
      const why = [m.note, onGpu || deviceUsed.device === "gpu" ? i.gpu_note : "", accountingNote(i)].filter(Boolean).join(". ");
      // Auto chose the GPU, the worker the CPU (a model that needs storage).
      if (m.note?.startsWith("On the CPU")) deviceUsed.label = deviceUsed.label.replace("device GPU (Auto", "device CPU, not the GPU (Auto");
      status(`Loaded in ${m.secs.toFixed(1)} s: ${i.architecture}, ${i.layers} layers, ${fmt(i.bytes)} of weights, ` +
        `context ${i.ctx}, ${where}; WebAssembly memory ${fmt(m.memory)}${gpuBytes(m.gpu)}; ` +
        `${limitUsed}; ${deviceUsed.label}.` + (why ? ` ${why}.` : "") + streamNote(i) + draftNote(i) + (reloadWhy ? " " + t("reloaded", ...reloadWhy) : ""));
      reloadWhy = null;
      $("wmem-hint").textContent = "";
      presetAfterLoad(i);
      // A model loaded: a new conversation (the earlier ones stay in the side bar).
      if (!keepChat) newChat();
      keepChat = false;
      setBusy(false);
      showView("chat");
      $("prompt").focus();
      loadLog("ready to chat");
      break;
    }
    case "piece":
      if (!answer) break;
      if (m.reasoning) think(m.text);
      else {
        // Blank lines before the answer (after </think>, or before <think>) are dropped.
        const text = answerText ? m.text : m.text.trimStart();
        if (!text) break;
        // The answer starts: the reasoning folds away.
        if (thinking?.open && !answerText) thinking.open = false;
        answerText += text;
        renderAnswer(true);
      }
      break;
    case "count":
      // A module without countChat: the gauge keeps the last answer's tokens.
      if (m.id === countId && m.tokens != null) ctxUsed = m.tokens;
      // No parts: not asked (the panel closed), or not countable (false: a module without countChat).
      if (m.id === countId) ctxParts = m.parts ?? (m.tokens == null ? false : null);
      drawGauge();
      break;
    case "trimmed":
      trimmedNote = t(m.dropped === 1 ? "ctx.trimmed.one" : "ctx.trimmed", m.dropped);
      status("Answering… " + trimmedNote);
      break;
    case "done": {
      const s = m.stats;
      // What the conversation now takes: the prompt and the answer (counted exactly next).
      ctxUsed = s.prompt_tokens + s.gen_tokens;
      ctxParts = null;
      lastStats = { ...s, memory: m.memory, gpu: m.gpu };
      // Only the answer goes back to the model, as in inga serve's web UI; the reasoning
      // and the speeds are kept for the page.
      const reasoning = thinking?.lastChild?.textContent || undefined;
      const said = { role: "assistant", content: answerText, reasoning, model: modelName, ...(modelMark ? { mark: modelMark } : {}), at: Date.now(),
        stats: { prompt_tps: s.prompt_tps, gen_tps: s.gen_tps, prompt_tokens: s.prompt_tokens, gen_tokens: s.gen_tokens } };
      messages.push(said);
      speedLine(answerBox, said);
      endAnswer();
      persistChat();
      $("stop").disabled = true;
      const r = s.reasoning_tokens ? ` (${s.reasoning_tokens} of them thinking)` : "";
      $("stats").textContent = `Prompt: ${s.prompt_tokens - s.cached_tokens} tokens at ${s.prompt_tps.toFixed(1)} tok/s` +
        ` (${s.cached_tokens} reused) · answer: ${s.gen_tokens} tokens at ${s.gen_tps.toFixed(1)} tok/s${r}` +
        ` · ${s.stop} · memory ${fmt(m.memory)}${gpuBytes(m.gpu)}` + readNote(s) + draftStats(s) +
        (s.gpu_sampled ? ` · ${s.gpu_sampled} drawn on the GPU` : "");
      status(trimmedNote ? "Ready. " + trimmedNote : "Ready.");
      trimmedNote = "";
      if (stdRunning) {
        stdRunning = false;
        const line = standardLine(s, m);
        $("std-line").textContent = line;
        $("std-out").hidden = false;
        keepResult(line);
        status("Ready. Standard test done: its line is below the chat.");
      }
      setBusy(false);
      break;
    }
    case "gpuprofile":
      showKernels(m);
      $("stop").disabled = true;
      status("Ready. Kernel times done: the table is below. The prompt is not part of the chat: the chat starts again.");
      newChat();
      setBusy(false);
      break;
    case "gpubench":
      showBench(m);
      if (m.done) {
        $("stop").disabled = true;
        status("Ready. The benchmark's prompt is not part of the chat: the chat starts again.");
        newChat();
        setBusy(false);
      }
      break;
    case "disktest":
      progress(0, 0);
      $("disktest-out").textContent = `Read ${m.read_mbs.toFixed(0)} MB/s, write ${m.write_mbs.toFixed(0)} MB/s (${fmt(m.bytes)}, read back right after writing).`;
      status("Ready.");
      setBusy(false);
      break;
    case "error":
      stopLoading();
      progress(0, 0);
      stdRunning = false;
      status(m.message, true);
      // The module stopped (a Rust panic): the model is gone, load it again.
      if (m.panic) {
        source = null;
        used = true;
      }
      if (answer) {
        endAnswer();
        messages.pop();
      }
      $("stop").disabled = true;
      setBusy(false);
      break;
  }
}

// Adds reasoning to the answer streaming: in a "Thinking" <details> above it, open
// while the model reasons.
function think(text) {
  if (!thinking) {
    thinking = document.createElement("details");
    thinking.className = "think";
    thinking.open = true;
    const s = document.createElement("summary");
    s.textContent = "Thinking";
    const body = document.createElement("div");
    body.className = "body";
    thinking.append(s, body);
    answer.before(thinking);
  }
  const body = thinking.lastChild;
  // The blank line after <think> is dropped.
  body.textContent += body.textContent ? text : text.trimStart();
}

// The GPU benchmark's table: a row per kernel choice, as each ends.
function showBench(m) {
  const out = $("bench");
  out.textContent = "";
  const p = document.createElement("p");
  p.textContent = "GPU benchmark: the same prompt and greedy tokens per row (fewer if the model ends its answer), after a warm-up run " +
    `that compiles the row's kernels; shader-f16 ${m.shader_f16 ? "yes" : "no"}; subgroups ${m.subgroups}; ` +
    `timestamp-query ${m.timestamp_query ? "yes" : "no"}; the page's choice for this GPU: ${m.tuning}` +
    (m.done ? "." : " (running…)");
  const t = document.createElement("table");
  const head = t.insertRow();
  for (const h of ["Kernels", "Prompt tok/s", "Answer tok/s", "Tokens", "Waits", "Drawn on GPU", "Same text"]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  for (const r of m.rows) {
    const row = t.insertRow();
    const cells = r.skipped ? [r.label, r.skipped, "", "", "", "", ""]
      : [r.label, r.prompt_tps.toFixed(1), r.gen_tps.toFixed(1), `${r.prompt_tokens} + ${r.gen_tokens}`, String(r.waits), String(r.gpu_sampled),
        r.same ? "yes" : "differs"];
    for (const c of cells) row.insertCell().textContent = c;
    row.title = r.spec;
  }
  out.append(p, t);
}

// The kernel times' table: per decode step, each kernel's calls, time, share and, for
// the products, the weights' bytes read per second.
function showKernels(m) {
  const out = $("kernels");
  out.textContent = "";
  const n = Math.max(m.tokens, 1);
  const total = m.rows.reduce((a, r) => a + r.ms, 0);
  const p = document.createElement("p");
  const how = m.mode === "timestamps"
    ? "timestamp-query, each dispatch in a compute pass of its own (browsers may round timestamps, Chrome to 100 µs " +
      "unless its WebGPU developer features are on: the sums over many dispatches stay right on average)"
    : `no timestamp-query: each dispatch submitted alone and awaited, less the ${m.overhead_ms.toFixed(2)} ms round trip of an empty submission (coarse)`;
  p.textContent = `Kernel times: ${m.tokens} decode steps of the benchmark's prompt, kernels ${m.tuning}; subgroups ${m.subgroups}; ` +
    `timed by ${how}. Kernels ${(total / n).toFixed(2)} ms per token in all; the profiled steps took ${(m.wall_ms / n).toFixed(1)} ms ` +
    "each (timing slows them: the GPU benchmark's answer tok/s is the real speed).";
  const t = document.createElement("table");
  const head = t.insertRow();
  for (const h of ["Kernel", "Build", "Calls per token", "ms per token", "Share", "GB/s"]) {
    const th = document.createElement("th");
    th.textContent = h;
    head.append(th);
  }
  for (const r of m.rows) {
    const row = t.insertRow();
    const gbs = r.bytes && r.ms > 0 ? gb(r.bytes / (r.ms * 1e6)) : "";
    for (const c of [r.label, r.kernel, (r.calls / n).toFixed(1), (r.ms / n).toFixed(3), total > 0 ? `${((100 * r.ms) / total).toFixed(1)} %` : "", gbs]) {
      row.insertCell().textContent = c;
    }
  }
  const bytes = m.rows.reduce((a, r) => a + r.bytes, 0);
  const mv = m.rows.filter((r) => r.bytes).reduce((a, r) => a + r.ms, 0);
  const sum = t.insertRow();
  for (const c of ["All kernels", "", (m.rows.reduce((a, r) => a + r.calls, 0) / n).toFixed(1), (total / n).toFixed(3), "100 %",
    mv > 0 ? `${gb(bytes / (mv * 1e6))} (products)` : ""]) sum.insertCell().textContent = c;
  out.append(p, t);
}

// GB/s with three significant digits (a software GPU reads far under 0.1).
function gb(v) {
  return v >= 100 ? v.toFixed(0) : v.toPrecision(3);
}

function gpuProfile() {
  if (busy || !onGpu) return;
  setBusy(true);
  $("stop").disabled = false;
  $("kernels").textContent = "";
  status("Kernel times: timing every kernel of the loaded model's decode steps…");
  const n = Number(new URLSearchParams(location.search).get("bench_tokens")) || 16;
  worker.postMessage({ type: "gpuprofile", tokens: n });
}

function gpuBench() {
  if (busy || !onGpu) return;
  setBusy(true);
  $("stop").disabled = false;
  $("bench").textContent = "";
  status("GPU benchmark: running the loaded model under each kernel choice…");
  // `?bench_tokens=N` in the page's address: N tokens instead of 32 (the browser tests,
  // on a software GPU).
  const n = Number(new URLSearchParams(location.search).get("bench_tokens")) || 32;
  worker.postMessage({ type: "gpubench", tokens: n });
}

// How the memory limit was applied with layers on the GPU: one limit for WebAssembly
// memory and the GPU's bytes, or the limit for WebAssembly memory alone (the test of
// whether iOS counts a tab's GPU buffers with its memory); and the warning when that
// one limit makes the CPU read layers from storage.
function accountingNote(i) {
  if (!i.gpu_accounting) return "";
  const gpu = fmt(i.gpu_planned);
  const how = $("gacct").value === "auto" ? (isIOS() ? ", Auto on iOS" : ", Auto off iOS") : "";
  let t = i.gpu_accounting === "separate"
    ? `GPU memory accounting: apart${how} (the limit covers WebAssembly memory only, ${fmt(i.memory_planned)} planned; the GPU's ${gpu} only its own budget)`
    : `GPU memory accounting: one limit${how} (the GPU's ${gpu} counted with WebAssembly memory, ${fmt(i.memory_planned)} planned in all)`;
  if (i.gpu_accounting === "one" && (i.streamed_layers || i.output_parts)) {
    t += `. Warning: slower than Device CPU, probably: this model needs storage, and the GPU's share of the one limit leaves the CPU ` +
      `${fmt(i.resident_weights)} of weights and ${fmt(i.stream_read_per_token)} read from storage per token ` +
      `(Qwen3-4B on an iPhone 16 Pro: 0.9 tok/s this way, 2.3 on Device CPU)`;
  }
  return t;
}

// The GPU's share of memory: the weights uploaded and the other buffers (KV cache,
// activations).
function gpuBytes(g) {
  return g ? `, GPU ${fmt(g.weight_bytes)} of weights + ${fmt(g.other_bytes)}` : "";
}

// The Device setting: the GPU only where the browser has WebGPU.
function setupDevice() {
  const opt = $("device").querySelector("option[value=gpu]");
  if (!navigator.gpu) {
    opt.disabled = true;
    // A short label (the Device description says why); setLang keeps it.
    opt.dataset.i18n = "opt.gpu.na";
    opt.textContent = t("opt.gpu.na");
    opt.title = "This browser has no WebGPU (navigator.gpu)";
    if ($("device").value === "gpu") $("device").value = "cpu";
  }
}

// Adapters on which the GPU was measured faster than the CPU with the same model, for
// Device "Auto" ({adapter: a pattern of the adapter's name}). None yet: on the iPhone 16
// Pro (adapter "apple") Qwen3 0.6B answered at 16.3 tok/s on the GPU and about 25 on the
// CPU, and Llama 3.2 1B Q4_K_M's prompt ran at 8.8 tok/s on the GPU against 24.3.
// `?gpu_faster` in the page's address takes every adapter for one (the browser tests).
const GPU_FASTER = new URLSearchParams(location.search).has("gpu_faster") ? [{ adapter: /./ }] : [];

// The device a load uses, and what the load line says of it: the Device setting, with
// Auto resolved (the GPU when the browser has a WebGPU adapter and it was measured
// faster there, else the CPU) and the GPU dropped where the browser has none. `auto`:
// Auto chose the GPU, so the worker keeps a model that needs storage on the CPU (with
// one limit for both, the GPU's share leaves the CPU fewer weights: on an iPhone 16 Pro,
// Qwen3-4B Q4_K_M answered at 0.9 tok/s with 14 layers on the GPU against 2.3 on the CPU
// alone); with Device GPU it warns instead.
async function chooseDevice() {
  const asked = $("device").value;
  if (asked === "cpu") return { device: "cpu", label: "device CPU (Device setting)" };
  if (!navigator.gpu) return { device: "cpu", label: `device CPU: no WebGPU in this browser (Device ${asked === "gpu" ? "GPU" : "Auto"})` };
  let adapter = null;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  } catch {}
  if (!adapter) return { device: "cpu", label: "device CPU: WebGPU offers no adapter here" };
  const i = adapter.info || {};
  const name = [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(" ") || "unnamed adapter";
  if (asked === "gpu") return { device: "gpu", label: `device GPU (Device setting, adapter ${name})` };
  if (GPU_FASTER.some((f) => f.adapter.test(name))) return { device: "gpu", auto: true, label: `device GPU (Auto: measured faster than the CPU on ${name})` };
  return { device: "cpu", label: `device CPU (Auto: the GPU, ${name}, has not been measured faster than the CPU here; choose GPU in the Settings to try it)` };
}

// What the browser's WebGPU adapter is and its limits, for the "GPU info" button.
async function gpuInfo() {
  const out = $("gpu-line");
  if (!navigator.gpu) {
    out.textContent = "No WebGPU in this browser (navigator.gpu is missing).";
    return;
  }
  try {
    const a = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!a) {
      out.textContent = "WebGPU is there but offers no adapter.";
      return;
    }
    const i = a.info || {};
    const name = [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(" ") || "unnamed adapter";
    const l = a.limits;
    // The subgroups' widths: GPUAdapterInfo's (Chrome 134 on), else the older limits'.
    const lo = i.subgroupMinSize ?? l.minSubgroupSize;
    const hi = i.subgroupMaxSize ?? l.maxSubgroupSize;
    const sg = !a.features.has("subgroups") ? "no" : lo && hi ? (lo === hi ? `yes, ${lo} wide` : `yes, ${lo} to ${hi} wide`) : "yes (widths not told)";
    out.textContent = `${name}: maxBufferSize ${fmt(l.maxBufferSize)}, maxStorageBufferBindingSize ` +
      `${fmt(l.maxStorageBufferBindingSize)}, maxComputeWorkgroupStorageSize ${l.maxComputeWorkgroupStorageSize} B, ` +
      `maxStorageBuffersPerShaderStage ${l.maxStorageBuffersPerShaderStage}; shader-f16 ${a.features.has("shader-f16") ? "yes" : "no"}; ` +
      `subgroups ${sg}; timestamp-query ${a.features.has("timestamp-query") ? "yes" : "no"}.`;
  } catch (e) {
    out.textContent = "WebGPU: " + (e.message || e);
  }
}

function showSuggested() {
  const ul = $("suggested");
  ul.textContent = "";
  for (const s of SUGGESTED) {
    const li = document.createElement("li");
    const d = document.createElement("div");
    d.innerHTML = `<div></div><div class="meta"></div>`;
    const file = fileName(s.url);
    const stored = storedSize[file] != null;
    d.firstChild.textContent = s.label + (stored ? " · stored ✓" : "");
    d.lastChild.textContent = `${file} · ${s.size} · ${s.licence}`;
    const b = document.createElement("button");
    b.textContent = "Get";
    b.dataset.act = "1";
    b.onclick = () => fromUrl(s.url);
    // Where the page cannot download (a preview frame), the file is saved by the
    // browser from this link, then picked with option 2.
    const a = document.createElement("a");
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Save file";
    const row = document.createElement("div");
    row.className = "row";
    row.append(b, a);
    li.append(d, row);
    ul.append(li);
  }
}

// Every file this site stores (the worker lists OPFS recursively): the models, then
// anything else (an interrupted disk test, files of older pages), each with a Delete, so
// no space is used by something the page does not show.
function showStored(models) {
  const ul = $("stored");
  ul.textContent = "";
  for (const k of Object.keys(storedSize)) delete storedSize[k];
  for (const m of models) if (m.model && m.complete !== false && !m.error) storedSize[m.name] = m.size;
  showDraftChoices();
  showSuggested();
  picker.render();
  if (!models.length) {
    ul.innerHTML = `<li class="meta">None yet.</li>`;
    return;
  }
  for (const m of models) {
    const li = document.createElement("li");
    const d = document.createElement("div");
    d.innerHTML = `<div></div><div class="meta"></div>`;
    d.firstChild.textContent = m.name;
    let meta;
    if (m.error) meta = `cannot be read: ${m.error}`;
    else if (!m.model) meta = `${fmt(m.size)} · not a model of this page`;
    else if (m.complete === null) meta = `${fmt(m.size)} · complete or not: unknown (no download record)`;
    else meta = m.complete ? fmt(m.size) : `incomplete: ${fmt(m.size)}${m.total ? " of " + fmt(m.total) : ""}`;
    d.lastChild.textContent = meta;
    const row = document.createElement("div");
    row.className = "row";
    if (m.model && !m.error) {
      const load = document.createElement("button");
      load.dataset.act = "1";
      if (m.complete !== false) {
        load.textContent = "Load";
        load.onclick = () => loadStored(m.name);
      } else {
        load.textContent = "Resume";
        load.disabled = !m.url;
        load.onclick = () => fromUrl(m.url);
      }
      row.append(load);
    }
    const del = document.createElement("button");
    del.className = "ghost";
    del.dataset.act = "1";
    del.textContent = "Delete";
    del.onclick = () => worker.postMessage({ type: "delete", path: m.path });
    row.append(del);
    li.append(d, row);
    ul.append(li);
  }
  setBusy(busy);
}

async function showStorage() {
  if (!navigator.storage?.estimate) return;
  const e = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  $("storage").textContent = `This site uses ${fmt(e.usage || 0)} of ${fmt(e.quota || 0)} available` +
    ` · ${persisted ? "kept by the browser (persistent)" : "may be cleared by the browser when space runs low"}` +
    ` · ${navigator.deviceMemory ? "device memory about " + navigator.deviceMemory + " GB" : ""}`;
}

// Asks the browser to keep the stored models (once, before the first download).
async function persist() {
  if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
}

function ctx() {
  return Number($("ctx").value) || 2048;
}

// `from`: the catalog's model and variant the link is of, for a clearer message when
// the file is not there (the catalog is checked by tools/wasm-catalog.py, but a
// repository may move after).
async function fromUrl(url, from = null) {
  try {
    url = new URL(url, location.href).href;
  } catch {
    status("That is not a link.", true);
    return;
  }
  const name = fileName(url);
  // A catalog model's family (its mark); a link's has none.
  setMark(name, from ? familyOf(from.model) : null);
  setBusy(true);
  await persist();
  status(`Downloading ${name}…`);
  source = null;
  const done = new Promise((resolve) => {
    const prev = worker.onmessage;
    worker.onmessage = ({ data: m }) => {
      onMessage(m);
      if (m.type === "models" || m.type === "error") {
        worker.onmessage = prev;
        resolve(m.type === "models");
      }
    };
  });
  dlRate = null;
  worker.postMessage({ type: "download", url, name });
  const ok = await done;
  // The speed measured, for the picker's estimate of the next download.
  if (ok && dlRate?.rate) saveSpeed(dlRate.rate);
  dlRate = null;
  if (ok) loadStored(name);
  else if (from && /HTTP (404|401|403)/.test($("status").textContent)) {
    status(`${$("status").textContent}. This is the model catalog's ${from.model.name}, ${from.variant.quant}: the file is not ` +
      `(or no longer) where the catalog says${from.variant.approx ? " (the catalog has not been checked against Hugging Face yet)" : ""}. ` +
      "Pick another variant or model, or paste a link to the file (option 1).", true);
  }
}

// WebAssembly memory only grows: a model loaded after another would keep the first
// one's peak (878.9 MiB after Llama 3.2 1B, against 643.8 MiB for Qwen3 0.6B alone on
// an iPhone). A worker that has loaded a model is ended and a new one started, as Stop
// does, so each model starts from a fresh memory.
function freshWorker() {
  if (!used) return;
  worker.terminate();
  startWorker();
}

let lastLoad = null; // the last load of a stored model, for a retry on the CPU

async function loadStored(name) {
  source = { name };
  setBusy(true);
  status(`Loading ${name}…`);
  // The context the catalog gives this model, unless set by hand (preset.js).
  await presetBeforeLoad(name);
  snapLoad();
  freshWorker();
  used = true;
  const { budget, label } = memoryLimit();
  limitUsed = label;
  deviceUsed = await chooseDevice();
  const gpuBudget = gpuLimit(budget);
  const separate = gpuSeparate();
  if (deviceUsed.device === "gpu") limitUsed += `, GPU memory ${gpuBudget.label}`;
  // A draft model drafts on the CPU only: on the GPU the model answers without it.
  const draft = deviceUsed.device === "gpu" ? null : draftFor(name);
  if (deviceUsed.device === "gpu" && draftFor(name)) deviceUsed.label += "; no draft model on the GPU yet (Draft model ignored)";
  lastLoad = { type: "load", name, ctx: ctx(), budget, draft, device: deviceUsed.device, gpuBudget: gpuBudget.bytes, gpuSeparate: separate, auto: !!deviceUsed.auto };
  startLoading();
  worker.postMessage(lastLoad);
}

async function loadFile(file) {
  // Larger than the memory limit, or for the GPU: copied into OPFS first, whence Inga
  // reads it at offsets (what does not fit is read while it runs; the GPU's layers go
  // from there to its buffers). A smaller file for the CPU loads from memory, whole.
  const { budget } = memoryLimit();
  const gpu = (await chooseDevice()).device === "gpu";
  // A draft model runs beside a stored model only: the file is stored first.
  const drafting = !!draftFor(file.name);
  if ((drafting || gpu || (budget != null && file.size > budget)) && navigator.storage?.getDirectory) {
    importFile(file);
    return;
  }
  source = { file };
  snapLoad();
  setBusy(true);
  status(`Loading ${file.name}…`);
  freshWorker();
  used = true;
  deviceUsed = { device: "cpu", label: gpu ? "device CPU: the GPU reads a model from this site's storage, which this browser lacks" : (await chooseDevice()).label };
  limitUsed = budget == null ? "everything in memory (All in memory)" : "everything in memory (a file of this device smaller than the limit)";
  lastLoad = null;
  startLoading();
  worker.postMessage({ type: "load", file, ctx: ctx(), device: "cpu" });
}

function send() {
  const text = $("prompt").value.trim();
  if (!text || busy || !source) return;
  $("prompt").value = "";
  const opts = { max_tokens: maxTokens(), temperature: Number($("temp").value), thinking: $("think").checked };
  // The sampler's Settings: each one sent when it is a number (empty: Inga's default).
  for (const [id, key] of [["topp", "top_p"], ["topk", "top_k"], ["minp", "min_p"], ["rep", "repeat_penalty"], ["pres", "presence_penalty"], ["freq", "frequency_penalty"]]) {
    const v = $(id).value.trim();
    if (v !== "" && Number.isFinite(Number(v))) opts[key] = Number(v);
  }
  ask(text, opts);
}

// What the model is sent: the system prompt (Settings), then the conversation's last
// messages ("Past messages sent", 0 for all), as {role, content}.
function wire(list) {
  const past = Math.max(0, Math.round(Number($("past").value) || 0));
  // The last question always goes, and the cut never starts on an answer.
  let msgs = past ? list.slice(-past) : list;
  while (msgs.length > 1 && msgs[0].role !== "user") msgs = msgs.slice(1);
  const out = msgs.map((m) => ({ role: m.role, content: m.content }));
  const sys = $("sys").value.trim();
  if ($("sys-on").checked && sys) out.unshift({ role: "system", content: sys });
  return out;
}

// Sends `text` as the user's next message with `opts`.
function ask(text, opts) {
  const mine = { role: "user", content: text, at: Date.now() };
  messages.push(mine);
  startChat(text);
  // The settings of this question, kept with the conversation (its backup carries them).
  if (!stdRunning) {
    chat.settings = { params: { ...opts }, system: $("sys-on").checked ? $("sys").value.trim() : "" };
  }
  $("chat").querySelector(".empty")?.remove();
  $("chat").append(userBubble(mine));
  answerBox = botBubble(null);
  answer = answerBox.querySelector(".a");
  answerText = "";
  $("chat").append(answerBox);
  answerBox.scrollIntoView({ block: "end" });
  setBusy(true);
  $("stop").disabled = false;
  status("Answering…");
  stopFlag = self.crossOriginIsolated ? new Int32Array(new SharedArrayBuffer(4)) : null;
  // The Standard test sends its prompt alone, whatever the Settings.
  const sent = stdRunning ? messages.map((m) => ({ role: m.role, content: m.content })) : wire(messages);
  // A conversation longer than the context loses its oldest messages (the worker cuts
  // them, ctx.js), the answer's room kept.
  trimmedNote = "";
  const fit = stdRunning ? undefined : promptLimit(ctxSize(), opts.max_tokens);
  worker.postMessage({ type: "chat", messages: sent, opts: thinkOpts(opts), stop: stopFlag?.buffer, fit });
  armQuiet();
}

// ---- The standard test: a fixed run on the loaded model, comparable across devices ----

const STD_PROMPT = "Ciao, presentati in tre frasi.";
const STD_OPTS = { max_tokens: 64, temperature: 0, thinking: false };
const STD_KEY = "inga.standard-tests";
let stdRunning = false;

function standardTest() {
  if (busy || !source) return;
  // A new conversation: the worker's too. The Settings' system prompt and past
  // messages do not apply (`stdRunning`).
  newChat();
  $("stats").textContent = "";
  worker.postMessage({ type: "reset" });
  stdRunning = true;
  ask(STD_PROMPT, STD_OPTS);
}

// The result line of a standard test from the answer's statistics `s` and the "done"
// message `m`.
function standardLine(s, m) {
  const i = loadedInfo?.info ?? {};
  const mib = (b) => (b / (1 << 20)).toFixed(1) + " MiB";
  const gpu = i.device === "webgpu" ? `GPU (${i.gpu?.name || "WebGPU"})` : "CPU";
  const parts = [
    new Date().toISOString(),
    `device ${gpu}${deviceUsed.label ? "" : ""}`,
    `model ${source?.name ?? source?.file?.name ?? "?"}`,
    limitUsed,
    `GPU layers ${i.gpu_layers ?? 0}/${i.layers ?? "?"}${i.gpu_head ? "+output" : ""}`,
    `streamed ${i.streamed_layers ?? 0}${i.output_parts ? ` + output in ${i.output_parts} parts` : ""}`,
    `prompt ${s.prompt_tokens - s.cached_tokens} tok at ${s.prompt_tps.toFixed(2)} tok/s`,
    `answer ${s.gen_tokens} tok at ${s.gen_tps.toFixed(2)} tok/s`,
    `wasm ${mib(m.memory)}`,
    m.gpu ? `GPU ${mib(m.gpu.weight_bytes)} weights + ${mib(m.gpu.other_bytes)}` : "GPU -",
    `read/token ${s.read_per_token ? mib(s.read_per_token) : "0"}`,
  ];
  if (i.gpu_accounting) parts.push(`accounting ${i.gpu_accounting}`);
  // Why the GPU was asked and the CPU ran it: the worker's note, else the plan's.
  const fallback = loadedInfo?.note || (i.device !== "webgpu" && deviceUsed.device === "gpu" ? i.gpu_note : "");
  if (fallback) parts.push(`fallback: ${shortNote(fallback)}`);
  if (s.gpu_sampled) parts.push(`${s.gpu_sampled} drawn on GPU`);
  if (s.draft_tokens) parts.push(`draft ${s.draft_accepted}/${s.draft_tokens} accepted, ${s.accepted_per_check.toFixed(2)} per check`);
  return parts.filter(Boolean).join(" | ");
}

// A load note in a few words for the Standard test's line: without its leading
// "On the CPU", at most 160 characters.
function shortNote(note) {
  const s = String(note).replace(/^On the CPU( \(Auto\))?: /, "").replace(/\s+/g, " ").trim();
  return s.length > 160 ? s.slice(0, 157) + "..." : s;
}

function storedResults() {
  try {
    const v = JSON.parse(localStorage.getItem(STD_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function showResults() {
  const all = storedResults();
  $("std-count").textContent = String(all.length);
  $("std-list").textContent = all.join("\n");
}

function keepResult(line) {
  const all = storedResults();
  all.push(line);
  try {
    localStorage.setItem(STD_KEY, JSON.stringify(all));
  } catch {}
  showResults();
}

// Copies `text`, or selects `el`'s text where the clipboard is refused.
async function copyText(text, el) {
  try {
    await navigator.clipboard.writeText(text);
    status("Copied.");
  } catch {
    const r = document.createRange();
    r.selectNodeContents(el);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    status("Selected: copy it with the system's Copy.");
  }
}

function stop() {
  // On the GPU the worker waits for the GPU between tokens: it reads the message then.
  if (onGpu) {
    worker.postMessage({ type: "stop" });
    return;
  }
  if (stopFlag) {
    Atomics.store(stopFlag, 0, 1);
    return;
  }
  // Without cross-origin isolation the worker cannot be told while it computes: it is
  // ended, and the model loaded again (from OPFS or the same file).
  worker.terminate();
  if (answer) messages.push({ role: "assistant", content: answerText, model: modelName, ...(modelMark ? { mark: modelMark } : {}), at: Date.now() });
  endAnswer();
  persistChat();
  $("stop").disabled = true;
  keepChat = true;
  startWorker();
  // Messages to a worker wait until it has started.
  if (source?.file) loadFile(source.file);
  else if (source) loadStored(source.name);
  status("Stopped; loading the model again…");
}

// ---- Memory for the model: what does not fit is read from OPFS while it runs ----

const MB = 1 << 20;
// Auto's limits, for everything the model keeps in memory: the weights held, the read
// buffers, the KV cache for the context and the activations (Inga plans them all, and
// refuses a model that cannot fit rather than letting the browser end the tab).
// iOS: measured on an iPhone 16 Pro (8 GB): with Qwen3-4B Q4_K_M, Safari kept the tab
// at 1.75 GiB of WebAssembly memory and ended it at a limit of 2000 MB (about 2.2 GiB);
// Auto stays at 1600 MB, under that ceiling with a margin for the browser's own
// allocations; a phone with less memory may need less ("Limit in MB"). Elsewhere a
// starting point.
const AUTO_IOS = 1600 * MB; // below the 1.75 GiB measured, for a margin
// Elsewhere (a desktop) close to what a 32-bit WebAssembly module addresses: 4 GiB, less
// the browser's own; above it a model's resident part cannot grow, so a larger model
// always reads from storage (WebAssembly Memory64, in Chrome, not yet in Safari, would
// lift it).
const AUTO_OTHER = 3584 * MB;
const storedSize = {};

// A heuristic: iPhone, iPad, and the iPad that says it is a Mac (it has a touch screen).
function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// The memory limit the Settings ask for: `budget` in bytes (null: everything in
// memory), and `label`, what the load line says of it.
function memoryLimit() {
  const how = $("wmem").value;
  if (how === "all") return { budget: null, label: "everything in memory (All in memory)" };
  if (how === "mb") {
    const mb = Math.max(1, Math.round(Number($("wmem-mb").value) || 0));
    return { budget: mb * MB, label: `limit ${mb} MB (Limit in MB)` };
  }
  const b = isIOS() ? AUTO_IOS : AUTO_OTHER;
  return { budget: b, label: `limit ${b / MB} MB (Auto${isIOS() ? " on iOS" : ""})` };
}

// What the GPU may hold of the model (its layers' weights and KV cache, its buffers),
// within `budget`, the memory limit (bytes, null: none), which counts the GPU's bytes
// too: Auto is 1024 MB on iOS (Llama 3.2 1B, about 0.9 GiB on the GPU, is the largest
// model measured to load on an iPhone 16 Pro's GPU page), the memory limit elsewhere.
// Elsewhere 3 GiB: a guess (WebGPU tells no GPU's memory), which a 4 GB card holds,
// with the GPU's bytes apart from the memory limit (gpuSeparate): a 4B Q4_K_M model,
// about 2.5 GB, then runs whole on the GPU of a 4 GB desktop card.
const AUTO_GPU_OTHER = 3072 * MB;
const AUTO_GPU_IOS = 1024 * MB;
function gpuLimit(budget) {
  if ($("gmem").value === "mb") {
    const mb = Math.max(1, Math.round(Number($("gmem-mb").value) || 0));
    return { bytes: mb * MB, label: `${mb} MB (Limit in MB)` };
  }
  if (isIOS()) return { bytes: AUTO_GPU_IOS, label: `${AUTO_GPU_IOS / MB} MB (Auto on iOS)` };
  if (gpuSeparate()) return { bytes: AUTO_GPU_OTHER, label: `${AUTO_GPU_OTHER / MB} MB (Auto: a guess, WebGPU does not tell the GPU's memory; set it in MB)` };
  const b = budget ?? 4096 * MB;
  return { bytes: b, label: `${Math.round(b / MB)} MB (Auto: the memory limit)` };
}

// Whether the GPU's bytes are planned apart from "Memory for the model" (which then
// bounds WebAssembly memory only): the accounting setting, Auto being one limit on iOS
// (whose tab limit may count GPU buffers: the guide's step 7 tests it) and apart
// elsewhere (a desktop's graphics memory is not the tab's).
function gpuSeparate() {
  const v = $("gacct").value;
  return v === "apart" || (v === "auto" && !isIOS());
}

function streamNote(i) {
  const parts = i.output_parts ?? 0;
  const rows = i.read_by_row ?? 0;
  if (!i.streamed_layers && !parts && !rows) return "";
  let t = "";
  if (i.streamed_layers || parts) {
    t += i.streamed_layers ? ` ${i.streamed_layers} of ${i.layers} layers read from this site's storage at every token` : " Read from this site's storage at every token:";
    if (parts) t += `${i.streamed_layers ? ", and" : ""} the output layer in ${parts} part${parts === 1 ? "" : "s"}`;
    t += ` (${fmt(i.stream_read_per_token)} per token);`;
  }
  if (rows) t += ` ${fmt(rows)} of embeddings read a row per token;`;
  return t + ` ${fmt(i.resident_weights)} of weights in memory, ${fmt(i.memory_planned)} planned with the KV cache and activations.`;
}

function readNote(s) {
  if (!s.stream_read_bytes) return "";
  const secs = s.stream_read_secs;
  const per = s.read_per_token ? `; ${fmt(s.read_per_token)} per token after the first` : "";
  return ` · read ${fmt(s.stream_read_bytes)} from storage in ${secs.toFixed(1)} s (${(s.stream_read_bytes / 1e6 / Math.max(secs, 1e-9)).toFixed(0)} MB/s${per})`;
}

// ---- Draft model: a smaller stored model of the same vocabulary guesses tokens that
// the model checks several at a time, reading each streamed layer once per check ----

let draftWanted = ""; // the stored model chosen as draft ("": none), kept in the Settings

// The draft for a load of `name`: the one chosen, if it is stored and not the model.
function draftFor(name) {
  return draftWanted && draftWanted !== name && storedSize[draftWanted] != null ? draftWanted : null;
}

function showDraftChoices() {
  const sel = $("draft");
  sel.textContent = "";
  const none = document.createElement("option");
  none.value = "";
  none.dataset.i18n = "opt.none";
  none.textContent = t("opt.none");
  sel.append(none);
  for (const name of Object.keys(storedSize).sort()) {
    const o = document.createElement("option");
    o.value = name;
    // A short label (a long file name cut in the middle); the whole name in its tooltip.
    const base = name.replace(/\.gguf$/i, "");
    o.textContent = base.length > 24 ? `${base.slice(0, 12)}…${base.slice(-11)}` : base;
    o.title = `${name} (${fmt(storedSize[name])})`;
    sel.append(o);
  }
  sel.value = storedSize[draftWanted] != null ? draftWanted : "";
}

function draftNote(i) {
  const d = i.draft;
  if (!d) return draftWanted && source?.name === draftWanted ? " No draft: the model chosen as draft is the model itself." : "";
  return ` Draft model ${d.name}: ${d.layers} layers, ${fmt(d.memory_planned)} in memory (weights, KV cache, activations), ` +
    `${d.tokens} tokens guessed before each check.`;
}

function draftStats(s) {
  if (!s.draft_tokens && !s.draft_paused) return "";
  const paused = s.draft_paused ? `; paused ${s.draft_paused}× for not paying` : "";
  return ` · draft: ${s.draft_tokens} proposed, ${s.draft_accepted} accepted, ${s.accepted_per_check.toFixed(2)} accepted per check` +
    ` (${s.draft_checks} checks, ${s.decode_passes} passes of the model)${paused}`;
}

function importFile(file) {
  setBusy(true);
  status(`Copying ${file.name} into this site's storage…`);
  const prev = worker.onmessage;
  worker.onmessage = ({ data: m }) => {
    onMessage(m);
    if (m.type === "models" || m.type === "error") {
      worker.onmessage = prev;
      if (m.type === "models") loadStored(file.name);
    }
  };
  persist().then(() => worker.postMessage({ type: "import", file }));
}

// ---- Settings, kept in this browser (localStorage, when it allows) ----

const SETTINGS = ["ctx", "max", "temp", "think", "wmem", "wmem-mb", "draft", "device", "gmem", "gmem-mb", "gacct",
  "topp", "topk", "minp", "rep", "pres", "freq", "sys-on", "sys", "past", "sendkey", "theme", "fontsize", "lang", "loglevel"];
// The settings that are a choice among options, and those options.
const CHOICES = { wmem: ["auto", "all", "mb"], device: ["cpu", "auto", "gpu"], gmem: ["auto", "mb"], gacct: ["auto", "one", "apart"],
  sendkey: ["enter", "ctrl"], theme: ["auto", "light", "dark"], fontsize: ["small", "normal", "large", "xlarge"], lang: ["en", "it"],
  loglevel: ["all", "summary", "off"] };
const SETTINGS_KEY = "inga.settings";

function saveSettings() {
  const v = {};
  for (const id of SETTINGS) v[id] = $(id).type === "checkbox" ? $(id).checked : $(id).value;
  // The draft is kept by name even while its file is not listed.
  v.draft = draftWanted;
  // The preset fields changed by hand (preset.js).
  v.hand = [...hand];
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(v));
  } catch {}
}

function restoreSettings() {
  let v = null;
  try {
    v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
  } catch {}
  if (!v || typeof v !== "object") {
    // A first visit to the beta: WebGPU when the browser has it (the GPU's own fallbacks
    // load on the CPU what it does not run); not on iOS, where the GPU was slower.
    if (BETA && navigator.gpu && !isIOS()) $("device").value = "gpu";
    return;
  }
  // A page saved before the presets: the fields not at their default were set by hand.
  hand = Array.isArray(v.hand) ? new Set(v.hand.filter((id) => PRESET_FIELDS.includes(id))) : handFromSaved(v, PRESET_BASE);
  for (const id of SETTINGS) {
    if (!(id in v)) continue;
    if (id === "draft") draftWanted = typeof v.draft === "string" ? v.draft : "";
    else if ($(id).type === "checkbox") $(id).checked = !!v[id];
    else if (!CHOICES[id] || CHOICES[id].includes(v[id])) $(id).value = String(v[id]);
  }
}

// ---- Per-model presets (preset.js): the sampling and context a model comes with ----

// The page's own defaults of the preset fields (its markup), before the saved settings.
const PRESET_BASE = Object.fromEntries(PRESET_FIELDS.map((id) => [id, $(id).value]));
// The preset fields changed by hand: the user's, kept over any model's preset.
let hand = new Set();
// The loaded model's preset, and its catalog entry's name.
let preset = null;
let presetModel = "";
let catalogData;

// The catalog (catalog.json), once; null when it cannot be read.
async function catalogOnce() {
  if (catalogData === undefined) {
    try {
      const r = await fetch("catalog.json", { cache: "no-cache" });
      catalogData = r.ok ? await r.json() : null;
    } catch {
      catalogData = null;
    }
  }
  return catalogData;
}

// Writes `values` (field id -> value) into the Settings.
function setFields(values) {
  for (const [id, v] of Object.entries(values)) $(id).value = String(v);
}

// Before a load of the stored file `name`: the context of its catalog entry (or the
// page's default), unless set by hand.
async function presetBeforeLoad(name) {
  if (hand.has("ctx")) return;
  const entry = catalogEntry(await catalogOnce(), name);
  setFields({ ctx: presetOf({}, entry).values.ctx ?? PRESET_BASE.ctx });
  saveSettings();
}

// A model loaded (its `info`): its preset into the Settings' fields not set by hand.
async function presetAfterLoad(info) {
  const name = source?.name ?? source?.file?.name ?? "";
  const entry = catalogEntry(await catalogOnce(), name);
  preset = presetOf(info.recommended_sampling ?? {}, entry);
  presetModel = entry?.name ?? info.name ?? name;
  setFields(presetValues(preset, PRESET_BASE, hand));
  saveSettings();
  presetLine();
}

// The Settings' line on the preset: whose values the answers use.
function presetLine() {
  const el = $("preset-line");
  if (!el) return;
  const mine = PRESET_FIELDS.filter((id) => hand.has(id));
  $("preset-reset").hidden = !mine.length;
  if (!preset) {
    el.textContent = mine.length ? t("preset.yours.none", mine.map(fieldName).join(", ")) : t("preset.none");
    return;
  }
  const what = describePreset(preset);
  const where = Object.values(preset.from).includes("catalog")
    ? t("preset.src.catalog", preset.source ?? "catalog.json")
    : t("preset.src.gguf");
  const model = what ? t("preset.model", presetModel, what, where) : t("preset.empty", presetModel);
  el.textContent = mine.length ? `${t("preset.yours", mine.map(fieldName).join(", "))} ${model}` : model;
}

// A field's label in the Settings.
function fieldName(id) {
  return document.querySelector(`label[for="${id}"]`)?.textContent ?? id;
}

// "Use the model's settings": the fields set by hand back to the model's preset (or
// the page's defaults without a model).
function presetReset() {
  const ctxBefore = $("ctx").value;
  for (const id of PRESET_FIELDS) hand.delete(id);
  setFields(presetValues(preset, PRESET_BASE, hand));
  saveSettings();
  presetLine();
  // A context changed: the model reloads when Settings is left.
  if (source && $("ctx").value !== ctxBefore) {
    loadTouched.add("ctx");
    $("wmem-hint").textContent = t("set.reloadnote");
  }
}

restoreSettings();
applyLook();
$("preset-reset").onclick = presetReset;
$("wmem-mb").hidden = $("wmem").value !== "mb";
$("gmem-mb").hidden = $("gmem").value !== "mb";
for (const id of SETTINGS) {
  $(id).addEventListener("change", () => {
    if (id === "draft") draftWanted = $("draft").value;
    // A preset field changed by hand: the user's from now on.
    if (PRESET_FIELDS.includes(id)) {
      hand.add(id);
      presetLine();
    }
    saveSettings();
    if (id === "wmem") $("wmem-mb").hidden = $("wmem").value !== "mb";
    if (id === "gmem") $("gmem-mb").hidden = $("gmem").value !== "mb";
    if (["theme", "fontsize", "lang", "sendkey"].includes(id)) applyLook();
    // What the model reads, or the context it has: the gauge again.
    if (["sys-on", "sys", "past", "ctx", "lang"].includes(id)) countSoon(0);
    // The answer's room in the ring's panel.
    else if (id === "max") drawGauge();
    // The context, the memory limits, the draft and the device are a load's: say so
    // while a model is loaded.
    if (LOAD_IDS.includes(id)) loadTouched.add(id);
    if (source && ["ctx", "wmem", "wmem-mb", "draft", "device", "gmem", "gmem-mb", "gacct"].includes(id)) {
      $(id.startsWith("device") || id.startsWith("g") ? "device-hint" : "wmem-hint").textContent = t("set.reloadnote");
    }
  });
}
// "Delete all stored data": confirmed inside the page, then the worker removes the whole
// OPFS tree (closing the model it reads first).
$("wipe").onclick = () => {
  $("wipe-confirm").hidden = false;
  $("wipe").hidden = true;
};
$("wipe-no").onclick = () => {
  $("wipe-confirm").hidden = true;
  $("wipe").hidden = false;
};
$("wipe-yes").onclick = () => {
  $("wipe-confirm").hidden = true;
  $("wipe").hidden = false;
  if (source?.name) source = null;
  setBusy(true);
  status("Deleting all stored data…");
  // The conversations too (IndexedDB).
  chats.clear().catch(() => {}).then(() => {
    newChat();
    showConvs();
  });
  const prev = worker.onmessage;
  worker.onmessage = ({ data: m }) => {
    onMessage(m);
    if (m.type === "models" || m.type === "error") {
      worker.onmessage = prev;
      if (m.type === "models") status("All stored data deleted.");
      setBusy(false);
    }
  };
  worker.postMessage({ type: "wipe" });
};
$("disktest").onclick = () => {
  setBusy(true);
  $("disktest-out").textContent = "";
  status("Disk speed test: writing and reading 256 MiB…");
  worker.postMessage({ type: "disktest" });
};

$("url-go").onclick = () => $("url").value && fromUrl($("url").value);
$("file").onchange = (e) => e.target.files[0] && loadFile(e.target.files[0]);
$("send").onclick = send;
$("gpu-info").onclick = gpuInfo;
$("gpubench").onclick = gpuBench;
$("gpuprofile").onclick = gpuProfile;
$("stdtest").onclick = standardTest;
$("std-copy").onclick = () => copyText($("std-line").textContent, $("std-line"));
$("std-copy-all").onclick = () => copyText(storedResults().join("\n"), $("std-list"));
$("std-clear").onclick = () => {
  try {
    localStorage.removeItem(STD_KEY);
  } catch {}
  showResults();
};
showResults();
$("stop").onclick = stop;
$("reset").onclick = () => newChat();
$("new-chat").onclick = () => {
  newChat();
  showView("chat");
};
// The draft counts too, once the typing pauses.
$("prompt").addEventListener("input", () => countSoon());
$("think").addEventListener("change", () => countSoon(0));
// A click or a tap opens the ring's panel (a touch screen has no tooltip), a second one
// closes it, as do Escape and a tap outside it.
$("ctx-gauge").onclick = () => ($("ctx-pop").hidden ? openDetail() : closeDetail());
document.addEventListener("pointerdown", (e) => {
  if (!$("ctx-pop").hidden && !e.target.closest?.("#ctx-pop, #ctx-gauge")) closeDetail();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("ctx-pop").hidden) {
    e.preventDefault();
    closeDetail(true);
  }
});
// The send key of the Settings: Enter (Shift+Enter a new line), or Ctrl / ⌘ + Enter
// (Enter a new line). A composition (an IME) is never cut short.
$("prompt").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.isComposing) return;
  const ctrl = $("sendkey").value === "ctrl";
  if (ctrl ? e.ctrlKey || e.metaKey : !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    send();
  }
});

// ---- Conversations (chats.js): the side bar's list, kept in this browser ----

const when = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

function userBubble(m) {
  const row = document.createElement("div");
  row.className = "msg me";
  const u = document.createElement("div");
  u.className = "u";
  u.textContent = m.content;
  row.append(u);
  return row;
}

// An answer's message: Inga's mark, the model's name, its text (Markdown), its speeds.
// `m` null: the answer about to stream.
function botBubble(m) {
  const row = document.createElement("div");
  row.className = "msg bot";
  const img = avatar(m ? m.mark : modelMark);
  const col = document.createElement("div");
  col.className = "col";
  const who = document.createElement("div");
  who.className = "who";
  who.textContent = m?.model || modelName || "Inga";
  const a = document.createElement("div");
  a.className = "a md";
  const speed = document.createElement("div");
  speed.className = "speed";
  col.append(who, a, speed);
  row.append(img, col);
  if (m) {
    if (m.reasoning) {
      const d = document.createElement("details");
      d.className = "think";
      const s = document.createElement("summary");
      s.textContent = "Thinking";
      const body = document.createElement("div");
      body.className = "body";
      body.textContent = m.reasoning;
      d.append(s, body);
      a.before(d);
    }
    markdown(a, m.content);
    a.dataset.raw = m.content;
    speedLine(row, m);
  }
  return row;
}

// ---- A load's settings: changed in Settings, the model reloads when Settings is left
// (after the answer running, if one is); the sampler's settings never reload it ----
const LOAD_IDS = ["device", "ctx", "wmem", "wmem-mb", "gmem", "gmem-mb", "gacct", "draft"];
let loadedWith = null; // the load settings of the model's load
// The load settings changed by hand since (a change event): the page's own changes (a
// model's preset) never reload.
const loadTouched = new Set();
let reloadPending = false;
let reloadWhy = null; // [model, where, setting] of a reload asked by a setting, for its status line
function snapLoad() {
  loadedWith = Object.fromEntries(LOAD_IDS.map((id) => [id, $(id).value]));
  loadTouched.clear();
}
// The first load setting that differs from the load's, or null. A limit in MB counts
// only while its setting is "Limit in MB".
function changedLoad() {
  if (!source || !loadedWith) return null;
  return LOAD_IDS.find((id) => {
    if (!loadTouched.has(id)) return false;
    if (id.endsWith("-mb") && $(id.slice(0, -3)).value !== "mb" && loadedWith[id.slice(0, -3)] !== "mb") return false;
    return $(id).value !== loadedWith[id];
  }) ?? null;
}
function reloadIfChanged() {
  const id = changedLoad();
  if (!id) return;
  if (busy || answer) {
    reloadPending = true;
    return;
  }
  reloadPending = false;
  const dev = $("device").value;
  const where = dev === "cpu" ? t("reload.cpu") : dev === "gpu" ? t("reload.gpu") : "";
  const setting = document.querySelector(`label[for="${id.replace(/-mb$/, "")}"]`)?.textContent.trim() ?? id;
  reloadWhy = [modelName || source?.name || source?.file?.name || "", where, setting];
  const why = t("reload", ...reloadWhy);
  // The conversation stays: the same model, loaded again.
  keepChat = true;
  if (source.name) loadStored(source.name);
  else if (source.file) loadFile(source.file);
  else return;
  status(why);
}
// Once free again (an answer ended, a load done), a reload asked meanwhile.
function reloadLater() {
  if (reloadPending) setTimeout(() => !busy && !answer && reloadIfChanged(), 0);
}

// The avatar of an answer: its model's mark (`mark`: its catalog family's logo, else its
// emoji, on a round tile), or Inga's logo for a model the catalog did not give.
function avatar(mark) {
  if (!mark?.logo && !mark?.icon) {
    const img = document.createElement("img");
    img.className = "avatar";
    img.src = "logo.svg";
    img.alt = "";
    return img;
  }
  const el = document.createElement(mark.logo ? "img" : "span");
  el.className = "avatar fam";
  el.dataset.family = mark.family ?? "";
  el.title = mark.label ?? "";
  if (mark.logo) {
    el.src = mark.logo;
    el.alt = "";
  } else {
    el.textContent = mark.icon;
    el.setAttribute("aria-hidden", "true");
  }
  return el;
}

// ---- The model's mark: a file downloaded through the model catalog keeps its family
// (by file name, in this browser), so the answers it writes carry its logo or emoji; a
// model loaded by link or from a file of this device has none (Inga's logo) ----
const MARKS_KEY = "inga.marks";
let markOf = {};
try {
  markOf = JSON.parse(localStorage.getItem(MARKS_KEY) || "{}") || {};
} catch {}
let modelMark = null; // the loaded model's: {family, label, icon, logo?}, or null
function setMark(file, fam) {
  if (fam) markOf[file] = { family: fam.id, label: fam.label, icon: fam.icon ?? "", ...(fam.logo ? { logo: fam.logo } : {}) };
  else delete markOf[file];
  try {
    localStorage.setItem(MARKS_KEY, JSON.stringify(markOf));
  } catch {}
}
const familyOf = (model) => picker.catalog?.families.find((f) => f.id === model?.family) ?? null;
// The model chip: the mark, or the package icon; Emma's chip in her colour.
function showMark() {
  const chip = $("model-chip");
  chip.dataset.family = modelMark?.family ?? "";
  const box = $("model-mark");
  box.textContent = "";
  if (modelMark?.logo || modelMark?.icon) {
    const a = avatar(modelMark);
    a.className = "fam-logo";
    box.append(a);
  }
  box.hidden = !box.firstChild;
  chip.querySelector("svg.ic").style.display = box.hidden ? "" : "none";
}

// The line under an answer: its prompt (prefill) and answer (decode) speeds and its time.
function speedLine(row, m) {
  const el = row?.querySelector(".speed");
  if (!el || !m) return;
  const s = m.stats;
  el.textContent = (s ? `Prefill: ${s.prompt_tps.toFixed(1)} tok/s, Decode: ${s.gen_tps.toFixed(1)} tok/s, ` : "") + when(m.at ?? Date.now());
}

function showHeader() {
  $("conv-title").textContent = chat?.title ?? t("chat.new");
  const n = messages.length;
  $("conv-count").textContent = n === 1 ? t("conv.count.one") : t("conv.count", n);
  for (const id of ["conv-rename", "conv-export", "conv-download"]) $(id).disabled = !chat;
}

function renderChat() {
  const box = $("chat");
  box.textContent = "";
  if (!messages.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.innerHTML = `<img src="logo.svg" alt=""><p></p>`;
    e.lastChild.textContent = t("chat.empty");
    box.append(e);
  }
  for (const m of messages) box.append(m.role === "user" ? userBubble(m) : botBubble(m));
  box.scrollTop = box.scrollHeight;
  showHeader();
}

// A new conversation: nothing stored until its first message.
function newChat() {
  if (answer) return;
  chat = null;
  messages = [];
  $("stats").textContent = "";
  worker?.postMessage({ type: "reset" });
  renderChat();
  showConvs();
  ctxUsed = 0;
  ctxParts = null;
  countSoon(0);
}

// The first message of a new conversation creates it, titled after that message.
function startChat(text) {
  if (chat) return;
  const title = text.replace(/\s+/g, " ").trim();
  chat = { id: chats.newId(), title: title.length > 48 ? title.slice(0, 47) + "…" : title || t("chat.new"), created: Date.now(), updated: Date.now(), model: modelName, messages };
}

async function persistChat() {
  if (!chat) return;
  chat.messages = messages;
  chat.updated = Date.now();
  chat.model = modelName || chat.model;
  showHeader();
  try {
    await chats.save(chat);
  } catch (e) {
    loadLog(`the conversation could not be saved: ${e?.message ?? e}`);
  }
  showConvs();
}

async function openChat(id) {
  if (busy) return;
  const c = (await chats.list()).find((x) => x.id === id);
  if (!c) return;
  chat = c;
  messages = c.messages;
  // The worker's conversation starts again from these messages at the next question.
  worker?.postMessage({ type: "reset" });
  $("stats").textContent = "";
  renderChat();
  showConvs();
  showView("chat");
  countSoon(0);
}

async function showConvs() {
  const ul = $("convs");
  let all = [];
  try {
    all = await chats.list();
  } catch {}
  ul.textContent = "";
  if (!all.length) {
    const li = document.createElement("li");
    li.className = "meta";
    li.style.padding = "6px 10px";
    li.textContent = t("conv.none") + (chats.persistent ? "" : " (this browser keeps no conversations: private window?)");
    ul.append(li);
  }
  for (const c of all) {
    const li = document.createElement("li");
    li.dataset.id = c.id;
    li.setAttribute("aria-current", String(c.id === chat?.id));
    const open = document.createElement("button");
    open.className = "open";
    open.type = "button";
    open.innerHTML = `<span class="t"></span><span class="m"></span>`;
    open.firstChild.textContent = c.title;
    const n = c.messages.length;
    open.lastChild.textContent = `${n === 1 ? t("conv.count.one") : t("conv.count", n)} · ${when(c.updated)}`;
    open.onclick = () => openChat(c.id);
    const del = document.createElement("button");
    del.className = "icon del";
    del.type = "button";
    del.title = t("conv.delete");
    del.innerHTML = `<svg class="ic"><use href="#i-trash"/></svg>`;
    // Asked first, with its title, as the native web UI asks ("Delete this chat?").
    del.onclick = async () => {
      if (!confirm(t("conv.delask", c.title))) return;
      await chats.remove(c.id).catch(() => {});
      if (chat?.id === c.id) newChat();
      else showConvs();
    };
    li.append(open, del);
    ul.append(li);
  }
  $("convs-export").disabled = $("convs-export-md").disabled = $("convs-clear").disabled = !all.length;
  if (!all.length) $("convs-clear-ask").hidden = true;
  setBusy(busy);
}

// Downloads `text` as a file named `name`.
function download(name, type, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const fileTitle = () => (chat?.title || "chat").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "chat";

$("conv-rename").onclick = async () => {
  if (!chat) return;
  const title = prompt(t("conv.renameask"), chat.title);
  if (title == null || !title.trim()) return;
  chat.title = title.trim().slice(0, 120);
  await persistChat();
};
$("conv-export").onclick = () => chat && download(`${fileTitle()}.md`, "text/markdown", chats.markdown(chat));
$("conv-download").onclick = () => chat && download(`${fileTitle()}.json`, "application/json", JSON.stringify(chat, null, 1));

// Every conversation at once (the side bar's archive button): a backup in JSON (the
// native web UI's "Every chat" format, chats.js), the same in Markdown, an import that
// adds what is not here yet, and "Delete all", confirmed in the bar, export offered.
const stamp = () => new Date().toISOString().slice(0, 10);
// A count's words: the key's `.one` form for 1.
const tn = (key, n) => (n === 1 ? t(key + ".one") : t(key, n));
$("convs-more").onclick = () => {
  const open = $("convs-actions").hidden;
  $("convs-actions").hidden = !open;
  $("convs-more").setAttribute("aria-expanded", String(open));
  if (!open) $("convs-clear-ask").hidden = true;
};
async function exportAll(md) {
  const all = await chats.list().catch(() => []);
  if (!all.length) return;
  if (md) download(`inga-chats-${stamp()}.md`, "text/markdown", chats.markdownAll(all));
  else download(`inga-chats-${stamp()}.json`, "application/json", chats.backup(all));
  status(tn("convs.exported", all.length));
}
$("convs-export").onclick = () => exportAll(false);
$("convs-export-md").onclick = () => exportAll(true);
$("convs-clear-export").onclick = () => exportAll(false);
$("convs-import").onclick = () => $("convs-file").click();
$("convs-file").onchange = async () => {
  const f = $("convs-file").files[0];
  $("convs-file").value = "";
  if (!f) return;
  try {
    const got = chats.parseImport(JSON.parse(await f.text()));
    const { add, skipped, renamed } = chats.merge(await chats.list(), got);
    for (const c of add) await chats.save(c);
    status(tn("imp.done", add.length) + (skipped ? tn("imp.skipped", skipped) : "") + (renamed ? tn("imp.renamed", renamed) : "") + ".");
  } catch (e) {
    status(t("imp.error", e?.message ?? e), true);
  }
  showConvs();
};
$("convs-clear").onclick = async () => {
  const n = (await chats.list().catch(() => [])).length;
  if (!n) return;
  $("convs-clear-what").textContent = n === 1 ? t("convs.clearask.one") : t("convs.clearask", n);
  $("convs-clear-ask").hidden = false;
};
$("convs-clear-no").onclick = () => ($("convs-clear-ask").hidden = true);
$("convs-clear-yes").onclick = async () => {
  if (busy) return;
  $("convs-clear-ask").hidden = true;
  await chats.clear().catch(() => {});
  newChat();
  status(t("convs.cleared"));
};
// About: what Inga is, who makes it, the links (a dialog; Escape closes it too).
$("about-btn").onclick = () => $("about").showModal();
$("about-close").onclick = () => $("about").close();
if (!document.fullscreenEnabled) $("fullscreen").hidden = true;
$("fullscreen").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});

// ---- The views (Chat, Models, Settings, Tests and report) and the side bar's drawer ----

function showView(name) {
  // Leaving Settings: a load setting changed reloads the model.
  const leaving = !$("view-settings").hidden && name !== "settings";
  for (const v of ["chat", "models", "settings", "diag"]) {
    $("view-" + v).hidden = v !== name;
    if (v === name) $("nav-" + v).setAttribute("aria-current", "page");
    else $("nav-" + v).removeAttribute("aria-current");
  }
  $("app").classList.remove("drawer");
  if (leaving) reloadIfChanged();
}
for (const b of document.querySelectorAll(".navb")) b.onclick = () => showView(b.dataset.view);
$("menu").onclick = () => $("app").classList.toggle("drawer");
$("scrim").onclick = () => $("app").classList.remove("drawer");
$("model-chip").onclick = () => picker.open();
$("log-toggle").onclick = () => {
  const on = $("statusbar").classList.toggle("log");
  $("log-toggle").setAttribute("aria-expanded", String(on));
  $("log-toggle").title = on ? "Hide the load log" : "Show the load log";
};

// ---- Appearance: theme, font size, language, the send key's hint ----

function applyLook() {
  const THEME_ICON = { auto: "i-theme-auto", light: "i-sun", dark: "i-moon" };
  const th = $("theme").value;
  if (th === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = th;
  $("theme-btn").innerHTML = `<svg class="ic"><use href="#${THEME_ICON[th]}"/></svg>`;
  $("theme-btn").title = `Theme: ${th}`;
  const fs = $("fontsize").value;
  if (fs === "normal") delete document.documentElement.dataset.fs;
  else document.documentElement.dataset.fs = fs;
  setLang($("lang").value);
  $("send-hint").textContent = t($("sendkey").value === "ctrl" ? "hint.ctrl" : "hint.enter");
  if (!source) $("model-name").textContent = t("chat.nomodel");
  presetLine();
  showHeader();
  if (!messages.length) renderChat();
}
$("theme-btn").onclick = () => {
  const order = ["auto", "light", "dark"];
  $("theme").value = order[(order.indexOf($("theme").value) + 1) % 3];
  saveSettings();
  applyLook();
};

// "Reset all settings": every setting back to its default (the page's own markup).
$("settings-reset").onclick = () => {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {}
  location.reload();
};

// "Delete model files": every stored model and its download record; conversations,
// settings and other files stay.
$("wipe-models").onclick = () => {
  const names = Object.keys(storedSize);
  if (!names.length) {
    status("No model files are stored.");
    return;
  }
  if (source?.name && names.includes(source.name)) source = null;
  for (const name of names) worker.postMessage({ type: "delete", name });
  status(`Deleted ${names.length} model file${names.length === 1 ? "" : "s"}.`);
  setBusy(false);
};

// What the beta's report button (report.js) adds to its issue: the load and the last answer.
window.ingaState = () => ({
  model: source?.name ?? source?.file?.name ?? null,
  info: loadedInfo?.info ?? null,
  note: loadedInfo?.note ?? null,
  secs: loadedInfo?.secs ?? null,
  memory: loadedInfo?.memory ?? null,
  device: deviceUsed.label,
  limit: limitUsed,
  stats: lastStats,
});

// ---- The model picker (picker.js): the catalog, and what fits this browser ----

// What the picker judges each variant against: the memory limit of the Settings, the
// 4 GiB of a wasm32 module (the build does not use Memory64), navigator.deviceMemory,
// the storage left, and, when the Device setting may use the GPU, the adapter's limits
// and the "GPU memory" setting.
async function deviceEnv() {
  const { budget } = memoryLimit();
  const env = { memory: budget, wasmMax: 4096 * MB, deviceMemory: navigator.deviceMemory || null, gpu: null, free: null };
  try {
    const e = await navigator.storage?.estimate?.();
    // A file already stored (partly) is counted as free: its download resumes over it.
    if (e?.quota) env.free = Math.max(0, e.quota - (e.usage || 0));
  } catch {}
  if ($("device").value !== "cpu" && navigator.gpu) {
    try {
      const a = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (a) {
        const i = a.info || {};
        const g = gpuLimit(budget);
        env.gpu = {
          name: [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(" ") || "unnamed adapter",
          budget: g.bytes,
          guess: $("gmem").value !== "mb",
          separate: gpuSeparate(),
          maxBufferSize: a.limits.maxBufferSize,
          maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize,
        };
      }
    } catch {}
  }
  return env;
}

const picker = createPicker({
  dialog: $("picker"),
  url: "catalog.json",
  getEnv: deviceEnv,
  getStored: () => storedSize,
  // "~N min at your last measured speed", once a download measured one.
  speedHint: (bytes) => {
    const r = lastSpeed();
    return r ? t("dl.pick", estimate(bytes, r)) : "";
  },
  afterRender: () => setBusy(busy),
  onLoad: (model, variant, url) => {
    const name = url.split("/").pop().split("?")[0];
    const file = decodeURIComponent(name);
    if (storedSize[file] != null) {
      setMark(file, familyOf(model));
      loadStored(file);
    } else fromUrl(url, { model, variant });
  },
  onDelete: (file) => {
    if (source?.name === file) source = null;
    worker.postMessage({ type: "delete", name: file });
  },
});
$("picker-open").onclick = () => picker.open();

showSuggested();
setupDevice();
renderChat();
setBusy(false);
chats.open().then(showConvs);
if (!navigator.storage?.getDirectory) status("This browser has no Origin Private File System: only files of this device can be loaded.", true);
startWorker();
