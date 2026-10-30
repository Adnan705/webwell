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

// ---------------------------------------------------------------------------
// Icons. 100% local: Chrome serves favicons from its own cache through the
// "favicon" permission, so no visited domain ever leaves the browser.
// `px` is the CSS size the icon will be drawn at; we ask Chrome for the matching
// physical size so it is never up-scaled by CSS (that is what made them blurry).
// ---------------------------------------------------------------------------
const ICON_PIN = { 'muse.ai': 'icons/pinned/claude-128.png' };

function faviconUrl(domain, px) {
  let url = null;
  try {
    if (ICON_PIN[domain]) url = chrome.runtime.getURL(ICON_PIN[domain]);
  } catch (e) {}
  if (url) return url;
  const dpr = (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1;
  const size = Math.max(16, Math.min(256, Math.ceil((px || 32) * dpr)));
  return chrome.runtime.getURL('/_favicon/') +
    '?pageUrl=' + encodeURIComponent('https://' + domain + '/') + '&size=' + size;
}

// <img> markup for a site icon (escaped, lazy, async-decoded).
function iconImg(domain, px, cls) {
  return '<img' + (cls ? ' class="' + cls + '"' : '') + ' data-domain="' + esc(domain) + '" src="' +
    esc(faviconUrl(domain, px)) + '" width="' + (px || 32) + '" height="' + (px || 32) +
    '" alt="" loading="lazy" decoding="async">';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// The new tab paints instantly from a small snapshot kept in localStorage
// (synchronous). Any page that changes a field it shows should patch it here.
function wwBootPatch(patch) {
  try {
    const cur = JSON.parse(localStorage.getItem('ww_boot') || '{}') || {};
    localStorage.setItem('ww_boot', JSON.stringify(Object.assign(cur, patch)));
  } catch (e) {}
}

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }

// Storage helpers (work in any extension context)
async function storeGet(keys) { return chrome.storage.local.get(keys); }
async function storeSet(obj) {
  // keep the new tab's instant-paint snapshot in step with profile changes made elsewhere
  if (obj && obj.profile && typeof localStorage !== 'undefined') {
    const p = obj.profile;
    wwBootPatch({ name: p.name || '', theme: p.theme || 'dusk', bgMode: p.bgMode === 'gradient' ? 'gradient' : p.bgMode === 'vector' ? 'vector' : 'photos', bgPick: p.bgPick || null, clock24: !!p.clock24 });
  }
  return chrome.storage.local.set(obj);
}

async function getDay(key) {
  const r = await storeGet(['days']);
  const days = r.days || {};
  return days[key] || { domains: {}, visits: {}, hourly: {}, total: 0 };
}
async function setDay(key, data) {
  const r = await storeGet(['days', 'historyKept']);
  const days = r.days || {};
  const isNewDay = !(key in days);
  days[key] = data;
  // prune to last 120 days (WebWell Plus keeps every day: see wwPruneDays below)
  const keys = Object.keys(days).sort();
  const extra = {};
  if (keys.length > HISTORY_FREE_DAYS) {
    if (await wwPlusKeepsHistory()) {
      if (!r.historyKept) extra.historyKept = true;          // remember Plus held days past 120
    } else if (r.historyKept) {
      wwPruneDays(days, keys, isNewDay);                     // Plus lapsed: shrink gently
    } else {
      while (keys.length > HISTORY_FREE_DAYS) { delete days[keys.shift()]; }   // free: as always
    }
  } else if (r.historyKept) {
    try { await chrome.storage.local.remove('historyKept'); } catch (e) {}   // back to normal
  }
  try { await storeSet(Object.assign({ days }, extra)); }
  catch (e) {
    // Only reachable with a very long Plus history: if the 10 MB storage quota is ever hit,
    // drop the oldest month rather than stop counting today.
    const ks = Object.keys(days).sort();
    if (ks.length <= HISTORY_FREE_DAYS) throw e;
    for (let i = 0; i < 30 && ks.length > HISTORY_FREE_DAYS; i++) delete days[ks.shift()];
    await storeSet({ days });
  }
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

if (typeof module !== 'undefined') { module.exports = { domainOf, dayKey, fmtDur, fmtDurShort, faviconUrl, iconImg, esc, pct }; }

// Alerts are an optional permission: asked for the first time someone turns an alert on.
const NOTIF_PERM = { permissions: ['notifications'] };
async function hasNotifications() { try { return await chrome.permissions.contains(NOTIF_PERM); } catch (e) { return false; } }
// Call straight from a click: Chrome only shows the prompt after a user gesture.
async function ensureNotifications() {
  try { return (await chrome.permissions.contains(NOTIF_PERM)) || (await chrome.permissions.request(NOTIF_PERM)); } catch (e) { return false; }
}

// Screen-time tracking needs to see which site is in the active tab ("tabs") and to catch
// blocked redirects ("webNavigation"). Both are optional: asked in the welcome tour or the first
// time someone turns tracking on. Without them WebWell still works, but cannot count time.
const TRACK_PERM = { permissions: ['tabs', 'webNavigation', 'favicon'] };
async function hasTracking() { try { return await chrome.permissions.contains(TRACK_PERM); } catch (e) { return false; } }
// Call straight from a click: Chrome only shows the prompt after a user gesture.
async function ensureTracking() {
  try { return (await chrome.permissions.contains(TRACK_PERM)) || (await chrome.permissions.request(TRACK_PERM)); } catch (e) { return false; }
}

// ---------------------------------------------------------------------------
// History length. Free WebWell keeps the last 120 days. WebWell Plus ("Unlimited history")
// keeps every day. lib/plus.js is loaded in the service worker, but this file is also used on
// pages without it, so the check is guarded.
// ---------------------------------------------------------------------------
const HISTORY_FREE_DAYS = 120;
async function wwPlusKeepsHistory() {
  try { return typeof plusActive === 'function' && !!(await plusActive()); } catch (e) { return false; }
}
// Why at most two days per new day, instead of cutting straight back to 120:
// if Plus lapses (a dated key runs out, or the key is removed) the person may have years of
// history. Deleting all of it on the very next write would be a nasty surprise and could not be
// undone. So the extra days stay, and only the normal prune runs: it happens when a new day is
// added, and it removes at most two of the oldest days. That still shrinks an oversized history
// back towards 120 over time, gives plenty of room to renew or export first, and never surprise-
// deletes more than a day or two in one go.
// This gentle path only runs when the `historyKept` flag says Plus really did keep days past
// 120. A free user who never had Plus gets exactly the old prune, unchanged.
function wwPruneDays(days, sortedKeys, isNewDay) {
  if (!isNewDay) return 0;
  let removed = 0;
  while (sortedKeys.length > HISTORY_FREE_DAYS && removed < 2) { delete days[sortedKeys.shift()]; removed++; }
  return removed;
}
