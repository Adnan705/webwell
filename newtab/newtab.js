// WebWell new tab page — Momentum-style focus page. 100% local.
// Startup design: paint the REAL page synchronously from a tiny localStorage
// snapshot (window.__WW_BOOT, see boot.js), then reconcile with chrome.storage
// in the background. No placeholders, no layout pop-in, no waiting on fetch().
'use strict';

/* ---------------- pure helpers ---------------- */
function greetingForHour(h) {
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Good night';
}

const QUOTES = [
  'The secret of getting ahead is getting started.',
  'Focus is a matter of deciding what not to do.',
  'Small steps every day lead to big results.',
  'Discipline is choosing what you want most over what you want now.',
  'Don’t watch the clock; do what it does. Keep going.',
  'You don’t have to be great to start, but you have to start to be great.',
  'Attention is the rarest and purest form of generosity.',
  'What gets measured gets managed.',
  'The best time to plant a tree was 20 years ago. The second best time is now.',
  'Simplicity is the ultimate sophistication.',
  'Either you run the day, or the day runs you.',
  'Well begun is half done.',
];

function quoteForDay(n) { return QUOTES[((n % QUOTES.length) + QUOTES.length) % QUOTES.length]; }

function dayOfYear(d) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}

/* ---------------- state ---------------- */
const $ = id => document.getElementById(id);
const store = { get: keys => chrome.storage.local.get(keys) };
const LANDMARKS = window.WW_LANDMARKS || [];
const BOOT = window.__WW_BOOT || {};

let profile = { name: '', theme: 'dusk', bgMode: 'photos', vecStyle: 'mountains', vecPal: 'dawn', bgPick: null, pic: '', clock24: false };
let focus = null;   // { date, text, done }
let tasks = {};     // { [dateKey]: [{ id, text, done }] }
let today = '';
let bookmarks = []; // manual [{ id, name, url }]  ('ntBookmarks')
let bmHidden = [];  // auto domains the user hid   ('ntHidden')
let autoCache = []; // auto top-site domains (kept in the snapshot so the dock paints instantly)
let daysData = {};

// Every write goes through persist(): it refreshes the instant-paint snapshot
// and then saves to chrome.storage.
function saveBoot() {
  try {
    localStorage.setItem('ww_boot', JSON.stringify({
      v: 1, theme: profile.theme, bgMode: profile.bgMode, vecStyle: profile.vecStyle, vecPal: profile.vecPal, name: profile.name, bgPick: profile.bgPick, clock24: !!profile.clock24,
      focus, tasksDate: today, tasks: tasks[today] || [], bookmarks, hidden: bmHidden, auto: autoCache
    }));
  } catch (e) {}
}
function persist(obj) { saveBoot(); return chrome.storage.local.set(obj); }

function hydrateFromBoot() {
  today = dayKey(Date.now());
  if (BOOT.v !== 1) return;
  profile.name = BOOT.name || '';
  profile.theme = BOOT.theme || 'dusk';
  profile.bgMode = BOOT.bgMode === 'gradient' || BOOT.bgMode === 'vector' ? BOOT.bgMode : 'photos';
  profile.vecStyle = BOOT.vecStyle || 'mountains';
  profile.vecPal = BOOT.vecPal || 'dawn';
  profile.bgPick = BOOT.bgPick || null;
  profile.clock24 = !!BOOT.clock24;
  if (BOOT.focus && BOOT.focus.date === today) focus = BOOT.focus;
  if (BOOT.tasksDate === today && Array.isArray(BOOT.tasks)) tasks[today] = BOOT.tasks;
  bookmarks = Array.isArray(BOOT.bookmarks) ? BOOT.bookmarks : [];
  bmHidden = Array.isArray(BOOT.hidden) ? BOOT.hidden : [];
  autoCache = Array.isArray(BOOT.auto) ? BOOT.auto : [];
}

function stateSig() {
  return JSON.stringify([profile.name, profile.theme, profile.bgMode, profile.vecStyle, profile.vecPal, profile.bgPick, profile.clock24, focus,
    tasks[today] || [], bookmarks, bmHidden]);
}

