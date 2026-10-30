// WebWell Plus: report calculations.
// Pure functions only: no DOM, no storage, no clock unless one is passed in. The Reports view
// (dashboard/reports-view.js) reads storage and draws; everything it shows is worked out here,
// so the maths can be unit tested in node (tools/test-plus-reports.js).
'use strict';

// In the dashboard these come from lib/time.js and lib/categories.js (loaded first); in node we
// require them, so the same file runs in both places.
const _RP_T = (typeof dayKey === 'function') ? { dayKey, fmtDur, fmtDurShort } : require('./time.js');
const _RP_C = (typeof categoryOf === 'function') ? { categoryOf, CATEGORY_META } : require('./categories.js');

const RP_MIN_DAY_SECS = 600;        // a day needs 10+ minutes before it can be "best" or "worst"
const RP_WAKING_HOURS = 16;         // used for "share of your waking time"
const RP_KINDS = ['this-week', 'last-week', 'this-month', 'last-month', 'days'];

// ---- day keys --------------------------------------------------------------------------
// Keys are local YYYY-MM-DD strings (dayKey). Parsing at local noon keeps DST changes from
// pushing a date into the day before or after.
function rpDate(key) { return new Date(key + 'T12:00:00'); }
function rpAddDays(key, n) { const d = rpDate(key); d.setDate(d.getDate() + n); return _RP_T.dayKey(d.getTime()); }
function rpSpan(startKey, endKey) {
  const out = [];
  // YYYY-MM-DD strings sort the same way as the dates, so a plain string compare is safe.
  for (let k = startKey, guard = 0; k <= endKey && guard < 40000; k = rpAddDays(k, 1), guard++) out.push(k);
  return out;
}
// Weeks run Monday to Sunday.
function rpWeekStart(key) { const d = rpDate(key); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return _RP_T.dayKey(d.getTime()); }
function rpMonthStart(key) { const d = rpDate(key); return _RP_T.dayKey(new Date(d.getFullYear(), d.getMonth(), 1, 12).getTime()); }
function rpMonthEnd(key) { const d = rpDate(key); return _RP_T.dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getTime()); }
function rpWeekKey(now) { return rpWeekStart(_RP_T.dayKey(now)); }

// The chosen range and the period it is compared with.
//   this-week   Monday..today        vs the same weekdays last week
//   last-week   last Mon..Sun        vs the week before
//   this-month  1st..today           vs the same days at the start of last month (cut at its end)
//   last-month  all of last month    vs the month before
//   days        last n days to today vs the n days before
// "This week" and "this month" are compared with the same stretch of the previous period, not
// the whole of it, so a Wednesday report is never measured against a full week.
function rpPeriod(kind, now, n) {
  if (RP_KINDS.indexOf(kind) === -1) kind = 'this-week';
  const today = _RP_T.dayKey(now);
  let start, end, pStart, pEnd;
  if (kind === 'this-week') {
    start = rpWeekStart(today); end = today;
    pStart = rpAddDays(start, -7); pEnd = rpAddDays(end, -7);
  } else if (kind === 'last-week') {
    start = rpAddDays(rpWeekStart(today), -7); end = rpAddDays(start, 6);
    pStart = rpAddDays(start, -7); pEnd = rpAddDays(start, -1);
  } else if (kind === 'this-month') {
    start = rpMonthStart(today); end = today;
    pStart = rpMonthStart(rpAddDays(start, -1));
    const len = rpSpan(start, end).length;
    const cap = rpAddDays(start, -1);                       // last day of the previous month
    const want = rpAddDays(pStart, len - 1);
    pEnd = want < cap ? want : cap;
  } else if (kind === 'last-month') {
    end = rpAddDays(rpMonthStart(today), -1); start = rpMonthStart(end);
    pEnd = rpAddDays(start, -1); pStart = rpMonthStart(pEnd);
  } else {
    n = Math.max(1, Math.min(3650, Math.round(Number(n) || 7)));
    end = today; start = rpAddDays(today, -(n - 1));
    pEnd = rpAddDays(start, -1); pStart = rpAddDays(start, -n);
  }
  const keys = rpSpan(start, end), prevKeys = rpSpan(pStart, pEnd);
  return { kind, today, start, end, keys, prevStart: pStart, prevEnd: pEnd, prevKeys, n: keys.length, prevN: prevKeys.length, includesToday: end === today };
}

