// WebWell background-worker test: runs the REAL background.js against a fake chrome.* API and
// exercises tracking, focus sessions, blocking rules and the mindful pause.   Run: node tools/test-background.js
'use strict';
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const area = () => { const d = {}; return { d,
  get: async keys => { const out = {}; const ks = keys == null ? Object.keys(d) : [].concat(typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)); ks.forEach(k => { if (k in d) out[k] = JSON.parse(JSON.stringify(d[k])); }); return out; },
  set: async o => { const ch = {}; for (const k of Object.keys(o)) { ch[k] = { oldValue: d[k], newValue: JSON.parse(JSON.stringify(o[k])) }; d[k] = JSON.parse(JSON.stringify(o[k])); } area.fire && area.fire(d === local.d ? 'local' : 'session', ch); },
  remove: async k => { const ch = {}; [].concat(k).forEach(x => { if (x in d) { ch[x] = { oldValue: d[x] }; delete d[x]; } }); area.fire && area.fire(d === local.d ? 'local' : 'session', ch); } }; };
const local = area(), session = area();
const changedListeners = [];
area.fire = (a, ch) => changedListeners.forEach(f => f(ch, a));

const calls = { alarms: [], cleared: [], notifications: [], badge: [], dnrEnabled: [], scriptsRegistered: [], scriptsUnregistered: [], sent: [], created: [], uninstall: [] };
let dyn = [], sess = [], granted = true, activeTab = null, focusedWindow = true;
const L = {};   // captured listeners
const ev = name => ({ addListener: f => { (L[name] = L[name] || []).push(f); } });

const chrome = {
  storage: { local, session, onChanged: { addListener: f => changedListeners.push(f) } },
  alarms: { create: (n, i) => { calls.alarms.push({ n, i }); }, clear: async n => { calls.cleared.push(n); return true; }, onAlarm: ev('alarm') },
  tabs: { onActivated: ev('tabAct'), onUpdated: ev('tabUpd'), onRemoved: ev('tabRem'), query: async () => activeTab ? [activeTab] : [], create: o => calls.created.push(o) },
  windows: { onFocusChanged: ev('winFocus'), WINDOW_ID_NONE: -1, getAll: async () => focusedWindow && activeTab ? [{ focused: true, tabs: [activeTab] }] : [] },
  idle: { onStateChanged: ev('idle'), setDetectionInterval() {}, queryState: async () => 'active' },
  runtime: { onInstalled: ev('installed'), onStartup: ev('startup'), onMessage: ev('msg'), getURL: p => 'chrome-extension://x/' + p, sendMessage: m => { calls.sent.push(m); return Promise.resolve(); }, setUninstallURL: u => { calls.uninstall.push(u); } },
  notifications: { create: (id, o) => calls.notifications.push({ id, o }) },
  action: { setBadgeText: async o => calls.badge.push(o.text), setBadgeBackgroundColor: async () => {}, setBadgeTextColor: async () => {} },
  offscreen: { hasDocument: async () => true, createDocument: async () => {} },
  declarativeNetRequest: {
    getDynamicRules: async () => dyn.slice(), updateDynamicRules: async ({ removeRuleIds = [], addRules = [] }) => { const ids = new Set(addRules.map(r => r.id)); dyn = dyn.filter(r => !removeRuleIds.includes(r.id) && !ids.has(r.id)).concat(addRules); },
    getSessionRules: async () => sess.slice(), updateSessionRules: async ({ removeRuleIds = [], addRules = [] }) => { sess = sess.filter(r => !removeRuleIds.includes(r.id)).concat(addRules); },
    updateEnabledRulesets: async o => calls.dnrEnabled.push(o) },
  scripting: { getRegisteredContentScripts: async () => calls.scriptsRegistered.length > calls.scriptsUnregistered.length ? [{ id: 'ww-shortform' }] : [], registerContentScripts: async s => calls.scriptsRegistered.push(s), unregisterContentScripts: async s => calls.scriptsUnregistered.push(s) },
  permissions: { contains: async () => granted, onAdded: ev('permAdd'), onRemoved: ev('permRem') },
  webNavigation: { onBeforeNavigate: ev('nav') }
};
const ctx = { console, chrome, setTimeout, clearTimeout, Date, Math, JSON, Promise, URL, Object, Array, Set, Number, String, Error, parseInt, isNaN, crypto: require('crypto').webcrypto, TextEncoder };
ctx.importScripts = (...files) => files.forEach(f => vm.runInContext(R(f), ctx, { filename: f }));
vm.createContext(ctx);
vm.runInContext(R('background.js'), ctx, { filename: 'background.js' });

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
const msg = (m) => new Promise(resolve => { let answered = false; (L.msg || []).forEach(f => { const ret = f(m, { tab: { id: 7 } }, v => { answered = true; resolve(v); }); }); setTimeout(() => { if (!answered) resolve(undefined); }, 400); });
const alarm = async name => { for (const f of L.alarm || []) f({ name }); await tick(80); };
const now = () => Date.now(), todayKey = () => ctx.dayKey(Date.now());
const ruleIds = () => dyn.map(r => r.id).sort((a, b) => a - b);
let n = 0, fails = 0;
const ok = (name, fn) => { try { fn(); n++; console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + '\n     ' + e.message); } };

