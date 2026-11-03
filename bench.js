// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The timing math of the page, with no page around it (the worker imports it;
// crates/inga-wasm/tests/bench.mjs tests it in Node.js): the time to first token (TTFT).

// The time to first token of an answer, in milliseconds: from `t0` (the request) to
// `first` (its first piece of text), both on one clock in milliseconds. An answer that
// gave no text (it ended at once) has the prompt's time instead, `promptSecs`.
export function ttftMs(t0, first, promptSecs) {
  if (first != null && first >= t0) return first - t0;
  return Math.max(0, (promptSecs || 0) * 1000);
}
