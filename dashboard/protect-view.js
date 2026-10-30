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
  const r = await storeGet(['protect', 'lockPrefs', 'categories', 'protectStats', 'lockin',
    'plusSchedules', 'plusPresets', 'plusEarn', 'plusIntents', 'plusFocusPrefs']);
  const p = protectState(r.protect);
  const plus = await plusActive();
  const strictOn = plus && strictLocked(r.lockin, Date.now());
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

    '</div>' +
    plusProtectHtml(plus, r, strictOn, granted);

  wireProtect(p, prefs);
  if (plus) wirePlusProtect(r); else plusWireLocks(el);
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
      if (await strictBlocksEdits()) return;
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

/* ===========================================================================
   WebWell Plus: block schedules, strict focus, earn your break, intent check,
   focus presets. Logic lives in lib/plus-focus.js; this only edits storage.
   Free users see the same cards as locked previews.
   =========================================================================== */

// While a strict session runs (Plus), the block lists stay as they were. Resolves true when it said no.
async function strictBlocksEdits() {
  const { lockin } = await storeGet(['lockin']);
  if (!strictLocked(lockin, Date.now()) || !(await plusActive())) return false;
  toast('Strict focus is on. Your lists unlock at ' + new Date(lockin.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.');
  return true;
}

const pfClock = ts => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
function pfWhen(ts) {
  const d = new Date(ts);
  return dayKey(ts) === dayKey(Date.now()) ? pfClock(ts) : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + pfClock(ts);
}

function plusProtectHtml(plus, r, strictOn, granted) {
  const head = '<div class="pf-head"><span class="plus-badge">Plus</span><h2>Focus extras</h2>' +
    '<p class="sub-mut">Timetables, strict sessions, earned breaks and presets.</p></div>';
  if (!plus) {
    return '<section class="pf-sec">' + head + '<div class="pgrid pf-locks">' +
      ['schedules', 'strict', 'earn', 'intent', 'presets'].map(id => plusLockHtml(id)).join('') + '</div></section>';
  }
  const now = new Date();
  const schedules = schedulesList(r.plusSchedules);
  const fp = focusPrefs(r.plusFocusPrefs);
  const bank = earnBank(r.plusEarn, dayKey(Date.now()));
  const presets = presetsList(r.plusPresets);
  const intents = (Array.isArray(r.plusIntents) ? r.plusIntents : []).slice(-5).reverse();

  const schedRows = schedules.length ? schedules.map(s => {
    const open = scheduleActiveAt(s, now);
    const what = s.useList ? 'Your focus block list' : s.sites.length + ' site' + (s.sites.length === 1 ? '' : 's');
    return '<div class="pf-row' + (s.on ? '' : ' off') + '">' +
      '<label class="toggle" title="' + (s.on ? 'Switch off' : 'Switch on') + '"><input type="checkbox" data-sched-on="' + esc(s.id) + '"' + (s.on ? ' checked' : '') +
        ' aria-label="' + esc(s.name) + ' on or off"><span class="tk"></span></label>' +
      '<div class="pf-main"><b>' + esc(s.name) + '</b>' + (open ? '<span class="pf-now">On now</span>' : '') + (s.strict ? '<span class="pf-tag">Strict</span>' : '') +
        '<span class="sub-mut">' + esc(scheduleDaysLabel(s.days)) + ' · ' + esc(pfTimeLabel(s.start)) + ' to ' + esc(pfTimeLabel(s.end)) + ' · ' + esc(what) + '</span></div>' +
      '<button class="btn small ghost" data-sched-edit="' + esc(s.id) + '">Edit</button>' +
      '<button class="pf-x" data-sched-del="' + esc(s.id) + '" title="Delete ' + esc(s.name) + '" aria-label="Delete ' + esc(s.name) + '">✕</button></div>';
  }).join('') : '<p class="sub-mut pf-empty">No schedules yet. Try weekdays 9 to 5, or every night from 10 pm.</p>';

  const presetRows = presets.length ? presets.map(pr =>
    '<div class="pf-row"><div class="pf-main"><b>' + esc(pr.name) + '</b><span class="sub-mut">' + esc(presetSummary(pr)) + '</span></div>' +
    '<button class="btn small ghost" data-preset-edit="' + esc(pr.id) + '">Edit</button>' +
    '<button class="pf-x" data-preset-del="' + esc(pr.id) + '" title="Delete ' + esc(pr.name) + '" aria-label="Delete ' + esc(pr.name) + '">✕</button></div>').join('')
    : '<p class="sub-mut pf-empty">No presets. Add one, or bring back the three starters.</p>';

  const intentRows = intents.length ? intents.map(i =>
    '<div class="pf-intent"><div><b>' + esc(i.domain || '') + '</b><span>' + esc(i.text || '') + '</span></div><small>' + esc(pfWhen(i.ts || 0)) +
      (i.allowedMins ? ' · ' + (i.allowedMins | 0) + ' min' : '') + '</small></div>').join('')
    : '<p class="sub-mut pf-empty">Your answers will show up here.</p>';

  return '<section class="pf-sec">' + head + '<div class="pgrid">' +
    // schedules
    '<div class="card pcard pf-wide">' +
      '<div class="pc-head"><div><h3>Block schedules</h3><p class="sub-mut">Block sites on a timetable. Blocking switches on and off by itself at the times you set.</p></div>' +
        '<button class="btn small" id="pSchedAdd">Add a schedule</button></div>' +
      (schedules.length && !granted ? '<div class="perm-banner pf-perm"><span>Schedules need permission to act on websites.</span><button class="btn small" id="pSchedPerm">Allow blocking</button></div>' : '') +
      '<div class="pf-list">' + schedRows + '</div>' +
    '</div>' +
    // strict
    '<div class="card pcard">' +
      '<div class="pc-head"><div><h3>Strict focus mode</h3><p class="sub-mut">Switch it on when you start a focus session. The session can’t be ended early, and your block lists stay locked until the timer ends.</p></div>' +
        '<span class="pill' + (strictOn ? '' : ' off pf-idle') + '">' + (strictOn ? 'Running' : 'Not running') + '</span></div>' +
      (strictOn ? '<div class="pf-strict-now">A strict session is running until ' + esc(pfClock(r.lockin.endsAt)) + '. Your block lists are locked until then.</div>'
        : '<div><button class="btn small ghost" id="pStrictStart">Start a focus session</button></div>') +
      '<div class="pc-foot sub-mut">In a real emergency, the focus screen has an Emergency exit. You type a short phrase, and the exit is noted in your history.</div>' +
    '</div>' +
    // earn
    '<div class="card pcard">' +
      '<div class="pc-head"><div><h3>Earn your break</h3><p class="sub-mut">Each focus session you finish banks break minutes. Spend them on a blocked site from its block screen.</p></div>' +
        '<span class="pill">' + bank + ' min banked</span></div>' +
      '<div class="pc-row"><span class="sub-mut">Earn 1 minute for every</span>' + seg('pEarnPer', [3, 5, 10], fp.earnPer, v => v + ' min') + '</div>' +
      '<div class="pc-row"><span class="sub-mut">Most you can bank a day</span>' + seg('pEarnCap', [15, 30, 60], fp.earnCap, v => v + ' min') + '</div>' +
      '<div class="pc-foot sub-mut">The bank starts fresh each day. Earned minutes can’t open sites during strict focus or a strict schedule.</div>' +
    '</div>' +
    // intent
    '<div class="card pcard">' +
      '<div class="pc-head"><div><h3>Intent check</h3><p class="sub-mut">Before a paused site opens, or you spend earned minutes, say in a few words why you are going there.</p></div>' + pToggle('pIntent', fp.intent) + '</div>' +
      '<div class="pf-intents">' + intentRows + '</div>' +
      '<div class="pc-foot sub-mut pf-foot-row"><span>Answers stay on this device. WebWell keeps your last 500.</span>' +
        (intents.length ? '<button class="pf-link" id="pIntentClear">Clear answers</button>' : '') + '</div>' +
    '</div>' +
    // presets
    '<div class="card pcard">' +
      '<div class="pc-head"><div><h3>Focus presets</h3><p class="sub-mut">One tap starts a session from the popup or the new tab.</p></div>' +
        '<button class="btn small" id="pPresetAdd"' + (presets.length >= 8 ? ' disabled title="You can keep up to 8 presets"' : '') + '>Add a preset</button></div>' +
      '<div class="pf-list">' + presetRows + '</div>' +
      '<div class="pc-foot sub-mut pf-foot-row"><span>Strict presets can’t be ended early once they start.</span><button class="pf-link" id="pPresetReset">Bring back the starters</button></div>' +
    '</div>' +
  '</div></section>';
}

function wirePlusProtect(r) {
  const $p = id => document.getElementById(id);
  const rerender = () => renderProtect();
  const getList = async (key) => (await storeGet([key]))[key];
  const savePrefs = async patch => {
    const cur = Object.assign(focusPrefs((await storeGet(['plusFocusPrefs'])).plusFocusPrefs), patch);
    await storeSet({ plusFocusPrefs: cur });
  };

  /* schedules */
  // A strict schedule that is open right now can't be loosened until it closes.
  const strictOpen = s => s && s.strict && s.on && scheduleActiveAt(s, new Date());
  const lockedMsg = s => toast('“' + s.name + '” is a strict schedule and it is on now. You can change it after ' + pfClock(scheduleUntil(s, new Date())) + '.');
  const saveSchedules = async list => { await storeSet({ plusSchedules: list }); };
  $p('pSchedAdd').addEventListener('click', () => scheduleDialog(null));
  if ($p('pSchedPerm')) $p('pSchedPerm').addEventListener('click', async () => {
    if (await askHostAccess()) { toast('Blocking allowed.'); chrome.runtime.sendMessage({ type: 'ww-protect-sync' }).catch(() => {}); }
    rerender();
  });
  document.querySelectorAll('[data-sched-on]').forEach(cb => cb.addEventListener('change', async e => {
    const list = schedulesList(await getList('plusSchedules'));
    const s = list.find(x => x.id === cb.dataset.schedOn);
    if (!s) return rerender();
    if (!e.target.checked && strictOpen(s)) { e.target.checked = true; lockedMsg(s); return; }
    if (e.target.checked && !(await askHostAccess())) { e.target.checked = false; toast('WebWell needs permission to block sites.'); return; }
    s.on = e.target.checked;
    await saveSchedules(list);
    toast(s.name + (s.on ? ' on.' : ' off.'));
    rerender();
  }));
  document.querySelectorAll('[data-sched-edit]').forEach(b => b.addEventListener('click', async () => {
    const s = schedulesList(await getList('plusSchedules')).find(x => x.id === b.dataset.schedEdit);
    if (strictOpen(s)) { lockedMsg(s); return; }
    if (s) scheduleDialog(s);
  }));
  document.querySelectorAll('[data-sched-del]').forEach(b => b.addEventListener('click', async () => {
    const list = schedulesList(await getList('plusSchedules'));
    const s = list.find(x => x.id === b.dataset.schedDel);
    if (!s) return;
    if (strictOpen(s)) { lockedMsg(s); return; }
    if (!confirm('Delete the “' + s.name + '” schedule?')) return;
    await saveSchedules(list.filter(x => x.id !== s.id));
    toast('Schedule deleted.');
    rerender();
  }));

  if ($p('pStrictStart')) $p('pStrictStart').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html#lockin') }));

  /* earn + intent */
  $p('pEarnPer').querySelectorAll('button').forEach(b => b.addEventListener('click', async () => { await savePrefs({ earnPer: +b.dataset.v }); rerender(); }));
  $p('pEarnCap').querySelectorAll('button').forEach(b => b.addEventListener('click', async () => { await savePrefs({ earnCap: +b.dataset.v }); rerender(); }));
  $p('pIntent').addEventListener('change', async e => { await savePrefs({ intent: e.target.checked }); toast(e.target.checked ? 'Intent check on.' : 'Intent check off.'); });
  if ($p('pIntentClear')) $p('pIntentClear').addEventListener('click', async () => {
    if (!confirm('Clear all your saved answers?')) return;
    await storeSet({ plusIntents: [] }); toast('Answers cleared.'); rerender();
  });

  /* presets */
  const savePresets = async list => { await storeSet({ plusPresets: list }); };
  $p('pPresetAdd').addEventListener('click', () => presetDialog(null));
  $p('pPresetReset').addEventListener('click', async () => {
    if (!confirm('Bring back Study, Deep work and Wind down? Your own presets stay.')) return;
    const list = presetsList(await getList('plusPresets'));
    for (const d of PRESET_DEFAULTS) if (!list.some(x => x.id === d.id)) list.push(Object.assign({}, d));
    await savePresets(list.slice(0, 8)); toast('Starters are back.'); rerender();
  });
  document.querySelectorAll('[data-preset-edit]').forEach(b => b.addEventListener('click', async () => {
    const pr = presetsList(await getList('plusPresets')).find(x => x.id === b.dataset.presetEdit);
    if (pr) presetDialog(pr);
  }));
  document.querySelectorAll('[data-preset-del]').forEach(b => b.addEventListener('click', async () => {
    const list = presetsList(await getList('plusPresets'));
    const pr = list.find(x => x.id === b.dataset.presetDel);
    if (!pr || !confirm('Delete the “' + pr.name + '” preset?')) return;
    await savePresets(list.filter(x => x.id !== pr.id)); toast('Preset deleted.'); rerender();
  }));
}

// A small form in the same modal style as the PIN dialog. `fields` is inner HTML; `onSave(form)`
// returns an error string to show, or nothing to close.
function pfDialog(title, sub, fields, onSave) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML =
    '<form class="modal-card pf-dialog" role="dialog" aria-modal="true" aria-label="' + esc(title) + '" novalidate>' +
    '<div class="modal-head"><h3>' + esc(title) + '</h3><button type="button" class="icon-btn sm" data-x aria-label="Cancel">✕</button></div>' +
    '<div class="modal-sub">' + esc(sub) + '</div>' + fields +
    '<div class="pin-err" id="pfErr" role="alert"></div>' +
    '<div class="btn-row"><button class="btn" type="submit">Save</button><button class="btn ghost" type="button" data-x>Cancel</button></div></form>';
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  const form = ov.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = await onSave(form);
    if (err) { ov.querySelector('#pfErr').textContent = err; return; }
    close();
    renderProtect();
  });
  document.body.appendChild(ov);
  setTimeout(() => { const f = form.querySelector('input'); if (f) f.focus(); }, 30);
  return form;
}

