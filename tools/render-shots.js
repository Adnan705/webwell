// Renders the REAL extension pages with sample data and a fake chrome.* API, for the landing page.
//   node tools/render-shots.js <outDir>        -> newtab-hero, newtab-music, newtab-focus, dashboard, protect (PNG, 1600x900 @1.5x)
// Uses a throwaway headless Edge/Chrome profile; nothing touches your real browser data.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const outDir = path.resolve(process.argv[2] || 'shots');
fs.mkdirSync(outDir, { recursive: true });
const BROWSERS = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
const browser = BROWSERS.find(p => fs.existsSync(p));
if (!browser) { console.error('No Edge/Chrome found'); process.exit(1); }
const W = 1600, H = +process.env.WW_H || 900, SCALE = 1.5;

const dk = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const today = new Date(), key = dk(today);

// ---- sample browsing history: 14 days, believable and deterministic ----
function rnd(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }
function makeDays() {
  const sites = [['github.com', 62, 9], ['docs.google.com', 40, 7], ['notion.so', 34, 6], ['chatgpt.com', 28, 5], ['stackoverflow.com', 18, 4], ['linkedin.com', 10, 3],
    ['youtube.com', 36, 8], ['x.com', 22, 6], ['reddit.com', 16, 5], ['mail.google.com', 14, 4], ['calendar.google.com', 5, 2], ['figma.com', 24, 4]];
  const days = {};
  for (let i = 0; i < 14; i++) {
    const d = new Date(today.getTime() - i * 86400000), r = rnd(1000 + i * 7);
    const weekend = [0, 6].includes(d.getDay());
    const domains = {}, visits = {}; let total = 0;
    sites.forEach(([dom, mins, v]) => {
      const f = (weekend ? 0.45 : 1) * (0.55 + r() * 0.9) * (i === 0 ? 0.8 : 1);
      const secs = Math.round(mins * 60 * f * (dom === 'youtube.com' && weekend ? 1.6 : 1));
      if (secs > 120) { domains[dom] = secs; visits[dom] = Math.max(2, Math.round(v * f * 3)); total += secs; }
    });
    const hourly = {}; let left = total; const shape = [0, 0, 0, 0, 0, 0, .01, .03, .08, .11, .12, .09, .06, .08, .11, .1, .09, .06, .03, .02, .005, 0, 0, 0];
    shape.forEach((w, h) => { hourly[h] = Math.round(total * w); });
    days[dk(d)] = { domains, visits, hourly, total };
  }
  return days;
}

const seed = {
  profile: { name: 'Alex', theme: 'dusk', bgMode: process.env.WW_BG || 'photos', vecStyle: process.env.WW_VSTYLE || 'mountains', vecPal: process.env.WW_VPAL || 'dawn', bgPick: { date: key, idx: 3 } },
  settings: { idleTimeout: 60, trackingEnabled: true, darkMode: false, forecastNudge: true },
  days: makeDays(),
  ntBookmarks: [['notion.so', 'https://notion.so'], ['mail.google.com', 'https://mail.google.com'], ['docs.google.com', 'https://docs.google.com'], ['calendar.google.com', 'https://calendar.google.com'], ['github.com', 'https://github.com']]
    .map(([n, u], i) => ({ id: 'b' + i, name: n, url: u })),
  ntFavs: [
    { id: 'sp:https://open.spotify.com/track/2i6veFyjDIodH3hgpkwxK6', kind: 'spotify', url: 'https://open.spotify.com/track/2i6veFyjDIodH3hgpkwxK6', title: 'The Present', sub: 'Cherries & Daydreams', art: 'img/lofi-girl.webp' },
    { id: 'sp:https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ', kind: 'spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ', title: 'Deep Focus', sub: 'Playlist', art: 'img/lofi-moon.webp' },
    { id: 'ambient:rain', kind: 'ambient', sound: 'rain', title: 'Rain', sub: 'Steady rainfall', art: 'img/lofi-night.webp' },
    { id: 'radio:0', kind: 'radio', idx: 0, title: 'Groove Salad', sub: 'Ambient beats for focus', art: 'img/lofi-disc.webp' }],
  tasks: { [key]: [{ id: 't1', text: 'Review the pull request', done: true }, { id: 't2', text: 'Write the intro section', done: false }, { id: 't3', text: 'Email Sarah about the invoice', done: false }] },
  focusLog: Object.fromEntries([...Array(7).keys()].map(i => [dk(new Date(today.getTime() - i * 86400000)), { mins: [75, 120, 50, 95, 25, 140, 60][i], sessions: [2, 3, 1, 3, 1, 4, 2][i] }])),
  protect: { adult: true, shortsOn: true, pause: true, pauseSecs: 5, blocklist: ['reddit.com', 'tiktok.com'], focusExtra: ['news.ycombinator.com'], shorts: { youtube: true, instagram: true, tiktok: true, facebook: true, snapchat: true }, pinHash: 'x', pinSalt: 'y' },
  protectStats: { [key]: { adult: 3, shorts: 5, focus: 2, pause: 1 } },
  lockPrefs: { mins: 25, breakMins: 5, sound: 'rain', block: true }
};

