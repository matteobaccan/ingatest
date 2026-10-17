// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The Web Worker that runs Inga (crates/inga-wasm, built into ./pkg by
// tools/build-wasm.sh), so the page stays responsive while a model loads or answers.
// When the page is cross-origin isolated (COOP + COEP headers, or coi-serviceworker on a
// static host) and ./pkg-threads exists, it loads that module instead (built with
// WebAssembly threads) and starts its worker threads (thread.js) before any model;
// otherwise the module of ./pkg on one thread.
// It also keeps the downloaded models in the Origin Private File System (OPFS), written
// through synchronous access handles (available in workers, Safari included), resuming
// an interrupted download with an HTTP Range request.
//
// With `device: "gpu"` a model loads on the GPU through WebGPU (./pkg's module, which
// has it): its layers' weights go to GPU buffers as the chunks arrive, and it answers a
// token at a time, returning to the event loop while the GPU works (so {type: "stop"}
// reaches it between tokens).
//
// Messages in: {type: "download", url, name} | {type: "load", name | file, ctx, device} |
// {type: "list"} | {type: "delete", name} | {type: "chat", messages, opts, stop, fit} (fit:
// the prompt's most tokens; the oldest messages are left out until it fits, ctx.js) |
// {type: "count", id, messages, opts, detail, draft, fit} (the chat's tokens, for the
//   context gauge; with `detail`, its parts for the gauge's panel, ctx.js's breakdown) |
// {type: "complete", text, opts} | {type: "reset"} | {type: "stop"} |
// {type: "load", name, ctx, budget, draft, device, gpuBudget, gpuSeparate} (budget: bytes of memory for
// the model, its KV cache and buffers included, the GPU's too; what does not fit is read
// from OPFS while it runs; draft: another stored model that drafts for it, its memory out
// of the same budget, on the CPU only; gpuBudget: what the GPU may hold, with device
// "gpu"; note: why an earlier attempt fell back, for the load line) | {type: "import", file} (a picked file copied into OPFS) |
// {type: "disktest"} | {type: "delete", path} (any stored file) | {type: "wipe"} (all of
// this site's OPFS) | {type: "panic", what} (a test: the module panics) |
// {type: "gpubench", tokens} (the GPU benchmark: the loaded GPU model under each of
// BENCH's kernel choices) | {type: "gpuprofile", tokens, mode} (the kernel times of
// `tokens` decode steps, Gpu.profileStart's mode) | {type: "gpucheck", storageBuffers} (every kernel compiled on
// the GPU, `storageBuffers` lowering maxStorageBuffersPerShaderStage) | {type: "tune", spec} (Gpu.tune's
// switches on the loaded GPU model, "reset" for the adapter's own; answered by {type: "tuned", tuning}).
// Messages out: {type: "ready"} | {type: "progress", what, done, total, start} (start: a
// download's bytes already there when this session began) |
// {type: "loaded", info, secs, memory, gpu, note, ctx_asked, ctx_cut, ctx_auto} (ctx_auto:
// ctx.js's autoContext of the load, the context and KV cache chosen; ctx_cut: the
// context was lowered from ctx_asked to the most the limits hold, {asked, got, budget,
// gpuBudget, device}) | {type: "models", models} |
// {type: "gpulost", reason, message} (the WebGPU device was lost: the model is gone) |
// {type: "retry", device, note} (the GPU refused the model while it loaded: load it
// again with `device` in a fresh worker, `note` saying why) |
// {type: "piece", text, reasoning} (reasoning: a thinking model's, apart from its answer) |
// {type: "done", stats, memory, gpu} | {type: "error", message} |
// {type: "count", id, tokens, parts} (tokens null: no model, or a module without countChat) |
// {type: "trimmed", dropped, tokens} (a chat's oldest messages left out to fit `fit`) |
// {type: "disktest", bytes, write_mbs, read_mbs} |
// {type: "gpubench", rows, done, tuning, shader_f16, subgroups, timestamp_query} (a row per
// configuration as it ends) |
// {type: "gpuprofile", mode, overhead_ms, tokens, wall_ms, rows, tuning, subgroups, timestamp_query} |
// {type: "gpucheck", checked, total, failed, shader_f16, storage, storage_buffers,
// most_storage_buffers} | {type: "gpuprobe", result} (the GPU memory measured,
// gpuprobe.js; asked by `gpuProbe` in a load, whose `gpuMeasured` gives a kept one).

import { fitMessages, breakdown, autoContext, kvShape } from "./ctx.js";

const CHUNK = 8 << 20; // bytes read from a file per push
const DIR = "models";
// The most threads (this one included): more rarely help a memory-bound decode.
const MAX_THREADS = 8;
let model = null;
let inga = null; // the module's exports
let mod = null; // the module of the model loaded (./pkg's for the GPU)
let gpu = null; // the WebGPU device, made at the first GPU load
let gpuInga = null; // ./pkg's module, which has WebGPU (the threaded one does not)
let gpuTuning = ""; // the kernels the device chose for this adapter (Gpu.tuning)
let stopAsked = false;
const post = (m) => self.postMessage(m);

// The tokens of a chat as the model reads it (Model.countChat), or null when there is no
// model or the module predates countChat.
function countChat(messages, opts) {
  if (!model || typeof model.countChat !== "function") return null;
  return model.countChat(JSON.stringify(messages), opts);
}

// A step of a load, for the page's load log (what the worker is doing, so a load that
// stops says where).
const step = (text) => post({ type: "step", text, at: performance.now() });

