// WebWell new-tab music UI — a thin controller. Playback itself lives in the
// offscreen player (offscreen.js) so music keeps playing after this tab
// closes. This file renders the pill + panel, keeps the user's saved songs,
// forwards commands, and mirrors the status the player broadcasts.
// (lockin.js relies on: playerSend, playerExists, musicState.)
'use strict';

function $m(id) { return document.getElementById(id); }

const RADIO_STATIONS = [
  { name: 'Groove Salad', desc: 'Ambient beats for focus', art: 'img/lofi-disc.webp' },
  { name: 'Deep Space One', desc: 'Deep ambient', art: 'img/lofi-moon.webp' },
  { name: 'Drone Zone', desc: 'Drone ambient', art: 'img/lofi-night.webp' },
  { name: 'Fluid', desc: 'Chill hip-hop', art: 'img/lofi-sakura.webp' },
  { name: 'Lush', desc: 'Mellow vocals', art: 'img/lofi-girl.webp' }
];
// Offline focus sounds (generated in the offscreen player, no network).
const AMBIENT_SOUNDS = [
  { kind: 'rain', name: 'Rain', desc: 'Steady rainfall', art: 'img/lofi-night.webp' },
  { kind: 'brown', name: 'Soft noise', desc: 'Deep, even hush', art: 'img/lofi-moon.webp' },
  { kind: 'waves', name: 'Waves', desc: 'Slow ocean swell', art: 'img/lofi-disc.webp' }
];
const KIND_LABEL = { radio: 'Radio', ambient: 'Focus sound', soundcloud: 'SoundCloud', spotify: 'Spotify' };
const DEFAULT_ART = 'img/lofi-disc.webp';
const MAX_FAVS = 200;

const SVG = (p, fill) => '<svg viewBox="0 0 24 24" fill="' + (fill ? 'currentColor' : 'none') + '" stroke="' + (fill ? 'none' : 'currentColor') + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
const ICON = {
  heart: SVG('<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>'),
  play: SVG('<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>', true),
  pause: SVG('<rect x="6.5" y="5" width="3.8" height="14" rx="1.2"/><rect x="13.7" y="5" width="3.8" height="14" rx="1.2"/>', true),
  prev: SVG('<path d="M6 5.5h2v13H6zM19 6.2v11.6a.8.8 0 0 1-1.25.66L9.6 12.66a.8.8 0 0 1 0-1.32l8.15-5.8A.8.8 0 0 1 19 6.2z"/>', true),
  next: SVG('<path d="M16 5.5h2v13h-2zM5 6.2v11.6a.8.8 0 0 0 1.25.66l8.15-5.8a.8.8 0 0 0 0-1.32L6.25 5.54A.8.8 0 0 0 5 6.2z"/>', true),
  close: SVG('<path d="M6 6l12 12M18 6L6 18"/>')
};

let musicState = { tab: 'radio', station: 0, ambient: 'rain', scUrl: null, cardOpen: false, last: null, source: 'spotify' };
let uiState = { playing: false, tab: 'radio', key: '', url: '', preview: false, title: '', sub: '', art: DEFAULT_ART };
let favs = [];          // saved songs, newest first  (storage: ntFavs)
let scQueue = null;     // tracks from the last SoundCloud search (storage: scQueue)
let spMeta = {};        // Spotify title/cover cache by link (storage: spMeta)
let lastScResults = [];

/* ---------------- talking to the player ---------------- */
async function ensurePlayer() {
  try { await chrome.runtime.sendMessage({ type: 'ww-ensure-player' }); } catch (e) {}
}
async function playerExists() {
  try { return !!(chrome.offscreen && await chrome.offscreen.hasDocument()); } catch (e) { return false; }
}
// The background worker creates the player; the first command is retried because
// the freshly created page may not have registered its listener yet.
async function playerSend(msg) {
  await ensurePlayer();
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try { return await chrome.runtime.sendMessage(Object.assign({ target: 'ww-player' }, msg)); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 120 * (i + 1))); }
  }
  throw lastErr;
}
const send = msg => playerSend(msg).catch(() => {});
function saveMusicState() { try { chrome.storage.local.set({ ntMusic: musicState }); } catch (e) {} }

