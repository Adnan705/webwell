// WebWell music-screen test: loads newtab.html + music.js in jsdom with a fake chrome API.
// Needs jsdom (not part of the extension):  npm install jsdom --prefix %TEMP%\wwjs   then:  node tools/test-music-ui.js
const { JSDOM } = (() => { try { return require('jsdom'); } catch (e) { return require(require('path').join(process.env.TEMP || '/tmp', 'wwjs/node_modules/jsdom')); } })();
const fs = require('fs'), assert = require('assert');
const ROOT = require('path').resolve(__dirname, '..') + '/';
let n = 0, fail = 0;
const ok = (name, fn) => { try { fn(); n++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); } };
const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const same = (a, b) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b));

const SC_TRACKS = [
  { title: 'Song A', permalink_url: 'https://soundcloud.com/x/a', user: { username: 'Artist X' }, artwork_url: 'https://i1.sndcdn.com/a-large.jpg' },
  { title: 'Song B', permalink_url: 'https://soundcloud.com/y/b', user: { username: 'Artist Y' }, artwork_url: null }];

async function boot({ storage = {}, offscreenUI = null, oembed = {}, scDown = false } = {}) {
  const html = fs.readFileSync(ROOT + 'newtab/newtab.html', 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'chrome-extension://x/newtab/newtab.html' });
  const w = dom.window, store = JSON.parse(JSON.stringify(storage)), sent = [], fetched = [];
  let uiListener = null;
  w.chrome = {
    runtime: { getURL: p => 'chrome-extension://x/' + p,
      sendMessage: m => { if (m && m.type === 'ww-ensure-player') return Promise.resolve({ ok: true }); sent.push(m); return Promise.resolve(m && m.cmd === 'get-state' && offscreenUI ? { ui: offscreenUI, station: 0 } : { ok: true }); },
      onMessage: { addListener: f => { uiListener = f; } } },
    storage: { local: { get: () => Promise.resolve(JSON.parse(JSON.stringify(store))), set: o => { Object.assign(store, JSON.parse(JSON.stringify(o))); return Promise.resolve(); }, remove: k => { [].concat(k).forEach(x => delete store[x]); return Promise.resolve(); } } },
    offscreen: { hasDocument: () => Promise.resolve(!!offscreenUI) }
  };
  w.fetch = async url => {
    fetched.push(url);
    if (url === 'https://soundcloud.com/') return { ok: true, text: async () => 'window.x={client_id:"testid123"}' };
    if (url.startsWith('https://api-v2.soundcloud.com/search/tracks')) return scDown ? { ok: false, status: 500 } : { ok: true, json: async () => ({ collection: SC_TRACKS }) };
    const m = Object.entries(oembed).find(([k]) => url.includes(encodeURIComponent(k)));
    return m ? { ok: true, json: async () => m[1] } : { ok: false };
  };
  w.eval(['lib/spotify.js', 'newtab/music.js'].map(f => fs.readFileSync(ROOT + f, 'utf8').replace(/if \(typeof module[\s\S]*$/, '')).join('\n;\n'));
  await tick(60);
  const $ = id => w.document.getElementById(id);
  return { w, $, store, sent, fetched, ui: ui => uiListener({ target: 'ww-player-ui', ui }), click: el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })),
    type: (v, enter, id = 'mSearch') => { const i = $(id); i.value = v; i.dispatchEvent(new w.Event('input', { bubbles: true })); if (enter) i.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } };
}
const tabs = t => [...t.w.document.querySelectorAll('.music-tab')].map(b => b.dataset.mtab);
const activeTab = t => t.w.document.querySelector('.music-tab.active').dataset.mtab;
const visiblePanes = t => [...t.w.document.querySelectorAll('.music-pane:not(.hidden)')].map(p => p.id);
const hidden = el => el.classList.contains('hidden');