// Starts `n` worker threads on the threaded module's memory and waits until all wait
// for the engine (a Web Worker starts only once this one returns to its event loop, so
// they must be ready before a model loads).
async function startThreads(n) {
  const [module, memory] = inga.threadInit();
  for (let i = 0; i < n; i++) {
    const w = new Worker(new URL("./thread.js", import.meta.url), { type: "module" });
    w.postMessage({ module, memory });
  }
  const t0 = performance.now();
  while (inga.waitingWorkers() < n) {
    if (performance.now() - t0 > 20000) throw new Error(`${inga.waitingWorkers()} of ${n} worker threads started`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

async function start() {
  const threads = Math.min(navigator.hardwareConcurrency || 1, MAX_THREADS);
  if (self.crossOriginIsolated && threads > 1) {
    try {
      inga = await import("./pkg-threads/inga_wasm.js");
      await inga.default();
      await startThreads(threads - 1);
      return;
    } catch (e) {
      // No threaded module here, or the browser refused it: one thread.
      console.warn("inga: the threaded module did not start, using one thread:", e);
    }
  }
  inga = await import("./pkg/inga_wasm.js");
  await inga.default();
}

const ready = start();

// A sync access handle on `fileHandle` for writing (a download, a copy, a sidecar, the
// disk test): exclusive ("readwrite", the default). Chromium releases a closed handle's
// lock in its browser process after close() returns (and a terminated worker's later
// still), so opening the file again at once (a load right after its download, a fresh
// worker after Stop) can find it still locked: NoModificationAllowedError, "Access
// Handles cannot be created if there is another open Access Handle". Asked again for up
// to 10 s before the error goes to the page; a file really open elsewhere (another tab
// reading or downloading it) fails after that.
async function syncHandle(fileHandle) {
  return await retryLocked(() => fileHandle.createSyncAccessHandle(),
    "the model file is in use by another tab or window of this page: close the other Inga tabs and load it again");
}

async function retryLocked(open, why) {
  const until = performance.now() + 10000;
  for (let wait = 10; ; wait = Math.min(wait * 2, 500)) {
    try {
      return await open();
    } catch (e) {
      if (e?.name !== "NoModificationAllowedError") throw e;
      if (performance.now() >= until) throw new Error(why);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Whether this browser opens a sync access handle "read-only" (Chrome 121+): several
// such handles may be open on one file at once, in several tabs, so each tab can run
// the same stored model. A browser without the option would ignore it and open an
// exclusive handle, hence the check of the handle's `mode` attribute (added with it).
const READ_ONLY = typeof FileSystemSyncAccessHandle !== "undefined" && "mode" in FileSystemSyncAccessHandle.prototype;

// A model file opened for reading, with a sync access handle's read, getSize and close:
// a "read-only" handle where the browser has it; else the file's snapshot (getFile)
// read in slices with FileReaderSync, which takes no lock (slower, but another tab can
// read the file at the same time). Only a writer locks the file then: a download or a
// copy running in this or another tab; waited for like a writer's lock (the lock of
// this worker's own download, released just after), then said.
async function readHandle(fileHandle) {
  const busyWhy = "the model file is being written (downloaded or copied) in another tab or window of this page: wait until that ends, then load it again";
  if (READ_ONLY) {
    const h = await retryLocked(() => fileHandle.createSyncAccessHandle({ mode: "read-only" }), busyWhy);
    step(`${fileHandle.name}: opened read-only (other tabs may read it too)`);
    return h;
  }
  const file = await retryLocked(() => fileHandle.getFile(), busyWhy);
  step(`${fileHandle.name}: read with no lock (this browser has no read-only handle)`);
  const reader = new FileReaderSync();
  return {
    read(view, { at = 0 } = {}) {
      const end = Math.min(file.size, at + view.byteLength);
      if (end <= at) return 0;
      const bytes = new Uint8Array(reader.readAsArrayBuffer(file.slice(at, end)));
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength).set(bytes);
      return bytes.length;
    },
    getSize: () => file.size,
    close() {},
  };
}

async function modelsDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

// The sidecar of a model file: {url, size, complete}.
async function readMeta(dir, name) {
  try {
    const f = await (await dir.getFileHandle(name + ".json")).getFile();
    return JSON.parse(await f.text());
  } catch {
    return null;
  }
}

async function writeMeta(dir, name, meta) {
  const h = await syncHandle(await dir.getFileHandle(name + ".json", { create: true }));
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(meta));
    h.truncate(0);
    h.write(bytes, { at: 0 });
    h.flush();
  } finally {
    h.close();
  }
}

// Every file this site keeps in OPFS, recursively from its root: models/<name> are the
// models (complete, incomplete, or unknown without their .json sidecar); anything else
// (a disk test interrupted, files of older pages, a sidecar without its model) is listed
// too, so that its space can be seen and freed. An entry that cannot be read is listed
// with its error.
async function list() {
  await modelsDir();
  const out = [];
  async function walk(dir, prefix) {
    const entries = [];
    try {
      for await (const e of dir.entries()) entries.push(e);
    } catch (e) {
      out.push({ path: prefix || "/", name: prefix || "/", size: 0, error: String(e?.message ?? e) });
      return;
    }
    const names = new Set(entries.map(([n]) => n));
    for (const [name, handle] of entries) {
      const path = prefix + name;
      if (handle.kind === "directory") {
        await walk(handle, path + "/");
        continue;
      }
      const inModels = prefix === DIR + "/";
      // A model's sidecar is shown with its model.
      if (inModels && name.endsWith(".json") && names.has(name.slice(0, -5))) continue;
      const item = { path, name: inModels ? name : path, size: 0, model: inModels && !name.endsWith(".json"), complete: null, total: null, url: null };
      try {
        item.size = (await handle.getFile()).size;
        if (item.model) {
          const meta = await readMeta(dir, name);
          if (meta) Object.assign(item, { total: meta.size ?? null, complete: !!meta.complete, url: meta.url ?? null });
        }
      } catch (e) {
        item.error = String(e?.message ?? e);
      }
      out.push(item);
    }
  }
  await walk(await navigator.storage.getDirectory(), "");
  out.sort((a, b) => (b.model - a.model) || a.path.localeCompare(b.path));
  post({ type: "models", models: out });
}

// Removes the entry at `path` (a/b/c) under the OPFS root.
async function removePath(path) {
  const parts = path.split("/").filter(Boolean);
  let dir = await navigator.storage.getDirectory();
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
  await dir.removeEntry(parts[parts.length - 1], { recursive: true });
}

// Deletes everything this site keeps in OPFS; the open model is closed first.
async function wipe() {
  if (model) {
    model.free();
    model = null;
  }
  closeStream();
  const root = await navigator.storage.getDirectory();
  const names = [];
  for await (const [name] of root.entries()) names.push(name);
  const failed = [];
  for (const name of names) {
    try {
      await root.removeEntry(name, { recursive: true });
    } catch (e) {
      failed.push(`${name}: ${e?.message ?? e}`);
    }
  }
  if (failed.length) throw new Error("Some stored data could not be deleted (close the other tabs of this page and try again): " + failed.join("; "));
}

// Downloads `url` into OPFS as `name`, resuming what an earlier download left.
async function download(url, name) {
  const dir = await modelsDir();
  const meta = (await readMeta(dir, name)) ?? { url, size: null, complete: false };
  if (meta.complete) return;
  const handle = await syncHandle(await dir.getFileHandle(name, { create: true }));
  try {
    let at = meta.url === url ? handle.getSize() : 0;
    let resp;
    try {
      resp = await fetch(url, at > 0 ? { headers: { Range: `bytes=${at}-` } } : {});
    } catch (e) {
      throw new Error(`This page cannot download from ${new URL(url).host} (${e.message || e}). ` +
        "Open the link in Safari to save the file in the Files app, then pick it with option 2.");
    }
    if (resp.status === 416 && meta.size === at) {
      // Already whole.
    } else if (!resp.ok) {
      throw new Error(`The download failed: HTTP ${resp.status}${resp.status === 404 ? " (not found: check the link)" : resp.statusText ? ` (${resp.statusText})` : ""} for ${url}`);
    } else {
      if (resp.status !== 206) at = 0; // the server ignored the range: start again
      handle.truncate(at);
      const range = resp.headers.get("Content-Range");
      const total = range ? Number(range.split("/")[1]) : at + Number(resp.headers.get("Content-Length") || 0);
      meta.url = url;
      meta.size = total || null;
      await writeMeta(dir, name, meta);
      const reader = resp.body.getReader();
      // `start`: what an earlier session left, so the page's speed counts this one's
      // bytes only. A word at least every 250 ms while bytes arrive (the page's speed
      // and time left), flushed every 4 MiB.
      const start = at;
      let last = at;
      let lastPost = performance.now();
      post({ type: "progress", what: "download", done: at, total, start });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (handle.write(value, { at }) !== value.byteLength) throw new Error("the site's storage is full: delete a stored model");
        at += value.byteLength;
        if (at - last > 4 << 20) {
          last = at;
          handle.flush();
        }
        const now = performance.now();
        if (now - lastPost >= 250) {
          lastPost = now;
          post({ type: "progress", what: "download", done: at, total, start });
        }
      }
      handle.flush();
      if (meta.size && at !== meta.size) throw new Error(`the download stopped at ${at} of ${meta.size} bytes: try again to resume it`);
      meta.size = at;
    }
    meta.complete = true;
  } finally {
    handle.close();
  }
  await writeMeta(dir, name, meta);
}

// ./pkg's module (the one with WebGPU), loaded once; no GPU device made.
async function gpuModule() {
  if (!navigator.gpu) throw new Error("this browser has no WebGPU (navigator.gpu)");
  if (!gpuInga) {
    gpuInga = inga.hasWebGpu?.() ? inga : await import("./pkg/inga_wasm.js");
    if (gpuInga !== inga) await gpuInga.default();
    if (!gpuInga.hasWebGpu?.()) throw new Error("this build of Inga has no WebGPU");
  }
  return gpuInga;
}

// The WebGPU device is destroyed (its buffers' memory back at once) and forgotten: a
// model that will not run there leaves nothing on the GPU.
function dropGpu() {
  if (!gpu) return;
  try {
    gpu.destroy();
  } catch {}
  try {
    gpu.free();
  } catch {}
  gpu = null;
}

// wgpu 30's WebGPU backend does not know the "subgroups" feature: it neither reports
// nor requests it, so the module's subgroup kernels could never run in a browser. Every
// device this worker asks for gets it where the adapter has it (the module reads the
// device's features, `GpuInfo::subgroups`).
function requestSubgroups() {
  const proto = self.GPUAdapter?.prototype;
  if (!proto || proto.requestDevice.ingaSubgroups) return;
  const original = proto.requestDevice;
  const patched = function (desc = {}) {
    const want = [...(desc.requiredFeatures ?? [])];
    if (this.features?.has("subgroups") && !want.includes("subgroups")) want.push("subgroups");
    return original.call(this, { ...desc, requiredFeatures: want }).then((device) => {
      watchLost(device);
      return device;
    });
  };
  patched.ingaSubgroups = true;
  proto.requestDevice = patched;
}

// A WebGPU device lost (GPUDevice.lost) other than by this worker's destroy(): the GPU
// was reset, its driver restarted, or the system took its memory back. The model on it
// cannot run any more (an answer waiting for it may never resume); the page is told
// once (`gpulost`), ends this worker and asks for a new load:
// nothing here tries the device again, so a GPU that keeps failing is not driven in a
// loop.
function watchLost(device) {
  device?.lost?.then((info) => {
    if (info?.reason === "destroyed") return;
    const message = String(info?.message || "").trim();
    // The page ends this worker (its memory with it) and starts a fresh one.
    post({ type: "gpulost", reason: info?.reason ?? "unknown", message });
  });
}

// The GPU memory this adapter holds at full speed, measured before the model's device
// opens (gpuprobe.js), told to the page ({type: "gpuprobe"}, kept per adapter there);
// returns it in bytes (null when the probe failed). The load's budget stays as asked
// (see app.js, gpuMeasured): the load line says what lies past it.
let gpuMeasuredBytes = null;
async function gpuMemory() {
  if (gpu) return null; // the probe needs the card free of the model's buffers
  step("GPU: measuring its memory (once per adapter)");
  try {
    const { probeGpuMemory } = await import("./gpuprobe.js");
    const r = await probeGpuMemory();
    step(`GPU memory: ${Math.round(r.usable / 1048576)} MiB usable (${r.why}), ${Math.round(r.ms)} ms`);
    post({ type: "gpuprobe", result: r });
    return r.usable;
  } catch (e) {
    step(`GPU memory probe failed: ${e?.message ?? e}`);
    return null;
  }
}

// What the load line adds when the model's GPU buffers pass the measured memory.
function gpuMeasuredNote(info) {
  const used = (info?.weight_bytes ?? 0) + (info?.other_bytes ?? 0);
  if (!gpuMeasuredBytes || !info || used <= gpuMeasuredBytes) return null;
  return `GPU memory measured at ${Math.round(gpuMeasuredBytes / 1048576)} MiB: about ${Math.round((used - gpuMeasuredBytes) / 1048576)} MiB ` +
    `of this model's ${Math.round(used / 1048576)} MiB on the GPU are kept in system memory by the driver and read over PCIe ` +
    "(slower; a smaller model or quantization runs faster)";
}

// ./pkg's module and the WebGPU device, made once.
async function webgpu() {
  await gpuModule();
  if (!gpu) {
    requestSubgroups();
    gpu = await gpuInga.Gpu.create();
    // Apple's GPUs get their kernels (Gpu.tune's preset: tiles of 32 tokens, slabs of
    // 128 values): the browser tells the vendor here, not to wgpu.
    try {
      const a = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (/apple/i.test(a?.info?.vendor ?? "")) gpu.tune("preset=apple");
    } catch {}
    // The dot4 builds need WGSL's dot4I8Packed (Chrome 123 on).
    if (!navigator.gpu?.wgslLanguageFeatures?.has?.("packed_4x8_integer_dot_product")) gpu.tune("dot4=off");
    gpuTuning = gpu.tuning();
  }
  return gpuInga;
}

// The GPU benchmark: the kernels it compares (Gpu.tune's switches), each from the
// defaults. "current" is the kernels as they were before shader-f16 and the tiles of
// other sizes; "Apple" is the preset the page picks for Apple's GPUs.
const BENCH = [
  { label: "current (f32, 8 rows, tiles 64x64)", spec: "preset=default,f16=off" },
  { label: "f16", spec: "preset=default,f16=on", f16: true },
  { label: "Apple tiles (64x32, slab 128), f32", spec: "preset=apple,f16=off" },
  { label: "Apple tiles + f16", spec: "preset=apple,f16=on", f16: true },
  { label: "4 rows per workgroup, f32", spec: "preset=default,f16=off,rows=4" },
  { label: "4 rows + Apple tiles + f16", spec: "preset=apple,f16=on,rows=4", f16: true },
  { label: "subgroups, f32", spec: "preset=default,f16=off,sg=on", sg: true },
  { label: "subgroups + f16", spec: "preset=default,f16=on,sg=on", sg: true, f16: true },
  { label: "wide loads (Q8_0, Q4_K), f32", spec: "preset=default,f16=off,wide=on" },
  { label: "wide loads + dot4I8Packed, f32", spec: "preset=default,f16=off,wide=on,dot4=on" },
  { label: "wide loads, unrolled (spirv-opt -O), f32", spec: "preset=default,f16=off,wide=on,opt=on" },
];
// The benchmark's prompt: browser.cjs bench's text, repeated (about 80 tokens).
const BENCH_TEXT = "The quick brown fox jumps over the lazy dog. ".repeat(8);

// Compiles every WebGPU kernel (the module's WGSL) on a device of its own, each in an
// error scope: what this browser's compiler refuses (the browser tests). The f16 ones
// only where the adapter has shader-f16, the tiles of slabs of 128 values only where
// its workgroup storage allows them (19,968 bytes). Each kernel's storage buffers are
// counted against maxStorageBuffersPerShaderStage (the adapter's, or `storageBuffers`
// when lower: 8 is WebGPU's default, a P1000 in Chrome reports 16, an iPhone 44).
async function gpuCheck(storageBuffers) {
  await ready;
  const m = await webgpu();
  const kernels = JSON.parse(m.gpuKernels());
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  const f16 = adapter.features.has("shader-f16");
  const sg = adapter.features.has("subgroups");
  const storage = adapter.limits.maxComputeWorkgroupStorageSize;
  const buffers = Math.min(adapter.limits.maxStorageBuffersPerShaderStage, storageBuffers ?? Infinity);
  const device = await adapter.requestDevice({
    requiredFeatures: [...(f16 ? ["shader-f16"] : []), ...(sg ? ["subgroups"] : [])],
    requiredLimits: { maxComputeWorkgroupStorageSize: storage, maxStorageBuffersPerShaderStage: Math.max(buffers, 8) },
  });
  const failed = [];
  let checked = 0;
  let most = 0;
  for (const [name, code] of kernels) {
    const isSg = /_sgx?(_1)?$/.test(name);
    if ((name.includes("_h16") && !f16) || (name.endsWith("_t32k") && storage < 19968) || (isSg && !sg)) continue;
    checked++;
    const n = (code.match(/var<storage/g) || []).length;
    most = Math.max(most, n);
    if (n > buffers) {
      failed.push([name, `binds ${n} storage buffers; this GPU allows ${buffers} per kernel (maxStorageBuffersPerShaderStage)`]);
      continue;
    }
    device.pushErrorScope("validation");
    // Browsers need `enable subgroups;`, which the WGSL files cannot carry (naga refuses
    // it): the module adds it too (kernels::for_device).
    const module = device.createShaderModule({ label: name, code: isSg ? "enable subgroups;\n" + code : code });
    device.createComputePipeline({ label: name, layout: "auto", compute: { module, entryPoint: "main" } });
    const e = await device.popErrorScope();
    if (e) failed.push([name, e.message]);
  }
  device.destroy();
  post({ type: "gpucheck", checked, total: kernels.length, failed, shader_f16: f16, subgroups: sg, storage, storage_buffers: buffers, most_storage_buffers: most });
}

// One run of the benchmark's prompt and `tokens` greedy tokens, a token at a time.
async function benchRun(tokens) {
  model.reset();
  model.completeBegin(BENCH_TEXT, JSON.stringify({ max_tokens: tokens, temperature: 0 }));
  let text = "";
  for (;;) {
    const r = model.step((piece) => {
      text += piece;
      return stopAsked;
    });
    if (r === 1) await model.ready();
    else if (r === 2) break;
  }
  return { ...JSON.parse(model.stats()), text };
}

// Runs the loaded GPU model under each of BENCH's configurations (a short warm-up run
// first, which compiles its kernels, then the prompt and `tokens` tokens), posting a
// row per configuration, then puts the kernels back as they were.
async function gpuBench(tokens) {
  if (!onGpu()) throw new Error("load a model with Device GPU first: the GPU benchmark runs the loaded model on the GPU");
  const before = gpu.tuning();
  const info = JSON.parse(gpu.info());
  const head = { tuning: before, shader_f16: info.shader_f16, subgroups: subgroupsNote(info), timestamp_query: info.timestamp_query };
  const rows = [];
  let first = null;
  stopAsked = false;
  try {
    for (const c of BENCH) {
      if (stopAsked) break;
      const missing = c.f16 && !info.shader_f16 ? "no shader-f16 on this adapter"
        : c.sg && info.subgroup_kernels === "none" ? `no subgroups on this adapter${info.subgroups ? ` (${info.subgroups_text}: not a width WebGPU allows)` : ""}` : null;
      if (missing) {
        rows.push({ label: c.label, spec: c.spec, skipped: missing });
        post({ type: "gpubench", rows, done: false, ...head });
        continue;
      }
      gpu.tune(c.spec);
      await benchRun(2);
      const s = await benchRun(tokens);
      // The same greedy text as the first row's: a check that the kernels agree (the
      // GPU sums in another order, so a near tie may still part them late).
      first ??= s.text;
      const label = c.sg ? `${c.label} (${info.subgroup_kernels === "sg" ? "subgroupAdd, 32 wide" : "any width: shuffles"})` : c.label;
      rows.push({ label, spec: gpu.tuning(), prompt_tokens: s.prompt_tokens, prompt_tps: s.prompt_tps,
        gen_tokens: s.gen_tokens, gen_tps: s.gen_tps, waits: s.steps_waiting, gpu_sampled: s.gpu_sampled,
        same: s.text === first });
      post({ type: "gpubench", rows, done: false, ...head });
    }
  } finally {
    gpu.tune(before);
    model.reset();
  }
  post({ type: "gpubench", rows, done: true, ...head });
}

// What the device's subgroups are, for the benchmark's header: whether it has them,
// the adapter's widths, and the kernels that run with them.
function subgroupsNote(info) {
  if (!info.subgroups) return "no";
  const k = { sg: "the kernels of 32-wide subgroups (subgroupAdd)", sgx: "the kernels of any width (subgroupShuffleXor)", none: "none of the kernels" }[info.subgroup_kernels];
  return `yes, ${info.subgroups_text} (${k})`;
}

// The kernel times: the loaded GPU model on the benchmark's prompt under the page's
// kernels, a warm-up run first; the times of every decode step after the first token
// (the prompt's step is not timed), summed per kernel, read once every submission's
// timestamps are back.
async function gpuProfile(tokens, mode) {
  if (!onGpu()) throw new Error("load a model with Device GPU first: the kernel times run the loaded model on the GPU");
  const info = JSON.parse(gpu.info());
  stopAsked = false;
  let used = "off";
  let t0 = 0;
  try {
    await benchRun(2);
    model.reset();
    model.completeBegin(BENCH_TEXT, JSON.stringify({ max_tokens: tokens + 1, temperature: 0 }));
    for (;;) {
      const r = model.step(() => stopAsked);
      if (r === 1) await model.ready();
      else if (r === 2) break;
      else if (used === "off") {
        // The first token (the prompt's step) is out: time the next ones.
        used = await gpu.profileStart(mode || "auto");
        t0 = performance.now();
      }
    }
    const wall = performance.now() - t0;
    for (let i = 0; i < 500 && gpu.profileInFlight() > 0; i++) await new Promise((r) => setTimeout(r, 10));
    const p = JSON.parse(gpu.profile());
    // The steps timed (a step that ends the answer runs the model too).
    post({ type: "gpuprofile", mode: used, overhead_ms: p.overhead_ms, tokens: p.steps, wall_ms: wall, rows: p.rows,
      tuning: gpu.tuning(), subgroups: subgroupsNote(info), timestamp_query: info.timestamp_query });
  } finally {
    await gpu.profileStart("off");
    model.reset();
  }
}

// The Settings' KV cache of the load running ("auto", "f16", "q8_0", "q4_0").
let kvAsked = "auto";
const GIB = 2 ** 30;

// The context and KV cache type of a load of the model `name` of `size` bytes that
// `read(at, view)` reads (ctx.js's autoContext): its training context and KV bytes per
// token from its header (planModel's `kv` at three contexts), against the memory it may
// use: the GPU memory limit on the GPU, else the memory limit, at most WebAssembly's
// 4 GiB. `ctx`: the Settings' (0: Auto). null when the module cannot tell (an older one).
function sizeLoad(read, size, name, ctx, budget, gpuBudget, gpu) {
  let shape = null;
  try {
    shape = kvShape((c) => JSON.parse(inga.planModel(name, size, read, -1, c)).kv ?? NaN);
  } catch {}
  if (!shape) return null;
  const b = gpu && gpuBudget != null ? gpuBudget : Math.min(budget ?? 4 * GIB, 4 * GIB);
  return autoContext({ ...shape, budget: b, weights: size, asked: ctx || 0, kv: kvAsked, gpu });
}

// Loads a Blob (a picked File, or a file of OPFS) into Inga chunk by chunk: each chunk
// is copied once into its tensors in WebAssembly memory (or, on the GPU, its layers'
// weights into GPU buffers), then dropped.
async function load(blob, name, ctx, device, note = null) {
  step("waiting for the WebAssembly module");
  await ready;
  step(`module ready: loading the whole file into memory (${Math.round(blob.size / 1048576)} MiB, device ${device ?? "cpu"})`);
  if (model) {
    model.free();
    model = null;
  }
  const t0 = performance.now();
  // Auto's context and KV cache, from the header read synchronously from the Blob.
  let auto = null;
  try {
    const fr = new FileReaderSync();
    const read = (at, view) => {
      const b = new Uint8Array(fr.readAsArrayBuffer(blob.slice(at, at + view.length)));
      view.set(b);
      return b.length;
    };
    auto = sizeLoad(read, blob.size, name, ctx, null, null, device === "gpu");
  } catch {}
  const asked = auto?.ctx ?? (ctx || 2048);
  if (auto) step(`context ${auto.ctx} (${auto.why}), KV cache ${auto.kv}`);
  mod = device === "gpu" ? await webgpu() : inga;
  const loader = device === "gpu" ? mod.Loader.withGpu(gpu) : new mod.Loader();
  for (let at = 0; at < blob.size; at += CHUNK) {
    const chunk = new Uint8Array(await blob.slice(at, at + CHUNK).arrayBuffer());
    loader.push(chunk);
    post({ type: "progress", what: "load", done: Math.min(at + CHUNK, blob.size), total: blob.size });
  }
  step("file read: building the model");
  model = loader.finish(name, asked, auto?.kv);
  step("model ready: telling the page");
  post({ type: "loaded", info: JSON.parse(model.info()), secs: (performance.now() - t0) / 1000, memory: mod.memoryBytes(), gpu: gpuInfo(), note, ctx_asked: asked, ctx_auto: auto });
}

// The GPU's bytes, while the loaded model runs layers there.
function gpuInfo() {
  return onGpu() ? JSON.parse(gpu.info()) : null;
}

// Whether the loaded model runs layers on the GPU: it then answers a token at a time.
function onGpu() {
  return !!(model && gpu && mod === gpuInga && JSON.parse(model.info()).device === "webgpu");
}

// An answer a token at a time (the GPU's way): the GPU's results are awaited between
// steps, so a {type: "stop"} message gets in.
async function stepped(m, onPiece) {
  const opts = JSON.stringify(m.opts ?? {});
  if (m.type === "chat") model.chatBegin(JSON.stringify(m.messages), opts);
  else model.completeBegin(m.text, opts);
  stopAsked = false;
  for (;;) {
    const r = model.step((text, reasoning) => onPiece(text, reasoning) || stopAsked);
    if (r === 1) await model.ready();
    else if (r === 2) break;
  }
  return model.stats();
}

async function handle(m) {
  switch (m.type) {
    case "download":
      await download(m.url, m.name);
      await list();
      break;
    case "load": {
      step(`load asked: ${m.name ?? m.file?.name}, device ${m.device ?? "cpu"}, limit ${m.budget == null ? "none" : Math.round(m.budget / 1048576) + " MiB"}`);
      closeStream();
      kvAsked = m.kv || "auto";
      if ((m.budget != null || m.draft || m.device === "gpu") && !m.file) {
        gpuMeasuredBytes = m.gpuMeasured ?? null;
        if (m.gpuProbe && m.device === "gpu") gpuMeasuredBytes = (await gpuMemory()) ?? gpuMeasuredBytes;
        await loadStreamed(m.name, m.budget, m.ctx, m.draft, m.device, m.gpuBudget, m.gpuOff, m.gpuSeparate, m.auto, m.note ?? null);
        break;
      }
      let blob = m.file;
      if (!blob) blob = await (await (await modelsDir()).getFileHandle(m.name)).getFile();
      await load(blob, m.name ?? m.file.name, m.ctx, m.device, m.note ?? null);
      break;
    }
    case "list":
      await list();
      break;
    case "delete": {
      // A stored model (`name`, with its sidecar) or any stored file (`path`).
      if (m.path != null) {
        if ([streamName, draftName].some((n) => n != null && m.path === DIR + "/" + n)) closeStream();
        await removePath(m.path);
        if (m.path.startsWith(DIR + "/") && !m.path.endsWith(".json")) await removePath(m.path + ".json").catch(() => {});
      } else {
        if (m.name === streamName || m.name === draftName) closeStream();
        const dir = await modelsDir();
        for (const n of [m.name, m.name + ".json"]) await dir.removeEntry(n).catch(() => {});
      }
      await list();
      break;
    }
    case "wipe":
      try {
        await wipe();
      } finally {
        await list();
      }
      break;
    case "chat":
    case "complete": {
      if (!model) throw new Error("no model is loaded");
      // With cross-origin isolation the page shares a flag the callback reads; without
      // it the page stops an answer by ending this worker.
      const flag = m.stop ? new Int32Array(m.stop) : null;
      const onPiece = (text, reasoning) => {
        post({ type: "piece", text, reasoning });
        return flag ? Atomics.load(flag, 0) !== 0 : false;
      };
      const opts = JSON.stringify(m.opts ?? {});
      // A conversation longer than the context: its oldest messages are left out.
      if (m.type === "chat" && m.fit && typeof model.countChat === "function") {
        const fit = fitMessages(m.messages, (l) => countChat(l, opts), m.fit);
        if (fit.dropped) {
          m.messages = fit.messages;
          post({ type: "trimmed", dropped: fit.dropped, tokens: fit.tokens });
        }
      }
      const stats = onGpu() ? await stepped(m, onPiece)
        : m.type === "chat" ? model.chat(JSON.stringify(m.messages), opts, onPiece) : model.complete(m.text, opts, onPiece);
      post({ type: "done", stats: JSON.parse(stats), memory: mod.memoryBytes(), gpu: gpuInfo() });
      break;
    }
    case "count": {
      let tokens = null;
      let parts = null;
      try {
        const opts = JSON.stringify(m.opts ?? {});
        // The ring's panel is open: the parts too (a few counts more), else the total.
        if (m.detail && typeof model?.countChat === "function") {
          parts = breakdown(m.messages, (l) => countChat(l, opts), m.draft, m.fit);
          tokens = parts.total;
        } else tokens = countChat(m.messages, opts);
      } catch {}
      post({ type: "count", id: m.id, tokens, parts });
      break;
    }
    case "reset":
      model?.reset();
      break;
    case "import":
      await importFile(m.file);
      await list();
      break;
    case "disktest":
      await diskTest();
      break;
    case "panic":
      await ready;
      inga.testPanic(m.what);
      break;
    case "stop":
      stopAsked = true;
      break;
    case "gpubench":
      await gpuBench(m.tokens || 32);
      break;
    case "gpuprofile":
      await gpuProfile(m.tokens || 16, m.mode);
      break;
    case "gpucheck":
      await gpuCheck(m.storageBuffers);
      break;
    case "tune":
      // Gpu.tune's switches on the loaded GPU model (the WebGPU measurement, browser.cjs perf).
      if (!gpu) throw new Error("no GPU device: load a model with Device GPU first");
      // "reset": the kernels the device chose for this adapter, every switch on.
      gpu.tune(m.spec === "reset" ? gpuTuning + ",head=on,qonce=on,reuse=on,sampling=on" : m.spec);
      post({ type: "tuned", tuning: gpu.tuning() });
      break;
  }
}

// ---- Weights read from OPFS while the model runs (a model larger than the memory) ----

let streamHandle = null; // the sync access handle the loaded model reads, kept open
let streamName = null;
let draftHandle = null; // the draft model's, while it is loaded
let draftName = null;

function closeStream() {
  if (model && streamHandle) {
    model.free();
    model = null;
  }
  streamHandle?.close();
  draftHandle?.close();
  streamHandle = streamName = draftHandle = draftName = null;
}

// Loads `name` from OPFS within `budget` bytes of memory for the model: Inga reads the
// file itself, at offsets, straight into WebAssembly memory (FileSystemSyncAccessHandle.read
// into a view of it), and what does not fit is read again while it runs (the embeddings a
// row per token, the output layer and the last layers whole at every token); a model that
// cannot fit is refused before its weights are read.
// With `draft` (another stored model of the same vocabulary), that model drafts for it:
// held whole, its memory taken out of `budget` (speculative decoding; Runner::from_sources).
//
// With `device` "gpu", the first layers go to the GPU, as many as fit `gpuBudget` bytes
// there (the GPU's bytes count against `budget` too), the rest as on the CPU (no draft
// there yet). When the GPU cannot run the model after all (its layers' kind: the reason
// is in the error), it loads on the CPU, and the load line says why.
// `gpuOff`: GPU optimizations turned off for a measurement's baseline (Gpu.tune).
// `gpuSeparate`: `budget` bounds WebAssembly memory alone, the GPU's bytes only
// `gpuBudget` (the page's "GPU memory accounting: Apart").
// `auto`: Device Auto chose the GPU; a model that needs storage (planModel: layers, the
// output layer or embeddings read while it runs) under one limit then loads on the CPU.
// Before the GPU is opened, its kernels are checked against the model's header
// (gpuPlan: the layers' kind and weight types): a model the GPU would run none of
// loads on the CPU at once, the GPU untouched. When the GPU refuses the model while it
// loads (`Unsupported`), nothing of that attempt is kept: the GPU device is destroyed
// and the page starts a fresh worker that loads the model on the CPU ({type: "retry"},
// with the reason), so the CPU's load starts from an empty WebAssembly memory (it
// never shrinks: on an iPhone the attempt's peak plus the CPU's load could pass the
// tab's limit, and Safari ends the worker without a word). `note`: a reason the
// page passes on from such a retry, shown with the load.
async function loadStreamed(name, budget, ctx, draft, device, gpuBudget, gpuOff, gpuSeparate, auto, note = null) {
  step("waiting for the WebAssembly module");
  await ready;
  step("module ready");
  if (model) {
    model.free();
    model = null;
  }
  closeStream();
  const t0 = performance.now();
  const progress = (done, total) => post({ type: "progress", what: "load", done, total });
  const open = async () => {
    const h = await readHandle(await (await modelsDir()).getFileHandle(name));
    [streamHandle, streamName] = [h, name];
    return h;
  };
  // The context asked, and, when the memory limit cannot hold its KV cache even with
  // everything else read from storage (the plan's "smaller context"), the largest that
  // it holds (a multiple of 256): loaded with that one, the page says why (`ctx_cut`),
  // rather than refusing the model. On the CPU it is found from the header
  // (planModel); on the GPU, whose layers hold their KV cache apart, by asking the GPU's
  // load again with half the context.
  // Auto's context and KV cache (sizeLoad), from the header.
  let sized = null;
  {
    const h = await open();
    try {
      sized = sizeLoad((at, view) => h.read(view, { at }), h.getSize(), name, ctx, budget, gpuBudget, device === "gpu");
    } finally {
      h.close();
      streamHandle = streamName = null;
    }
  }
  if (sized) {
    ctx = sized.ctx;
    step(`context ${sized.ctx} (${sized.why}), KV cache ${sized.kv}`);
  }
  const kv = sized?.kv;
  const asked = ctx || 2048;
  let ctxCut = null;
  const cutContext = async () => {
    if (budget == null) return;
    const h = await open();
    const fits = (c) => {
      try {
        inga.planModel(name, h.getSize(), (at, view) => h.read(view, { at }), budget, c, kv);
        return true;
      } catch (e) {
        if (/smaller context/.test(String(e?.message ?? e))) return false;
        throw e;
      }
    };
    try {
      if (!fits(asked)) {
        // In 256s: `lo` fits (0: none does), `hi` does not.
        let [lo, hi] = [0, Math.floor(asked / 256)];
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (fits(mid * 256)) lo = mid;
          else hi = mid;
        }
        if (lo > 0) {
          ctx = lo * 256;
          ctxCut = { asked, got: ctx, budget, device: "cpu" };
          step(`context: ${ctx} of the ${asked} asked, the most the memory limit (${mib(budget)}) holds`);
        }
      }
    } catch {
      // The plan cannot tell: the load says why, if it fails.
    } finally {
      h.close();
      streamHandle = streamName = null;
    }
  };
  if (device === "gpu") {
    let plan = null;
    try {
      step("GPU check: loading the GPU module");
      const m = await gpuModule();
      step("GPU check: reading the model's header");
      const h = await open();
      try {
        plan = JSON.parse(m.gpuPlan(name, h.getSize(), (at, view) => h.read(view, { at }), ctx || 0));
      } finally {
        h.close();
        streamHandle = streamName = null;
      }
    } catch (e) {
      if (e instanceof WebAssembly.RuntimeError) throw e;
      plan = { layers: 0, of: null, why: String(e?.message ?? e) };
    }
    step(`GPU check: ${plan?.layers ?? "?"} layers the GPU can run${plan?.why ? " (" + plan.why + ")" : ""}`);
    if (plan && plan.layers === 0) {
      device = "cpu";
      note = `On the CPU: the GPU would run none of its layers (${plan.why ?? "no layer"}), so it was not opened`;
    }
  }
  if (device === "gpu" && auto && !gpuSeparate && budget != null) {
    const h = await open();
    let plan = null;
    try {
      plan = JSON.parse(inga.planModel(name, h.getSize(), (at, view) => h.read(view, { at }), budget, ctx || 0, kv));
    } catch {}
    h.close();
    streamHandle = streamName = null;
    if (plan && (plan.streamed_layers || plan.output_parts || plan.read_by_row)) {
      device = "cpu";
      note = `On the CPU (Auto): this model needs storage within the limit (${plan.streamed_layers} layers` +
        `${plan.output_parts ? `, the output layer in ${plan.output_parts} parts` : ""} read at every token on the CPU alone), and ` +
        "the GPU's share of the one limit would leave the CPU fewer weights: slower than the CPU alone " +
        "(Qwen3-4B on an iPhone 16 Pro: 0.9 tok/s with 14 layers on the GPU, 2.3 on the CPU)";
    }
  }
  if (device === "gpu") {
    let h = null;
    try {
      step("GPU: opening the device");
      mod = await webgpu();
      if (gpuOff) gpu.tune(gpuOff);
      step("GPU: opening the model file");
      h = await open();
      step("GPU: loading the weights");
      for (;;) {
        try {
          model = mod.openModelGpu(gpu, name, h.getSize(), (at, view) => h.read(view, { at }), budget ?? -1, gpuBudget ?? -1, ctx || 0, progress, !!gpuSeparate);
          break;
        } catch (e) {
          // The limits cannot hold this context's KV cache: half of it, down to 256.
          const half = Math.floor((ctx || 2048) / 512) * 256;
          if (!/smaller context/.test(String(e?.message ?? e)) || half < 256) throw e;
          ctx = half;
          ctxCut = { asked, got: ctx, budget, gpuBudget, device: "gpu" };
          step(`GPU: the limits do not hold a context of ${ctx * 2} tokens; trying ${ctx}`);
        }
      }
    } catch (e) {
      const why = String(e?.message ?? e);
      // A module that panicked is gone; a model that does not fit the limit does not
      // fit on the CPU either.
      if (e instanceof WebAssembly.RuntimeError || /smaller context/.test(why)) throw e;
      h?.close();
      streamHandle = streamName = null;
      model?.free();
      model = null;
      dropGpu();
      // The CPU's load in a fresh worker (see above).
      post({ type: "retry", device: "cpu", note: `On the CPU: the GPU did not take this model (${why})` });
      return;
    }
    // A model the GPU runs no layer of (its budget): the device goes, its share of
    // memory with it.
    if (model && JSON.parse(model.info()).device !== "webgpu") dropGpu();
  }
  if (!model) {
    mod = inga;
    await cutContext();
    step("CPU: opening the model file");
    const h = await open();
    let d = null;
    if (draft) {
      d = await readHandle(await (await modelsDir()).getFileHandle(draft));
      [draftHandle, draftName] = [d, draft];
    }
    step(`CPU: loading the weights (${Math.round(h.getSize() / 1048576)} MiB file)`);
    model = inga.openModel(name, h.getSize(), (at, view) => h.read(view, { at }), budget ?? -1, ctx || 0, progress,
      d ? draft : undefined, d ? d.getSize() : undefined, d ? (at, view) => d.read(view, { at }) : undefined, undefined, kv);
  }
  step("weights loaded: reading the model's description");
  const info = JSON.parse(model.info());
  step(`model ready (${Math.round(mod.memoryBytes() / 1048576)} MiB of WebAssembly memory): telling the page`);
  const g = gpuInfo();
  const past = gpuMeasuredNote(g);
  post({ type: "loaded", info, secs: (performance.now() - t0) / 1000, memory: mod.memoryBytes(), gpu: g, note: [note, past].filter(Boolean).join("; ") || null, ctx_asked: asked, ctx_cut: ctxCut, ctx_auto: sized });
}

// Free bytes in this site's storage, or null when the browser does not say.
async function freeStorage() {
  const e = await navigator.storage.estimate?.();
  return e?.quota ? e.quota - (e.usage || 0) : null;
}

const mib = (b) => (b / (1 << 20)).toFixed(0) + " MiB";

// Copies a picked file into OPFS (models/<its name>), so its layers can be read while
// it runs; skipped when a whole copy of the same size is there already.
async function importFile(file) {
  const dir = await modelsDir();
  const meta = await readMeta(dir, file.name);
  if (meta?.complete && meta.size === file.size) return;
  const free = await freeStorage();
  if (free != null && free < file.size) {
    throw new Error(`This site's storage has ${mib(free)} free; ${file.name} needs ${mib(file.size)}. Delete a stored model, or choose "All in memory".`);
  }
  const h = await syncHandle(await dir.getFileHandle(file.name, { create: true }));
  try {
    h.truncate(0);
    for (let at = 0; at < file.size; at += CHUNK) {
      const chunk = new Uint8Array(await file.slice(at, at + CHUNK).arrayBuffer());
      if (h.write(chunk, { at }) !== chunk.byteLength) throw new Error("the site's storage is full");
      post({ type: "progress", what: "copy", done: Math.min(at + CHUNK, file.size), total: file.size });
    }
    h.flush();
  } finally {
    h.close();
  }
  await writeMeta(dir, file.name, { url: null, size: file.size, complete: true });
}

// Writes 256 MiB to OPFS, reads it back through a sync access handle in 8 MiB chunks,
// deletes it, and reports MB/s (MB: 10^6 bytes). The read follows the write, so the
// system may serve it from its cache: the figure is an upper bound of a cold read.
async function diskTest() {
  const total = 256 << 20;
  const free = await freeStorage();
  if (free != null && free < total + (64 << 20)) throw new Error(`The disk test needs ${mib(total)} free in this site's storage; ${mib(free)} are.`);
  const root = await navigator.storage.getDirectory();
  const name = "inga-disk-test.tmp";
  const h = await syncHandle(await root.getFileHandle(name, { create: true }));
  const buf = new Uint8Array(CHUNK);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.imul(i, 2654435761) >>> 24;
  try {
    let t0 = performance.now();
    for (let at = 0; at < total; at += CHUNK) {
      h.write(buf, { at });
      post({ type: "progress", what: "disktest", done: at + CHUNK, total: 2 * total });
    }
    h.flush();
    const write = (performance.now() - t0) / 1000;
    t0 = performance.now();
    for (let at = 0; at < total; at += CHUNK) {
      if (h.read(buf, { at }) !== CHUNK) throw new Error("the disk test read fewer bytes than it wrote");
      post({ type: "progress", what: "disktest", done: total + at + CHUNK, total: 2 * total });
    }
    const read = (performance.now() - t0) / 1000;
    post({ type: "disktest", bytes: total, write_mbs: total / 1e6 / write, read_mbs: total / 1e6 / read });
  } finally {
    h.close();
    await root.removeEntry(name).catch(() => {});
  }
}

self.onmessage = async ({ data }) => {
  try {
    await handle(data);
  } catch (e) {
    // A Rust panic traps the module ("unreachable"): its message says why. The model
    // it was running must not be used again.
    const why = inga?.lastPanic?.() ?? (gpuInga !== inga ? gpuInga?.lastPanic?.() : undefined);
    if (why) {
      model = null;
      streamHandle?.close();
      draftHandle?.close();
      streamHandle = streamName = draftHandle = draftName = null;
      post({ type: "error", message: `Inga stopped: ${why.replace(/\s*\n\s*/g, " ")}. Load the model again.`, panic: true });
      return;
    }
    post({ type: "error", message: String(e?.message ?? e) });
  }
};

ready.then(() => post({ type: "ready" }), (e) => post({ type: "error", message: "the WebAssembly module did not load: " + e }));
