// WebWell "Locked In" — a full-screen focus timer on the new tab.
// The background worker owns the session (timer, alarm, badge, blocking);
// this page sends it ops and renders whatever `lockin` says in storage, so
// every open new tab shows the same session and closing the tab changes nothing.
'use strict';

(function () {
  const $l = id => document.getElementById(id);
  const ALL_SITES = { origins: ['<all_urls>'] };
  const SOUND_LABEL = { rain: 'Rain', brown: 'Soft noise', waves: 'Waves', radio: 'Lofi radio', none: 'Silence' };

  let lockin = null;               // mirror of storage `lockin`
  let prefs = { mins: 25, breakMins: 5, sound: 'rain', block: true };
  let pickMins = 25, pickSound = 'rain';
  let ticker = null, endArmed = 0;

  function send(op, extra) {
    return chrome.runtime.sendMessage(Object.assign({ type: 'ww-lockin', op }, extra || {})).catch(() => {});
  }

  function leftMs(l) {
    if (!l) return 0;
    if (l.pausedLeft != null) return l.pausedLeft;
    return Math.max(0, (l.endsAt || 0) - Date.now());
  }
  function mmss(ms) {
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
  }
  function clockAt(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  /* ---------- sound ---------- */
  function playSound(s) {
    if (typeof playerSend !== 'function') return;
    if (s === 'none') { playerExists().then(has => { if (has) playerSend({ cmd: 'stop-all' }).catch(() => {}); }); return; }
    if (s === 'radio') playerSend({ cmd: 'play-station', idx: (musicState && musicState.station) || 0 }).catch(() => {});
    else playerSend({ cmd: 'ambient-play', kind: s }).catch(() => {});
  }
  function markSound(box, s) {
    box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
  }

  /* ---------- setup sheet ---------- */
  function startLabel() {
    $l('lkStart').textContent = 'Start ' + pickMins + '-minute session';
  }
  // Today's open tasks as one-tap choices for "what are you working on?".
  async function renderTaskChips() {
    const box = $l('lkTasks');
    box.replaceChildren();
    let open = [];
    try {
      const r = await chrome.storage.local.get(['tasks']);
      open = ((r.tasks || {})[dayKey(Date.now())] || []).filter(t => t && !t.done && t.text).slice(0, 4);
    } catch (e) {}
    box.classList.toggle('hidden', !open.length);
    open.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = t.text; b.title = t.text;
      b.addEventListener('click', () => { $l('lkTask').value = t.text; $l('lkTask').focus(); });
      box.append(b);
    });
  }
  function openSheet() {
    if (lockin && (lockin.phase === 'focus' || lockin.phase === 'break')) return;
    const f = (typeof focus !== 'undefined' && focus && !focus.done) ? focus.text : '';
    renderTaskChips();
    $l('lkTask').value = f || '';
    pickMins = prefs.mins; pickSound = prefs.sound;
    $l('lkCustom').value = [25, 50, 90].includes(pickMins) ? '' : pickMins;
    $l('lkDur').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.m === pickMins));
    markSound($l('lkSound'), pickSound);
    $l('lkBlock').checked = prefs.block !== false;
    $l('lkNote').classList.add('hidden');
    startLabel();
    $l('lkSheet').classList.remove('hidden');
    setTimeout(() => (f ? $l('lkStart') : $l('lkTask')).focus(), 30);
  }
  function closeSheet() { $l('lkSheet').classList.add('hidden'); }

  // Ask for alerts the first time someone starts a focus session; never nag after a No.
  async function askAlertsOnce() {
    try {
      if (await hasNotifications()) return;
      if ((await chrome.storage.local.get('notifAsked')).notifAsked) return;
      await chrome.storage.local.set({ notifAsked: true });
      await ensureNotifications();
    } catch (e) {}
  }

  async function start() {
    const block = $l('lkBlock').checked;
    let canBlock = true;
    if (!block) await askAlertsOnce();   // session-end alerts need the notifications permission (asked once)
    // Must be the first await after the click: Chrome only shows the
    // permission prompt in response to a user gesture.
    if (block) {
      try { canBlock = await chrome.permissions.request(ALL_SITES); } catch (e) { canBlock = false; }
      if (!canBlock) {
        $l('lkNote').textContent = 'Without the “all sites” permission WebWell can’t block distractions. Starting the timer anyway.';
        $l('lkNote').classList.remove('hidden');
      }
    }
    const task = $l('lkTask').value.trim();
    prefs = { mins: pickMins, breakMins: prefs.breakMins, sound: pickSound, block };
    chrome.storage.local.set({ lockPrefs: prefs }).catch(() => {});
    await send('start', { mins: pickMins, task, sound: pickSound, block: block && canBlock, breakMins: prefs.breakMins });
    playSound(pickSound);
    setTimeout(closeSheet, canBlock ? 0 : 1600);
  }

  function wireSheet() {
    $l('lockBtn').addEventListener('click', openSheet);
    $l('lkSheetClose').addEventListener('click', closeSheet);
    $l('lkSheet').addEventListener('click', e => { if (e.target === $l('lkSheet')) closeSheet(); });
    $l('lkDur').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      pickMins = +b.dataset.m; $l('lkCustom').value = '';
      $l('lkDur').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      startLabel();
    }));
    $l('lkCustom').addEventListener('input', e => {
      const v = Math.max(5, Math.min(240, parseInt(e.target.value, 10) || 0));
      if (!e.target.value) return;
      pickMins = v;
      $l('lkDur').querySelectorAll('button').forEach(x => x.classList.remove('on'));
      startLabel();
    });
    $l('lkSound').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      pickSound = b.dataset.s; markSound($l('lkSound'), pickSound);
    }));
    $l('lkStart').addEventListener('click', start);
    $l('lkTask').addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  }

  /* ---------- running session ---------- */
  function wireStage() {
    $l('lkPause').addEventListener('click', () => send(lockin && lockin.pausedLeft != null ? 'resume' : 'pause'));
    $l('lkAdd').addEventListener('click', () => send('add'));
    $l('lkEnd').addEventListener('click', () => {
      // Two taps to end, so a stray click can't throw away a session.
      if (Date.now() - endArmed < 3000) { endArmed = 0; send('end'); return; }
      endArmed = Date.now();
      const b = $l('lkEnd');
      b.textContent = lockin && lockin.phase === 'break' ? 'Tap again to skip' : 'Tap again to end';
      b.classList.add('armed');
      setTimeout(() => { if (Date.now() - endArmed >= 2900) { endArmed = 0; render(); } }, 3000);
    });
    $l('lkSounds').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      markSound($l('lkSounds'), b.dataset.s);
      playSound(b.dataset.s);
    }));
    $l('lkAgain').addEventListener('click', () => { send('dismiss'); setTimeout(openSheet, 50); });
    $l('lkClose').addEventListener('click', () => send('dismiss'));
  }

  function tick() {
    if (!lockin || !(lockin.phase === 'focus' || lockin.phase === 'break')) return;
    const left = leftMs(lockin);
    $l('lkTime').textContent = mmss(left);
    const total = lockin.totalMs || 1;
    $l('lkBar').style.width = Math.min(100, (1 - left / total) * 100).toFixed(2) + '%';
    document.title = mmss(left) + (lockin.phase === 'break' ? ' · Break' : ' · Focus');
  }

  async function render() {
    const running = lockin && (lockin.phase === 'focus' || lockin.phase === 'break');
    const done = lockin && lockin.phase === 'done';
    document.body.classList.toggle('locked', !!(running || done));
    $l('lkStage').classList.toggle('hidden', !running);
    $l('lkDone').classList.toggle('hidden', !done);
    clearInterval(ticker); ticker = null;
    if (!running) document.title = 'New Tab';

    if (running) {
      const isBreak = lockin.phase === 'break';
      const paused = lockin.pausedLeft != null;
      $l('lkStage').classList.toggle('is-break', isBreak);
      $l('lkPhase').textContent = isBreak ? 'Break' : paused ? 'Paused' : 'Focusing';
      $l('lkTaskText').textContent = isBreak ? 'Stand up, stretch, look away from the screen.' : (lockin.task || '');
      $l('lkPause').classList.toggle('hidden', isBreak);
      $l('lkPause').textContent = paused ? 'Resume' : 'Pause';
      if (!endArmed) {
        $l('lkEnd').textContent = isBreak ? 'Skip break' : 'End session';
        $l('lkEnd').classList.remove('armed');
      }
      $l('lkSounds').classList.toggle('hidden', isBreak);
      if (!isBreak) markSound($l('lkSounds'), lockin.sound || 'none');
      $l('lkFoot').textContent = isBreak ? 'Next: another focus session, or call it a day.'
        : lockin.block ? (paused ? 'Distracting sites stay blocked while paused.' : 'Distracting sites are blocked until ' + clockAt(Date.now() + leftMs(lockin)) + '.')
        : 'Ends at ' + clockAt(Date.now() + leftMs(lockin)) + '.';
      tick();
      ticker = setInterval(tick, 250);
    } else if (done) {
      const m = lockin.doneMins || 0;
      $l('lkDoneTitle').textContent = m >= 1 ? m + ' minute' + (m === 1 ? '' : 's') + ' focused' : 'Session ended';
      const { focusLog } = await chrome.storage.local.get('focusLog');
      const day = (focusLog || {})[dayKey(Date.now())];
      $l('lkDoneSub').textContent = day && day.sessions
        ? 'Today: ' + day.sessions + ' session' + (day.sessions === 1 ? '' : 's') + ' · ' + fmtDurShort(day.mins * 60) + ' focused'
        : 'Every session counts toward your day.';
    }
  }

  /* ---------- boot ---------- */
  async function init() {
    wireSheet(); wireStage();
    const r = await chrome.storage.local.get(['lockin', 'lockPrefs']);
    prefs = Object.assign(prefs, r.lockPrefs || {});
    lockin = r.lockin || null;
    // A finished session's summary only greets the next tab for an hour.
    if (lockin && lockin.phase === 'done' && Date.now() - (lockin.doneAt || 0) > 3600000) { send('dismiss'); lockin = null; }
    render();
    chrome.storage.onChanged.addListener((c, area) => {
      if (area !== 'local' || !c.lockin) return;
      lockin = c.lockin.newValue || null;
      endArmed = 0;
      render();
    });
    window.wwOpenFocusSheet = openSheet;   // used by the "Start focusing" button under today's focus
    if (location.hash === '#lockin') { history.replaceState(null, '', location.pathname); openSheet(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