/* ---------------- saved songs ---------------- */
const isFav = id => !!id && favs.some(f => f.id === id);
function saveFavs() { try { chrome.storage.local.set({ ntFavs: favs }); } catch (e) {} }
function toggleFav(item) {
  if (!item) return;
  const i = favs.findIndex(f => f.id === item.id);
  if (i >= 0) favs.splice(i, 1); else favs.unshift(item);
  if (favs.length > MAX_FAVS) favs.length = MAX_FAVS;
  saveFavs();
  renderAll();
}
const httpArt = a => (/^https?:/.test(a || '') ? a : '');
const stationItem = i => ({ id: 'radio:' + i, kind: 'radio', idx: i, title: RADIO_STATIONS[i].name, sub: RADIO_STATIONS[i].desc, art: RADIO_STATIONS[i].art });
const ambientItem = s => ({ id: 'ambient:' + s.kind, kind: 'ambient', sound: s.kind, title: s.name, sub: s.desc, art: s.art });
const scItem = t => ({ id: 'sc:' + t.url, kind: 'soundcloud', url: t.url, title: t.title, sub: t.artist || 'SoundCloud', art: t.art || DEFAULT_ART });
const spItem = (url, title, art) => ({ id: 'sp:' + url, kind: 'spotify', url, title: title || 'Spotify', sub: spLabel(url), art: art || DEFAULT_ART });
function spLabel(url) {
  const p = parseSpotify(url);
  return p ? ({ track: 'Song', album: 'Album', playlist: 'Playlist', episode: 'Episode', show: 'Podcast', artist: 'Artist' })[p.type] : 'Spotify';
}
const cleanTitle = s => String(s || '').replace(/^♪ /, '');

// What is loaded in the player right now, as something that can be saved.
function currentItem() {
  const key = uiState.key || '';
  const [k, ...rest] = key.split(':');
  const v = rest.join(':');
  if (k === 'radio' && RADIO_STATIONS[+v]) return stationItem(+v);
  if (k === 'ambient') { const s = AMBIENT_SOUNDS.find(a => a.kind === v); return s ? ambientItem(s) : null; }
  if (k === 'sc' && v) return { id: key, kind: 'soundcloud', url: v, title: cleanTitle(uiState.title) || 'SoundCloud', sub: uiState.sub && !/^(Now playing|Paused|Finished|Connecting)/.test(uiState.sub) ? uiState.sub : 'SoundCloud', art: httpArt(uiState.art) || DEFAULT_ART };
  if (k === 'sp' && v) {
    // Inside a playlist or album the heart saves the SONG that is playing, not the playlist.
    const tr = uiState.track;
    if (tr && tr.url) return { id: 'sp:' + tr.url, kind: 'spotify', url: tr.url, title: tr.title || 'Spotify', sub: tr.artist || 'Song', art: httpArt(tr.art) || httpArt(uiState.art) || (uiState.ctx && uiState.ctx.cover) || DEFAULT_ART };
    return contextItem() || { id: key, kind: 'spotify', url: v, title: cleanTitle(uiState.title) || 'Spotify', sub: spLabel(v), art: httpArt(uiState.art) || (spMeta[v] && spMeta[v].art) || DEFAULT_ART };
  }
  return null;
}
// The playlist or album the current Spotify song belongs to (saved separately from the song).
function contextItem() {
  const c = uiState.tab === 'spotify' && uiState.ctx;
  if (!c || !c.url) return null;
  return { id: 'sp:' + c.url, kind: 'spotify', url: c.url, title: c.name || 'Spotify', sub: spLabel(c.url), art: httpArt(c.cover) || DEFAULT_ART };
}

/* ---------------- permission to reach SoundCloud / Spotify ---------------- */
// Both are optional permissions, asked for the first time someone plays from that service.
const MUSIC_ACCESS = {
  soundcloud: { origins: ['https://*.soundcloud.com/*', 'https://*.sndcdn.com/*'] },
  spotify: { origins: ['https://open.spotify.com/*'] }
};
async function hasMusicAccess(kind) {
  const spec = MUSIC_ACCESS[kind];
  if (!spec) return true;
  try { return await chrome.permissions.contains(spec); } catch (e) { return false; }
}
async function ensureMusicAccess(kind) {
  const spec = MUSIC_ACCESS[kind];
  if (!spec) return true;
  try { return (await chrome.permissions.contains(spec)) || (await chrome.permissions.request(spec)); } catch (e) { return false; }
}

