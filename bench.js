// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The timing math of the page, with no page around it (the worker, the answer lines and
// the Compare view import it; crates/inga-wasm/tests/bench.mjs tests it in Node.js):
// the time to first token (TTFT), the speeds of one run, the mean and deviation of
// several, how a quantization is named, and the comparison's Markdown table.

// The time to first token of an answer, in milliseconds: from `t0` (the request) to
// `first` (its first piece of text), both on one clock in milliseconds. An answer that
// gave no text (it ended at once) has the prompt's time instead, `promptSecs`.
export function ttftMs(t0, first, promptSecs) {
  if (first != null && first >= t0) return first - t0;
  return Math.max(0, (promptSecs || 0) * 1000);
}

// Mean and sample standard deviation of `values` (NaN and null left out); null for none.
export function meanSd(values) {
  const v = values.filter((x) => x != null && Number.isFinite(x));
  if (!v.length) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length < 2 ? 0 : Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1));
  return { mean, sd };
}

// One measured run, from what the page saw and what the engine says.
// `t0`, `first`, `end`: the request, its first piece, its last (milliseconds, one clock);
// `promptTokens`, `genTokens`: the engine's counts; `prefillTps`, `decodeTps`: the
// engine's own speeds when it gives them (else derived: the prompt's tokens over the time
// to first token, the tokens after the first over the time after it, and marked so).
export function runOf({ t0, first, end, promptTokens, genTokens, prefillTps = null, decodeTps = null }) {
  const ttft = ttftMs(t0, first, 0);
  const e2e = Math.max(0, end - t0);
  const after = Math.max(0, end - (first ?? end));
  const derived = { prefill: prefillTps == null, decode: decodeTps == null };
  return {
    ttft_ms: ttft,
    e2e_ms: e2e,
    prompt_tokens: promptTokens ?? null,
    gen_tokens: genTokens ?? null,
    prefill_tps: prefillTps ?? (promptTokens && ttft > 0 ? promptTokens / (ttft / 1000) : null),
    decode_tps: decodeTps ?? (genTokens > 1 && after > 0 ? (genTokens - 1) / (after / 1000) : null),
    derived,
  };
}

// The measured runs of one engine averaged: each measure's mean and deviation, the
// token counts' means, and which speeds were derived.
export function summarize(runs) {
  const of = (k) => meanSd(runs.map((r) => r[k]));
  return {
    runs: runs.length,
    ttft_ms: of("ttft_ms"),
    prefill_tps: of("prefill_tps"),
    decode_tps: of("decode_tps"),
    e2e_ms: of("e2e_ms"),
    prompt_tokens: of("prompt_tokens")?.mean ?? null,
    gen_tokens: of("gen_tokens")?.mean ?? null,
    derived: {
      prefill: runs.some((r) => r.derived?.prefill),
      decode: runs.some((r) => r.derived?.decode),
    },
  };
}

// The quantization a file or model id names: "Q4_K_M" in a GGUF file's name,
// "q4f16_1" in an MLC model id, a `dtype` of Transformers.js; null when none is seen.
export function quantOf(name) {
  const s = String(name ?? "");
  const gguf = /(?:^|[-_.])((?:IQ|Q)\d+(?:_[0-9A-Z]+)*|BF16|F16|F32)(?=[-_.]|$)/i.exec(s);
  if (gguf) return gguf[1].toUpperCase();
  const mlc = /(q\d+f\d+(?:_\d+)?)/i.exec(s);
  if (mlc) return mlc[1].toLowerCase();
  return null;
}

// Whether every quantization of `quants` (null: unknown) is the same: else the
// comparison is indicative.
export function sameQuant(quants) {
  const known = quants.filter(Boolean).map((q) => q.toLowerCase());
  return known.length === quants.length && new Set(known).size <= 1;
}

const cell = (v, digits) => (v ? `${v.mean.toFixed(digits)} ± ${v.sd.toFixed(digits)}` : "-");

// The comparison as Markdown: what ran (`setup`: browser, GPU adapter, prompt and output
// length, runs), the table (`rows`: engine, version, model file, quantization, device,
// and the summary of `summarize`, or `missing` with the reason), and the notes.
export function markdown(setup, rows) {
  const lines = [
    "Configuration:",
    "",
    `- browser: ${setup.browser}`,
    `- GPU adapter: ${setup.gpu || "none"}`,
    `- prompt: ${setup.promptWords} words of a fixed English text (each engine's tokens in the table), one user message; output: up to ${setup.gen} tokens, greedy, thinking off`,
    `- runs: 1 warm-up + ${setup.reps} measured per engine, mean ± standard deviation`,
    "",
    "| engine | version | model file | quantization | device | prompt tok | output tok | TTFT ms | prefill tok/s | decode tok/s | end-to-end ms |",
    "| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  let derived = false;
  for (const r of rows) {
    if (r.missing) {
      lines.push(`| ${r.engine} | ${r.version || "-"} | ${r.model || "-"} | ${r.quant || "-"} | - | | | not measured: ${r.missing} | | | |`);
      continue;
    }
    const s = r.summary;
    const mark = (v, d) => (d ? (derived = true, `${v} ¹`) : v);
    const count = (v) => (v == null ? "-" : v.toFixed(0));
    lines.push(`| ${r.engine} | ${r.version} | ${r.model} | ${r.quant || "?"} | ${r.device} | ${count(s.prompt_tokens)} | ${count(s.gen_tokens)} | ` +
      `${cell(s.ttft_ms, 1)} | ${mark(cell(s.prefill_tps, 1), s.derived.prefill)} | ${mark(cell(s.decode_tps, 1), s.derived.decode)} | ${cell(s.e2e_ms, 0)} |`);
  }
  lines.push("");
  const measured = rows.filter((r) => !r.missing);
  if (measured.length > 1 && !sameQuant(measured.map((r) => r.quant))) {
    lines.push(`The quantizations differ (${measured.map((r) => `${r.engine} ${r.quant || "?"}`).join(", ")}): the comparison is indicative, not like for like.`);
  }
  if (derived) lines.push("¹ Derived: the engine gives no such speed; prefill is the prompt's tokens over the time to first token, decode the tokens after the first over the time after it.");
  lines.push("TTFT runs from the request to the first streamed piece of text on the page's clock, the prompt's processing included; the model's load and compilation are left out (the warm-up run pays them).");
  return lines.join("\n");
}
