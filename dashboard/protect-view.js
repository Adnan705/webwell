// WebWell dashboard: the Protect view (adult filter, short videos, mindful
// pause, block lists, Locked In defaults, parent PIN). Loaded after
// dashboard.js and uses its helpers (storeGet, storeSet, toast, setRow, esc).
// Pages only write `protect` / `lockPrefs`; background.js turns them into rules.
'use strict';

async function getProtect() { return protectState((await storeGet(['protect'])).protect); }
async function saveProtect(p) { await storeSet({ protect: p }); }

async function hasHostAccess() {
  try { return await chrome.permissions.contains(ALL_URLS); } catch (e) { return false; }
}
// Call straight from a click/change handler: Chrome only prompts on a user gesture.
async function askHostAccess() {
  try { return await chrome.permissions.request(ALL_URLS); } catch (e) { return false; }
}

/* ---------------- PIN ---------------- */
function pinDialog(title, sub, confirmToo) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML =
      '<form class="modal-card pin-card" role="dialog" aria-label="' + esc(title) + '">' +
      '<div class="modal-head"><h3>' + esc(title) + '</h3><button type="button" class="icon-btn sm" data-x title="Cancel">✕</button></div>' +
      '<div class="modal-sub">' + esc(sub) + '</div>' +
      '<input class="pin-in" id="pinA" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="4–8 digits">' +
      (confirmToo ? '<input class="pin-in" id="pinB" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="Type it again">' : '') +
      '<div class="pin-err" id="pinErr"></div>' +
      '<div class="btn-row"><button class="btn" type="submit">Continue</button><button class="btn ghost" type="button" data-x>Cancel</button></div>' +
      '</form>';
    const done = v => { ov.remove(); resolve(v); };
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-x]')) done(null); });
    ov.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const a = ov.querySelector('#pinA').value.trim();
      const b = confirmToo ? ov.querySelector('#pinB').value.trim() : a;
      const err = ov.querySelector('#pinErr');
      if (!/^\d{4,8}$/.test(a)) { err.textContent = 'Use 4 to 8 digits.'; return; }
      if (a !== b) { err.textContent = 'The two PINs don’t match.'; return; }
      done(a);
    });
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') done(null); });
    document.body.appendChild(ov);
    setTimeout(() => ov.querySelector('#pinA').focus(), 30);
  });
}

// Resolves true when there is no PIN, or the right PIN was entered.
async function requirePin(action) {
  const p = await getProtect();
  if (!p.pinHash) return true;
  const pin = await pinDialog('Enter your PIN', 'A PIN is needed to ' + action + '.', false);
  if (pin == null) return false;
  if (await hashPin(pin, p.pinSalt) === p.pinHash) return true;
  toast('Wrong PIN.');
  return false;
}

/* ---------------- view ---------------- */
function pToggle(id, on) {
  return '<label class="toggle"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span class="tk"></span></label>';
}
function chipList(id, items) {
  return '<div class="chip-list" id="' + id + '">' + (items.length
    ? items.map(d => '<span class="site-chip">' + iconImg(d, 16) + esc(d) +
        '<button data-d="' + esc(d) + '" title="Remove ' + esc(d) + '" aria-label="Remove ' + esc(d) + '">✕</button></span>').join('')
    : '<span class="sub-mut">Nothing here yet.</span>') + '</div>';
}
function addRow(id, placeholder) {
  return '<form class="add-row" id="' + id + 'Form"><input class="txt-in" id="' + id + 'In" placeholder="' + placeholder +
    '" autocomplete="off" spellcheck="false"><button class="btn small" type="submit">Add</button></form>';
}
function seg(id, values, cur, fmt) {
  return '<div class="seg" id="' + id + '">' + values.map(v =>
    '<button data-v="' + v + '" class="' + (v === cur ? 'active' : '') + '">' + fmt(v) + '</button>').join('') + '</div>';
}

