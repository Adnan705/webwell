// WebWell Plus: the optional paid extras. Free WebWell keeps working exactly as before.
//
// How unlocking works (no server, nothing is sent anywhere): a Plus key is a small signed
// code. It is checked here against the public key below, so only keys signed with the
// private key kept by the maker (tools/plus-keygen.mjs) are accepted. A key can also carry
// an end date and a label such as "family".
//
// Used by: the service worker (importScripts), popup, dashboard and new tab.
//   await plusActive()            -> true when a valid key is saved
//   await plusInfo()              -> { active, payload }  (payload: { id, plan, name, exp })
//   await plusActivate(key)       -> { ok: true } | { ok: false, error }
//   await plusRemove()
//   plusLockHtml('schedules')     -> upsell card for a locked feature
//   plusOpenUpgrade()             -> opens the Plus page
'use strict';

const PLUS_PUBLIC_JWK = { kty: 'EC', crv: 'P-256', x: 'K4Dev4FMbpRTCJ2wxVU3qNfrs3CxD0e9SdvER3ci05c', y: '1BgzrFfrJ6Sk47yemLdh_OImwQ8i4tNKQFu6Ho-BjaQ' };
const PLUS_PAGE_URL = 'https://webwell.app/plus';
const PLUS_PRICE_TEXT = '$10 lifetime';          // shown in the extension; change here and on the website together
const PLUS_KEY_PREFIX = 'WWP1.';

// One list for every Plus feature: used for the locked cards, the Plus page and the website.
const PLUS_FEATURES = [
  { id: 'schedules',  name: 'Block schedules',            blurb: 'Block distracting sites on a timetable, such as weekdays 9 to 5, or wind down after 10 pm. Set it once.' },
  { id: 'strict',     name: 'Strict focus mode',          blurb: 'Once a focus session starts it cannot be ended early, and blocked sites stay blocked until the timer ends.' },
  { id: 'intent',     name: 'Intent check',               blurb: 'Before a paused site opens, or you spend earned minutes, say why you are going there. Your answers appear in your weekly report.' },
  { id: 'earn',       name: 'Earn your break',            blurb: 'Win minutes on a blocked site for each focus session you finish.' },
  { id: 'reports',    name: 'Weekly and monthly reports', blurb: 'Trends, best and worst days, what your time really adds up to, and a comparison with the period before.' },
  { id: 'history',    name: 'Unlimited history',          blurb: 'Keep every day, not just the last 120, and export your reports as CSV or print them as PDF.' },
  { id: 'presets',    name: 'Focus presets',              blurb: 'One tap for Study, Deep work or Wind down, each with its own timer, sound and blocked sites.' },
  { id: 'mixer',      name: 'Sound mixer',                blurb: 'Layer rain, cafe, fire, waves and more with your own volumes, and save mixes.' },
  { id: 'themes',     name: 'Extra themes and backgrounds', blurb: 'More backgrounds, accent colours and clock styles for your new tab.' },
  { id: 'garden',     name: 'Focus garden and streaks',   blurb: 'Every finished focus session grows your garden. Keep your streak going.' },
  { id: 'coach',      name: 'AI weekly coach',            blurb: 'A short weekly plan built from your own numbers, using your own Google AI key.' }
];

const _b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
let _plusCache = null;   // { key, info } so the check runs once per key per page

// Returns the key's payload when the signature is genuine and the key has not run out, else null.
async function plusVerify(key) {
  try {
    key = String(key || '').trim();
    if (key.indexOf(PLUS_KEY_PREFIX) !== 0) return null;
    const parts = key.slice(PLUS_KEY_PREFIX.length).split('.');
    if (parts.length !== 2) return null;
    const data = _b64u(parts[0]), sig = _b64u(parts[1]);
    const pub = await crypto.subtle.importKey('jwk', PLUS_PUBLIC_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, data))) return null;
    const payload = JSON.parse(new TextDecoder().decode(data));
    if (!payload || payload.v !== 1) return null;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch (e) { return null; }
}

async function plusInfo() {
  let key = '';
  try { key = ((await chrome.storage.local.get(['plusKey'])).plusKey) || ''; } catch (e) {}
  if (_plusCache && _plusCache.key === key) return _plusCache.info;
  const payload = key ? await plusVerify(key) : null;
  const info = { active: !!payload, payload: payload || null };
  _plusCache = { key, info };
  return info;
}
async function plusActive() { return (await plusInfo()).active; }

async function plusActivate(key) {
  key = String(key || '').replace(/\s+/g, '');
  if (!key) return { ok: false, error: 'Paste your Plus key first.' };
  const payload = await plusVerify(key);
  if (!payload) return { ok: false, error: 'That key is not valid, or it has expired. Check that you copied all of it.' };
  try { await chrome.storage.local.set({ plusKey: key }); } catch (e) { return { ok: false, error: 'Could not save the key.' }; }
  _plusCache = null;
  return { ok: true, payload };
}
async function plusRemove() {
  try { await chrome.storage.local.remove('plusKey'); } catch (e) {}
  _plusCache = null;
}

function plusOpenUpgrade() {
  try { chrome.tabs.create({ url: PLUS_PAGE_URL }); } catch (e) { window.open(PLUS_PAGE_URL, '_blank', 'noopener'); }
}

const _plusEsc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// A small, calm card for a locked feature. Pages wire the buttons with plusWireLocks(root).
function plusLockHtml(featureId) {
  const f = PLUS_FEATURES.find(x => x.id === featureId) || { name: 'WebWell Plus', blurb: 'An optional extra for WebWell.' };
  return '<div class="plus-lock" data-plus-lock="' + _plusEsc(f.id || '') + '">' +
    '<span class="plus-badge">Plus</span>' +
    '<strong class="plus-lock-t">' + _plusEsc(f.name) + '</strong>' +
    '<p class="plus-lock-d">' + _plusEsc(f.blurb) + '</p>' +
    '<div class="plus-lock-b"><button type="button" class="plus-btn" data-plus-act="upgrade">See WebWell Plus</button>' +
    '<button type="button" class="plus-link" data-plus-act="key">I have a key</button></div></div>';
}
function plusWireLocks(root) {
  (root || document).querySelectorAll('[data-plus-act]').forEach(b => {
    if (b._plusWired) return; b._plusWired = true;
    b.addEventListener('click', () => {
      if (b.dataset.plusAct === 'upgrade') plusOpenUpgrade();
      else { try { chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#plus') }); } catch (e) { location.href = '../dashboard/dashboard.html#plus'; } }
    });
  });
}

if (typeof module !== 'undefined') { module.exports = { plusVerify, PLUS_FEATURES }; }