// Real data from chrome.storage (small keys only — fast).
async function loadState() {
  today = dayKey(Date.now());
  const r = await store.get(['profile', 'focus', 'tasks', 'ntBookmarks', 'ntHidden']);
  if (r.profile) profile = Object.assign(profile, r.profile);
  profile.theme = profile.theme || 'dusk';
  focus = (r.focus && r.focus.date === today) ? r.focus : null;
  tasks = r.tasks || {};
  // keep only 30 days of task history so storage doesn't grow forever
  const cutoff = dayKey(Date.now() - 30 * 86400000);
  let pruned = false;
  for (const k of Object.keys(tasks)) if (k < cutoff) { delete tasks[k]; pruned = true; }
  if (pruned) { try { await chrome.storage.local.set({ tasks }); } catch (e) {} }
  bookmarks = Array.isArray(r.ntBookmarks) ? r.ntBookmarks : [];
  bmHidden = Array.isArray(r.ntHidden) ? r.ntHidden : [];
  // one-time cleanup of duplicates saved before the duplicate check existed
  const seenKeys = new Set();
  const clean = bookmarks.filter(b => { const k = bmKey(b.url); if (seenKeys.has(k)) return false; seenKeys.add(k); return true; });
  if (clean.length !== bookmarks.length) {
    bookmarks = clean;
    try { await chrome.storage.local.set({ ntBookmarks: bookmarks }); } catch (e) {}
  }
}

/* ---------------- theme / clock / greeting ---------------- */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', profile.theme || 'dusk');
}

let lastClockText = '';
function tickClock() {
  const now = new Date();
  // A tab left open past midnight must not keep yesterday's focus/tasks.
  if (today && dayKey(now.getTime()) !== today && !tickClock._rolling) {
    tickClock._rolling = true;
    loadState().then(() => { paintAll(false); }).finally(() => { tickClock._rolling = false; });
  }
  // Manual formatting: instant (toLocaleTimeString can stall on first call).
  let h = now.getHours();
  const mm = String(now.getMinutes()).padStart(2, '0');
  let t;
  if (profile.clock24) {
    t = String(h).padStart(2, '0') + ':' + mm;
  } else {
    const ap = h >= 12 ? 'PM' : 'AM';
    t = (h % 12 || 12) + ':' + mm + ' ' + ap;
  }
  if (t !== lastClockText) { lastClockText = t; $('clock').textContent = t; }
  const wd = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()];
  const mo = ['January','February','March','April','May','June','July','August','September','October','November','December'][now.getMonth()];
  const dt = wd + ', ' + mo + ' ' + now.getDate();
  if ($('date').textContent !== dt) $('date').textContent = dt;
  const g = greetingForHour(now.getHours());
  const gt = profile.name ? g + ', ' + profile.name + '.' : g + '.';
  if ($('greet').textContent !== gt) $('greet').textContent = gt;
}

/* ---------------- name (first run) ---------------- */
let nameWired = false;
function maybeAskName() {
  if (profile.name) return;
  const overlay = $('nameOverlay');
  overlay.classList.remove('hidden');
  const input = $('nameInput');
  input.focus();
  if (nameWired) return;
  nameWired = true;
  input.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const v = input.value.trim();
    if (!v) return;
    profile.name = v;
    await persist({ profile });
    overlay.classList.add('hidden');
    tickClock();
  });
}

// New users get the welcome tour (welcome.js), which asks for the name itself.
// Settings → "Show the tour again" opens this page with #tour.
function startWelcome() {
  const W = window.WW_WELCOME;
  if (!W || !W.start) { maybeAskName(); return; }
  W.start({
    name: profile.name,
    forced: location.hash === '#tour',
    onName: async v => { profile.name = v; await persist({ profile }); tickClock(); },
    onEnd: () => { if (location.hash) history.replaceState(null, '', location.pathname); }
  }).catch(() => {});
}

