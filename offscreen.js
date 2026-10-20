// WebWell player engine — runs in an offscreen document so music keeps
// playing after the new tab closes. This is the SOLE owner of playback
// (radio + SoundCloud). The new tab is a thin UI: it sends commands here
// and mirrors the status this file broadcasts. `playing` is only ever true
// when audio is actually playing (set from media/widget events, never
// assumed).
'use strict';

const RADIO_STATIONS = [
  { name: 'Groove Salad', desc: 'Ambient beats for focus', url: 'https://ice1.somafm.com/groovesalad-128-mp3', art: 'newtab/img/lofi-disc.webp' },
  { name: 'Deep Space One', desc: 'Deep ambient', url: 'https://ice1.somafm.com/deepspaceone-128-mp3', art: 'newtab/img/lofi-moon.webp' },
  { name: 'Drone Zone', desc: 'Drone ambient', url: 'https://ice1.somafm.com/dronezone-128-mp3', art: 'newtab/img/lofi-night.webp' },
  { name: 'Fluid', desc: 'Chill hip-hop', url: 'https://ice1.somafm.com/fluid-128-mp3', art: 'newtab/img/lofi-sakura.webp' },
  { name: 'Lush', desc: 'Mellow vocals', url: 'https://ice1.somafm.com/lush-128-mp3', art: 'newtab/img/lofi-girl.webp' }
];
const artUrl = p => (/^https?:/.test(p) ? p : chrome.runtime.getURL(p));

// `key` identifies what is loaded ('radio:2', 'ambient:rain', 'sc:<url>', 'sp:<url>'),
// so the UI can show a filled heart for saved songs. `preview` is true when
// Spotify is only playing its 30-second previews (not signed in).
const UI = {
  playing: false, tab: 'radio', key: '', url: '', preview: false, track: null, ctx: null,
  title: 'Lofi Focus Radio', sub: 'Tap play to start',
  art: artUrl('newtab/img/lofi-disc.webp')
};
let station = 0;

function push() {
  // FIX: sendMessage returns a promise; with no UI page open it rejects, and the
  // old try/catch could not catch that (console spam "Receiving end does not exist").
  try {
    const p = chrome.runtime.sendMessage({ target: 'ww-player-ui', ui: Object.assign({}, UI), station });
    if (p && p.catch) p.catch(() => {});
  } catch (e) {}
}

// ---------------- radio ----------------
// Two audio elements: when switching stations the new stream loads in the
// idle element while the old one keeps playing, then they swap the moment
// the new stream is audible — no silence gap while connecting.
const audioA = document.getElementById('radioAudio');
const audioB = document.createElement('audio');
audioB.preload = 'none';
document.body.appendChild(audioB);
let activeAudio = audioA;
let pendingAudio = null;
let activeStation = 0;
let connectTimer = null;

function isElPlaying(el) {
  return !!el && !el.paused && !el.ended && el.currentTime > 0;
}
function radioPlaying() {
  return isElPlaying(activeAudio) || (pendingAudio && isElPlaying(pendingAudio));
}
function stopEl(el) {
  try { el.pause(); el.removeAttribute('src'); el.load(); } catch (e) {}
}
function clearConnectTimer() {
  if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
}
function clampStation(i) {
  return Math.max(0, Math.min(RADIO_STATIONS.length - 1, i | 0));
}

function onStationError(st) {
  clearConnectTimer();
  if (pendingAudio) { stopEl(pendingAudio); pendingAudio = null; }
  if (isElPlaying(activeAudio)) {
    // New station failed — the old one is still going, fall back to it.
    const cur = RADIO_STATIONS[activeStation];
    station = activeStation;
    UI.playing = true; UI.tab = 'radio';
    UI.title = '♪ ' + cur.name; UI.sub = cur.desc; UI.art = artUrl(cur.art);
  } else {
    UI.playing = false; UI.tab = 'radio';
    UI.title = st.name; UI.sub = 'Unreachable — try another'; UI.art = artUrl(st.art);
  }
  push();
}

