// WebWell Plus: the Reports view (weekly and monthly reports, CSV / PDF export, AI weekly coach).
// Every number is worked out on this device by lib/reports.js. The only thing that can leave it
// is the short coach summary, and only when the person presses "Make my weekly plan".
'use strict';

let rpKind = 'this-week';
let rpDaysN = 14;
let rpSeq = 0;
let rpCtx = null;      // { days, cats, period } of the report on screen, for the export buttons

const RP_RANGES = [['this-week', 'This week'], ['last-week', 'Last week'], ['this-month', 'This month'], ['last-month', 'Last month'], ['days', 'Custom']];

const rpD = k => new Date(k + 'T12:00:00');
const rpShort = k => rpD(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const rpLong = k => rpD(k).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

function rpRangeText(p) {
  if (p.kind === 'last-month') return rpD(p.start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (p.start === p.end) return rpShort(p.start);
  return rpShort(p.start) + ' to ' + rpShort(p.end);
}
function rpPrevName(p) {
  return { 'this-week': 'the same days last week', 'last-week': 'the week before', 'this-month': 'the same days last month',
    'last-month': 'the month before' }[p.kind] || ('the ' + p.n + ' days before');
}
// Chart labels: weekday names for a week, day numbers for a month, short dates beyond that.
function rpBarLabel(k, n) {
  const d = rpD(k);
  if (n <= 8) return d.toLocaleDateString(undefined, { weekday: 'short' });
  if (n <= 31) return String(d.getDate());
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// "▲ 1h 20m more than last week (12%)". `goodWhenUp` flips the colour for things where more is
// better (productive time, focus minutes).
function rpChangeHtml(ch, prevName, goodWhenUp, compact) {
  if (!ch.base) return ch.cur > 0 ? '<span class="rp-chg none">' + (compact ? 'New' : 'Nothing tracked in ' + esc(prevName)) + '</span>' : '';
  if (ch.dir === 'same') return '<span class="rp-chg same">' + (compact ? 'Same' : 'About the same as ' + esc(prevName)) + '</span>';
  const up = ch.dir === 'up', good = up === !!goodWhenUp;
  // Whole minutes are plenty for a change; seconds only add noise here.
  const a = Math.abs(ch.delta), amt = a >= 3600 ? fmtDurShort(a).replace(/^(\d+h) 0?(\d+m)$/, '$1 $2') : Math.max(1, Math.round(a / 60)) + 'm';
  const pctTxt = Math.abs(ch.pct) >= 1 && Math.abs(ch.pct) < 1000 ? ' (' + Math.abs(ch.pct) + '%)' : '';
  const word = up ? 'more' : 'less';
  return '<span class="rp-chg ' + (good ? 'good' : 'bad') + '" title="' + esc(amt + ' ' + word + ' than ' + prevName) + '">' +
    '<span aria-hidden="true">' + (up ? '▲' : '▼') + '</span> ' + amt + (compact ? '<span class="rp-sr"> ' + word + '</span>' : ' ' + word + ' than ' + esc(prevName) + pctTxt) + '</span>';
}

function rpVerdict(s) {
  if (s >= 75) return 'Excellent focus.';
  if (s >= 55) return 'Solid, with room to trim distractions.';
  if (s >= 35) return 'Distractions took a big share.';
  return 'A tough stretch. Small changes add up.';
}

function rpStat(label, num, cap, extra) {
  return '<div class="card rp-stat rp-s3"><h3>' + label + '</h3><div class="rp-num">' + num + '</div><div class="rp-cap">' + cap + '</div>' + (extra ? '<div class="rp-stat-x">' + extra + '</div>' : '') + '</div>';
}

// Live seconds from the session in progress, so "today" matches the rest of the dashboard.
async function rpWithLive(days) {
  const today = dayKey(Date.now());
  try {
    const res = await chrome.runtime.sendMessage({ type: 'webwell-live' });
    const live = res && res.live;
    if (live && live.elapsed > 0) {
      const d = days[today] || { domains: {}, visits: {}, hourly: {}, total: 0 };
      const c = { domains: Object.assign({}, d.domains), visits: Object.assign({}, d.visits), hourly: Object.assign({}, d.hourly), total: (d.total || 0) + live.elapsed };
      c.domains[live.domain] = (c.domains[live.domain] || 0) + live.elapsed;
      const h = new Date().getHours(); c.hourly[h] = (c.hourly[h] || 0) + live.elapsed;
      days = Object.assign({}, days, { [today]: c });
    }
  } catch (e) { /* background asleep */ }
  return days;
}

/* ---------------- locked (not Plus) ---------------- */
function rpLockedHtml() {
  // A clearly labelled example, so people can see what a report looks like before buying.
  const sample = [3.1, 4.6, 2.4, 5.2, 3.8, 6.1, 4.4].map((h, i) => {
    const t = h * 3600; return { key: 'x' + i, label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i], total: t, prod: t * [.55, .5, .62, .3, .48, .2, .35][i], neut: t * .2, dist: t * [.25, .3, .18, .5, .32, .6, .45][i] };
  });
  return '<div class="rp-wrap">' +
    '<div class="rp-head"><div><h2 class="rp-title">Reports <span class="plus-badge">Plus</span></h2>' +
    '<p class="rp-sub">Weekly and monthly reports, worked out privately on this device.</p></div></div>' +
    plusLockHtml('reports') +
    '<div class="rp-preview" aria-hidden="true"><span class="rp-preview-tag">Example report</span>' +
      '<div class="rp-grid">' +
        rpStat('Total screen time', '29h 36m', 'Mon 20 Oct to Sun 26 Oct', '<span class="rp-chg good">▼ 2h 10m less than the week before</span>') +
        rpStat('Daily average', '4h 13m', 'per day with browsing') +
        rpStat('Best day', 'Wed', 'score 74 out of 100') +
        rpStat('Adds up to', '3.5 workdays', 'of 8 hours each') +
        '<div class="card rp-s12"><h3>Day by day</h3>' + svgDayBars(sample, 900, 'Example chart') + '</div>' +
      '</div></div>' +
    '<div class="rp-lock-row">' + plusLockHtml('history') + plusLockHtml('coach') + '</div>' +
    '</div>';
}

/* ---------------- the report ---------------- */
async function renderReports() {
  const el = document.getElementById('view-reports');
  const seq = ++rpSeq;
  const plus = typeof plusActive === 'function' && await plusActive();
  if (seq !== rpSeq) return;
  if (!plus) { rpCtx = null; el.innerHTML = rpLockedHtml(); plusWireLocks(el); return; }

  const r = await storeGet(['days', 'categories', 'focusLog', 'plusIntents', 'aiKey', 'plusCoach']);
  const days = await rpWithLive(r.days || {});
  if (seq !== rpSeq) return;
  const cats = r.categories || {};
  const now = Date.now();
  const period = rpPeriod(rpKind, now, rpDaysN);
  const rep = rpBuild(days, cats, period, { focusLog: r.focusLog, intents: r.plusIntents });
  rpCtx = { days, cats, period };
  const prevName = rpPrevName(period);
  const firstKey = Object.keys(days).filter(k => (days[k] || {}).total > 0).sort()[0] || '';

  const toolbar =
    '<div class="rp-toolbar" role="group" aria-label="Report period">' +
      '<div class="seg" id="rpSeg">' + RP_RANGES.map(([k, t]) =>
        '<button type="button" data-k="' + k + '" class="' + (rpKind === k ? 'active' : '') + '" aria-pressed="' + (rpKind === k) + '">' + t + '</button>').join('') + '</div>' +
      '<label class="rp-custom' + (rpKind === 'days' ? '' : ' hidden') + '" for="rpDaysIn">Last <input id="rpDaysIn" class="num-in" type="number" min="2" max="730" value="' + rpDaysN + '"> days</label>' +
      '<div class="rp-tools-r">' +
        '<button type="button" class="btn small ghost" id="rpCsvDaily" title="Download daily totals for this period as a CSV file">Daily CSV</button>' +
        '<button type="button" class="btn small ghost" id="rpCsvSites" title="Download seconds per site per day for this period as a CSV file">Sites CSV</button>' +
        '<button type="button" class="btn small" id="rpPrint">Print or save as PDF</button>' +
      '</div>' +
    '</div>';

  const head = '<div class="rp-head"><div><h2 class="rp-title">Reports</h2>' +
    '<p class="rp-sub" id="rpRange">' + esc(rpRangeText(period)) + ' · compared with ' + esc(prevName) + '</p></div>' +
    '<p class="rp-print-note">WebWell report, made ' + esc(new Date(now).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })) + '</p></div>';

  let body = '';
  if (rep.empty) {
    body = '<div class="card rp-empty rp-s12"><h3>Nothing tracked in this period yet</h3>' +
      '<p>' + (firstKey ? 'Your history starts on ' + esc(rpLong(firstKey)) + '. Try a longer range, such as This month or a custom number of days.'
        : 'Once WebWell has counted some browsing time, your report appears here.') + '</p></div>';
  } else {
    const notes = [];
    if (rep.activeDays < 3) notes.push('Only ' + rep.activeDays + ' day' + (rep.activeDays === 1 ? '' : 's') + ' with browsing in this period, so these numbers will settle as more days come in.');
    if (firstKey && firstKey > period.start) notes.push('Your history starts on ' + rpLong(firstKey) + ', so earlier days show as empty.');
    const notesHtml = notes.length ? '<div class="rp-note rp-s12" role="note">' + notes.map(esc).join(' ') + '</div>' : '';

    const realTop = rep.realLife.find(x => x.id === 'workdays') || rep.realLife.find(x => x.id === 'movies') || rep.realLife[0];
    const stats =
      rpStat('Total screen time', fmtDur(rep.total), esc(rep.period.n + ' day' + (rep.period.n === 1 ? '' : 's') + (period.includesToday ? ', today so far' : '')), rpChangeHtml(rep.change, prevName, false)) +
      rpStat('Daily average', fmtDur(rep.avg), 'per day with browsing (' + rep.activeDays + ' of ' + rep.period.n + ')', rep.prevAvg ? rpChangeHtml(rep.avgChange, prevName, false) : '') +
      rpStat('Productivity score', rep.score + '<span class="rp-of">/100</span>', rpVerdict(rep.score),
        rep.prevScore !== null ? '<span class="rp-chg ' + (rep.score > rep.prevScore ? 'good' : rep.score < rep.prevScore ? 'bad' : 'same') + '">' +
          (rep.score === rep.prevScore ? 'Same as ' : (rep.score > rep.prevScore ? '▲ ' : '▼ ') + Math.abs(rep.score - rep.prevScore) + ' points vs ') + esc(prevName) + '</span>' : '') +
      rpStat('Focus sessions', rep.focus.sessions ? fmtDurShort(rep.focus.mins * 60) : '0m',
        rep.focus.sessions ? rep.focus.sessions + ' session' + (rep.focus.sessions === 1 ? '' : 's') + ' on ' + rep.focus.days + ' day' + (rep.focus.days === 1 ? '' : 's') : 'No focus sessions in this period',
        rep.focus.sessions || rep.focus.prevSessions ? rpChangeHtml(rep.focus.change, prevName, true) : '');

    // daily chart (drawn below, once its card has a width) + hidden table for screen readers
    const busiest = rep.dayRows.reduce((a, d) => d.total > a.total ? d : a, rep.dayRows[0]);
    const chartSummary = 'Daily screen time, ' + rpRangeText(period) + '. Busiest day ' + rpShort(busiest.key) + ' with ' + fmtDur(busiest.total) + '.';
    const daily = '<div class="card rp-s8 rp-daily"><div class="rp-ct"><h3>Day by day</h3><div class="rp-legend" aria-hidden="true"><i class="lp"></i>Productive<i class="ln"></i>Neutral<i class="ld"></i>Distracting</div></div>' +
      '<div id="rpDailyChart" class="rp-chart" data-summary="' + esc(chartSummary) + '"></div>' +
      '<table class="rp-sr"><caption>Screen time per day</caption><thead><tr><th scope="col">Day</th><th scope="col">Screen time</th><th scope="col">Productive</th><th scope="col">Distracting</th><th scope="col">Score</th></tr></thead><tbody>' +
      rep.dayRows.map(d => '<tr><th scope="row">' + esc(rpLong(d.key)) + '</th><td>' + fmtDur(d.total) + '</td><td>' + fmtDur(d.prod) + '</td><td>' + fmtDur(d.dist) + '</td><td>' + (d.total ? d.score : '') + '</td></tr>').join('') +
      '</tbody></table></div>';

    const dayLine = (d, kind) => '<div class="rp-day ' + kind + '"><div class="rp-day-k">' + (kind === 'best' ? 'Best day' : 'Hardest day') + '</div>' +
      '<div class="rp-day-d">' + esc(rpLong(d.key)) + '</div>' +
      '<div class="rp-day-s"><b>' + d.score + '</b>/100 · ' + fmtDur(d.total) + '</div>' +
      '<div class="rp-day-m">' + (kind === 'best' ? fmtDur(d.prod) + ' productive' : fmtDur(d.dist) + ' on distracting sites') + '</div></div>';
    const bw = '<div class="card rp-s4"><h3>Best and hardest day</h3>' +
      (rep.best && rep.worst
        ? (rep.even ? '<p class="rp-p">Every day scored about the same, around ' + rep.best.score + ' out of 100. Nice and steady.</p>' : '<div class="rp-days">' + dayLine(rep.best, 'best') + dayLine(rep.worst, 'worst') + '</div>')
        : '<p class="rp-p rp-muted">Best and hardest days appear once two days each have at least 10 minutes tracked.</p>') +
      '<p class="rp-foot">By productivity score: productive time counts fully, neutral half, distracting none.</p></div>';

    const maxSite = Math.max(1, ...rep.sites.map(s => s.secs));
    const sites = '<div class="card rp-s7"><h3>Top sites</h3><p class="rp-foot rp-top">Change is against ' + esc(prevName) + '.</p>' +
      '<ol class="rp-sites">' + rep.sites.map(s =>
        '<li><span class="rp-site">' + iconImg(s.domain, 22) + '<span class="rp-dom">' + esc(s.domain) + '</span></span>' +
        '<span class="rp-bar" aria-hidden="true"><i style="width:' + Math.max(2, Math.round(s.secs / maxSite * 100)) + '%;background:' + CATEGORY_META[s.cat].color + '"></i></span>' +
        '<span class="rp-sv num">' + fmtDur(s.secs) + '</span>' +
        '<span class="rp-sc">' + rpChangeHtml(s.change, prevName, s.cat === 'productive', true) + '</span></li>').join('') + '</ol>' +
      (rep.dropped.length ? '<p class="rp-foot">Gone quiet: ' + rep.dropped.map(d => esc(d.domain) + ' (' + fmtDurShort(d.prev) + ' before)').join(', ') + '.</p>' : '') +
      (rep.siteCount > rep.sites.length ? '<p class="rp-foot">' + (rep.siteCount - rep.sites.length) + ' more sites in this period. The Sites CSV has all of them.</p>' : '') + '</div>';

    const catsCard = '<div class="card"><h3>Categories</h3>' +
      '<div class="rp-stack" role="img" aria-label="' + esc(rep.cats.map(c => c.label + ' ' + c.share + '%').join(', ')) + '">' +
      rep.cats.map(c => c.share ? '<i style="width:' + c.share + '%;background:' + CATEGORY_META[c.cat].color + '"></i>' : '').join('') + '</div>' +
      '<ul class="rp-cats">' + rep.cats.map(c =>
        '<li><span class="rp-dot" style="background:' + CATEGORY_META[c.cat].color + '" aria-hidden="true"></span><span class="rp-cl">' + c.label + '</span>' +
        '<span class="rp-cv num">' + fmtDur(c.secs) + ' <small>' + c.share + '%</small></span>' +
        '<span class="rp-cc">' + rpChangeHtml(c.change, prevName, c.cat === 'productive', true) + '</span></li>').join('') + '</ul></div>';

    let hourText = '';
    if (rep.peak) {
      hourText = '<p class="rp-p">You spend the most time online between <b>' + esc(rpWindowText(rep.peak.start, 2)) + '</b> (' + rep.peak.share + '% of your screen time).</p>';
      if (rep.distractPeak) hourText += '<p class="rp-p">' + (rep.distractPeak.start === rep.peak.start
        ? 'That is also when you lose the most time to distracting sites.'
        : 'You lose the most time to distracting sites between <b>' + esc(rpWindowText(rep.distractPeak.start, 2)) + '</b>.') + '</p>';
    } else hourText = '<p class="rp-p rp-muted">No hour-by-hour data for this period.</p>';
    const hours = '<div class="card ' + (rep.intents.present ? 'rp-s7' : 'rp-s6') + '"><h3>Your hours</h3>' + hourText +
      '<div id="rpHourChart" class="rp-chart" data-summary="' + esc(rep.peak ? 'Screen time by hour. Busiest between ' + rpWindowText(rep.peak.start, 2) + '.' : 'Screen time by hour') + '"></div>' +
      (rep.distractPeak ? '<p class="rp-foot">Distracting time per hour is estimated from each day\'s mix of sites.</p>' : '') + '</div>';

    const real = '<div class="card rp-real"><h3>What your time adds up to</h3>' +
      (realTop ? '<div class="rp-real-big">' + esc(realTop.text.replace(/ \(.*\)$/, '')) + '</div>' : '') +
      '<ul class="rp-real-list">' + rep.realLife.filter(x => x !== realTop).map(x => '<li>' + esc(x.text) + '</li>').join('') + '</ul>' +
      '<p class="rp-foot">' + fmtDur(rep.total) + ' in ' + rep.period.n + ' day' + (rep.period.n === 1 ? '' : 's') + '. Rounded, so treat these as a rough picture.</p></div>';

    let intents = '';
    if (rep.intents.present) {
      const it = rep.intents;
      intents = '<div class="card rp-s5 rp-intents"><h3>In your own words</h3>' +
        (it.total ? '<p class="rp-p">You gave a reason ' + it.total + ' time' + (it.total === 1 ? '' : 's') + ' before opening a blocked site' +
          (it.byDomain[0] ? ', most often for <b>' + esc(it.byDomain[0].domain) + '</b> (' + it.byDomain[0].count + ')' : '') + '.</p>' +
          '<ul class="rp-quotes">' + it.items.map(x => '<li><q>' + esc(x.text) + '</q><span>' + esc(x.domain) + ' · ' +
            esc(new Date(x.ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })) + ' ' +
            esc(new Date(x.ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })) + '</span></li>').join('') + '</ul>'
          : '<p class="rp-p rp-muted">No intent answers in this period.</p>') +
        '<p class="rp-foot">Only you see these. They are never sent anywhere, not even to the AI coach.</p></div>';
    }

    // Categories and the real-life card stack beside the (taller) top sites list.
    body = notesHtml + stats + daily + bw + sites + '<div class="rp-s5 rp-col">' + catsCard + real + '</div>' + hours + intents;
  }

  const coach = '<div class="card rp-coach ' + (rep.empty ? 'rp-s12' : rep.intents.present ? 'rp-s12' : 'rp-s6') + '" id="rpCoach"></div>';
  // Coach card sits next to the hours card, or gets its own row when the intents card takes that spot.
  el.innerHTML = '<div class="rp-wrap" id="rpReport">' + head + toolbar + '<div class="rp-grid">' + body + coach + '</div></div>';

  // Charts are drawn at their real width (like Trends) once the cards are in the page.
  const dc = document.getElementById('rpDailyChart');
  if (dc) dc.innerHTML = svgDayBars(rep.dayRows.map(d => ({ key: d.key, label: rpBarLabel(d.key, rep.period.n), total: d.total, prod: d.prod, neut: d.neut, dist: d.dist,
    title: rpShort(d.key) + ': ' + fmtDur(d.total) + (d.total ? ', score ' + d.score : '') })), dc.clientWidth, dc.dataset.summary);
  const hc = document.getElementById('rpHourChart');
  if (hc) hc.innerHTML = svgHourBars(rep.hourly, hc.clientWidth, rep.distractPeak ? rep.distractPeak.start : rep.peak ? rep.peak.start : -1, 2, hc.dataset.summary);

  rpWire(el, rep);
  rpRenderCoach(days, cats, r.focusLog, !!((r.aiKey || '').trim()), r.plusCoach);
}

