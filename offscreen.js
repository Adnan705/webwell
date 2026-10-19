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

const UI = {
  playing: false, tab: 'radio',
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

function playStation(idx) {
  station = clampStation(idx);
  const st = RADIO_STATIONS[station];
  scPause();
  clearConnectTimer();
  const next = (activeAudio === audioA) ? audioB : audioA;
  if (pendingAudio && pendingAudio !== next) stopEl(pendingAudio);
  pendingAudio = next;
  const wasPlaying = radioPlaying();
  UI.tab = 'radio';
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
  UI.playing = true; UI.tab = 'radio';
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

function scEmbed(url, autoplay) {
  return 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(url) +
    '&color=%23ff5500&auto_play=' + (autoplay ? 'true' : 'false') +
    '&hide_related=false&show_comments=false&show_user=true' +
    '&show_reposts=false&show_teaser=false&visual=false';
}

function loadSC(url) {
  const embed = scEmbed(url, true);
  scExpectPlay = true;
  stopRadio();
  scPlaying = false;
  UI.tab = 'soundcloud'; UI.playing = false;
  UI.title = 'SoundCloud'; UI.sub = 'Connecting…';
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

window.addEventListener('message', e => {
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
    UI.playing = false; UI.title = 'SoundCloud'; UI.sub = 'Paused'; push();
  } else if (m.method === 'finish') {
    scPlaying = false;
    UI.playing = false; UI.title = 'SoundCloud'; UI.sub = 'Finished'; push();
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
      case 'sc-load': loadSC(String(msg.url || '')); done({ ok: true }); break;
      case 'sc-toggle': scToggle(msg.url ? String(msg.url) : ''); done({ ok: true }); break;
      case 'station-next': playStation((station + 1) % RADIO_STATIONS.length); done({ ok: true }); break;
      case 'station-prev': playStation((station - 1 + RADIO_STATIONS.length) % RADIO_STATIONS.length); done({ ok: true }); break;
      case 'sc-next': scCommand('next'); done({ ok: true }); break;
      case 'sc-prev': scCommand('prev'); done({ ok: true }); break;
      default: done({ ok: false }); break;
    }
  } catch (e) { done({ ok: false }); }
  return true;
});
