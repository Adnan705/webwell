// WebWell popup: Today · Focus · Protect · Settings.
// Reads straight from chrome.storage; every control writes the same keys the
// dashboard and new tab use, and the background worker reacts to them.
'use strict';

const $ = id => document.getElementById(id);
const view = $('view');

/* ---------------- icons ---------------- */
const ic = (p, extra) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + p + '</svg>';
const ICON = {
  ext: ic('<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>'),
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5.5h2v13H6zM19 6.2v11.6a.8.8 0 0 1-1.25.66L9.6 12.66a.8.8 0 0 1 0-1.32l8.15-5.8A.8.8 0 0 1 19 6.2z"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 5.5h2v13h-2zM5 6.2v11.6a.8.8 0 0 0 1.25.66l8.15-5.8a.8.8 0 0 0 0-1.32L6.25 5.54A.8.8 0 0 0 5 6.2z"/></svg>',
  lock: ic('<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  chev: ic('<path d="M9 6l6 6-6 6"/>')
};
$('openDash').innerHTML = ICON.ext;

/* ---------------- state ---------------- */
const KEYS = ['days', 'categories', 'limits', 'settings', 'profile', 'lockin', 'protect', 'protectStats', 'focusLog', 'ntMusic', 'lockPrefs'];
let S = {};            // storage snapshot
let live = null;       // { domain, elapsed } from the background
let tabDomain = null;  // active tab's site (null for internal pages)
let tab = 'today';
try { tab = localStorage.getItem('ww_pop_tab') || 'today'; } catch (e) {}
let pick = { mins: 25, sound: 'rain', block: true, task: '' };
let ui = { playing: false, tab: 'radio', title: 'Lofi Focus Radio', sub: 'Tap play to start', art: '../newtab/img/lofi-disc.webp' };
let ticker = null;

async function load() {
  S = await storeGet(KEYS);
  S.settings = Object.assign({ idleTimeout: 60, trackingEnabled: true, darkMode: false, forecastNudge: false }, S.settings || {});
  S.protect = protectState(S.protect);
  S.profile = S.profile || {};
  S.days = S.days || {}; S.cats = S.categories || {}; S.limits = S.limits || {};
  const lp = Object.assign({ mins: 25, sound: 'rain', block: true }, S.lockPrefs || {});
  if (!pick.task) { pick.mins = lp.mins; pick.sound = lp.sound; pick.block = lp.block !== false; }
  try { const r = await chrome.runtime.sendMessage({ type: 'webwell-live' }); live = r && r.live; } catch (e) { live = null; }
  try {
    const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabDomain = t ? domainOf(t.url) : null;
    // On WebWell's own block screen, the site that matters is the one that was blocked.
    if (t && !tabDomain && t.url && t.url.indexOf(chrome.runtime.getURL('blocked/')) === 0) {
      let orig = '';
      try { orig = new URL(t.url).searchParams.get('u') || ''; } catch (e) {}
      if (!orig) { const k = 'nav' + t.id; orig = ((await chrome.storage.session.get(k))[k]) || ''; }
      tabDomain = domainOf(orig);
    }
  } catch (e) { tabDomain = null; }
  document.body.classList.toggle('dark', !!S.settings.darkMode);
}

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- header ---------------- */
function renderHeader() {
  $('dateLine').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const on = S.settings.trackingEnabled;
  const p = $('trackPill');
  p.className = 'pill' + (on ? '' : ' off');
  p.innerHTML = '<i></i>' + (on ? 'Tracking' : 'Paused');
}

/* ---------------- Today ---------------- */
function todayModel() {
  const key = dayKey(Date.now());
  const d = S.days[key] || { domains: {}, visits: {}, total: 0 };
  const domains = Object.assign({}, d.domains);
  let total = d.total || 0;
  if (live && live.domain) { domains[live.domain] = (domains[live.domain] || 0) + live.elapsed; total += live.elapsed; }
  const entries = Object.keys(domains).map(dom => ({ domain: dom, secs: domains[dom], cat: categoryOf(dom, S.cats) })).sort((a, b) => b.secs - a.secs);
  const split = { productive: 0, neutral: 0, distracting: 0 };
  let w = 0;
  entries.forEach(e => { split[e.cat] += e.secs; w += CATEGORY_META[e.cat].score * e.secs; });
  const sum = split.productive + split.neutral + split.distracting;
  const yk = dayKey(Date.now() - 86400000);
  return { total, entries, split, sum, score: sum ? Math.round(w / sum) : 0, yesterday: (S.days[yk] || {}).total || 0, domains };
}
function verdict(s) {
  return s >= 75 ? 'Excellent focus' : s >= 55 ? 'Solid day' : s >= 35 ? 'Distractions are winning' : 'Rough day';
}

function renderToday() {
  const m = todayModel();
  const delta = m.total - m.yesterday;
  let html = '<section class="card"><div class="sum-row"><div><div class="sub">Screen time today</div><div class="big">' +
    (m.total ? fmtDur(m.total) : '0m') + '</div></div><div class="score-box"><div class="sub">Productivity</div><div class="big">' +
    (m.sum ? m.score : '–') + '<span class="of">/100</span></div></div></div>';
  if (m.sum) {
    html += '<div class="split">' + ['productive', 'neutral', 'distracting'].map(c =>
      '<i style="width:' + (m.split[c] / m.sum * 100).toFixed(1) + '%;background:' + CATEGORY_META[c].color + '"></i>').join('') + '</div>' +
      '<div class="leg">' + ['productive', 'neutral', 'distracting'].map(c =>
      '<span><b style="background:' + CATEGORY_META[c].color + '"></b>' + CATEGORY_META[c].label + ' ' + Math.round(m.split[c] / m.sum * 100) + '%</span>').join('') + '</div>';
    html += '<div class="sub" style="margin-top:10px">' + verdict(m.score) + (m.yesterday && m.total > 60
      ? ' · <span class="' + (delta > 0 ? 'up' : 'down') + '">' + (delta > 0 ? '▲ ' : '▼ ') + fmtDur(Math.abs(delta)) + '</span> vs yesterday' : '') + '</div>';
  } else {
    html += '<div class="empty">Nothing tracked yet. It starts as you browse.</div>';
  }
  if (live && live.domain && S.settings.trackingEnabled) {
    html += '<div class="live"><span class="dot"></span>Now on <b>' + esc(live.domain) + '</b><span class="t">' + fmtDur(live.elapsed) + '</span></div>';
  }
  html += '</section>';

  if (tabDomain) {
    const cat = categoryOf(tabDomain, S.cats), lim = S.limits[tabDomain] || '';
    html += '<section class="card"><div class="h"><b>This site</b><small>' + fmtDur(m.domains[tabDomain] || 0) + ' today</small></div>' +
      '<div class="site-top">' + iconImg(tabDomain, 26) + '<span class="nm">' + esc(tabDomain) + '</span></div>' +
      '<div class="chips" id="catChips">' + ['productive', 'neutral', 'distracting'].map(c =>
        '<button class="chip ' + c + (cat === c ? ' on' : '') + '" data-c="' + c + '">' + CATEGORY_META[c].label + '</button>').join('') + '</div>' +
      '<div class="row"><span class="grow">Daily limit (minutes)</span><input class="num-in" id="limIn" type="number" min="0" max="1440" placeholder="none" value="' + lim + '">' +
      '<button class="btn" id="limSave">Save</button></div></section>';
  }

  html += '<section class="card"><div class="h"><b>Top sites</b><button class="link" id="seeAll">See all</button></div>';
  if (!m.entries.length) html += '<div class="empty">No sites yet today.</div>';
  else {
    const max = m.entries[0].secs || 1;
    html += m.entries.slice(0, 5).map(e => '<div class="top-site">' + iconImg(e.domain, 20) + '<span class="nm">' + esc(e.domain) +
      '</span><span class="bar"><i style="width:' + Math.max(4, Math.round(e.secs / max * 100)) + '%;background:' + CATEGORY_META[e.cat].color + '"></i></span><span class="tm">' + fmtDurShort(e.secs) + '</span></div>').join('');
  }
  html += '</section>';
  if (view.dataset.sig === html) return;   // nothing changed: leave the page alone
  view.dataset.sig = html;
  view.innerHTML = html;

  $('seeAll').addEventListener('click', () => openDash(''));
  const chips = $('catChips');
  if (chips) chips.querySelectorAll('.chip').forEach(b => b.addEventListener('click', async () => {
    const c = Object.assign({}, S.cats); c[tabDomain] = b.dataset.c;
    await storeSet({ categories: c }); S.cats = c; renderToday(); toast(tabDomain + ' is now ' + CATEGORY_META[b.dataset.c].label.toLowerCase());
  }));
  if ($('limSave')) $('limSave').addEventListener('click', async () => {
    const v = parseInt($('limIn').value, 10), lim = Object.assign({}, S.limits);
    if (v > 0 && v <= 1440) lim[tabDomain] = v; else delete lim[tabDomain];
    await storeSet({ limits: lim }); S.limits = lim;
    toast(v > 0 ? 'Limit set: ' + v + ' min a day' : 'Limit removed');
  });
}

/* ---------------- sound (talks to the offscreen player) ---------------- */
async function popSend(msg) {
  try { await chrome.runtime.sendMessage({ type: 'ww-ensure-player' }); } catch (e) {}
  let last;
  for (let i = 0; i < 5; i++) {
    try { return await chrome.runtime.sendMessage(Object.assign({ target: 'ww-player' }, msg)); }
    catch (e) { last = e; await new Promise(r => setTimeout(r, 120 * (i + 1))); }
  }
  throw last;
}
async function playerExists() { try { return !!(chrome.offscreen && await chrome.offscreen.hasDocument()); } catch (e) { return false; } }
const CMDS = {
  spotify: { toggle: 'sp-toggle', next: 'sp-next', prev: 'sp-prev' },
  soundcloud: { toggle: 'sc-toggle', next: 'sc-next', prev: 'sc-prev' },
  ambient: { toggle: 'ambient-toggle', next: 'ambient-next', prev: 'ambient-prev' },
  radio: { toggle: 'radio-toggle', next: 'station-next', prev: 'station-prev' }
};
function playSound(s) {
  if (s === 'none') { playerExists().then(h => { if (h) popSend({ cmd: 'stop-all' }).catch(() => {}); }); return; }
  if (s === 'radio') popSend({ cmd: 'play-station', idx: (S.ntMusic && S.ntMusic.station) || 0 }).catch(() => {});
  else popSend({ cmd: 'ambient-play', kind: s }).catch(() => {});
}
function playerHtml() {
  return '<section class="card"><div class="h"><b>Sound</b><small>Keeps playing when this closes</small></div><div class="player">' +
    '<img id="pArt" src="' + esc(ui.art) + '" alt=""><div class="meta"><div class="pt" id="pTitle">' + esc(String(ui.title).replace(/^♪ /, '')) +
    '</div><div class="ps" id="pSub">' + esc(ui.sub) + '</div></div><div class="ctl">' +
    '<button class="sq" id="pPrev" aria-label="Previous">' + ICON.prev + '</button>' +
    '<button class="sq main" id="pToggle" aria-label="Play or pause">' + (ui.playing ? ICON.pause : ICON.play) + '</button>' +
    '<button class="sq" id="pNext" aria-label="Next">' + ICON.next + '</button></div></div></section>';
}
const playerCmd = w => (CMDS[ui.tab] || CMDS.radio)[w];
const toggleSound = () => popSend({ cmd: playerCmd('toggle'), kind: ui.kind, url: ui.url, title: String(ui.title || '').replace(/^♪ /, ''),
  art: /^https?:/.test(ui.art || '') ? ui.art : '' }).catch(() => {});
function wirePlayer() {
  if (!$('pToggle')) return;
  $('pToggle').addEventListener('click', toggleSound);
  $('pNext').addEventListener('click', () => popSend({ cmd: playerCmd('next') }).catch(() => {}));
  $('pPrev').addEventListener('click', () => popSend({ cmd: playerCmd('prev') }).catch(() => {}));
}

// Now-playing bar: shown while music plays, stays (paused) until you close it.
let miniOn = false;
function updateMini() {
  if (ui.playing) miniOn = true;
  $('mini').hidden = !miniOn;
  if (!miniOn) return;
  $('miniArt').src = ui.art || '../newtab/img/lofi-disc.webp';
  $('miniTitle').textContent = String(ui.title || 'Sound').replace(/^♪ /, '');
  $('miniSub').textContent = ui.playing ? (ui.sub || 'Playing') : 'Paused';
  $('miniToggle').innerHTML = ui.playing ? ICON.pause : ICON.play;
}
$('miniStop').innerHTML = ic('<path d="M6 6l12 12M18 6L6 18"/>');
$('miniPrev').innerHTML = ICON.prev;
$('miniNext').innerHTML = ICON.next;
$('miniToggle').addEventListener('click', toggleSound);
$('miniPrev').addEventListener('click', () => popSend({ cmd: playerCmd('prev') }).catch(() => {}));
$('miniNext').addEventListener('click', () => popSend({ cmd: playerCmd('next') }).catch(() => {}));
$('miniStop').addEventListener('click', () => {
  miniOn = false; $('mini').hidden = true;
  popSend({ cmd: 'stop-all' }).catch(() => {});
});

function applyPlayerUI(next) {
  if (!next) return;
  ui = next;
  updateMini();
  if (!$('pToggle')) return;
  $('pArt').src = ui.art || '../newtab/img/lofi-disc.webp';
  $('pTitle').textContent = String(ui.title || '').replace(/^♪ /, '');
  $('pSub').textContent = ui.sub || '';
  $('pToggle').innerHTML = ui.playing ? ICON.pause : ICON.play;
}

/* ---------------- Focus ---------------- */
const SOUNDS = [['rain', 'Rain'], ['brown', 'Soft noise'], ['waves', 'Waves'], ['radio', 'Lofi radio'], ['none', 'Silence']];
function leftMs(l) { return l.pausedLeft != null ? l.pausedLeft : Math.max(0, (l.endsAt || 0) - Date.now()); }
function mmss(ms) {
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
}
const soundChips = cur => '<div class="chips" id="soundChips">' + SOUNDS.map(([k, n]) =>
  '<button class="chip' + (cur === k ? ' on' : '') + '" data-s="' + k + '">' + n + '</button>').join('') + '</div>';

function renderFocus() {
  const l = S.lockin;
  const running = l && (l.phase === 'focus' || l.phase === 'break');
  const day = (S.focusLog || {})[dayKey(Date.now())];
  let html = '';
  if (running) {
    const isBreak = l.phase === 'break', paused = l.pausedLeft != null;
    html += '<section class="card"><div class="timer"><div class="ph">' + (isBreak ? 'Break' : paused ? 'Paused' : 'Focusing') + '</div>' +
      '<div class="tt">' + esc(isBreak ? 'Stretch and look away from the screen.' : (l.task || 'Focus session')) + '</div>' +
      '<div class="tm" id="tTime">' + mmss(leftMs(l)) + '</div><div class="prog"><i id="tBar"></i></div></div>' +
      '<div class="btns">' + (isBreak ? '' : '<button class="btn soft" id="fPause">' + (paused ? 'Resume' : 'Pause') + '</button>') +
      '<button class="btn soft" id="fAdd">+5 min</button><button class="btn ghost" id="fEnd">' + (isBreak ? 'Skip break' : 'End') + '</button></div>';
    if (!isBreak) html += '<span class="lbl">Sound</span>' + soundChips(l.sound || 'none');
    html += '</section>';
  } else {
    html += '<section class="card"><label class="lbl" for="fTask">What are you working on?</label>' +
      '<input class="txt-in" id="fTask" maxlength="120" autocomplete="off" placeholder="e.g. Finish CS301 assignment" value="' + esc(pick.task) + '">' +
      '<span class="lbl">Length</span><div class="chips" id="lenChips" style="margin-top:0">' + [25, 50, 90].map(n =>
        '<button class="chip' + (pick.mins === n ? ' on' : '') + '" data-m="' + n + '">' + n + ' min</button>').join('') +
      '<input class="num-in" id="lenCustom" type="number" min="5" max="240" placeholder="Custom" value="' + ([25, 50, 90].includes(pick.mins) ? '' : pick.mins) + '"></div>' +
      '<span class="lbl">Sound</span>' + soundChips(pick.sound) +
      '<div class="toggle-row" style="margin-top:12px;border-top:0;padding-bottom:0"><div><div class="t">Block distracting sites</div><div class="d">Until the session ends</div></div>' +
      '<label class="tg"><input type="checkbox" id="fBlock"' + (pick.block ? ' checked' : '') + '><span></span></label></div>' +
      '<button class="btn block" id="fStart" style="margin-top:14px">Start ' + pick.mins + '-minute session</button>' +
      '<div class="lockline">' + ICON.lock + (day && day.sessions ? 'Today: ' + day.sessions + ' session' + (day.sessions === 1 ? '' : 's') + ' · ' + fmtDurShort(day.mins * 60) + ' focused' : 'Sessions you finish show up in your dashboard.') + '</div></section>';
  }
  html += playerHtml();
  view.innerHTML = html;
  wirePlayer();
  if (!running) wireFocusSetup(); else { wireFocusRunning(l); tickFocus(); ticker = setInterval(tickFocus, 250); }
}
function tickFocus() {
  const l = S.lockin; if (!l || !$('tTime')) return;
  const left = leftMs(l);
  $('tTime').textContent = mmss(left);
  $('tBar').style.width = Math.min(100, (1 - left / (l.totalMs || 1)) * 100).toFixed(1) + '%';
}
function sendOp(op, extra) { return chrome.runtime.sendMessage(Object.assign({ type: 'ww-lockin', op }, extra || {})).catch(() => {}); }
function wireFocusRunning(l) {
  const on = (id, fn) => { if ($(id)) $(id).addEventListener('click', fn); };
  on('fPause', () => sendOp(l.pausedLeft != null ? 'resume' : 'pause'));
  on('fAdd', () => sendOp('add'));
  on('fEnd', () => sendOp('end'));
  const sc = $('soundChips');
  if (sc) sc.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { playSound(b.dataset.s); sc.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b)); }));
}
function wireFocusSetup() {
  $('fTask').addEventListener('input', e => { pick.task = e.target.value; });
  $('lenChips').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { pick.mins = +b.dataset.m; $('lenCustom').value = ''; renderFocus(); }));
  $('lenCustom').addEventListener('input', e => {
    const v = Math.max(5, Math.min(240, parseInt(e.target.value, 10) || 0));
    if (e.target.value) { pick.mins = v; $('fStart').textContent = 'Start ' + v + '-minute session'; $('lenChips').querySelectorAll('.chip').forEach(x => x.classList.remove('on')); }
  });
  $('soundChips').querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => {
    pick.sound = b.dataset.s; $('soundChips').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
  }));
  $('fBlock').addEventListener('change', e => { pick.block = e.target.checked; });
  $('fStart').addEventListener('click', async () => {
    let block = pick.block;
    if (block) {
      let ok = false;
      try { ok = await chrome.permissions.contains(ALL_URLS) || await chrome.permissions.request(ALL_URLS); } catch (e) {}
      if (!ok) { block = false; toast('Starting without blocking: site access wasn’t allowed.'); }
    }
    chrome.storage.local.set({ lockPrefs: { mins: pick.mins, breakMins: (S.lockPrefs || {}).breakMins == null ? 5 : S.lockPrefs.breakMins, sound: pick.sound, block: pick.block } }).catch(() => {});
    await sendOp('start', { mins: pick.mins, task: pick.task.trim(), sound: pick.sound, block, breakMins: (S.lockPrefs || {}).breakMins });
    playSound(pick.sound);
    pick.task = '';
    await load(); render();
  });
}