// ---------------- ambient (offline) ----------------
// Rain, soft noise and waves are generated with Web Audio, so Locked In has
// calm sound with no network and nothing to download.
const AMBIENT = {
  rain:  { name: 'Rain', desc: 'Steady rainfall', art: 'newtab/img/lofi-night.webp' },
  brown: { name: 'Soft noise', desc: 'Deep, even hush', art: 'newtab/img/lofi-moon.webp' },
  waves: { name: 'Waves', desc: 'Slow ocean swell', art: 'newtab/img/lofi-disc.webp' }
};
const AMBIENT_KINDS = Object.keys(AMBIENT);
let actx = null, ambient = null; // { kind, master, nodes[] }

function noiseBuffer(ctx, kind) {
  const len = ctx.sampleRate * 6;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'rain') {           // pink-ish noise (Paul Kellet's economy filter)
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      } else {                         // brown noise: integrated white noise
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
    }
  }
  return buf;
}

function ambientStop(fade) {
  if (!ambient) return;
  const a = ambient; ambient = null;
  const t = actx.currentTime;
  try {
    a.master.gain.cancelScheduledValues(t);
    a.master.gain.setValueAtTime(a.master.gain.value, t);
    a.master.gain.linearRampToValueAtTime(0, t + (fade ? 0.8 : 0.05));
  } catch (e) {}
  setTimeout(() => a.nodes.forEach(n => { try { n.stop && n.stop(); n.disconnect(); } catch (e) {} }), fade ? 900 : 80);
}

function ambientPlay(kind) {
  if (!AMBIENT[kind]) kind = 'rain';
  stopRadio(); scPause(); spPause();
  ambientStop(false);
  if (!actx) actx = new AudioContext();
  if (actx.state === 'suspended') actx.resume().catch(() => {});
  const src = actx.createBufferSource();
  src.buffer = noiseBuffer(actx, kind === 'rain' ? 'rain' : 'brown');
  src.loop = true;
  const master = actx.createGain();
  master.gain.value = 0;
  const nodes = [src];
  let tail = src;
  if (kind === 'rain') {
    const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 380;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    tail.connect(hp); hp.connect(lp); tail = lp; nodes.push(hp, lp);
  } else if (kind === 'waves') {
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const swell = actx.createGain(); swell.gain.value = 0.55;
    const lfo = actx.createOscillator(); lfo.frequency.value = 0.09;
    const depth = actx.createGain(); depth.gain.value = 0.42;
    lfo.connect(depth); depth.connect(swell.gain); lfo.start();
    tail.connect(lp); lp.connect(swell); tail = swell; nodes.push(lp, swell, lfo, depth);
  } else {
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    tail.connect(lp); tail = lp; nodes.push(lp);
  }
  tail.connect(master); master.connect(actx.destination);
  src.start();
  const t = actx.currentTime;
  master.gain.linearRampToValueAtTime(kind === 'rain' ? 0.5 : 0.6, t + 1.5);
  ambient = { kind, master, nodes };
  const meta = AMBIENT[kind];
  UI.playing = true; UI.tab = 'ambient'; UI.kind = kind; UI.key = 'ambient:' + kind; UI.url = ''; UI.preview = false; UI.track = null; UI.ctx = null;
  UI.title = '♪ ' + meta.name; UI.sub = meta.desc; UI.art = artUrl(meta.art);
  push();
}

function ambientIdle() {
  UI.playing = false; UI.tab = 'ambient';
  UI.title = 'Focus sounds'; UI.sub = 'Paused';
  push();
}

function stopAll() {
  ambientStop(true);
  stopRadio(); scPause(); spPause();
  UI.playing = false; UI.sub = 'Paused';
  if (UI.title) UI.title = String(UI.title).replace(/^♪ /, '');
  push();
}