(async () => {
  await tick(100);
  ok('loads, and registers its event listeners', () => { for (const k of ['alarm', 'installed', 'startup', 'msg', 'tabAct', 'tabUpd', 'winFocus', 'idle', 'nav', 'permAdd']) assert((L[k] || []).length >= 1, 'no listener for ' + k); });

  // ---- startup ----
  L.installed.forEach(f => f({ reason: 'update' })); await tick(120);
  ok('install/update creates the 1-minute tick alarm', () => assert(calls.alarms.some(a => a.n === 'webwell-tick' && a.i.periodInMinutes === 1)));
  ok('install/update registers the goodbye page for when WebWell is removed', () => assert.strictEqual(calls.uninstall[calls.uninstall.length - 1], 'https://webwell.app/goodbye'));
  ok('the goodbye page address carries nothing about the user', () => { const u = new URL(calls.uninstall[calls.uninstall.length - 1]); assert.strictEqual(u.search + u.hash, ''); assert(u.protocol === 'https:' && u.href.length < 1000); });
  { const n = calls.uninstall.length; L.startup.forEach(f => f()); await tick(120); ok('browser start re-registers the goodbye page', () => assert(calls.uninstall.length > n)); }

  // ---- browsing-time tracking still works ----
  activeTab = { id: 7, active: true, url: 'https://github.com/x/y' };
  L.tabAct.forEach(f => f({})); await tick(150);
  const live = await msg({ type: 'webwell-live' });
  ok('tracking: switching to a tab starts a live session for that site', () => { assert(live && live.live); assert.strictEqual(live.live.domain, 'github.com'); });
  focusedWindow = false; L.winFocus.forEach(f => f(-1)); await tick(150);
  ok('tracking: losing window focus ends the session', async () => {});
  const live2 = await msg({ type: 'webwell-live' });
  ok('...so no live session is reported', () => assert.strictEqual(live2.live, null));
  focusedWindow = true;

  // ---- blocking rules follow the protect settings ----
  await local.set({ protect: { adult: true, shortsOn: true, shorts: { youtube: true, instagram: true, tiktok: true, facebook: true, snapchat: true }, pause: false, blocklist: ['reddit.com'] } }); await tick(200);
  ok('adult filter on: SafeSearch rules + the adult ruleset are enabled', () => { assert(ruleIds().some(i => i >= 1001 && i < 1101), 'no safe-search rules'); assert(calls.dnrEnabled.some(o => (o.enableRulesetIds || []).includes('adult'))); });
  ok('short videos on: page rules exist and the content script is registered', () => { assert(ruleIds().some(i => i >= 1101 && i < 1201)); assert(calls.scriptsRegistered.length >= 1); assert.strictEqual(calls.scriptsRegistered[0][0].id, 'ww-shortform'); });
  ok('always-blocked site: a rule redirects it to the blocked page', () => { const r = dyn.find(x => x.id === 2001); assert(r && r.condition.requestDomains.includes('reddit.com')); assert(r.action.redirect.extensionPath.includes('r=custom')); });
  await local.set({ protect: { adult: false, shortsOn: false, pause: false, blocklist: [] } }); await tick(200);
  ok('turning everything off removes every WebWell rule and the script', () => { assert.deepStrictEqual(ruleIds(), []); assert(calls.dnrEnabled.some(o => (o.disableRulesetIds || []).includes('adult'))); assert(calls.scriptsUnregistered.length >= 1); });

  // ---- focus session lifecycle ----
  const r1 = await msg({ type: 'ww-lockin', op: 'start', mins: 25, task: 'Write the report', sound: 'rain', block: true, breakMins: 5 }); await tick(250);
  ok('start: a focus session is saved with the task', () => { assert(r1.ok); const l = local.d.lockin; assert.strictEqual(l.phase, 'focus'); assert.strictEqual(l.task, 'Write the report'); assert.strictEqual(l.mins, 25); assert(l.endsAt - l.startedAt === 25 * 60000); });
  ok('start: an end-of-session alarm is scheduled', () => assert(calls.alarms.some(a => a.n === 'lockin-end')));
  ok('start: the toolbar badge shows the minutes left', () => assert.strictEqual(calls.badge[calls.badge.length - 1], '25m'));
  ok('start: distracting sites are blocked (focus rule present)', () => { const r = dyn.find(x => x.id === 3001); assert(r, 'no focus rule'); assert(r.condition.requestDomains.includes('youtube.com')); assert(r.action.redirect.extensionPath.includes('r=focus')); });
  await msg({ type: 'ww-lockin', op: 'pause' }); await tick(200);
  ok('pause: time is frozen and the badge shows ||', () => { assert(local.d.lockin.pausedLeft > 0); assert.strictEqual(local.d.lockin.endsAt, null); assert.strictEqual(calls.badge[calls.badge.length - 1], '||'); });
  ok('pause: blocking stays on', () => assert(dyn.find(x => x.id === 3001)));
  await msg({ type: 'ww-lockin', op: 'resume' }); await tick(200);
  ok('resume: the clock runs again', () => { assert.strictEqual(local.d.lockin.pausedLeft, null); assert(local.d.lockin.endsAt > Date.now()); });
  const endsBefore = local.d.lockin.endsAt;
  await msg({ type: 'ww-lockin', op: 'add' }); await tick(100);
  ok('+5 min extends the session', () => assert.strictEqual(local.d.lockin.endsAt - endsBefore, 5 * 60000));
  // pretend 10 minutes have been focused, then end early
  const l = local.d.lockin; l.startedAt -= 10 * 60000; l.endsAt = Date.now() + (l.totalMs - 10 * 60000); await local.set({ lockin: l }); await tick(100);
  await msg({ type: 'ww-lockin', op: 'end' }); await tick(250);
  ok('ending early keeps only the minutes actually focused', () => { const d = local.d.focusLog[todayKey()]; assert.strictEqual(d.mins, 10); assert.strictEqual(d.sessions, 1); });
  ok('ending early: the summary screen state is set and blocking lifts', () => { assert.strictEqual(local.d.lockin.phase, 'done'); assert.strictEqual(local.d.lockin.doneMins, 10); assert(!dyn.find(x => x.id === 3001)); });
  ok('ending stops the focus sound', () => assert(calls.sent.some(m => m.cmd === 'stop-all')));
  ok('the badge clears', () => assert.strictEqual(calls.badge[calls.badge.length - 1], ''));
  await msg({ type: 'ww-lockin', op: 'dismiss' }); await tick(100);
  ok('dismiss clears the session', () => assert(!('lockin' in local.d)));

  // ---- a session that runs to its end, then the break ----
  await msg({ type: 'ww-lockin', op: 'start', mins: 1, task: '', sound: 'none', block: true, breakMins: 5 }); await tick(200);
  let s = local.d.lockin; s.endsAt = Date.now() - 50; s.startedAt = Date.now() - 60050; await local.set({ lockin: s }); await tick(50);
  await alarm('lockin-end');
  ok('finishing: logged, notified, and a break starts', () => { assert.strictEqual(local.d.lockin.phase, 'break'); assert.strictEqual(local.d.focusLog[todayKey()].sessions, 2); assert(calls.notifications.some(x => /1 minutes focused|minutes focused/.test(x.o.message))); assert.strictEqual(local.d.lockin.block, false); });
  ok('the break does not block sites', () => assert(!dyn.find(x => x.id === 3001)));
  s = local.d.lockin; s.endsAt = Date.now() - 50; await local.set({ lockin: s }); await tick(50);
  await alarm('lockin-end');
  ok('when the break ends, the done screen appears and the user is told', () => { assert.strictEqual(local.d.lockin.phase, 'done'); assert(calls.notifications.some(x => /another focus session/.test(x.o.message))); });
  ok('notifications no longer mention "locked in"', () => assert(!calls.notifications.some(x => /locked in/i.test(x.o.message + x.o.title))));
  await msg({ type: 'ww-lockin', op: 'dismiss' });

  // ---- blocked-page helpers and the mindful pause ----
  L.nav.forEach(f => f({ frameId: 0, tabId: 7, url: 'https://reddit.com/r/all' })); await tick(50);
  const info = await msg({ type: 'ww-blocked-info' });
  ok('the blocked page can ask which address the tab was heading to', () => assert.strictEqual(info.url, 'https://reddit.com/r/all'));
  await msg({ type: 'ww-blocked-hit', reason: 'adult' }); await msg({ type: 'ww-blocked-hit', reason: 'adult' }); await tick(50);
  ok('blocked pages are counted per day', () => assert.strictEqual(local.d.protectStats[todayKey()].adult, 2));
  await local.set({ protect: { pause: true, adult: false, shortsOn: false, blocklist: [] } }); await tick(200);
  ok('mindful pause on: a pause rule covers distracting sites', () => { const r = dyn.find(x => x.id === 4001); assert(r && r.condition.requestDomains.includes('reddit.com')); assert(r.action.redirect.extensionPath.includes('pause.html')); });
  const cont = await msg({ type: 'ww-pause-continue', url: 'https://www.reddit.com/r/all' }); await tick(50);
  ok('"Continue" lets that site through for a while (allow rule)', () => { assert(cont.ok); const a = sess.find(x => x.action.type === 'allow'); assert(a && a.id >= 5001); assert(a.condition.requestDomains.includes('reddit.com')); });
  const pa = await session.get('pauseAllows'); const idKey = Object.keys(pa.pauseAllows)[0]; pa.pauseAllows[idKey] = Date.now() - 1000; await session.set({ pauseAllows: pa.pauseAllows });
  await alarm('webwell-tick');
  ok('...and the allowance expires on the next tick', () => assert(!sess.find(x => x.id === +idKey)));
  const bad = await msg({ type: 'ww-pause-continue', url: 'not a url' });
  ok('a bad address is refused', () => assert.strictEqual(bad.ok, false));

  console.log('\n' + n + ' passed' + (fails ? ', ' + fails + ' FAILED' : '')); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('TEST CRASH: ' + (e.stack || e)); process.exit(2); });