function scheduleDialog(s) {
  const v = s || { name: '', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00', useList: true, sites: [], strict: false, on: true };
  const dayBtns = [1, 2, 3, 4, 5, 6, 0].map(d =>
    '<button type="button" class="pf-day' + (v.days.includes(d) ? ' on' : '') + '" data-day="' + d + '" aria-pressed="' + v.days.includes(d) + '">' + PF_DAY_SHORT[d] + '</button>').join('');
  const fields =
    '<label class="pf-l" for="schName">Name</label><input class="txt-in pf-in" id="schName" maxlength="40" placeholder="e.g. Work hours" value="' + esc(v.name) + '">' +
    '<span class="pf-l" id="schDaysL">Days</span><div class="pf-days" role="group" aria-labelledby="schDaysL">' + dayBtns + '</div>' +
    '<div class="pf-times"><div><label class="pf-l" for="schStart">From</label><input class="txt-in pf-in" type="time" id="schStart" value="' + esc(v.start) + '"></div>' +
      '<div><label class="pf-l" for="schEnd">To</label><input class="txt-in pf-in" type="time" id="schEnd" value="' + esc(v.end) + '"></div></div>' +
    '<p class="pf-hint" id="schHint"></p>' +
    '<span class="pf-l">Sites</span>' +
    '<label class="pf-radio"><input type="radio" name="schWhat" id="schUseList" value="list"' + (v.useList ? ' checked' : '') + '><span>My focus block list<small>Your Distracting sites, plus any you added for focus sessions.</small></span></label>' +
    '<label class="pf-radio"><input type="radio" name="schWhat" id="schUseSites" value="sites"' + (v.useList ? '' : ' checked') + '><span>Only these sites</span></label>' +
    '<textarea class="txt-in pf-in pf-sites" id="schSites" rows="3" placeholder="youtube.com, reddit.com" aria-label="Sites to block, separated by commas or new lines">' + esc(v.sites.join(', ')) + '</textarea>' +
    '<label class="pf-check"><input type="checkbox" id="schStrict"' + (v.strict ? ' checked' : '') + '><span>Strict: no early unlocks<small>While it runs, earned minutes can’t open these sites and the schedule can’t be changed.</small></span></label>';
  const form = pfDialog(s ? 'Edit schedule' : 'New schedule', 'Sites are blocked during this window, on the days you pick.', fields, async f => {
    const days = [...f.querySelectorAll('.pf-day.on')].map(b => +b.dataset.day);
    const res = scheduleClean({
      id: s ? s.id : '', name: f.querySelector('#schName').value, days,
      start: f.querySelector('#schStart').value, end: f.querySelector('#schEnd').value,
      useList: f.querySelector('#schUseList').checked,
      sites: f.querySelector('#schSites').value.split(/[\s,]+/).filter(Boolean),
      strict: f.querySelector('#schStrict').checked, on: s ? s.on : true
    });
    if (!res.ok) return res.error;
    // Must be the first await after the click: Chrome only shows the prompt on a user gesture.
    if (res.value.on && !(await askHostAccess())) return 'WebWell needs permission to block sites. Allow it, then save again.';
    const list = schedulesList((await storeGet(['plusSchedules'])).plusSchedules);
    const i = list.findIndex(x => x.id === res.value.id);
    if (i >= 0) list[i] = res.value; else if (list.length >= 12) return 'You can keep up to 12 schedules.'; else list.push(res.value);
    await storeSet({ plusSchedules: list });
    toast(s ? 'Schedule saved.' : 'Schedule added.');
  });
  const syncHint = () => {
    const a = pfTimeToMins(form.querySelector('#schStart').value), b = pfTimeToMins(form.querySelector('#schEnd').value);
    form.querySelector('#schHint').textContent = a != null && b != null && a > b ? 'This runs overnight and ends the next morning.' : '';
    form.querySelector('#schSites').classList.toggle('hidden', form.querySelector('#schUseList').checked);
  };
  form.querySelectorAll('.pf-day').forEach(b => b.addEventListener('click', () => {
    b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on'));
  }));
  form.querySelectorAll('#schStart, #schEnd, #schUseList, #schUseSites').forEach(x => x.addEventListener('input', syncHint));
  form.querySelectorAll('#schUseList, #schUseSites').forEach(x => x.addEventListener('change', syncHint));
  syncHint();
}

function presetDialog(pr) {
  const v = pr || { name: '', mins: 25, sound: 'rain', block: true, strict: false };
  const fields =
    '<label class="pf-l" for="prName">Name</label><input class="txt-in pf-in" id="prName" maxlength="24" placeholder="e.g. Reading" value="' + esc(v.name) + '">' +
    '<div class="pf-times"><div><label class="pf-l" for="prMins">Minutes</label><input class="txt-in pf-in" type="number" min="5" max="240" id="prMins" value="' + (v.mins | 0) + '"></div>' +
      '<div><label class="pf-l" for="prSound">Sound</label><select class="sel-in pf-in" id="prSound">' +
        PF_SOUNDS.map(k => '<option value="' + k + '"' + (v.sound === k ? ' selected' : '') + '>' + PF_SOUND_LABEL[k] + '</option>').join('') + '</select></div></div>' +
    '<label class="pf-check"><input type="checkbox" id="prBlock"' + (v.block ? ' checked' : '') + '><span>Block distracting sites<small>Your focus block list, until the session ends.</small></span></label>' +
    '<label class="pf-check"><input type="checkbox" id="prStrict"' + (v.strict ? ' checked' : '') + '><span>Strict mode<small>The session can’t be ended early. Turns on blocking too.</small></span></label>';
  const form = pfDialog(pr ? 'Edit preset' : 'New preset', 'Tap it in the popup or on the new tab to start right away.', fields, async f => {
    const res = presetClean({
      id: pr ? pr.id : '', name: f.querySelector('#prName').value, mins: f.querySelector('#prMins').value,
      sound: f.querySelector('#prSound').value, block: f.querySelector('#prBlock').checked, strict: f.querySelector('#prStrict').checked
    });
    if (!res.ok) return res.error;
    const list = presetsList((await storeGet(['plusPresets'])).plusPresets);
    const i = list.findIndex(x => x.id === res.value.id);
    if (i >= 0) list[i] = res.value; else if (list.length >= 8) return 'You can keep up to 8 presets.'; else list.push(res.value);
    await storeSet({ plusPresets: list });
    toast(pr ? 'Preset saved.' : 'Preset added.');
  });
  // Strict keeps sites blocked, so ticking it ticks blocking as well.
  form.querySelector('#prStrict').addEventListener('change', e => { if (e.target.checked) form.querySelector('#prBlock').checked = true; });
  form.querySelector('#prBlock').addEventListener('change', e => { if (!e.target.checked) form.querySelector('#prStrict').checked = false; });
}

// Plus can be switched on or off (or a session can start) while this page is open: redraw the view,
// but never under someone's hands (an open dialog or a focused field).
chrome.storage.onChanged.addListener((c, area) => {
  if (area !== 'local' || !(c.plusKey || c.lockin || c.plusEarn || c.plusIntents)) return;
  const el = document.getElementById('view-protect');
  if (!el || el.classList.contains('hidden') || document.querySelector('.modal-overlay')) return;
  if (document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && el.contains(document.activeElement)) return;
  renderProtect();
});
