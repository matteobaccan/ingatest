// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The context gauge of the composer (the ring next to Send, as inga serve's web UI
// draws it) and the cut that keeps a conversation inside the context: pure functions,
// used by app.js and worker.js and tested in Node.js (crates/inga-wasm/tests/ctx.mjs).

// The ring's colours: the accent up to WARN %, amber above, red above FULL % (the
// native web UI's thresholds); from NEAR % the tooltip says what happens when it fills.
export const WARN = 75;
export const FULL = 90;
export const NEAR = 85;

// The gauge of `used` tokens in a context of `size`: the share used (0-100, for the
// ring), the rounded percentage shown, the colour level ("", "warn", "full") and
// whether the context is near its end. No size (no model loaded): nothing to show.
export function gauge(used, size) {
  const u = Math.max(0, Number(used) || 0);
  const s = Math.max(0, Number(size) || 0);
  if (!s) return { pct: 0, shown: 0, level: "", near: false, show: false };
  const pct = Math.min(100, (u * 100) / s);
  const level = pct > FULL ? "full" : pct > WARN ? "warn" : "";
  return { pct, shown: Math.round(pct), level, near: pct >= NEAR, show: true };
}

// The ring's tooltip: "N of M tokens (P %)", and near the end what the page does then.
export function gaugeTitle(t, used, size) {
  const g = gauge(used, size);
  const n = (x) => Math.round(Number(x) || 0);
  const head = t("ctx.text", n(used), n(size), g.shown);
  return g.near ? head + "\n" + t("ctx.near") : head;
}

// The room the answer keeps in a context of `size` tokens: `max` tokens (the Settings'
// Max tokens), at most half of the context.
export function answerRoom(size, max) {
  const s = Math.max(16, Number(size) || 0);
  return Math.min(Math.max(0, Number(max) || 0), Math.floor(s / 2));
}

// What the question may take of the context: the rest.
export function promptLimit(size, max) {
  return Math.max(16, Number(size) || 0) - answerRoom(size, max);
}

// `msgs` (a leading system message kept) cut from the oldest until `count(list)` is at
// most `limit` tokens: the oldest messages go first, the cut never starts on an answer
// and the last message always stays. Returns the messages, how many were left out and
// their tokens.
export function fitMessages(msgs, count, limit) {
  const sys = msgs.length && msgs[0].role === "system" ? [msgs[0]] : [];
  let rest = msgs.slice(sys.length);
  let tokens = count(sys.concat(rest));
  let dropped = 0;
  while (tokens > limit && rest.length > 1) {
    let cut = 1;
    while (cut < rest.length - 1 && rest[cut].role !== "user") cut++;
    rest = rest.slice(cut);
    dropped += cut;
    tokens = count(sys.concat(rest));
  }
  return { messages: sys.concat(rest), dropped, tokens };
}

// The ring's detail (its panel): `msgs` as the model reads them (a leading system
// message, the past messages kept, and the draft last when `draft`), counted by
// `count(list)` (Model.countChat) in parts. Each part is what it adds to the count of the
// parts before it, so the template's tokens fall in the parts and they add up to the
// total. `past` is how many past messages are kept; `dropped`, how many of the oldest the
// next question would leave out to stay within `limit` (fitMessages).
export function breakdown(msgs, count, draft, limit) {
  const sys = msgs.length && msgs[0].role === "system" ? 1 : 0;
  const total = msgs.length ? count(msgs) : 0;
  const system = sys ? count(msgs.slice(0, 1)) : 0;
  const body = draft && msgs.length > sys ? msgs.slice(0, -1) : msgs;
  const upto = body.length > sys ? count(body) : system;
  const dropped = limit && total > limit ? fitMessages(msgs, count, limit).dropped : 0;
  return { total, system, past: Math.max(0, upto - system), draft: Math.max(0, total - upto), kept: body.length - sys, dropped };
}