(async () => {
  // ---------- first run ----------
  let t = await boot();
  ok('only three tabs: Saved, Sounds, Music', () => same(tabs(t), ['saved', 'ambient', 'music']));
  ok('first run opens on Sounds (the easiest start)', () => { assert.strictEqual(activeTab(t), 'ambient'); same(visiblePanes(t), ['mtab-ambient']); });
  ok('Saved explains how to save songs', () => assert(t.$('savedList').textContent.includes('Tap the heart')));
  ok('idle pill invites the user to pick something', () => { assert.strictEqual(t.$('mmTitle').textContent, 'Focus music'); assert.strictEqual(t.$('mmSub').textContent, 'Pick something to play'); });
  ok('heart is disabled when nothing is playing', () => assert.strictEqual(t.$('miniHeart').disabled, true));
  ok('panel starts closed, opens from the pill, closes on outside click', () => { assert(hidden(t.$('musicCard'))); t.click(t.$('mmOpen')); assert(!hidden(t.$('musicCard'))); t.click(t.w.document.body); assert(hidden(t.$('musicCard'))); });
  t.click(t.$('mmOpen'));
  let rows = [...t.$('ambientList').querySelectorAll('.mrow')];
  ok('Sounds = Rain, Soft noise, Waves and one Lofi radio row', () => { assert.strictEqual(rows.length, 4); same(rows.map(r => r.querySelector('.mn').textContent), ['Rain', 'Soft noise', 'Waves', 'Lofi radio']); });
  ok('the radio row names its station and explains Next/Back', () => assert(rows[3].textContent.includes('Groove Salad') && rows[3].textContent.includes('Next and Back')));
  t.click(rows[0]); await tick(); ok('tapping Rain plays it', () => same(t.sent.pop(), { target: 'ww-player', cmd: 'ambient-play', kind: 'rain' }));
  t.click(rows[3]); await tick(); ok('tapping Lofi radio plays the station', () => same(t.sent.pop(), { target: 'ww-player', cmd: 'play-station', idx: 0 }));
  t.click(rows[0].querySelector('button')); await tick();
  ok('hearting a sound saves it without playing it', () => { assert.strictEqual(t.store.ntFavs[0].id, 'ambient:rain'); assert(!t.sent.some(m => m.cmd === 'ambient-play' && false)); });
  t.click(t.$('ambientList').querySelectorAll('.mrow')[3].querySelector('button')); await tick();
  ok('hearting Lofi radio saves the station', () => assert(t.store.ntFavs.some(f => f.id === 'radio:0' && f.title === 'Groove Salad')));
  ok('saved rows show a filled heart', () => assert(t.$('ambientList').querySelectorAll('.mrow')[0].querySelector('button').classList.contains('is-saved')));
  t.click(t.$('ambientList').querySelectorAll('.mrow')[0].querySelector('button')); await tick();
  ok('hearting again removes it', () => assert(!t.store.ntFavs.some(f => f.id === 'ambient:rain')));

  // ---------- Music tab: two clearly labelled sources ----------
  t = await boot({ oembed: { 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT': { title: 'Never Gonna Give You Up', thumbnail_url: 'https://i.scdn.co/t.jpg' } } });
  t.click(t.w.document.querySelector('[data-mtab="music"]')); await tick(80);
  const srcOn = () => t.w.document.querySelector('.src-btn.on').dataset.src;
  ok('Music opens on Spotify, with a visible Spotify | SoundCloud switch', () => { assert.strictEqual(srcOn(), 'spotify'); assert(!hidden(t.$('src-spotify'))); assert(hidden(t.$('src-soundcloud'))); same([...t.w.document.querySelectorAll('.src-btn')].map(b => b.textContent), ['Spotify', 'SoundCloud']); });
  ok('Spotify says it takes a LINK and explains how to copy one', () => { assert(t.$('src-spotify').textContent.includes('Paste a Spotify link')); assert(t.$('spHow').textContent.includes('Copy link')); assert(t.$('spInput').placeholder.includes('open.spotify.com')); });
  ok('5 suggested playlists, with names and covers fetched without a key', () => { assert.strictEqual(t.$('spSuggested').querySelectorAll('.mrow').length, 5); assert.strictEqual(t.fetched.filter(u => u.startsWith('https://open.spotify.com/oembed?url=')).length, 5); });
  t.click(t.$('spSuggested').querySelectorAll('.mrow')[1]); await tick();
  ok('tapping a suggestion plays it', () => { const m = t.sent.pop(); assert.strictEqual(m.cmd, 'sp-load'); assert(m.url.includes('37i9dQZF1DWWQRwui0ExPn')); });
  t.type('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc', true, 'spInput'); await tick(80);
  ok('a pasted Spotify link plays with its looked-up title and cover, and the box clears', () => { const m = t.sent.filter(x => x.cmd === 'sp-load').pop(); assert.strictEqual(m.url, 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'); assert.strictEqual(m.title, 'Never Gonna Give You Up'); assert.strictEqual(m.art, 'https://i.scdn.co/t.jpg'); assert.strictEqual(t.$('spInput').value, ''); });
  const spLoads = () => t.sent.filter(x => x.cmd === 'sp-load').length;
  t.type('lofi hip hop', true, 'spInput'); await tick(40);
  ok('words in the Spotify box explain what to do instead, and do not play anything', () => { const h = t.$('spHint'); assert(!hidden(h)); assert(h.textContent.includes('Spotify needs a link') && h.textContent.includes('Search SoundCloud')); assert.strictEqual(t.$('spHintBtn').textContent, 'Search SoundCloud'); });
  t.click(t.$('spHintBtn')); await tick(150);
  ok('...one tap moves the words to SoundCloud and searches', () => { assert.strictEqual(srcOn(), 'soundcloud'); assert.strictEqual(t.$('mSearch').value, 'lofi hip hop'); assert(t.fetched.some(u => u.includes('/search/tracks?q=lofi%20hip%20hop'))); assert.strictEqual(t.$('mResults').querySelectorAll('.mrow').length, 2); assert(hidden(t.$('spHint'))); });
  const res = [...t.$('mResults').querySelectorAll('.mrow')];
  ok('SoundCloud says it takes a NAME; results show title and artist', () => { assert(t.$('src-soundcloud').textContent.includes('Search SoundCloud')); assert(res[0].textContent.includes('Song A') && res[0].textContent.includes('Artist X')); });
  ok('the "type a name" help hides while results are showing', () => assert(hidden(t.$('scHelp'))));
  t.click(res[0].querySelector('button')); await tick();
  ok('a result can be hearted straight away', () => { const f = t.store.ntFavs[0]; assert.strictEqual(f.id, 'sc:https://soundcloud.com/x/a'); assert.strictEqual(f.title, 'Song A'); assert.strictEqual(f.sub, 'Artist X'); });
  ok('the results become the Next/Back playlist', () => assert.strictEqual(t.store.scQueue.tracks.length, 2));
  t.click(res[1]); await tick();
  ok('clicking a result plays it', () => { const m = t.sent.pop(); assert.strictEqual(m.cmd, 'sc-load'); assert.strictEqual(m.url, 'https://soundcloud.com/y/b'); assert.strictEqual(m.title, 'Song B'); });
  ok('"Open in SoundCloud" appears for that track', () => { assert(!hidden(t.$('scOpen'))); assert.strictEqual(t.$('scOpen').href, 'https://soundcloud.com/y/b'); });
  t.type(''); await tick();
  ok('emptying the search box clears the list and brings the help back', () => { assert.strictEqual(t.$('mResults').children.length, 0); assert(!hidden(t.$('scHelp'))); });
  const before = spLoads();
  t.type('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', true); await tick(80);
  ok('a Spotify link pasted into the SoundCloud box switches to Spotify and plays it', () => { assert.strictEqual(srcOn(), 'spotify'); assert.strictEqual(spLoads(), before + 1); assert.strictEqual(t.$('mSearch').value, ''); });
  const searches = () => t.fetched.filter(u => u.includes('/search/tracks')).length, sBefore = searches();
  t.type('https://soundcloud.com/some/track', true, 'spInput'); await tick(40);
  ok('a SoundCloud link pasted into the Spotify box switches to SoundCloud and plays it', () => { assert.strictEqual(srcOn(), 'soundcloud'); const m = t.sent.pop(); assert.strictEqual(m.cmd, 'sc-load'); assert.strictEqual(m.url, 'https://soundcloud.com/some/track'); assert.strictEqual(searches(), sBefore); });
  t.type('https://example.com/watch?v=1', true); await tick(40);
  ok('an unsupported link in the SoundCloud box gets a clear message, not a search', () => { assert(t.$('mResults').textContent.includes('isn’t supported')); assert.strictEqual(searches(), sBefore); });
  t.click(t.w.document.querySelector('[data-src="spotify"]'));
  t.type('https://example.com/x', true, 'spInput'); await tick(40);
  ok('an unsupported link in the Spotify box gets a clear message', () => assert(t.$('spHint').textContent.includes('doesn’t look like a Spotify')));
  t = await boot({ scDown: true });
  t.click(t.w.document.querySelector('[data-mtab="music"]')); t.click(t.w.document.querySelector('[data-src="soundcloud"]')); t.type('anything', true); await tick(120);
  ok('if search is down, the user is told what still works', () => assert(t.$('mResults').textContent.includes('Paste a Spotify or SoundCloud link')));
  // ---------- returning user with saved songs ----------
  const S = 'https://soundcloud.com/a/one', SP = 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ';
  const favs = [
    { id: 'sc:' + S, kind: 'soundcloud', url: S, title: 'Midnight City', sub: 'M83', art: 'https://i1.sndcdn.com/a.jpg' },
    { id: 'sp:' + SP, kind: 'spotify', url: SP, title: 'Deep Focus', sub: 'Playlist', art: 'https://i.scdn.co/b.jpg' },
    { id: 'radio:3', kind: 'radio', idx: 3, title: 'Fluid', sub: 'Chill hip-hop', art: 'img/lofi-sakura.webp' }];
  t = await boot({ storage: { ntFavs: favs, ntMusic: { tab: 'soundcloud', station: 0 } } });
  ok('with saved songs the panel opens on Saved', () => { assert.strictEqual(activeTab(t), 'saved'); same(visiblePanes(t), ['mtab-saved']); });
  ok('saved songs are listed with their source', () => { const r = [...t.$('savedList').querySelectorAll('.mrow')]; assert.strictEqual(r.length, 3); assert(r[0].textContent.includes('SoundCloud')); assert(r[1].textContent.includes('Spotify')); assert(r[2].textContent.includes('Radio')); });
  ok('the idle pill offers the saved songs', () => assert.strictEqual(t.$('mmSub').textContent, 'Play your saved songs'));
  let r = [...t.$('savedList').querySelectorAll('.mrow')];
  t.click(r[0]); await tick(); ok('a saved SoundCloud song plays', () => { const m = t.sent.pop(); assert.strictEqual(m.cmd, 'sc-load'); assert.strictEqual(m.title, 'Midnight City'); });
  t.click(r[1]); await tick(); ok('a saved Spotify item plays', () => { const m = t.sent.pop(); assert.strictEqual(m.cmd, 'sp-load'); assert.strictEqual(m.url, SP); });
  t.click(r[2]); await tick(); ok('a saved station plays', () => same(t.sent.pop(), { target: 'ww-player', cmd: 'play-station', idx: 3 }));
  t.click(t.$('cdBtn')); await tick(); ok('with nothing loaded, the pill play button resumes the last item', () => assert.strictEqual(t.sent.pop().cmd, 'play-station'));
  t.click(t.w.document.querySelectorAll('#savedList .mrow')[0].querySelector('button')); await tick();
  ok('hearting a saved row removes it', () => assert.strictEqual(t.store.ntFavs.length, 2));
  t = await boot({ storage: { ntMusic: { tab: 'spotify', station: 0 } } });
  ok('an old "Spotify" tab setting lands on Music', () => assert.strictEqual(activeTab(t), 'music'));
  t = await boot({ storage: { ntMusic: { tab: 'radio', station: 0 } } });
  ok('an old "Radio" tab setting lands on Sounds', () => assert.strictEqual(activeTab(t), 'ambient'));

  // ---------- live state from the player ----------
  t = await boot({ storage: { ntFavs: favs } });
  t.ui({ playing: true, tab: 'soundcloud', key: 'sc:https://soundcloud.com/z/new', url: 'https://soundcloud.com/z/new', title: '♪ New Song', sub: 'Some Artist', art: 'https://i1.sndcdn.com/z.jpg' }); await tick();
  ok('the pill shows what is playing and an equalizer', () => { assert.strictEqual(t.$('mmTitle').textContent, 'New Song'); assert.strictEqual(t.$('mmSub').textContent, 'Some Artist'); assert(t.$('musicMini').classList.contains('playing')); });
  t.click(t.$('miniHeart')); await tick();
  ok('the pill heart saves the playing song with artist and cover', () => { const f = t.store.ntFavs[0]; assert.strictEqual(f.id, 'sc:https://soundcloud.com/z/new'); assert.strictEqual(f.sub, 'Some Artist'); assert.strictEqual(f.art, 'https://i1.sndcdn.com/z.jpg'); assert(t.$('cardHeart').classList.contains('is-saved')); });
  t.click(t.$('mcNext')); await tick(); ok('Next uses sc-next for SoundCloud', () => assert.strictEqual(t.sent.pop().cmd, 'sc-next'));
  t.click(t.$('mcPrev')); await tick(); ok('Back uses sc-prev', () => assert.strictEqual(t.sent.pop().cmd, 'sc-prev'));
  t.click(t.$('musicPlay')); await tick(); ok('play/pause carries the track link', () => { const m = t.sent.pop(); assert.strictEqual(m.cmd, 'sc-toggle'); assert.strictEqual(m.url, 'https://soundcloud.com/z/new'); });
  const SPX = 'https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO';   // a playlist that is not saved yet
  const song1 = { url: 'https://open.spotify.com/track/2i6veFyjDIodH3hgpkwxK6', title: 'The Present', artist: 'Cherries & Daydreams', art: 'https://i.scdn.co/cover1' };
  const song2 = { url: 'https://open.spotify.com/track/51vxIDnFJOzotXLQTrwV29', title: 'Present Memory', artist: 'Køsk Skriner', art: 'https://i.scdn.co/cover2' };
  const ctx = { url: SPX, name: 'Peaceful Piano', type: 'playlist', cover: 'https://i.scdn.co/piano' };
  t.ui({ playing: true, tab: 'spotify', key: 'sp:' + SPX, url: SPX, title: 'The Present', sub: 'Cherries & Daydreams · 30 s preview', art: song1.art, preview: true, track: song1, ctx }); await tick();
  ok('the pill shows the SONG and artist, not the playlist', () => { assert.strictEqual(t.$('mmTitle').textContent, 'The Present'); assert.strictEqual(t.$('mmSub').textContent, 'Cherries & Daydreams · 30 s preview'); assert.strictEqual(t.$('discArtImg').src, song1.art); assert.strictEqual(t.$('cardArt').src, song1.art); });
  ok('the panel names the playlist it came from, with a way to save it', () => { assert(!hidden(t.$('cardCtx'))); assert.strictEqual(t.$('ctxName').textContent, 'From Peaceful Piano'); assert.strictEqual(t.$('ctxSave').textContent, 'Save playlist'); });
  t.click(t.$('cardHeart')); await tick();
  ok('the heart saves the SONG that is playing (title, artist, cover), not the playlist', () => { const f = t.store.ntFavs[0]; assert.strictEqual(f.id, 'sp:' + song1.url); assert.strictEqual(f.url, song1.url); assert.strictEqual(f.title, 'The Present'); assert.strictEqual(f.sub, 'Cherries & Daydreams'); assert.strictEqual(f.art, song1.art); assert(!t.store.ntFavs.some(x => x.id === 'sp:' + SPX && x.url === SPX && false)); });
  ok('the heart looks filled for that song', () => assert(t.$('miniHeart').classList.contains('is-saved')));
  t.ui({ playing: true, tab: 'spotify', key: 'sp:' + SPX, url: SPX, title: 'Present Memory', sub: 'Køsk Skriner', art: song2.art, preview: false, track: song2, ctx }); await tick();
  ok('when the next song starts, the heart is empty again and shows the new song', () => { assert.strictEqual(t.$('mmTitle').textContent, 'Present Memory'); assert(!t.$('miniHeart').classList.contains('is-saved')); });
  t.click(t.$('ctxSave')); await tick();
  ok('"Save playlist" keeps the playlist separately', () => { const f = t.store.ntFavs.find(x => x.url === SPX); assert(f, 'playlist not saved'); assert.strictEqual(f.title, 'Peaceful Piano'); assert.strictEqual(f.sub, 'Playlist'); assert.strictEqual(f.art, 'https://i.scdn.co/piano'); assert.strictEqual(t.$('ctxSave').textContent, 'Playlist saved ✓'); });
  ok('...and the song heart is still empty (they are different things)', () => assert(!t.$('miniHeart').classList.contains('is-saved')));
  ok('the saved list highlights what is playing', () => { t.click(t.w.document.querySelector('[data-mtab="saved"]')); assert(t.$('savedList').querySelector('.mrow.active')); });
  ok('a Spotify preview shows the sign-in notice in the Music tab', () => { t.ui({ playing: true, tab: 'spotify', key: 'sp:' + SPX, url: SPX, title: 'The Present', sub: 'x', art: song1.art, preview: true, track: song1, ctx }); const nt = t.$('spNote'); assert(!hidden(nt)); assert(nt.textContent.includes('30-second previews') && nt.textContent.includes('Sign in')); });
  t.click(t.$('mcNext')); await tick(); ok('Next uses sp-next for Spotify', () => assert.strictEqual(t.sent.pop().cmd, 'sp-next'));
  t.ui({ playing: true, tab: 'spotify', key: 'sp:' + SPX, url: SPX, title: 'The Present', sub: 'Cherries & Daydreams', art: song1.art, preview: false, track: song1, ctx }); await tick();
  ok('the notice goes away for full-length playback', () => assert(hidden(t.$('spNote'))));
  t.ui({ playing: true, tab: 'spotify', key: 'sp:' + SPX, url: SPX, title: 'Peaceful Piano', sub: 'Now playing', art: 'https://i.scdn.co/piano', preview: false, track: null, ctx: null }); await tick();
  ok('if song info is unavailable, the heart falls back to saving the playlist and the extra line hides', () => { assert(hidden(t.$('cardCtx'))); assert.strictEqual(t.$('miniHeart').disabled, false); });
  t.ui({ playing: true, tab: 'radio', key: 'radio:2', title: '♪ Drone Zone', sub: 'Drone ambient', art: 'chrome-extension://x/newtab/img/lofi-night.webp', track: null, ctx: null }); await tick();
  ok('switching to radio hides the playlist line', () => assert(hidden(t.$('cardCtx'))));  t.click(t.w.document.querySelector('[data-mtab="ambient"]'));
  ok('the Lofi radio row shows the current station and is active', () => { const row = [...t.$('ambientList').querySelectorAll('.mrow')][3]; assert(row.textContent.includes('Drone Zone')); assert(row.classList.contains('active')); });
  t.click(t.$('mcNext')); await tick(); ok('Next on radio changes station', () => assert.strictEqual(t.sent.pop().cmd, 'station-next'));
  t = await boot({ offscreenUI: { playing: true, tab: 'radio', key: 'radio:1', url: '', title: '♪ Deep Space One', sub: 'Deep ambient', art: 'chrome-extension://x/newtab/img/lofi-moon.webp' } });
  ok('a new tab picks up music that is already playing', () => { assert.strictEqual(t.$('mmTitle').textContent, 'Deep Space One'); assert(t.$('musicMini').classList.contains('playing')); });
  console.log('\n' + n + ' passed' + (fail ? ', ' + fail + ' FAILED' : '')); process.exit(fail ? 1 : 0);
})();
