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
  return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=128';
}

// Ordered icon sources for a domain, best quality first. Tested 2026-10-18:
// a site's own apple-touch-icon is sharpest when present (x.com 1024px,
// github 120px); favicon.ico can be large too (mail.google.com 256px).
// Google's s2 normalises some subdomains (all Google services -> the "G"),
// so it sits lower. Pair with the capture-phase error listener that walks
// data-si through these on failure (see dashboard.js / newtab.js).
// Verified 2026-10-18 (all 96px, Google's official CDN): icon aggregators
// normalise every *.google.com subdomain to the generic "G", so per-service
// overrides are the only way to get Keep's lightbulb, Drive's triangle, etc.
const GOOGLE_SERVICE_ICONS = {
  'keep.google.com': 'https://www.gstatic.com/images/branding/product/2x/keep_2020q4_48dp.png',
  'mail.google.com': 'https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png',
  'drive.google.com': 'https://www.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png',
  'docs.google.com': 'https://www.gstatic.com/images/branding/product/2x/docs_2020q4_48dp.png',
  'sheets.google.com': 'https://www.gstatic.com/images/branding/product/2x/sheets_2020q4_48dp.png',
  'slides.google.com': 'https://www.gstatic.com/images/branding/product/2x/slides_2020q4_48dp.png',
  'calendar.google.com': 'https://www.gstatic.com/images/branding/product/2x/calendar_2020q4_48dp.png',
  // Aliases: people bookmark gmail.com, but the good icons live under the
  // service subdomains (gmail.com itself publishes no usable icon at all).
  'gmail.com': 'https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png',
  'googlemail.com': 'https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png'
};

// Pinned icons: exact verified-good image URLs that bypass all probing.
// Use when a domain's sources serve (or have cached) a wrong/ugly variant.
// The pin is tried first; the normal chain stays as fallback if it fails.
const ICON_PIN = {
  'muse.ai': 'https://drive.google.com/uc?export=download&id=1IckTGjD_FktPiOWyzl3GxglIDa5T_nM6'
};

function iconSources(domain) {
  const srcs = [];
  if (ICON_PIN[domain]) srcs.push(ICON_PIN[domain]);
  if (GOOGLE_SERVICE_ICONS[domain]) srcs.push(GOOGLE_SERVICE_ICONS[domain]);
  srcs.push(
    'https://' + domain + '/apple-touch-icon.png',
    'https://' + domain + '/favicon.ico',
    'https://unavatar.io/' + domain + '?fallback=false',
    faviconUrl(domain),
    'https://icons.duckduckgo.com/ip3/' + domain + '.ico'
  );
  return srcs;
}

// Best-icon probing. The sequential chain stops at the first source that
// LOADS — even a blurry 32px one. Probing loads every source in parallel and
// keeps the largest image that actually decoded. Winners are cached in
// chrome.storage.local (key `iconProbeCache`) so each domain is probed once.
// Resolves {url, width, index} or null when nothing usable loaded.
const _iconProbeCache = {};
let _iconProbeCacheReady = null;
// Bump when the source list changes: winners picked by an older build's
// source list must not survive (e.g. a cached generic "G" would otherwise
// keep beating a newly-added per-service icon forever).
const ICON_PROBE_CACHE_V = 3;

function _iconProbeCacheLoad() {
  if (!_iconProbeCacheReady) {
    _iconProbeCacheReady = storeGet(['iconProbeCacheV', 'iconProbeCache']).then(r => {
      if (r.iconProbeCacheV === ICON_PROBE_CACHE_V) {
        Object.assign(_iconProbeCache, r.iconProbeCache || {});
      }
    }).catch(() => {});
  }
  return _iconProbeCacheReady;
}

function _iconProbeCacheSave() {
  try { chrome.storage.local.set({ iconProbeCache: _iconProbeCache, iconProbeCacheV: ICON_PROBE_CACHE_V }); } catch (e) {}
}

function evictIconProbe(domain) {
  if (_iconProbeCache[domain]) {
    delete _iconProbeCache[domain];
    _iconProbeCacheSave();
  }
}

function bestIcon(domain) {
  // Pinned domains skip probing entirely: the pin IS the verified answer.
  if (ICON_PIN[domain]) {
    return _iconProbeCacheLoad().then(() => ({ url: ICON_PIN[domain], width: 1e9, index: 0 }));
  }
  return _iconProbeCacheLoad().then(() => {
    const hit = _iconProbeCache[domain];
    if (hit && hit.url) {
      hit.index = iconSources(domain).indexOf(hit.url);
      return hit;
    }
    const sources = iconSources(domain);
    return new Promise(resolve => {
      let best = null, settled = 0, finished = false;
      const timer = setTimeout(() => { if (!finished) { finished = true; resolve(best); } }, 3500);
      const settle = () => {
        if (finished) return;
        if (++settled >= sources.length) {
          finished = true;
          clearTimeout(timer);
          if (best) {
            _iconProbeCache[domain] = best;
            _iconProbeCacheSave();
          }
          resolve(best);
        }
      };
      sources.forEach((src, i) => {
        const im = new Image();
        im.onload = () => {
          const w = im.naturalWidth || 0;
          if (w > 0 && w > (best ? best.width : 0)) best = { url: src, width: w, index: i };
          settle();
        };
        im.onerror = settle;
        im.src = src;
      });
    });
  });
}

// Background upgrade for <img data-domain data-si>: probes for a larger icon
// and swaps it in when the winner beats what's currently displayed. Safe to
// call after any render; each image is upgraded at most once per element.
function upgradeIcon(img) {
  const domain = img && img.dataset && img.dataset.domain;
  if (!domain || img.dataset.upgraded) return;
  img.dataset.upgraded = '1';
  bestIcon(domain).then(win => {
    if (!win || !img.isConnected) return;
    const curW = img.naturalWidth || 0;
    if (win.width > curW && img.getAttribute('src') !== win.url) {
      img.dataset.si = String(win.index);
      img.src = win.url;
    }
  });
}

function upgradeAllIcons(root) {
  (root || document).querySelectorAll('img[data-domain]:not([data-upgraded])').forEach(upgradeIcon);
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

if (typeof module !== 'undefined') { module.exports = { domainOf, dayKey, fmtDur, fmtDurShort, faviconUrl, iconSources, bestIcon, upgradeIcon, upgradeAllIcons, evictIconProbe, esc, pct }; }