/* ---------------- playing things ---------------- */
async function playItem(item) {
  if (!item) return;
  if ((item.kind === 'soundcloud' || item.kind === 'spotify') && !(await ensureMusicAccess(item.kind))) {
    const name = item.kind === 'spotify' ? 'Spotify' : 'SoundCloud';
    if (item.kind === 'spotify') showSpHint('Allow access to ' + name + ' to play it here.', 'Allow', () => playItem(item));
    else scStatus('Allow access to ' + name + ' to play and search. Press play again and choose Allow.');
    return;
  }
  musicState.last = item;
  if (item.kind === 'radio') { musicState.station = item.idx; musicState.tab = 'radio'; send({ cmd: 'play-station', idx: item.idx }); }
  else if (item.kind === 'ambient') { musicState.ambient = item.sound; send({ cmd: 'ambient-play', kind: item.sound }); }
  else if (item.kind === 'soundcloud') { playSc(item); }
  else if (item.kind === 'spotify') { send({ cmd: 'sp-load', url: item.url, title: item.title, art: httpArt(item.art) }); }
  saveMusicState();
}
function playSc(item) {
  // A track from the search results keeps that list as its playlist; anything else
  // (saved songs, pasted links) steps through the saved list or SoundCloud's own playlist.
  const qi = scQueue ? scQueue.tracks.findIndex(t => t.url === item.url) : -1;
  if (qi >= 0) { scQueue.idx = qi; try { chrome.storage.local.set({ scQueue }); } catch (e) {} }
  else if (scQueue) { scQueue = null; try { chrome.storage.local.remove('scQueue'); } catch (e) {} }
  musicState.scUrl = item.url; musicState.tab = 'soundcloud';
  const a = $m('scOpen'); a.href = item.url; a.classList.remove('hidden');
  send({ cmd: 'sc-load', url: item.url, title: item.title, art: httpArt(item.art) });
}

const TOGGLE_CMD = { radio: 'radio-toggle', ambient: 'ambient-toggle', soundcloud: 'sc-toggle', spotify: 'sp-toggle' };
const NEXT_CMD = { radio: 'station-next', ambient: 'ambient-next', soundcloud: 'sc-next', spotify: 'sp-next' };
const PREV_CMD = { radio: 'station-prev', ambient: 'ambient-prev', soundcloud: 'sc-prev', spotify: 'sp-prev' };

function toggleCurrent() {
  // Nothing loaded yet (fresh browser session): pick up where the user left off.
  if (!uiState.key && !uiState.playing) {
    if (musicState.last) playItem(musicState.last);
    else if (favs.length) playItem(favs[0]);
    else {
      // First press on a fresh install: play one of the built-in sounds at random.
      const pool = AMBIENT_SOUNDS.map(ambientItem).concat(stationItem(musicState.station || 0));
      playItem(pool[Math.floor(Math.random() * pool.length)]);
    }
    return;
  }
  const tab = uiState.tab;
  const payload = { cmd: TOGGLE_CMD[tab] || 'radio-toggle' };
  if (tab === 'radio') payload.idx = /^radio:(\d+)/.test(uiState.key) ? +RegExp.$1 : (musicState.station || 0);
  if (tab === 'ambient') payload.kind = uiState.kind || musicState.ambient || 'rain';
  if (tab === 'soundcloud') payload.url = uiState.url || musicState.scUrl || '';
  if (tab === 'spotify') { payload.url = uiState.url; payload.title = cleanTitle(uiState.title); payload.art = httpArt(uiState.art); }
  send(payload);
}
const stepCurrent = dir => { if (uiState.key || uiState.playing) send({ cmd: (dir > 0 ? NEXT_CMD : PREV_CMD)[uiState.tab] || (dir > 0 ? 'station-next' : 'station-prev') }); };

/* ---------------- rendering ---------------- */
function artSrc(a) { return a || DEFAULT_ART; }

function applyUI(ui) {
  if (!ui) return;
  uiState = Object.assign({ key: '', url: '', preview: false }, ui);
  if (uiState.tab === 'ambient' && uiState.kind) musicState.ambient = uiState.kind;
  renderAll();
}