function playStation(idx) {
  station = clampStation(idx);
  const st = RADIO_STATIONS[station];
  ambientStop(true);
  scPause(); spPause();
  clearConnectTimer();
  const next = (activeAudio === audioA) ? audioB : audioA;
  if (pendingAudio && pendingAudio !== next) stopEl(pendingAudio);
  pendingAudio = next;
  const wasPlaying = radioPlaying();
  UI.tab = 'radio'; UI.key = 'radio:' + station; UI.url = ''; UI.preview = false; UI.track = null; UI.ctx = null;
  UI.title = st.name;
  UI.sub = wasPlaying ? 'Switching…' : 'Connecting…';
  UI.art = artUrl(st.art);
  // Keep the disc spinning while the old stream is still audible.
  push();
  try { next.src = st.url; } catch (e) {}
  let pr = null;
  try { pr = next.play(); } catch (e) {}
  if (pr && pr.catch) pr.catch(() => onStationError(st));
  // If the new stream stalls without playing/erroring, say so after 12s.
  connectTimer = setTimeout(() => {
    if (pendingAudio === next && !isElPlaying(next)) onStationError(st);
  }, 12000);
}

function stopRadio() {
  clearConnectTimer();
  stopEl(activeAudio);
  if (pendingAudio) { stopEl(pendingAudio); pendingAudio = null; }
}

function toggleRadio() {
  if (radioPlaying()) {
    stopRadio();
    const st = RADIO_STATIONS[station];
    UI.playing = false; UI.tab = 'radio';
    UI.title = 'Lofi Focus Radio'; UI.sub = 'Tap play to start'; UI.art = artUrl(st.art);
    push();
  } else {
    playStation(station);
  }
}

function onElPlaying(el) {
  const st = RADIO_STATIONS[station];
  if (el === pendingAudio) {
    // New station is audible — swap it in, silence the old one.
    const old = activeAudio;
    activeAudio = el;
    activeStation = station;
    pendingAudio = null;
    clearConnectTimer();
    stopEl(old);
  }
  UI.playing = true; UI.tab = 'radio'; UI.key = 'radio:' + station;
  UI.title = '♪ ' + st.name; UI.sub = st.desc; UI.art = artUrl(st.art);
  push();
}

function onElError(el) {
  const st = RADIO_STATIONS[station];
  if (el === pendingAudio || el === activeAudio) onStationError(st);
}

[audioA, audioB].forEach(el => {
  el.addEventListener('playing', () => onElPlaying(el));
  el.addEventListener('error', () => onElError(el));
});

// ---------------- soundcloud ----------------
// Uses SoundCloud's official widget postMessage protocol: commands are
// {"method":..., "value":...} posted to the iframe, and the widget replies
// with the same shape carrying event names.
const scFrame = document.getElementById('scFrame');
let scPlaying = false;
// True only while the frame holds the loaded SoundCloud widget. Commands
// sent earlier would hit the wrong origin and throw (see Errors page).
let scFrameReady = false;
scFrame.addEventListener('load', () => { scFrameReady = true; });

function scCommand(method, value) {
  if (!scFrameReady) return;
  try {
    scFrame.contentWindow.postMessage(
      JSON.stringify({ method: method, value: value == null ? null : value }),
      'https://w.soundcloud.com');
  } catch (e) {}
}
function scSubscribe() {
  ['play', 'pause', 'finish', 'error'].forEach(ev => scCommand('addEventListener', ev));
}
function scPause() {
  scPlaying = false;
  try { scCommand('pause'); } catch (e) {}
}

let scExpectPlay = false;
let currentScUrl = '';

