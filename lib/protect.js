// WebWell Protect: site blocking built on Chrome's declarativeNetRequest.
// No DOM here — loaded by the service worker (importScripts) and the dashboard.
//
// Everything is driven by two storage keys:
//   protect: { adult, shortsOn, shorts{...}, pause, pauseSecs, blocklist[], focusExtra[], pinHash, pinSalt }
//   lockin:  { phase: 'focus'|'break', task, mins, breakMins, startedAt, endsAt, pausedLeft, sound, block }
// syncProtectRules() (background.js) turns that state into rules; pages never touch rules directly.
'use strict';

const PROTECT_DEFAULTS = {
  adult: false,
  shortsOn: false,
  shorts: { youtube: true, instagram: true, tiktok: true, facebook: true, snapchat: true },
  pause: false,
  pauseSecs: 5,
  blocklist: [],
  focusExtra: [],
  pinHash: '',
  pinSalt: ''
};

const LOCKIN_DEFAULTS = { mins: 25, breakMins: 5, sound: 'rain', block: true };

const SHORTS_PLATFORMS = [
  { key: 'youtube',   label: 'YouTube Shorts' },
  { key: 'instagram', label: 'Instagram Reels' },
  { key: 'tiktok',    label: 'TikTok' },
  { key: 'facebook',  label: 'Facebook Reels' },
  { key: 'snapchat',  label: 'Snapchat Spotlight' }
];

// Rule id ranges (dynamic rules). The adult list is a separate static ruleset.
const RULE_IDS = {
  safeSearch: 1001,   // 1001..1020
  shorts: 1101,       // 1101..1120
  custom: 2001,
  lockin: 3001,
  pause: 4001,
  pauseAllow: 5001    // session rules, 5001..
};
const RULE_PRIORITY = { safeAllow: 95, safe: 90, block: 80, pauseAllow: 50, pause: 10 };

const GOOGLE_DOMAINS = [
  'google.com', 'google.co.uk', 'google.ca', 'google.com.au', 'google.co.in', 'google.com.pk', 'google.de',
  'google.fr', 'google.es', 'google.it', 'google.nl', 'google.pl', 'google.com.br', 'google.com.mx',
  'google.co.jp', 'google.co.kr', 'google.com.tr', 'google.ru', 'google.co.id', 'google.com.sa',
  'google.ae', 'google.com.eg', 'google.co.za', 'google.com.ng', 'google.com.bd', 'google.com.ph',
  'google.com.vn', 'google.co.th', 'google.com.my', 'google.com.sg', 'google.ie', 'google.be', 'google.ch',
  'google.at', 'google.se', 'google.no', 'google.dk', 'google.fi', 'google.pt', 'google.gr', 'google.co.nz',
  'google.com.ar', 'google.cl', 'google.com.co', 'google.com.pe'
];

const ALL_URLS = { origins: ['<all_urls>'] };

function protectState(raw) {
  const p = Object.assign({}, PROTECT_DEFAULTS, raw || {});
  p.shorts = Object.assign({}, PROTECT_DEFAULTS.shorts, (raw && raw.shorts) || {});
  p.blocklist = Array.isArray(p.blocklist) ? p.blocklist : [];
  p.focusExtra = Array.isArray(p.focusExtra) ? p.focusExtra : [];
  return p;
}

// "https://www.X.com/path" / "x.com" / " X.COM " -> "x.com" (null if it isn't a host name)
function normalizeHost(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = 'https://' + s;
  try {
    const h = new URL(s).hostname.replace(/^www\./, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) ? h : null;
  } catch (e) { return null; }
}

// Sites the user treats as distracting: built-in defaults plus their own
// reclassifications. Used by Locked In blocking and the mindful pause.
function distractingDomains(overrides) {
  const out = new Set();
  for (const d of Object.keys(DEFAULT_CATEGORIES)) {
    if (categoryOf(d, overrides) === 'distracting') out.add(d);
  }
  for (const d of Object.keys(overrides || {})) {
    if (overrides[d] === 'distracting') out.add(d);
  }
  return [...out].filter(d => normalizeHost(d) === d).sort();
}

function lockinActive(lockin) {
  return !!(lockin && lockin.phase === 'focus');
}

function blockedPage(reason) {
  return { type: 'redirect', redirect: { extensionPath: '/blocked/blocked.html?r=' + reason } };
}