/* ---------------- focus ---------------- */
let focusToday = null;   // { mins, sessions } from the Focus sessions log
function renderFocusStat() {
  const el = $('focusStat');
  if (!el) return;
  el.textContent = focusToday && focusToday.mins > 0
    ? fmtDurShort(focusToday.mins * 60) + ' focused today' + (focusToday.sessions > 1 ? ' · ' + focusToday.sessions + ' sessions' : '')
    : '';
}
function renderFocus() {
  const ask = $('focusAsk'), set = $('focusSet');
  if (focus && focus.text) {
    ask.classList.add('hidden');
    set.classList.remove('hidden');
    set.classList.toggle('done', !!focus.done);
    $('focusText').textContent = focus.text;
  } else {
    set.classList.add('hidden');
    ask.classList.remove('hidden');
  }
  renderFocusStat();
}

function wireFocus() {
  $('focusInput').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const v = e.target.value.trim();
    if (!v) return;
    focus = { date: today, text: v, done: false };
    e.target.value = '';
    renderFocus();
    await persist({ focus });
  });
  $('focusCheck').addEventListener('click', async () => {
    if (!focus) return;
    focus.done = !focus.done;
    renderFocus();
    await persist({ focus });
  });
  $('focusClear').addEventListener('click', async () => {
    focus = null;
    renderFocus();
    $('focusInput').focus();
    await persist({ focus: null });
  });
  // "Start focusing" opens the focus session sheet with today's focus filled in.
  $('focusGo').addEventListener('click', () => { if (window.wwOpenFocusSheet) window.wwOpenFocusSheet(); });
}

/* ---------------- tasks ---------------- */
function todaysTasks() { return tasks[today] || []; }

const TASK_EMPTY_LINES = [
  'Nothing yet — what matters today?',
  'A blank list. Full of potential.',
  'Zero tasks. Suspiciously calm…',
  'Today is unwritten. Go on.'
];

let freshTaskId = null;
function renderTasks() {
  const list = $('taskList');
  const items = todaysTasks();
  const doneCount = items.filter(x => x.done).length;
  $('taskCount').textContent = items.length ? doneCount + '/' + items.length : '';
  $('taskBar').style.width = items.length ? Math.round(doneCount / items.length * 100) + '%' : '0';
  if (!items.length) {
    const dn = Math.floor(Date.now() / 864e5);
    list.innerHTML = '<div class="task-empty">' + TASK_EMPTY_LINES[dn % TASK_EMPTY_LINES.length] + '</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const t of items) {
    const li = document.createElement('li');
    if (t.done) li.className = 'done';
    if (t.id === freshTaskId) li.classList.add('fresh');
    const b = document.createElement('button');
    b.className = 'tcheck';
    b.title = 'Mark done';
    b.setAttribute('aria-label', 'Mark done');
    b.addEventListener('click', () => toggleTask(t.id));
    const s = document.createElement('span');
    s.className = 'ttext';
    s.textContent = t.text;
    s.title = t.text;
    const x = document.createElement('button');
    x.className = 'tdel';
    x.textContent = '✕';
    x.title = 'Delete';
    x.setAttribute('aria-label', 'Delete task');
    x.addEventListener('click', () => deleteTask(t.id));
    li.append(b, s, x);
    frag.appendChild(li);
  }
  if (doneCount === items.length) {
    const yay = document.createElement('div');
    yay.className = 'task-alldone';
    yay.textContent = 'All done! 🎉';
    frag.appendChild(yay);
  }
  list.replaceChildren(frag);
  freshTaskId = null;
}

async function addTask(text) {
  const v = text.trim();
  if (!v) return;
  const items = todaysTasks();
  const id = 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
  items.push({ id, text: v.slice(0, 120), done: false });
  tasks[today] = items;
  freshTaskId = id;
  renderTasks();
  await persist({ tasks });
}
async function toggleTask(id) {
  const t = todaysTasks().find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  renderTasks();
  await persist({ tasks });
}
async function deleteTask(id) {
  tasks[today] = todaysTasks().filter(x => x.id !== id);
  renderTasks();
  await persist({ tasks });
}
// Tasks live in a small pill; it opens upward on click and closes on Escape or an outside click.
function setTasksOpen(open) {
  $('tasksPanel').classList.toggle('collapsed', !open);
  $('tasksToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) setTimeout(() => $('taskInput').focus(), 30);
}
function wireTasks() {
  $('tasksToggle').addEventListener('click', () => setTasksOpen($('tasksPanel').classList.contains('collapsed')));
  document.addEventListener('click', e => {
    if (!$('tasksPanel').classList.contains('collapsed') && !e.target.closest('#tasksPanel')) setTasksOpen(false);
  });
  $('tasksPanel').addEventListener('keydown', e => { if (e.key === 'Escape') { setTasksOpen(false); $('tasksToggle').focus(); } });
  $('taskInput').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const v = e.target.value;
    e.target.value = '';
    await addTask(v);
  });
}

