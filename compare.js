// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The Compare view: the loaded model on Inga against other engines that run language
// models in a browser, on the same prompt and output length, with what ran written
// next to the numbers (browser, GPU adapter, model files and quantizations). Each
// engine: one warm-up, then the measured runs (3 by default), averaged (bench.js).
//
// - Inga: the loaded model, through the page's worker (app.js's runRaw).
// - WebLLM (@mlc-ai/web-llm) and Transformers.js (@huggingface/transformers): only when
//   the user ticks them; their modules come from jsDelivr at a pinned version and they
//   download their own model files (MLC, ONNX), whose quantization is not the GGUF's: the
//   table then says the comparison is indicative.
// - Sipp (@sipphq/sipp, llama.cpp through Emscripten): only when ticked; it reads the
//   same GGUF file from its link. Its module comes from jsDelivr too; its worker is
//   started from a same-origin wrapper (a module worker cannot start from another
//   origin). Where it does not start, its row says why.
//
// The browser tests replace the engines' modules with stand-ins through
// `window.ingaCompareStubs = { webllm, transformers, sipp }` (no network).

import { runOf, summarize, quantOf, markdown } from "./bench.js";

const WEBLLM = { pkg: "@mlc-ai/web-llm", version: "0.2.85" };
const TJS = { pkg: "@huggingface/transformers", version: "4.3.0" };
const SIPP = { pkg: "@sipphq/sipp", version: "0.1.4" };
const cdn = (p, path = "") => `https://cdn.jsdelivr.net/npm/${p.pkg}@${p.version}${path}`;

// The prompt's text: plain English prose, repeated up to the words asked.
const PASSAGE = "The river runs past the old mill and under the stone bridge, where the children of the village " +
  "wait for the boats in summer. In autumn the leaves cover the water and the miller counts the sacks of grain that " +
  "the farmers bring down from the hills. Every winter the snow closes the road for a few weeks, and the people " +
  "gather in the hall to tell the stories their grandparents told them, about the year the river froze and the year " +
  "the bridge was built again.";

export function promptText(words) {
  const all = PASSAGE.split(" ");
  const out = [];
  while (out.length < words) out.push(...all);
  return out.slice(0, words).join(" ") + "\n\nSummarize this text.";
}

// The prebuilt WebLLM model and the ONNX model of Transformers.js closest to the loaded
// GGUF file, by its name (the fields stay editable).
const CLOSEST = [
  [/qwen3[-_ .]?0\.6b/i, "Qwen3-0.6B-q4f16_1-MLC", "onnx-community/Qwen3-0.6B-ONNX"],
  [/qwen3[-_ .]?1\.7b/i, "Qwen3-1.7B-q4f16_1-MLC", "onnx-community/Qwen3-1.7B-ONNX"],
  [/qwen3[-_ .]?4b/i, "Qwen3-4B-q4f16_1-MLC", "onnx-community/Qwen3-4B-ONNX"],
  [/llama[-_ .]?3\.2[-_ .]?1b/i, "Llama-3.2-1B-Instruct-q4f16_1-MLC", "onnx-community/Llama-3.2-1B-Instruct"],
  [/smollm2[-_ .]?360m/i, "SmolLM2-360M-Instruct-q4f16_1-MLC", "HuggingFaceTB/SmolLM2-360M-Instruct"],
];

export function closest(name) {
  const hit = CLOSEST.find(([re]) => re.test(name || ""));
  return hit ? { webllm: hit[1], transformers: hit[2] } : { webllm: CLOSEST[0][1], transformers: CLOSEST[0][2] };
}

// Whether the GPU adapter the engines get has shader-f16 (true when it cannot be told).
async function hasF16() {
  try {
    const a = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
    return !a || a.features.has("shader-f16");
  } catch {
    return true;
  }
}

// The f32 build of an engine's f16 model or type, for an adapter without shader-f16
// (Pascal GPUs, among others), where the f16 kernels fail to compile; `id` itself
// otherwise, and for a test's stand-in engine.
export async function forAdapter(engine, id, f16) {
  if (globalThis.ingaCompareStubs?.[engine] || (f16 ?? (await hasF16()))) return id;
  if (engine === "webllm") return id.replace("q4f16_1", "q4f32_1");
  return { q4f16: "q4", fp16: "fp32" }[id] ?? id;
}

