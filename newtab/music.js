// WebWell new-tab music UI — a thin controller. Playback itself lives in the
// offscreen player (offscreen.js) so music keeps playing after this tab
// closes. This file renders the UI, searches SoundCloud, forwards commands,
// and mirrors the status the player broadcasts.
'use strict';

function $m(id) { return document.getElementById(id); }

// Display copy for the station list (playback lives offscreen).
const RADIO_STATIONS = [
  { name: 'Groove Salad', desc: 'Ambient beats for focus', art: 'img/lofi-disc.webp' },
  { name: 'Deep Space One', desc: 'Deep ambient', art: 'img/lofi-moon.webp' },
  { name: 'Drone Zone', desc: 'Drone ambient', art: 'img/lofi-night.webp' },
  { name: 'Fluid', desc: 'Chill hip-hop', art: 'img/lofi-sakura.webp' },
  { name: 'Lush', desc: 'Mellow vocals', art: 'img/lofi-girl.webp' }
];

let musicState = { tab: 'radio', station: 0, scUrl: null, cardOpen: false };
// Last UI snapshot from the player (drives the disc spin + station highlight).
let uiState = { playing: false, tab: 'radio', title: 'Pick a track below', sub: 'Search or paste a SoundCloud link', art: 'img/lofi-disc.webp' };

// FIX: the background worker creates the player (no create races between tabs),
// and the first command is retried because the freshly created page may not
// have registered its listener yet ("Receiving end does not exist").
async function ensurePlayer() {
  try { await chrome.runtime.sendMessage({ type: 'ww-ensure-player' }); } catch (e) {}
}
async function playerExists() {
  try { return !!(chrome.offscreen && await chrome.offscreen.hasDocument()); } catch (e) { return false; }
}

async function playerSend(msg) {
  await ensurePlayer();
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      return await chrome.runtime.sendMessage(Object.assign({ target: 'ww-player' }, msg));
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 120 * (i + 1))); }
  }
  throw lastErr;
}

function saveMusicState() {
  try { chrome.storage.local.set({ ntMusic: musicState }); } catch (e) {}
}

// ---- status application (UI only; the player is the source of truth) ----
function applyUI(ui) {
  if (!ui) return;
  uiState = ui;
  $m('cdDisc').classList.toggle('spinning', !!ui.playing);
  $m('cdBtn').classList.toggle('playing', !!ui.playing);
  $m('discArtImg').src = ui.art || 'img/lofi-disc.webp';
  $m('mmTitle').textContent = ui.title || 'Pick a track below';
  $m('mmSub').textContent = ui.sub || '';
  $m('musicTitle').textContent = String(ui.title || '').replace(/^♪ /, '');
  $m('musicPlay').textContent = ui.playing ? '⏸' : '▶';
  renderStations();
}

function toggleCurrent() {
  // FIX: act on what is actually playing, not on which tab the card is showing
  // (the disc button used to start SoundCloud while a radio station was playing).
  const tab = uiState.playing ? uiState.tab : musicState.tab;
  if (tab === 'soundcloud') {
    if (!musicState.scUrl) {
      const box = $m('scSearch');
      if (box) { box.focus(); box.classList.add('nudge'); setTimeout(() => box.classList.remove('nudge'), 900); }
      return;
    }
    playerSend({ cmd: 'sc-toggle', url: musicState.scUrl }).catch(() => {});
  }
  else playerSend({ cmd: 'radio-toggle', idx: musicState.station || 0 }).catch(() => {});
}

// ---- station list ----
function renderStations() {
  const box = $m('musicStations');
  if (!box) return;
  box.innerHTML = '';
  RADIO_STATIONS.forEach((st, i) => {
    const b = document.createElement('button');
    b.className = 'music-station' + (i === (musicState.station || 0) && uiState.tab === 'radio' && uiState.playing ? ' active' : '');
    const art = document.createElement('img');
    art.className = 'ms-art';
    art.src = st.art;
    art.alt = '';
    const meta = document.createElement('span');
    meta.className = 'ms-meta';
    const nm = document.createElement('span');
    nm.className = 'ms-name';
    nm.textContent = st.name;
    const ds = document.createElement('span');
    ds.className = 'ms-desc';
    ds.textContent = st.desc;
    meta.appendChild(nm);
    meta.appendChild(ds);
    b.appendChild(art);
    b.appendChild(meta);
    b.addEventListener('click', () => {
      musicState.station = i;
      musicState.tab = 'radio';
      saveMusicState();
      switchTab('radio');
      playerSend({ cmd: 'play-station', idx: i }).catch(() => {});
    });
    box.appendChild(b);
  });
}

