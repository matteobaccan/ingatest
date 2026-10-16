// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The model picker: the catalog of GGUF models on Hugging Face (catalog.json) in a
// dialog, with a search box, family chips and a card per model whose variants
// (quantizations) say whether they fit this browser. The page (app.js) gives it what it
// knows of the device (env) and of the stored models, and acts on Load and Delete.

const HF = "https://huggingface.co/";
const GiB = 1 << 30;
const MiB = 1 << 20;

// Beyond the weights, a model needs its KV cache (for the page's default 2048-token
// context) and its working buffers: a rough allowance, as the catalog cannot know each
// model's shapes. An estimated size ("approx") gets 8 % more, as estimates run low for
// small models (their embeddings are kept at higher precision).
const OVERHEAD = 256 * MiB;

export function variantUrl(m, v) {
  if (v.url) return new URL(v.url, location.href).href;
  const file = v.file.split("/").map(encodeURIComponent).join("/");
  return `${HF}${v.repo ?? m.repo}/resolve/main/${file}`;
}

export const fileOf = (v) => v.file.split("/").pop();

function size(b) {
  return b >= GiB ? (b / GiB).toFixed(b >= 10 * GiB ? 0 : 1) + " GiB" : Math.round(b / MiB) + " MiB";
}

// What fits: `bytes` of weights against `env`, what the page knows of this browser:
//   memory: the memory limit for the model (Settings, "Memory for the model"; null: All
//           in memory), never more than a 32-bit WebAssembly module addresses;
//   wasmMax: what the module can address (4 GiB: the build is wasm32, not Memory64);
//   deviceMemory: navigator.deviceMemory in GB (rounded, at most 8), or null;
//   gpu: {budget, maxBufferSize, maxStorageBufferBindingSize, guess, separate} when the
//        Device setting may use a WebGPU adapter, else null;
//   free: the storage this site may still use (navigator.storage.estimate), or null.
// Returns {mark: "fits" | "tight" | "big", icon, why}.
export function fitOf(bytes, approx, env) {
  const need = bytes * (approx ? 1.08 : 1) + OVERHEAD;
  if (env.free != null && bytes > env.free) {
    return { mark: "big", icon: "❌", why: `larger than the storage this browser still gives the site (${size(env.free)} free)` };
  }
  // The tab's memory: the limit, under the 4 GiB a wasm32 module addresses, and at most
  // half of the device's memory where the browser tells it.
  let cpu = Math.min(env.memory ?? env.wasmMax, env.wasmMax);
  let by = env.memory == null ? "the 4 GiB WebAssembly addresses" : "the memory limit";
  if (env.deviceMemory) {
    const half = (env.deviceMemory * GiB) / 2;
    if (half < cpu) {
      cpu = half;
      by = `half of this device's ${env.deviceMemory} GB`;
    }
  }
  // Layers on the GPU are held there, not in WebAssembly memory, when the GPU's bytes
  // are counted apart (a desktop); its budget is the Settings' "GPU memory".
  const gpu = env.gpu && env.gpu.separate ? env.gpu.budget : 0;
  const cap = cpu + gpu;
  const where = gpu ? `${size(cpu)} for the CPU (${by}) + ${size(gpu)} on the GPU${env.gpu.guess ? " (a guess)" : ""}` : `${size(cpu)} (${by})`;
  if (need <= 0.85 * cap) return { mark: "fits", icon: "✅", why: `about ${size(need)} with its cache, of ${where}` };
  if (need <= cap) return { mark: "tight", icon: "⚠️", why: `tight: about ${size(need)} with its cache, of ${where}` };
  // All in memory: nothing is read from storage, so what does not fit cannot load.
  if (env.memory == null) return { mark: "big", icon: "❌", why: `about ${size(need)}, more than ${where} (All in memory)` };
  // Larger: what does not fit is read from storage at every token. Up to twice the
  // room, slow but usable; beyond, too slow to be of use.
  if (need <= 2 * cap) return { mark: "tight", icon: "⚠️", why: `about ${size(need)}, more than ${where}: ${size(need - cap)} read from storage at every token (slow)` };
  return { mark: "big", icon: "❌", why: `too big for this browser: about ${size(need)}, more than twice ${where}` };
}