// ---- small helpers ---------------------------------------------------------------------
function rpDayOf(days, k) { const d = days && days[k]; return d && typeof d === 'object' ? d : null; }
function rpNum(v) { return Number.isFinite(v) && v > 0 ? v : 0; }

// Same weighting as the dashboard's productivity score (productive 100, neutral 50, distracting 0).
function rpScore(prod, neut, dist) {
  const t = prod + neut + dist;
  if (!t) return 0;
  const M = _RP_C.CATEGORY_META;
  return Math.round((prod * M.productive.score + neut * M.neutral.score + dist * M.distracting.score) / t);
}

// Change of `cur` against `prev`. When the two periods differ in length (a 31-day month against a
// 30-day one) the previous total is scaled to the same number of days, so the comparison stays fair.
function rpChange(cur, prev, n, prevN) {
  cur = rpNum(cur); prev = rpNum(prev);
  if (!prev) return { base: false, cur, prev: 0, delta: cur, pct: 0, dir: cur > 0 ? 'new' : 'same' };
  const scaled = (n && prevN && n !== prevN) ? prev * n / prevN : prev;
  const delta = Math.round(cur - scaled);
  const pct = Math.round((delta / scaled) * 100);
  const dir = Math.abs(delta) < 60 ? 'same' : delta > 0 ? 'up' : 'down';  // under a minute is "about the same"
  return { base: true, cur, prev: Math.round(scaled), delta, pct, dir };
}

function rpSumDays(days, cats, keys) {
  const sites = {}, visits = {}, hourly = new Array(24).fill(0), distHourly = new Array(24).fill(0);
  const catSecs = { productive: 0, neutral: 0, distracting: 0 };
  const rows = [];
  let total = 0, active = 0;
  for (const k of keys) {
    const d = rpDayOf(days, k);
    const row = { key: k, total: 0, prod: 0, neut: 0, dist: 0, score: 0 };
    if (d) {
      const doms = d.domains || {}, vis = d.visits || {};
      for (const dom of Object.keys(doms)) {
        const s = rpNum(doms[dom]); if (!s) continue;
        const c = _RP_C.categoryOf(dom, cats);
        sites[dom] = (sites[dom] || 0) + s;
        visits[dom] = (visits[dom] || 0) + rpNum(vis[dom]);
        if (c === 'productive') row.prod += s; else if (c === 'distracting') row.dist += s; else row.neut += s;
      }
      // Prefer the stored total (it is what the rest of WebWell shows); fall back to the site sum.
      row.total = rpNum(d.total) || (row.prod + row.neut + row.dist);
      // Hourly data has no categories, so the distracting share of each hour is estimated from
      // that day's overall distracting share (the same estimate the Forecast card uses).
      const dShare = (row.prod + row.neut + row.dist) ? row.dist / (row.prod + row.neut + row.dist) : 0;
      const hr = d.hourly || {};
      for (let h = 0; h < 24; h++) { const v = rpNum(hr[h]); hourly[h] += v; distHourly[h] += v * dShare; }
    }
    row.score = rpScore(row.prod, row.neut, row.dist);
    catSecs.productive += row.prod; catSecs.neutral += row.neut; catSecs.distracting += row.dist;
    total += row.total;
    if (row.total > 0) active++;
    rows.push(row);
  }
  return { rows, total, active, sites, visits, catSecs, hourly, distHourly };
}

