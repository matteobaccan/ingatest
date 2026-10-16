// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// A model's sampling preset: what the page answers with by default once a model is
// loaded. The model's own recommendation (its GGUF file's `general.sampling.*` keys,
// read by the module as `recommended_sampling`, as `inga run` and `inga serve` use
// them), overridden by the catalog entry's `sampling` object (catalog.json: a model
// whose GGUF says nothing, with the values its makers publish); the catalog entry's
// `ctx` is the context its makers give. A setting changed by hand in the Settings is
// the user's and stays (app.js keeps them as `hand`), until "Use the model's settings".

// The Settings' inputs a preset sets, and the names of the options they give.
export const SAMPLING_FIELDS = {
  temp: "temperature",
  topp: "top_p",
  topk: "top_k",
  minp: "min_p",
  rep: "repeat_penalty",
  pres: "presence_penalty",
  freq: "frequency_penalty",
};
// Every preset field: the sampling ones and the context.
export const PRESET_FIELDS = [...Object.keys(SAMPLING_FIELDS), "ctx"];

// The catalog's entry of the file `name` (catalog.json's models, by a variant's file).
export function catalogEntry(catalog, name) {
  if (!name || !Array.isArray(catalog?.models)) return null;
  return catalog.models.find((m) => (m.variants || []).some((v) => String(v.file).split("/").pop() === name)) ?? null;
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// The preset of a loaded model: `recommended` (the module's `recommended_sampling`, {}
// when the GGUF has none) under `entry` (its catalog entry, or null). Returns
// { values: {field id: number}, from: {field id: "catalog" | "model"}, source } where
// `source` names the catalog's source when it gave something.
export function presetOf(recommended, entry) {
  const values = {};
  const from = {};
  for (const [id, key] of Object.entries(SAMPLING_FIELDS)) {
    const c = num(entry?.sampling?.[key]);
    const g = num(recommended?.[key]);
    if (c != null) [values[id], from[id]] = [c, "catalog"];
    else if (g != null) [values[id], from[id]] = [g, "model"];
  }
  const ctx = num(entry?.ctx);
  if (ctx != null && ctx >= 64) [values.ctx, from.ctx] = [ctx, "catalog"];
  return { values, from, source: entry?.sampling?.source ?? null };
}

// What the Settings' preset fields become: the preset's value where it has one, the
// page's default (`base`) otherwise, for every field not in `hand` (those changed by
// hand keep their value).
export function presetValues(preset, base, hand) {
  const out = {};
  for (const id of PRESET_FIELDS) {
    if (hand.has(id)) continue;
    out[id] = preset?.values[id] ?? base[id];
  }
  return out;
}

// The settings changed by hand of a page saved before presets existed: those whose
// stored value is not the page's default.
export function handFromSaved(saved, base) {
  const hand = new Set();
  for (const id of PRESET_FIELDS) {
    if (id in saved && String(saved[id]) !== String(base[id])) hand.add(id);
  }
  return hand;
}

// The preset in words: "temperature 0.7, top-p 0.9, top-k 40, repeat penalty 1.1,
// context 4096".
export function describePreset(preset) {
  const names = { temp: "temperature", topp: "top-p", topk: "top-k", minp: "min-p", rep: "repeat penalty", pres: "presence penalty", freq: "frequency penalty", ctx: "context" };
  return PRESET_FIELDS.filter((id) => preset.values[id] != null)
    .map((id) => `${names[id]} ${preset.values[id]}`)
    .join(", ");
}
