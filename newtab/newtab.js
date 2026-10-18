// WebWell new tab page — Momentum-style focus page. 100% local.
'use strict';

/* ---------------- pure helpers (unit-testable) ---------------- */
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

function quoteForDay(dayOfYear) {
  return QUOTES[((dayOfYear % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d - start) / 86400000);
}

/* ---------------- storage ---------------- */
const store = {
  async get(keys) { return chrome.storage.local.get(keys); },
  async set(obj) { return chrome.storage.local.set(obj); },
};

let profile = { name: '', theme: 'dusk', bgMode: 'photos', bgPick: null, pic: '' };
let focus = null;   // { date, text, done }
let tasks = {};     // { [dateKey]: [{ id, text, done }] }
let today = '';
let LANDMARKS = [];

const $ = id => document.getElementById(id);

async function loadState() {
  today = dayKey(Date.now());
  const r = await store.get(['profile', 'focus', 'tasks', 'days', 'categories']);
  if (r.profile) profile = Object.assign(profile, r.profile);
  if (r.focus && r.focus.date === today) focus = r.focus;
  tasks = r.tasks || {};
  daysData = r.days || {};
  document.body.dataset.theme = profile.theme || 'dusk';
  return r;
}

/* ---------------- clock / greeting ---------------- */
function tickClock() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('date').textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const g = greetingForHour(now.getHours());
  $('greet').textContent = profile.name ? g + ', ' + profile.name + '.' : g + '.';
}

/* ---------------- name ---------------- */
function maybeAskName() {
  if (profile.name) return;
  $('nameOverlay').classList.remove('hidden');
  const input = $('nameInput');
  input.focus();
  input.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const v = input.value.trim();
    if (!v) return;
    profile.name = v;
    await store.set({ profile });
    $('nameOverlay').classList.add('hidden');
    tickClock();
  });
}

/* ---------------- focus ---------------- */
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
}

function wireFocus() {
  $('focusInput').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const v = e.target.value.trim();
    if (!v) return;
    focus = { date: today, text: v, done: false };
    await store.set({ focus });
    e.target.value = '';
    renderFocus();
  });
  $('focusCheck').addEventListener('click', async () => {
    if (!focus) return;
    focus.done = !focus.done;
    await store.set({ focus });
    renderFocus();
  });
  $('focusClear').addEventListener('click', async () => {
    focus = null;
    await store.set({ focus: null });
    renderFocus();
    $('focusInput').focus();
  });
}

/* ---------------- tasks ---------------- */
function todaysTasks() {
  return tasks[today] || [];
}

function renderTasks() {
  const list = $('taskList');
  const items = todaysTasks();
  if (!items.length) {
    list.innerHTML = '<div class="task-empty">Nothing yet — what matters today?</div>';
    return;
  }
  list.innerHTML = '';
  for (const t of items) {
    const li = document.createElement('li');
    if (t.done) li.className = 'done';
    const b = document.createElement('button');
    b.className = 'tcheck';
    b.title = 'Mark done';
    b.addEventListener('click', async () => { await toggleTask(t.id); });
    const s = document.createElement('span');
    s.className = 'ttext';
    s.textContent = t.text;
    s.title = t.text;
    const x = document.createElement('button');
    x.className = 'tdel';
    x.textContent = '✕';
    x.title = 'Delete';
    x.addEventListener('click', async () => { await deleteTask(t.id); });
    li.appendChild(b); li.appendChild(s); li.appendChild(x);
    list.appendChild(li);
  }
}

async function saveTasks() {
  await store.set({ tasks });
}

async function addTask(text) {
  const v = text.trim();
  if (!v) return;
  const items = todaysTasks();
  items.push({ id: 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), text: v.slice(0, 120), done: false });
  tasks[today] = items;
  await saveTasks();
  renderTasks();
}

async function toggleTask(id) {
  const items = todaysTasks();
  const t = items.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  await saveTasks();
  renderTasks();
}

async function deleteTask(id) {
  tasks[today] = todaysTasks().filter(x => x.id !== id);
  await saveTasks();
  renderTasks();
}

function wireTasks() {
  $('taskInput').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    await addTask(e.target.value);
    e.target.value = '';
  });
}