// The tracks from the user's last search act as a playlist, so Next/Back (and
// moving on when a track ends) work even for single tracks. SoundCloud's own
// next/prev only does anything inside a real playlist.
async function scQueueStep(dir) {
  const r = await chrome.storage.local.get(['scQueue', 'ntFavs', 'ntMusic']);
  const q = r.scQueue;
  let tracks = null, i = -1;
  // 1) the user's last search, 2) their saved SoundCloud songs
  if (q && Array.isArray(q.tracks) && q.tracks.length >= 2) {
    i = q.tracks.findIndex(t => t.url === currentScUrl);
    if (i < 0 && Number.isInteger(q.idx)) i = q.idx;
    if (i >= 0) tracks = q.tracks;
  }
  if (!tracks) {
    const saved = (Array.isArray(r.ntFavs) ? r.ntFavs : []).filter(f => f && f.kind === 'soundcloud' && f.url);
    const j = saved.findIndex(f => f.url === currentScUrl);
    if (saved.length >= 2 && j >= 0) { tracks = saved; i = j; }
  }
  if (!tracks) return false;
  const n = (i + dir + tracks.length) % tracks.length;
  if (q) { q.idx = n; await chrome.storage.local.set({ scQueue: q }); }
  await chrome.storage.local.set({ ntMusic: Object.assign({}, r.ntMusic || {}, { scUrl: tracks[n].url, tab: 'soundcloud' }) });
  loadSC(tracks[n].url, { title: tracks[n].title, art: tracks[n].art });
  return true;
}
function scStep(dir) {
  scQueueStep(dir).then(ok => { if (!ok) scCommand(dir > 0 ? 'next' : 'prev'); }).catch(() => scCommand(dir > 0 ? 'next' : 'prev'));
}

function scEmbed(url, autoplay) {
  return 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
    '&color=%23ff5500&auto_play=' + (autoplay ? 'true' : 'false') +
    '&hide_related=false&show_comments=false&show_user=true' +
    '&show_reposts=false&show_teaser=false&visual=false';
}

function loadSC(url, meta) {
  const embed = scEmbed(url, true);
  currentScUrl = url;
  scExpectPlay = true;
  ambientStop(true);
  stopRadio(); spPause();
  scPlaying = false;
  UI.tab = 'soundcloud'; UI.playing = false; UI.key = 'sc:' + url; UI.url = url; UI.preview = false; UI.track = null; UI.ctx = null;
  UI.title = (meta && meta.title) || 'SoundCloud'; UI.sub = 'Connecting…';
  if (meta && meta.art) UI.art = meta.art;
  push();
  // removeAttribute + set forces a reload even when picking the same track
  scFrameReady = false;
  scFrame.removeAttribute('src');
  scFrame.setAttribute('src', embed);
}

function scToggle(url) {
  // If this player was recreated (Chrome closes idle offscreen docs) the frame
  // has no track loaded — reload the last one instead of silently doing nothing.
  if (!scFrame.getAttribute('src') && url) { loadSC(url); return; }
  if (scPlaying) scCommand('pause');
  else scCommand('play');
}

// ---------------- spotify ----------------
// Spotify's embedded player, driven with its own postMessage protocol:
// we send {command: 'toggle' | 'pause' | 'resume'}, it posts back
// {type: 'ready' | 'playback_update' | 'playback_started', payload}.
// It cannot skip tracks or tell us song names, so for playlists and albums WebWell
// reads the track list from Spotify's public embed page and plays one song at a time:
// that gives real song names, working Next/Back, and moving on when a song ends.
// If the track list can't be read, it falls back to Spotify's own playlist player.
const spFrame = document.getElementById('spFrame');
const SP_ORIGIN = 'https://open.spotify.com';
const SP_ADVANCE_SLACK = 1200;     // ms after the reported end of a song before moving on
let spUrl = '', spExpectPlay = false, spPlaying = false, spSig = '';
let spCtx = null;                  // { p, ent, idx }  — the playlist/album/song being played
let spLoadToken = 0, spTimer = null;
const spEntityCache = {}, spArt = {};

function spCommand(c) {
  try { spFrame.contentWindow.postMessage(c, SP_ORIGIN); } catch (e) {}
}
function spClearTimer() { if (spTimer) { clearTimeout(spTimer); spTimer = null; } }
function spPause() {
  spClearTimer();
  if (spUrl && spPlaying) spCommand({ command: 'pause' });
  spPlaying = false;
}

