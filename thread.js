// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// One worker thread of the threaded module (./pkg-threads, cross-origin isolated pages
// only), started by worker.js: it instantiates the module it receives on the shared
// memory it receives, then runs the engine's thread-pool work for good (runWorker never
// returns; this worker ends with the one that started it).

import init, { runWorker } from "./pkg-threads/inga_wasm.js";

self.onmessage = async ({ data }) => {
  await init({ module_or_path: data.module, memory: data.memory });
  runWorker();
};
