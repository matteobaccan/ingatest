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
    "brand.by": "A new inference engine, coming soon — by",
    "about.btn": "About Inga", "about.title": "About Inga", "about.close": "Close",
    "about.what": "Inga is a new local inference engine written in Rust, by Matteo Baccan, to be published soon.",
    "about.beta": "This page is its beta, running entirely in your browser (WebAssembly and WebGPU).",
    "about.private": "Nothing leaves this device except the model's download.",
    "about.profile": "Matteo Baccan on GitHub", "about.issues": "The beta's issues", "about.guide": "The beta's guide",
    "nav.chat": "Chat", "nav.models": "Models", "nav.settings": "Settings", "nav.diag": "Tests and report",
    "side.convs": "Conversations", "chat.new": "New chat",
    "conv.rename": "Rename this conversation", "conv.md": "Export as Markdown", "conv.json": "Download as JSON", "conv.full": "Full screen",
    "conv.count.one": "1 message", "conv.count": "{0} messages", "conv.delete": "Delete this conversation",
    "conv.renameask": "The conversation's title", "conv.none": "No conversation yet.",
    "conv.delask": "Delete this chat? “{0}”",
    "convs.more": "Export, import or delete every conversation", "convs.export": "Export all (JSON)", "convs.exportmd": "Export all (Markdown)",
    "convs.import": "Import chats", "convs.clear": "Delete all", "convs.exportfirst": "Export first", "convs.cancel": "Cancel",
    "convs.clearask.one": "Delete the only conversation? This cannot be undone: export it first to keep a copy.",
    "convs.clearask": "Delete all {0} conversations? This cannot be undone: export them first to keep a copy.",
    "convs.cleared": "Every conversation deleted.", "convs.exported": "Exported {0} conversations.", "convs.exported.one": "Exported 1 conversation.",
    "imp.done": "Imported {0} conversations", "imp.done.one": "Imported 1 conversation",
    "imp.skipped": "; {0} already here, skipped", "imp.skipped.one": "; 1 already here, skipped",
    "imp.renamed": "; {0} with an id already used, added with a numbered title", "imp.renamed.one": "; 1 with an id already used, added with a numbered title",
    "imp.error": "Cannot import: {0}",
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
    "set.wmem": "Memory for the model", "set.device": "Device", "set.gmem": "GPU memory", "set.gacct": "GPU memory accounting", "set.draft": "Draft model",
    "set.reloadnote": "Applies when you leave Settings (the model reloads).",
    "reload": "Reloading {0}{1}: the {2} setting changed", "reload.cpu": " on the CPU", "reload.gpu": " on the GPU",
    "reloaded": "Reloaded {0}{1}: the {2} setting changed.",
    // The per-model presets (preset.js): {0} a model, {1} its settings, {2} where they come from.
    "set.preset": "Preset", "preset.reset": "Use the model's settings",
    "preset.none": "No model loaded: Inga's defaults. A model's recommended settings apply when it loads, except those you change here.",
    "preset.model": "From the model: {0}, {1} ({2}).", "preset.empty": "From the model: {0} recommends nothing, so Inga's defaults.",
    "preset.src.gguf": "its GGUF file", "preset.src.catalog": "the catalog: {0}",
    "preset.yours": "Yours: {0} changed by hand.", "preset.yours.none": "Yours: {0} changed by hand; a model's recommended settings apply to the others when it loads.",
    "diag.std": "Standard test", "diag.gpu": "GPU", "diag.disk": "Storage speed", "diag.report": "Report",
    "dl.of": "Downloading: {0} of {1} ({2} %)", "dl.got": "Downloading: {0}", "dl.speed": "{0} MB/s",
    "dl.estimating": "estimating…", "dl.left": "about {0} left", "dl.pick": "{0} at your last measured speed",
    "ctx.label": "Context used", "ctx.text": "Context used: {0} of {1} tokens ({2} %)",
    "ctx.near": "The context is filling up: the oldest messages will be left out of what the model reads; start a new chat to keep them all.",
    "ctx.trimmed.one": "The context was full: the oldest message was left out of what the model read.",
    "ctx.trimmed": "The context was full: the {0} oldest messages were left out of what the model read.",
    // The ring's panel (as inga serve's web UI's): short labels.
    "ctx.title": "Context", "ctx.of": "{0} / {1} tokens of context", "ctx.used": "{0} % used · {1} tokens free",
    "ctx.counting": "Counting…", "ctx.part.system": "System prompt", "ctx.part.past": "Past messages sent",
    "ctx.part.draft": "Your draft", "ctx.part.room": "Kept for the answer",
    "ctx.drop.one": "Context full: the oldest message is left out. Start a new chat to keep it.",
    "ctx.drop": "Context full: the {0} oldest messages are left out. Start a new chat to keep them.",
    "ctx.size": "Context size: {0} tokens, {1}", "ctx.src.model": "the model's (n_ctx)", "ctx.src.set": "from Settings",
    "brand.beta": "Beta", "brand.beta.t": "Beta: Inga in the browser is experimental",
    // The selects' options: short (25 characters at most), their explanations under them.
    "opt.auto": "Auto", "opt.all": "All in memory", "opt.mb": "Limit in MB", "opt.gpu": "GPU (experimental)",
    "opt.gpu.na": "GPU (not available)", "opt.one": "One limit", "opt.apart": "Apart", "opt.none": "None",
    "opt.enter": "Enter", "opt.ctrl": "Ctrl+Enter (⌘+Enter)", "opt.theme.auto": "Auto (this device's)",
    "opt.light": "Light", "opt.dark": "Dark", "opt.small": "Small", "opt.normal": "Normal", "opt.large": "Large",
    "opt.xlarge": "Larger", "opt.log.all": "Every step", "opt.log.summary": "Start, end, errors", "opt.off": "Off",
  },
  it: {
    "brand.sub": "Modelli di IA nel tuo browser",
    "brand.by": "Un nuovo motore di inferenza, in arrivo — di",
    "about.btn": "Informazioni su Inga", "about.title": "Informazioni su Inga", "about.close": "Chiudi",
    "about.what": "Inga è un nuovo motore di inferenza locale scritto in Rust, di Matteo Baccan, che sarà pubblicato a breve.",
    "about.beta": "Questa pagina è la sua beta, che gira interamente nel tuo browser (WebAssembly e WebGPU).",
    "about.private": "Nulla lascia questo dispositivo, tranne il download del modello.",
    "about.profile": "Matteo Baccan su GitHub", "about.issues": "Le segnalazioni della beta", "about.guide": "La guida della beta",
    "nav.chat": "Chat", "nav.models": "Modelli", "nav.settings": "Impostazioni", "nav.diag": "Test e segnalazioni",
    "side.convs": "Conversazioni", "chat.new": "Nuova chat",
    "conv.rename": "Rinomina la conversazione", "conv.md": "Esporta in Markdown", "conv.json": "Scarica in JSON", "conv.full": "Schermo intero",
    "conv.count.one": "1 messaggio", "conv.count": "{0} messaggi", "conv.delete": "Elimina la conversazione",
    "conv.renameask": "Il titolo della conversazione", "conv.none": "Ancora nessuna conversazione.",
    "conv.delask": "Eliminare questa chat? “{0}”",
    "convs.more": "Esporta, importa o elimina tutte le conversazioni", "convs.export": "Esporta tutte (JSON)", "convs.exportmd": "Esporta tutte (Markdown)",
    "convs.import": "Importa chat", "convs.clear": "Elimina tutte", "convs.exportfirst": "Prima esporta", "convs.cancel": "Annulla",
    "convs.clearask.one": "Eliminare l'unica conversazione? Non si può annullare: esportala prima per tenerne una copia.",
    "convs.clearask": "Eliminare tutte le {0} conversazioni? Non si può annullare: esportale prima per tenerne una copia.",
    "convs.cleared": "Tutte le conversazioni eliminate.", "convs.exported": "Esportate {0} conversazioni.", "convs.exported.one": "Esportata 1 conversazione.",
    "imp.done": "Importate {0} conversazioni", "imp.done.one": "Importata 1 conversazione",
    "imp.skipped": "; {0} già presenti, saltate", "imp.skipped.one": "; 1 già presente, saltata",
    "imp.renamed": "; {0} con un id già usato, aggiunte con un titolo numerato", "imp.renamed.one": "; 1 con un id già usato, aggiunta con un titolo numerato",
    "imp.error": "Impossibile importare: {0}",
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
    "set.wmem": "Memoria per il modello", "set.device": "Dispositivo", "set.gmem": "Memoria della GPU", "set.gacct": "Conteggio della memoria GPU", "set.draft": "Modello bozza",
    "set.reloadnote": "Si applica quando esci dalle Impostazioni (il modello si ricarica).",
    "reload": "Ricarico {0}{1}: è cambiata l'impostazione {2}", "reload.cpu": " sulla CPU", "reload.gpu": " sulla GPU",
    "reloaded": "Ricaricato {0}{1}: è cambiata l'impostazione {2}.",
    "set.preset": "Preset", "preset.reset": "Usa le impostazioni del modello",
    "preset.none": "Nessun modello caricato: i valori predefiniti di Inga. Le impostazioni consigliate di un modello si applicano quando viene caricato, tranne quelle che cambi qui.",
    "preset.model": "Dal modello: {0}, {1} ({2}).", "preset.empty": "Dal modello: {0} non consiglia nulla, quindi i valori predefiniti di Inga.",
    "preset.src.gguf": "dal suo file GGUF", "preset.src.catalog": "dal catalogo: {0}",
    "preset.yours": "Tue: {0} cambiate a mano.", "preset.yours.none": "Tue: {0} cambiate a mano; alle altre si applicano le impostazioni consigliate di un modello quando viene caricato.",
    "diag.std": "Test standard", "diag.gpu": "GPU", "diag.disk": "Velocità della memoria", "diag.report": "Segnalazione",
    "dl.of": "Download: {0} di {1} ({2} %)", "dl.got": "Download: {0}", "dl.speed": "{0} MB/s",
    "dl.estimating": "stima in corso…", "dl.left": "mancano circa {0}", "dl.pick": "{0} alla velocità misurata l'ultima volta",
    "ctx.label": "Contesto usato", "ctx.text": "Contesto usato: {0} di {1} token ({2} %)",
    "ctx.near": "Il contesto si sta riempiendo: i messaggi più vecchi saranno esclusi da ciò che il modello legge; inizia una nuova chat per tenerli tutti.",
    "ctx.trimmed.one": "Il contesto era pieno: il messaggio più vecchio è stato escluso da ciò che il modello ha letto.",
    "ctx.trimmed": "Il contesto era pieno: i {0} messaggi più vecchi sono stati esclusi da ciò che il modello ha letto.",
    "ctx.title": "Contesto", "ctx.of": "{0} / {1} token di contesto", "ctx.used": "{0} % usato · {1} token liberi",
    "ctx.counting": "Conteggio…", "ctx.part.system": "Prompt di sistema", "ctx.part.past": "Messaggi precedenti inviati",
    "ctx.part.draft": "La tua bozza", "ctx.part.room": "Riservati alla risposta",
    "ctx.drop.one": "Contesto pieno: il messaggio più vecchio resta fuori. Inizia una nuova chat per tenerlo.",
    "ctx.drop": "Contesto pieno: i {0} messaggi più vecchi restano fuori. Inizia una nuova chat per tenerli.",
    "ctx.size": "Dimensione del contesto: {0} token, {1}", "ctx.src.model": "del modello (n_ctx)", "ctx.src.set": "dalle Impostazioni",
    "brand.beta": "Beta", "brand.beta.t": "Beta: Inga nel browser è sperimentale",
    "opt.auto": "Auto", "opt.all": "Tutto in memoria", "opt.mb": "Limite in MB", "opt.gpu": "GPU (sperimentale)",
    "opt.gpu.na": "GPU (non disponibile)", "opt.one": "Un solo limite", "opt.apart": "Separati", "opt.none": "Nessuno",
    "opt.enter": "Invio", "opt.ctrl": "Ctrl+Invio (⌘+Invio)", "opt.theme.auto": "Auto (del dispositivo)",
    "opt.light": "Chiaro", "opt.dark": "Scuro", "opt.small": "Piccolo", "opt.normal": "Normale", "opt.large": "Grande",
    "opt.xlarge": "Più grande", "opt.log.all": "Ogni passo", "opt.log.summary": "Inizio, fine, errori", "opt.off": "Spento",
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
