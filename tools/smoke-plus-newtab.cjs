// Real-browser smoke test for the WebWell Plus new tab features: sound mixer, extra looks, focus garden.
//   node tools/smoke-plus-newtab.cjs            (Plus path, then the free path; screenshots go to %TEMP%\ww-plus-*.png)
// Uses tools/cdp-harness.cjs (headless Edge with the unpacked extension). Exits non-zero on any failed
// check or any uncaught page error.
'use strict';
const { withExtension } = require('./cdp-harness.cjs');
const path = require('path'), os = require('os');
const OUT = process.env.TEMP || os.tmpdir();
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); if (!cond) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dk = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return dk(d); };
// 5-day streak ending today, an older 8-day run (the best), 9 sessions in all from the recent run
const FOCUS_LOG = Object.assign(
  Object.fromEntries([0, 1, 2, 3, 4].map(i => [daysAgo(i), { mins: [50, 25, 75, 30, 60][i], sessions: [2, 1, 3, 1, 2][i] }])),
  Object.fromEntries([20, 21, 22, 23, 24, 25, 26, 27].map(i => [daysAgo(i), { mins: 25, sessions: 1 }])));

async function prep(open, ev, plusKey, extra) {
  const p = await open('newtab/newtab.html');
  await ev(p, 'localStorage.clear(); chrome.storage.local.clear().then(() => chrome.storage.local.set(' + JSON.stringify(Object.assign({
    ntWelcome: { done: true }, profile: { name: 'Sam', theme: 'dusk', bgMode: 'vector', vecStyle: 'mountains', vecPal: 'dawn' }, focusLog: FOCUS_LOG
  }, plusKey ? { plusKey } : {}, extra || {})) + '))');
  await p.send('Page.reload'); await sleep(2200);
  return p;
}
const click = (ev, p, sel) => ev(p, '(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); if (!e) return "missing"; e.click(); return "ok"; })()');
const setRange = (ev, p, id, v) => ev(p, '(() => { const e = document.getElementById(' + JSON.stringify(id) + '); e.value = ' + v + '; e.dispatchEvent(new Event("input", { bubbles: true })); return e.getAttribute("aria-valuetext"); })()');
const size = async (p, w, h) => { await p.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(400); };
const scheme = (p, s) => p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: s }] });
// Nothing may cover the clock or the focus field.
const overlapExpr = `(() => {
  const r = el => el && el.getBoundingClientRect();
  const hit = (a, b) => a && b && a.width && b.width && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  const keep = [r(document.getElementById('clock')), r(document.querySelector('#focusAsk:not(.hidden) input, #focusSet:not(.hidden) .focus-row'))];
  const mine = ['#gardenWidget', '.bl-row', '#gardenBody', '#lookPop:not(.hidden)'].map(s => r(document.querySelector(s)));
  return keep.some(k => mine.some(m => hit(k, m)));
})()`;