function setHeart(btn, item) {
  const saved = !!(item && isFav(item.id));
  btn.disabled = !item;
  btn.classList.toggle('is-saved', saved);
  const label = !item ? 'Play something to save it' : saved ? 'Remove from saved songs' : 'Save this song';
  btn.title = label; btn.setAttribute('aria-label', label);
  btn.innerHTML = ICON.heart;
}

function renderNow() {
  const idle = !uiState.key && !uiState.playing;
  const title = idle ? 'Focus music' : (cleanTitle(uiState.title) || 'Music');
  const sub = idle ? (favs.length ? 'Play your saved songs' : 'Tap play for a random sound') : (uiState.sub || '');
  const art = idle ? DEFAULT_ART : artSrc(uiState.art);
  $m('mmTitle').textContent = title; $m('mmSub').textContent = sub; $m('discArtImg').src = art;
  $m('musicTitle').textContent = idle ? 'Nothing playing' : title;
  $m('cardSub').textContent = idle ? (favs.length ? 'Open Saved to play a song' : 'Pick a song below') : sub;
  $m('cardArt').src = art;
  $m('musicMini').classList.toggle('playing', !!uiState.playing);
  const pi = uiState.playing ? ICON.pause : ICON.play;
  $m('cdBtn').innerHTML = pi; $m('musicPlay').innerHTML = pi;
  const item = currentItem();
  setHeart($m('miniHeart'), item); setHeart($m('cardHeart'), item);
  // "From Deep Focus · Save playlist": the playlist can be kept too, separately from the song.
  const ctx = contextItem(), row = $m('cardCtx');
  row.classList.toggle('hidden', !ctx);
  if (ctx) {
    $m('ctxName').textContent = 'From ' + ctx.title;
    const b = $m('ctxSave'), saved = isFav(ctx.id);
    b.classList.toggle('is-saved', saved); b.textContent = saved ? 'Playlist saved ✓' : 'Save ' + (ctx.sub === 'Album' ? 'album' : 'playlist');
  }
  const note = $m('spNote');
  const showNote = uiState.tab === 'spotify' && uiState.preview;
  note.classList.toggle('hidden', !showNote);
  note.classList.toggle('warn', showNote);
  if (showNote) note.textContent = 'Spotify is playing 30-second previews. Sign in at open.spotify.com in this browser to hear full songs.';
}

// One list row: cover, two lines, heart. Clicking the row plays it.
function rowEl(o) {
  const el = document.createElement('div');
  el.className = 'mrow' + (o.active ? ' active' : '');
  el.tabIndex = 0; el.setAttribute('role', 'button');
  const img = document.createElement('img'); img.src = artSrc(o.art); img.alt = ''; img.loading = 'lazy';
  const t = document.createElement('span'); t.className = 'mt';
  const n = document.createElement('span'); n.className = 'mn'; n.textContent = o.name;
  const d = document.createElement('span'); d.className = 'md'; d.textContent = o.desc || '';
  t.append(n, d);
  el.append(img, t);
  if (o.item) {
    const h = document.createElement('button'); h.className = 'mc-ic';
    setHeart(h, o.item); h.disabled = false;
    h.addEventListener('click', e => { e.stopPropagation(); toggleFav(o.item); });
    el.append(h);
  }
  const go = () => o.onPlay();
  el.addEventListener('click', go);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  return el;
}
const isActive = id => uiState.key === id || (!!uiState.track && 'sp:' + uiState.track.url === id);

