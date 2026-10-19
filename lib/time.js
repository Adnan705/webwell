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
    wwBootPatch({ name: p.name || '', theme: p.theme || 'dusk', bgMode: p.bgMode === 'gradient' ? 'gradient' : 'photos', bgPick: p.bgPick || null });
  }
  return chrome.storage.local.set(obj);
}

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

if (typeof module !== 'undefined') { module.exports = { domainOf, dayKey, fmtDur, fmtDurShort, faviconUrl, iconImg, esc, pct }; }