/* ---------------- background: landmark photos or gradient ---------------- */
async function loadLandmarks() {
  try {
    const r = await fetch('bg/landmarks.json');
    LANDMARKS = await r.json();
  } catch (e) { LANDMARKS = []; }
}

function pickBgIndex() {
  if (!LANDMARKS.length) return -1;
  if (profile.bgPick && profile.bgPick.date === today &&
      profile.bgPick.idx >= 0 && profile.bgPick.idx < LANDMARKS.length) {
    return profile.bgPick.idx;
  }
  return dayOfYear(new Date()) % LANDMARKS.length;
}

function showLandmark(idx) {
  const lm = LANDMARKS[idx];
  if (!lm) return;
  const photo = $('bgPhoto');
  photo.style.backgroundImage = 'url("bg/' + lm.file + '")';
  // restart the fade-in animation
  photo.style.animation = 'none';
  void photo.offsetWidth;
  photo.style.animation = '';
  $('lmName').textContent = lm.name;
  $('lmFact').textContent = lm.fact;
}

async function applyBackground() {
  const mode = profile.bgMode === 'gradient' ? 'gradient' : 'photos';
  document.body.dataset.bgmode = mode;
  const isPhotos = mode === 'photos' && LANDMARKS.length > 0;
  $('bgPhoto').classList.toggle('hidden', !isPhotos);
  $('bgShade').classList.toggle('hidden', !isPhotos);
  $('landmark').classList.toggle('hidden', !isPhotos);
  $('plainCredit').classList.toggle('hidden', isPhotos);
  if (isPhotos) showLandmark(pickBgIndex());
}

function wireShuffle() {
  $('lmShuffle').addEventListener('click', async () => {
    if (LANDMARKS.length < 2) return;
    let idx = pickBgIndex();
    let next = idx;
    while (next === idx) next = Math.floor(Math.random() * LANDMARKS.length);
    profile.bgPick = { date: today, idx: next };
    await store.set({ profile });
    showLandmark(next);
  });
}
/* ---------------- WebWell mini stats ---------------- */
function scoreOfDay(data, cats) {
  let w = 0, t = 0;
  for (const d of Object.keys(data.domains || {})) {
    const cat = categoryOf(d, cats);
    const secs = data.domains[d];
    w += CATEGORY_META[cat].score * secs;
    t += secs;
  }
  return t ? Math.round(w / t) : 0;
}

async function renderMini(r) {
  const key = dayKey(Date.now());
  const data = (r.days && r.days[key]) || { domains: {}, total: 0 };
  const cats = r.categories || {};
  const el = $('wwMiniText');
  if (!data.total) {
    el.textContent = 'No browsing tracked yet today';
    return;
  }
  const score = scoreOfDay(data, cats);
  el.textContent = 'Today: ' + fmtDurShort(data.total) + ' tracked · score ' + score;
}

/* ---------------- links ---------------- */
function wireLinks() {
  $('dashLink').addEventListener('click', e => {
    e.preventDefault();
    location.href = chrome.runtime.getURL('dashboard/dashboard.html');
  });
  $('settingsLink').addEventListener('click', e => {
    e.preventDefault();
    location.href = chrome.runtime.getURL('dashboard/dashboard.html') + '#settings';
  });
}

/* ---------------- bookmarks: icon dock ---------------- */
let bookmarks = []; // manual [{ id, name, url }] — stored under 'ntBookmarks'
let bmHidden = [];  // auto domains the user hid — stored under 'ntHidden'
let daysData = {};  // dashboard tracking data, for auto top-sites

function bmDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch (e) { return url; }
}

function bmNorm(url) {
  url = url.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'https://' + url;
  return url;
}

// Most-visited domains over the last 7 days of dashboard data (min 5 min total).
function topDomains(days, n) {
  const agg = {};
  const now = Date.now();
  for (let i = 0; i < 7; i++) {
    const d = days[dayKey(now - i * 86400000)];
    if (!d || !d.domains) continue;
    for (const dom in d.domains) agg[dom] = (agg[dom] || 0) + d.domains[dom];
  }
  return Object.keys(agg)
    .filter(dom => agg[dom] >= 300)
    .sort((a, b) => agg[b] - agg[a])
    .slice(0, n);
}

