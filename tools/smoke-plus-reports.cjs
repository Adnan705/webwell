// Real-browser smoke test for the WebWell Plus Reports view. Run: node tools/smoke-plus-reports.cjs
// Seeds ~60 days of fake data, checks the locked state, the report, range switching, CSV export,
// the print stylesheet, the coach card states, and that Overview / Trends still render.
// Screenshots go to %TEMP%\ww-reports-*.png.
const { withExtension } = require('./cdp-harness.cjs');
const fs = require('fs'), path = require('path');
const OUT = process.env.TEMP || require('os').tmpdir();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (name, cond, info) => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  -> ' + String(info).slice(0, 160) : '')); if (!cond) failures++; };

function seed() {
  const dk = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const sites = [['youtube.com', 2400], ['github.com', 2200], ['docs.google.com', 1500], ['reddit.com', 1300], ['mail.google.com', 900],
    ['stackoverflow.com', 800], ['news.bbc.co.uk', 700], ['instagram.com', 600], ['notion.so', 500], ['x.com', 450], ['wikipedia.org', 300]];
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const days = {}, focusLog = {};
  for (let i = 0; i < 60; i++) {
    if (i === 17 || i === 18) continue;                 // a couple of days away from the computer
    const d = new Date(); d.setDate(d.getDate() - i); const k = dk(d);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const domains = {}, visits = {}, hourly = {}; let total = 0;
    for (const [dom, base] of sites) {
      const distracting = /youtube|reddit|instagram|x\.com/.test(dom);
      const v = Math.round(base * (0.3 + rnd() * 1.4) * (weekend ? (distracting ? 1.8 : 0.4) : 1));
      if (v < 60) continue; domains[dom] = v; visits[dom] = 1 + Math.round(rnd() * 12); total += v;
    }
    const shape = [0, 0, 0, 0, 0, 0, 0, .2, .5, 1, 1.1, 1, .6, .8, 1, 1, .9, .6, .5, .7, 1.1, 1.6, 1.4, .5];
    const sum = shape.reduce((a, b) => a + b, 0);
    let left = total; shape.forEach((w, h) => { if (!w) return; const v = Math.round(total * w / sum); hourly[h] = v; left -= v; }); hourly[21] += left;
    days[k] = { domains, visits, hourly, total };
    if (!weekend && rnd() > 0.35) focusLog[k] = { mins: 25 * (1 + Math.floor(rnd() * 3)), sessions: 1 + Math.floor(rnd() * 3) };
  }
  const now = Date.now();
  const plusIntents = [
    { ts: now - 3600e3, domain: 'youtube.com', text: 'Watching a lecture for my course' },
    { ts: now - 26 * 3600e3, domain: 'reddit.com', text: 'Honestly, just bored, "quick" look' },
    { ts: now - 50 * 3600e3, domain: 'youtube.com', text: 'Music while I work' }
  ];
  return { days, focusLog, plusIntents, categories: { 'news.bbc.co.uk': 'distracting' } };
}

async function fullShot(c, file) {
  const m = await c.send('Page.getLayoutMetrics');
  const cs = m.result.cssContentSize || m.result.contentSize;
  const s = await c.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: cs.width, height: Math.min(cs.height, 6000), scale: 1 } });
  fs.writeFileSync(file, Buffer.from(s.result.data, 'base64'));
  console.log('     screenshot ' + file);
}
const W = (c, w, h) => c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h || 900, deviceScaleFactor: 1, mobile: false });