// ---- SoundCloud search ----
// Uses SoundCloud's public track-search endpoint. The client_id is extracted
// from soundcloud.com itself (same technique as public downloaders) and
// cached; if a search is rejected the cache is dropped and re-extracted once.
// FIX: removed the hard-coded fallback id — SoundCloud rotates ids, so a baked-in
// one silently dies. If extraction fails, search says so and the paste-a-link
// box (official widget, needs no id) keeps working.
async function scClientId(refresh) {
  if (!refresh) {
    try {
      const s = await chrome.storage.local.get(['scClientId']);
      if (s.scClientId) return s.scClientId;
    } catch (e) {}
  }
  try {
    const id = await scExtractClientId();
    try { await chrome.storage.local.set({ scClientId: id }); } catch (e) {}
    return id;
  } catch (e) {}
  throw new Error('client id not found');
}

// SoundCloud keeps its public client_id in the JS bundles rather than the
// homepage HTML, so scan both (same technique public downloaders use).
async function scExtractClientId() {
  const html = await (await fetch('https://soundcloud.com/')).text();
  const idRe = /client_id\s*[:=]\s*"([a-zA-Z0-9]+)"/;
  let m = html.match(idRe);
  if (m) return m[1];
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
    .map(x => x[1]).filter(s => /\.js(\?|$)/.test(s)).slice(0, 12);
  for (const src of srcs) {
    try {
      const jsUrl = src.startsWith('http') ? src : 'https://soundcloud.com' + (src.startsWith('/') ? src : '/' + src);
      const js = await (await fetch(jsUrl)).text();
      m = js.match(idRe);
      if (m) return m[1];
    } catch (e) {}
  }
  throw new Error('client id not found');
}

async function scSearch(q, retried) {
  const id = await scClientId(!!retried);
  const url = 'https://api-v2.soundcloud.com/search/tracks?q=' + encodeURIComponent(q) +
    '&client_id=' + encodeURIComponent(id) + '&limit=8';
  const r = await fetch(url);
  if ((r.status === 401 || r.status === 403) && !retried) {
    try { await chrome.storage.local.remove(['scClientId']); } catch (e) {}
    return scSearch(q, true);
  }
  if (!r.ok) throw new Error('search http ' + r.status);
  const j = await r.json();
  return (j.collection || []).map(t => ({
    title: t.title || 'Untitled',
    artist: (t.user && t.user.username) || '',
    url: t.permalink_url,
    art: t.artwork_url ? String(t.artwork_url).replace('-large.', '-t500x500.') : 'img/lofi-disc.webp'
  })).filter(t => t.url);
}

function renderScResults(tracks) {
  const box = $m('scResults');
  box.innerHTML = '';
  tracks.forEach(t => {
    const b = document.createElement('button');
    b.className = 'sc-result';
    const img = document.createElement('img');
    img.className = 'sc-result-art';
    img.src = t.art;
    img.alt = '';
    img.loading = 'lazy';
    const meta = document.createElement('span');
    meta.className = 'sc-result-meta';
    const nm = document.createElement('span');
    nm.className = 'sc-result-name';
    nm.textContent = t.title;
    const ar = document.createElement('span');
    ar.className = 'sc-result-artist';
    ar.textContent = t.artist || 'SoundCloud';
    meta.appendChild(nm);
    meta.appendChild(ar);
    b.appendChild(img);
    b.appendChild(meta);
    b.addEventListener('click', () => scLoadUrl(t.url));
    box.appendChild(b);
  });
}