// Best and worst day by productivity score. Only days with 10+ minutes count, so a two-minute
// visit to one work site does not become the "best day".
function rpBestWorst(rows) {
  const cand = rows.filter(r => r.total >= RP_MIN_DAY_SECS);
  if (cand.length < 2) return { best: null, worst: null, even: false, candidates: cand.length };
  const best = cand.reduce((a, r) => (r.score > a.score || (r.score === a.score && r.prod > a.prod)) ? r : a, cand[0]);
  const worst = cand.reduce((a, r) => (r.score < a.score || (r.score === a.score && r.dist > a.dist)) ? r : a, cand[0]);
  return { best, worst, even: best.score - worst.score < 5, candidates: cand.length };
}

// The busiest stretch of `len` hours (it may wrap past midnight). Returns null when nothing was tracked.
function rpPeakWindow(hourly, len) {
  len = len || 2;
  let bestH = -1, bestV = 0, all = 0;
  for (let h = 0; h < 24; h++) all += rpNum(hourly[h]);
  for (let h = 0; h < 24; h++) {
    let v = 0; for (let i = 0; i < len; i++) v += rpNum(hourly[(h + i) % 24]);
    if (v > bestV) { bestV = v; bestH = h; }
  }
  return bestH < 0 ? null : { start: bestH, len, secs: Math.round(bestV), share: all ? Math.round(bestV / all * 100) : 0 };
}

function rpHourWord(h) {
  h = ((h % 24) + 24) % 24;
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  return (h % 12) + (h < 12 ? ' am' : ' pm');
}
// "9 and 11 pm", "11 am and 1 pm", "10 pm and midnight"
function rpWindowText(start, len) {
  const a = ((start % 24) + 24) % 24, b = (a + (len || 2)) % 24;
  const wa = rpHourWord(a), wb = rpHourWord(b);
  const plain = x => x !== 0 && x !== 12;
  if (plain(a) && plain(b) && (a < 12) === (b < 12)) return (a % 12) + ' and ' + wb;
  return wa + ' and ' + wb;
}

// "about 2", "about 1.5", "about 12". Under one returns null so callers can skip the line.
function rpAbout(x) {
  if (!(x >= 0.75)) return null;
  if (x < 10) { const r = Math.round(x * 2) / 2; return String(r); }
  return String(Math.round(x));
}
const rpPlural = (numStr, one, many) => numStr + ' ' + (numStr === '1' ? one : many);

// What the time adds up to, in everyday terms. Every line states its own yardstick (8-hour
// workday, 2-hour film, 16 waking hours) so the numbers stay honest rather than dramatic.
function rpRealLife(totalSecs, nDays, distSecs) {
  const out = [];
  totalSecs = rpNum(totalSecs); distSecs = rpNum(distSecs); nDays = Math.max(1, nDays || 1);
  if (!totalSecs) return out;
  const hours = totalSecs / 3600;
  const wd = rpAbout(totalSecs / (8 * 3600));
  if (wd) out.push({ id: 'workdays', value: Number(wd), text: 'About ' + rpPlural(wd, 'full workday', 'full workdays') + ' (8 hours each)' });
  const mv = rpAbout(totalSecs / (2 * 3600));
  if (mv) out.push({ id: 'movies', value: Number(mv), text: 'About ' + rpPlural(mv, 'film', 'films') + ' back to back (2 hours each)' });
  if (!wd && !mv) out.push({ id: 'hours', value: Math.round(hours * 10) / 10, text: 'About ' + (hours < 1 ? Math.round(totalSecs / 60) + ' minutes' : Math.round(hours * 10) / 10 + ' hours') + ' in total' });
  const waking = Math.round(totalSecs / (nDays * RP_WAKING_HOURS * 3600) * 100);
  out.push({ id: 'waking', value: waking, text: (waking < 1 ? 'Under 1%' : waking + '%') + ' of your waking time (counting 16 awake hours a day)' });
  const ep = rpAbout(distSecs / (45 * 60));
  if (ep) out.push({ id: 'episodes', value: Number(ep), text: 'Distracting sites alone: about ' + rpPlural(ep, 'TV episode', 'TV episodes') + ' (45 minutes each)' });
  const yearDays = (totalSecs / nDays) * 365 / 86400;
  const yd = rpAbout(yearDays);
  if (yd && nDays >= 3) out.push({ id: 'year', value: Number(yd), text: 'At this pace, about ' + rpPlural(yd, 'full day', 'full days') + ' a year, around the clock' });
  return out;
}

