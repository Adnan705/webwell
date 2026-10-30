// WebWell Plus checkout (Paddle). One product, one price, paid once. Nothing here is a secret:
// the client-side token below is meant to be public. Fill the three values and the buttons on /plus switch on.
// Until all three are set (and match each other) the page stays in its safe "Opening soon" state and Paddle is not even loaded.
(function () {
  'use strict';
  var PADDLE_ENV = 'production';        // 'production' for the real shop, 'sandbox' for testing. No default on purpose.
  var CLIENT_TOKEN = 'live_8ace4a3d9f79a3d9da5c7c1eeec';      // Paddle > Developer tools > Authentication > Client-side tokens (live_... or test_...)
  var PRICE_ID = 'pri_01m654kqje98rn4p3qzf59e9f4';          // the WebWell Plus one-time price, pri_...
  var SUCCESS_URL = location.origin + '/welcome';

  var buttons = [].slice.call(document.querySelectorAll('[data-plus-buy]'));
  if (!buttons.length) return;
  if (!PADDLE_ENV && !CLIENT_TOKEN && !PRICE_ID) return;                       // not set up yet: stay as is
  var bad = !/^(production|sandbox)$/.test(PADDLE_ENV) ||
    (PADDLE_ENV === 'production' && !/^live_/.test(CLIENT_TOKEN)) ||
    (PADDLE_ENV === 'sandbox' && !/^test_/.test(CLIENT_TOKEN)) || !/^pri_/.test(PRICE_ID);
  if (bad) { console.error('WebWell Plus checkout is misconfigured: check PADDLE_ENV, CLIENT_TOKEN and PRICE_ID in /plus-checkout.js. Checkout stays off.'); return; }   // fail loudly, never guess an environment

  var s = document.createElement('script');
  s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'; s.async = true;
  s.onerror = function () { console.error('Could not load Paddle.js'); };
  s.onload = function () {
    try {
      if (PADDLE_ENV === 'sandbox') Paddle.Environment.set('sandbox');
      Paddle.Initialize({ token: CLIENT_TOKEN, eventCallback: function (ev) {
        // Remember where the key is being sent so the thank-you page can say so (a mistyped email is easy to spot and fix).
        if (ev && ev.name === 'checkout.completed' && ev.data) {
          try { sessionStorage.setItem('ww-plus-order', JSON.stringify({ email: ev.data.customer && ev.data.customer.email || '', txn: ev.data.transaction_id || ev.data.id || '' })); } catch (e) {}
        }
      } });
    } catch (e) { console.error('Paddle failed to start', e); return; }

    // Show the price exactly as Paddle returns it for the visitor's country (Paddle finds the country from the IP). No maths here.
    var items = [{ priceId: PRICE_ID, quantity: 1 }];
    Paddle.PricePreview({ items: items }).then(function (r) {
      var t = r && r.data && r.data.details && r.data.details.lineItems && r.data.details.lineItems[0] && r.data.details.lineItems[0].formattedTotals;
      if (t && t.total) document.querySelectorAll('[data-plus-price]').forEach(function (n) { n.textContent = t.total; });
    }).catch(function () { /* keep the printed price */ });

    buttons.forEach(function (a) {
      a.removeAttribute('aria-disabled'); a.setAttribute('href', '#pricing'); a.setAttribute('role', 'button');
      a.textContent = 'Get WebWell Plus';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        Paddle.Checkout.open({ items: items, settings: { displayMode: 'overlay', variant: 'one-page', successUrl: SUCCESS_URL, allowLogout: false } });
      });
    });
    document.querySelectorAll('.hint, .price .fine').forEach(function (n) { n.hidden = true; });
  };
  document.head.appendChild(s);
})();
