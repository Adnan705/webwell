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
  focus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r=".9" fill="currentColor"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12 13.2v2.6l1.8 1.1"/></svg>'
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

/* ---------------- WebWell Plus: intent check + earn your break ---------------- */
// The background answers for Plus (it owns the rules): { plus, intent, bank, strict, strictFocus, schedule }.
async function plusBlockedInfo(url) {
  try { return (await chrome.runtime.sendMessage({ type: 'ww-plus-blocked-info', url })) || { plus: false }; } catch (e) { return { plus: false }; }
}
function clockLabel(ts) { return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

// "Why are you going there?" One line, at least 3 characters. Built into `slot`.
// With `goLabel` the form has its own go button; without it (the pause page) the page's own
// Continue button is used and `onChange` tells it when the answer is long enough.
function intentForm(slot, goLabel, onGo, onChange) {
  slot.innerHTML =
    '<form class="intent" id="intentForm" novalidate>' +
      '<label class="intent-l" for="intentIn">Why are you going there?</label>' +
      '<input class="intent-in" id="intentIn" type="text" maxlength="140" autocomplete="off" required minlength="3" placeholder="e.g. Reply to Sam about Friday">' +
      '<p class="intent-h">Just for you. It stays on this device.</p>' +
      (goLabel ? '<button class="btn primary" id="intentGo" type="submit" disabled></button>' : '') +
    '</form>';
  slot.classList.remove('hidden');
  const input = $('intentIn'), go = goLabel ? $('intentGo') : null;
  if (go) go.textContent = goLabel;
  const valid = () => input.value.replace(/\s+/g, ' ').trim().length >= 3;
  input.addEventListener('input', () => { if (go) go.disabled = !valid(); if (onChange) onChange(valid()); });
  $('intentForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!valid() || (go && go.disabled)) { input.focus(); return; }
    if (go) go.disabled = true;
    onGo(input.value.trim());
  });
  setTimeout(() => input.focus(), 30);
  return { valid, text: () => input.value.trim() };
}

// "Use N minutes": spends today's banked break on this site (Plus). Asks the intent question first when it is on.
function addEarnButton(actions, px, url, h) {
  const n = px.bank;
  const label = 'Use ' + n + ' minute' + (n === 1 ? '' : 's');
  const use = async text => {
    let r = null;
    try { r = await chrome.runtime.sendMessage({ type: 'ww-earn-use', url, intent: text || '' }); } catch (e) {}
    if (r && r.ok) { location.replace(url); return; }
    $('body').textContent = 'That did not work. Your minutes are still saved.';
  };
  const b = button(label, 'ghost', () => {
    if (!px.intent) { b.disabled = true; use(''); return; }
    b.remove();
    intentForm($('plusSlot'), 'Open ' + h + ' for ' + n + ' min', use);
  });
  b.title = 'You earned these minutes by finishing focus sessions';
  actions.append(b);
  const note = document.createElement('p');
  note.className = 'earn-note';
  note.textContent = 'You have ' + n + ' break minute' + (n === 1 ? '' : 's') + ' banked from today’s focus sessions.';
  $('plusSlot').before(note);
}

/* ---------------- blocked page ---------------- */
async function renderBlocked() {
  const reason = params.get('r') || 'custom';
  const url = await originalUrl();
  const h = host(url);
  const actions = $('actions');
  countHit(reason);
  const px = await plusBlockedInfo(url);

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
    if (px.plus && px.strictFocus) {
      $('eyebrow').textContent = 'Strict focus session';
      $('body').textContent = 'You chose strict mode, so blocked sites stay blocked until the timer ends. You’ve got this.';
    } else {
      $('body').textContent = 'Distracting sites are paused until your focus session ends.';
    }
    actions.append(button('Back to work', 'primary', goBack));
  } else if (reason === 'schedule') {
    // Plus block schedule. Only Plus makes these rules, so px.schedule is normally there.
    $('mark').innerHTML = ICONS.clock;
    const s = px.schedule;
    $('eyebrow').textContent = s && s.strict ? 'Strict block schedule' : 'Block schedule';
    $('title').textContent = h ? h + ' is blocked right now' : 'This site is blocked right now';
    $('body').textContent = s
      ? 'Your “' + s.name + '” schedule blocks it until ' + clockLabel(s.until) + '.' + (s.strict ? ' This one has no early unlocks.' : '')
      : 'One of your block schedules covers this site right now.';
    actions.append(button('Go back', 'primary', goBack));
    if (px.plus && px.bank > 0 && !px.strict && url) addEarnButton(actions, px, url, h);
    // Open the site by itself once the window closes and the background has lifted the rule.
    if (s && url && s.until - Date.now() < 86400000) setTimeout(() => location.replace(url), Math.max(1000, s.until - Date.now() + 2500));
  } else {
    $('mark').innerHTML = ICONS.block;
    $('eyebrow').textContent = 'Always blocked';
    $('title').textContent = h ? h + ' is blocked' : 'This site is blocked';
    $('body').textContent = 'It’s on your block list. You can change that in WebWell → Protect.';
    const { protect } = await chrome.storage.local.get('protect');
    // Strict focus (Plus) locks the block list until the timer ends.
    if (px.plus && px.strictFocus) {
      $('body').textContent = 'It’s on your block list, and your strict focus session keeps the list locked until the timer ends.';
      actions.append(button('Go back', 'primary', goBack));
    } else if (h && protect && !protect.pinHash) {
      actions.append(button('Unblock ' + h, 'primary', () => unblockHost(h)));
      actions.append(button('Go back', 'ghost', goBack));
    } else {
      actions.append(button('Go back', 'primary', goBack));
    }
    if (px.plus && px.bank > 0 && !px.strict && url) addEarnButton(actions, px, url, h);
    if (!px.plus && typeof plusLockHtml === 'function') {
      // Free: show, quietly, that earned breaks exist.
      const slot = $('plusSlot');
      slot.innerHTML = plusLockHtml('earn');
      slot.classList.add('lock-slot');
      slot.classList.remove('hidden');
      actions.after(slot);   // below the buttons: the way out comes first
      plusWireLocks(slot);
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
  // Plus intent check: Continue also waits for a one-line answer.
  const px = await plusBlockedInfo(url);
  let counted = false, answered = true, why = null;
  const cont = async () => {
    if (!(counted && answered)) return;
    go.disabled = true;
    try { await chrome.runtime.sendMessage({ type: 'ww-pause-continue', url, intent: why ? why.text() : undefined }); } catch (e) {}
    location.replace(url);
  };
  if (px.plus && px.intent && $('plusSlot')) {
    answered = false;
    why = intentForm($('plusSlot'), null, cont, ok => { answered = ok; if (counted) go.disabled = !ok; });
  }
  $('count').textContent = left;
  const t = setInterval(() => {
    left -= 1;
    cue.textContent = Math.floor((Date.now() - started) / 4000) % 2 ? 'Breathe out' : 'Breathe in';
    if (left > 0) { $('count').textContent = left; return; }
    clearInterval(t);
    counted = true;
    go.disabled = !answered;
    go.textContent = 'Continue to ' + h;
  }, 1000);
  go.addEventListener('click', cont);
}

if (PAGE === 'pause') renderPause(); else renderBlocked();