// Names, artists and the track list come from the same page Spotify's own embed uses.
async function spEntity(p) {
  if (spEntityCache[p.url]) return spEntityCache[p.url];
  try {
    const r = await fetch(SP_ORIGIN + '/embed/' + p.type + '/' + p.id);
    if (!r.ok) return null;
    const m = (await r.text()).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return null;
    const e = JSON.parse(m[1]).props.pageProps.state.data.entity;
    if (!e) return null;
    const src = e.coverArt && e.coverArt.sources && e.coverArt.sources[0];
    const tracks = e.type === 'track'
      ? [{ uri: e.uri, title: e.title || e.name || 'Spotify', artist: (e.artists || []).map(a => a.name).join(', '), duration: e.duration }]
      : (e.trackList || []).filter(t => t && /^spotify:track:[A-Za-z0-9]+$/.test(t.uri) && t.isPlayable !== false)
          .map(t => ({ uri: t.uri, title: t.title || 'Spotify', artist: t.subtitle || '', duration: t.duration }));
    const ent = { type: e.type || p.type, name: e.name || e.title || '', cover: (src && src.url) || '', tracks };
    spEntityCache[p.url] = ent;
    return ent;
  } catch (err) { return null; }
}
async function spFetchArt(uri) {
  if (spArt[uri] !== undefined) return;
  spArt[uri] = '';
  try {
    const id = uri.split(':')[2];
    const r = await fetch(SP_ORIGIN + '/oembed?url=' + encodeURIComponent(SP_ORIGIN + '/track/' + id));
    const j = r.ok ? await r.json() : null;
    spArt[uri] = (j && j.thumbnail_url) || '';
  } catch (e) {}
  const cur = spCtx && spCtx.ent.tracks[spCtx.idx];
  if (cur && cur.uri === uri && spArt[uri] && UI.tab === 'spotify') {
    UI.art = spArt[uri]; if (UI.track) UI.track.art = spArt[uri]; push();
  }
}

function spPlayAt(idx) {
  const c = spCtx, n = c.ent.tracks.length;
  idx = ((idx % n) + n) % n; c.idx = idx;
  const t = c.ent.tracks[idx], id = t.uri.split(':')[2];
  spClearTimer();
  spExpectPlay = true; spPlaying = false; spSig = '';
  UI.track = { url: SP_ORIGIN + '/track/' + id, title: t.title, artist: t.artist, art: spArt[t.uri] || '' };
  UI.ctx = n > 1 ? { url: c.p.url, name: c.ent.name, type: c.p.type, cover: c.ent.cover } : null;
  UI.tab = 'spotify'; UI.playing = false; UI.preview = false;
  UI.title = t.title; UI.sub = 'Connecting…'; UI.art = spArt[t.uri] || c.ent.cover || UI.art;
  push();
  spFrame.removeAttribute('src');
  spFrame.setAttribute('src', spotifyEmbedUrl({ type: 'track', id }));
  spFetchArt(t.uri);
}

