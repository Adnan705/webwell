// Unit tests for lib/reports.js (WebWell Plus reports maths). Run: node tools/test-plus-reports.js
'use strict';
const assert = require('assert');
const path = require('path');
const R = require(path.join(__dirname, '..', 'lib', 'reports.js'));
const { dayKey } = require(path.join(__dirname, '..', 'lib', 'time.js'));

let pass = 0, fail = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
const at = (y, m, d, h) => new Date(y, m - 1, d, h || 15, 0, 0).getTime();   // local time, like the extension
const day = (doms, hourly) => {
  const total = Object.values(doms).reduce((a, b) => a + b, 0);
  return { domains: doms, visits: Object.fromEntries(Object.keys(doms).map(d => [d, 3])), hourly: hourly || { 10: total }, total };
};

console.log('periods');
ok('this week runs Monday to today, compared with the same weekdays last week', () => {
  const p = R.rpPeriod('this-week', at(2026, 10, 29), 0);     // Thursday 29 Oct 2026
  assert.strictEqual(p.start, '2026-10-26'); assert.strictEqual(p.end, '2026-10-29'); assert.strictEqual(p.n, 4);
  assert.strictEqual(p.prevStart, '2026-10-19'); assert.strictEqual(p.prevEnd, '2026-10-22'); assert.strictEqual(p.prevN, 4);
  assert(p.includesToday);
});
ok('this week on a Monday is one day; on a Sunday it is seven', () => {
  assert.strictEqual(R.rpPeriod('this-week', at(2026, 10, 26), 0).n, 1);
  const s = R.rpPeriod('this-week', at(2026, 11, 1), 0); assert.strictEqual(s.n, 7); assert.strictEqual(s.start, '2026-10-26');
});
ok('last week is the previous full Monday to Sunday, across a month boundary', () => {
  const p = R.rpPeriod('last-week', at(2026, 11, 4), 0);      // Wed 4 Nov
  assert.strictEqual(p.start, '2026-10-26'); assert.strictEqual(p.end, '2026-11-01'); assert.strictEqual(p.n, 7);
  assert.strictEqual(p.prevStart, '2026-10-19'); assert.strictEqual(p.prevEnd, '2026-10-25');
  assert(!p.includesToday);
});
ok('last week across a year boundary', () => {
  const p = R.rpPeriod('last-week', at(2027, 1, 6), 0);       // Wed 6 Jan 2027
  assert.strictEqual(p.start, '2026-12-28'); assert.strictEqual(p.end, '2027-01-03');
});
ok('this month on the 31st compares with the whole shorter month before (cut at its end)', () => {
  const p = R.rpPeriod('this-month', at(2026, 3, 31), 0);
  assert.strictEqual(p.start, '2026-03-01'); assert.strictEqual(p.n, 31);
  assert.strictEqual(p.prevStart, '2026-02-01'); assert.strictEqual(p.prevEnd, '2026-02-28'); assert.strictEqual(p.prevN, 28);
});
ok('leap year: February 2028 has 29 days', () => {
  const p = R.rpPeriod('last-month', at(2028, 3, 10), 0);
  assert.strictEqual(p.start, '2028-02-01'); assert.strictEqual(p.end, '2028-02-29'); assert.strictEqual(p.n, 29);
  assert.strictEqual(p.prevStart, '2028-01-01'); assert.strictEqual(p.prevEnd, '2028-01-31');
  const q = R.rpPeriod('this-month', at(2028, 3, 30), 0);
  assert.strictEqual(q.prevEnd, '2028-02-29'); assert.strictEqual(q.prevN, 29);
  assert.strictEqual(R.rpMonthEnd('2100-02-10'), '2100-02-28');   // 2100 is not a leap year
  assert.strictEqual(R.rpMonthEnd('2000-02-10'), '2000-02-29');   // 2000 is
});
ok('this month on the 10th compares with the 1st to the 10th of last month', () => {
  const p = R.rpPeriod('this-month', at(2026, 10, 10), 0);
  assert.strictEqual(p.prevStart, '2026-09-01'); assert.strictEqual(p.prevEnd, '2026-09-10');
});
ok('last month in January is December of last year', () => {
  const p = R.rpPeriod('last-month', at(2027, 1, 15), 0);
  assert.strictEqual(p.start, '2026-12-01'); assert.strictEqual(p.end, '2026-12-31');
  assert.strictEqual(p.prevStart, '2026-11-01'); assert.strictEqual(p.prevEnd, '2026-11-30');
});
ok('custom last N days and the N days before', () => {
  const p = R.rpPeriod('days', at(2026, 3, 2), 5);
  assert.deepStrictEqual(p.keys, ['2026-02-26', '2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  assert.strictEqual(p.prevStart, '2026-02-21'); assert.strictEqual(p.prevEnd, '2026-02-25');
  assert.strictEqual(R.rpPeriod('days', at(2026, 3, 2), 0).n, 7, 'bad n falls back to 7');
  assert.strictEqual(R.rpPeriod('nonsense', at(2026, 10, 29)).kind, 'this-week');
});
ok('spans stay correct across a DST change (last Sunday of March / October)', () => {
  assert.strictEqual(R.rpSpan('2026-03-27', '2026-04-02').length, 7);
  assert.strictEqual(R.rpSpan('2026-10-23', '2026-10-29').length, 7);
  assert.strictEqual(R.rpAddDays('2026-03-29', 1), '2026-03-30');
});
ok('week key is the Monday', () => { assert.strictEqual(R.rpWeekKey(at(2026, 10, 30)), '2026-10-26'); });

console.log('comparison');
ok('change against the previous period', () => {
  const c = R.rpChange(7200, 3600, 7, 7);
  assert.strictEqual(c.delta, 3600); assert.strictEqual(c.pct, 100); assert.strictEqual(c.dir, 'up');
  assert.strictEqual(R.rpChange(1800, 3600, 7, 7).dir, 'down');
  assert.strictEqual(R.rpChange(3630, 3600, 7, 7).dir, 'same', 'under a minute is the same');
  const none = R.rpChange(500, 0, 7, 7); assert.strictEqual(none.base, false); assert.strictEqual(none.dir, 'new');
});
ok('unequal lengths are scaled per day (31 vs 28 days)', () => {
  const c = R.rpChange(31 * 3600, 28 * 3600, 31, 28);   // the same hour a day
  assert.strictEqual(c.dir, 'same'); assert.strictEqual(c.prev, 31 * 3600);
});
ok('report compares sites and categories with the previous period', () => {
  const days = {
    '2026-10-26': day({ 'youtube.com': 3600, 'github.com': 1800 }),
    '2026-10-27': day({ 'youtube.com': 1800, 'github.com': 3600 }),
    '2026-10-19': day({ 'youtube.com': 1200, 'reddit.com': 4000 }),
    '2026-10-20': day({ 'github.com': 600 })
  };
  const p = R.rpPeriod('this-week', at(2026, 10, 27), 0);
  const rep = R.rpBuild(days, {}, p, {});
  assert.strictEqual(rep.total, 10800); assert.strictEqual(rep.prevTotal, 5800);
  assert.strictEqual(rep.activeDays, 2); assert.strictEqual(rep.avg, 5400);
  const yt = rep.sites.find(s => s.domain === 'youtube.com');
  assert.strictEqual(yt.secs, 5400); assert.strictEqual(yt.change.delta, 4200); assert.strictEqual(yt.cat, 'distracting');
  const gh = rep.sites.find(s => s.domain === 'github.com'); assert.strictEqual(gh.change.delta, 4800);
  assert.deepStrictEqual(rep.dropped.map(d => d.domain), ['reddit.com']);
  const dist = rep.cats.find(c => c.cat === 'distracting'); assert.strictEqual(dist.secs, 5400); assert.strictEqual(dist.share, 50);
  assert.strictEqual(dist.change.delta, 5400 - 5200);
});
ok('user category overrides are respected', () => {
  const rep = R.rpBuild({ '2026-10-26': day({ 'youtube.com': 3600 }) }, { 'youtube.com': 'productive' }, R.rpPeriod('this-week', at(2026, 10, 26)), {});
  assert.strictEqual(rep.sites[0].cat, 'productive'); assert.strictEqual(rep.score, 100);
});
ok('empty range is flagged and safe', () => {
  const rep = R.rpBuild({}, {}, R.rpPeriod('last-month', at(2026, 10, 29)), {});
  assert(rep.empty); assert.strictEqual(rep.total, 0); assert.strictEqual(rep.best, null); assert.strictEqual(rep.peak, null);
  assert.deepStrictEqual(rep.realLife, []); assert.strictEqual(rep.avg, 0); assert.strictEqual(rep.intents.present, false);
});
ok('broken day entries do not crash', () => {
  const rep = R.rpBuild({ '2026-10-26': null, '2026-10-27': { total: 'x' }, '2026-10-28': { domains: { 'a.com': -5, 'b.com': 120 } } }, {}, R.rpPeriod('this-week', at(2026, 10, 28)), {});
  assert.strictEqual(rep.total, 120);
});

console.log('best and worst day');
ok('best and worst by productivity score, ignoring tiny days', () => {
  const days = {
    '2026-10-26': day({ 'github.com': 3000, 'youtube.com': 600 }),     // score 83
    '2026-10-27': day({ 'youtube.com': 3000, 'github.com': 600 }),     // 17
    '2026-10-28': day({ 'github.com': 300 }),                         // 100 but only 5 min
    '2026-10-29': day({ 'example.com': 3600 })                        // 50
  };
  const rep = R.rpBuild(days, {}, R.rpPeriod('this-week', at(2026, 10, 29)), {});
  assert.strictEqual(rep.best.key, '2026-10-26'); assert.strictEqual(rep.worst.key, '2026-10-27');
  assert.strictEqual(rep.best.score, 83); assert.strictEqual(rep.worst.score, 17); assert(!rep.even);
});
ok('fewer than two real days gives no best/worst', () => {
  const rep = R.rpBuild({ '2026-10-26': day({ 'github.com': 3000 }) }, {}, R.rpPeriod('this-week', at(2026, 10, 27)), {});
  assert.strictEqual(rep.best, null); assert.strictEqual(rep.bestCandidates, 1);
});
ok('days that all score the same are reported as even', () => {
  const rep = R.rpBuild({ '2026-10-26': day({ 'a.com': 3000 }), '2026-10-27': day({ 'b.com': 2000 }) }, {}, R.rpPeriod('this-week', at(2026, 10, 27)), {});
  assert(rep.even);
});

console.log('hour pattern');
ok('finds the busiest two hours and words them naturally', () => {
  const h = new Array(24).fill(0); h[21] = 3000; h[22] = 2800; h[9] = 2000;
  const w = R.rpPeakWindow(h, 2); assert.strictEqual(w.start, 21); assert.strictEqual(w.secs, 5800);
  assert.strictEqual(R.rpWindowText(21, 2), '9 and 11 pm');
  assert.strictEqual(R.rpWindowText(11, 2), '11 am and 1 pm');
  assert.strictEqual(R.rpWindowText(22, 2), '10 pm and midnight');
  assert.strictEqual(R.rpWindowText(23, 2), '11 pm and 1 am');
  assert.strictEqual(R.rpWindowText(10, 2), '10 am and noon');
  assert.strictEqual(R.rpWindowText(0, 2), 'midnight and 2 am');
  assert.strictEqual(R.rpWindowText(7, 2), '7 and 9 am');
});
ok('window wraps past midnight', () => {
  const h = new Array(24).fill(0); h[23] = 1000; h[0] = 1000;
  assert.strictEqual(R.rpPeakWindow(h, 2).start, 23);
  assert.strictEqual(R.rpPeakWindow(new Array(24).fill(0), 2), null);
});
ok('distracting hours come from each day\'s distracting share', () => {
  const days = {
    '2026-10-26': day({ 'github.com': 7200 }, { 9: 3600, 10: 3600 }),
    '2026-10-27': day({ 'youtube.com': 7200 }, { 21: 3600, 22: 3600 })
  };
  const rep = R.rpBuild(days, {}, R.rpPeriod('this-week', at(2026, 10, 27)), {});
  assert.strictEqual(rep.distractPeak.start, 21);
  assert.strictEqual(rep.hourly[9], 3600);
});

console.log('real-life terms');
ok('workdays, films, waking share and yearly pace', () => {
  const L = R.rpRealLife(16 * 3600, 7, 9 * 3600);
  const get = id => L.find(x => x.id === id);
  assert.strictEqual(get('workdays').text, 'About 2 full workdays (8 hours each)');
  assert.strictEqual(get('movies').text, 'About 8 films back to back (2 hours each)');
  assert.strictEqual(get('waking').value, 14);                 // 16h / (7 * 16h)
  assert.strictEqual(get('episodes').value, 12);               // 9h / 45m
  assert.strictEqual(get('year').value, 35);                   // 16/7 h a day * 365 / 24
  assert(L.every(x => x.text.indexOf('—') === -1), 'no em dashes');
});
ok('rounding is honest: halves under ten, singular wording, tiny totals', () => {
  assert.strictEqual(R.rpAbout(1.3), '1.5'); assert.strictEqual(R.rpAbout(1.2), '1'); assert.strictEqual(R.rpAbout(0.5), null);
  assert.strictEqual(R.rpAbout(12.4), '12');
  const one = R.rpRealLife(8 * 3600, 1, 0);
  assert.strictEqual(one.find(x => x.id === 'workdays').text, 'About 1 full workday (8 hours each)');
  assert(!one.find(x => x.id === 'year'), 'no yearly pace from a single day');
  const small = R.rpRealLife(1200, 1, 0);
  assert.strictEqual(small[0].id, 'hours'); assert.strictEqual(small[0].text, 'About 20 minutes in total');
  assert.strictEqual(R.rpRealLife(0, 7, 0).length, 0);
});

console.log('focus and intents');
ok('focus totals for the period and the one before', () => {
  const log = { '2026-10-26': { mins: 50, sessions: 2 }, '2026-10-27': { mins: 25, sessions: 1 }, '2026-10-19': { mins: 30, sessions: 1 } };
  const rep = R.rpBuild({}, {}, R.rpPeriod('this-week', at(2026, 10, 27)), { focusLog: log });
  assert.strictEqual(rep.focus.mins, 75); assert.strictEqual(rep.focus.sessions, 3); assert.strictEqual(rep.focus.days, 2);
  assert.strictEqual(rep.focus.prevMins, 30);
});
ok('intents: filtered to the range, newest first, counted by site; missing key is fine', () => {
  const list = [
    { ts: at(2026, 10, 26, 9), domain: 'youtube.com', text: 'lecture video' },
    { ts: at(2026, 10, 27, 21), domain: 'youtube.com', text: '  just bored ' },
    { ts: at(2026, 10, 27, 22), domain: 'reddit.com', text: 'check a reply' },
    { ts: at(2026, 10, 10, 9), domain: 'reddit.com', text: 'old one' },
    { ts: 'bad', text: 'x' }, null, { ts: at(2026, 10, 27), text: '' }
  ];
  const it = R.rpIntents(list, R.rpPeriod('this-week', at(2026, 10, 27)).keys, 12);
  assert(it.present); assert.strictEqual(it.total, 3);
  assert.strictEqual(it.items[0].text, 'check a reply'); assert.strictEqual(it.items[1].text, 'just bored');
  assert.deepStrictEqual(it.byDomain[0], { domain: 'youtube.com', count: 2 });
  assert.strictEqual(R.rpIntents(undefined, [], 5).present, false);
  assert.strictEqual(R.rpIntents([], [], 5).present, true);
});

console.log('CSV');
ok('cells are escaped (commas, quotes, new lines, spaces) and formulas neutralised', () => {
  assert.strictEqual(R.rpCsvCell('plain'), 'plain');
  assert.strictEqual(R.rpCsvCell('a,b'), '"a,b"');
  assert.strictEqual(R.rpCsvCell('say "hi"'), '"say ""hi"""');
  assert.strictEqual(R.rpCsvCell('line\nbreak'), '"line\nbreak"');
  assert.strictEqual(R.rpCsvCell(' padded'), '" padded"');
  assert.strictEqual(R.rpCsvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.strictEqual(R.rpCsvCell('+1'), "'+1");
  assert.strictEqual(R.rpCsvCell('@cmd'), "'@cmd");
  assert.strictEqual(R.rpCsvCell(-5), '-5', 'numbers are left alone');
  assert.strictEqual(R.rpCsvCell(null), ''); assert.strictEqual(R.rpCsvCell(NaN), '');
  assert.strictEqual(R.rpCsv([['a', 'b'], [1, 'x,y']]), 'a,b\r\n1,"x,y"\r\n');
});
ok('daily and per-site CSV', () => {
  const days = { '2026-10-26': day({ 'github.com': 3000, 'youtube.com': 600 }), '2026-10-27': day({ 'we,ird.com': 60 }) };
  const keys = R.rpPeriod('this-week', at(2026, 10, 28)).keys;
  const daily = R.rpDailyCsv(days, {}, keys).trim().split('\r\n');
  assert.strictEqual(daily[0], 'Date,Total seconds,Total minutes,Productive seconds,Neutral seconds,Distracting seconds,Score,Sites');
  assert.strictEqual(daily[1], '2026-10-26,3600,60,3000,0,600,83,2');
  assert.strictEqual(daily[3], '2026-10-28,0,0,0,0,0,,0', 'empty days are listed with zeros');
  assert.strictEqual(daily.length, 4);
  const sites = R.rpSitesCsv(days, {}, keys).trim().split('\r\n');
  assert.strictEqual(sites[0], 'Date,Site,Category,Seconds,Visits');
  assert.strictEqual(sites[1], '2026-10-26,github.com,Productive,3000,3');
  assert.strictEqual(sites[3], '2026-10-27,"we,ird.com",Neutral,60,3');
});

console.log('coach');
ok('summary has domains and times only, no URLs and no intents', () => {
  const days = { '2026-10-26': day({ 'github.com': 3000, 'youtube.com': 6000 }, { 21: 9000 }), '2026-10-27': day({ 'youtube.com': 4000, 'docs.google.com': 2000 }, { 22: 6000 }) };
  const rep = R.rpBuild(days, {}, R.rpPeriod('days', at(2026, 10, 27), 7), { focusLog: { '2026-10-26': { mins: 25, sessions: 1 } }, intents: [{ ts: at(2026, 10, 26), domain: 'youtube.com', text: 'SECRET NOTE' }] });
  const s = R.rpCoachSummary(rep);
  assert(/youtube\.com/.test(s) && /github\.com/.test(s));
  assert(!/https?:|:\/\/|\.[a-z]{2,}\/\w/i.test(s), 'no URLs or paths');
  assert(!/SECRET/.test(s), 'intent text is never included');
  assert(/Focus sessions: 1/.test(s));
  const prompt = R.rpCoachPrompt(s);
  assert(prompt.indexOf(s) > 0 && /JSON only/.test(prompt));
});
ok('parses the JSON plan, also inside code fences, and cleans it', () => {
  const reply = 'Here you go:\n```json\n{"observations":["You spent 5h on youtube.com — mostly late.","b","c","d"],' +
    '"suggestions":[{"text":"Cap YouTube","site":"YouTube.com","limitMins":45},{"text":"Walk","site":"http://evil/x","limitMins":"9999"},"Plain string"],"encouragement":"You got this."}\n```';
  const p = R.rpParseCoach(reply);
  assert.strictEqual(p.observations.length, 3);
  assert.strictEqual(p.observations[0], 'You spent 5h on youtube.com, mostly late.');
  assert.strictEqual(p.suggestions[0].site, 'youtube.com'); assert.strictEqual(p.suggestions[0].limitMins, 45);
  assert.strictEqual(p.suggestions[1].site, '', 'a URL is not accepted as a site'); assert.strictEqual(p.suggestions[1].limitMins, 600);
  assert.strictEqual(p.suggestions[2].text, 'Plain string');
  assert.strictEqual(p.encouragement, 'You got this.');
  assert.strictEqual(R.rpParseCoach('Sorry, I cannot help.'), null);
  assert.strictEqual(R.rpParseCoach('{"observations": "x"}'), null);
  assert.strictEqual(R.rpParseCoach(''), null);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exitCode = 1;
