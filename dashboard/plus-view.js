// WebWell Plus page in the dashboard: status, key entry, and what Plus adds.
'use strict';

async function renderPlus() {
  const el = document.getElementById('view-plus');
  const info = await plusInfo();
  const p = info.payload;
  const esc2 = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const planName = !p ? '' : p.plan === 'family' ? 'Friends and family' : 'Lifetime';
  const ends = p && p.exp ? ' Ends ' + new Date(p.exp).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + '.' : '';

  const status = info.active
    ? '<div class="pl-status on"><span class="plus-badge">Plus</span><div><strong>WebWell Plus is on</strong>' +
      // The key carries the buyer's name, so showing it here makes a key feel personal and discourages posting it publicly.
      '<p class="pl-lic">Licensed to <b>' + esc2(p.name || 'you') + '</b> · ' + esc2(planName) + (p.id ? ' · key ' + esc2(p.id) : '') + '.' + ends + '</p>' +
      '<p>Thank you for supporting WebWell. This key is for your own browsers and devices.</p></div><button class="btn small ghost" id="plRemove" type="button">Remove key</button></div>'
    : '<div class="pl-status"><span class="plus-badge">Plus</span><div><strong>Get more from WebWell</strong><p>Everything you use today stays free. Plus adds extras for focus, reports and your new tab for ' +
      esc2(PLUS_PRICE_TEXT) + '. No account, no subscription, and your data still never leaves your device.</p></div><button class="plus-btn" id="plBuy" type="button">See WebWell Plus</button></div>';

  const keyBox = info.active ? '' :
    '<div class="card pl-key"><h3>Have a Plus key?</h3><p class="pl-hint">Paste it here. It is checked inside this extension, and nothing is sent anywhere.</p>' +
    '<div class="pl-row"><input class="txt-in" id="plKey" type="text" placeholder="WWP1.…" autocomplete="off" spellcheck="false"><button class="plus-btn" id="plGo" type="button">Unlock Plus</button></div>' +
    '<p class="pl-msg" id="plMsg" role="status" aria-live="polite"></p></div>';

  const list = '<div class="card"><h3>What Plus adds</h3><ul class="pl-list">' + PLUS_FEATURES.map(f =>
    '<li><span class="pl-check' + (info.active ? ' on' : '') + '" aria-hidden="true">' + (info.active ? '✓' : '+') + '</span><div><strong>' + esc2(f.name) + '</strong><p>' + esc2(f.blurb) + '</p></div></li>').join('') + '</ul></div>';

  el.innerHTML = '<div class="pl-wrap"><h2 class="pl-title">WebWell Plus</h2>' + status + keyBox + list + '</div>';

  const buy = document.getElementById('plBuy'); if (buy) buy.addEventListener('click', plusOpenUpgrade);
  const rm = document.getElementById('plRemove');
  if (rm) rm.addEventListener('click', async () => { if (!confirm('Remove your Plus key from this browser? You can add it again any time.')) return; await plusRemove(); renderPlus(); if (typeof renderedViews !== 'undefined') renderedViews.clear(); });
  const go = document.getElementById('plGo'), inp = document.getElementById('plKey'), msg = document.getElementById('plMsg');
  if (go) {
    const submit = async () => {
      const r = await plusActivate(inp.value);
      if (r.ok) { if (typeof toast === 'function') toast('WebWell Plus is on. Thank you!'); if (typeof renderedViews !== 'undefined') renderedViews.clear(); renderPlus(); }
      else { msg.textContent = r.error; msg.classList.add('bad'); }
    };
    go.addEventListener('click', submit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }
}

// The "Go Plus" button in the rail says "Plus" (and goes quiet) once a key is saved.
async function updatePlusRail() {
  const b = document.querySelector('.go-plus');
  if (!b) return;
  const on = await plusActive();
  b.classList.toggle('is-plus', on);
  b.querySelector('.gp-label').textContent = on ? 'Plus' : 'Go Plus';
  b.title = on ? 'WebWell Plus' : 'See what WebWell Plus adds';
  b.setAttribute('aria-label', b.title);
}
updatePlusRail();
try { chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.plusKey) updatePlusRail(); }); } catch (e) {}