async function spLoad(url, meta) {
  const p = parseSpotify(url);
  if (!p) return false;
  ambientStop(true); stopRadio(); scPause(); spClearTimer();
  const token = ++spLoadToken;
  spUrl = p.url; spExpectPlay = true; spPlaying = false; spSig = ''; spCtx = null;
  UI.tab = 'spotify'; UI.playing = false; UI.key = 'sp:' + p.url; UI.url = p.url; UI.preview = false; UI.track = null; UI.ctx = null;
  UI.title = (meta && meta.title) || 'Spotify'; UI.sub = 'Connecting…';
  if (meta && meta.art) UI.art = meta.art;
  push();
  const ent = await spEntity(p);
  if (token !== spLoadToken) return true;          // the user picked something else meanwhile
  if (ent && ent.tracks.length) { spCtx = { p, ent, idx: 0 }; spPlayAt(0); }
  else { spFrame.removeAttribute('src'); spFrame.setAttribute('src', spotifyEmbedUrl(p)); }   // fallback: Spotify's own player
  return true;
}
function spToggle(url, meta) {
  // The player document may have been recreated: nothing is loaded, so load the last item.
  if (!spFrame.getAttribute('src')) { if (url) spLoad(url, meta); return; }
  spCommand({ command: 'toggle' });
}
function onSpotifyMessage(d) {
  if (!d || typeof d !== 'object') return;
  if (d.type === 'ready') {
    if (spExpectPlay) { spExpectPlay = false; spCommand({ command: 'toggle' }); }
  } else if (d.type === 'playback_update' && d.payload) {
    const pl = d.payload;
    const playing = !pl.isPaused;
    // A track that reports ~30 s is Spotify's preview clip: the user isn't signed in.
    const isTrack = /^spotify:track:/.test(pl.playingURI || '');
    const preview = isTrack && pl.duration > 0 && pl.duration <= 31000 ? true : (pl.duration > 31000 ? false : UI.preview);
    const sig = [playing, !!pl.isBuffering, preview, pl.playingURI].join('|');
    spPlaying = playing;
    // Moving on when a song ends: use the length the player reports, and also catch it
    // pausing itself at the very end. Playlists loop, so focus music never just stops.
    if (spCtx && spCtx.ent.tracks.length > 1) {
      spClearTimer();
      if (playing && pl.duration > 0) {
        spTimer = setTimeout(() => spNext(1), Math.max(300, pl.duration - pl.position + SP_ADVANCE_SLACK));
      } else if (!playing && pl.duration > 0 && pl.position >= pl.duration - 1500) {
        spTimer = setTimeout(() => spNext(1), 400);
      }
    }
    if (sig === spSig) return;          // the update arrives every second; only push changes
    spSig = sig;
    UI.tab = 'spotify'; UI.playing = playing; UI.preview = preview;
    const who = UI.track && UI.track.artist;
    UI.sub = !playing ? 'Paused' : pl.isBuffering ? 'Buffering…' : (who ? who + (preview ? ' · 30 s preview' : '') : (preview ? 'Preview · 30 s' : 'Now playing'));
    push();
  }
}

// Next/Back: inside a playlist or album, move to the next song; otherwise step through
// the user's saved Spotify items (or the suggested playlists, if one of those is playing).
function spNext(dir) {
  if (spCtx && spCtx.ent.tracks.length > 1) { spPlayAt(spCtx.idx + dir); return Promise.resolve(true); }
  return spStep(dir);
}
async function spStep(dir) {
  const r = await chrome.storage.local.get(['ntFavs', 'spMeta']);
  const meta = r.spMeta || {};
  let list = (Array.isArray(r.ntFavs) ? r.ntFavs : []).filter(f => f && f.kind === 'spotify' && f.url)
    .map(f => ({ url: f.url, title: f.title, art: f.art }));
  const cur = (UI.track && UI.track.url) || spUrl;
  let i = list.findIndex(t => t.url === cur || t.url === spUrl);
  if (list.length < 2 || i < 0) {
    list = SPOTIFY_SUGGESTED.map(s => ({ url: s.url, title: (meta[s.url] && meta[s.url].title) || s.name, art: meta[s.url] && meta[s.url].art }));
    i = list.findIndex(t => t.url === spUrl);
    if (i < 0) return false;
  }
  const n = (i + dir + list.length) % list.length;
  return spLoad(list[n].url, list[n]);
}
window.addEventListener('message', e => {
  if (e.origin === SP_ORIGIN) { onSpotifyMessage(e.data); return; }
  if (e.origin !== 'https://w.soundcloud.com') return;
  let m;
  try { m = JSON.parse(e.data); } catch (err) { return; }
  if (!m || typeof m.method !== 'string') return;
  if (m.method === 'ready') {
    scSubscribe();
    if (scExpectPlay) { scExpectPlay = false; scCommand('play'); }
  } else if (m.method === 'play') {
    scPlaying = true;
    UI.playing = true; UI.tab = 'soundcloud';
    UI.title = '♪ SoundCloud'; UI.sub = 'Now playing';
    push();
    scCommand('getCurrentSound');
  } else if (m.method === 'getCurrentSound' && m.value) {
    const v = m.value;
    const art = v.artwork_url ? String(v.artwork_url).replace('-large.', '-t500x500.') : null;
    UI.playing = true; UI.tab = 'soundcloud';
    UI.title = '♪ ' + (v.title || 'SoundCloud');
    UI.sub = (v.user && v.user.username) || 'Now playing';
    if (art) UI.art = art;
    push();
  } else if (m.method === 'pause') {
    scPlaying = false;
    UI.playing = false; UI.sub = 'Paused'; push();      // keep the track title
  } else if (m.method === 'finish') {
    scPlaying = false;
    UI.playing = false; UI.sub = 'Finished'; push();
    scQueueStep(1).catch(() => {});   // carry on to the next searched track, if there is one
  } else if (m.method === 'error') {
    scPlaying = false;
    UI.playing = false; UI.title = 'SoundCloud'; UI.sub = 'Player error — try another'; push();
  }
});