const playing = {
  playing: true, tab: 'spotify', key: 'sp:https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ', url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ',
  title: 'The Present', sub: 'Cherries & Daydreams', art: 'img/lofi-girl.webp',
  track: { url: 'https://open.spotify.com/track/2i6veFyjDIodH3hgpkwxK6', title: 'The Present', artist: 'Cherries & Daydreams', art: '' },
  ctx: { url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ', name: 'Deep Focus', type: 'playlist', cover: '' }
};
const letterTiles = `
  var pal = ['#3b6ea8', '#8a5fb0', '#c76b3d', '#3f8f6b', '#b0486b', '#5b6fb5'];
  function tile(d) { var l = (d || '?').charAt(0).toUpperCase(), c = pal[(d || '').length % pal.length];
    return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="' + c + '"/><text x="32" y="43" font-family="Arial" font-weight="700" font-size="32" text-anchor="middle" fill="white">' + l + '</text></svg>'); }
  function fixIcons() { document.querySelectorAll('img[data-domain]').forEach(function (i) { i.src = tile(i.dataset.domain); i.style.visibility = ''; }); }
  setTimeout(fixIcons, 1500); setTimeout(fixIcons, 2600);`;

const shots = {
  'newtab-hero': { page: 'newtab/newtab.html', seed: { ...seed, focus: { date: key, text: 'Finish the landing page copy', done: false } }, after: `window.__ui(${JSON.stringify(playing)});` },
  'newtab-music': { page: 'newtab/newtab.html', seed: { ...seed, focus: { date: key, text: 'Finish the landing page copy', done: false } },
    after: `window.__ui(${JSON.stringify(playing)}); document.getElementById('mmOpen').click(); document.querySelector('[data-mtab=music]').click();` },
  'newtab-focus': { page: 'newtab/newtab.html', seed: { ...seed, lockin: { phase: 'focus', task: 'Finish the landing page copy', mins: 25, totalMs: 1500000, startedAt: Date.now() - 420000, endsAt: Date.now() + 1080000, pausedLeft: null, sound: 'rain', block: true, breakMins: 5 } }, after: '' },
  'dashboard': { page: 'dashboard/dashboard.html', hash: '', seed, after: letterTiles },
  'protect': { page: 'dashboard/dashboard.html', hash: 'protect', seed, after: letterTiles },
  'settings': { page: 'dashboard/dashboard.html', hash: 'settings', seed, after: letterTiles + "var v=document.getElementById('vecPicker'); if (v) { var p=v.parentElement; while (p && !/(auto|scroll)/.test(getComputedStyle(p).overflowY)) p=p.parentElement; if (p) p.scrollTop += v.getBoundingClientRect().top - 140; }" }
};

function stubFor(s) {
  return `<base href="file:///${ROOT.replace(/\\/g, '/')}/${path.dirname(s.page)}/">
<script>
(function () {
  var store = ${JSON.stringify(s.seed)}; var cbs = [];
  var copy = function (o) { return JSON.parse(JSON.stringify(o)); };
  var noop = function () {}; var ev = { addListener: noop };
  window.chrome = {
    runtime: { getURL: function (p) { return 'chrome-extension://x/' + p; }, getManifest: function () { return { version: '1.7.2' }; },
      sendMessage: function (m) { return Promise.resolve(m && m.cmd === 'get-state' ? undefined : { ok: true, live: null }); },
      onMessage: { addListener: function (f) { cbs.push(f); } } },
    storage: { local: { get: function () { return Promise.resolve(copy(store)); }, set: function (o) { Object.assign(store, copy(o)); return Promise.resolve(); }, remove: function (k) { [].concat(k).forEach(function (x) { delete store[x]; }); return Promise.resolve(); } }, onChanged: ev },
    offscreen: { hasDocument: function () { return Promise.resolve(false); } },
    permissions: { contains: function () { return Promise.resolve(true); }, request: function () { return Promise.resolve(true); } },
    tabs: { create: noop, update: noop, query: function () { return Promise.resolve([]); } }, search: { query: noop }, alarms: ev, idle: { setDetectionInterval: noop }
  };
  window.__ui = function (ui) { cbs.forEach(function (f) { try { f({ target: 'ww-player-ui', ui: ui }); } catch (e) {} }); };
  ${s.hash ? `try { location.hash = '${s.hash}'; } catch (e) {}` : ''}
  try { localStorage.setItem('ww_boot', JSON.stringify({ v: 1, theme: 'dusk', bgMode: store.profile.bgMode, vecStyle: store.profile.vecStyle, vecPal: store.profile.vecPal, name: 'Alex', bgPick: store.profile.bgPick, focus: store.focus || null, tasksDate: '${key}', tasks: (store.tasks && store.tasks['${key}']) || [], bookmarks: store.ntBookmarks, hidden: [], auto: [] })); } catch (e) {}
  window.addEventListener('load', function () { setTimeout(function () { try { ${s.after || ''} } catch (e) { document.title = 'ACTION ERROR ' + e.message; } }, 700); });
})();
</script>`;
}

for (const [name, s] of Object.entries(shots).filter(([n]) => !process.env.ONLY || n === process.env.ONLY)) {
  const html = fs.readFileSync(path.join(ROOT, s.page), 'utf8').replace('<head>', '<head>\n' + stubFor(s));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wwshot-'));
  const page = path.join(tmp, name + '.html'); fs.writeFileSync(page, html);
  const out = path.join(outDir, name + '.png');
  cp.spawnSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--allow-file-access-from-files', '--force-device-scale-factor=' + SCALE,
    '--user-data-dir=' + path.join(tmp, 'profile'), '--window-size=' + W + ',' + H, '--virtual-time-budget=7000', '--screenshot=' + out, 'file:///' + page.replace(/\\/g, '/')], { encoding: 'utf8', timeout: 120000 });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fs.existsSync(out) ? 'saved ' + name + '.png (' + Math.round(fs.statSync(out).size / 1024) + ' KB)' : 'FAILED ' + name);
}
