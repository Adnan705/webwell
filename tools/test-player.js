// WebWell player simulation: runs offscreen.js against fake audio, iframes and Spotify pages.
// Run: node tools/test-player.js
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const store = {}; const pushes = []; const posted = { sc: [], sp: [] }; let runtimeListener = null, winListener = null;
const fetched = []; let embedDown = false;

function el(tag, name) {
  return { tag, paused: true, ended: false, currentTime: 0, style: {}, _a: {}, listeners: {},
    addEventListener(e, f) { (this.listeners[e] = this.listeners[e] || []).push(f); },
    removeAttribute(k) { delete this._a[k]; }, setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return this._a[k] || null; },
    load() {}, pause() { this.paused = true; }, play() { this.paused = false; this.currentTime = 1; return Promise.resolve(); }, appendChild() {},
    contentWindow: { postMessage(m, o) { if (name) posted[name].push({ m, o }); } } };
}
const audioA = el('audio'), scF = el('iframe', 'sc'), spF = el('iframe', 'sp');
const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, frequency: { value: 0 }, gain: { value: 0, linearRampToValueAtTime() {}, setValueAtTime() {}, cancelScheduledValues() {} } });

// What Spotify's public embed page returns (shape verified against the live site).
const PL = 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ';
const TR = ['2i6veFyjDIodH3hgpkwxK6', '51vxIDnFJOzotXLQTrwV29', '06mrX3LFC65jmule6OhXrC'];
const embedPage = e => '<html><script id="__NEXT_DATA__" type="application/json">' + JSON.stringify({ props: { pageProps: { state: { data: { entity: e } } } } }) + '</script></html>';
const PAGES = {
  'playlist/37i9dQZF1DWZeKCadgRdKQ': { type: 'playlist', name: 'Deep Focus', coverArt: { sources: [{ url: 'https://i.scdn.co/image/deepfocus' }] },
    trackList: [{ uri: 'spotify:track:' + TR[0], title: 'The Present', subtitle: 'Cherries & Daydreams', isPlayable: true }, { uri: 'spotify:track:' + TR[1], title: 'Present Memory', subtitle: 'Køsk Skriner', isPlayable: true },
      { uri: 'spotify:track:' + TR[2], title: 'Hidden Treasure', subtitle: 'Starstrum', isPlayable: true }, { uri: 'spotify:episode:zzz', title: 'Not a song', subtitle: '', isPlayable: true }] },
  'track/4cOdK2wGLETKBW3PvgPWqT': { type: 'track', name: 'Never Gonna Give You Up', title: 'Never Gonna Give You Up', uri: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT', artists: [{ name: 'Rick Astley' }], duration: 213573 },
  'album/1DFixLWuPkv3KT3TnV35m3': { type: 'album', name: 'Emotion (Deluxe)', subtitle: 'Carly Rae Jepsen', coverArt: { sources: [{ url: 'https://i.scdn.co/image/emotion' }] },
    trackList: [{ uri: 'spotify:track:7xGfFoTpQ2E7fRF5lN10tr', title: 'Run Away With Me', subtitle: 'Carly Rae Jepsen', isPlayable: true }, { uri: 'spotify:track:8yGfFoTpQ2E7fRF5lN10ts', title: 'Emotion', subtitle: 'Carly Rae Jepsen', isPlayable: true }] }
};
const fakeFetch = async url => {
  fetched.push(url);
  let m = url.match(/^https:\/\/open\.spotify\.com\/embed\/(.+)$/);
  if (m) { if (embedDown || !PAGES[m[1]]) return { ok: false }; return { ok: true, text: async () => embedPage(PAGES[m[1]]) }; }
  m = url.match(/oembed\?url=(.+)$/);
  if (m) { const id = decodeURIComponent(m[1]).split('/').pop(); return { ok: true, json: async () => ({ thumbnail_url: 'https://i.scdn.co/cover-' + id }) }; }
  return { ok: false };
};
const ctx = { console, setTimeout, clearTimeout, URL, JSON, Promise, fetch: fakeFetch,
  document: { getElementById: id => id === 'radioAudio' ? audioA : id === 'spFrame' ? spF : scF, createElement: t => el(t), body: { appendChild() {} } },
  window: { addEventListener(t, f) { if (t === 'message') winListener = f; } },
  AudioContext: function () { this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; this.destination = {}; this.createBuffer = () => ({ getChannelData: () => new Float32Array(8) }); this.createBufferSource = node; this.createGain = node; this.createBiquadFilter = node; this.createOscillator = node; this.resume = () => Promise.resolve(); },
  chrome: { runtime: { getURL: p => 'chrome-extension://x/' + p, sendMessage(m) { pushes.push(m.ui || m); return Promise.resolve(); }, onMessage: { addListener(f) { runtimeListener = f; } } },
    storage: { local: { get: () => Promise.resolve(JSON.parse(JSON.stringify(store))), set: o => { Object.assign(store, JSON.parse(JSON.stringify(o))); return Promise.resolve(); } } } } };
vm.createContext(ctx);
vm.runInContext(R('lib/spotify.js').replace(/if \(typeof module[\s\S]*$/, ''), ctx);
vm.runInContext(R('offscreen.js'), ctx);

const send = (cmd, extra) => new Promise(r => runtimeListener(Object.assign({ target: 'ww-player', cmd }, extra || {}), {}, v => r(v)));
const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
const ui = () => pushes.filter(p => p && p.title !== undefined).pop();
const fromSp = data => winListener({ origin: 'https://open.spotify.com', data });
const trackSrc = id => 'https://open.spotify.com/embed/track/' + id + '?utm_source=webwell&theme=0';
const J = JSON.stringify;
let n = 0; const ok = (name, fn) => { try { fn(); n++; console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; } };
const upd = (o, uri) => fromSp({ type: 'playback_update', payload: Object.assign({ isPaused: false, isBuffering: false, duration: 25287, position: 0, playingURI: 'spotify:track:' + (uri || TR[0]) }, o) });

(async () => {
  // ---------- a playlist: real song names, one song at a time ----------
  await send('sp-load', { url: PL + '?si=zzz', title: 'Deep Focus', art: 'https://i.scdn.co/x.jpg' }); await tick(60);
  ok('a playlist plays its first SONG (not the playlist page)', () => assert.strictEqual(spF._a.src, trackSrc(TR[0])));
  ok('the UI shows the song name and artist, not the playlist name', () => { const u = ui(); assert.strictEqual(u.title, 'The Present'); assert.strictEqual(u.track.artist, 'Cherries & Daydreams'); assert.strictEqual(u.track.url, 'https://open.spotify.com/track/' + TR[0]); });
  ok('the playlist is remembered separately for "Save playlist"', () => { const u = ui(); assert.strictEqual(u.ctx.name, 'Deep Focus'); assert.strictEqual(u.ctx.url, PL); assert.strictEqual(u.key, 'sp:' + PL); });
  ok('non-song entries (episodes) are left out', () => assert(!fetched.some(u => u.includes('zzz'))));
  await tick(60); ok('the song cover is looked up and shown', () => { assert.strictEqual(ui().art, 'https://i.scdn.co/cover-' + TR[0]); assert.strictEqual(ui().track.art, 'https://i.scdn.co/cover-' + TR[0]); });
  fromSp({ type: 'ready' }); await tick();
  ok('"ready" starts playback with one toggle', () => assert.strictEqual(J(posted.sp.map(p => p.m)), J([{ command: 'toggle' }])));
  upd({}); await tick();
  ok('preview shows the artist, not just "Now playing"', () => { assert.strictEqual(ui().sub, 'Cherries & Daydreams · 30 s preview'); assert.strictEqual(ui().preview, true); });
  upd({ duration: 213000, position: 3000 }); await tick();
  ok('full-length playback shows just the artist', () => { assert.strictEqual(ui().sub, 'Cherries & Daydreams'); assert.strictEqual(ui().preview, false); });
  winListener({ origin: 'https://evil.example', data: { type: 'playback_update', payload: { isPaused: true } } }); await tick();
  ok('messages from other origins are ignored', () => assert.strictEqual(ui().playing, true));

  // ---------- Next / Back inside the playlist ----------
  await send('sp-next'); await tick(60);
  ok('Next moves to the next SONG in the playlist', () => { assert.strictEqual(spF._a.src, trackSrc(TR[1])); assert.strictEqual(ui().title, 'Present Memory'); assert.strictEqual(ui().track.artist, 'Køsk Skriner'); assert.strictEqual(ui().ctx.name, 'Deep Focus'); });
  await send('sp-prev'); await tick(60);
  ok('Back goes to the previous song', () => assert.strictEqual(ui().title, 'The Present'));
  await send('sp-prev'); await tick(60);
  ok('Back from the first song wraps to the last', () => assert.strictEqual(ui().title, 'Hidden Treasure'));
  await send('sp-next'); await tick(60);
  ok('Next from the last wraps to the first', () => assert.strictEqual(ui().title, 'The Present'));

  // ---------- moving on by itself ----------
  fromSp({ type: 'ready' }); upd({ duration: 100, position: 0 }, TR[0]);
  await tick(1700);
  ok('when a song ends, the next one starts on its own', () => { assert.strictEqual(ui().title, 'Present Memory'); assert.strictEqual(spF._a.src, trackSrc(TR[1])); });
  fromSp({ type: 'ready' }); upd({ isPaused: true, duration: 600, position: 600 }, TR[1]);
  await tick(700);
  ok('...also when the player pauses itself at the very end', () => assert.strictEqual(ui().title, 'Hidden Treasure'));
  upd({ duration: 200000, position: 5000 }, TR[2]); await tick();
  upd({ isPaused: true, duration: 200000, position: 5000 }, TR[2]); await tick(1500);
  ok('a user pausing mid-song does NOT skip ahead', () => { assert.strictEqual(ui().title, 'Hidden Treasure'); assert.strictEqual(ui().playing, false); });

  // ---------- other sources and controls ----------
  await send('sp-toggle'); await tick();
  ok('sp-toggle sends a toggle', () => assert.strictEqual(J(posted.sp.pop().m), J({ command: 'toggle' })));
  upd({ duration: 200000, position: 5000 }, TR[2]); await tick();
  await send('ambient-play', { kind: 'rain' }); await tick();
  ok('starting another sound pauses Spotify and clears the song', () => { assert.strictEqual(J(posted.sp.pop().m), J({ command: 'pause' })); assert.strictEqual(ui().key, 'ambient:rain'); assert.strictEqual(ui().track, null); });
  const bad = await send('sp-load', { url: 'https://evil.example/track/4cOdK2wGLETKBW3PvgPWqT' });
  ok('non-Spotify links are refused', () => assert.strictEqual(bad.ok, false));
  const goodLink = await send('sp-load', { url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=x' }); await tick(60);
  ok('a single song loads with its artist, with no playlist line', () => { assert(goodLink.ok); assert.strictEqual(ui().title, 'Never Gonna Give You Up'); assert.strictEqual(ui().track.artist, 'Rick Astley'); assert.strictEqual(ui().ctx, null); });
  fromSp({ type: 'ready' }); upd({ duration: 100, position: 0 }, '4cOdK2wGLETKBW3PvgPWqT'); await tick(1700);
  ok('a single song does not jump anywhere when it ends', () => assert.strictEqual(ui().title, 'Never Gonna Give You Up'));

  // ---------- saved items: single songs step through the saved list ----------
  const A = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', B = 'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3';
  store.ntFavs = [{ id: 'sp:' + A, kind: 'spotify', url: A, title: 'A' }, { id: 'x', kind: 'radio', idx: 1, title: 'R' }, { id: 'sp:' + B, kind: 'spotify', url: B, title: 'B' }, { id: 'sp:' + PL, kind: 'spotify', url: PL, title: 'C' }];
  await send('sp-load', { url: A }); await tick(60);
  await send('sp-next'); await tick(80);
  ok('from a saved single song, Next opens the next saved item (radio entries skipped)', () => { assert.strictEqual(ui().key, 'sp:' + B); assert.strictEqual(ui().title, 'Run Away With Me'); });
  await send('sp-next'); await tick(80);
  ok('...and inside that album Next moves to its second song', () => assert.strictEqual(ui().title, 'Emotion'));

  // ---------- fallback when Spotify's page can't be read ----------
  const UNREADABLE = 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn';   // no page for this one: reading its track list fails
  await send('sp-load', { url: UNREADABLE, title: 'lofi beats' }); await tick(80);
  ok('if the track list is unavailable, Spotify\'s own playlist player is used', () => { assert.strictEqual(spF._a.src, 'https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn?utm_source=webwell&theme=0'); assert.strictEqual(ui().track, null); assert.strictEqual(ui().title, 'lofi beats'); });
  fromSp({ type: 'ready' }); await tick();
  ok('...and it still starts', () => assert.strictEqual(J(posted.sp.pop().m), J({ command: 'toggle' })));
  embedDown = false;

  // ---------- SoundCloud / radio keep working ----------
  const S1 = 'https://soundcloud.com/a/one', S2 = 'https://soundcloud.com/b/two';
  store.ntFavs = [{ id: 'sc:' + S1, kind: 'soundcloud', url: S1, title: 'One' }, { id: 'sc:' + S2, kind: 'soundcloud', url: S2, title: 'Two' }]; delete store.scQueue;
  await send('sc-load', { url: S1, title: 'One' }); await tick();
  ok('sc-load shows the saved title and key', () => { assert.strictEqual(ui().title, 'One'); assert.strictEqual(ui().key, 'sc:' + S1); assert.strictEqual(ui().track, null); });
  await send('sc-next'); await tick(); ok('SoundCloud steps through saved songs when there is no search queue', () => assert.strictEqual(ui().key, 'sc:' + S2));
  winListener({ origin: 'https://w.soundcloud.com', data: JSON.stringify({ method: 'pause' }) }); await tick();
  ok('pausing SoundCloud keeps the track title', () => { assert.strictEqual(ui().title, 'Two'); assert.strictEqual(ui().sub, 'Paused'); });
  await send('sp-load', { url: PL }); await tick(60); fromSp({ type: 'ready' }); upd({ duration: 200000, position: 1 }, TR[0]); await tick();
  await send('stop-all'); await tick();
  ok('stop-all pauses Spotify', () => { assert.strictEqual(J(posted.sp.pop().m), J({ command: 'pause' })); assert.strictEqual(ui().playing, false); });
  await send('radio-toggle', { idx: 2 }); await tick();
  ok('radio sets its saved-song key', () => assert.strictEqual(ui().key, 'radio:2'));
  console.log(n + ' behaviours verified'); process.exit(process.exitCode || 0);
})();