// Warm SoundCloud's player shell at startup so the first track doesn't
// pay the full app-load cost when the user picks it.
(async () => {
  try {
    const r = await chrome.storage.local.get(['ntMusic']);
    const last = r && r.ntMusic && r.ntMusic.scUrl;
    if (last && !scFrame.getAttribute('src')) {
      scFrame.setAttribute('src', scEmbed(last, false));
    }
  } catch (e) {}
})();

// ---------------- message router ----------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== 'ww-player') return;
  let answered = false;
  const done = v => { if (!answered) { answered = true; try { sendResponse(v); } catch (e) {} } };
  try {
    switch (msg.cmd) {
      case 'get-state': done({ ui: Object.assign({}, UI), station }); break;
      case 'radio-toggle':
        // after a recreate, `station` resets to 0 — restore the user's last pick
        if (msg.idx != null && !radioPlaying()) station = clampStation(msg.idx);
        toggleRadio(); done({ ok: true }); break;
      case 'play-station': playStation(msg.idx | 0); done({ ok: true }); break;
      case 'sc-load': loadSC(String(msg.url || ''), { title: msg.title, art: msg.art }); done({ ok: true }); break;
      case 'sp-load': { const okLink = !!parseSpotify(String(msg.url || '')); if (okLink) spLoad(String(msg.url), { title: msg.title, art: msg.art }); done({ ok: okLink }); break; }
      case 'sp-toggle': spToggle(msg.url ? String(msg.url) : '', { title: msg.title, art: msg.art }); done({ ok: true }); break;
      case 'sp-next': spNext(1).catch(() => {}); done({ ok: true }); break;
      case 'sp-prev': spNext(-1).catch(() => {}); done({ ok: true }); break;
      case 'sc-toggle': scToggle(msg.url ? String(msg.url) : ''); done({ ok: true }); break;
      case 'station-next': playStation((station + 1) % RADIO_STATIONS.length); done({ ok: true }); break;
      case 'station-prev': playStation((station - 1 + RADIO_STATIONS.length) % RADIO_STATIONS.length); done({ ok: true }); break;
      case 'sc-next': scStep(1); done({ ok: true }); break;
      case 'sc-prev': scStep(-1); done({ ok: true }); break;
      case 'ambient-play': ambientPlay(String(msg.kind || 'rain')); done({ ok: true }); break;
      case 'ambient-toggle':
        if (ambient) { ambientStop(true); ambientIdle(); } else ambientPlay(String(msg.kind || UI.kind || 'rain'));
        done({ ok: true }); break;
      case 'ambient-next':
      case 'ambient-prev': {
        const i = AMBIENT_KINDS.indexOf(UI.kind || 'rain');
        const step = msg.cmd === 'ambient-next' ? 1 : -1;
        ambientPlay(AMBIENT_KINDS[(i + step + AMBIENT_KINDS.length) % AMBIENT_KINDS.length]);
        done({ ok: true }); break;
      }
      case 'stop-all': stopAll(); done({ ok: true }); break;
      default: done({ ok: false }); break;
    }
  } catch (e) { done({ ok: false }); }
  return true;
});
