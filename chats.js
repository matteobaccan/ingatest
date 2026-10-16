// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The conversations, kept in this browser (IndexedDB, database "inga-chats"): each
// {id, title, created, updated, model, settings?: {params, system} (those of its last
// question), messages: [{role, content, reasoning?, stats?, model?, mark?, at}]}, `mark`
// being the model's catalog family (the answer's avatar). Where IndexedDB is refused (a
// private window of some browsers), they live in memory for the visit, and `persistent`
// says so.

const DB = "inga-chats";
const STORE = "chats";
let db = null;
const memory = new Map();
export let persistent = false;

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function open() {
  try {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    db = await req(r);
    persistent = true;
  } catch {
    db = null;
    persistent = false;
  }
}

function store(mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

// Every conversation, the latest first.
export async function list() {
  const all = db ? await req(store("readonly").getAll()) : [...memory.values()];
  return all.sort((a, b) => b.updated - a.updated);
}

export async function save(chat) {
  // A copy: what is stored does not change with the page's arrays.
  const c = structuredClone(chat);
  if (db) await req(store("readwrite").put(c));
  else memory.set(c.id, c);
}

export async function remove(id) {
  if (db) await req(store("readwrite").delete(id));
  else memory.delete(id);
}

export async function clear() {
  if (db) await req(store("readwrite").clear());
  memory.clear();
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// A conversation as Markdown: its title, then each message under its speaker.
export function markdown(chat) {
  const out = [`# ${chat.title}`, "", `${new Date(chat.created).toISOString()}${chat.model ? ` · ${chat.model}` : ""} · Inga in the browser`, ""];
  for (const m of chat.messages) {
    out.push(`## ${m.role === "user" ? "You" : m.model || "Inga"}`, "");
    if (m.reasoning) out.push("<details><summary>Thinking</summary>", "", m.reasoning.trim(), "", "</details>", "");
    out.push(m.content, "");
  }
  return out.join("\n");
}

// ---- Every conversation at once: a backup, its Markdown, its import ----

// The backup's version, on every conversation of the file. The file is a JSON list of
// conversations, as the native web UI's "Every chat" backup (inga serve): each one's
// {id, title, created, updated, model, settings: {params, system}, messages}, so a file
// moves between the two.
export const VERSION = 1;

export function backup(list) {
  return JSON.stringify(list.map((c) => ({ version: VERSION, ...c })), null, 1);
}

// Every conversation as one Markdown file, each under its title.
export function markdownAll(list) {
  return list.map(markdown).join("\n---\n\n");
}

const num = (x) => typeof x === "number" && Number.isFinite(x);
const time = (x) => (num(x) ? x : typeof x === "string" && !Number.isNaN(Date.parse(x)) ? Date.parse(x) : null);
const text = (x) => (typeof x === "string" ? x : Array.isArray(x) ? x.map((p) => (typeof p === "string" ? p : p?.text ?? "")).join("") : x == null ? "" : String(x));

// One conversation of a file, in this page's shape; null when it is not one. Reads this
// page's and the native web UI's (its `reasoning_content`, `created_at`, `settings`).
function chatOf(x) {
  if (!x || typeof x !== "object" || !Array.isArray(x.messages)) return null;
  const messages = x.messages.filter((m) => m && (m.role === "user" || m.role === "assistant")).map((m) => {
    const o = { role: m.role, content: text(m.content) };
    const r = typeof m.reasoning === "string" ? m.reasoning : typeof m.reasoning_content === "string" ? m.reasoning_content : "";
    if (r) o.reasoning = r;
    if (m.stats && num(m.stats.prompt_tps) && num(m.stats.gen_tps)) o.stats = m.stats;
    if (typeof m.model === "string" && m.model) o.model = m.model;
    if (num(m.at)) o.at = m.at;
    // Its model's mark (the avatar): an emoji, or a logo of the page's own icons/ only.
    const k = m.mark;
    if (k && typeof k === "object" && typeof k.icon === "string") {
      o.mark = { family: String(k.family ?? ""), label: String(k.label ?? ""), icon: k.icon.slice(0, 8) };
      if (typeof k.logo === "string" && /^icons\/[\w.-]+\.(svg|png|webp)$/.test(k.logo)) o.mark.logo = k.logo;
    }
    return o;
  });
  const created = time(x.created) ?? time(x.created_at) ?? messages.find((m) => m.at)?.at ?? Date.now();
  const last = messages.reduce((t, m) => Math.max(t, m.at ?? 0), 0);
  const firstQ = messages.find((m) => m.role === "user")?.content.replace(/\s+/g, " ").trim() ?? "";
  const c = {
    id: typeof x.id === "string" && x.id ? x.id : newId(),
    title: (typeof x.title === "string" && x.title.trim()) || firstQ.slice(0, 48) || "Chat",
    created,
    updated: time(x.updated) ?? (last || created),
    model: typeof x.model === "string" ? x.model : [...messages].reverse().find((m) => m.model)?.model ?? "",
    messages,
  };
  const s = x.settings;
  if (s && typeof s === "object") {
    const params = Object.fromEntries(Object.entries(s.params && typeof s.params === "object" ? s.params : {}).filter(([, v]) => num(v) || typeof v === "boolean"));
    c.settings = { params, system: typeof s.system === "string" ? s.system : "" };
  }
  return c;
}

// The conversations of a file read back: a backup (a list of conversations, this page's
// or the native web UI's), `{chats: [...]}`, or one conversation (this page's JSON
// download, the native web UI's JSON export). Throws when it is none of them.
export function parseImport(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.chats) ? data.chats : data && typeof data === "object" ? [data] : [];
  const out = list.map(chatOf).filter(Boolean);
  if (!out.length) throw new Error("not a conversation, nor a backup of conversations");
  return out;
}

// What a conversation says: its messages, in order (two copies of it are the same).
const sig = (c) => JSON.stringify([c.created, c.messages.map((m) => [m.role, m.content])]);

// The conversations of an import to add to those `have`, by id: one already here (the
// same id, or the same messages) is skipped; one whose id is taken by another
// conversation is added with a new id and its title numbered ("Title (2)"). Nothing
// here is overwritten.
export function merge(have, incoming) {
  const ids = new Set(have.map((c) => c.id));
  const sigs = new Set(have.map(sig));
  const titles = new Set(have.map((c) => c.title));
  const out = { add: [], skipped: 0, renamed: 0 };
  for (let c of incoming) {
    if (sigs.has(sig(c))) {
      out.skipped++;
      continue;
    }
    if (ids.has(c.id)) {
      let n = 2;
      while (titles.has(`${c.title} (${n})`)) n++;
      c = { ...c, id: newId(), title: `${c.title} (${n})` };
      out.renamed++;
    }
    ids.add(c.id);
    sigs.add(sig(c));
    titles.add(c.title);
    out.add.push(c);
  }
  return out;
}
