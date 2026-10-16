// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// The page's words in English and Italian: the side bar, the headings, the buttons and
// the labels (the elements with data-i18n, data-i18n-title, data-i18n-ph) and the few
// strings app.js writes (a download's progress among them); the longer explanations and
// the rest of the status line stay in English.

const STRINGS = {
  en: {
    "brand.sub": "AI models running in your browser",
    "nav.chat": "Chat", "nav.models": "Models", "nav.settings": "Settings", "nav.diag": "Tests and report",
    "side.convs": "Conversations", "chat.new": "New chat",
    "conv.rename": "Rename this conversation", "conv.md": "Export as Markdown", "conv.json": "Download as JSON", "conv.full": "Full screen",
    "conv.count.one": "1 message", "conv.count": "{0} messages", "conv.delete": "Delete this conversation",
    "conv.renameask": "The conversation's title", "conv.none": "No conversation yet.",
    "chat.ph": "Write a message", "chat.think": "Think", "chat.stop": "Stop", "chat.send": "Send",
    "chat.nomodel": "No model: pick one", "chat.empty": "Pick a model, then ask anything: it runs on this device, nothing is sent anywhere.",
    "hint.enter": "Enter to send, Shift+Enter for a new line", "hint.ctrl": "Ctrl+Enter (⌘+Enter) to send, Enter for a new line",
    "models.catalog": "Model catalog", "models.browse": "Browse models", "models.tests": "Test models", "models.load": "Load a model",
    "models.stored": "Stored models", "models.wipe": "Delete model files", "models.wipeall": "Delete all stored data",
    "set.gen": "Answers", "set.temp": "Temperature", "set.rep": "Repeat penalty", "set.pres": "Presence penalty", "set.freq": "Frequency penalty",
    "set.max": "Max tokens", "set.conv": "Conversation", "set.sys": "System prompt", "set.syson": "Send a system prompt first",
    "set.past": "Past messages sent", "set.sendkey": "Send key", "set.load": "Model loading", "set.ctx": "Context window",
    "set.look": "Appearance", "set.theme": "Theme", "set.font": "Font size", "set.lang": "Language", "set.log": "Load log",
    "set.reset": "Reset all settings",
    "diag.std": "Standard test", "diag.gpu": "GPU", "diag.disk": "Storage speed", "diag.report": "Report",
    "dl.of": "Downloading: {0} of {1} ({2} %)", "dl.got": "Downloading: {0}", "dl.speed": "{0} MB/s",
    "dl.estimating": "estimating…", "dl.left": "about {0} left", "dl.pick": "{0} at your last measured speed",
  },
  it: {
    "brand.sub": "Modelli di IA nel tuo browser",
    "nav.chat": "Chat", "nav.models": "Modelli", "nav.settings": "Impostazioni", "nav.diag": "Test e segnalazioni",
    "side.convs": "Conversazioni", "chat.new": "Nuova chat",
    "conv.rename": "Rinomina la conversazione", "conv.md": "Esporta in Markdown", "conv.json": "Scarica in JSON", "conv.full": "Schermo intero",
    "conv.count.one": "1 messaggio", "conv.count": "{0} messaggi", "conv.delete": "Elimina la conversazione",
    "conv.renameask": "Il titolo della conversazione", "conv.none": "Ancora nessuna conversazione.",
    "chat.ph": "Scrivi un messaggio", "chat.think": "Ragiona", "chat.stop": "Ferma", "chat.send": "Invia",
    "chat.nomodel": "Nessun modello: scegline uno", "chat.empty": "Scegli un modello, poi chiedi quello che vuoi: gira su questo dispositivo, non viene inviato nulla.",
    "hint.enter": "Invio per inviare, Maiusc+Invio per andare a capo", "hint.ctrl": "Ctrl+Invio (⌘+Invio) per inviare, Invio per andare a capo",
    "models.catalog": "Catalogo dei modelli", "models.browse": "Sfoglia i modelli", "models.tests": "Modelli di prova", "models.load": "Carica un modello",
    "models.stored": "Modelli salvati", "models.wipe": "Elimina i file dei modelli", "models.wipeall": "Elimina tutti i dati salvati",
    "set.gen": "Risposte", "set.temp": "Temperatura", "set.rep": "Penalità di ripetizione", "set.pres": "Penalità di presenza", "set.freq": "Penalità di frequenza",
    "set.max": "Token massimi", "set.conv": "Conversazione", "set.sys": "Prompt di sistema", "set.syson": "Invia prima un prompt di sistema",
    "set.past": "Messaggi precedenti inviati", "set.sendkey": "Tasto di invio", "set.load": "Caricamento del modello", "set.ctx": "Finestra di contesto",
    "set.look": "Aspetto", "set.theme": "Tema", "set.font": "Dimensione del testo", "set.lang": "Lingua", "set.log": "Registro di caricamento",
    "set.reset": "Ripristina tutte le impostazioni",
    "diag.std": "Test standard", "diag.gpu": "GPU", "diag.disk": "Velocità della memoria", "diag.report": "Segnalazione",
    "dl.of": "Download: {0} di {1} ({2} %)", "dl.got": "Download: {0}", "dl.speed": "{0} MB/s",
    "dl.estimating": "stima in corso…", "dl.left": "mancano circa {0}", "dl.pick": "{0} alla velocità misurata l'ultima volta",
  },
};

let lang = "en";

export function t(key, ...args) {
  const s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return s.replace(/\{(\d)\}/g, (_, i) => String(args[Number(i)]));
}

// Sets the language (`en` or `it`) and writes it into the page's marked elements.
export function setLang(l) {
  lang = STRINGS[l] ? l : "en";
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle);
  for (const el of document.querySelectorAll("[data-i18n-ph]")) el.placeholder = t(el.dataset.i18nPh);
}

export const languages = Object.keys(STRINGS);