// The panel's numbers: the share used and the tokens free of a context of `size`, and
// its rows (system prompt, past messages, draft, the answer's room) with each bar's width
// in % of the context; a part of 0 tokens is left out, the answer's room always shown.
export function detail(used, size, parts, max) {
  const s = Math.max(0, Number(size) || 0);
  const u = Math.max(0, Number(used) || 0);
  const w = (n) => (s ? Math.min(100, (n * 100) / s) : 0);
  const rows = [];
  if (parts) for (const key of ["system", "past", "draft"]) if (parts[key] > 0) rows.push({ key, n: parts[key], w: w(parts[key]) });
  const room = answerRoom(s, max);
  rows.push({ key: "room", n: room, w: w(room) });
  return { used: u, size: s, shown: gauge(u, s).shown, free: Math.max(0, s - u), rows, dropped: parts?.dropped || 0 };
}

// ---- Auto context and KV cache: what a load asks for when the Settings leave them ----

// Bytes a KV cache type takes per f16 byte: f16 64 per 32 values, Q8_0 34, Q4_0 18.
export const KV_SCALE = { f16: 1, q8_0: 34 / 64, q4_0: 18 / 64 };
const STEP = 256;
// The least Auto gives, unless the model was trained for less (the planner may still
// lower it when even that does not fit: worker.js says why).
export const AUTO_FLOOR = 2048;

// The context and KV cache type of a load. `trained`: the model's training context
// (its GGUF's `<arch>.context_length`); `kvPerToken`: its KV cache's bytes per token in
// f16 (2 × layers × KV heads × (key + value widths)); `budget`: the memory the model
// may use (the GPU memory limit on the GPU, else the memory limit, at most WebAssembly's
// 4 GiB); `weights`: the model's bytes held (its file); `asked`: the Settings' context
// (0: Auto); `kv`: the Settings' KV cache ("auto", "f16", "q8_0", "q4_0"); `gpu`: the
// layers on the GPU, whose cache is f16 only.
// The KV cache may take half of what the weights leave (a margin for the activations
// and the browser): Auto's context is the training context when its cache fits that in
// f16, else in Q8_0 (half the bytes; with KV Auto), and only then lower (a multiple of
// 256, at least AUTO_FLOOR). Returns { ctx, kv, why ("model", "memory" or "set"),
// trained, bytes (the KV cache's), gpuF16 (a type other than f16 asked on the GPU) }.
export function autoContext({ trained, kvPerToken, budget, weights, asked = 0, kv = "auto", gpu = false }) {
  const t = Math.max(16, Math.floor(Number(trained) || 0)) || AUTO_FLOOR;
  const per = Math.max(1, Number(kvPerToken) || 1);
  const room = Math.max(0, (Number(budget) || 0) - (Number(weights) || 0)) / 2;
  const want = asked > 0 ? Math.min(asked, t) : t;
  let type = kv in KV_SCALE ? kv : "auto";
  let gpuF16 = false;
  if (gpu && type !== "f16") {
    gpuF16 = type !== "auto";
    type = "f16";
  } else if (type === "auto") type = want * per <= room ? "f16" : "q8_0";
  const perType = per * KV_SCALE[type];
  let ctx = want;
  let why = asked > 0 ? "set" : "model";
  if (!(asked > 0)) {
    const fit = Math.floor(room / perType / STEP) * STEP;
    if (fit < t) {
      ctx = Math.max(Math.min(AUTO_FLOOR, t), fit);
      why = "memory";
    }
  }
  return { ctx, kv: type, why, trained: t, bytes: Math.round(ctx * perType), gpuF16 };
}

// The training context and the KV cache's f16 bytes per token of a model, from
// `kvAt(ctx)`, its KV cache's bytes for a context of `ctx` (planModel's `kv`, which
// counts at most the training context, 512 tokens at least): two contexts give the bytes per token, a very
// long one the training context. null when it cannot tell.
export function kvShape(kvAt) {
  const a = kvAt(256);
  const b = kvAt(512);
  const per = (b - a) / 256;
  if (!(per > 0)) return null;
  const huge = kvAt(1 << 24);
  const trained = Math.round(256 + (huge - a) / per);
  return { trained, kvPerToken: per };
}