// Intent answers written by the Intent check feature: [{ ts, domain, text }]. Read only, and
// tolerant of a missing key or an older object-shaped value.
function rpIntents(raw, keys, limit) {
  if (raw === undefined || raw === null) return { present: false, items: [], total: 0, byDomain: [] };
  let list = Array.isArray(raw) ? raw : (typeof raw === 'object' ? [].concat.apply([], Object.values(raw).map(v => Array.isArray(v) ? v : [v])) : []);
  const inRange = new Set(keys);
  list = list.filter(x => x && Number.isFinite(x.ts) && typeof x.text === 'string' && x.text.trim() && inRange.has(_RP_T.dayKey(x.ts)))
    .map(x => ({ ts: x.ts, domain: String(x.domain || ''), text: x.text.trim().slice(0, 280) }))
    .sort((a, b) => b.ts - a.ts);
  const counts = {};
  for (const x of list) if (x.domain) counts[x.domain] = (counts[x.domain] || 0) + 1;
  const byDomain = Object.keys(counts).map(d => ({ domain: d, count: counts[d] })).sort((a, b) => b.count - a.count);
  return { present: true, items: list.slice(0, limit || 12), total: list.length, byDomain };
}

function rpFocus(log, keys) {
  let mins = 0, sessions = 0, days = 0;
  if (log && typeof log === 'object') for (const k of keys) {
    const f = log[k]; if (!f) continue;
    const m = rpNum(f.mins), s = rpNum(f.sessions);
    mins += m; sessions += s; if (m || s) days++;
  }
  return { mins, sessions, days };
}

// The whole report for one period. `opts`: { focusLog, intents, topN }
function rpBuild(days, cats, period, opts) {
  opts = opts || {};
  days = days || {}; cats = cats || {};
  const cur = rpSumDays(days, cats, period.keys);
  const prev = rpSumDays(days, cats, period.prevKeys);
  const n = period.n, pn = period.prevN;
  const topN = opts.topN || 8;
  const sites = Object.keys(cur.sites).map(d => ({
    domain: d, secs: cur.sites[d], visits: cur.visits[d] || 0, cat: _RP_C.categoryOf(d, cats),
    change: rpChange(cur.sites[d], prev.sites[d] || 0, n, pn)
  })).sort((a, b) => b.secs - a.secs);
  // Sites that dropped out of the top list completely are worth a mention too.
  const dropped = Object.keys(prev.sites).filter(d => !cur.sites[d] && prev.sites[d] >= 1800)
    .map(d => ({ domain: d, prev: prev.sites[d], cat: _RP_C.categoryOf(d, cats) })).sort((a, b) => b.prev - a.prev).slice(0, 3);
  const catList = ['productive', 'neutral', 'distracting'].map(c => ({
    cat: c, label: _RP_C.CATEGORY_META[c].label, secs: cur.catSecs[c],
    share: cur.total ? Math.round(cur.catSecs[c] / cur.total * 100) : 0,
    change: rpChange(cur.catSecs[c], prev.catSecs[c], n, pn)
  }));
  const bw = rpBestWorst(cur.rows);
  const peak = rpPeakWindow(cur.hourly, 2);
  const dpk = rpPeakWindow(cur.distHourly, 2);
  const distractPeak = dpk && dpk.secs >= 900 ? dpk : null;   // under 15 minutes is not a pattern
  const focus = rpFocus(opts.focusLog, period.keys), prevFocus = rpFocus(opts.focusLog, period.prevKeys);
  const tracked = cur.catSecs.productive + cur.catSecs.neutral + cur.catSecs.distracting;
  return {
    period,
    total: cur.total, prevTotal: prev.total,
    change: rpChange(cur.total, prev.total, n, pn),
    activeDays: cur.active, prevActiveDays: prev.active,
    avg: cur.active ? Math.round(cur.total / cur.active) : 0,
    prevAvg: prev.active ? Math.round(prev.total / prev.active) : 0,
    avgChange: rpChange(cur.active ? cur.total / cur.active : 0, prev.active ? prev.total / prev.active : 0),
    score: rpScore(cur.catSecs.productive, cur.catSecs.neutral, cur.catSecs.distracting),
    prevScore: prev.total ? rpScore(prev.catSecs.productive, prev.catSecs.neutral, prev.catSecs.distracting) : null,
    dayRows: cur.rows,
    best: bw.best, worst: bw.worst, even: bw.even, bestCandidates: bw.candidates,
    sites: sites.slice(0, topN), siteCount: sites.length, dropped,
    cats: catList,
    hourly: cur.hourly.map(v => Math.round(v)),
    peak, distractPeak,
    realLife: rpRealLife(cur.total, n, cur.catSecs.distracting),
    focus: Object.assign(focus, { prevMins: prevFocus.mins, prevSessions: prevFocus.sessions, change: rpChange(focus.mins * 60, prevFocus.mins * 60, n, pn) }),
    intents: rpIntents(opts.intents, period.keys, 12),
    empty: cur.total <= 0 && tracked <= 0
  };
}

