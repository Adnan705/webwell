const { JSDOM } = require('C:/Users/adnan/AppData/Local/Temp/wwjs/node_modules/jsdom');
const fs = require('fs'); const assert = require('assert');
const SRC = fs.readFileSync('D:/Extensions/webwell-github/website/plus-checkout.js', 'utf8');
const html = fs.readFileSync('D:/Extensions/webwell-github/website/plus.html', 'utf8').replace(/<script src="[^"]*"[^>]*><\/script>/g, '');
let fails = 0; const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };
function run(cfg) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://webwell.app/plus' });
  const w = dom.window; const log = { err: [], scripts: [], opened: null, env: null, token: null };
  w.console.error = m => log.err.push(String(m));
  w.Paddle = { Environment: { set: e => { log.env = e; } }, Initialize: o => { log.token = o.token; log.cb = o.eventCallback; },
    PricePreview: async req => ({ data: { details: { lineItems: [{ formattedTotals: { total: '£7.99' } }] } } }),
    Checkout: { open: o => { log.opened = o; } } };
  const origAppend = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = el => { if (el.tagName === 'SCRIPT') { log.scripts.push(el.src); setTimeout(() => el.onload && el.onload(), 0); return el; } return origAppend(el); };
  w.eval(SRC.replace(/var PADDLE_ENV = '[^']*';/, `var PADDLE_ENV = '${cfg.env}';`).replace(/var CLIENT_TOKEN = '[^']*';/, `var CLIENT_TOKEN = '${cfg.token}';`).replace(/var PRICE_ID = '[^']*';/, `var PRICE_ID = '${cfg.price}';`));
  return new Promise(r => setTimeout(() => r({ w, log }), 60));
}
(async () => {
  let r = await run({ env: '', token: '', price: '' });
  ok('not set up: Paddle is not loaded and buttons stay disabled', r.log.scripts.length === 0 && r.w.document.querySelector('[data-plus-buy]').getAttribute('aria-disabled') === 'true');
  r = await run({ env: 'production', token: 'test_abc', price: 'pri_1' });
  ok('live env with a test token fails loudly and stays off', r.log.scripts.length === 0 && r.log.err.length === 1);
  r = await run({ env: '', token: 'live_abc', price: 'pri_1' });
  ok('no environment set fails loudly and stays off', r.log.scripts.length === 0 && r.log.err.length === 1);
  r = await run({ env: 'production', token: 'live_abc', price: 'x1' });
  ok('a bad price id fails loudly', r.log.scripts.length === 0 && r.log.err.length === 1);
  r = await run({ env: 'production', token: 'live_abc', price: 'pri_123' });
  ok('configured: Paddle.js loads from Paddle', r.log.scripts[0] === 'https://cdn.paddle.com/paddle/v2/paddle.js');
  ok('configured: live token used, environment left as production', r.log.token === 'live_abc' && r.log.env === null);
  ok('price shows exactly what Paddle returned', [...r.w.document.querySelectorAll('[data-plus-price]')].every(n => n.textContent === '£7.99'));
  const btns = [...r.w.document.querySelectorAll('[data-plus-buy]')];
  ok('all buttons are enabled', btns.length >= 3 && btns.every(b => !b.hasAttribute('aria-disabled') && /Get WebWell Plus/.test(b.textContent)));
  btns[0].dispatchEvent(new r.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const o = r.log.opened;
  ok('click opens a one-page overlay for the one price', o && o.items.length === 1 && o.items[0].priceId === 'pri_123' && o.items[0].quantity === 1 && o.settings.displayMode === 'overlay' && o.settings.variant === 'one-page');
  ok('success goes to /welcome', o && o.settings.successUrl === 'https://webwell.app/welcome');
  r.log.cb({ name: 'checkout.completed', data: { transaction_id: 'txn_9', customer: { email: 'a@b.co' } } });
  ok('a finished checkout remembers the email and order for the thank-you page', JSON.parse(r.w.sessionStorage.getItem('ww-plus-order')).email === 'a@b.co' && JSON.parse(r.w.sessionStorage.getItem('ww-plus-order')).txn === 'txn_9');
  r = await run({ env: 'sandbox', token: 'test_abc', price: 'pri_123' });
  ok('sandbox switches Paddle to sandbox', r.log.env === 'sandbox');
  console.log(fails ? fails + ' FAILED' : 'All checks passed'); process.exit(fails ? 1 : 0);
})();