function rpWire(el, rep) {
  el.querySelectorAll('#rpSeg button').forEach(b => b.addEventListener('click', () => { rpKind = b.dataset.k; renderReports(); }));
  const di = document.getElementById('rpDaysIn');
  if (di) di.addEventListener('change', () => {
    rpDaysN = Math.max(2, Math.min(730, parseInt(di.value, 10) || 14));
    renderReports().then(() => { const i = document.getElementById('rpDaysIn'); if (i) i.focus(); });
  });
  const fname = kind => 'webwell-' + kind + '-' + rpCtx.period.start + '-to-' + rpCtx.period.end + '.csv';
  document.getElementById('rpCsvDaily').addEventListener('click', () => rpDownload(fname('daily'), rpDailyCsv(rpCtx.days, rpCtx.cats, rpCtx.period.keys)));
  document.getElementById('rpCsvSites').addEventListener('click', () => rpDownload(fname('sites'), rpSitesCsv(rpCtx.days, rpCtx.cats, rpCtx.period.keys)));
  document.getElementById('rpPrint').addEventListener('click', rpPrint);
}

// A plain client-side download. Nothing is uploaded: the file is made from data already on the page.
function rpDownload(name, text) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));   // BOM so Excel reads UTF-8
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  if (typeof toast === 'function') toast('Saved ' + name);
}