function renderSaved() {
  const box = $m('savedList'); box.replaceChildren();
  if (!favs.length) {
    const e = document.createElement('div'); e.className = 'mempty';
    e.innerHTML = ICON.heart + 'Tap the heart on any song to keep it here.<br>It will be one click away every time you open a new tab.';
    box.append(e); return;
  }
  favs.forEach(f => box.append(rowEl({
    art: f.art, name: f.title, desc: (KIND_LABEL[f.kind] || '') + (f.sub && f.kind !== 'radio' && f.kind !== 'ambient' ? ' · ' + f.sub : ''),
    active: isActive(f.id), item: f, onPlay: () => playItem(f)
  })));
}
// Sounds: three offline sounds plus one "Lofi radio" row (Next/Back changes the station).
function renderAmbient() {
  const box = $m('ambientList'); box.replaceChildren();
  AMBIENT_SOUNDS.forEach(s => box.append(rowEl({ art: s.art, name: s.name, desc: s.desc + ' · works offline', active: isActive('ambient:' + s.kind), item: ambientItem(s), onPlay: () => playItem(ambientItem(s)) })));
  const cur = /^radio:(\d+)$/.exec(uiState.key || '');
  const idx = cur && RADIO_STATIONS[+cur[1]] ? +cur[1] : Math.min(musicState.station || 0, RADIO_STATIONS.length - 1);
  const st = RADIO_STATIONS[idx];
  box.append(rowEl({ art: st.art, name: 'Lofi radio', desc: st.name + ' · Next and Back change station', active: !!cur, item: stationItem(idx), onPlay: () => playItem(stationItem(idx)) }));
}
function renderScResults() {
  const box = $m('mResults');
  if (box.dataset.status) return;               // a "Searching…" / error message is showing
  box.replaceChildren();
  lastScResults.forEach(t => { const it = scItem(t); box.append(rowEl({ art: t.art, name: t.title, desc: t.artist || 'SoundCloud', active: isActive(it.id), item: it, onPlay: () => playItem(it) })); });
  $m('scHelp').classList.toggle('hidden', lastScResults.length > 0 || !!box.dataset.status);
}
function renderSuggested() {
  const box = $m('spSuggested'); box.replaceChildren();
  SPOTIFY_SUGGESTED.forEach(s => {
    const m = spMeta[s.url] || {};
    const it = spItem(s.url, m.title || s.name, m.art);
    box.append(rowEl({ art: m.art, name: m.title || s.name, desc: 'Playlist', active: isActive(it.id), item: it, onPlay: () => playItem(it) }));
  });
}
function renderAll() { renderNow(); renderSaved(); renderAmbient(); renderScResults(); renderSuggested(); }

/* ---------------- SoundCloud search ---------------- */
// Uses SoundCloud's public track-search endpoint. The client_id is extracted from
// soundcloud.com itself and cached; if a search is rejected the cache is dropped
// and re-extracted once. If extraction fails, paste-a-link (official widget,
// needs no id) keeps working.
async function scClientId(refresh) {
  if (!refresh) {
    try { const s = await chrome.storage.local.get(['scClientId']); if (s.scClientId) return s.scClientId; } catch (e) {}
  }
  try {
    const id = await scExtractClientId();
    try { await chrome.storage.local.set({ scClientId: id }); } catch (e) {}
    return id;
  } catch (e) {}
  throw new Error('client id not found');
}
async function scExtractClientId() {
  const html = await (await fetch('https://soundcloud.com/')).text();
  const idRe = /client_id\s*[:=]\s*"([a-zA-Z0-9]+)"/;
  let m = html.match(idRe);
  if (m) return m[1];
  const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(x => x[1]).filter(s => /\.js(\?|$)/.test(s)).slice(0, 12);
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
  const r = await fetch('https://api-v2.soundcloud.com/search/tracks?q=' + encodeURIComponent(q) + '&client_id=' + encodeURIComponent(id) + '&limit=8');
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
    art: t.artwork_url ? String(t.artwork_url).replace('-large.', '-t500x500.') : DEFAULT_ART
  })).filter(t => t.url);
}
function scStatus(msg) {
  const box = $m('mResults');
  if (!msg) { delete box.dataset.status; return; }
  box.dataset.status = '1';
  box.innerHTML = '<div class="sc-status"></div>'; box.firstChild.textContent = msg;
  $m('scHelp').classList.add('hidden');
}
let scSearching = false;
async function doSongSearch(q) {
  if (!q || scSearching) return;
  if (!(await ensureMusicAccess('soundcloud'))) { scStatus('Allow access to SoundCloud to search. Press Search again and choose Allow.'); return; }
  scSearching = true; scStatus('Searching…');
  try {
    const tracks = await scSearch(q);
    if (!tracks.length) { scStatus('No results. Try different words, or paste a link.'); }
    else {
      scStatus(null);
      lastScResults = tracks;
      // These results become the playlist Next/Back (also in the popup) move through.
      scQueue = { tracks: tracks.map(t => ({ title: t.title, artist: t.artist, url: t.url })), idx: -1 };
      try { chrome.storage.local.set({ scQueue }); } catch (e) {}
      renderScResults();
    }
  } catch (e) { scStatus('Search is unavailable right now. Paste a Spotify or SoundCloud link instead.'); }
  scSearching = false;
}