/* ---------------- background: landmark photos or gradient ---------------- */
function pickBgIndex() {
  if (!LANDMARKS.length) return -1;
  if (profile.bgPick && profile.bgPick.date === today &&
      profile.bgPick.idx >= 0 && profile.bgPick.idx < LANDMARKS.length) return profile.bgPick.idx;
  return dayOfYear(new Date()) % LANDMARKS.length;
}

let shownIdx = -1, photoFlip = false, lmToken = 0;
function showLandmark(idx, animate) {
  const lm = LANDMARKS[idx];
  if (!lm || idx === shownIdx) return;
  shownIdx = idx;
  const token = ++lmToken;
  const url = 'bg/' + lm.file;
  // Placeholder tone (average colour of the photo) shows while the image decodes.
  document.documentElement.style.backgroundColor = lm.c || '';
  const next = $(photoFlip ? 'bgPhoto' : 'bgPhotoB');
  const prev = $(photoFlip ? 'bgPhotoB' : 'bgPhoto');
  photoFlip = !photoFlip;
  const reveal = () => {
    if (token !== lmToken) return;
    next.style.backgroundImage = 'url("' + url + '")';
    next.classList.remove('hidden');
    // next frame so the opacity transition actually runs
    requestAnimationFrame(() => {
      next.classList.add('on');
      prev.classList.remove('on');
    });
  };
  const im = new Image();
  im.src = url;
  if (im.decode) im.decode().then(reveal, reveal); else im.onload = reveal;
  const nm = $('lmName'), fc = $('lmFact');
  nm.textContent = lm.name; fc.textContent = lm.fact;
  if (animate) {
    const box = $('landmark');
    box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
  }
}

function applyBackground() {
  const m = profile.bgMode;
  const mode = m === 'gradient' || m === 'vector' ? m : 'photos';
  document.documentElement.setAttribute('data-bgmode', mode);
  const isPhotos = mode === 'photos' && LANDMARKS.length > 0;
  const isVector = mode === 'vector' && !!window.WW_VBG;
  $('bgShade').classList.toggle('hidden', !(isPhotos || isVector));
  $('landmark').classList.toggle('hidden', !isPhotos);
  $('plainCredit').classList.toggle('hidden', isPhotos);
  $('vecShuffle').classList.toggle('hidden', !isVector);
  if (!isPhotos) {
    $('bgPhoto').classList.add('hidden'); $('bgPhotoB').classList.add('hidden');
    document.documentElement.style.backgroundColor = '';
    shownIdx = -1;
  } else {
    showLandmark(pickBgIndex(), false);
  }
  const vec = $('bgVector');
  if (isVector) {
    const V = window.WW_VBG;
    document.documentElement.style.backgroundColor = V.base(profile.vecPal);
    vec.style.backgroundImage = 'url("' + V.dataUri(profile.vecStyle, profile.vecPal) + '")';
    vec.classList.remove('hidden');
    requestAnimationFrame(() => vec.classList.add('on'));
  } else {
    vec.classList.add('hidden'); vec.classList.remove('on');
  }
}

function wireShuffle() {
  $('vecShuffle').addEventListener('click', async () => {
    if (!window.WW_VBG) return;
    const n = window.WW_VBG.pick({ style: profile.vecStyle, pal: profile.vecPal });
    profile.vecStyle = n.style; profile.vecPal = n.pal;
    applyBackground();
    await persist({ profile });
  });
  $('lmShuffle').addEventListener('click', async () => {
    if (LANDMARKS.length < 2) return;
    let next = shownIdx;
    while (next === shownIdx) next = Math.floor(Math.random() * LANDMARKS.length);
    profile.bgPick = { date: today, idx: next };
    showLandmark(next, true);
    await persist({ profile });
  });
}

