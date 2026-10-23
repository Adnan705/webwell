// Tests for the first-run welcome tour (newtab/welcome.js).
//   node tools/test-welcome.js     (needs jsdom, like test-review.js)
'use strict';
const { JSDOM } = (() => { try { return require('jsdom'); } catch (e) { return require(require('path').join(process.env.TEMP || '/tmp', 'wwjs/node_modules/jsdom')); } })();
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'newtab/welcome.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'newtab/newtab.html'), 'utf8');
const NT = fs.readFileSync(path.join(ROOT, 'newtab/newtab.js'), 'utf8');
const BG = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');
const DASH = fs.readFileSync(path.join(ROOT, 'dashboard/dashboard.js'), 'utf8');
let passed = 0, failed = 0;
const ok = async (name, fn) => { try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); } };
const tick = ms => new Promise(r => setTimeout(r, ms || 40));

const W = (() => { const m = { exports: {} }; new Function('module', 'window', SRC.replace("typeof window === 'undefined'", 'true'))(m, undefined); return m.exports; })();

async function boot({ state, name = '', forced = false, locked = false } = {}) {
  const dom = new JSDOM('<!doctype html><body class="' + (locked ? 'locked' : '') + '"></body>', { runScripts: 'outside-only', url: 'chrome-extension://x/newtab/newtab.html', pretendToBeVisual: true });
  const w = dom.window; const store = { ntWelcome: state }; const names = []; let ended = 0;
  w.chrome = { storage: { local: { get: async () => JSON.parse(JSON.stringify(store)), set: async o => { Object.assign(store, JSON.parse(JSON.stringify(o))); } } } };
  w.eval(SRC);
  const shown = await w.WW_WELCOME.start({ name, forced, onName: async v => { names.push(v); }, onEnd: () => { ended++; } });
  const q = s => w.document.querySelector(s);
  const click = s => q(s).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const key = k => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  return { w, store, names, shown, q, click, key, ended: () => ended, step: () => q('.wl-card') && q('.wl-card').getAttribute('data-step') };
}

