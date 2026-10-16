// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// A download's speed and the time it has left: a smoothed rate (an exponential moving
// average over about 5 s, the first second and the pauses left out), the remaining
// time as people say it ("about 3 min 20 s left"), and the last speed measured, kept in
// this browser for the picker's estimate before a download. Pure but for lastSpeed and
// saveSpeed (localStorage); the browser test checks them through the page.

const MiB = 1 << 20;
const GiB = 1 << 30;
const SPEED_KEY = "inga.dlspeed";

// Bytes as MiB or GiB.
export const fmt = (b) => (b >= GiB ? (b / GiB).toFixed(2) + " GiB" : (b / MiB).toFixed(1) + " MiB");

// The rate of a download, fed with the bytes of this session so far (a resumed download
// counts from where it resumed) and the time in seconds. `rate` is null until `settle`
// seconds were measured past the first `warmup` (the connection's start is not its
// speed); an interval longer than `pause` with no word (a stall, a tab in the
// background) is left out of the average.
export function createRate({ tau = 5, warmup = 1, pause = 3, settle = 1.5 } = {}) {
  let t0 = null;
  let lastT = 0;
  let lastB = 0;
  let avg = null;
  let measured = 0;
  return {
    update(bytes, now) {
      if (t0 === null) {
        t0 = lastT = now;
        lastB = bytes;
        return;
      }
      const dt = now - lastT;
      const db = bytes - lastB;
      if (dt <= 0) return;
      lastT = now;
      lastB = bytes;
      if (now - t0 <= warmup || dt > pause || db < 0) return;
      const inst = db / dt;
      avg = avg === null ? inst : avg + (1 - Math.exp(-dt / tau)) * (inst - avg);
      measured += dt;
    },
    // Bytes per second, smoothed; null while estimating.
    get rate() {
      return measured >= settle ? avg : null;
    },
  };
}

// `secs` as people say a time left: seconds under a minute (by 5 from 15 s), minutes
// and tens of seconds under 10 minutes, minutes under an hour, then hours and minutes
// (by 5).
export function duration(secs) {
  const s = Math.max(1, secs);
  if (s < 15) return `${Math.round(s)} s`;
  if (s < 57.5) return `${Math.round(s / 5) * 5} s`;
  if (s < 595) {
    const r = Math.round(s / 10) * 10;
    const m = Math.floor(r / 60);
    const rest = r % 60;
    return rest ? `${m} min ${rest} s` : `${m} min`;
  }
  if (s < 3570) return `${Math.round(s / 60)} min`;
  const r = Math.round(s / 300) * 5;
  const h = Math.floor(r / 60);
  const m = r % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// The download's progress line: what is down of the whole (the whole file, so a resumed
// download counts what it already had), the speed and the time left. `total` 0: the
// server did not say the size (downloaded and speed only). `t`: i18n.js's t.
export function downloadLine({ done, total, rate }, t) {
  const speed = rate == null ? t("dl.estimating") : t("dl.speed", (rate / 1e6).toFixed(rate < 1e7 ? 1 : 0));
  if (!total) return `${t("dl.got", fmt(done))} · ${speed}`;
  const pct = Math.min(100, Math.floor((done / total) * 100));
  const left = rate ? ` · ${t("dl.left", duration(Math.max(0, total - done) / rate))}` : "";
  return `${t("dl.of", fmt(done), fmt(total), pct)} · ${speed}${left}`;
}

// The picker's estimate of a download of `bytes` at `rate` (bytes per second).
export function estimate(bytes, rate) {
  const mins = bytes / rate / 60;
  if (mins < 1) return "<1 min";
  if (mins < 90) return `~${Math.round(mins)} min`;
  return `~${duration(mins * 60)}`;
}

// The last download's speed (bytes per second) kept in this browser, or null.
export function lastSpeed() {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return v > 0 && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveSpeed(rate) {
  try {
    if (rate > 0) localStorage.setItem(SPEED_KEY, String(Math.round(rate)));
  } catch {}
}
