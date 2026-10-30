// WebWell Plus focus extras: block schedules, strict focus, intent check, earn your break, focus presets.
// Pure logic only (no DOM, no chrome.*), so the service worker, every page and the node test
// (tools/test-plus-focus.js) share exactly the same rules. Gating (plusActive) happens where it is used.
//
// Storage keys (chrome.storage.local):
//   plusSchedules:  [{ id, name, days[0..6], start 'HH:MM', end 'HH:MM', useList, sites[], strict, on }]
//   plusPresets:    [{ id, name, mins, sound, block, strict }]     (missing = the three defaults)
//   plusEarn:       { day 'YYYY-MM-DD', mins }                      (banked minutes, today only)
//   plusIntents:    [{ ts, domain, text, allowedMins }]             (last 500)
//   plusFocusPrefs: { intent: true, earnPer: 5, earnCap: 30 }
'use strict';

const PF_DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PF_SOUNDS = ['rain', 'brown', 'waves', 'radio', 'none'];
const PF_SOUND_LABEL = { rain: 'Rain', brown: 'Soft noise', waves: 'Waves', radio: 'Lofi radio', none: 'Silence' };
const STRICT_PHRASE = 'I choose to stop';
const STRICT_MAX_MS = 241 * 60000;    // longest real session (240 min) plus a little slack
const INTENT_MAX = 500;
const PF_PREFS_DEFAULTS = { intent: true, earnPer: 5, earnCap: 30 };
const PRESET_DEFAULTS = [
  { id: 'study', name: 'Study', mins: 50, sound: 'rain', block: true, strict: false },
  { id: 'deep', name: 'Deep work', mins: 90, sound: 'brown', block: true, strict: true },
  { id: 'wind', name: 'Wind down', mins: 20, sound: 'waves', block: false, strict: false }
];
const PRESET_MAX = 8;
const SCHEDULE_MAX = 12;

const _pfInt = (v, lo, hi, dflt) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };
const _pfId = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// Same host rules as Protect when protect.js is loaded; a small copy keeps this file usable on its own.
function _pfHost(input) {
  if (typeof normalizeHost === 'function') return normalizeHost(input);
  let s = String(input || '').trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = 'https://' + s;
  try { const h = new URL(s).hostname.replace(/^www\./, ''); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) ? h : null; } catch (e) { return null; }
}