// Two sources, each with one clear instruction: Spotify takes a link, SoundCloud takes a name.
// Putting the wrong thing in a box redirects to the right place instead of failing.
const isScLink = u => /^https?:\/\/(www\.|m\.|on\.)?soundcloud\.com\//.test(u);
const looksLikeLink = v => /^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^spotify:/i.test(v) || /^(www\.)?(open\.spotify|soundcloud)\.com\//i.test(v);

function setSource(name) {
  musicState.source = name === 'soundcloud' ? 'soundcloud' : 'spotify';
  document.querySelectorAll('.src-btn').forEach(b => b.classList.toggle('on', b.dataset.src === musicState.source));
  $m('src-spotify').classList.toggle('hidden', musicState.source !== 'spotify');
  $m('src-soundcloud').classList.toggle('hidden', musicState.source !== 'soundcloud');
  hideSpHint(); saveMusicState();
}
function showSpHint(text, btnLabel, onBtn) {
  $m('spHintText').textContent = text;
  const b = $m('spHintBtn'); b.textContent = btnLabel || ''; b.classList.toggle('hidden', !btnLabel); b.onclick = onBtn || null;
  $m('spHint').classList.remove('hidden');
}
function hideSpHint() { $m('spHint').classList.add('hidden'); }

async function runSpotifyInput() {
  const box = $m('spInput'), v = box.value.trim();
  if (!v) return;
  hideSpHint();
  if (parseSpotify(v)) { box.value = ''; await playSpotifyLink(v); return; }
  if (isScLink(v)) { box.value = ''; setSource('soundcloud'); playItem(scItem({ url: v, title: 'SoundCloud', artist: '' })); return; }
  if (looksLikeLink(v)) { showSpHint('That doesn’t look like a Spotify song, album or playlist link.'); return; }
  // Words, not a link: Spotify can't be searched here, but SoundCloud can.
  showSpHint('Spotify needs a link. To find a song by name, search SoundCloud.', 'Search SoundCloud', () => {
    box.value = ''; hideSpHint(); setSource('soundcloud'); $m('mSearch').value = v; runSoundcloudInput();
  });
}
async function runSoundcloudInput() {
  const box = $m('mSearch'), v = box.value.trim();
  if (!v) return;
  if (parseSpotify(v)) { box.value = ''; setSource('spotify'); await playSpotifyLink(v); return; }
  if (isScLink(v)) { box.value = ''; playItem(scItem({ url: v, title: 'SoundCloud', artist: '' })); return; }
  if (looksLikeLink(v)) { scStatus('That link isn’t supported. Paste a SoundCloud link here, or type a song name.'); return; }
  await doSongSearch(v);
}
function clearResults() {
  lastScResults = []; scStatus(null); renderScResults();
}
/* ---------------- Spotify ---------------- */
// Title and cover come from Spotify's public oEmbed endpoint: no key, no login.
async function spOembed(url) {
  if (spMeta[url]) return spMeta[url];
  try {
    const r = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(url));
    if (!r.ok) return null;
    const j = await r.json();
    const m = { title: j.title || 'Spotify', art: j.thumbnail_url || '' };
    spMeta[url] = m;
    try { chrome.storage.local.set({ spMeta }); } catch (e) {}
    return m;
  } catch (e) { return null; }
}
async function loadSuggestedMeta() {
  if (!(await hasMusicAccess('spotify'))) return;   // no click here, so never prompt; covers appear once Spotify is allowed
  let changed = false;
  await Promise.all(SPOTIFY_SUGGESTED.filter(s => !spMeta[s.url]).map(async s => { if (await spOembed(s.url)) changed = true; }));
  if (changed) renderSuggested();
}
async function playSpotifyLink(raw) {
  const p = parseSpotify(raw);
  if (!p) return;
  if (!(await ensureMusicAccess('spotify'))) { showSpHint('Allow access to Spotify to play it here.', 'Allow', () => playSpotifyLink(raw)); return; }
  const m = await spOembed(p.url);
  playItem(spItem(p.url, m && m.title, m && m.art));
}