async function loadBookmarks() {
  const r = await store.get(['ntBookmarks', 'ntHidden']);
  bookmarks = Array.isArray(r.ntBookmarks) ? r.ntBookmarks : [];
  bmHidden = Array.isArray(r.ntHidden) ? r.ntHidden : [];
}

function renderBookmarks() {
  const dock = $('bmDock');
  dock.innerHTML = '';
  const seen = new Set(bookmarks.map(b => bmDomain(b.url).toLowerCase()));
  const hidden = new Set(bmHidden.map(d => String(d).toLowerCase()));
  const auto = topDomains(daysData, 6)
    .filter(dom => !seen.has(dom.toLowerCase()) && !hidden.has(dom.toLowerCase()))
    .map(dom => ({ id: 'a:' + dom, name: dom, url: 'https://' + dom, auto: true }));
  const items = bookmarks.map(b => ({ id: b.id, name: b.name, url: b.url, auto: false }))
    .concat(auto).slice(0, 8);
  items.forEach(b => {
    const a = document.createElement('a');
    a.className = 'bm-tile';
    a.href = b.url;
    a.title = b.name;
    const img = document.createElement('img');
    img.alt = '';
    // Multi-source icon chain (see iconSources in lib/time.js): highest-res
    // first, automatic fallback on error, letter tile as last resort.
    const domain = bmDomain(b.url);
    const sources = iconSources(domain);
    img.dataset.domain = domain;
    img.dataset.si = '0';
    img.addEventListener('error', () => {
      evictIconProbe(domain);
      const next = parseInt(img.dataset.si, 10) + 1;
      if (next >= sources.length) {
        img.remove();
        const s = document.createElement('span');
        s.className = 'bm-letter';
        s.textContent = (b.name || '?').charAt(0).toUpperCase();
        a.prepend(s);
        return;
      }
      img.dataset.si = String(next);
      img.src = sources[next];
    });
    img.src = sources[0];
    a.appendChild(img);
    const x = document.createElement('button');
    x.className = 'bm-x';
    x.textContent = '✕';
    x.title = 'Remove bookmark';
    x.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (b.auto) {
        bmHidden.push(bmDomain(b.url));
        store.set({ ntHidden: bmHidden }).then(renderBookmarks);
      } else {
        bookmarks = bookmarks.filter(k => k.id !== b.id);
        store.set({ ntBookmarks: bookmarks }).then(renderBookmarks);
      }
    });
    a.appendChild(x);
    dock.appendChild(a);
  });
  const add = document.createElement('button');
  add.className = 'bm-tile bm-add';
  add.textContent = '+';
  add.title = 'Add bookmark';
  add.addEventListener('click', () => {
    const pop = $('bmPop');
    pop.classList.toggle('hidden');
    if (!pop.classList.contains('hidden')) $('bmUrl').focus();
  });
  dock.appendChild(add);
  // Background pass: swap in the highest-res icon per tile once probing settles.
  upgradeAllIcons(dock);
}

async function addBookmark() {
  const v = $('bmUrl').value.trim();
  if (!v) return;
  const url = bmNorm(v);
  bookmarks.push({ id: 'b' + Date.now().toString(36), name: bmDomain(url), url });
  await store.set({ ntBookmarks: bookmarks });
  $('bmUrl').value = '';
  $('bmPop').classList.add('hidden');
  renderBookmarks();
}

function wireBookmarks() {
  $('bmAddBtn').addEventListener('click', addBookmark);
  $('bmUrl').addEventListener('keydown', e => { if (e.key === 'Enter') addBookmark(); });
  document.addEventListener('click', e => {
    const pop = $('bmPop');
    if (!pop.classList.contains('hidden') && !e.target.closest('#bmPop') && !e.target.closest('.bm-add')) {
      pop.classList.add('hidden');
    }
  });
}

/* ---------------- boot ---------------- */
(async function init() {
  const r = await loadState();
  await loadLandmarks();
  await applyBackground();
  wireShuffle();
  tickClock();
  setInterval(tickClock, 5000);
  $('quote').textContent = '“' + quoteForDay(dayOfYear(new Date())) + '”';
  maybeAskName();
  renderFocus();
  wireFocus();
  renderTasks();
  wireTasks();
  await loadBookmarks();
  renderBookmarks();
  wireBookmarks();
  renderMini(r);
  wireLinks();
})();