// The models matching the search `q` (words in the name, family, id, tags, quantizations,
// repository) and the family chip `family` ("" for all); unless `all`, models none of
// whose variants is better than "too big" are left out.
export function filterModels(catalog, { q = "", family = "", all = false, env }) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.models.filter((m) => {
    if (family && m.family !== family) return false;
    const hay = [m.name, m.id, m.family, m.arch, m.repo, ...(m.tags ?? []), ...m.variants.map((v) => v.quant)].join(" ").toLowerCase();
    if (!words.every((w) => hay.includes(w))) return false;
    return all || m.variants.some((v) => fitOf(v.size, v.approx, env).mark !== "big");
  });
}

// The variant a card shows first: a stored one, else the largest that fits, else the
// largest that is tight, else the smallest.
function defaultVariant(m, env, stored) {
  const st = m.variants.findIndex((v) => stored[fileOf(v)] != null);
  if (st >= 0) return st;
  const by = (mark) => m.variants.map((v, i) => [v, i]).filter(([v]) => fitOf(v.size, v.approx, env).mark === mark).sort((a, b) => b[0].size - a[0].size)[0]?.[1];
  return by("fits") ?? by("tight") ?? m.variants.reduce((b, v, i) => (v.size < m.variants[b].size ? i : b), 0);
}