/* ---------------- Protect ---------------- */
async function saveProtect(p) { S.protect = p; await storeSet({ protect: p }); }
function toggleRow(id, title, desc, on, locked) {
  return '<div class="toggle-row"><div><div class="t">' + title + '</div><div class="d">' + desc + '</div></div><label class="tg"><input type="checkbox" id="' + id + '"' +
    (on ? ' checked' : '') + '><span></span></label></div>';
}
function renderProtect() {
  const p = S.protect;
  const stats = (S.protectStats || {})[dayKey(Date.now())] || {};
  const blocked = Object.values(stats).reduce((a, b) => a + b, 0);
  const onCount = [p.adult, p.shortsOn, p.pause, p.blocklist.length > 0].filter(Boolean).length;
  const isBlocked = tabDomain && p.blocklist.includes(tabDomain);
  let html = '<section class="card"><div class="stat-pair"><div class="stat warm"><b>' + onCount + '</b><span>protections on</span></div>' +
    '<div class="stat"><b>' + blocked + '</b><span>blocked today</span></div></div>' +
    (p.pinHash ? '<div class="lockline">' + ICON.lock + 'A PIN protects these settings. Change them from the dashboard.</div>' : '') + '</section>';
  html += '<section class="card">' +
    toggleRow('tAdult', 'Adult content filter', 'Blocks adult sites and turns on SafeSearch.', p.adult) +
    toggleRow('tShorts', 'Short videos', 'Blocks Shorts, Reels and TikTok feeds.', p.shortsOn) +
    toggleRow('tPause', 'Mindful pause', 'A short breath before distracting sites open.', p.pause) + '</section>';
  if (tabDomain) {
    html += '<section class="card"><div class="h"><b>This site</b></div><div class="site-top">' + iconImg(tabDomain, 26) + '<span class="nm">' + esc(tabDomain) + '</span>' +
      '<button class="btn ' + (isBlocked ? 'soft' : '') + '" id="bBlock">' + (isBlocked ? 'Unblock' : 'Block site') + '</button></div></section>';
  }
  html += '<section class="card"><div class="links"><button id="bMore">More in Protect<span>' + ICON.chev + '</span></button></div></section>';
  view.innerHTML = html;

  const askAccess = async () => { try { return await chrome.permissions.request(ALL_URLS); } catch (e) { return false; } };
  const wire = (id, key, label) => $(id).addEventListener('change', async e => {
    const on = e.target.checked;
    if (!on && p.pinHash) { e.target.checked = true; toast('Protected by a PIN. Use the dashboard.'); return; }
    const cur = protectState(S.protect); cur[key] = on;
    await saveProtect(cur);                         // save first: the permission prompt can close this popup
    if (on && !(await chrome.permissions.contains(ALL_URLS)) && !(await askAccess())) {
      cur[key] = false; await saveProtect(cur); toast('WebWell needs site access to block.'); renderProtect(); return;
    }
    toast(label + (on ? ' on' : ' off')); renderProtect();
  });
  wire('tAdult', 'adult', 'Adult filter'); wire('tShorts', 'shortsOn', 'Short-video blocker'); wire('tPause', 'pause', 'Mindful pause');
  if ($('bBlock')) $('bBlock').addEventListener('click', async () => {
    const cur = protectState(S.protect);
    if (isBlocked) {
      if (cur.pinHash) { toast('Protected by a PIN. Use the dashboard.'); return; }
      cur.blocklist = cur.blocklist.filter(d => d !== tabDomain);
      await saveProtect(cur); toast(tabDomain + ' unblocked'); renderProtect(); return;
    }
    cur.blocklist.push(tabDomain);
    await saveProtect(cur);
    if (!(await chrome.permissions.contains(ALL_URLS)) && !(await askAccess())) {
      cur.blocklist = cur.blocklist.filter(d => d !== tabDomain); await saveProtect(cur); toast('WebWell needs site access to block.'); renderProtect(); return;
    }
    toast(tabDomain + ' is blocked'); renderProtect();
  });
  $('bMore').addEventListener('click', () => openDash('protect'));
}