async function plusRun({ open, ev, shot, plusKey, br }) {
  console.log('--- Plus path ---');
  check('test key was signed', plusKey.startsWith('WWP1.'));
  let p = await prep(open, ev, plusKey);
  check('Plus is on in the new tab', await ev(p, 'window.wwPlus.on') === true);
  check('no welcome tour (marked done)', await ev(p, '!document.querySelector(".welcome")'));

  // ----- garden -----
  check('garden pill shows the streak', (await ev(p, 'document.getElementById("gardenCount").textContent')) === '5 days', await ev(p, 'document.getElementById("gardenCount").textContent'));
  await click(ev, p, '#gardenToggle'); await sleep(700);
  const g = await ev(p, 'document.getElementById("gardenBody").innerText');
  check('garden shows streak, best and totals', /5 days/.test(g) && /Best 8 days/.test(g) && /17 plants/.test(g), g.replace(/\n/g, ' | '));
  check('garden draws one plant per session (newest 16)', (await ev(p, 'document.querySelectorAll("#gardenBody .g-plant").length')) === 16);
  check('a 5-day streak says the 3-day milestone', /Three days in a row/.test(g));
  check('garden does not cover the clock or focus field', (await ev(p, overlapExpr)) === false);
  await shot(p, path.join(OUT, 'ww-plus-garden-1280.png'));
  await click(ev, p, '#gardenToggle');

  // ----- mixer -----
  await click(ev, p, '#mmOpen'); await click(ev, p, '[data-mtab="ambient"]'); await sleep(200);
  check('Sounds tab still lists the 4 free rows', (await ev(p, 'document.querySelectorAll("#ambientList .mrow").length')) === 4);
  await click(ev, p, '#mixEntry'); await sleep(200);
  check('mixer opens with 8 sliders and a volume', (await ev(p, 'document.querySelectorAll("#mixPanel .mix-grid input[type=range]").length')) === 8 && !!(await ev(p, '!!document.getElementById("mixMaster")')));
  check('slider aria-valuetext reads Off at zero', (await ev(p, 'document.getElementById("mix-cafe").getAttribute("aria-valuetext")')) === 'Off');
  check('slider aria-valuetext reads a percent', (await setRange(ev, p, 'mix-rain', 60)) === '60 percent');
  await setRange(ev, p, 'mix-fire', 45); await setRange(ev, p, 'mix-cafe', 30); await setRange(ev, p, 'mix-crickets', 50); await setRange(ev, p, 'mix-wind', 25);
  await sleep(2500);
  const st = await ev(p, 'playerSend({ cmd: "mixer-state" }).then(s => JSON.stringify(s))');
  const s1 = JSON.parse(st || '{}');
  check('moving a slider starts the mix in the player', s1.playing === true, st);
  check('AudioContext is running', s1.ctx === 'running', s1.ctx);
  check('only the raised layers exist', JSON.stringify((s1.voices || []).sort()) === JSON.stringify(['cafe', 'crickets', 'fire', 'rain', 'wind']), s1.voices);
  check('layer gains follow the sliders (rain 0.6 x 0.55)', Math.abs((s1.gains || {}).rain - 0.33) < 0.03, s1.gains);
  check('master volume reached', Math.abs(s1.out - 0.8) < 0.05, s1.out);
  const ui1 = await ev(p, 'JSON.stringify({ k: uiState.kind, p: uiState.playing, t: uiState.title, s: uiState.sub })');
  check('player reports the mix as playing', /"k":"mix","p":true/.test(ui1), ui1);
  check('pill shows the mix', /mix/i.test(await ev(p, 'document.getElementById("mmTitle").textContent')));
  await setRange(ev, p, 'mix-rain', 0); await setRange(ev, p, 'mixMaster', 40); await sleep(2200);
  const s2 = JSON.parse(await ev(p, 'playerSend({ cmd: "mixer-state" }).then(s => JSON.stringify(s))'));
  check('a layer at zero is removed after its fade', !(s2.voices || []).includes('rain'), s2.voices);
  check('master follows its slider', Math.abs(s2.out - 0.4) < 0.05, s2.out);
  await shot(p, path.join(OUT, 'ww-plus-mixer-1280.png'));
  // the main play button pauses the mix, and plays it again
  await click(ev, p, '#musicPlay'); await sleep(1200);
  const s3 = JSON.parse(await ev(p, 'playerSend({ cmd: "mixer-state" }).then(s => JSON.stringify(s))'));
  check('main play/pause pauses the mix', s3.playing === false && (await ev(p, 'uiState.playing')) === false);
  await click(ev, p, '#musicPlay'); await sleep(1200);
  check('...and resumes it', JSON.parse(await ev(p, 'playerSend({ cmd: "mixer-state" }).then(s => JSON.stringify(s))')).playing === true);
  // save a mix
  await ev(p, 'document.getElementById("mixName").value = "Rainy cafe"');
  await click(ev, p, '#mixSave'); await sleep(500);
  const saved = await ev(p, 'chrome.storage.local.get(["plusMixes", "plusMixLast"]).then(r => JSON.stringify(r))');
  check('mix saved under plusMixes', /"name":"Rainy cafe"/.test(saved) && /"fire":0.45/.test(saved), saved.slice(0, 160));
  check('card still open after clicking Save', (await ev(p, 'document.getElementById("musicCard").classList.contains("hidden")')) === false);
  // starting a free sound stops the mix (one source at a time)
  await ev(p, 'playerSend({ cmd: "ambient-play", kind: "waves" })'); await sleep(1500);
  const s4 = JSON.parse(await ev(p, 'playerSend({ cmd: "mixer-state" }).then(s => JSON.stringify(s))'));
  check('a normal sound stops the mixer', s4.playing === false && (await ev(p, 'uiState.kind')) === 'waves');
  // reload: mixes and the last mix come back; loading plays it
  await p.send('Page.reload'); await sleep(2200);
  await click(ev, p, '#mmOpen'); await click(ev, p, '[data-mtab="ambient"]'); await click(ev, p, '#mixEntry'); await sleep(300);
  check('saved mix listed after reload', /Rainy cafe/.test(await ev(p, 'document.getElementById("mixChips").textContent')));
  check('last levels restored', (await ev(p, 'document.getElementById("mix-fire").value')) === '45');
  await click(ev, p, '[data-load]'); await sleep(1500);
  const s5 = JSON.parse(await ev(p, 'playerSend({ cmd: "mixer-state" }).then(s => JSON.stringify(s))'));
  check('loading a mix plays it', s5.playing === true && s5.name === 'Rainy cafe', s5);
  await click(ev, p, '.mix-del'); await sleep(400);
  check('deleting removes it', !(/Rainy cafe/.test(await ev(p, 'chrome.storage.local.get("plusMixes").then(r => JSON.stringify(r))'))));
  await ev(p, 'playerSend({ cmd: "stop-all" })'); await sleep(900);
  check('stop-all (used when a focus session ends) stops the mixer', JSON.parse(await ev(p, 'playerSend({ cmd: "mixer-state" }).then(s => JSON.stringify(s))')).playing === false);
  await click(ev, p, '#musicClose');

  // ----- looks -----
  await click(ev, p, '#lookBtn'); await sleep(400);
  check('Customise lists 12 backgrounds and 14 palettes', (await ev(p, 'document.querySelectorAll("#lookPop .look-tile").length')) === 12 && (await ev(p, 'document.querySelectorAll("#lookPop [data-vpal]").length')) === 14);
  check('no Plus badges for a Plus user', (await ev(p, 'document.querySelectorAll("#lookPop .plus-badge, #lookPop .is-plus").length')) === 0);
  await click(ev, p, '[data-vstyle="aurora"]'); await sleep(200);
  await click(ev, p, '[data-vpal="aurora"]'); await click(ev, p, '[data-accent="mint"]'); await click(ev, p, '[data-clock="mono"]'); await sleep(700);
  check('Customise stays open while picking', (await ev(p, 'document.getElementById("lookPop").classList.contains("hidden")')) === false);
  const prof = JSON.parse(await ev(p, 'chrome.storage.local.get("profile").then(r => JSON.stringify(r.profile))'));
  check('Plus look saved', prof.vecStyle === 'aurora' && prof.vecPal === 'aurora' && prof.accent === 'mint' && prof.clockStyle === 'mono', prof);
  check('accent and clock applied', (await ev(p, 'document.documentElement.dataset.accent + "/" + document.documentElement.dataset.clock')) === 'mint/mono');
  check('aurora background drawn', /aurora|au0/.test(decodeURIComponent(await ev(p, 'document.getElementById("bgVector").style.backgroundImage'))));
  await shot(p, path.join(OUT, 'ww-plus-looks-panel-1280.png'));
  await click(ev, p, '#lookClose'); await sleep(300);
  for (const st of ['dunes', 'topo', 'nebula', 'paper', 'softgrad']) {
    await ev(p, 'document.getElementById("lookBtn").click()'); await click(ev, p, '[data-vstyle="' + st + '"]'); await click(ev, p, '#lookClose'); await sleep(700);
    await shot(p, path.join(OUT, 'ww-plus-bg-' + st + '.png'));
  }
  await ev(p, 'document.getElementById("lookBtn").click()'); await click(ev, p, '[data-vstyle="aurora"]'); await click(ev, p, '[data-clock="large"]'); await click(ev, p, '#lookClose'); await sleep(700);
  check('large clock does not collide with the focus field at 1280x800', (await ev(p, overlapExpr)) === false);
  await shot(p, path.join(OUT, 'ww-plus-1280.png'));
  await size(p, 800, 600);
  check('nothing covers the clock or focus field at 800x600', (await ev(p, overlapExpr)) === false);
  check('clock and focus field do not overlap each other at 800x600', (await ev(p, '(() => { const a = document.getElementById("clock").getBoundingClientRect(), b = document.getElementById("focusInput").getBoundingClientRect(); return a.bottom <= b.top; })()')) === true);
  await click(ev, p, '#gardenToggle'); await sleep(500);
  await shot(p, path.join(OUT, 'ww-plus-800.png'));
  await click(ev, p, '#gardenToggle');
  await scheme(p, 'light'); await sleep(300); await shot(p, path.join(OUT, 'ww-plus-800-light.png'));
  await scheme(p, 'dark'); await click(ev, p, '#lookBtn'); await sleep(400); await shot(p, path.join(OUT, 'ww-plus-800-dark-panel.png')); await click(ev, p, '#lookClose');
  await size(p, 1280, 800);
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await click(ev, p, '#gardenToggle'); await sleep(300);
  check('reduced motion: plants do not animate', parseFloat(await ev(p, 'getComputedStyle(document.querySelector("#gardenBody .g-plant")).animationDuration')) < 0.01);
  await click(ev, p, '#gardenToggle');
  await p.send('Emulation.setEmulatedMedia', { features: [] });

  // ----- Plus lapses: display falls back, the saved choice stays; it returns with the key -----
  await ev(p, 'chrome.storage.local.remove("plusKey")'); await sleep(900);
  check('lapsed: Plus off without reload', (await ev(p, 'window.wwPlus.on')) === false);
  check('lapsed: accent and clock back to free', (await ev(p, '!document.documentElement.dataset.accent && !document.documentElement.dataset.clock')) === true);
  check('lapsed: background shows the free default', /mountains|sky/.test(decodeURIComponent(await ev(p, 'document.getElementById("bgVector").style.backgroundImage'))) && !/au0/.test(decodeURIComponent(await ev(p, 'document.getElementById("bgVector").style.backgroundImage'))));
  const prof2 = JSON.parse(await ev(p, 'chrome.storage.local.get("profile").then(r => JSON.stringify(r.profile))'));
  check('lapsed: saved Plus choice kept', prof2.vecStyle === 'aurora' && prof2.accent === 'mint' && prof2.clockStyle === 'large', prof2);
  check('lapsed: garden shows the locked card', /Plus/.test(await ev(p, 'document.getElementById("gardenCount").textContent')));
  const s6 = JSON.parse(await ev(p, 'playerSend({ cmd: "mixer-state" }).then(s => JSON.stringify(s))'));
  check('lapsed: the player forgets the mix', s6.playing === false && Object.keys(s6.levels).length === 0 && (await ev(p, 'uiState.kind')) !== 'mix', s6);
  await ev(p, 'playerSend({ cmd: "ambient-toggle", kind: "mix" })'); await sleep(1200);
  check('lapsed: a play button elsewhere gives plain Rain, not the mix', (await ev(p, 'uiState.kind + "/" + uiState.playing')) === 'rain/true');
  await ev(p, 'playerSend({ cmd: "stop-all" })'); await sleep(600);
  await shot(p, path.join(OUT, 'ww-plus-lapsed.png'));
  await ev(p, 'chrome.storage.local.set({ plusKey: ' + JSON.stringify(plusKey) + ' })'); await sleep(900);
  check('Plus back: look returns by itself', (await ev(p, 'document.documentElement.dataset.accent')) === 'mint');
  // a fresh tab paints the Plus look from the snapshot
  const p2 = await open('newtab/newtab.html'); await sleep(500);
  check('a new tab paints the Plus look', (await ev(p2, 'document.documentElement.dataset.clock + "/" + window.wwPlus.on')) === 'large/true');
}

