// WebWell pre-release checks. Run:  node tools/check.js
// 1. every .js file parses   2. manifest + rulesets are valid
// 3. element ids used by scripts exist   4. blocking-rule logic behaves
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
let failures = 0, passes = 0;
function check(name, fn) {
  try { fn(); passes++; } catch (e) { failures++; console.log('FAIL  ' + name + '\n      ' + e.message); }
}
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['.git', 'node_modules'].includes(e.name)) walk(rel, out); }
    else out.push(rel);
  }
  return out;
}
const files = walk('.');

// 1. syntax
for (const f of files.filter(f => f.endsWith('.js') && !f.startsWith('tools'))) {
  check('parse ' + f, () => new vm.Script(read(f), { filename: f }));
}

// 2. manifest + rules
const manifest = JSON.parse(read('manifest.json'));
check('manifest files exist', () => {
  const refs = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page,
    manifest.chrome_url_overrides.newtab, ...manifest.declarative_net_request.rule_resources.map(r => r.path),
    ...manifest.web_accessible_resources.flatMap(w => w.resources), ...Object.values(manifest.icons)];
  for (const r of refs) assert(fs.existsSync(path.join(ROOT, r)), 'missing ' + r);
});
check('importScripts targets exist', () => {
  const m = read('background.js').match(/importScripts\(([^)]*)\)/);
  for (const f of m[1].match(/'[^']+'/g).map(s => s.slice(1, -1))) assert(fs.existsSync(path.join(ROOT, f)), 'missing ' + f);
});
check('html script/style refs exist', () => {
  for (const f of files.filter(f => f.endsWith('.html'))) {
    const dir = path.dirname(f);
    for (const m of read(f).matchAll(/(?<![\w-])(?:src|href)="([^"#:]+?)(?:\?[^"]*)?"/g)) {
      // a leading slash on the website means "from the site root", not from the page's own folder
      if (f.startsWith('website') && m[1].startsWith('/') && !/\.[a-z0-9]+$/i.test(m[1])) continue; // a page route such as /install
      const base = m[1].startsWith('/') && f.startsWith('website') ? 'website' : dir;
      assert(fs.existsSync(path.join(ROOT, base, m[1])), f + ' -> ' + m[1]);
    }
  }
});
const adult = JSON.parse(read('rules/adult.json'));
check('adult ruleset valid', () => {
  const ids = new Set();
  let domains = 0;
  for (const r of adult) {
    assert(!ids.has(r.id), 'duplicate id ' + r.id); ids.add(r.id);
    assert(r.condition.resourceTypes && r.condition.resourceTypes.length, 'rule ' + r.id + ' has no resourceTypes');
    for (const d of r.condition.requestDomains || []) {
      assert(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d), 'bad domain ' + d); domains++;
    }
    // Chrome compiles regexes with RE2 and skips any rule over 2 KB of memory; keep each tiny.
    if (r.condition.regexFilter) { new RegExp(r.condition.regexFilter); assert(r.condition.regexFilter.length <= 80, 'regex too long in rule ' + r.id); }
  }
  assert(adult.filter(r => r.condition.regexFilter).length <= 100, 'too many regex rules (Chrome allows 1000)');
  assert(adult.length < 30000, 'too many static rules');
  console.log('      adult ruleset: ' + adult.length + ' rules, ' + domains.toLocaleString() + ' domains');
});