/* ---------------- Settings ---------------- */
function renderSettings() {
  const s = S.settings, clock24 = !!S.profile.clock24;
  view.innerHTML = '<section class="card">' +
    toggleRow('sTrack', 'Track my browsing', 'Counts active-tab time on this device.', s.trackingEnabled) +
    toggleRow('sDark', 'Dark mode', 'For the dashboard and this popup.', s.darkMode) +
    toggleRow('sNudge', 'Slump forecast alert', 'A heads-up 15 minutes before your usual slump.', s.forecastNudge) +
    toggleRow('sClock', '24-hour clock', 'On your new tab page.', clock24) +
    '<div class="toggle-row"><div><div class="t">Idle timeout</div><div class="d">Stop counting after this long away.</div></div>' +
    '<select class="sel" id="sIdle">' + [[30, '30 seconds'], [60, '1 minute'], [120, '2 minutes'], [300, '5 minutes'], [600, '10 minutes']].map(([v, n]) =>
      '<option value="' + v + '"' + (s.idleTimeout === v ? ' selected' : '') + '>' + n + '</option>').join('') +
    (![30, 60, 120, 300, 600].includes(s.idleTimeout) ? '<option value="' + s.idleTimeout + '" selected>' + s.idleTimeout + ' seconds</option>' : '') + '</select></div></section>' +
    '<section class="card"><div class="links"><button id="lOpen">Open dashboard<span>' + ICON.chev + '</span></button>' +
    '<button id="lSet">All settings<span>' + ICON.chev + '</span></button>' +
    '<button id="lNew">Open a new tab<span>' + ICON.chev + '</span></button></div></section>' +
    '<div class="foot">WebWell v' + esc(chrome.runtime.getManifest().version) + ' · Written &amp; Developed by <a href="https://adnankhan.cc" target="_blank" rel="noopener">Adnan</a></div>';

  const saveSettings = async patch => { S.settings = Object.assign({}, S.settings, patch); await storeSet({ settings: S.settings }); };
  $('sTrack').addEventListener('change', async e => { await saveSettings({ trackingEnabled: e.target.checked }); renderHeader(); toast(e.target.checked ? 'Tracking resumed' : 'Tracking paused'); });
  $('sDark').addEventListener('change', async e => { await saveSettings({ darkMode: e.target.checked }); document.body.classList.toggle('dark', e.target.checked); });
  $('sNudge').addEventListener('change', async e => { await saveSettings({ forecastNudge: e.target.checked }); toast(e.target.checked ? 'Slump alert on' : 'Slump alert off'); });
  $('sClock').addEventListener('change', async e => {
    S.profile = Object.assign({}, S.profile, { clock24: e.target.checked }); await storeSet({ profile: S.profile }); toast(e.target.checked ? '24-hour clock' : '12-hour clock');
  });
  $('sIdle').addEventListener('change', async e => { await saveSettings({ idleTimeout: +e.target.value }); toast('Idle timeout updated'); });
  $('lOpen').addEventListener('click', () => openDash(''));
  $('lSet').addEventListener('click', () => openDash('settings'));
  $('lNew').addEventListener('click', () => { chrome.tabs.create({}); window.close(); });
}