// ---- CSV ---------------------------------------------------------------------------------
// RFC 4180 quoting, plus a guard against spreadsheet formulas: a text cell that starts with
// = + - @ (or a tab / carriage return) gets a leading apostrophe so Excel shows it as text.
function rpCsvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function rpCsv(rows) { return rows.map(r => r.map(rpCsvCell).join(',')).join('\r\n') + '\r\n'; }

function rpDailyCsv(days, cats, keys) {
  const s = rpSumDays(days || {}, cats || {}, keys);
  const rows = [['Date', 'Total seconds', 'Total minutes', 'Productive seconds', 'Neutral seconds', 'Distracting seconds', 'Score', 'Sites']];
  s.rows.forEach(r => {
    const d = rpDayOf(days, r.key);
    const nSites = d ? Object.keys(d.domains || {}).filter(x => rpNum(d.domains[x]) > 0).length : 0;
    rows.push([r.key, Math.round(r.total), Math.round(r.total / 6) / 10, Math.round(r.prod), Math.round(r.neut), Math.round(r.dist), r.total ? r.score : '', nSites]);
  });
  return rpCsv(rows);
}
function rpSitesCsv(days, cats, keys) {
  const rows = [['Date', 'Site', 'Category', 'Seconds', 'Visits']];
  for (const k of keys) {
    const d = rpDayOf(days, k); if (!d) continue;
    const doms = d.domains || {}, vis = d.visits || {};
    Object.keys(doms).filter(x => rpNum(doms[x]) > 0).sort((a, b) => doms[b] - doms[a])
      .forEach(x => rows.push([k, x, _RP_C.CATEGORY_META[_RP_C.categoryOf(x, cats || {})].label, Math.round(doms[x]), rpNum(vis[x])]));
  }
  return rpCsv(rows);
}