// The dialog. `opts`: {dialog, url, getEnv(): Promise<env>, getStored(): {file: bytes},
// speedHint(bytes): the time a download would take ("" when unknown), onLoad(model,
// variant, url), onDelete(file)}.
export function createPicker(opts) {
  const d = opts.dialog;
  const $ = (sel) => d.querySelector(sel);
  let catalog = null;
  let env = null;
  let family = "";
  const chosen = {}; // model id -> variant index the user picked

  async function fetchCatalog() {
    const r = await fetch(opts.url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${opts.url}`);
    const c = await r.json();
    if (!Array.isArray(c?.models) || !Array.isArray(c?.families)) throw new Error("not a model catalog (no models or families)");
    return c;
  }

  function chips() {
    const box = $("#picker-chips");
    box.textContent = "";
    for (const f of [{ id: "", label: "All", icon: "" }, ...catalog.families]) {
      if (f.id && !catalog.models.some((m) => m.family === f.id)) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (f.id === family ? " on" : "");
      b.dataset.family = f.id;
      b.textContent = (f.icon ? f.icon + " " : "") + f.label;
      if (f.about) b.title = f.about;
      b.setAttribute("aria-pressed", String(f.id === family));
      b.onclick = () => {
        family = f.id;
        chips();
        render();
      };
      box.append(b);
    }
  }

  function render() {
    if (!catalog || !env) return;
    const stored = opts.getStored();
    const grid = $("#picker-grid");
    grid.textContent = "";
    const list = filterModels(catalog, { q: $("#picker-q").value, family, all: $("#picker-all").checked, env });
    const hidden = filterModels(catalog, { q: $("#picker-q").value, family, all: true, env }).length - list.length;
    $("#picker-count").textContent = `${list.length} model${list.length === 1 ? "" : "s"}` +
      (hidden ? ` (${hidden} too big for this browser hidden)` : "");
    if (!list.length) {
      const p = document.createElement("p");
      p.className = "meta";
      p.textContent = "No model matches.";
      grid.append(p);
      return;
    }
    const fam = Object.fromEntries(catalog.families.map((f) => [f.id, f]));
    for (const m of list) {
      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = m.id;
      const head = document.createElement("div");
      head.className = "card-head";
      const icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = fam[m.family]?.icon ?? "";
      icon.title = fam[m.family]?.label ?? m.family;
      const name = document.createElement("strong");
      name.textContent = m.name;
      head.append(icon, name);
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = [m.params ? `${m.params < 1 ? Math.round(m.params * 1000) + "M" : m.params + "B"} parameters` : "", m.arch, m.licence, ...(m.tags ?? [])].filter(Boolean).join(" · ");
      const sel = document.createElement("select");
      sel.className = "variant";
      sel.setAttribute("aria-label", `${m.name}: variant`);
      m.variants.forEach((v, i) => {
        const o = document.createElement("option");
        const f = fitOf(v.size, v.approx, env);
        o.value = String(i);
        o.textContent = `${v.quant} · ${v.approx ? "~" : ""}${size(v.size)} ${f.icon}${stored[fileOf(v)] != null ? " · downloaded" : ""}`;
        sel.append(o);
      });
      sel.value = String(chosen[m.id] ?? defaultVariant(m, env, stored));
      const info = document.createElement("div");
      info.className = "meta fit-line";
      const row = document.createElement("div");
      row.className = "row";
      const load = document.createElement("button");
      load.className = "load";
      load.dataset.act = "1";
      const del = document.createElement("button");
      del.className = "ghost delete";
      del.dataset.act = "1";
      del.textContent = "Delete";
      const link = document.createElement("a");
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Hugging Face";
      row.append(load, del, link);
      const show = () => {
        const v = m.variants[Number(sel.value)];
        const f = fitOf(v.size, v.approx, env);
        const have = stored[fileOf(v)] != null;
        card.dataset.fit = f.mark;
        card.dataset.downloaded = String(have);
        info.textContent = "";
        const mark = document.createElement("span");
        mark.className = "fit " + f.mark;
        mark.textContent = `${f.icon} ${{ fits: "fits", tight: "tight", big: "too big" }[f.mark]}`;
        mark.title = f.why;
        const sz = document.createElement("span");
        sz.className = "size";
        sz.textContent = ` · ${v.approx ? "about " : ""}${size(v.size)}${v.approx ? " (estimated, not yet checked)" : ""}`;
        // Before a download: how long it would take at the last speed measured.
        const hint = have ? "" : opts.speedHint?.(v.size) ?? "";
        if (hint) {
          const eta = document.createElement("span");
          eta.className = "eta";
          eta.textContent = ` · ${hint}`;
          sz.append(eta);
        }
        info.append(mark, sz);
        if (have) {
          const dl = document.createElement("span");
          dl.className = "downloaded";
          dl.textContent = " · 💾 downloaded";
          info.append(dl);
        }
        if (v.missing) info.append(" · ⚠️ not found on Hugging Face when last checked");
        const why = document.createElement("div");
        why.textContent = f.why + (m.note ? `. ${m.note}` : "");
        info.append(why);
        load.textContent = have ? "Load" : "Download and load";
        load.title = `${v.repo ?? m.repo}/${v.file}`;
        del.hidden = !have;
        link.href = v.url ? variantUrl(m, v) : `${HF}${v.repo ?? m.repo}`;
        load.onclick = () => {
          d.close();
          opts.onLoad(m, v, variantUrl(m, v));
        };
        del.onclick = () => opts.onDelete(fileOf(v));
      };
      sel.onchange = () => {
        chosen[m.id] = Number(sel.value);
        show();
      };
      show();
      card.append(head, meta, sel, info, row);
      grid.append(card);
    }
    opts.afterRender?.();
  }

  function envLine() {
    const parts = [`memory for the model ${env.memory == null ? "all (no limit)" : size(env.memory)}`, "WebAssembly 4 GiB (wasm32)"];
    if (env.deviceMemory) parts.push(`device memory about ${env.deviceMemory} GB`);
    if (env.gpu) {
      parts.push(`GPU ${env.gpu.name}: ${size(env.gpu.budget)} for layers${env.gpu.guess ? " (a guess)" : ""}` +
        `${env.gpu.separate ? "" : " counted in the memory limit"}, maxBufferSize ${size(env.gpu.maxBufferSize)}, ` +
        `maxStorageBufferBindingSize ${size(env.gpu.maxStorageBufferBindingSize)}`);
    } else parts.push("CPU only (Device setting, or no WebGPU)");
    if (env.free != null) parts.push(`storage free ${size(env.free)}`);
    $("#picker-env").textContent = "Judged on: " + parts.join(" · ") + ". ✅ fits in memory · ⚠️ tight, or part read from storage at every token · ❌ too big for this browser.";
    const when = catalog?.checked ? `sizes and files checked on Hugging Face on ${catalog.checked}` : "sizes estimated, files not yet checked on Hugging Face (tools/wasm-catalog.py)";
    $("#picker-source").textContent = `${catalog.models.length} models, ${catalog.models.reduce((a, m) => a + m.variants.length, 0)} variants; ${when}.`;
  }

  async function open() {
    if (!d.open) d.showModal();
    $("#picker-grid").textContent = "Reading the catalog…";
    try {
      catalog ??= await fetchCatalog();
    } catch (e) {
      $("#picker-grid").textContent = `The model catalog could not be read (${e.message}): use a link or a file of this device below.`;
      return;
    }
    env = await opts.getEnv();
    chips();
    envLine();
    render();
    $("#picker-q").focus();
  }

  $("#picker-q").addEventListener("input", render);
  $("#picker-all").addEventListener("change", render);
  $("#picker-close").onclick = () => d.close();
  return { open, render: () => d.open && render(), get catalog() { return catalog; } };
}