// SafeSearch on Google/Bing/DuckDuckGo + YouTube Restricted Mode.
// Each redirect has a higher-priority allow for URLs that already carry the
// safe parameter, so a redirect can never loop.
function safeSearchRules() {
  let id = RULE_IDS.safeSearch;
  const rules = [];
  const engine = (domains, path, key, value) => {
    rules.push({
      id: id++, priority: RULE_PRIORITY.safeAllow, action: { type: 'allow' },
      condition: { requestDomains: domains, urlFilter: key + '=' + value, resourceTypes: ['main_frame'] }
    });
    rules.push({
      id: id++, priority: RULE_PRIORITY.safe,
      action: { type: 'redirect', redirect: { transform: { queryTransform: { addOrReplaceParams: [{ key, value }] } } } },
      condition: { requestDomains: domains, urlFilter: path, resourceTypes: ['main_frame'] }
    });
  };
  engine(GOOGLE_DOMAINS, '/search?', 'safe', 'active');
  engine(['bing.com'], '/search?', 'adlt', 'strict');
  engine(['duckduckgo.com'], '/?', 'kp', '1');
  rules.push({
    id: id++, priority: RULE_PRIORITY.safe,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'YouTube-Restrict', operation: 'set', value: 'Strict' }] },
    condition: { requestDomains: ['youtube.com', 'youtube-nocookie.com', 'youtubei.googleapis.com'],
      resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest'] }
  });
  return rules;
}

// Full page loads of short-video pages. In-app navigation (YouTube and
// Instagram are single-page apps) is caught by content/shortform.js.
function shortsRules(p) {
  let id = RULE_IDS.shorts;
  const rules = [];
  const page = (condition) => rules.push({
    id: id++, priority: RULE_PRIORITY.block, action: blockedPage('shorts'),
    condition: Object.assign({ resourceTypes: ['main_frame'] }, condition)
  });
  if (p.shorts.youtube) page({ regexFilter: '^https?://(www\\.|m\\.)?youtube\\.com/shorts(/|$)' });
  if (p.shorts.instagram) page({ regexFilter: '^https?://(www\\.)?instagram\\.com/(reels?|[^/]+/reels?)(/|$)' });
  if (p.shorts.tiktok) page({ requestDomains: ['tiktok.com'] });
  if (p.shorts.facebook) page({ regexFilter: '^https?://(www\\.|m\\.|web\\.)?facebook\\.com/(reels?|watch/reels?)(/|$)' });
  if (p.shorts.snapchat) page({ regexFilter: '^https?://(www\\.)?snapchat\\.com/spotlight(/|$)' });
  return rules;
}

// Every dynamic rule WebWell should have right now.
function buildDynamicRules(p, lockin, overrides) {
  const rules = [];
  if (p.adult) rules.push(...safeSearchRules());
  if (p.shortsOn) rules.push(...shortsRules(p));
  const custom = p.blocklist.map(normalizeHost).filter(Boolean);
  if (custom.length) {
    rules.push({ id: RULE_IDS.custom, priority: RULE_PRIORITY.block, action: blockedPage('custom'),
      condition: { requestDomains: custom, resourceTypes: ['main_frame'] } });
  }
  const distracting = distractingDomains(overrides);
  if (lockinActive(lockin) && lockin.block !== false) {
    const list = [...new Set(distracting.concat(p.focusExtra.map(normalizeHost).filter(Boolean)))];
    if (list.length) {
      rules.push({ id: RULE_IDS.lockin, priority: RULE_PRIORITY.block, action: blockedPage('focus'),
        condition: { requestDomains: list, resourceTypes: ['main_frame'] } });
    }
  }
  if (p.pause && distracting.length) {
    rules.push({ id: RULE_IDS.pause, priority: RULE_PRIORITY.pause,
      action: { type: 'redirect', redirect: { extensionPath: '/blocked/pause.html' } },
      condition: { requestDomains: distracting, resourceTypes: ['main_frame'] } });
  }
  return rules;
}

function shortsScriptNeeded(p) {
  return !!(p.shortsOn && (p.shorts.youtube || p.shorts.instagram || p.shorts.facebook || p.shorts.snapchat));
}

// Any feature that needs the optional "all sites" permission?
function protectNeedsHostAccess(p, lockin) {
  return !!(p.adult || p.shortsOn || p.pause || p.blocklist.length || (lockinActive(lockin) && lockin.block !== false));
}

// PIN: salted SHA-256, stored locally. Keeps kids (or a weak moment) from
// switching protection off; it cannot stop someone removing the extension.
async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function newSalt() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
}

if (typeof module !== 'undefined') {
  module.exports = { PROTECT_DEFAULTS, LOCKIN_DEFAULTS, SHORTS_PLATFORMS, RULE_IDS, protectState, normalizeHost,
    distractingDomains, buildDynamicRules, safeSearchRules, shortsRules, lockinActive, protectNeedsHostAccess,
    shortsScriptNeeded, hashPin, newSalt };
}
