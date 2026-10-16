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