// ---- AI weekly coach -----------------------------------------------------------------------
// A compact, privacy-minded summary: totals, category split, and domain names with times.
// No page addresses, no titles, and never the person's own intent answers.
function rpCoachSummary(rep) {
  const F = _RP_T.fmtDurShort;
  const L = [];
  const wd = k => rpDate(k).toLocaleDateString('en-US', { weekday: 'long' });
  L.push('Period: ' + rep.period.n + ' days (' + rep.activeDays + ' with browsing).');
  L.push('Total screen time: ' + F(rep.total) + ', about ' + F(rep.avg) + ' per browsing day.' +
    (rep.change.base ? ' The ' + rep.period.prevN + ' days before: ' + F(rep.prevTotal) + '.' : ''));
  L.push('Split: ' + rep.cats.map(c => c.label.toLowerCase() + ' ' + F(c.secs) + ' (' + c.share + '%)').join(', ') + '. Score ' + rep.score + '/100.');
  if (rep.sites.length) L.push('Top sites: ' + rep.sites.slice(0, 10).map(s => s.domain + ' ' + F(s.secs) + ' [' + s.cat +
    (s.change.base && s.change.dir !== 'same' ? ', ' + (s.change.dir === 'up' ? 'up ' : 'down ') + F(Math.abs(s.change.delta)) : s.change.base ? '' : ', new') + ']').join('; ') + '.');
  if (rep.peak) L.push('Busiest hours: between ' + rpWindowText(rep.peak.start, 2) + ' (' + rep.peak.share + '% of the time).');
  if (rep.distractPeak) L.push('Most distracted: between ' + rpWindowText(rep.distractPeak.start, 2) + '.');
  if (rep.best && rep.worst && !rep.even) L.push('Best day: ' + wd(rep.best.key) + ' (score ' + rep.best.score + '). Hardest day: ' + wd(rep.worst.key) + ' (score ' + rep.worst.score + ').');
  L.push('Focus sessions: ' + rep.focus.sessions + ' (' + F(rep.focus.mins * 60) + ').');
  return L.join('\n');
}

function rpCoachPrompt(summary) {
  return 'You are WebWell, a kind and practical digital-wellbeing coach inside a browser extension. ' +
    'Below is a short summary of one person\'s own browsing over the last week, tracked privately on their device. ' +
    'Use ONLY these numbers, never invent sites or times. Plain everyday words, warm and specific, no jargon, no em dashes.\n\n' +
    '--- summary ---\n' + summary + '\n--- end ---\n\n' +
    'Reply with JSON only, no code fences, in exactly this shape:\n' +
    '{"observations":["...","...","..."],"suggestions":[{"text":"...","site":"example.com or empty","limitMins":30},{"text":"...","site":"","limitMins":0},{"text":"...","site":"","limitMins":0}],"encouragement":"..."}\n' +
    'Rules: 3 observations (one sentence each, each naming a real number from the summary). 3 concrete suggestions for the coming week; ' +
    'when a suggestion is about one site, put it in "site" and a realistic daily limit in minutes in "limitMins" (a bit below their current daily average for it), otherwise use "" and 0. ' +
    'One short encouraging line. Under 160 words in total.';
}

const rpClean = s => String(s || '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, 320);
// Gemini usually follows the JSON shape, but sometimes wraps it in a code fence or adds a line
// of text. Pull out the first {...} block; when that fails return null so the view can show the
// reply as plain text instead of losing it.
function rpParseCoach(text) {
  if (!text) return null;
  const t = String(text).replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let j; try { j = JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
  if (!j || !Array.isArray(j.observations) || !Array.isArray(j.suggestions)) return null;
  const observations = j.observations.map(rpClean).filter(Boolean).slice(0, 3);
  const suggestions = j.suggestions.map(s => typeof s === 'string' ? { text: s } : (s || {})).map(s => ({
    text: rpClean(s.text), site: /^[a-z0-9.-]{1,80}$/i.test(String(s.site || '').trim()) ? String(s.site).trim().toLowerCase() : '',
    limitMins: Math.max(0, Math.min(600, Math.round(Number(s.limitMins) || 0)))
  })).filter(s => s.text).slice(0, 3);
  if (!observations.length && !suggestions.length) return null;
  return { observations, suggestions, encouragement: rpClean(j.encouragement) };
}

if (typeof module !== 'undefined') {
  module.exports = { rpPeriod, rpSpan, rpAddDays, rpWeekStart, rpMonthStart, rpMonthEnd, rpWeekKey, rpScore, rpChange, rpSumDays,
    rpBestWorst, rpPeakWindow, rpWindowText, rpHourWord, rpAbout, rpRealLife, rpIntents, rpFocus, rpBuild, rpCsvCell, rpCsv,
    rpDailyCsv, rpSitesCsv, rpCoachSummary, rpCoachPrompt, rpParseCoach, RP_MIN_DAY_SECS };
}
