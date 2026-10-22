// Tests for the one-time review request (newtab/review.js).
//   node tools/test-review.js     (needs jsdom, like test-music-ui.js)
'use strict';
const { JSDOM } = (() => { try { return require('jsdom'); } catch (e) { return require(require('path').join(process.env.TEMP || '/tmp', 'wwjs/node_modules/jsdom')); } })();
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'newtab/review.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'newtab/newtab.html'), 'utf8');
const card = HTML.match(/<div class="review hidden" id="reviewCard"[\s\S]*?<\/div>\s*<\/div>/)[0];
let passed = 0, failed = 0;
const ok = async (name, fn) => { try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); } };
const DAY = 86400000, now = Date.now();
const tick = ms => new Promise(r => setTimeout(r, ms || 30));

// ---- pure rules ----
const R = (() => { const m = { exports: {} }; new Function('module', 'window', SRC.replace("typeof window === 'undefined'", 'true'))(m, undefined); return m.exports; })();
const base = { firstSeen: now - 5 * DAY, state: '', nextAt: 0, asked: 0 };

async function boot({ ntReview, focusLog, locked = false } = {}) {
  const dom = new JSDOM('<!doctype html><body class="' + (locked ? 'locked' : '') + '">' + card.replace('class="review hidden"', 'class="review hidden"') + '</body>', { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  const w = dom.window; const store = { ntReview, focusLog }; const created = [];
  w.chrome = { storage: { local: { get: async () => JSON.parse(JSON.stringify(store)), set: async o => { Object.assign(store, JSON.parse(JSON.stringify(o))); } } }, tabs: { create: o => created.push(o) } };
  w.setTimeout = f => { f(); return 0; };
  w.eval(SRC); await tick();
  const el = id => w.document.getElementById(id);
  return { w, store, created, el, shown: () => !el('reviewCard').classList.contains('hidden') };
}
const sessions = n => ({ ['2026-10-1' + 0]: { mins: 25 * n, sessions: n } });

(async () => {
  await ok('rule: not before the person has been around two days', () => assert.strictEqual(R.shouldAsk(now, { ...base, firstSeen: now - DAY }, 5), false));
  await ok('rule: not before three focus sessions', () => assert.strictEqual(R.shouldAsk(now, base, 2), false));
  await ok('rule: asks once both are true', () => assert.strictEqual(R.shouldAsk(now, base, 3), true));
  await ok('rule: never after a review or a no', () => { assert.strictEqual(R.shouldAsk(now, { ...base, state: 'done' }, 9), false); assert.strictEqual(R.shouldAsk(now, { ...base, state: 'never' }, 9), false); });
  await ok('rule: waits out a "maybe later"', () => { assert.strictEqual(R.shouldAsk(now, { ...base, nextAt: now + DAY }, 9), false); assert.strictEqual(R.shouldAsk(now + 15 * DAY, { ...base, nextAt: now + 14 * DAY }, 9), true); });
  await ok('rule: counts sessions across days', () => assert.strictEqual(R.totalSessions({ a: { sessions: 2 }, b: { sessions: 1 }, c: {} }), 3));

  let t = await boot({});
  await ok('first run: starts the clock, shows nothing', () => { assert(t.store.ntReview && t.store.ntReview.firstSeen > 0); assert(!t.shown()); });
  t = await boot({ ntReview: { ...base }, focusLog: sessions(2) });
  await ok('too few sessions: stays hidden', () => assert(!t.shown()));
  t = await boot({ ntReview: { ...base }, focusLog: sessions(4), locked: true });
  await ok('never appears during a focus session', () => assert(!t.shown()));

  t = await boot({ ntReview: { ...base }, focusLog: sessions(4) });
  await ok('an engaged person sees the card', () => assert(t.shown()));
  t.el('reviewYes').click(); await tick();
  await ok('"Leave a review" opens the store reviews page, remembers it and hides the card', () => { assert.strictEqual(t.created[0].url, R.STORE_REVIEWS); assert(R.STORE_REVIEWS.startsWith('https://chromewebstore.google.com/detail/webwell/')); assert.strictEqual(t.store.ntReview.state, 'done'); assert(!t.shown()); });

  t = await boot({ ntReview: { ...base }, focusLog: sessions(4) });
  t.el('reviewLater').click(); await tick();
  await ok('"Maybe later" snoozes about two weeks and does not end it yet', () => { assert.strictEqual(t.store.ntReview.asked, 1); assert(t.store.ntReview.nextAt - Date.now() > 13 * DAY); assert.notStrictEqual(t.store.ntReview.state, 'never'); assert(!t.shown()); });
  t = await boot({ ntReview: { ...base, asked: 1 }, focusLog: sessions(4) });
  t.el('reviewLater').click(); await tick();
  await ok('a second "Maybe later" ends it for good', () => assert.strictEqual(t.store.ntReview.state, 'never'));

  t = await boot({ ntReview: { ...base }, focusLog: sessions(4) });
  t.el('reviewNo').click(); await tick();
  await ok('"No thanks" ends it for good and nothing is opened', () => { assert.strictEqual(t.store.ntReview.state, 'never'); assert.strictEqual(t.created.length, 0); });
  t = await boot({ ntReview: { ...base, state: 'never' }, focusLog: sessions(9) });
  await ok('after "No thanks" it never returns', () => assert(!t.shown()));

  await ok('the card is wired into the new tab page, hidden by default', () => { assert(/id="reviewCard"/.test(HTML) && /class="review hidden"/.test(HTML)); assert(/review\.js/.test(HTML)); });
  await ok('the card promises nothing in return: no reward or incentive wording', () => assert(!/free|reward|prize|discount|unlock|gift/i.test(card.replace(/<[^>]+>/g, ' '))));

  console.log('\n' + passed + ' passed' + (failed ? ', ' + failed + ' FAILED' : ''));
  process.exit(failed ? 1 : 0);
})();
