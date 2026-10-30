// Tests for the focus garden logic (newtab/garden.js).   node tools/test-plus-garden.js
'use strict';
const assert = require('assert');
const G = require('../newtab/garden.js');
let passed = 0, failed = 0;
const ok = (name, fn) => { try { fn(); passed++; console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); } };
const day = (s, m) => ({ sessions: s, mins: m == null ? s * 25 : m });
const logOf = keys => Object.fromEntries(keys.map(k => [k, day(1)]));

ok('dates step across month ends, leap days and New Year', () => {
  assert.strictEqual(G.addDays('2026-01-31', 1), '2026-02-01');
  assert.strictEqual(G.addDays('2028-02-28', 1), '2028-02-29');
  assert.strictEqual(G.addDays('2027-02-28', 1), '2027-03-01');
  assert.strictEqual(G.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(G.addDays('2027-01-01', -1), '2026-12-31');
  assert.strictEqual(G.addDays('2026-03-29', 1), '2026-03-30');   // EU clocks change that night
  assert.strictEqual(G.addDays('2026-11-01', 1), '2026-11-02');   // US clocks change that night
  assert.strictEqual(G.parseKey('2026-02-31'), null);
  assert.strictEqual(G.parseKey('nonsense'), null);
});

ok('no sessions: no streak', () => { const s = G.streaks({}, '2026-05-10'); assert.deepStrictEqual(s, { current: 0, best: 0, todayDone: false }); });
ok('a streak runs across a month boundary', () => {
  const s = G.streaks(logOf(['2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02']), '2026-05-02');
  assert.strictEqual(s.current, 4); assert.strictEqual(s.todayDone, true);
});
ok('a streak runs across New Year', () => {
  const s = G.streaks(logOf(['2026-12-30', '2026-12-31', '2027-01-01']), '2027-01-01');
  assert.strictEqual(s.current, 3); assert.strictEqual(s.best, 3);
});
ok('a streak runs through 29 February', () => {
  assert.strictEqual(G.streaks(logOf(['2028-02-28', '2028-02-29', '2028-03-01']), '2028-03-01').current, 3);
});
ok('today not done yet: yesterday\'s streak is still alive', () => {
  const s = G.streaks(logOf(['2026-05-07', '2026-05-08', '2026-05-09']), '2026-05-10');
  assert.strictEqual(s.current, 3); assert.strictEqual(s.todayDone, false);
});
ok('a missed day resets the streak', () => {
  assert.strictEqual(G.streaks(logOf(['2026-05-06', '2026-05-07', '2026-05-08']), '2026-05-10').current, 0);
  assert.strictEqual(G.streaks(logOf(['2026-05-05', '2026-05-06', '2026-05-08', '2026-05-09', '2026-05-10']), '2026-05-10').current, 3);
});
ok('days with zero sessions, or junk entries, do not count', () => {
  const log = logOf(['2026-05-08', '2026-05-10']); log['2026-05-09'] = { sessions: 0, mins: 0 }; log['bad'] = day(2); log['2026-05-07'] = null;
  assert.strictEqual(G.streaks(log, '2026-05-10').current, 1);
});
ok('best streak is the longest run ever, even when the current one is shorter', () => {
  const s = G.streaks(logOf(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-04-01', '2026-04-02']), '2026-04-02');
  assert.strictEqual(s.current, 2); assert.strictEqual(s.best, 5);
});
ok('best streak counts a run that crosses a year', () => {
  assert.strictEqual(G.streaks(logOf(['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-05']), '2026-01-05').best, 4);
});
ok('future days (a clock set back) never count', () => {
  const s = G.streaks(logOf(['2026-05-09', '2026-05-10', '2026-05-11', '2026-05-12']), '2026-05-10');
  assert.strictEqual(s.current, 2); assert.strictEqual(s.best, 2);
});
ok('milestones at 3, 7, 14 and 30 days', () => {
  assert.strictEqual(G.milestoneFor(2), null);
  assert.strictEqual(G.milestoneFor(3).days, 3);
  assert.strictEqual(G.milestoneFor(6).days, 3);
  assert.strictEqual(G.milestoneFor(7).days, 7);
  assert.strictEqual(G.milestoneFor(14).days, 14);
  assert.strictEqual(G.milestoneFor(45).days, 30);
  assert.deepStrictEqual([0, 3, 7, 13, 29, 30].map(G.nextMilestone), [3, 7, 14, 14, 30, null]);
  for (const m of G.MILESTONES) assert(!/—|–/.test(m.text), 'no dashes in: ' + m.text);
});
ok('one plant per session, the same garden every time, newest kept', () => {
  const log = { '2026-05-01': day(2, 60), '2026-05-02': day(3, 15), '2026-05-03': day(1, 50) };
  const a = G.plantsFrom(log, '2026-05-03'), b = G.plantsFrom(JSON.parse(JSON.stringify(log)), '2026-05-03');
  assert.strictEqual(a.length, 6); assert.deepStrictEqual(a, b);
  assert(a.every(p => G.PLANT_TYPES.includes(p.type)));
  assert.strictEqual(G.plantsFrom(log, '2026-05-03', 2).length, 2);
  assert.strictEqual(G.plantsFrom(log, '2026-05-03', 2)[1].day, '2026-05-03');
});
ok('longer sessions grow taller plants', () => {
  assert.deepStrictEqual([5, 15, 30, 60].map(G.stageFor), [1, 2, 3, 4]);
  const p = G.plantsFrom({ '2026-05-01': day(2, 100), '2026-05-02': day(2, 10) }, '2026-05-02');
  assert.strictEqual(p[0].stage, 4); assert.strictEqual(p[3].stage, 1);
});
ok('more focused minutes level up the ground', () => {
  assert.strictEqual(G.levelFor(0).level, 0); assert.strictEqual(G.levelFor(60).level, 1); assert.strictEqual(G.levelFor(5000).level, 5);
  assert.strictEqual(G.levelFor(5000).nextAt, null);
});
ok('garden state: totals, stored best, milestone message', () => {
  const log = logOf(['2026-05-06', '2026-05-07', '2026-05-08']); log['2026-05-08'] = day(2, 90);
  const st = G.gardenState(log, '2026-05-08', { storedBest: 9 });
  assert.strictEqual(st.streak, 3); assert.strictEqual(st.best, 9); assert.strictEqual(st.totalPlants, 4); assert.strictEqual(st.totalMins, 140);
  assert.strictEqual(G.message(st), G.MILESTONES[0].text);
  assert.strictEqual(G.message(G.gardenState({}, '2026-05-08')), 'Finish a focus session to plant your first seed.');
  assert.strictEqual(G.message(G.gardenState(logOf(['2026-05-07']), '2026-05-08')), 'Focus today to keep your streak going.');
});
ok('the drawing is self-contained SVG (no images, no scripts)', () => {
  const svg = G.gardenSvg(G.gardenState(logOf(['2026-05-06', '2026-05-07']), '2026-05-07'));
  assert(svg.startsWith('<svg') && svg.endsWith('</svg>')); assert(!/<image|<script|href=/.test(svg)); assert(!/NaN|undefined/.test(svg));
  const sample = G.gardenSvg(G.sampleState()); assert(!/NaN|undefined/.test(sample)); assert(G.sampleState().plants.length >= 10);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exitCode = 1;