// The print stylesheet (reports.css) only applies while body has .rp-print, so printing any
// other view is unchanged.
function rpPrint() {
  document.body.classList.add('rp-print');
  const done = () => { document.body.classList.remove('rp-print'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  try { window.print(); } finally { setTimeout(done, 1500); }
}

/* ---------------- AI weekly coach ---------------- */
function rpPlanHtml(rec) {
  const p = rec.plan;
  if (!p) return '<div class="rp-plan-raw">' + esc(rec.raw || '').split(/\n+/).map(l => '<p>' + l + '</p>').join('') + '</div>';
  return '<div class="rp-plan">' +
    '<div><h4>What stood out</h4><ul>' + p.observations.map(o => '<li>' + esc(o) + '</li>').join('') + '</ul></div>' +
    '<div><h4>Try this week</h4><ol>' + p.suggestions.map(s => '<li>' + esc(s.text) +
      (s.site && s.limitMins ? '<span class="rp-limit">Suggested limit: ' + esc(s.site) + ', ' + s.limitMins + ' min a day</span>' : '') + '</li>').join('') + '</ol></div>' +
    (p.encouragement ? '<p class="rp-cheer">' + esc(p.encouragement) + '</p>' : '') + '</div>';
}

function rpRenderCoach(days, cats, focusLog, hasKey, cached) {
  const box = document.getElementById('rpCoach'); if (!box) return;
  const week = rpWeekKey(Date.now());
  const thisWeek = cached && cached.week === week && (cached.plan || cached.raw);
  const older = cached && !thisWeek && (cached.plan || cached.raw);
  const privacy = '<p class="rp-foot rp-privacy">Only a short summary goes to Google: total times, category split and site names with minutes. ' +
    'No page addresses, no history and none of your own notes. It is sent only when you press the button, using your own Google AI key.</p>';
  const head = '<div class="rp-ct"><h3>Your weekly plan</h3><span class="tag-pill">AI coach · last 7 days</span></div>';

  if (!hasKey) {
    box.innerHTML = head + '<p class="rp-p">The coach uses your own Google AI key. Add it in Settings under AI features, then come back here.</p>' +
      '<div class="rp-coach-b"><button type="button" class="btn small" id="rpGoSettings">Open Settings</button></div>' + privacy;
    document.getElementById('rpGoSettings').addEventListener('click', () => showView('settings'));
    return;
  }
  const madeOn = rec => new Date(rec.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  box.innerHTML = head +
    (thisWeek ? rpPlanHtml(cached) + '<p class="rp-foot">Made on ' + esc(madeOn(cached)) + '. Saved, so it will not ask again this week unless you want a fresh one.</p>'
      : (older ? '<p class="rp-p">Ready for a new week. Your last plan was made on ' + esc(madeOn(cached)) + '.</p>' : '<p class="rp-p">Get three things that stood out this week, three small changes to try, with suggested limits, and a kind word to go with them.</p>')) +
    '<div class="rp-coach-b"><button type="button" class="btn small' + (thisWeek ? ' ghost' : '') + '" id="rpCoachGo">' + (thisWeek ? 'Make a fresh plan' : 'Make my weekly plan') + '</button>' +
    '<span class="rp-coach-msg" id="rpCoachMsg" role="status" aria-live="polite"></span></div>' + privacy;

  const btn = document.getElementById('rpCoachGo'), msg = document.getElementById('rpCoachMsg');
  btn.addEventListener('click', async () => {
    const rep = rpBuild(days, cats, rpPeriod('days', Date.now(), 7), { focusLog });
    if (rep.total < 1800) { msg.textContent = 'There is not much to go on yet. Come back after a few days of browsing.'; return; }
    btn.disabled = true; msg.classList.remove('bad'); msg.textContent = 'Making your plan…';
    try {
      await aiEnsureAccess();              // first, while the click still counts for the permission prompt
      const text = await aiGenerate(rpCoachPrompt(rpCoachSummary(rep)), 800);
      const plan = rpParseCoach(text);
      const rec = { week: rpWeekKey(Date.now()), at: Date.now(), plan, raw: plan ? '' : String(text).replace(/[—–]/g, ',').slice(0, 2000) };
      await storeSet({ plusCoach: rec });
      rpRenderCoach(days, cats, focusLog, true, rec);
    } catch (err) {
      btn.disabled = false; msg.classList.add('bad');
      msg.textContent = err.code === 'no-key' ? 'Add your Google AI key in Settings first.'
        : err.code === 'no-access' ? 'To make the plan, WebWell needs your OK to contact Google AI. Press the button again and choose Allow.'
          : /^api-4/.test(err.code || '') ? 'Google did not accept the request (' + err.message + '). Check your key in Settings.'
            : 'That did not work (' + err.message + '). Please try again in a moment.';
    }
  });
}