/* ---------------- web search ---------------- */
// chrome.search uses whatever search engine the user picked in their browser.
function wireSearch() {
  $('searchForm').addEventListener('submit', e => {
    e.preventDefault();
    const text = $('searchInput').value.trim();
    if (!text) return;
    if (chrome.search && chrome.search.query) chrome.search.query({ text, disposition: 'CURRENT_TAB' });
    else location.href = 'https://www.google.com/search?q=' + encodeURIComponent(text);
  });
}

/* ---------------- links ---------------- */
function wireLinks() {
  const base = chrome.runtime.getURL('dashboard/dashboard.html');
  $('dashLink').addEventListener('click', e => { e.preventDefault(); location.href = base; });
  $('settingsLink').addEventListener('click', e => { e.preventDefault(); location.href = base + '#settings'; });
}

/* ---------------- bookmarks: icon dock ---------------- */
function bmDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url; }
}
function bmNorm(url) {
  url = url.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'https://' + url;
  return url;
}
// gmail.com, https://gmail.com/ and https://www.gmail.com are the same bookmark.
function bmKey(url) {
  return String(url || '').trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}

// Most-visited domains over the last 7 days (min 5 min total).
function topDomains(days, n) {
  const agg = {};
  const now = Date.now();
  for (let i = 0; i < 7; i++) {
    const d = days[dayKey(now - i * 86400000)];
    if (!d || !d.domains) continue;
    for (const dom in d.domains) agg[dom] = (agg[dom] || 0) + d.domains[dom];
  }
  return Object.keys(agg).filter(dom => agg[dom] >= 300).sort((a, b) => agg[b] - agg[a]).slice(0, n);
}

let dockSig = '';
function renderBookmarks(first) {
  const dock = $('bmDock');
  const seen = new Set(bookmarks.map(b => bmDomain(b.url).toLowerCase()));
  const hidden = new Set(bmHidden.map(d => String(d).toLowerCase()));
  const manual = bookmarks.map(b => ({ id: b.id, name: b.name, url: b.url, auto: false }));
  const auto = autoCache
    .filter(dom => !seen.has(dom.toLowerCase()) && !hidden.has(dom.toLowerCase()))
    .map(dom => ({ id: 'a:' + dom, name: dom, url: 'https://' + dom, auto: true }));
  const items = manual.concat(auto);   // no cap: nothing you add is ever dropped
  const sig = JSON.stringify(items.map(i => [i.id, i.url]));
  if (sig === dockSig && dock.firstChild) return;   // nothing changed => don't touch the DOM
  dockSig = sig;

  const frag = document.createDocumentFragment();
  items.forEach((b, i) => {
    const a = document.createElement('a');
    a.className = 'bm-tile' + (first ? ' pop' : '');
    if (first) a.style.setProperty('--i', i);
    a.href = b.url;
    a.title = b.name;
    const domain = bmDomain(b.url);
    const img = document.createElement('img');
    img.alt = '';
    img.width = 28; img.height = 28;
    img.decoding = 'async';
    img.src = faviconUrl(domain, 28);
    img.addEventListener('error', () => {
      img.remove();
      const s = document.createElement('span');
      s.className = 'bm-letter';
      s.textContent = (b.name || '?').charAt(0).toUpperCase();
      a.prepend(s);
    });
    a.appendChild(img);
    const x = document.createElement('button');
    x.className = 'bm-x';
    x.textContent = '✕';
    x.title = 'Remove bookmark';
    x.setAttribute('aria-label', 'Remove bookmark');
    x.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      a.classList.add('leaving');
      setTimeout(() => {
        if (b.auto) { bmHidden.push(bmDomain(b.url)); persist({ ntHidden: bmHidden }); }
        else { bookmarks = bookmarks.filter(k => k.id !== b.id); persist({ ntBookmarks: bookmarks }); }
        renderBookmarks(false);
      }, 160);
    });
    a.appendChild(x);
    frag.appendChild(a);
  });
  const add = document.createElement('button');
  add.className = 'bm-tile bm-add' + (first ? ' pop' : '');
  if (first) add.style.setProperty('--i', items.length);
  add.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 1v12M1 7h12"/></svg>';
  add.title = 'Add bookmark';
  add.setAttribute('aria-label', 'Add bookmark');
  add.addEventListener('click', () => {
    const pop = $('bmPop');
    pop.classList.toggle('hidden');
    if (!pop.classList.contains('hidden')) $('bmUrl').focus();
  });
  frag.appendChild(add);
  dock.replaceChildren(frag);
}