/* ---------------- time helpers ---------------- */
function pfTimeToMins(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}
function pfMinsToTime(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
// "09:00" -> "9:00 AM" (or "09:00" on a 24-hour locale), for display only.
function pfTimeLabel(t) {
  const m = pfTimeToMins(t);
  if (m == null) return '';
  const d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/* ---------------- block schedules ---------------- */
// Returns { ok, value } with a tidy copy, or { ok: false, error } in plain words.
function scheduleClean(raw) {
  raw = raw || {};
  const name = String(raw.name || '').trim().replace(/\s+/g, ' ').slice(0, 40) || 'Schedule';
  const days = [...new Set((Array.isArray(raw.days) ? raw.days : []).map(Number).filter(d => d >= 0 && d <= 6 && d === Math.floor(d)))].sort();
  const st = pfTimeToMins(raw.start), en = pfTimeToMins(raw.end);
  if (!days.length) return { ok: false, error: 'Pick at least one day.' };
  if (st == null || en == null) return { ok: false, error: 'Set a start and an end time.' };
  if (st === en) return { ok: false, error: 'The start and end time need to be different.' };
  const useList = !!raw.useList;
  const sites = [...new Set((Array.isArray(raw.sites) ? raw.sites : []).map(_pfHost).filter(Boolean))].slice(0, 200);
  if (!useList && !sites.length) return { ok: false, error: 'Add at least one site, or use your focus block list.' };
  return { ok: true, value: {
    id: /^[\w-]{1,32}$/.test(String(raw.id || '')) ? String(raw.id) : _pfId(),
    name, days, start: pfMinsToTime(st), end: pfMinsToTime(en), useList, sites, strict: !!raw.strict, on: raw.on !== false
  } };
}
function schedulesList(raw) {
  return (Array.isArray(raw) ? raw : []).map(scheduleClean).filter(r => r.ok).map(r => r.value).slice(0, SCHEDULE_MAX);
}

// Is the schedule's window open at `date` (local time)? An overnight window such as 22:00-06:00
// belongs to the day it starts on: Friday 22:00-06:00 covers Friday night and early Saturday.
function scheduleActiveAt(s, date) {
  if (!s || s.on === false) return false;
  const st = pfTimeToMins(s.start), en = pfTimeToMins(s.end);
  if (st == null || en == null || st === en) return false;
  const days = new Set(s.days || []);
  const m = date.getHours() * 60 + date.getMinutes();
  const dow = date.getDay();
  if (st < en) return days.has(dow) && m >= st && m < en;
  return (days.has(dow) && m >= st) || (days.has((dow + 6) % 7) && m < en);
}
function activeSchedules(list, date) { return schedulesList(list).filter(s => scheduleActiveAt(s, date)); }

// When does the window that is open right now close? (a Date; null if it is not open)
function scheduleUntil(s, date) {
  if (!scheduleActiveAt(s, date)) return null;
  const st = pfTimeToMins(s.start), en = pfTimeToMins(s.end);
  const m = date.getHours() * 60 + date.getMinutes();
  const end = new Date(date);
  end.setHours(Math.floor(en / 60), en % 60, 0, 0);
  if (st > en && m >= st) end.setDate(end.getDate() + 1);   // started tonight, ends tomorrow morning
  return end;
}

// The next moment any switched-on schedule opens or closes, so one alarm can flip the rules on the
// right minute. Built with setHours on each calendar day, so clock changes (DST) land correctly.
function nextScheduleChange(list, now) {
  const t = now.getTime();
  let best = null;
  for (const s of schedulesList(list)) {
    if (!s.on) continue;
    const st = pfTimeToMins(s.start), en = pfTimeToMins(s.end);
    for (let off = -1; off <= 8; off++) {
      const day = new Date(now); day.setHours(12, 0, 0, 0); day.setDate(day.getDate() + off);
      if (!s.days.includes(day.getDay())) continue;
      const a = new Date(day); a.setHours(Math.floor(st / 60), st % 60, 0, 0);
      const b = new Date(day); if (st > en) b.setDate(b.getDate() + 1); b.setHours(Math.floor(en / 60), en % 60, 0, 0);
      for (const x of [a.getTime(), b.getTime()]) if (x > t && (best == null || x < best)) best = x;
    }
  }
  return best;
}

// The sites a schedule blocks. `focusList` is the user's focus block list (Distracting sites + extras).
function scheduleSites(s, focusList) { return s.useList ? (focusList || []) : (s.sites || []); }

// "Weekdays", "Every day", "Weekends" or "Mon, Wed, Fri".
function scheduleDaysLabel(days) {
  const k = [...(days || [])].sort().join('');
  if (k === '0123456') return 'Every day';
  if (k === '12345') return 'Weekdays';
  if (k === '06') return 'Weekends';
  return [1, 2, 3, 4, 5, 6, 0].filter(d => (days || []).includes(d)).map(d => PF_DAY_SHORT[d]).join(', ');
}

/* ---------------- strict focus ---------------- */
// True only while a strict session is genuinely running. Anything odd (no end time, a time that has
// passed, an impossible end far in the future, a paused clock) counts as not strict, so bad data can
// never lock someone in.
function strictLocked(l, now) {
  if (!l || l.phase !== 'focus' || l.strict !== true) return false;
  if (l.pausedLeft != null) return false;
  const end = l.endsAt;
  if (typeof end !== 'number' || !Number.isFinite(end)) return false;
  const left = end - (now == null ? Date.now() : now);
  return left > 0 && left <= STRICT_MAX_MS;
}
function strictPhraseOk(text) {
  const norm = s => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return norm(text) === norm(STRICT_PHRASE);
}

/* ---------------- intent check ---------------- */
function intentClean(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  return t.length >= 3 ? t : null;
}
function intentAdd(list, entry) {
  const out = (Array.isArray(list) ? list : []).concat(entry);
  return out.length > INTENT_MAX ? out.slice(out.length - INTENT_MAX) : out;
}

/* ---------------- earn your break ---------------- */
function focusPrefs(raw) {
  raw = raw || {};
  return {
    intent: raw.intent !== false,
    earnPer: _pfInt(raw.earnPer, 1, 60, PF_PREFS_DEFAULTS.earnPer),
    earnCap: _pfInt(raw.earnCap, 0, 240, PF_PREFS_DEFAULTS.earnCap)
  };
}
// Minutes banked today. A bank from an earlier day is worth nothing: breaks are earned fresh each day.
function earnBank(raw, today) { return raw && raw.day === today ? Math.max(0, raw.mins | 0) : 0; }
// A finished session of `focusMins` earns 1 minute per `earnPer`, never past the daily cap.
function earnCredit(raw, today, focusMins, prefs) {
  const p = focusPrefs(prefs);
  const have = earnBank(raw, today);
  const gained = Math.max(0, Math.min(Math.floor(Math.max(0, focusMins) / p.earnPer), p.earnCap - have));
  return { bank: { day: today, mins: have + gained }, gained };
}
function earnSpend(raw, today, want) {
  const have = earnBank(raw, today);
  const used = Math.max(0, Math.min(have, want == null ? have : want | 0));
  return { bank: { day: today, mins: have - used }, used };
}

/* ---------------- focus presets ---------------- */
function presetClean(raw) {
  raw = raw || {};
  const name = String(raw.name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  if (!name) return { ok: false, error: 'Give the preset a name.' };
  const mins = parseInt(raw.mins, 10);
  if (!(mins >= 5 && mins <= 240)) return { ok: false, error: 'Pick a length from 5 to 240 minutes.' };
  return { ok: true, value: {
    id: /^[\w-]{1,32}$/.test(String(raw.id || '')) ? String(raw.id) : _pfId(),
    name, mins, sound: PF_SOUNDS.includes(raw.sound) ? raw.sound : 'none',
    block: raw.block !== false || !!raw.strict,          // strict keeps sites blocked, so it implies blocking
    strict: !!raw.strict
  } };
}
function presetsList(raw) {
  if (!Array.isArray(raw)) return PRESET_DEFAULTS.map(p => Object.assign({}, p));
  return raw.map(presetClean).filter(r => r.ok).map(r => r.value).slice(0, PRESET_MAX);
}
function presetSummary(p) {
  return p.mins + ' min · ' + (PF_SOUND_LABEL[p.sound] || 'Silence') + (p.strict ? ' · strict' : p.block ? ' · blocking' : '');
}

if (typeof module !== 'undefined') {
  module.exports = { PF_DAY_SHORT, PF_SOUNDS, STRICT_PHRASE, PRESET_DEFAULTS, INTENT_MAX, pfTimeToMins, pfMinsToTime,
    scheduleClean, schedulesList, scheduleActiveAt, activeSchedules, scheduleUntil, nextScheduleChange, scheduleSites,
    scheduleDaysLabel, strictLocked, strictPhraseOk, intentClean, intentAdd, focusPrefs, earnBank, earnCredit, earnSpend,
    presetClean, presetsList, presetSummary };
}
