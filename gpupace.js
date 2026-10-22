// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// What the page does about a GPU that resets (WebGPU's device lost), without the DOM so
// Node.js tests it (crates/inga-wasm/tests/gpupace.mjs):
//
// - The pacing of a mobile-class GPU. A phone's GPU driver resets the device when one
//   submission runs too long (its watchdog: Android's VK_ERROR_DEVICE_LOST, seen on
//   Chrome for Android with Qwen3-0.6B after the prompt). The WebGPU path submits a
//   prompt chunk (up to 256 tokens) through every layer in one submission (about 16
//   dispatches per layer, up to 2048), and a token's every layer and output layer in
//   another; on a mobile-class adapter the page asks for smaller ones: prompt chunks of
//   64 tokens and at most 24 dispatches (about a layer) per submission
//   (Gpu.tune's `chunk=` and `submit=`), nothing waiting between them. Desktops keep
//   the defaults, and their speed.
//   The heuristic, `mobileClass`: the browser says it runs on a phone or tablet
//   (navigator.userAgentData.mobile, or "Android", "iPhone", "iPad" or "iPod" in the
//   user agent, or an iPad's desktop user agent with a touch screen), or the adapter is
//   a GPU only phones and tablets have (vendor "arm": Mali; "imagination": PowerVR).
//   Qualcomm's Adreno is left to the user agent: Windows laptops have it too. The
//   page's address can force it either way (`?gpu_pace=mobile` or `?gpu_pace=desktop`:
//   the browser tests, and a tester's check).
// - The resets remembered per adapter in this browser (`inga.gpuLost` in localStorage,
//   keyed by the adapter's vendor, architecture, device and description): after the
//   second on the same adapter the page loads models on the CPU for it, says so, and
//   offers to try the GPU again. Nothing retries the GPU on its own.

// The pacing asked of a mobile-class GPU (Gpu.tune's switches).
export const MOBILE_PACE = { submit: 24, chunk: 64 };
// The resets after which an adapter defaults to the CPU.
export const LOSSES_FOR_CPU = 2;
export const LOST_KEY = "inga.gpuLost";

// Vendors of GPUs only phones and tablets have (GPUAdapterInfo.vendor).
const MOBILE_VENDORS = /^(arm|imagination)$/i;

// Whether this device is mobile-class, and why: {mobile, why}. `nav`: navigator (or
// its parts: userAgent, userAgentData, maxTouchPoints); `info`: the adapter's
// GPUAdapterInfo (or null); `force`: "mobile" or "desktop" (the page's ?gpu_pace=).
export function mobileClass(nav = {}, info = null, force = null) {
  if (force === "mobile" || force === "desktop") return { mobile: force === "mobile", why: `?gpu_pace=${force}` };
  const ua = String(nav.userAgent ?? "");
  if (nav.userAgentData?.mobile === true) return { mobile: true, why: "the browser says mobile" };
  const m = ua.match(/Android|iPhone|iPad|iPod/);
  if (m) return { mobile: true, why: `${m[0]} in the user agent` };
  if (/Macintosh/.test(ua) && Number(nav.maxTouchPoints) > 1) return { mobile: true, why: "an iPad (a Mac user agent with a touch screen)" };
  const vendor = String(info?.vendor ?? "");
  if (MOBILE_VENDORS.test(vendor)) return { mobile: true, why: `a mobile GPU (${vendor})` };
  return { mobile: false, why: "a desktop browser" };
}

// The Gpu.tune switches for this device: {spec, mobile, why}; spec "" on a desktop
// (the defaults).
export function gpuPace(nav, info, force = null) {
  const c = mobileClass(nav, info, force);
  return { ...c, spec: c.mobile ? `submit=${MOBILE_PACE.submit},chunk=${MOBILE_PACE.chunk}` : "" };
}

// What the pacing spec says, for the load log and the diagnostics.
export function paceText(spec) {
  const m = /submit=(\d+)/.exec(spec || "");
  const c = /chunk=(\d+)/.exec(spec || "");
  if (!m && !c) return "default submissions";
  return [m && `submissions of at most ${m[1]} dispatches`, c && `prompt chunks of ${c[1]} tokens`].filter(Boolean).join(", ");
}

// The adapter's fields, as plain values.
export function adapterFields(info) {
  const i = info || {};
  return { vendor: String(i.vendor || ""), architecture: String(i.architecture || ""), device: String(i.device || ""), description: String(i.description || "") };
}

// The key a reset is remembered by.
export function adapterKey(info) {
  const f = adapterFields(info);
  return [f.vendor, f.architecture, f.device, f.description].join("|");
}

// The adapter's name for a person: each value once (WebKit gives "apple" for all four).
export function adapterName(info) {
  const f = adapterFields(info);
  return [...new Set([f.vendor, f.architecture, f.device, f.description].filter(Boolean))].join(" ") || "unnamed adapter";
}

// The record of `key` in `rec` ({[key]: {losses, cpu, at}}), or a fresh one.
export function lossOf(rec, key) {
  const r = rec?.[key];
  return { losses: Number(r?.losses) || 0, cpu: !!r?.cpu, at: r?.at ?? null };
}

// A reset on `key`: the new record and the adapter's: {rec, entry}; the adapter defaults
// to the CPU from its LOSSES_FOR_CPU-th reset on (`entry.cpu`; `entry.now`: this one
// made it so).
export function noteLoss(rec, key, at = Date.now()) {
  const was = lossOf(rec, key);
  const losses = was.losses + 1;
  const cpu = losses >= LOSSES_FOR_CPU;
  const entry = { losses, cpu, at };
  return { rec: { ...(rec || {}), [key]: entry }, entry: { ...entry, now: cpu && !was.cpu } };
}

// "Try the GPU again": the CPU default lifted, the count kept (one more reset brings it
// back).
export function tryGpuAgain(rec, key) {
  const was = lossOf(rec, key);
  return { ...(rec || {}), [key]: { ...was, cpu: false } };
}

// The record in `storage` (localStorage, or anything with getItem/setItem); {} when it
// cannot be read.
export function readLosses(storage) {
  try {
    const v = JSON.parse(storage?.getItem(LOST_KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function writeLosses(storage, rec) {
  try {
    storage?.setItem(LOST_KEY, JSON.stringify(rec));
    return true;
  } catch {
    return false;
  }
}

// The browser, for the diagnostics: its brands and versions, the platform and whether
// it says mobile (navigator.userAgentData), else the user agent.
export function browserText(nav = {}) {
  const d = nav.userAgentData;
  const brands = (d?.brands || []).filter((b) => !/Not.?A.?Brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`);
  if (brands.length) return `${brands.join(", ")}${d.platform ? ` on ${d.platform}` : ""}${d.mobile ? " (mobile)" : ""}`;
  return String(nav.userAgent ?? "unknown browser");
}