/* ---------------- tabs + card ---------------- */
function switchTab(name) {
  musicState.tab = name;
  document.querySelectorAll('.music-tab').forEach(t => t.classList.toggle('active', t.dataset.mtab === name));
  document.querySelectorAll('.music-pane').forEach(p => p.classList.toggle('hidden', p.id !== 'mtab-' + name));
  if (name === 'music') loadSuggestedMeta();
  saveMusicState();
}
function setCardOpen(open) {
  $m('musicCard').classList.toggle('hidden', !open);
}

async function initMusic() {
  let r = {};
  try { r = await chrome.storage.local.get(['ntMusic', 'ntFavs', 'scQueue', 'spMeta']); } catch (e) {}
  if (r.ntMusic && typeof r.ntMusic === 'object') musicState = Object.assign(musicState, r.ntMusic);
  favs = Array.isArray(r.ntFavs) ? r.ntFavs.filter(f => f && f.id && f.kind) : [];
  scQueue = r.scQueue && Array.isArray(r.scQueue.tracks) ? r.scQueue : null;
  spMeta = r.spMeta && typeof r.spMeta === 'object' ? r.spMeta : {};
  if (musicState.scUrl) { const a = $m('scOpen'); a.href = musicState.scUrl; a.classList.remove('hidden'); }

  $m('cdBtn').addEventListener('click', e => { e.stopPropagation(); toggleCurrent(); });
  $m('musicPlay').addEventListener('click', toggleCurrent);
  $m('mcPrev').innerHTML = ICON.prev; $m('mcNext').innerHTML = ICON.next; $m('musicClose').innerHTML = ICON.close;
  $m('mcPrev').addEventListener('click', () => stepCurrent(-1));
  $m('mcNext').addEventListener('click', () => stepCurrent(1));
  $m('mmOpen').addEventListener('click', () => setCardOpen($m('musicCard').classList.contains('hidden')));
  $m('musicClose').addEventListener('click', () => setCardOpen(false));
  $m('miniHeart').addEventListener('click', e => { e.stopPropagation(); toggleFav(currentItem()); });
  $m('cardHeart').addEventListener('click', () => toggleFav(currentItem()));
  document.querySelectorAll('.music-tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.mtab)));
  document.addEventListener('click', e => {
    if (!$m('musicCard').classList.contains('hidden') && !e.target.closest('#musicWidget')) setCardOpen(false);
  });

  $m('spGo').addEventListener('click', runSpotifyInput);
  $m('spInput').addEventListener('keydown', e => { if (e.key === 'Enter') runSpotifyInput(); });
  $m('spInput').addEventListener('input', hideSpHint);
  $m('mGo').addEventListener('click', runSoundcloudInput);
  $m('mSearch').addEventListener('keydown', e => { if (e.key === 'Enter') runSoundcloudInput(); });
  $m('mSearch').addEventListener('input', e => { if (!e.target.value.trim()) clearResults(); });   // emptied the box: clear the list
  document.querySelectorAll('.src-btn').forEach(b => b.addEventListener('click', () => setSource(b.dataset.src)));
  $m('ctxSave').addEventListener('click', () => toggleFav(contextItem()));
  setSource(musicState.source);

  // Saved songs come first whenever there are any: that is the one-click path.
  // (Older versions had Radio / SoundCloud / Spotify tabs; those map to Sounds / Music now.)
  const remap = { radio: 'ambient', soundcloud: 'music', spotify: 'music' };
  const last = remap[musicState.tab] || musicState.tab;
  switchTab(favs.length ? 'saved' : (['ambient', 'music'].includes(last) ? last : 'ambient'));
  renderAll();

  // Live status from the player, now and whenever it changes.
  chrome.runtime.onMessage.addListener(msg => { if (msg && msg.target === 'ww-player-ui') applyUI(msg.ui); });
  try {
    // Only ask an already-running player; opening a new tab must not start one.
    const st = (await playerExists()) ? await playerSend({ cmd: 'get-state' }) : null;
    if (st && st.ui) { if (typeof st.station === 'number') musicState.station = st.station; applyUI(st.ui); }
  } catch (e) {}
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMusic);
else initMusic();