withExtension(async ({ open, ev, plusKey }) => {
  check('test key signed', plusKey.startsWith('WWP1.'));
  const data = seed();

  // ---- 1. locked state (no key) ----
  const L = await open('dashboard/dashboard.html#reports');
  await ev(L, 'chrome.storage.local.set(' + JSON.stringify(data) + ')');
  await ev(L, 'renderReports()'); await sleep(400);
  check('locked: shows the reports lock card', await ev(L, "!!document.querySelector('#view-reports [data-plus-lock=reports]')"));
  check('locked: also history + coach locks', await ev(L, "!!document.querySelector('#view-reports [data-plus-lock=history]') && !!document.querySelector('#view-reports [data-plus-lock=coach]')"));
  check('locked: no real report or export buttons', await ev(L, "!document.getElementById('rpCsvDaily') && !document.getElementById('rpReport')"));
  await fullShot(L, path.join(OUT, 'ww-reports-locked.png'));

  // ---- 2. Overview / Trends still render for a free user ----
  const O = await open('dashboard/dashboard.html');
  await sleep(500);
  check('overview renders', await ev(O, "document.getElementById('scoreNum').textContent !== '–' && document.getElementById('catTotal').textContent"), await ev(O, "document.getElementById('catTotal').textContent"));
  await ev(O, "showView('trends')"); await sleep(600);
  check('trends renders the chart and table', await ev(O, "!!document.querySelector('#view-trends .trend-svg') && document.querySelectorAll('#view-trends table.sites tbody tr').length === 14"));
  await fullShot(O, path.join(OUT, 'ww-reports-trends.png'));

  // ---- 3. Plus on: the report ----
  await ev(L, 'chrome.storage.local.set({ plusKey: ' + JSON.stringify(plusKey) + ' })');
  const P = await open('dashboard/dashboard.html#reports');
  await sleep(600);
  check('plus: report rendered', await ev(P, "!!document.getElementById('rpReport')"));
  check('plus: no lock cards', await ev(P, "!document.querySelector('#view-reports .plus-lock')"));
  const sections = await ev(P, "[...document.querySelectorAll('#view-reports h3')].map(h => h.textContent).join(' | ')");
  check('plus: all sections present', ['Total screen time', 'Day by day', 'Best and hardest day', 'Top sites', 'Categories', 'Your hours', 'What your time adds up to', 'In your own words', 'Your weekly plan'].every(t => sections.includes(t)), sections);
  check('daily chart has bars + text alternative', await ev(P, "!!document.querySelector('#rpDailyChart svg[role=img][aria-label]') && document.querySelectorAll('#view-reports table.rp-sr tbody tr').length >= 1"));
  console.log('     hours:', await ev(P, "document.querySelector('#rpHourChart').parentNode.querySelector('.rp-p').textContent"));
  console.log('     adds up:', await ev(P, "document.querySelector('.rp-real').innerText.replace(/\\n+/g,' / ')"));
  check('intent text shown escaped', await ev(P, "document.querySelector('.rp-quotes').textContent.includes('\"quick\" look')"));
  check('coach without a key shows the Settings note', await ev(P, "document.getElementById('rpCoach').textContent.includes('Add it in Settings') && !!document.getElementById('rpGoSettings')"));
  check('no em dashes in the report text', await ev(P, "!document.getElementById('view-reports').innerText.includes('\\u2014')"));
  await fullShot(P, path.join(OUT, 'ww-reports-light-1280.png'));

  // ---- 4. ranges ----
  for (const k of ['last-week', 'this-month', 'last-month', 'days', 'this-week']) {
    await ev(P, "document.querySelector('#rpSeg button[data-k=\"" + k + "\"]').click()"); await sleep(300);
    const lab = await ev(P, "document.getElementById('rpRange').textContent + ' | total ' + document.querySelector('.rp-stat .rp-num').textContent");
    check('range ' + k, await ev(P, "document.querySelector('#rpSeg button.active').dataset.k === '" + k + "'"), lab);
  }
  await ev(P, "document.querySelector('#rpSeg button[data-k=days]').click()"); await sleep(300);
  await ev(P, "(() => { const i = document.getElementById('rpDaysIn'); i.value = '45'; i.dispatchEvent(new Event('change')); })()"); await sleep(400);
  check('custom 45 days', await ev(P, "rpCtx.period.n === 45 && document.getElementById('rpDaysIn').value === '45'"), await ev(P, "document.getElementById('rpRange').textContent"));
  await ev(P, "(() => { const i = document.getElementById('rpDaysIn'); i.value = '400'; i.dispatchEvent(new Event('change')); })()"); await sleep(400);
  check('custom 400 days (beyond the data) shows a history note', await ev(P, "!!document.querySelector('.rp-note') && document.querySelector('.rp-note').textContent.includes('history starts')"));
  await ev(P, "document.querySelector('#rpSeg button[data-k=\"this-week\"]').click()"); await sleep(300);

  // ---- 5. CSV export: capture the download instead of saving it ----
  await ev(P, "window.__dl = []; HTMLAnchorElement.prototype.click = function () { const a = this; window.__dl.push(fetch(a.href).then(r => r.text()).then(t => ({ name: a.download, text: t }))); }");
  await ev(P, "document.getElementById('rpCsvDaily').click(); document.getElementById('rpCsvSites').click()");
  const dl = await ev(P, "Promise.all(window.__dl).then(x => JSON.stringify(x))");
  const files = JSON.parse(dl);
  check('two CSV files', files.length === 2, files.map(f => f.name).join(', '));
  const daily = files[0].text.replace(/^﻿/, '').trim().split('\r\n');
  check('daily CSV header + one row per day', daily[0].startsWith('Date,Total seconds') && daily.length === 1 + (await ev(P, 'rpCtx.period.n')), daily.slice(0, 3).join(' / '));
  const sitesCsv = files[1].text.replace(/^﻿/, '').trim().split('\r\n');
  check('sites CSV has rows with categories', sitesCsv[0] === 'Date,Site,Category,Seconds,Visits' && /,(Productive|Neutral|Distracting),\d+,\d+$/.test(sitesCsv[1]), sitesCsv[1]);
  const csvTotal = daily.slice(1).reduce((a, l) => a + Number(l.split(',')[1]), 0);
  check('CSV total matches the report total (without the live session)', Math.abs(csvTotal - (await ev(P, "rpBuild(rpCtx.days, rpCtx.cats, rpCtx.period, {}).total"))) < 2, csvTotal);

  // ---- 6. print stylesheet ----
  await ev(P, "window.__printed = 0; window.print = () => { window.__printed = document.body.classList.contains('rp-print') ? 1 : -1; }");
  await ev(P, "document.getElementById('rpPrint').click()");
  check('print button prints with the report stylesheet on', (await ev(P, 'window.__printed')) === 1);
  await ev(P, "document.body.classList.add('rp-print')");
  await P.send('Emulation.setEmulatedMedia', { media: 'print' });
  check('print hides nav, toolbar and other views', await ev(P, "getComputedStyle(document.querySelector('.railnav')).display === 'none' && getComputedStyle(document.querySelector('.rp-toolbar')).display === 'none' && getComputedStyle(document.querySelector('.topbar')).display === 'none'"));
  const pdf = await P.send('Page.printToPDF', { printBackground: true, paperWidth: 8.27, paperHeight: 11.69 });
  if (pdf.result) { fs.writeFileSync(path.join(OUT, 'ww-reports-print.pdf'), Buffer.from(pdf.result.data, 'base64')); console.log('     pdf ' + path.join(OUT, 'ww-reports-print.pdf')); }
  await P.send('Emulation.setEmulatedMedia', { media: '' });
  await ev(P, "document.body.classList.remove('rp-print')");

  // ---- 7. coach with a key and a cached plan for this week (no real Gemini call) ----
  const plan = { observations: ['You spent 9h 40m on youtube.com, the most of any site.', 'Your busiest hours were between 9 and 11 pm.', 'You finished 6 focus sessions, 3h 20m in all.'],
    suggestions: [{ text: 'Keep YouTube for the evening and cap it.', site: 'youtube.com', limitMins: 60 }, { text: 'Start the day with one 25 minute focus session.', site: '', limitMins: 0 }, { text: 'Close Reddit after 10 pm.', site: 'reddit.com', limitMins: 20 }],
    encouragement: 'Your productive time is growing. Keep the small wins coming.' };
  await ev(P, "chrome.storage.local.set({ aiKey: 'fake-test-key', plusCoach: { week: rpWeekKey(Date.now()), at: Date.now(), plan: " + JSON.stringify(plan) + ", raw: '' } })");
  await ev(P, 'renderReports()'); await sleep(500);
  check('coach shows the cached plan and does not ask again', await ev(P, "document.querySelectorAll('#rpCoach .rp-plan li').length === 6 && document.getElementById('rpCoachGo').textContent === 'Make a fresh plan'"));
  check('coach suggested limit shown', await ev(P, "document.querySelector('#rpCoach .rp-limit').textContent"), await ev(P, "document.querySelector('#rpCoach .rp-limit').textContent"));
  await ev(P, "document.getElementById('rpCoach').scrollIntoView()");
  await fullShot(P, path.join(OUT, 'ww-reports-light-coach.png'));

  // ---- 8. dark mode + 900px ----
  await ev(P, "chrome.storage.local.get('settings').then(r => chrome.storage.local.set({ settings: Object.assign({}, r.settings, { darkMode: true }) })).then(() => applyTheme())");
  await ev(P, 'renderReports()'); await sleep(500);
  await fullShot(P, path.join(OUT, 'ww-reports-dark-1280.png'));
  await W(P, 900, 900); await ev(P, 'renderReports()'); await sleep(500);
  check('900px: no horizontal overflow', await ev(P, 'document.documentElement.scrollWidth <= 900'), await ev(P, 'document.documentElement.scrollWidth'));
  await fullShot(P, path.join(OUT, 'ww-reports-dark-900.png'));
  await ev(P, "chrome.storage.local.get('settings').then(r => chrome.storage.local.set({ settings: Object.assign({}, r.settings, { darkMode: false }) })).then(() => applyTheme())");
  await ev(P, 'renderReports()'); await sleep(500);
  await fullShot(P, path.join(OUT, 'ww-reports-light-900.png'));

  // ---- 9. empty range ----
  await ev(P, "chrome.storage.local.set({ days: {} })"); await ev(P, 'renderReports()'); await sleep(400);
  check('empty state', await ev(P, "!!document.querySelector('.rp-empty') && !document.getElementById('rpDailyChart')"));

  // ---- 10. history: Plus keeps more than 120 days, free trims as before ----
  const H = await ev(P, `(async () => {
    const mk = n => { const d = {}; for (let i = 0; i < n; i++) { const t = new Date(); t.setDate(t.getDate() - i - 1); d[dayKey(t.getTime())] = { domains: { 'a.com': 60 }, visits: {}, hourly: {}, total: 60 }; } return d; };
    await chrome.storage.local.set({ days: mk(200) });
    await setDay(dayKey(Date.now()), { domains: { 'a.com': 5 }, visits: {}, hourly: {}, total: 5 });
    const plusCount = Object.keys((await chrome.storage.local.get('days')).days).length;
    const flag = (await chrome.storage.local.get('historyKept')).historyKept;
    await plusRemove();
    await setDay(dayKey(Date.now()), { domains: { 'a.com': 9 }, visits: {}, hourly: {}, total: 9 });
    const lapsedSameDay = Object.keys((await chrome.storage.local.get('days')).days).length;
    const t = new Date(); t.setDate(t.getDate() + 1);
    await setDay(dayKey(t.getTime()), { domains: {}, visits: {}, hourly: {}, total: 0 });
    const lapsedNewDay = Object.keys((await chrome.storage.local.get('days')).days).length;
    await chrome.storage.local.remove('historyKept');
    await chrome.storage.local.set({ days: mk(130) });
    await setDay(dayKey(Date.now()), { domains: {}, visits: {}, hourly: {}, total: 0 });
    const freeCount = Object.keys((await chrome.storage.local.get('days')).days).length;
    return JSON.stringify({ plusCount, flag, lapsedSameDay, lapsedNewDay, freeCount });
  })()`);
  const h = JSON.parse(H);
  check('Plus keeps all 201 days and flags it', h.plusCount === 201 && h.flag === true, H);
  check('lapsed: nothing deleted on a same-day write', h.lapsedSameDay === 201);
  check('lapsed: a new day removes only two of the oldest', h.lapsedNewDay === 200);
  check('free user (never Plus): trimmed to 120 exactly as before', h.freeCount === 120);

  if (failures) { console.log(failures + ' check(s) failed'); process.exitCode = 1; } else console.log('all checks passed');
}, { w: 1280, h: 900 });