async function freeRun({ open, ev, shot }) {
  console.log('--- Free path (no key) ---');
  const p = await prep(open, ev, '');
  check('Plus is off', (await ev(p, 'window.wwPlus.on')) === false);
  check('free page sets no accent or clock attribute', (await ev(p, '!document.documentElement.hasAttribute("data-accent") && !document.documentElement.hasAttribute("data-clock")')) === true);
  check('clock looks as before (classic, with AM/PM unless 24h)', /\d:\d\d( [AP]M)?$/.test(await ev(p, 'document.getElementById("clock").textContent')));
  await shot(p, path.join(OUT, 'ww-free-1280.png'));
  // music works as before
  await click(ev, p, '#mmOpen'); await click(ev, p, '[data-mtab="ambient"]'); await sleep(200);
  check('free Sounds rows unchanged (Rain, Soft noise, Waves, Lofi radio)', (await ev(p, '[...document.querySelectorAll("#ambientList .mn")].map(e => e.textContent).join(",")')) === 'Rain,Soft noise,Waves,Lofi radio');
  await click(ev, p, '#ambientList .mrow'); await sleep(1800);
  const ui = await ev(p, 'JSON.stringify({ k: uiState.kind, p: uiState.playing })');
  check('free Rain plays', ui === '{"k":"rain","p":true}', ui);
  await click(ev, p, '#musicPlay'); await sleep(900);
  check('free pause works', (await ev(p, 'uiState.playing')) === false);
  check('mixer entry marked Plus', /Plus/.test(await ev(p, 'document.getElementById("mixEntryBadge").textContent')));
  await click(ev, p, '#mixEntry'); await sleep(300);
  check('mixer shows the locked card, sliders disabled', !!(await ev(p, '!!document.querySelector("#mixPanel [data-plus-lock=mixer]")')) && (await ev(p, 'document.querySelectorAll("#mixPanel input:not([disabled])").length')) === 0);
  await shot(p, path.join(OUT, 'ww-free-mixer-locked.png'));
  check('locked mixer cannot start the player mix', (await ev(p, 'window.WWMixer.play()')) === false);
  await click(ev, p, '#musicClose');
  // looks: Plus options badged and locked
  await click(ev, p, '#lookBtn'); await sleep(400);
  check('Plus options carry a badge', (await ev(p, 'document.querySelectorAll("#lookPop .look-tile .plus-badge").length')) === 6);
  await click(ev, p, '[data-vstyle="nebula"]'); await sleep(300);
  check('picking a Plus background shows the locked card', (await ev(p, '!document.getElementById("lookLock").classList.contains("hidden")')) === true);
  const prof = JSON.parse(await ev(p, 'chrome.storage.local.get("profile").then(r => JSON.stringify(r.profile))'));
  check('...and does not apply it', prof.vecStyle === 'mountains' && !prof.accent);
  await shot(p, path.join(OUT, 'ww-free-looks-locked.png'));
  await click(ev, p, '[data-vstyle="waves"]'); await sleep(500);
  const prof2 = JSON.parse(await ev(p, 'chrome.storage.local.get("profile").then(r => JSON.stringify(r.profile))'));
  check('free backgrounds still apply from the panel', prof2.vecStyle === 'waves');
  await click(ev, p, '#lookClose');
  // shuffle stays free-only
  const shuffled = await ev(p, '(async () => { const seen = new Set(); for (let i = 0; i < 25; i++) { document.getElementById("vecShuffle").click(); await new Promise(r => setTimeout(r, 30)); const pr = (await chrome.storage.local.get("profile")).profile; seen.add(pr.vecStyle + ":" + pr.vecPal); } return [...seen].join(","); })()');
  check('free shuffle never picks a Plus look', !/aurora|dunes|topo|nebula|paper|softgrad|dune|lagoon|plum|kraft|frost/.test(shuffled));
  // garden: locked preview
  await click(ev, p, '#gardenToggle'); await sleep(400);
  check('garden shows the sample and the locked card', !!(await ev(p, '!!document.querySelector("#gardenBody .g-sample svg") && !!document.querySelector("#gardenBody [data-plus-lock=garden]")')));
  await shot(p, path.join(OUT, 'ww-free-garden-locked.png'));
  await click(ev, p, '#gardenToggle');
  await size(p, 800, 600);
  check('free 800x600: nothing covers the clock or focus field', (await ev(p, overlapExpr)) === false);
  await shot(p, path.join(OUT, 'ww-free-800.png'));
  // the first-run tour still appears for a brand-new user
  const t = await open('newtab/newtab.html');
  await ev(t, 'localStorage.clear(); chrome.storage.local.clear()'); await t.send('Page.reload'); await sleep(2200);
  check('first-run tour still shows', !!(await ev(t, '!!document.querySelector(".welcome")')));
}

withExtension(async h => {
  await plusRun(h);
  await freeRun(h);
  console.log('\n' + (fails ? fails + ' check(s) FAILED' : 'all checks passed') + '. Screenshots in ' + OUT);
  if (fails) process.exitCode = 1;
}, { wait: 2200 });
