// Tests the pure logic behind the Plus focus extras (lib/plus-focus.js) and the rules it adds to Protect.
//   Run: node tools/test-plus-focus.js
'use strict';
const assert = require('assert'), path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const F = require(path.join(ROOT, 'lib/plus-focus.js'));

// protect.js needs categories.js globals, so load both into one sandbox.
const ctx = { URL, console, crypto: require('crypto').webcrypto, TextEncoder };
vm.createContext(ctx);
for (const f of ['lib/categories.js', 'lib/protect.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^'use strict';/m, ''), ctx, { filename: f });
const P = vm.runInContext('({ buildDynamicRules, protectState, RULE_IDS, RULE_PRIORITY })', ctx);

let n = 0, fails = 0;
const ok = (name, fn) => { try { fn(); n++; console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + '\n     ' + e.message); } };
// Local-time dates. 2026-11-02 is a Monday.
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi, 0, 0);
const MON = 1, FRI = 5, SAT = 6, SUN = 0;

/* ---------- schedules ---------- */
const work = F.scheduleClean({ name: 'Work', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', sites: ['https://www.YouTube.com/x', 'reddit.com'] }).value;
ok('clean: hosts are normalised, days sorted, on by default', () => {
  assert.deepStrictEqual(work.sites, ['youtube.com', 'reddit.com']); assert.deepStrictEqual(work.days, [1, 2, 3, 4, 5]); assert.strictEqual(work.on, true);
});
ok('clean: refuses no days, equal times, bad times and an empty site list', () => {
  assert(!F.scheduleClean({ days: [], start: '09:00', end: '10:00', useList: true }).ok);
  assert(!F.scheduleClean({ days: [1], start: '09:00', end: '09:00', useList: true }).ok);
  assert(!F.scheduleClean({ days: [1], start: '25:00', end: '09:00', useList: true }).ok);
  assert(!F.scheduleClean({ days: [1], start: '09:00', end: '10:00', sites: ['not a site'] }).ok);
  assert(F.scheduleClean({ days: [1], start: '09:00', end: '10:00', useList: true }).ok);
});
ok('day window: open at the start minute, closed at the end minute', () => {
  assert(!F.scheduleActiveAt(work, at(2026, 11, 2, 8, 59)));
  assert(F.scheduleActiveAt(work, at(2026, 11, 2, 9, 0)));
  assert(F.scheduleActiveAt(work, at(2026, 11, 2, 16, 59)));
  assert(!F.scheduleActiveAt(work, at(2026, 11, 2, 17, 0)));
});
ok('day window: not on days that are not picked (Saturday)', () => assert(!F.scheduleActiveAt(work, at(2026, 11, 7, 12, 0))));
ok('switched off: never active', () => assert(!F.scheduleActiveAt(Object.assign({}, work, { on: false }), at(2026, 11, 2, 12, 0))));

const night = F.scheduleClean({ name: 'Night', days: [FRI], start: '22:00', end: '06:00', useList: true }).value;
ok('overnight: Friday 22:00-06:00 covers Friday night', () => { assert(F.scheduleActiveAt(night, at(2026, 11, 6, 22, 0))); assert(F.scheduleActiveAt(night, at(2026, 11, 6, 23, 59))); });
ok('overnight: ...and rolls over into early Saturday', () => { assert(F.scheduleActiveAt(night, at(2026, 11, 7, 0, 0))); assert(F.scheduleActiveAt(night, at(2026, 11, 7, 5, 59))); });
ok('overnight: closed at 06:00 Saturday and before 22:00 Friday', () => { assert(!F.scheduleActiveAt(night, at(2026, 11, 7, 6, 0))); assert(!F.scheduleActiveAt(night, at(2026, 11, 6, 21, 59))); });
ok('overnight: Saturday night is not covered (only Friday was picked)', () => { assert(!F.scheduleActiveAt(night, at(2026, 11, 7, 23, 0))); assert(!F.scheduleActiveAt(night, at(2026, 11, 6, 3, 0))); });
const sunNight = F.scheduleClean({ days: [SAT], start: '23:30', end: '00:30', useList: true }).value;
ok('overnight across the week boundary: Saturday 23:30 into Sunday 00:30', () => {
  assert(F.scheduleActiveAt(sunNight, at(2026, 11, 7, 23, 45))); assert(F.scheduleActiveAt(sunNight, at(2026, 11, 8, 0, 15))); assert(!F.scheduleActiveAt(sunNight, at(2026, 11, 8, 0, 30)));
});
ok('until: day window ends today at 17:00', () => assert.strictEqual(F.scheduleUntil(work, at(2026, 11, 2, 10, 0)).getTime(), at(2026, 11, 2, 17, 0).getTime()));
ok('until: overnight started tonight ends tomorrow at 06:00', () => assert.strictEqual(F.scheduleUntil(night, at(2026, 11, 6, 23, 0)).getTime(), at(2026, 11, 7, 6, 0).getTime()));
ok('until: overnight in the small hours ends this morning', () => assert.strictEqual(F.scheduleUntil(night, at(2026, 11, 7, 2, 0)).getTime(), at(2026, 11, 7, 6, 0).getTime()));
ok('until: null when closed', () => assert.strictEqual(F.scheduleUntil(work, at(2026, 11, 2, 18, 0)), null));
ok('next change: before work it is the 09:00 start', () => assert.strictEqual(F.nextScheduleChange([work], at(2026, 11, 2, 7, 0)), at(2026, 11, 2, 9, 0).getTime()));
ok('next change: during work it is the 17:00 end', () => assert.strictEqual(F.nextScheduleChange([work], at(2026, 11, 2, 9, 0)), at(2026, 11, 2, 17, 0).getTime()));
ok('next change: Friday evening jumps to Monday 09:00', () => assert.strictEqual(F.nextScheduleChange([work], at(2026, 11, 6, 18, 0)), at(2026, 11, 9, 9, 0).getTime()));
ok('next change: inside an overnight window it is the morning end', () => assert.strictEqual(F.nextScheduleChange([night], at(2026, 11, 7, 1, 0)), at(2026, 11, 7, 6, 0).getTime()));
ok('next change: earliest across several schedules', () => assert.strictEqual(F.nextScheduleChange([work, night], at(2026, 11, 6, 18, 0)), at(2026, 11, 6, 22, 0).getTime()));
ok('next change: nothing switched on gives null', () => assert.strictEqual(F.nextScheduleChange([Object.assign({}, work, { on: false })], at(2026, 11, 2, 7, 0)), null));
ok('active list skips broken entries', () => assert.strictEqual(F.activeSchedules([work, { days: [1], start: 'x' }, null], at(2026, 11, 2, 10, 0)).length, 1));
ok('days label', () => { assert.strictEqual(F.scheduleDaysLabel([1, 2, 3, 4, 5]), 'Weekdays'); assert.strictEqual(F.scheduleDaysLabel([0, 6]), 'Weekends'); assert.strictEqual(F.scheduleDaysLabel([0, 1, 2, 3, 4, 5, 6]), 'Every day'); assert.strictEqual(F.scheduleDaysLabel([5, 1, 0]), 'Mon, Fri, Sun'); });
ok('sites: a schedule can use the focus block list', () => { assert.deepStrictEqual(F.scheduleSites(night, ['a.com']), ['a.com']); assert.deepStrictEqual(F.scheduleSites(work, ['a.com']), ['youtube.com', 'reddit.com']); });

/* ---------- strict ---------- */
const now = Date.now();
const strict = { phase: 'focus', strict: true, endsAt: now + 20 * 60000, pausedLeft: null };
ok('strict: locked while running', () => assert(F.strictLocked(strict, now)));
ok('strict: never locks once the time has passed', () => assert(!F.strictLocked(Object.assign({}, strict, { endsAt: now - 1 }), now)));
ok('strict: corrupt data never locks (missing, NaN, string, absurd end, paused, wrong phase)', () => {
  for (const bad of [null, {}, { phase: 'focus', strict: true }, Object.assign({}, strict, { endsAt: NaN }), Object.assign({}, strict, { endsAt: String(now + 60000) }),
    Object.assign({}, strict, { endsAt: now + 10 * 3600000 }), Object.assign({}, strict, { pausedLeft: 5000 }), Object.assign({}, strict, { phase: 'break' }), Object.assign({}, strict, { strict: 'yes' })])
    assert(!F.strictLocked(bad, now), JSON.stringify(bad));
});
ok('strict: emergency phrase is forgiving about case, spaces and punctuation, but not the words', () => {
  assert(F.strictPhraseOk('I choose to stop')); assert(F.strictPhraseOk('  i CHOOSE to   stop. ')); assert(!F.strictPhraseOk('stop')); assert(!F.strictPhraseOk('')); assert(!F.strictPhraseOk('I choose not to stop'));
});

/* ---------- intent ---------- */
ok('intent: needs at least 3 characters after trimming', () => { assert.strictEqual(F.intentClean('  ok '), null); assert.strictEqual(F.intentClean(' check   my   DMs '), 'check my DMs'); assert.strictEqual(F.intentClean('x'.repeat(300)).length, 140); });
ok('intent: keeps only the last 500 answers', () => { let l = []; for (let i = 0; i < 510; i++) l = F.intentAdd(l, { ts: i }); assert.strictEqual(l.length, 500); assert.strictEqual(l[0].ts, 10); assert.strictEqual(l[499].ts, 509); });

/* ---------- earn ---------- */
ok('earn: 1 minute per 5 focus minutes by default', () => { const r = F.earnCredit(null, '2026-11-02', 25, null); assert.strictEqual(r.gained, 5); assert.deepStrictEqual(r.bank, { day: '2026-11-02', mins: 5 }); });
ok('earn: partial blocks round down', () => assert.strictEqual(F.earnCredit(null, 'd', 24, null).gained, 4));
ok('earn: capped at 30 banked per day', () => { const r = F.earnCredit({ day: 'd', mins: 28 }, 'd', 90, null); assert.strictEqual(r.gained, 2); assert.strictEqual(r.bank.mins, 30); assert.strictEqual(F.earnCredit(r.bank, 'd', 50, null).gained, 0); });
ok('earn: yesterday\'s bank does not carry over', () => { assert.strictEqual(F.earnBank({ day: 'old', mins: 20 }, 'new'), 0); assert.strictEqual(F.earnCredit({ day: 'old', mins: 20 }, 'new', 10, null).bank.mins, 2); });
ok('earn: custom rate and cap', () => { const r = F.earnCredit(null, 'd', 90, { earnPer: 10, earnCap: 60 }); assert.strictEqual(r.gained, 9); assert.strictEqual(F.earnCredit(null, 'd', 90, { earnPer: 3, earnCap: 15 }).gained, 15); });
ok('earn: silly prefs are clamped', () => { const p = F.focusPrefs({ earnPer: 0, earnCap: -5 }); assert.strictEqual(p.earnPer, 1); assert.strictEqual(p.earnCap, 0); assert.strictEqual(F.focusPrefs({ earnPer: 'x' }).earnPer, 5); assert.strictEqual(F.focusPrefs({}).intent, true); });
ok('earn: spending uses what is there, never more', () => { const s = F.earnSpend({ day: 'd', mins: 7 }, 'd'); assert.strictEqual(s.used, 7); assert.strictEqual(s.bank.mins, 0); assert.strictEqual(F.earnSpend({ day: 'd', mins: 3 }, 'd', 10).used, 3); assert.strictEqual(F.earnSpend(null, 'd').used, 0); });

/* ---------- presets ---------- */
ok('presets: defaults when nothing is saved', () => { const l = F.presetsList(undefined); assert.deepStrictEqual(l.map(p => p.name), ['Study', 'Deep work', 'Wind down']); assert.strictEqual(l[1].strict, true); assert.strictEqual(l[2].block, false); });
ok('presets: an empty saved list stays empty (the user deleted them all)', () => assert.deepStrictEqual(F.presetsList([]), []));
ok('presets: validation', () => {
  assert(!F.presetClean({ name: '', mins: 25 }).ok); assert(!F.presetClean({ name: 'A', mins: 2 }).ok); assert(!F.presetClean({ name: 'A', mins: 500 }).ok);
  const p = F.presetClean({ name: '  Long  read ', mins: '45', sound: 'disco', block: false, strict: true }).value;
  assert.strictEqual(p.name, 'Long read'); assert.strictEqual(p.mins, 45); assert.strictEqual(p.sound, 'none'); assert.strictEqual(p.block, true, 'strict implies blocking');
});
ok('presets: bad entries are dropped and the list is capped', () => { const l = F.presetsList([{ name: 'ok', mins: 25 }, { name: '', mins: 25 }, null].concat(Array(20).fill({ name: 'x', mins: 30 }))); assert.strictEqual(l.length, 8); });

/* ---------- rules built for Protect ---------- */
const p0 = P.protectState({ blocklist: ['reddit.com'] });
const freeRules = JSON.stringify(P.buildDynamicRules(p0, null, {}));
ok('rules: with no Plus extras the rules are exactly what they were', () => assert.strictEqual(JSON.stringify(P.buildDynamicRules(p0, null, {}, undefined)), freeRules));
const withSched = P.buildDynamicRules(p0, null, {}, { schedule: ['youtube.com'], scheduleStrict: ['x.com'] });
ok('rules: schedule rules redirect to the blocked page with their own reason', () => {
  const a = withSched.find(r => r.id === P.RULE_IDS.schedule), b = withSched.find(r => r.id === P.RULE_IDS.scheduleStrict);
  assert(a && a.condition.requestDomains.includes('youtube.com') && /r=schedule$/.test(a.action.redirect.extensionPath));
  assert(b && /r=schedule&strict=1/.test(b.action.redirect.extensionPath) && b.priority > P.RULE_PRIORITY.earnAllow);
  assert(a.priority < P.RULE_PRIORITY.earnAllow, 'earned minutes can open a normal schedule');
});
const lk = { phase: 'focus', block: true, strict: true, strictList: ['reddit.com', 'news.com'], endsAt: now + 60000 };
const strictRules = P.buildDynamicRules(p0, lk, {}, { strict: true });
ok('rules: strict focus uses the frozen list at a priority earned minutes cannot beat', () => {
  const r = strictRules.find(x => x.id === P.RULE_IDS.lockinStrict);
  assert(r && r.priority > P.RULE_PRIORITY.earnAllow); assert.strictEqual(JSON.stringify(r.condition.requestDomains), '["reddit.com","news.com"]');
  assert(!strictRules.find(x => x.id === P.RULE_IDS.lockin), 'normal focus rule replaced');
});
ok('rules: without the strict flag the normal focus rule is used', () => assert(P.buildDynamicRules(p0, lk, {}).find(x => x.id === P.RULE_IDS.lockin)));
ok('rules: all ids stay in the range background.js clears (1000-4999)', () => { for (const r of withSched.concat(strictRules)) assert(r.id >= 1000 && r.id < 5000, r.id); });

/* ---------- the real background.js against a fake chrome.* (same idea as test-background.js) ---------- */
async function backgroundTests() {
  const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const listeners = [];
  const area = () => { const d = {}; return { d,
    get: async keys => { const out = {}; const ks = keys == null ? Object.keys(d) : [].concat(keys); ks.forEach(k => { if (k in d) out[k] = JSON.parse(JSON.stringify(d[k])); }); return out; },
    set: async o => { const ch = {}; for (const k of Object.keys(o)) { ch[k] = { newValue: o[k] }; d[k] = JSON.parse(JSON.stringify(o[k])); } listeners.forEach(f => f(ch, d === local.d ? 'local' : 'session')); },
    remove: async k => { const ch = {}; [].concat(k).forEach(x => { ch[x] = {}; delete d[x]; }); listeners.forEach(f => f(ch, d === local.d ? 'local' : 'session')); } }; };
  const local = area(), session = area();
  let dyn = [], sess = []; const alarms = {}; const L = {};
  const ev = name => ({ addListener: f => { (L[name] = L[name] || []).push(f); } });
  const chrome = {
    storage: { local, session, onChanged: { addListener: f => listeners.push(f) } },
    alarms: { create: (nm, i) => { alarms[nm] = i; }, clear: async nm => { delete alarms[nm]; return true; }, onAlarm: ev('alarm') },
    tabs: { onActivated: ev('a'), onUpdated: ev('b'), onRemoved: ev('c'), query: async () => [], create() {} },
    windows: { onFocusChanged: ev('d'), WINDOW_ID_NONE: -1, getAll: async () => [] },
    idle: { onStateChanged: ev('e'), setDetectionInterval() {}, queryState: async () => 'active' },
    runtime: { onInstalled: ev('installed'), onStartup: ev('startup'), onMessage: ev('msg'), getURL: p => 'chrome-extension://x/' + p, sendMessage: () => Promise.resolve(), setUninstallURL() {} },
    notifications: { create() {} },
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {} },
    offscreen: { hasDocument: async () => false },
    declarativeNetRequest: {
      getDynamicRules: async () => dyn.slice(), updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }) => { dyn = dyn.filter(r => !removeRuleIds.includes(r.id)).concat(addRules); },
      getSessionRules: async () => sess.slice(), updateSessionRules: async ({ removeRuleIds = [], addRules = [] }) => { sess = sess.filter(r => !removeRuleIds.includes(r.id)).concat(addRules); },
      updateEnabledRulesets: async () => {} },
    scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: async () => {}, unregisterContentScripts: async () => {} },
    permissions: { contains: async () => true, onAdded: ev('pa'), onRemoved: ev('pr') },
    webNavigation: { onBeforeNavigate: ev('nav') }
  };
  const bctx = { console, chrome, setTimeout, clearTimeout, Date, Math, JSON, Promise, URL, Object, Array, Set, Number, String, Error, parseInt, isNaN, crypto: require('crypto').webcrypto, TextEncoder, TextDecoder };
  bctx.importScripts = (...files) => files.forEach(f => vm.runInContext(R(f), bctx, { filename: f }));
  vm.createContext(bctx);
  vm.runInContext(R('background.js'), bctx, { filename: 'background.js' });
  let plusOn = false;
  bctx.plusActive = async () => plusOn;   // stands in for a real signed key (checked in the browser smoke test)
  const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));
  const msg = m => new Promise(resolve => { let done = false; (L.msg || []).forEach(f => f(m, { tab: { id: 3 } }, v => { done = true; resolve(v); })); setTimeout(() => { if (!done) resolve(undefined); }, 500); });
  const alarm = async nm => { for (const f of L.alarm || []) f({ name: nm }); await tick(150); };
  const today = bctx.dayKey(Date.now());
  await tick(100);

  // free: the strict flag is ignored and ending works as always
  await msg({ type: 'ww-lockin', op: 'start', mins: 25, strict: true, block: true }); await tick(150);
  ok('bg free: a strict request is ignored without Plus', () => { assert(!local.d.lockin.strict); assert(!dyn.find(r => r.id === 3002)); assert(dyn.find(r => r.id === 3001)); });
  const fe = await msg({ type: 'ww-lockin', op: 'end' }); await tick(150);
  ok('bg free: ending early works', () => { assert(fe.ok); assert.strictEqual(local.d.lockin.phase, 'done'); });
  await msg({ type: 'ww-lockin', op: 'dismiss' });
  await local.set({ plusSchedules: [{ id: 's1', name: 'All day', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59', sites: ['youtube.com'] }] }); await tick(150);
  ok('bg free: saved schedules make no rules without Plus', () => assert(!dyn.find(r => r.id === 3101)));
  const fi = await msg({ type: 'ww-plus-blocked-info', url: 'https://youtube.com' });
  ok('bg free: the blocked page is told Plus is off', () => assert.strictEqual(fi.plus, false));
  const fu = await msg({ type: 'ww-earn-use', url: 'https://youtube.com' });
  ok('bg free: earned minutes cannot be used', () => assert.strictEqual(fu.ok, false));

  // Plus on
  plusOn = true;
  await local.set({ plusKey: 'test' }); await tick(200);
  ok('bg plus: an open schedule adds its rule as soon as Plus is on', () => { const r = dyn.find(x => x.id === 3101); assert(r && r.condition.requestDomains.includes('youtube.com')); });
  ok('bg plus: an alarm is set for the next schedule change', () => assert(alarms['ww-sched'] && alarms['ww-sched'].when > Date.now()));
  await local.set({ plusSchedules: [] }); await tick(150);
  ok('bg plus: removing the schedule lifts its rule', () => assert(!dyn.find(x => x.id === 3101)));

  await local.set({ protect: { blocklist: ['reddit.com'] } }); await tick(100);
  await msg({ type: 'ww-lockin', op: 'start', mins: 30, strict: true, block: true, task: 'Essay' }); await tick(200);
  ok('bg strict: session saved as strict with a frozen list incl. always-blocked sites', () => { const l = local.d.lockin; assert.strictEqual(l.strict, true); assert(l.strictList.includes('reddit.com') && l.strictList.includes('youtube.com')); });
  ok('bg strict: the strict rule is used', () => { const r = dyn.find(x => x.id === 3002); assert(r && r.condition.requestDomains.includes('reddit.com')); });
  for (const op of ['end', 'pause', 'dismiss', 'start']) {
    const res = await msg({ type: 'ww-lockin', op, mins: 5 }); await tick(80);
    ok('bg strict: "' + op + '" is refused', () => { assert.strictEqual(res.ok, false); assert.strictEqual(res.refused, 'strict'); assert.strictEqual(local.d.lockin.phase, 'focus'); assert.strictEqual(local.d.lockin.mins, 30); });
  }
  await local.set({ protect: { blocklist: [] }, categories: { 'youtube.com': 'productive' } }); await tick(150);
  ok('bg strict: unblocking mid-session changes nothing', () => { const r = dyn.find(x => x.id === 3002); assert(r.condition.requestDomains.includes('reddit.com') && r.condition.requestDomains.includes('youtube.com')); });
  await local.set({ categories: {} });
  const info = await msg({ type: 'ww-plus-blocked-info', url: 'https://www.reddit.com/r/x' });
  ok('bg strict: the blocked page is told the site is strictly blocked', () => { assert(info.plus && info.strict && info.strictFocus); });
  await local.set({ plusEarn: { day: today, mins: 10 } });
  const eu = await msg({ type: 'ww-earn-use', url: 'https://reddit.com' });
  ok('bg strict: earned minutes cannot open anything during strict focus', () => { assert.strictEqual(eu.ok, false); assert.strictEqual(local.d.plusEarn.mins, 10); });
  const wrong = await msg({ type: 'ww-lockin', op: 'emergency', phrase: 'let me out' }); await tick(80);
  ok('bg strict: the emergency exit needs the exact phrase', () => { assert.strictEqual(wrong.refused, 'phrase'); assert.strictEqual(local.d.lockin.phase, 'focus'); });
  const l0 = local.d.lockin; l0.endsAt -= 12 * 60000; await local.set({ lockin: l0 }); await tick(80);   // 12 minutes in
  const em = await msg({ type: 'ww-lockin', op: 'emergency', phrase: 'I choose to stop' }); await tick(200);
  ok('bg strict: emergency exit ends it, logs it and earns nothing', () => {
    assert(em.ok); assert.strictEqual(local.d.lockin.phase, 'done'); assert.strictEqual(local.d.lockin.emergency, true);
    assert.strictEqual(local.d.focusLog[today].emergencyExits, 1); assert.strictEqual(local.d.focusLog[today].mins, 12); assert.strictEqual(local.d.plusEarn.mins, 10);
    assert(!dyn.find(x => x.id === 3002));
  });
  await msg({ type: 'ww-lockin', op: 'dismiss' });

  // corrupt / overdue strict data never traps
  await local.set({ lockin: { phase: 'focus', strict: true, endsAt: 'soon', totalMs: 60000 } }); await tick(100);
  const ce = await msg({ type: 'ww-lockin', op: 'end' }); await tick(120);
  ok('bg strict: a corrupt session can still be ended', () => { assert(ce.ok); assert.strictEqual(local.d.lockin.phase, 'done'); });
  await local.set({ lockin: { phase: 'focus', strict: true, block: true, strictList: ['a.com'], mins: 1, totalMs: 60000, startedAt: Date.now() - 70000, endsAt: Date.now() - 10000, pausedLeft: null, breakMins: 0 } }); await tick(100);
  await alarm('webwell-tick');
  ok('bg strict: an overdue strict session is finished by the minute tick (lost alarm)', () => assert.strictEqual(local.d.lockin.phase, 'done'));
  ok('bg earn: ...and a finished session earns minutes (1 min focused earns 0 at 1 per 5)', () => assert.strictEqual(local.d.plusEarn.mins, 10));
  await msg({ type: 'ww-lockin', op: 'dismiss' });

  // earn on a full session
  await local.set({ plusEarn: { day: today, mins: 0 } });
  await msg({ type: 'ww-lockin', op: 'start', mins: 25, block: false, breakMins: 0 }); await tick(120);
  const l1 = local.d.lockin; l1.endsAt = Date.now() - 50; await local.set({ lockin: l1 }); await tick(60);
  await alarm('lockin-end');
  ok('bg earn: a finished 25-minute session banks 5 minutes', () => { assert.strictEqual(local.d.plusEarn.mins, 5); assert.strictEqual(local.d.lockin.earned, 5); });
  await msg({ type: 'ww-lockin', op: 'dismiss' });
  await local.set({ protect: { blocklist: ['reddit.com'], pause: false } }); await tick(120);
  const use = await msg({ type: 'ww-earn-use', url: 'https://np.reddit.com/r/a', intent: 'reply to a friend' }); await tick(80);
  ok('bg earn: using minutes opens the site above normal blocks for that long', () => {
    assert(use.ok); assert.strictEqual(use.mins, 5); const a = sess.find(x => x.condition.requestDomains[0] === 'reddit.com');
    assert(a && a.priority === 85 && a.action.type === 'allow'); assert.strictEqual(local.d.plusEarn.mins, 0);
  });
  ok('bg intent: the answer is saved with the minutes it allowed', () => { const e = local.d.plusIntents.slice(-1)[0]; assert.strictEqual(e.domain, 'np.reddit.com'); assert.strictEqual(e.text, 'reply to a friend'); assert.strictEqual(e.allowedMins, 5); });
  await local.set({ protect: { blocklist: ['reddit.com'], pause: false, adult: false } }); await tick(150);
  ok('bg earn: a protect re-sync with the pause off keeps earned minutes', () => assert(sess.find(x => x.priority === 85)));
  const none = await msg({ type: 'ww-earn-use', url: 'https://reddit.com' });
  ok('bg earn: nothing banked means nothing opens', () => assert.strictEqual(none.ok, false));
  await local.set({ protect: { pause: true } }); await tick(120);
  await msg({ type: 'ww-pause-continue', url: 'https://www.youtube.com/', intent: 'ok' });
  await msg({ type: 'ww-pause-continue', url: 'https://www.youtube.com/', intent: 'one tutorial' }); await tick(80);
  ok('bg intent: pause answers are saved (too-short ones are not)', () => { const l = local.d.plusIntents; assert.strictEqual(l.length, 2); assert.strictEqual(l[1].text, 'one tutorial'); assert.strictEqual(l[1].allowedMins, 10); });

  // strict schedule: shut even with minutes banked
  await local.set({ plusEarn: { day: today, mins: 9 }, plusSchedules: [{ id: 'n', name: 'Night', days: [0, 1, 2, 3, 4, 5, 6], start: '00:00', end: '23:59', sites: ['x.com'], strict: true }] }); await tick(150);
  ok('bg schedule: a strict schedule uses the strict rule', () => assert(dyn.find(r => r.id === 3102 && r.condition.requestDomains.includes('x.com'))));
  const si = await msg({ type: 'ww-plus-blocked-info', url: 'https://x.com/home' });
  ok('bg schedule: blocked page gets its name, end time and strictness', () => { assert.strictEqual(si.schedule.name, 'Night'); assert(si.schedule.until > Date.now()); assert(si.strict); assert.strictEqual(si.bank, 9); });
  const sx = await msg({ type: 'ww-earn-use', url: 'https://x.com' });
  ok('bg schedule: earned minutes cannot open a strict schedule', () => { assert.strictEqual(sx.ok, false); assert.strictEqual(local.d.plusEarn.mins, 9); });

  // Plus switched off: everything Plus goes away
  plusOn = false; await local.remove('plusKey'); await tick(200);
  ok('bg: switching Plus off removes schedule rules', () => assert(!dyn.some(r => r.id >= 3101 && r.id <= 3102)));
}

backgroundTests().catch(e => { fails++; console.log('FAIL background tests crashed: ' + (e.stack || e)); }).then(() => {
  console.log('\n' + n + ' passed' + (fails ? ', ' + fails + ' FAILED' : '')); process.exit(fails ? 1 : 0);
});