async function renderProtect() {
  const el = document.getElementById('view-protect');
  const r = await storeGet(['protect', 'lockPrefs', 'categories', 'protectStats', 'lockin']);
  const p = protectState(r.protect);
  const prefs = Object.assign({}, LOCKIN_DEFAULTS, r.lockPrefs || {});
  const granted = await hasHostAccess();
  const needs = protectNeedsHostAccess(p, r.lockin);
  const today = (r.protectStats || {})[dayKey(Date.now())] || {};
  const blocksToday = Object.values(today).reduce((a, b) => a + b, 0);
  const distractingCount = distractingDomains(r.categories || {}).length;
  const onCount = [p.adult, p.shortsOn, p.pause, p.blocklist.length > 0].filter(Boolean).length;

  el.innerHTML =
    '<div class="protect-hero card">' +
      '<div class="ph-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9.5 12l2 2 3.5-4"/></svg></div>' +
      '<div class="ph-text"><h2>Protect</h2><p class="sub-mut">Block what you don’t want in this browser. Everything runs on your device.</p></div>' +
      '<div class="ph-stats"><div><b>' + onCount + '</b><span>protections on</span></div><div><b>' + blocksToday + '</b><span>blocked today</span></div></div>' +
    '</div>' +
    (needs && !granted
      ? '<div class="perm-banner"><span>WebWell needs permission to act on websites before it can block anything.</span><button class="btn small" id="permBtn">Allow blocking</button></div>'
      : '') +
    '<div class="pgrid">' +

    // adult
    '<div class="card pcard">' +
      '<div class="pc-head"><div><h3>Adult content filter</h3><p class="sub-mut">Blocks 47,000+ adult sites and forces SafeSearch on Google, Bing and DuckDuckGo, plus Restricted Mode on YouTube.</p></div>' + pToggle('pAdult', p.adult) + '</div>' +
      '<div class="pc-foot sub-mut">Good for shared and family computers. Add a PIN below so it can’t be switched off.</div>' +
    '</div>' +

    // short videos
    '<div class="card pcard">' +
      '<div class="pc-head"><div><h3>Short videos</h3><p class="sub-mut">Blocks endless short-video feeds and hides their buttons. Regular videos still work.</p></div>' + pToggle('pShorts', p.shortsOn) + '</div>' +
      '<div class="pchecks' + (p.shortsOn ? '' : ' off') + '">' + SHORTS_PLATFORMS.map(s =>
        '<label class="pcheck"><input type="checkbox" data-k="' + s.key + '"' + (p.shorts[s.key] ? ' checked' : '') + (p.shortsOn ? '' : ' disabled') + '><span>' + s.label + '</span></label>').join('') +
      '</div>' +
    '</div>' +

    // mindful pause
    '<div class="card pcard">' +
      '<div class="pc-head"><div><h3>Mindful pause</h3><p class="sub-mut">Before a distracting site opens, take a short breath and choose whether you still want it. After you continue, it stays open for 10 minutes.</p></div>' + pToggle('pPause', p.pause) + '</div>' +
      '<div class="pc-row"><span class="sub-mut">Pause length</span>' + seg('pPauseSecs', [5, 10, 15], p.pauseSecs, v => v + ' s') + '</div>' +
      '<div class="pc-foot sub-mut">Applies to the ' + distractingCount + ' sites marked Distracting. Change categories in Websites.</div>' +
    '</div>' +

    // Locked In
    '<div class="card pcard">' +
      '<div class="pc-head"><div><h3>Focus sessions</h3><p class="sub-mut">Your focus timer on the new tab. While it runs, every Distracting site is blocked, plus any you add here.</p></div>' +
      '<button class="btn small" id="pLockNow">Start focusing</button></div>' +
      '<div class="pc-row"><span class="sub-mut">Default length</span>' + seg('pLockMins', [25, 50, 90], prefs.mins, v => v + ' min') + '</div>' +
      '<div class="pc-row"><span class="sub-mut">Break after</span>' + seg('pLockBreak', [0, 5, 10], prefs.breakMins, v => v ? v + ' min' : 'None') + '</div>' +
      addRow('pFocus', 'Also block during focus, e.g. news.ycombinator.com') +
      chipList('pFocusList', p.focusExtra) +
    '</div>' +

    // always blocked
    '<div class="card pcard">' +
      '<div class="pc-head"><div><h3>Always blocked</h3><p class="sub-mut">Sites that never open in this browser, focus session or not.</p></div></div>' +
      addRow('pBlock', 'e.g. instagram.com') +
      chipList('pBlockList', p.blocklist) +
    '</div>' +

    // PIN
    '<div class="card pcard">' +
      '<div class="pc-head"><div><h3>Parent PIN</h3><p class="sub-mut">' + (p.pinHash
        ? 'On. Turning protections off, removing blocked sites or resetting WebWell asks for the PIN.'
        : 'Ask for a PIN before anyone turns protections off or resets WebWell.') + '</p></div>' +
      '<span class="pill' + (p.pinHash ? '' : ' off') + '">' + (p.pinHash ? 'PIN set' : 'No PIN') + '</span></div>' +
      '<div class="btn-row">' + (p.pinHash
        ? '<button class="btn small" id="pPinChange">Change PIN</button><button class="btn small ghost" id="pPinRemove">Remove PIN</button>'
        : '<button class="btn small" id="pPinSet">Set a PIN</button>') + '</div>' +
      '<div class="pc-foot sub-mut">A PIN can’t stop someone removing the extension from the browser’s settings. For a child’s computer, also use a supervised account.</div>' +
    '</div>' +

    '</div>';

  wireProtect(p, prefs);
}