function showBmErr(msg) {
  const err = $('bmErr');
  err.textContent = msg;
  err.classList.remove('hidden');
  clearTimeout(err._t);
  err._t = setTimeout(() => err.classList.add('hidden'), 2200);
}

async function addBookmark() {
  const v = $('bmUrl').value.trim();
  if (!v) return;
  const url = bmNorm(v);
  let okUrl = false;   // only real web links (blocks javascript:/data:/file:)
  try { const u = new URL(url); okUrl = (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.'); } catch (e) {}
  if (!okUrl) { showBmErr('That doesn’t look like a web link'); return; }
  if (bookmarks.some(b => bmKey(b.url) === bmKey(url))) { showBmErr('Already in your dock'); return; }
  bookmarks.push({ id: 'b' + Date.now().toString(36), name: bmDomain(url), url });
  $('bmUrl').value = '';
  $('bmPop').classList.add('hidden');
  $('bmErr').classList.add('hidden');
  renderBookmarks(false);
  await persist({ ntBookmarks: bookmarks });
}

function wireBookmarks() {
  $('bmAddBtn').addEventListener('click', addBookmark);
  $('bmUrl').addEventListener('keydown', e => { if (e.key === 'Enter') addBookmark(); });
  document.addEventListener('click', e => {
    const pop = $('bmPop');
    if (!pop.classList.contains('hidden') && !e.target.closest('#bmPop') && !e.target.closest('.bm-add')) pop.classList.add('hidden');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $('bmPop').classList.add('hidden');
      const mc = $('musicCard'); if (mc) mc.classList.add('hidden');
    }
  });
}

/* ---------------- boot ---------------- */
function paintAll(first) {
  applyTheme();
  applyBackground();
  tickClock();
  $('quote').textContent = '“' + quoteForDay(dayOfYear(new Date())) + '”';
  renderFocus();
  renderTasks();
  renderBookmarks(first);
}

(function init() {
  try {
    const v = chrome.runtime.getManifest().version;
    $('wwVer').textContent = 'v' + v; $('wwVer2').textContent = 'v' + v;
  } catch (e) {}

  // 1) FIRST PAINT — fully synchronous, from the snapshot.
  hydrateFromBoot();
  wireFocus(); wireTasks(); wireShuffle(); wireBookmarks(); wireLinks(); wireSearch();
  paintAll(true);
  document.body.classList.add('ready');
  setInterval(tickClock, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tickClock(); });

  // 2) RECONCILE — real data arrives; only touch the DOM if something differs.
  const before = stateSig();
  loadState().then(() => {
    if (stateSig() !== before) paintAll(false);
    saveBoot();
    startWelcome();
  }).catch(() => { startWelcome(); });

  // Today's focus time, and keep it current when a session finishes in another tab.
  store.get(['focusLog']).then(r => { focusToday = (r.focusLog || {})[today] || null; renderFocusStat(); }).catch(() => {});
  try {
    chrome.storage.onChanged.addListener((c, area) => {
      if (area === 'local' && c.focusLog) { focusToday = (c.focusLog.newValue || {})[today] || null; renderFocusStat(); }
    });
  } catch (e) {}

  // 3) History is large — load last; auto-suggested sites fill in when ready.
  store.get(['days']).then(r => {
    daysData = (r && r.days) || {};
    const a = topDomains(daysData, 6);
    if (JSON.stringify(a) !== JSON.stringify(autoCache)) { autoCache = a; renderBookmarks(false); saveBoot(); }
  }).catch(() => {});
})();
