// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// Cross-origin isolation where the host cannot send the headers: on GitHub Pages (the
// beta, docs/wasm-beta.md) this registers coi-sw.js, which adds them, and loads the page
// again once under its control, so `crossOriginIsolated` turns true and app.js loads
// the threaded module (web/pkg-threads, every core). Anywhere else it does nothing (a
// server that sends the headers needs no worker; the browser tests serve the page with
// and without them). `?coi=1` turns it on elsewhere, `?coi=0` removes the worker. Where
// isolation still fails (no service workers: a private window in Firefox, a browser
// that does not honour them), the page runs on one thread, as without this file. A
// classic script, loaded before app.js: the reload happens before a worker starts.
(() => {
  const ask = new URLSearchParams(location.search).get("coi");
  const sw = navigator.serviceWorker;
  if (!sw || !window.isSecureContext) return;
  if (ask === "0") {
    sw.getRegistration().then((r) => r && r.unregister()).then(() => sessionStorageSet(null));
    return;
  }
  if (ask !== "1" && !location.hostname.endsWith(".github.io")) return;
  if (window.crossOriginIsolated) {
    sessionStorageSet(null);
    return;
  }
  // At most one reload per tab session: a worker that cannot isolate the page (the
  // browser ignores it) must not loop.
  if (sw.controller) {
    if (sessionStorageGet() !== "reloaded") {
      sessionStorageSet("reloaded");
      location.reload();
    }
    return;
  }
  sw.register(new URL("coi-sw.js", document.currentScript?.src || location.href)).then((reg) => {
    const reload = () => {
      if (sessionStorageGet() === "reloaded") return;
      sessionStorageSet("reloaded");
      location.reload();
    };
    if (reg.active && !sw.controller) reload();
    sw.addEventListener("controllerchange", reload);
  }).catch((e) => console.warn(`coi: no service worker (${e?.message ?? e}): the page runs on one thread`));

  function sessionStorageGet() {
    try { return sessionStorage.getItem("inga-coi"); } catch { return null; }
  }
  function sessionStorageSet(v) {
    try { v === null ? sessionStorage.removeItem("inga-coi") : sessionStorage.setItem("inga-coi", v); } catch {}
  }
})();