/* ---------------- shell ---------------- */
function openDash(hash) {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') + (hash ? '#' + hash : '') });
  window.close();
}
const RENDER = { today: renderToday, focus: renderFocus, protect: renderProtect, settings: renderSettings };
function render() {
  clearInterval(ticker); ticker = null;
  view.classList.remove('still'); delete view.dataset.sig;   // a real view change plays the entrance animation
  document.querySelectorAll('#tabs button').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  renderHeader();
  (RENDER[tab] || renderToday)();
}
$('tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  tab = b.dataset.tab; try { localStorage.setItem('ww_pop_tab', tab); } catch (err) {}
  render();
});
$('openDash').addEventListener('click', () => openDash(''));
$('trackPill').addEventListener('click', async () => {
  S.settings.trackingEnabled = !S.settings.trackingEnabled;
  await storeSet({ settings: S.settings }); renderHeader(); if (tab === 'today' || tab === 'settings') render();
});

// Keep the page current without disturbing whatever the user is typing in.
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== 'local' || !(c.lockin || c.protectStats || c.focusLog)) return;
  if (document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName)) return;
  load().then(() => { if (tab === 'focus' || tab === 'protect') render(); });
});
chrome.runtime.onMessage.addListener(msg => { if (msg && msg.target === 'ww-player-ui') applyPlayerUI(msg.ui); });
setInterval(() => {
  if (tab !== 'today' || document.hidden) return;
  if (document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName)) return;
  view.classList.add('still');   // quiet refresh: no fade-in replay
  load().then(renderToday);
}, 5000);

(async function boot() {
  await load();
  render();
  // Only ask a player that's already running; opening the popup shouldn't start one.
  try { if (await playerExists()) { const st = await popSend({ cmd: 'get-state' }); if (st && st.ui) applyPlayerUI(st.ui); } } catch (e) {}
})();
