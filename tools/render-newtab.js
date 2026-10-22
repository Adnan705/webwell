// Renders the REAL new tab page (newtab.html + its scripts) in a throwaway headless Brave/Chrome,
// with a fake chrome.* API, and saves a screenshot. Nothing touches your real profile.
//   node tools/render-newtab.js <state> <out.png> [width] [height]
// states: default | music | music-playing | music-spotify | tasks | focus-sheet | focus-running | focus-done | no-focus
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const state = process.argv[2] || 'default';
const out = path.resolve(process.argv[3] || 'newtab.png');
const W = +process.argv[4] || 1870, H = +process.argv[5] || 916;
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe'];
const browser = BROWSERS.find(p => fs.existsSync(p));
if (!browser) { console.error('No Brave/Chrome found'); process.exit(1); }

const today = new Date(); const dk = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const key = dk(today);
const seed = {
  profile: { name: 'Adnan', theme: 'dusk', bgMode: process.env.WW_BG || 'photos', vecStyle: process.env.WW_VSTYLE || 'mountains', vecPal: process.env.WW_VPAL || 'dawn', bgPick: { date: key, idx: 3 } },
  ntBookmarks: [{ id: 'b1', name: 'facebook.com', url: 'https://facebook.com' }, { id: 'b2', name: 'github.com', url: 'https://github.com' }, { id: 'b3', name: 'gmail.com', url: 'https://mail.google.com' }],
  ntFavs: [
    { id: 'sp:https://open.spotify.com/track/1', kind: 'spotify', url: 'https://open.spotify.com/track/1', title: 'Sweater Weather', sub: 'The Neighbourhood', art: 'img/lofi-girl.webp' },
    { id: 'ambient:rain', kind: 'ambient', sound: 'rain', title: 'Rain', sub: 'Steady rainfall', art: 'img/lofi-night.webp' }],
  tasks: { [key]: [{ id: 't1', text: 'Review the pull request', done: true }, { id: 't2', text: 'Write the intro section', done: false }, { id: 't3', text: 'Email Sarah about the invoice', done: false }] },
  focusLog: { [key]: { mins: 75, sessions: 2 } }
};
if (state === 'no-focus') delete seed.tasks;
if (process.env.WW_REVIEW) { seed.ntReview = { firstSeen: Date.now() - 5 * 86400000, state: '', nextAt: 0, asked: 0 }; seed.focusLog[key].sessions = 5; }
if (state === 'default' || state === 'tasks' || state === 'focus-sheet') seed.focus = { date: key, text: 'Finish the landing page copy', done: false };
if (state === 'focus-running') seed.lockin = { phase: 'focus', task: 'Finish the landing page copy', mins: 25, totalMs: 1500000, startedAt: Date.now() - 420000, endsAt: Date.now() + 1080000, pausedLeft: null, sound: 'rain', block: true, breakMins: 5 };
if (state === 'focus-done') seed.lockin = { phase: 'done', doneMins: 25, doneAt: Date.now() };

const playing = { playing: true, tab: 'spotify', key: 'sp:https://open.spotify.com/playlist/p', url: 'https://open.spotify.com/playlist/p', title: 'Sweater Weather', sub: 'The Neighbourhood', art: 'img/lofi-girl.webp',
  track: { url: 'https://open.spotify.com/track/1', title: 'Sweater Weather', artist: 'The Neighbourhood', art: '' }, ctx: { url: 'https://open.spotify.com/playlist/p', name: 'Deep Focus', type: 'playlist', cover: '' } };
const actions = {
  'music': "document.getElementById('mmOpen').click();",
  'music-playing': "window.__ui(" + JSON.stringify(playing) + "); document.getElementById('mmOpen').click();",
  'music-spotify': "window.__ui(" + JSON.stringify(playing) + "); document.getElementById('mmOpen').click(); document.querySelector('[data-mtab=music]').click();",
  'tasks': "var t=document.getElementById('tasksToggle'); if (t) t.click();",
  'focus-sheet': "var b=document.getElementById('lockBtn'); if (b) b.click();",
};
if (state !== 'music-playing' && state !== 'music-spotify') actions['playing-pill'] = '';
const after = (actions[state] || '') + (state === 'default' || state === 'tasks' || state === 'focus-sheet' || state === 'no-focus' || state === 'focus-running' || state === 'focus-done' ? "window.__ui(" + JSON.stringify(playing) + ");" : '');

const stub = `<base href="file:///${ROOT.replace(/\\/g, '/')}/newtab/">
<script>
(function () {
  var store = ${JSON.stringify(seed)}; var cbs = [];
  var copy = function (o) { return JSON.parse(JSON.stringify(o)); };
  window.chrome = {
    runtime: { getURL: function (p) { return 'chrome-extension://x/' + p; }, getManifest: function () { return { version: '1.7.2' }; },
      sendMessage: function (m) { return Promise.resolve(m && m.cmd === 'get-state' ? undefined : { ok: true, live: null }); },
      onMessage: { addListener: function (f) { cbs.push(f); } } },
    storage: { local: { get: function () { return Promise.resolve(copy(store)); }, set: function (o) { Object.assign(store, copy(o)); return Promise.resolve(); }, remove: function (k) { [].concat(k).forEach(function (x) { delete store[x]; }); return Promise.resolve(); } }, onChanged: { addListener: function () {} } },
    offscreen: { hasDocument: function () { return Promise.resolve(false); } },
    permissions: { contains: function () { return Promise.resolve(true); }, request: function () { return Promise.resolve(true); } },
    tabs: { create: function () {}, update: function () {} }, search: { query: function () {} }, alarms: {}, idle: {}
  };
  window.__ui = function (ui) { cbs.forEach(function (f) { try { f({ target: 'ww-player-ui', ui: ui }); } catch (e) {} }); };
  try { localStorage.setItem('ww_boot', JSON.stringify({ v: 1, theme: 'dusk', bgMode: store.profile.bgMode, vecStyle: store.profile.vecStyle, vecPal: store.profile.vecPal, name: 'Adnan', bgPick: store.profile.bgPick, focus: store.focus || null, tasksDate: '${key}', tasks: (store.tasks && store.tasks['${key}']) || [], bookmarks: store.ntBookmarks, hidden: [], auto: [] })); } catch (e) {}
  window.addEventListener('load', function () { setTimeout(function () { try { ${after} } catch (e) { document.title = 'ACTION ERROR ' + e.message; } }, 600); });
})();
</script>`;
let html = fs.readFileSync(path.join(ROOT, 'newtab/newtab.html'), 'utf8').replace('<head>', '<head>\n' + stub);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wwshot-'));
const page = path.join(tmp, 'newtab-preview.html'); fs.writeFileSync(page, html);
const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files',
  '--user-data-dir=' + path.join(tmp, 'profile'), '--force-device-scale-factor=' + (process.env.WW_SCALE || 1), '--window-size=' + W + ',' + H, '--virtual-time-budget=6000', '--screenshot=' + out, 'file:///' + page.replace(/\\/g, '/')];
const r = cp.spawnSync(browser, args, { encoding: 'utf8', timeout: 90000 });
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fs.existsSync(out) ? 'saved ' + out : 'FAILED: ' + (r.stderr || r.stdout || r.error));