// 3. ids used by page scripts exist in that page's HTML (or in markup the scripts build)
function idsUsed(src) {
  const out = new Set();
  for (const m of src.matchAll(/(?:getElementById|\$l?m?|\$p)\('([A-Za-z][\w-]*)'\)/g)) out.add(m[1]);
  return out;
}
function idsDefined(src) {
  const out = new Set();
  for (const m of src.matchAll(/id=\\?["']([A-Za-z][\w-]*)\\?["']/g)) out.add(m[1]);
  for (const m of src.matchAll(/id="'\s*\+\s*\w+\s*\+\s*'([\w-]+)/g)) out.add('*' + m[1]);  // prefix + 'Form'
  for (const m of src.matchAll(/\.id\s*=\s*'([\w-]+)'/g)) out.add(m[1]);                    // el.id = 'calPop'
  // helpers that emit id="<first argument>"
  const helpers = [...src.matchAll(/function (\w+)\(id\b[^)]*\)\s*\{[^}]*id="'\s*\+\s*id\s*\+/g)].map(m => m[1]);
  for (const h of helpers) for (const m of src.matchAll(new RegExp('\\b' + h + "\\('([\\w-]+)'", 'g'))) out.add(m[1]);
  return out;
}
const PAGES = {
  'newtab/newtab.html': ['newtab/newtab.js', 'newtab/music.js', 'newtab/lockin.js'],
  'dashboard/dashboard.html': ['dashboard/dashboard.js', 'dashboard/protect-view.js'],
  'popup/popup.html': ['popup/popup.js'],
  'blocked/blocked.html': ['blocked/blocked.js'],
  'blocked/pause.html': ['blocked/blocked.js']
};
for (const [html, scripts] of Object.entries(PAGES)) {
  check('element ids on ' + html, () => {
    const defined = idsDefined(read(html));
    const srcs = scripts.map(read);
    srcs.forEach(s => idsDefined(s).forEach(i => defined.add(i)));
    const dynamicSuffix = [...defined].filter(i => i.startsWith('*')).map(i => i.slice(1));
    const missing = [];
    for (const s of srcs) for (const id of idsUsed(s)) {
      if (!defined.has(id) && !dynamicSuffix.some(sfx => id.endsWith(sfx))) missing.push(id);
    }
    // the blocked page and the pause page share one script; each only touches its own ids
    const shared = html.startsWith('blocked/') ? missing.filter(id => !read('blocked/blocked.html').includes(id) && !read('blocked/pause.html').includes(id)) : missing;
    assert(!shared.length, 'missing ids: ' + shared.join(', '));
  });
}

// 4. blocking logic, run against the real lib files
const ctx = { console, URL, TextEncoder, crypto: require('crypto').webcrypto, module: undefined };
vm.createContext(ctx);
for (const f of ['lib/time.js', 'lib/categories.js', 'lib/protect.js']) vm.runInContext(read(f), ctx, { filename: f });
// Top-level const/let live in the context's lexical scope, not on the global object.
const P = new Proxy({}, { get: (_, k) => vm.runInContext(String(k), ctx) });

check('normalizeHost', () => {
  assert.strictEqual(P.normalizeHost(' https://www.X.com/path?q=1 '), 'x.com');
  assert.strictEqual(P.normalizeHost('news.ycombinator.com'), 'news.ycombinator.com');
  assert.strictEqual(P.normalizeHost('not a site'), null);
  assert.strictEqual(P.normalizeHost('localhost'), null);
});
check('distractingDomains follows overrides', () => {
  const base = P.distractingDomains({});
  assert(base.includes('youtube.com') && !base.includes('github.com'));
  const o = P.distractingDomains({ 'youtube.com': 'productive', 'chess.com': 'distracting' });
  assert(!o.includes('youtube.com') && o.includes('chess.com'));
});
function rulesFor(p, lockin, cats) { return P.buildDynamicRules(P.protectState(p), lockin, cats || {}); }
check('no rules when everything is off', () => assert.strictEqual(rulesFor({}, null).length, 0));
check('all features on: ids unique and in range, regexes compile', () => {
  const rules = rulesFor({ adult: true, shortsOn: true, pause: true, blocklist: ['reddit.com'], focusExtra: ['news.ycombinator.com'] },
    { phase: 'focus', block: true });
  const ids = rules.map(r => r.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate rule ids');
  assert(ids.every(id => id >= 1000 && id < 5000), 'rule id outside the dynamic range');
  for (const r of rules) if (r.condition.regexFilter) new RegExp(r.condition.regexFilter);
  assert(rules.length < 5000, 'too many dynamic rules');
});
check('Locked In blocks only while focusing', () => {
  const has = l => rulesFor({}, l).some(r => r.id === P.RULE_IDS.lockin);
  assert(has({ phase: 'focus', block: true }));
  assert(!has({ phase: 'focus', block: false }));
  assert(!has({ phase: 'break' }));
  assert(!has({ phase: 'done' }));
  const r = rulesFor({ focusExtra: ['news.ycombinator.com'] }, { phase: 'focus' }).find(x => x.id === P.RULE_IDS.lockin);
  assert(r.condition.requestDomains.includes('news.ycombinator.com') && r.condition.requestDomains.includes('youtube.com'));
});
check('priorities: blocks beat pause allows, pause allows beat pause', () => {
  const rules = rulesFor({ pause: true, blocklist: ['x.com'] }, null);
  const pause = rules.find(r => r.id === P.RULE_IDS.pause);
  const custom = rules.find(r => r.id === P.RULE_IDS.custom);
  assert(custom.priority > 50 && pause.priority < 50);
});
check('short-video patterns', () => {
  const rules = rulesFor({ shortsOn: true }, null);
  const hit = url => rules.some(r => r.condition.regexFilter && new RegExp(r.condition.regexFilter).test(url));
  assert(hit('https://www.youtube.com/shorts/abc123XYZ'));
  assert(hit('https://m.youtube.com/shorts/abc123XYZ'));
  assert(!hit('https://www.youtube.com/watch?v=abc123XYZ'));
  assert(hit('https://www.instagram.com/reels/'));
  assert(hit('https://www.instagram.com/reel/C1abc/'));
  assert(!hit('https://www.instagram.com/someone/'));
  assert(hit('https://www.facebook.com/reel/12345'));
  assert(hit('https://www.snapchat.com/spotlight/xyz'));
  assert(rules.some(r => (r.condition.requestDomains || []).includes('tiktok.com')));
  const ytOff = rulesFor({ shortsOn: true, shorts: { youtube: false } }, null);
  assert(!ytOff.some(r => r.condition.regexFilter && new RegExp(r.condition.regexFilter).test('https://www.youtube.com/shorts/a1b2c3')));
});
check('SafeSearch rules cannot loop', () => {
  const rules = P.safeSearchRules();
  const redirects = rules.filter(r => r.action.type === 'redirect');
  for (const r of redirects) {
    const p = r.action.redirect.transform.queryTransform.addOrReplaceParams[0];
    const allow = rules.find(a => a.action.type === 'allow' && a.condition.urlFilter === p.key + '=' + p.value);
    assert(allow && allow.priority > r.priority, 'no higher-priority allow for ' + p.key);
  }
  assert(rules.some(r => r.action.type === 'modifyHeaders'));
});
check('adult keyword rule catches unlisted sites only by host', () => {
  const res = adult.filter(r => r.condition.regexFilter).map(r => new RegExp(r.condition.regexFilter, 'i'));
  const re = { test: u => res.some(x => x.test(u)) };
  assert(re.test('https://new-porn-site.example/'));
  assert(!re.test('https://www.example.com/porn-statistics-study'));
  assert(!re.test('https://www.sussex.ac.uk/'));
});
// Spotify helpers
const sp = require(path.join(ROOT, 'lib/spotify.js'));
check('parseSpotify', () => {
  const ok = (s, type, id) => { const p = sp.parseSpotify(s); assert(p, 'did not parse: ' + s); assert.strictEqual(p.type, type); assert.strictEqual(p.id, id); };
  ok('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc123', 'track', '4cOdK2wGLETKBW3PvgPWqT');
  ok('https://open.spotify.com/intl-de/album/1DFixLWuPkv3KT3TnV35m3', 'album', '1DFixLWuPkv3KT3TnV35m3');
  ok('https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ', 'playlist', '37i9dQZF1DWZeKCadgRdKQ');
  ok('spotify:playlist:37i9dQZF1DWZeKCadgRdKQ', 'playlist', '37i9dQZF1DWZeKCadgRdKQ');
  for (const bad of ['', 'hello', 'https://example.com/track/4cOdK2wGLETKBW3PvgPWqT', 'https://open.spotify.com/user/someone', 'javascript:alert(1)', 'https://open.spotify.com/track/short'])
    assert.strictEqual(sp.parseSpotify(bad), null, 'should reject: ' + bad);
  const p = sp.parseSpotify('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=x');
  assert.strictEqual(sp.spotifyEmbedUrl(p), 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT?utm_source=webwell&theme=0');
});
check('suggested playlists are parseable and unique', () => {
  assert(sp.SPOTIFY_SUGGESTED.length >= 3);
  const urls = sp.SPOTIFY_SUGGESTED.map(s => { const p = sp.parseSpotify(s.url); assert(p && p.url === s.url, s.name); return s.url; });
  assert.strictEqual(new Set(urls).size, urls.length);
});
check('Spotify permissions + player wiring', () => {
  assert(manifest.host_permissions.includes('https://open.spotify.com/*'), 'host permission for oEmbed missing');
  const html = read('offscreen.html');
  assert(html.includes('id="spFrame"') && html.includes('encrypted-media'), 'offscreen Spotify frame missing');
  assert(html.indexOf('lib/spotify.js') < html.indexOf('offscreen.js'), 'spotify.js must load before offscreen.js');
  assert(read('newtab/newtab.html').includes('../lib/spotify.js'), 'new tab does not load spotify.js');
});

(async () => {
  const salt = P.newSalt();
  const a = await P.hashPin('1234', salt), b = await P.hashPin('1234', salt), c = await P.hashPin('1235', salt);
  check('PIN hash is stable and distinct', () => { assert.strictEqual(a, b); assert.notStrictEqual(a, c); assert.strictEqual(a.length, 64); });
  console.log((failures ? failures + ' failed, ' : '') + passes + ' passed');
  process.exitCode = failures ? 1 : 0;
})();