let scSearching = false;
async function doScSearch() {
  const q = $m('scSearch').value.trim();
  const box = $m('scResults');
  if (!q || scSearching) return;
  scSearching = true;
  box.innerHTML = '<div class="sc-status">Searching…</div>';
  try {
    const tracks = await scSearch(q);
    if (!tracks.length) {
      box.innerHTML = '<div class="sc-status">No results — try different words, or paste a link below.</div>';
    } else {
      renderScResults(tracks);
    }
  } catch (e) {
    box.innerHTML = '<div class="sc-status">Search is unavailable right now — paste a SoundCloud link below instead.</div>';
  }
  scSearching = false;
}

function scLoadUrl(u) {
  musicState.scUrl = u;
  musicState.tab = 'soundcloud';
  saveMusicState();
  const a = $m('scOpen');
  a.href = u;
  a.classList.remove('hidden');
  switchTab('soundcloud');
  playerSend({ cmd: 'sc-load', url: u }).catch(() => {});
}

function scLoadLink(raw) {
  const u = String(raw || '').trim();
  if (!/^https?:\/\/(www\.|m\.)?soundcloud\.com\//.test(u) && !/^https?:\/\/on\.soundcloud\.com\//.test(u)) {
    $m('scUrl').placeholder = 'That link didn’t look like SoundCloud…';
    $m('scUrl').value = '';
    return;
  }
  scLoadUrl(u);
}

// ---- tabs + card ----
function switchTab(name) {
  musicState.tab = name;
  document.querySelectorAll('.music-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.mtab === name));
  $m('mtab-radio').classList.toggle('hidden', name !== 'radio');
  $m('mtab-soundcloud').classList.toggle('hidden', name !== 'soundcloud');
  saveMusicState();
}

function setCardOpen(open) {
  musicState.cardOpen = open;
  $m('musicCard').classList.toggle('hidden', !open);
  saveMusicState();
}

async function initMusic() {
  try {
    const r = await chrome.storage.local.get(['ntMusic']);
    if (r.ntMusic && typeof r.ntMusic === 'object') {
      musicState = Object.assign(musicState, r.ntMusic);
    }
  } catch (e) {}

  document.querySelectorAll('.music-tab').forEach(t =>
    t.addEventListener('click', () => switchTab(t.dataset.mtab)));
  switchTab(musicState.tab === 'soundcloud' ? 'soundcloud' : 'radio');

  $m('cdBtn').addEventListener('click', e => {
    e.stopPropagation();
    toggleCurrent();
  });
  $m('mmOpen').addEventListener('click', () => setCardOpen(true));
  $m('musicClose').addEventListener('click', () => setCardOpen(false));
  $m('musicPlay').addEventListener('click', () => toggleCurrent());

  $m('scGo').addEventListener('click', doScSearch);
  $m('scSearch').addEventListener('keydown', e => {
    if (e.key === 'Enter') doScSearch();
  });
  $m('scSave').addEventListener('click', () => scLoadLink($m('scUrl').value));
  $m('scUrl').addEventListener('keydown', e => {
    if (e.key === 'Enter') scLoadLink($m('scUrl').value);
  });
  if (musicState.scUrl) {
    $m('scUrl').value = musicState.scUrl;
    const a = $m('scOpen');
    a.href = musicState.scUrl;
    a.classList.remove('hidden');
  }

  renderStations();

  // Live status from the player, now and whenever it changes.
  chrome.runtime.onMessage.addListener(msg => {
    if (msg && msg.target === 'ww-player-ui') applyUI(msg.ui);
  });
  try {
    // FIX: only ask an already-running player. Opening a new tab used to spawn
    // the offscreen page (and warm a SoundCloud iframe) even if you never press play.
    const st = (await playerExists()) ? await playerSend({ cmd: 'get-state' }) : null;
    if (st && st.ui) {
      if (typeof st.station === 'number') musicState.station = st.station;
      applyUI(st.ui);
    }
  } catch (e) {}
  setCardOpen(!!musicState.cardOpen);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMusic);
} else {
  initMusic();
}
