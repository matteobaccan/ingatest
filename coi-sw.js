// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The service worker that makes the page cross-origin isolated where its host cannot
// send the headers (GitHub Pages, the beta: docs/wasm-beta.md). It adds
// `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy:
// require-corp` to the page's own responses (same origin only: a cross-origin download,
// a model from Hugging Face, is a CORS request, which COEP allows as it is, and is not
// streamed through here). Registered by coi.js. Nothing is cached: every request goes to
// the network as the browser made it, so a new deploy shows at the next load. The idea
// is coi-serviceworker's (github.com/gzuidhof/coi-serviceworker, MIT); this is a
// smaller rewrite, not a copy.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("message", (e) => {
  // coi.js's `?coi=0`: this worker removes itself.
  if (e.data === "deregister") {
    self.registration.unregister().then(() => self.clients.matchAll()).then((all) => {
      for (const c of all) c.navigate(c.url);
    });
  }
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  // A request Chrome refuses to replay from a service worker.
  if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;
  if (new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(r).then((res) => {
      // An error or an opaque response passes as it is.
      if (res.status === 0) return res;
      const headers = new Headers(res.headers);
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
      headers.set("Cross-Origin-Resource-Policy", "same-origin");
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }),
  );
});