(async () => {
  await ok('rule: a brand-new user sees the tour', () => assert.strictEqual(W.shouldShow(null, false, false), true));
  await ok('rule: someone who already has a name (an update) does not', () => assert.strictEqual(W.shouldShow(null, true, false), false));
  await ok('rule: never again after finishing or skipping', () => assert.strictEqual(W.shouldShow({ done: true }, false, false), false));
  await ok('rule: "Show the tour again" always shows it', () => assert.strictEqual(W.shouldShow({ done: true }, true, true), true));
  await ok('it covers the name, every main feature and a closing step', () => assert.deepStrictEqual(W.STEPS.map(s => s.id), ['name', 'focus', 'music', 'protect', 'stats', 'yours']));
  await ok('every feature step says where to find it and has an animated scene', () => {
    const feats = W.STEPS.filter(s => s.scene);
    assert.strictEqual(feats.length, 4);
    for (const s of feats) { assert(s.where && s.where.length > 20, s.id + ' has no "where"'); assert(W.SCENES[s.scene], s.scene + ' scene missing'); }
  });
  await ok('each scene has a clicking cursor and only uses images bundled with the extension', () => {
    for (const id of Object.keys(W.SCENES)) {
      const h = W.sceneHtml(id);
      assert(h.includes('sc-cur') && h.includes('sc-ring'), id + ' has no cursor');
      for (const m of h.matchAll(/src="([^"]+)"/g)) { assert(!/^https?:/.test(m[1]), id + ' loads a remote image'); assert(fs.existsSync(path.join(ROOT, 'newtab', m[1])), m[1] + ' missing'); }
    }
  });
  await ok('every scene animation in the CSS exists, and motion can be turned off', () => {
    const css = fs.readFileSync(path.join(ROOT, 'newtab/newtab.css'), 'utf8');
    const used = new Set([...css.matchAll(/animation(?:-name)?:\s*(sc[A-Za-z]+-?[A-Za-z0-9]*)/g)].map(m => m[1]));
    for (const n of used) assert(css.includes('@keyframes ' + n + ' '), 'missing @keyframes ' + n);
    assert(/prefers-reduced-motion[\s\S]{0,120}\.sc-stage/.test(css));
  });

  let t = await boot();
  await ok('first run: opens on the name step', () => { assert(t.shown); assert.strictEqual(t.step(), 'name'); assert(t.q('#wlName')); });
  t.q('#wlName').value = '  Sam  '; t.click('#wlNext'); await tick();
  await ok('Continue saves the trimmed name and moves to the first feature', () => { assert.deepStrictEqual(t.names, ['Sam']); assert.strictEqual(t.step(), 'focus'); });
  t.click('#wlBack'); await tick();
  await ok('Back returns to the name step with the name filled in', () => { assert.strictEqual(t.step(), 'name'); assert.strictEqual(t.q('#wlName').value, 'Sam'); });
  t.click('#wlNext'); await tick();
  await ok('an unchanged name is not saved twice', () => assert.deepStrictEqual(t.names, ['Sam']));
  t.key('ArrowRight'); await tick(); t.key('ArrowRight'); await tick(); t.key('ArrowRight'); await tick(); t.key('ArrowRight'); await tick();
  await ok('arrow keys move through the steps to the last one', () => { assert.strictEqual(t.step(), 'yours'); assert.match(t.q('#wlNext').textContent, /Start using WebWell/); assert(t.q('.wl-title').textContent.includes('Sam')); });
  await ok('the last step hides "Skip tour"', () => assert(t.q('#wlSkip').classList.contains('invisible')));
  t.click('#wlNext'); await tick(320);
  await ok('finishing remembers it, closes the tour and reports back', () => { assert.strictEqual(t.store.ntWelcome.done, true); assert.strictEqual(t.store.ntWelcome.skipped, false); assert(!t.q('#welcome')); assert.strictEqual(t.ended(), 1); });

  t = await boot();
  t.click('#wlNext'); await tick();
  await ok('a name is optional: Continue without one still moves on', () => { assert.strictEqual(t.names.length, 0); assert.strictEqual(t.step(), 'focus'); });
  t.click('#wlSkip'); await tick(320);
  await ok('"Skip tour" ends it for good and marks it skipped', () => { assert.strictEqual(t.store.ntWelcome.done, true); assert.strictEqual(t.store.ntWelcome.skipped, true); assert(!t.q('#welcome')); });

  t = await boot();
  t.q('#wlName').value = 'Ana'; t.key('Escape'); await tick(320);
  await ok('Escape skips, but keeps a name already typed', () => { assert.deepStrictEqual(t.names, ['Ana']); assert.strictEqual(t.store.ntWelcome.skipped, true); });

  t = await boot({ state: { done: true } });
  await ok('after it is done, a new tab shows nothing', () => { assert.strictEqual(t.shown, false); assert(!t.q('#welcome')); });
  t = await boot({ locked: true });
  await ok('never interrupts a running focus session', () => assert.strictEqual(t.shown, false));
  t = await boot({ state: { done: true }, name: 'Sam', forced: true });
  await ok('"Show the tour again" replays it with the saved name', () => { assert(t.shown); assert.strictEqual(t.q('#wlName').value, 'Sam'); });

  await ok('the page loads the tour before newtab.js', () => assert(HTML.indexOf('welcome.js') > 0 && HTML.indexOf('welcome.js') < HTML.indexOf('newtab.js')));
  await ok('the new tab starts the tour instead of the old name prompt', () => { assert(/startWelcome\(\)/.test(NT)); assert(/forced: location\.hash === '#tour'/.test(NT)); });
  await ok('installing opens the new tab (where the tour runs), not the dashboard', () => assert(/reason === 'install'[\s\S]{0,200}newtab\/newtab\.html/.test(BG)));
  await ok('Settings has "Show the tour again", which opens #tour', () => { assert(/id="tourBtn"/.test(DASH)); assert(/newtab\/newtab\.html'\) \+ '#tour'/.test(DASH)); });

  console.log('\n' + passed + ' passed' + (failed ? ', ' + failed + ' FAILED' : ''));
  process.exit(failed ? 1 : 0);
})();
