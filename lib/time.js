// Shared helpers: domain extraction, formatting, storage keys.
'use strict';

function domainOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch (e) { return null; }
}

function dayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}

function fmtDur(totalSecs) {
  totalSecs = Math.max(0, Math.round(totalSecs));
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

function fmtDurShort(totalSecs) {
  totalSecs = Math.max(0, Math.round(totalSecs));
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
  return m + 'm';
}

function faviconUrl(domain) {
  return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }

// Storage helpers (work in any extension context)
async function storeGet(keys) { return chrome.storage.local.get(keys); }
async function storeSet(obj) { return chrome.storage.local.set(obj); }

async function getDay(key) {
  const r = await storeGet(['days']);
  const days = r.days || {};
  return days[key] || { domains: {}, visits: {}, hourly: {}, total: 0 };
}
async function setDay(key, data) {
  const r = await storeGet(['days']);
  const days = r.days || {};
  days[key] = data;
  // prune to last 120 days
  const keys = Object.keys(days).sort();
  while (keys.length > 120) { delete days[keys.shift()]; }
  await storeSet({ days });
}
async function getSettings() {
  const r = await storeGet(['settings']);
  return Object.assign(
    { idleTimeout: 60, trackingEnabled: true, darkMode: false, dailyGoalMins: 0, forecastNudge: false },
    r.settings || {}
  );
}
async function getCategories() { return (await storeGet(['categories'])).categories || {}; }
async function getLimits() { return (await storeGet(['limits'])).limits || {}; }

if (typeof module !== 'undefined') { module.exports = { domainOf, dayKey, fmtDur, fmtDurShort, faviconUrl, esc, pct }; }
