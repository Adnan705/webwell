// Loads the unpacked extension in a real (headless) Edge and lets a test drive its pages.
//   const { withExtension } = require('./cdp-harness.cjs');
//   withExtension(async ({ open, ev, id, plusKey, shot }) => {
//     const page = await open('dashboard/dashboard.html#reports');            // page for chrome-extension://<id>/...
//     await ev(page, "chrome.storage.local.set({ plusKey: '" + plusKey + "' })");   // switch Plus on (a real signed test key)
//     console.log(await ev(page, 'document.title'));
//     await shot(page, 'out.png');
//   });
// Every opened page counts uncaught errors: process exits non-zero if any happen. Needs Edge, and the
// private key at D:\Extensions\webwell-private (only to sign a throw-away test key).
const { spawn, execFileSync } = require('child_process'); const http = require('http'); const fs = require('fs'), os = require('os'), path = require('path');
const EDGE = process.env['ProgramFiles(x86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe';
const EXT = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = u => new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
function cdp(u) { return new Promise((resolve, reject) => { const ws = new WebSocket(u); let id = 0; const pend = {}; const events = []; ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } else if (d.method) events.push(d); }; ws.onopen = () => resolve({ events, close: () => ws.close(), send: (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); }) }); ws.onerror = reject; }); }
async function ev(c, expr) { const r = await c.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) return 'EXC ' + JSON.stringify((r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description) || r.result.exceptionDetails.text); return r.result.result.value; }

async function withExtension(fn, opts = {}) {
  const PORT = opts.port || (9400 + Math.floor(Math.random() * 400));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wwh-'));
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=' + (opts.size || '1280,800'), '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile, '--enable-unsafe-extension-debugging', '--remote-allow-origins=*', 'about:blank'], { stdio: 'ignore' });
  const pages = []; let failed = 0;
  try {
    await sleep(2500);
    const ver = await getJson('http://127.0.0.1:' + PORT + '/json/version'); const br = await cdp(ver.webSocketDebuggerUrl);
    const loaded = await br.send('Extensions.loadUnpacked', { path: EXT }); if (loaded.error) throw new Error('load failed: ' + JSON.stringify(loaded.error));
    const id = loaded.result.id; await sleep(2000);
    let plusKey = '';
    try { plusKey = String(execFileSync('node', [path.join(__dirname, 'plus-keygen.mjs'), '--name', 'test-harness', '--plan', 'family', '--days', '1'])).split(/\r?\n/).find(l => l.startsWith('WWP1.')) || ''; } catch (e) {}
    const open = async rel => {
      const t = await br.send('Target.createTarget', { url: 'about:blank' }); const list = await getJson('http://127.0.0.1:' + PORT + '/json/list');
      const c = await cdp(list.find(x => x.id === t.result.targetId).webSocketDebuggerUrl); await c.send('Runtime.enable'); await c.send('Page.enable');
      await c.send('Emulation.setDeviceMetricsOverride', { width: opts.w || 1280, height: opts.h || 800, deviceScaleFactor: 1, mobile: false });
      await c.send('Page.navigate', { url: 'chrome-extension://' + id + '/' + rel }); await sleep(opts.wait || 2000); pages.push({ rel, c }); return c;
    };
    const shot = async (c, file) => { const s = await c.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(s.result.data, 'base64')); };
    const sw = async () => { const list = await getJson('http://127.0.0.1:' + PORT + '/json/list'); const t = list.find(x => x.type === 'service_worker' && x.url.includes(id) && /background\.js$/.test(x.url)); const c = await cdp(t.webSocketDebuggerUrl); await c.send('Runtime.enable'); return c; };
    await fn({ open, ev, shot, sw, id, plusKey, br, sleep });
    for (const p of pages) { const errs = p.c.events.filter(e => e.method === 'Runtime.exceptionThrown'); if (errs.length) { failed++; console.log('UNCAUGHT ERRORS on ' + p.rel + ':', errs.map(e => (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description) || e.params.exceptionDetails.text).join(' | ')); } }
  } finally { edge.kill(); await sleep(400); try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} }
  if (failed) process.exitCode = 1;
}
module.exports = { withExtension, ev, sleep };