function wireProtect(p, prefs) {
  const $p = id => document.getElementById(id);
  const rerender = () => renderProtect();

  const permBtn = $p('permBtn');
  if (permBtn) permBtn.addEventListener('click', async () => {
    if (await askHostAccess()) { toast('Blocking allowed.'); chrome.runtime.sendMessage({ type: 'ww-protect-sync' }).catch(() => {}); }
    rerender();
  });

  // Turning a protection on asks for site access; turning it off may need the PIN.
  const guardedToggle = (id, key, label) => $p(id).addEventListener('change', async e => {
    const on = e.target.checked;
    if (on) {
      if (!(await askHostAccess())) { e.target.checked = false; toast('WebWell needs permission to block sites.'); return; }
    } else if (!(await requirePin('turn off ' + label))) { e.target.checked = true; return; }
    const cur = await getProtect();
    cur[key] = on;
    await saveProtect(cur);
    toast(label.charAt(0).toUpperCase() + label.slice(1) + (on ? ' on.' : ' off.'));
    rerender();
  });
  guardedToggle('pAdult', 'adult', 'the adult content filter');
  guardedToggle('pShorts', 'shortsOn', 'the short-video blocker');
  guardedToggle('pPause', 'pause', 'mindful pause');

  document.querySelectorAll('.pchecks input').forEach(cb => cb.addEventListener('change', async e => {
    if (!e.target.checked && !(await requirePin('allow ' + e.target.nextElementSibling.textContent))) { e.target.checked = true; return; }
    const cur = await getProtect();
    cur.shorts[e.target.dataset.k] = e.target.checked;
    await saveProtect(cur);
  }));

  $p('pPauseSecs').querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
    const cur = await getProtect(); cur.pauseSecs = +b.dataset.v; await saveProtect(cur); rerender();
  }));

  const savePrefs = async patch => {
    const cur = Object.assign({}, LOCKIN_DEFAULTS, (await storeGet(['lockPrefs'])).lockPrefs || {}, patch);
    await storeSet({ lockPrefs: cur }); rerender();
  };
  $p('pLockMins').querySelectorAll('button').forEach(b => b.addEventListener('click', () => savePrefs({ mins: +b.dataset.v })));
  $p('pLockBreak').querySelectorAll('button').forEach(b => b.addEventListener('click', () => savePrefs({ breakMins: +b.dataset.v })));
  $p('pLockNow').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html#lockin') }));

  const listEditor = (prefix, key, needsAccess, pinOnRemove) => {
    $p(prefix + 'Form').addEventListener('submit', async e => {
      e.preventDefault();
      const host = normalizeHost($p(prefix + 'In').value);
      if (!host) { toast('That doesn’t look like a website.'); return; }
      if (needsAccess && !(await askHostAccess())) { toast('WebWell needs permission to block sites.'); return; }
      const cur = await getProtect();
      if (cur[key].includes(host)) { toast(host + ' is already on the list.'); return; }
      cur[key].push(host);
      await saveProtect(cur);
      toast(host + ' added.');
      rerender();
    });
    $p(prefix + 'List').querySelectorAll('button[data-d]').forEach(b => b.addEventListener('click', async () => {
      if (pinOnRemove && !(await requirePin('unblock ' + b.dataset.d))) return;
      const cur = await getProtect();
      cur[key] = cur[key].filter(d => d !== b.dataset.d);
      await saveProtect(cur);
      rerender();
    }));
  };
  listEditor('pBlock', 'blocklist', true, true);
  listEditor('pFocus', 'focusExtra', false, false);

  const setPin = async () => {
    const pin = await pinDialog('Set a PIN', 'Pick 4 to 8 digits you’ll remember.', true);
    if (pin == null) return;
    const cur = await getProtect();
    cur.pinSalt = newSalt();
    cur.pinHash = await hashPin(pin, cur.pinSalt);
    await saveProtect(cur);
    toast('PIN set.');
    rerender();
  };
  if ($p('pPinSet')) $p('pPinSet').addEventListener('click', setPin);
  if ($p('pPinChange')) $p('pPinChange').addEventListener('click', async () => { if (await requirePin('change the PIN')) setPin(); });
  if ($p('pPinRemove')) $p('pPinRemove').addEventListener('click', async () => {
    if (!(await requirePin('remove the PIN'))) return;
    const cur = await getProtect();
    cur.pinHash = ''; cur.pinSalt = '';
    await saveProtect(cur);
    toast('PIN removed.');
    rerender();
  });
}
