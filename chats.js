// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The conversations, kept in this browser (IndexedDB, database "inga-chats"): each
// {id, title, created, updated, model, messages: [{role, content, reasoning?, stats?,
// model?, at}]}. Where IndexedDB is refused (a private window of some browsers), they
// live in memory for the visit, and `persistent` says so.

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