// An engine's module: the test's stand-in, or the pinned version from the CDN.
async function load(name) {
  const stub = globalThis.ingaCompareStubs?.[name];
  if (stub) return stub;
  if (name === "webllm") return import(cdn(WEBLLM, "/+esm"));
  if (name === "transformers") return import(cdn(TJS));
  return import(cdn(SIPP, "/dist/esm/index.js"));
}

const now = () => performance.now();
const $ = (id) => document.getElementById(id);

// This browser, as the table says it.
async function browserName() {
  const n = navigator;
  try {
    const d = await n.userAgentData?.getHighEntropyValues?.(["fullVersionList", "platform"]);
    const v = (d?.fullVersionList || []).filter((b) => !/Not.?A.?Brand|Chromium/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(", ");
    if (v) return `${v} (${d.platform || n.platform})`;
  } catch {}
  return n.userAgent;
}

// The GPU adapter the engines get, as the table says it.
async function adapterName() {
  try {
    const a = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
    if (!a) return navigator.gpu ? "WebGPU: no adapter" : "no WebGPU";
    const i = a.info || {};
    const name = [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(" ") || "unnamed adapter";
    return `${name} (shader-f16 ${a.features.has("shader-f16") ? "yes" : "no"})`;
  } catch (e) {
    return `WebGPU: ${e.message}`;
  }
}

// `createCompare({ run, status, model, version })`: `run(messages, opts)` answers on the
// loaded model (app.js's runRaw), `status(text, err)` writes the status line, `model()`
// says the loaded model ({file, url, name, device}), `version()` the page's build.
export function createCompare({ run, status, model, version }) {
  let attachedMd = null;
  let lastMd = null;
  let running = false;

  function fill() {
    const m = model();
    const c = closest(`${m.name} ${m.file}`);
    if (!$("cmp-webllm-model").dataset.edited) $("cmp-webllm-model").value = c.webllm;
    if (!$("cmp-tjs-model").dataset.edited) $("cmp-tjs-model").value = c.transformers;
    if (!$("cmp-sipp-url").dataset.edited) $("cmp-sipp-url").value = m.url || "";
    $("cmp-model").textContent = m.file ? `${m.file} on ${m.device}` : "No model loaded: load one first (Models).";
  }
  for (const id of ["cmp-webllm-model", "cmp-tjs-model", "cmp-sipp-url"]) $(id).addEventListener("input", () => ($(id).dataset.edited = "1"));
  $("nav-compare").addEventListener("click", fill);

  // Inga: the loaded model through the page's worker.
  async function inga(prompt, gen, reps, say) {
    const m = model();
    const runs = [];
    for (let i = 0; i <= reps; i++) {
      say(i);
      const r = await run([{ role: "user", content: `Run ${i}. ${prompt}` }], { max_tokens: gen, temperature: 0, thinking: false });
      const s = r.stats;
      if (i > 0) {
        runs.push(runOf({ t0: r.t0, first: r.first, end: r.end, promptTokens: s.prompt_tokens - s.cached_tokens,
          genTokens: s.gen_tokens, prefillTps: s.prompt_tps, decodeTps: s.gen_tps }));
      }
    }
    return { engine: "Inga", version: version(), model: m.file, quant: quantOf(m.file), device: m.device, runs };
  }

  // WebLLM: its prebuilt model, streamed through its OpenAI-like API.
  async function webllm(prompt, gen, reps, say) {
    const id = await forAdapter("webllm", $("cmp-webllm-model").value.trim());
    const lib = await load("webllm");
    const engine = await lib.CreateMLCEngine(id, { initProgressCallback: (p) => status(`Compare: WebLLM loading ${id}: ${p.text ?? ""}`) });
    const runs = [];
    try {
      for (let i = 0; i <= reps; i++) {
        say(i);
        await engine.resetChat?.();
        const t0 = now();
        let first = null;
        let usage = null;
        const chunks = await engine.chat.completions.create({
          messages: [{ role: "user", content: `Run ${i}. ${prompt}` }], max_tokens: gen, temperature: 0, stream: true,
          stream_options: { include_usage: true }, extra_body: { enable_thinking: false },
        });
        for await (const c of chunks) {
          if (first == null && c.choices?.[0]?.delta?.content) first = now();
          if (c.usage) usage = c.usage;
        }
        const end = now();
        if (i > 0) {
          runs.push(runOf({ t0, first, end, promptTokens: usage?.prompt_tokens, genTokens: usage?.completion_tokens,
            prefillTps: usage?.extra?.prefill_tokens_per_s ?? null, decodeTps: usage?.extra?.decode_tokens_per_s ?? null }));
        }
      }
    } finally {
      await engine.unload?.();
    }
    return { engine: "WebLLM", version: WEBLLM.version, model: id, quant: quantOf(id), device: "WebGPU", runs };
  }

  // Transformers.js: its ONNX model on WebGPU, greedy, streamed.
  async function transformers(prompt, gen, reps, say) {
    const id = $("cmp-tjs-model").value.trim();
    const dtype = await forAdapter("transformers", $("cmp-tjs-dtype").value);
    const lib = await load("transformers");
    status(`Compare: Transformers.js loading ${id} (${dtype})…`);
    const tok = await lib.AutoTokenizer.from_pretrained(id);
    const lm = await lib.AutoModelForCausalLM.from_pretrained(id, { dtype, device: "webgpu" });
    const runs = [];
    try {
      for (let i = 0; i <= reps; i++) {
        say(i);
        const inputs = tok.apply_chat_template([{ role: "user", content: `Run ${i}. ${prompt}` }],
          { add_generation_prompt: true, return_dict: true, enable_thinking: false });
        let first = null;
        const streamer = new lib.TextStreamer(tok, { skip_prompt: true, callback_function: (t) => { if (first == null && t) first = now(); } });
        const t0 = now();
        const out = await lm.generate({ ...inputs, max_new_tokens: gen, do_sample: false, streamer });
        const end = now();
        const p = inputs.input_ids.dims.at(-1);
        if (i > 0) runs.push(runOf({ t0, first, end, promptTokens: p, genTokens: out.dims.at(-1) - p }));
      }
    } finally {
      await lm.dispose?.();
    }
    return { engine: "Transformers.js", version: TJS.version, model: id, quant: dtype, device: "WebGPU", runs };
  }

  // Sipp: the same GGUF file, from its link.
  async function sipp(prompt, gen, reps, say) {
    const url = $("cmp-sipp-url").value.trim();
    if (!url) throw new Error("the model's link is not known (it came from a file of this device): paste the GGUF file's link");
    const lib = await load("sipp");
    const stubbed = !!globalThis.ingaCompareStubs?.sipp;
    const entry = cdn(SIPP, "/dist/esm/worker/model-service-entry.js");
    const workerUrl = stubbed ? undefined : URL.createObjectURL(new Blob([`import ${JSON.stringify(entry)};`], { type: "text/javascript" }));
    const client = new lib.SippClient(workerUrl ? { workerUrl } : {});
    const runs = [];
    try {
      status(`Compare: Sipp loading ${url}…`);
      const m = await client.models.add([url]);
      await client.add("default", lib.Endpoint.local(m, { runtime: { context: { n_ctx: 4096 }, observability: { runtime_metrics: true } } }));
      for (let i = 0; i <= reps; i++) {
        say(i);
        const t0 = now();
        let first = null;
        const r = client.chat([{ role: "user", content: `Run ${i}. ${prompt}` }], { emitTokens: true, maxTokens: gen, temperature: 0, contextKey: `inga-compare-${i}` });
        for await (const b of r.tokens) if (first == null && b?.text) first = now();
        const resp = await r.response;
        const end = now();
        const st = resp?.stats ?? resp?.usage ?? {};
        if (i > 0) {
          runs.push(runOf({ t0, first, end, promptTokens: st.inputTokens ?? st.prompt_tokens, genTokens: st.outputTokens ?? st.completion_tokens,
            prefillTps: st.prefillTokensPerSecond ?? null, decodeTps: st.decodeTokensPerSecond ?? null }));
        }
      }
    } finally {
      await client.close?.();
      if (workerUrl) URL.revokeObjectURL(workerUrl);
    }
    const file = decodeURIComponent(url.split("/").pop().split("?")[0]);
    return { engine: "Sipp", version: SIPP.version, model: file, quant: quantOf(file), device: "WebGPU (its own choice)", runs };
  }

  function table(rows) {
    const t = document.createElement("table");
    const head = ["Engine", "Version", "Model file", "Quantization", "Device", "Prompt tok", "Output tok", "TTFT ms", "Prefill tok/s", "Decode tok/s", "End-to-end ms"];
    const tr = (cells, th) => {
      const r = document.createElement("tr");
      for (const c of cells) {
        const e = document.createElement(th ? "th" : "td");
        e.textContent = c;
        r.append(e);
      }
      t.append(r);
      return r;
    };
    tr(head, true);
    const cell = (v, d) => (v ? `${v.mean.toFixed(d)} ± ${v.sd.toFixed(d)}` : "-");
    for (const r of rows) {
      if (r.missing) {
        const row = tr([r.engine, r.version || "-", r.model || "-", r.quant || "-", "-", "", "", `not measured: ${r.missing}`, "", "", ""]);
        row.dataset.missing = "1";
        continue;
      }
      const s = r.summary;
      tr([r.engine, r.version, r.model, r.quant || "?", r.device, s.prompt_tokens?.toFixed(0) ?? "-", s.gen_tokens?.toFixed(0) ?? "-",
        cell(s.ttft_ms, 1), cell(s.prefill_tps, 1) + (s.derived.prefill ? " ¹" : ""), cell(s.decode_tps, 1) + (s.derived.decode ? " ¹" : ""), cell(s.e2e_ms, 0)]);
    }
    return t;
  }

  async function start() {
    const m = model();
    if (!m.file) {
      status("Load a model first: the comparison runs it on Inga and the same prompt on the engines ticked.", true);
      return;
    }
    const words = Math.max(8, Math.min(2000, Number($("cmp-words").value) || 96));
    const gen = Math.max(2, Math.min(1024, Number($("cmp-gen").value) || 64));
    const reps = Math.max(1, Math.min(10, Number($("cmp-reps").value) || 3));
    const prompt = promptText(words);
    $("cmp-run").disabled = true;
    $("cmp-out").textContent = "";
    $("cmp-warn").hidden = true;
    const rows = [];
    const engines = [
      ["Inga", inga, true, null],
      ["WebLLM", webllm, $("cmp-webllm").checked, WEBLLM.version],
      ["Transformers.js", transformers, $("cmp-tjs").checked, TJS.version],
      ["Sipp", sipp, $("cmp-sipp").checked, SIPP.version],
    ];
    for (const [name, fn, allowed, v] of engines) {
      if (!allowed) {
        rows.push({ engine: name, version: v, missing: "not allowed (tick it: it downloads its own module and model files)" });
        continue;
      }
      const say = (i) => status(`Compare: ${name}, ${i === 0 ? "warm-up" : `run ${i} of ${reps}`}…`);
      try {
        const r = await fn(prompt, gen, reps, say);
        rows.push({ ...r, summary: summarize(r.runs) });
      } catch (e) {
        rows.push({ engine: name, version: v, missing: String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 200) });
      }
    }
    const setup = { browser: await browserName(), gpu: await adapterName(), promptWords: words, gen, reps };
    lastMd = markdown(setup, rows);
    $("cmp-out").append(table(rows));
    const warn = lastMd.split("\n").find((l) => l.startsWith("The quantizations differ"));
    $("cmp-warn").textContent = warn ?? "";
    $("cmp-warn").hidden = !warn;
    $("cmp-md").textContent = lastMd;
    $("cmp-result").hidden = false;
    status("Ready. Comparison done: its table is in Compare.");
  }

  $("cmp-run").onclick = () => {
    if (running) return;
    running = true;
    start().catch((e) => status(`The comparison failed: ${e?.message ?? e}`, true)).finally(() => {
      running = false;
      $("cmp-run").disabled = false;
    });
  };
  $("cmp-copy").onclick = async () => {
    if (!lastMd) return;
    try {
      await navigator.clipboard.writeText(lastMd);
      $("cmp-said").textContent = "Copied as Markdown.";
    } catch {
      $("cmp-said").textContent = "The clipboard was refused: select the text below and copy it.";
    }
  };
  $("cmp-attach").onclick = () => {
    attachedMd = lastMd;
    $("cmp-said").textContent = "Attached: the report (Tests and report) includes this table.";
  };

  return { attached: () => attachedMd, markdown: () => lastMd };
}
