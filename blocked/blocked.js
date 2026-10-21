// WebWell blocked + mindful-pause pages. Reached by a declarativeNetRequest
// redirect (or by content/shortform.js), so the original address comes from
// the ?u= parameter or, failing that, from the background's per-tab record.
'use strict';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const PAGE = document.body.dataset.page;

const ICONS = {
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9.5 12l2 2 3.5-4"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 9.5v5l4-2.5z"/><path d="M4 4l16 16"/></svg>',
  block: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
  focus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r=".9" fill="currentColor"/></svg>'
};

function host(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}

// Today's landmark, same pick as the new tab.
(function paintBackground() {
  const L = window.WW_LANDMARKS || [];
  if (!L.length) return;
  const d = new Date();
  const idx = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000) % L.length;
  $('bg').style.backgroundColor = L[idx].c || '';
  $('bg').style.backgroundImage = 'url("../newtab/bg/' + L[idx].file + '")';
})();

async function originalUrl() {
  const u = params.get('u');
  if (u && /^https?:/.test(u)) return u;
  try {
    const r = await chrome.runtime.sendMessage({ type: 'ww-blocked-info' });
    return (r && r.url) || '';
  } catch (e) { return ''; }
}

function goBack() {
  if (history.length > 1) history.back();
  else chrome.tabs.getCurrent(t => { if (t) chrome.tabs.update(t.id, { url: 'chrome://newtab/' }); });
}

function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = 'btn ' + cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function countHit(reason) {
  try { chrome.runtime.sendMessage({ type: 'ww-blocked-hit', reason }).catch(() => {}); } catch (e) {}
}

function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/* ---------------- blocked page ---------------- */
async function renderBlocked() {
  const reason = params.get('r') || 'custom';
  const url = await originalUrl();
  const h = host(url);
  const actions = $('actions');
  countHit(reason);

  if (reason === 'adult') {
    $('mark').innerHTML = ICONS.shield;
    $('eyebrow').textContent = 'Adult content filter';
    $('title').textContent = 'This site is blocked';
    $('body').textContent = 'WebWell’s adult content filter is on in this browser. Search engines are also set to SafeSearch.';
    actions.append(button('Go back', 'primary', goBack));
  } else if (reason === 'shorts') {
    $('mark').innerHTML = ICONS.play;
    $('eyebrow').textContent = 'Short-video blocker';
    $('title').textContent = 'Short videos are off';
    $('body').textContent = 'You turned on the short-video blocker' + (h ? ' for ' + h : '') + ', so your attention goes to things you chose.';
    const m = url.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/);
    if (m) {
      actions.append(button('Watch as a regular video', 'primary', () => { location.replace('https://www.youtube.com/watch?v=' + m[1]); }));
      actions.append(button('Go back', 'ghost', goBack));
    } else {
      actions.append(button('Go back', 'primary', goBack));
    }
  } else if (reason === 'focus') {
    $('mark').innerHTML = ICONS.focus;
    $('eyebrow').textContent = 'Focus session';
    $('title').textContent = h ? h + ' can wait' : 'You’re in a focus session';
    const { lockin } = await chrome.storage.local.get('lockin');
    if (lockin && lockin.task) { $('task').innerHTML = 'Working on <b></b>'; $('task').querySelector('b').textContent = lockin.task; $('task').classList.remove('hidden'); }
    const tick = () => {
      const left = lockin ? (lockin.pausedLeft != null ? lockin.pausedLeft : (lockin.endsAt || 0) - Date.now()) : 0;
      $('timer').textContent = mmss(left);
      // Session over: carry on to the site once the background has lifted the block.
      if (left <= 0 && url && !tick.done) { tick.done = true; setTimeout(() => location.replace(url), 1500); }
    };
    if (lockin && lockin.phase === 'focus') { $('timer').classList.remove('hidden'); tick(); setInterval(tick, 500); }
    $('body').textContent = 'Distracting sites are paused until your focus session ends.';
    actions.append(button('Back to work', 'primary', goBack));
  } else {
    $('mark').innerHTML = ICONS.block;
    $('eyebrow').textContent = 'Always blocked';
    $('title').textContent = h ? h + ' is blocked' : 'This site is blocked';
    $('body').textContent = 'It’s on your block list. You can change that in WebWell → Protect.';
    const { protect } = await chrome.storage.local.get('protect');
    if (h && protect && !protect.pinHash) {
      actions.append(button('Unblock ' + h, 'primary', () => unblockHost(h)));
      actions.append(button('Go back', 'ghost', goBack));
    } else {
      actions.append(button('Go back', 'primary', goBack));
    }
    if (url) watchForUnblock(h, url);
  }
}

function listed(list, h) {
  return (list || []).some(d => d && (h === d || h.endsWith('.' + d)));
}

async function unblockHost(h) {
  const { protect } = await chrome.storage.local.get('protect');
  if (!protect) return;
  protect.blocklist = (protect.blocklist || []).filter(d => !(d && (h === d || h.endsWith('.' + d))));
  await chrome.storage.local.set({ protect });
}

// Reloading this page would only reload the block screen, so as soon as the site
// leaves the block list (from here, the popup or the dashboard) open it for real.
function watchForUnblock(h, url) {
  let going = false;
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local' || !changes.protect || going) return;
    const list = (changes.protect.newValue || {}).blocklist || [];
    if (!h || listed(list, h)) return;
    going = true;
    try { await chrome.runtime.sendMessage({ type: 'ww-protect-sync' }); } catch (e) {}
    location.replace(url);
  });
}

/* ---------------- mindful pause ---------------- */
async function renderPause() {
  const url = await originalUrl();
  const h = host(url);
  countHit('pause');
  $('backBtn').addEventListener('click', goBack);
  if (!url) {
    $('title').textContent = 'Take a breath';
    $('goBtn').classList.add('hidden');
    return;
  }
  $('title').textContent = 'Still want to open ' + h + '?';
  const { protect } = await chrome.storage.local.get('protect');
  let left = Math.max(3, Math.min(30, (protect && protect.pauseSecs) || 5));
  const go = $('goBtn');
  const cue = $('breathCue');
  const started = Date.now();
  $('count').textContent = left;
  const t = setInterval(() => {
    left -= 1;
    cue.textContent = Math.floor((Date.now() - started) / 4000) % 2 ? 'Breathe out' : 'Breathe in';
    if (left > 0) { $('count').textContent = left; return; }
    clearInterval(t);
    go.disabled = false;
    go.textContent = 'Continue to ' + h;
  }, 1000);
  go.addEventListener('click', async () => {
    go.disabled = true;
    try { await chrome.runtime.sendMessage({ type: 'ww-pause-continue', url }); } catch (e) {}
    location.replace(url);
  });
}

if (PAGE === 'pause') renderPause(); else renderBlocked();
