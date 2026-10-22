// Tests for the vector backgrounds: the generator (newtab/vector-bg.js) and the instant-paint boot script.
//   node tools/test-vector-bg.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
let passed = 0;
const ok = (name, fn) => { try { fn(); passed++; console.log('ok   ' + name); } catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; } };

const ctx = vm.createContext({ console }); ctx.globalThis = ctx;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'newtab/vector-bg.js'), 'utf8'), ctx);
const V = ctx.WW_VBG;

ok('six styles and eight palettes are offered', () => { assert.strictEqual(V.STYLES.length, 6); assert.strictEqual(V.PALETTES.length, 8); });
ok('every style x palette is a clean SVG: no NaN or undefined, under 40 KB', () => {
  for (const s of V.STYLES) for (const p of V.PALETTES) {
    const x = V.svg(s.id, p.id);
    assert(x.startsWith('<svg ') && x.endsWith('</svg>'), s.id + '/' + p.id + ' is not an svg');
    assert(!/NaN|undefined|Infinity|null/.test(x), s.id + '/' + p.id + ' has a bad number');
    assert(x.length < 40000, s.id + '/' + p.id + ' is ' + x.length + ' chars');
  }
});
ok('the same choice always draws the same picture', () => assert.strictEqual(V.svg('mountains', 'dawn'), V.svg('mountains', 'dawn')));
ok('different scenes and different palettes draw different pictures', () => {
  assert.notStrictEqual(V.svg('mountains', 'dawn'), V.svg('hills', 'dawn'));
  assert.notStrictEqual(V.svg('mountains', 'dawn'), V.svg('mountains', 'ocean'));
});
ok('unknown names fall back to the first scene and palette instead of breaking', () => { assert.strictEqual(V.svg('nope', 'nope'), V.svg('mountains', 'dawn')); assert(/^#[0-9a-f]{6}$/i.test(V.base('nope'))); });
ok('the data address is a usable image URL', () => assert(V.dataUri('waves', 'ocean').startsWith('data:image/svg+xml;utf8,%3Csvg')));
ok('shuffle never returns the current choice and stays inside the list', () => {
  for (let i = 0; i < 300; i++) {
    const n = V.pick({ style: 'orbs', pal: 'dusk' });
    assert(!(n.style === 'orbs' && n.pal === 'dusk'));
    assert(V.STYLES.some(s => s.id === n.style) && V.PALETTES.some(p => p.id === n.pal));
  }
});
ok('every palette is dark enough for white clock text (middle of the sky)', () => {
  for (const p of V.PALETTES) { const h = p.sky[1], r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); assert((0.299 * r + 0.587 * g + 0.114 * b) < 150, p.id + ' is too bright'); }
});

// ---- boot.js: runs before first paint ----
function boot(snapshot) {
  const attrs = {}, style = {}, de = { setAttribute: (k, v) => { attrs[k] = v; }, style };
  const c = vm.createContext({ window: { WW_VBG: V, WW_LANDMARKS: [] }, document: { documentElement: de, head: { appendChild() {} }, createElement: () => ({}) }, localStorage: { getItem: () => (snapshot ? JSON.stringify(snapshot) : null) }, Date, JSON });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'newtab/boot.js'), 'utf8'), c);
  return { attrs, style };
}
ok('boot: a saved vector choice paints its colour and sets the mode before anything loads', () => { const r = boot({ v: 1, bgMode: 'vector', vecStyle: 'hills', vecPal: 'ocean' }); assert.strictEqual(r.attrs['data-bgmode'], 'vector'); assert.strictEqual(r.style.backgroundColor, V.base('ocean')); });
ok('boot: gradient stays gradient, anything else opens on photos', () => { assert.strictEqual(boot({ v: 1, bgMode: 'gradient' }).attrs['data-bgmode'], 'gradient'); assert.strictEqual(boot({ v: 1, bgMode: 'weird' }).attrs['data-bgmode'], 'photos'); assert.strictEqual(boot(null).attrs['data-bgmode'], 'photos'); });

// ---- the page wires it up ----
ok('the new tab page loads the generator before boot.js and has the layer and shuffle button', () => {
  const h = fs.readFileSync(path.join(ROOT, 'newtab/newtab.html'), 'utf8');
  assert(h.indexOf('vector-bg.js') > -1 && h.indexOf('vector-bg.js') < h.indexOf('boot.js'));
  assert(h.includes('id="bgVector"') && h.includes('id="vecShuffle"'));
});
ok('the dashboard loads the generator', () => assert(fs.readFileSync(path.join(ROOT, 'dashboard/dashboard.html'), 'utf8').includes('newtab/vector-bg.js')));

console.log('\n' + passed + ' passed');
