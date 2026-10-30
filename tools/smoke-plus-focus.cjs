// Real-browser smoke test for the Plus focus extras (schedules, strict, intent, earn, presets).
//   node tools/smoke-plus-focus.cjs        screenshots go to %TEMP%\ww-plus-focus\
// Runs the free path first (no key: locked cards only), then switches Plus on with a real signed test key.
// Site access cannot be granted headless, so pages get chrome.permissions.request stubbed to "yes";
// the rules themselves are read back from the service worker. Test sites use .test names (no network).
const { withExtension } = require('./cdp-harness.cjs');
const fs = require('fs'), path = require('path');
const OUT = path.join(process.env.TEMP || '.', 'ww-plus-focus');
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (name, cond, extra) => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined && !cond ? '  -> ' + JSON.stringify(extra) : '')); if (!cond) fails++; };
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const STUB = "chrome.permissions.request = async () => true; chrome.permissions.contains = async () => true; window.confirm = () => true; 1";

withExtension(async ({ open, ev, shot, sw, plusKey, sleep }) => {
  const S = async (page, name) => { await shot(page, path.join(OUT, name + '.png')); };
  const size = async (page, w, h) => { await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); };
  check('test key signed', plusKey.startsWith('WWP1.'));

  /* ---------------- free path ---------------- */
  const dash = await open('dashboard/dashboard.html#protect');
  await ev(dash, "chrome.storage.local.set({ ntWelcome: { done: true, at: Date.now() } })");   // skip the first-run tour on the new tab
  await sleep(800);
  check('free: Protect shows 5 locked Plus cards', (await ev(dash, "document.querySelectorAll('#view-protect .pf-locks .plus-lock').length")) === 5);
  check('free: no Plus editors', (await ev(dash, "!document.getElementById('pSchedAdd') && !document.getElementById('pPresetAdd')")) === true);
  check('free: the original Protect cards are all there', (await ev(dash, "['pAdult','pShorts','pPause','pLockNow','pBlockForm','pFocusForm'].every(id => document.getElementById(id))")) === true);
  await ev(dash, "document.querySelector('.pf-sec').scrollIntoView()"); await sleep(300);
  await S(dash, 'free-dashboard-protect');

  const pop = await open('popup/popup.html'); await size(pop, 400, 580);
  await ev(pop, "document.querySelector('[data-tab=focus]').click()"); await sleep(500);
  check('free popup: presets lock card shown, no preset buttons', (await ev(pop, "!!document.querySelector('#view .plus-lock[data-plus-lock=presets]') && !document.getElementById('fPresets')")) === true);
  check('free popup: strict row is a preview with a Plus badge', (await ev(pop, "!!document.getElementById('fStrictMore') && !document.getElementById('fStrict')")) === true);
  await ev(pop, "document.getElementById('fStrictMore').click()"); await sleep(200);
  check('free popup: tapping it shows the strict lock card', (await ev(pop, "!!document.querySelector('#fStrictLock .plus-lock') && !document.getElementById('fStrictLock').hidden")) === true);
  await S(pop, 'free-popup-focus');
  await ev(pop, "document.querySelector('.view').scrollTop = 999"); await sleep(200);
  await S(pop, 'free-popup-focus-scrolled');

  const nt = await open('newtab/newtab.html#lockin'); await sleep(800);
  check('free newtab: sheet shows preset preview chips', (await ev(nt, "document.querySelectorAll('#lkPresets.is-preview button').length")) === 3);
  check('free newtab: strict preview row', (await ev(nt, "!!document.getElementById('lkStrictMore') && !document.getElementById('lkStrict')")) === true);
  await ev(nt, "document.querySelector('#lkPresets button').click()"); await sleep(200);
  check('free newtab: tapping a preview preset shows the lock, does not start', (await ev(nt, "!!document.querySelector('#lkPlusNote .plus-lock') && !document.getElementById('lkSheet').classList.contains('hidden')")) === true);
  check('free newtab: no session started', (await ev(nt, "chrome.storage.local.get('lockin').then(r => !r.lockin)")) === true);
  await S(nt, 'free-newtab-sheet');

  await ev(dash, "chrome.storage.local.set({ protect: { blocklist: ['distracting.test'], pause: true, pauseSecs: 3 } })");
  const bl = await open('blocked/blocked.html?r=custom&u=' + encodeURIComponent('https://distracting.test/'));
  check('free blocked: unblock button as before', (await ev(bl, "[...document.querySelectorAll('#actions button')].map(b => b.textContent).join('|')")) === 'Unblock distracting.test|Go back');
  check('free blocked: earn lock card below the buttons', (await ev(bl, "!!document.querySelector('#plusSlot .plus-lock[data-plus-lock=earn]')")) === true);
  await S(bl, 'free-blocked');
  const pz = await open('blocked/pause.html?u=' + encodeURIComponent('https://distracting.test/'));
  await sleep(3500);
  check('free pause: no intent question, Continue opens after the countdown', (await ev(pz, "!document.getElementById('intentIn') && !document.getElementById('goBtn').disabled")) === true);

  /* ---------------- Plus on ---------------- */
  await ev(dash, "chrome.storage.local.set({ plusKey: " + JSON.stringify(plusKey) + " })"); await sleep(1200);
  await ev(dash, STUB);
  check('plus: Protect redraws with the editors', (await ev(dash, "!!document.getElementById('pSchedAdd') && !!document.getElementById('pPresetAdd') && !document.querySelector('.pf-locks')")) === true);
  // add a schedule through the dialog
  await ev(dash, "document.getElementById('pSchedAdd').click()"); await sleep(300);
  await ev(dash, "document.getElementById('schName').value = 'Evenings'; document.getElementById('schStart').value = '22:00'; document.getElementById('schEnd').value = '06:00'; document.getElementById('schStart').dispatchEvent(new Event('input')); 1");
  await sleep(150);
  check('dialog: overnight hint appears', /overnight/.test(await ev(dash, "document.getElementById('schHint').textContent")));
  await ev(dash, "document.getElementById('schUseSites').click(); document.getElementById('schSites').value = 'youtube.test, x.test'; [...document.querySelectorAll('.pf-day')].forEach(b => b.classList.add('on')); 1");
  await S(dash, 'plus-schedule-dialog');
  await ev(dash, "document.querySelector('.pf-dialog').requestSubmit()"); await sleep(800);
  const sch = await ev(dash, "chrome.storage.local.get('plusSchedules').then(r => JSON.stringify(r.plusSchedules))");
  check('dialog: schedule saved', /Evenings/.test(sch) && /youtube\.test/.test(sch), sch);
  // a schedule that is open right now
  await ev(dash, "chrome.storage.local.get('plusSchedules').then(r => chrome.storage.local.set({ plusSchedules: r.plusSchedules.concat({ id: 'now1', name: 'Study hours', days: [0,1,2,3,4,5,6], start: '00:00', end: '23:59', sites: ['youtube.test'], on: true }) }))");
  await sleep(1200);
  const w = await sw();
  const ids = await ev(w, "chrome.declarativeNetRequest.getDynamicRules().then(r => JSON.stringify(r.map(x => [x.id, x.condition.requestDomains])))");
  check('worker: open schedule makes rule 3101 with its site', /\[3101,\[[^\]]*"youtube\.test"/.test(ids), ids);
  check('worker: next-change alarm is set', (await ev(w, "chrome.alarms.get('ww-sched').then(a => !!a && a.scheduledTime > Date.now())")) === true);
  await ev(dash, "renderProtect()"); await sleep(500);
  check('dashboard: "On now" shows for the open schedule', (await ev(dash, "document.querySelectorAll('.pf-now').length")) >= 1);   // "Evenings" may be open too, depending on the hour
  await ev(dash, "document.querySelector('.pf-sec').scrollIntoView()"); await sleep(300);
  await S(dash, 'plus-dashboard-protect');
  // a preset through the dialog
  await ev(dash, "document.getElementById('pPresetAdd').click()"); await sleep(200);
  await ev(dash, "document.getElementById('prName').value = 'Reading'; document.getElementById('prMins').value = '35'; document.getElementById('prSound').value = 'waves'; document.querySelector('.pf-dialog').requestSubmit(); 1"); await sleep(600);
  check('dialog: preset added (4 now)', (await ev(dash, "chrome.storage.local.get('plusPresets').then(r => r.plusPresets.length)")) === 4);
  await ev(dash, "document.getElementById('pPresetAdd').click()"); await sleep(200);
  await ev(dash, "document.getElementById('prName').value = ''; document.querySelector('.pf-dialog').requestSubmit(); 1"); await sleep(200);
  check('dialog: preset without a name is refused with a plain message', /name/.test(await ev(dash, "document.getElementById('pfErr').textContent")));
  await ev(dash, "document.querySelector('.modal-overlay').remove(); 1");
  // earn prefs
  await ev(dash, "document.querySelector('#pEarnPer button[data-v=\"10\"]').click()"); await sleep(400);
  check('earn: rate saved', (await ev(dash, "chrome.storage.local.get('plusFocusPrefs').then(r => r.plusFocusPrefs.earnPer)")) === 10);
  await ev(dash, "document.querySelector('#pEarnPer button[data-v=\"5\"]').click()"); await sleep(300);

  // dark mode dashboard
  await ev(dash, "renderProtect()"); await sleep(600);
  await ev(dash, "window.scrollTo(0, document.body.scrollHeight)"); await sleep(300);
  await S(dash, 'plus-dashboard-protect-lower');
  await ev(dash, "document.body.classList.add('dark'); document.querySelector('.pf-sec').scrollIntoView(); 1"); await sleep(300);
  await S(dash, 'plus-dashboard-protect-dark');
  await ev(dash, "document.body.classList.remove('dark'); 1");

  // popup presets
  await ev(pop, "location.reload()"); await sleep(1500); await ev(pop, STUB);
  await ev(pop, "document.querySelector('[data-tab=focus]').click()"); await sleep(900);
  check('plus popup: 4 presets shown', (await ev(pop, "document.querySelectorAll('#fPresets .preset').length")) === 4);
  check('plus popup: strict switch is real, no lock cards', (await ev(pop, "!!document.getElementById('fStrict') && !document.querySelector('#view .plus-lock')")) === true);
  await S(pop, 'plus-popup-focus');
  await ev(pop, "document.body.classList.add('dark'); 1"); await sleep(200);
  await S(pop, 'plus-popup-focus-dark');
  await ev(pop, "document.body.classList.remove('dark'); 1");
  // one tap on Deep work starts a strict 90 minute session
  await ev(pop, "document.querySelector('#fPresets [data-preset=deep]').click()"); await sleep(1200);
  const lk = JSON.parse(await ev(pop, "chrome.storage.local.get('lockin').then(r => JSON.stringify(r.lockin))"));
  check('preset: Deep work started strict, 90 min, brown noise', lk.strict === true && lk.mins === 90 && lk.sound === 'brown' && lk.preset === 'Deep work', lk);
  check('preset: lockPrefs were not overwritten by the preset', (await ev(pop, "chrome.storage.local.get('lockPrefs').then(r => !r.lockPrefs || r.lockPrefs.mins !== 90)")) === true);
  check('strict popup: no Pause or End, emergency exit shown', (await ev(pop, "!document.getElementById('fPause') && !document.getElementById('fEnd') && !!document.getElementById('fEmergency')")) === true);
  const rules2 = await ev(w, "chrome.declarativeNetRequest.getDynamicRules().then(r => JSON.stringify(r.map(x => x.id)))");
  check('worker: strict rule 3002 in place', /3002/.test(rules2), rules2);
  const refused = await ev(dash, "chrome.runtime.sendMessage({ type: 'ww-lockin', op: 'end' }).then(r => JSON.stringify(r))");
  check('strict: an "end" from another page is refused', /"refused":"strict"/.test(refused), refused);
  check('strict: session still running', (await ev(dash, "chrome.storage.local.get('lockin').then(r => r.lockin.phase)")) === 'focus');
  await ev(pop, "document.getElementById('fEmergency').click()"); await sleep(200);
  await ev(pop, "const i = document.getElementById('fEmIn'); i.value = 'i choose to'; i.dispatchEvent(new Event('input')); 1");
  check('strict popup: Stop stays off until the whole phrase is typed', (await ev(pop, "document.getElementById('fEmGo').disabled")) === true);
  await S(pop, 'plus-popup-strict');

  // blocked pages during strict focus
  const bs = await open('blocked/blocked.html?r=custom&u=' + encodeURIComponent('https://distracting.test/'));
  check('strict blocked: no Unblock button, no earn button', (await ev(bs, "[...document.querySelectorAll('#actions button')].map(b => b.textContent).join('|')")) === 'Go back');
  const bf = await open('blocked/blocked.html?r=focus&u=' + encodeURIComponent('https://distracting.test/'));
  check('strict blocked (focus): says strict', /Strict/.test(await ev(bf, "document.getElementById('eyebrow').textContent")));
  await S(bf, 'plus-blocked-strict-focus');

  // newtab stage during strict
  await ev(nt, "location.replace('newtab.html')"); await sleep(2000);
  check('strict newtab: Pause and End hidden, emergency link shown', (await ev(nt, "document.getElementById('lkPause').classList.contains('hidden') && document.getElementById('lkEnd').classList.contains('hidden') && !document.getElementById('lkEm').classList.contains('hidden')")) === true);
  await ev(nt, "document.getElementById('lkEmBtn').click()"); await sleep(200);
  await S(nt, 'plus-newtab-strict');
  await ev(nt, "const i = document.getElementById('lkEmIn'); i.value = 'I choose to stop'; i.dispatchEvent(new Event('input')); document.getElementById('lkEmBox').requestSubmit(); 1"); await sleep(1200);
  const done = JSON.parse(await ev(nt, "chrome.storage.local.get(['lockin','focusLog']).then(r => JSON.stringify(r))"));
  check('emergency exit: session ended and noted', done.lockin.phase === 'done' && done.lockin.emergency === true && done.focusLog[today()].emergencyExits === 1, done);
  check('newtab: done screen says it was stopped', /stopped/i.test(await ev(nt, "document.getElementById('lkDoneTitle').textContent")));
  await S(nt, 'plus-newtab-done');
  await ev(nt, "chrome.runtime.sendMessage({ type: 'ww-lockin', op: 'dismiss' })"); await sleep(400);

  // newtab sheet with Plus
  await ev(nt, "location.replace('newtab.html?again=1#lockin')"); await sleep(2000);   // a real load, not just a hash change
  check('plus newtab: 4 real presets and a strict switch', (await ev(nt, "document.querySelectorAll('#lkPresets:not(.is-preview) button').length === 4 && !!document.getElementById('lkStrict')")) === true);
  await S(nt, 'plus-newtab-sheet');
  await ev(nt, STUB);
  await ev(nt, "document.querySelector('#lkPresets [data-preset=wind]').click()"); await sleep(1200);
  const lk2 = JSON.parse(await ev(nt, "chrome.storage.local.get('lockin').then(r => JSON.stringify(r.lockin))"));
  check('newtab preset: Wind down = 20 min waves, no blocking, not strict', lk2.mins === 20 && lk2.sound === 'waves' && lk2.block === false && !lk2.strict, lk2);
  check('newtab: normal session keeps Pause and End', (await ev(nt, "!document.getElementById('lkPause').classList.contains('hidden') && !document.getElementById('lkEnd').classList.contains('hidden') && (!document.getElementById('lkEm') || document.getElementById('lkEm').classList.contains('hidden'))")) === true);
  // finish it: pretend it ran to the end and let the alarm fire
  await ev(nt, "chrome.storage.local.get('lockin').then(r => { const l = r.lockin; l.endsAt = Date.now() + 600; l.breakMins = 0; return chrome.storage.local.set({ lockin: l, plusEarn: { day: '" + today() + "', mins: 0 } }); })");
  await sleep(2500);
  const fin = JSON.parse(await ev(nt, "chrome.storage.local.get(['lockin','plusEarn']).then(r => JSON.stringify(r))"));
  check('earn: a finished 20-minute session banks 4 minutes', fin.lockin.phase === 'done' && fin.plusEarn.mins === 4 && fin.lockin.earned === 4, fin);
  await S(nt, 'plus-newtab-done-earned');
  await ev(nt, "chrome.runtime.sendMessage({ type: 'ww-lockin', op: 'dismiss' })");

  // blocked page with banked minutes: earn + intent
  const be = await open('blocked/blocked.html?r=custom&u=' + encodeURIComponent('https://distracting.test/'));
  check('plus blocked: Use 4 minutes button', /Use 4 minutes/.test(await ev(be, "document.getElementById('actions').textContent")));
  await ev(be, "[...document.querySelectorAll('#actions button')].find(b => /Use/.test(b.textContent)).click()"); await sleep(300);
  check('intent: the question appears, go is off until 3 characters', (await ev(be, "!!document.getElementById('intentIn') && document.getElementById('intentGo').disabled")) === true);
  await ev(be, "const i = document.getElementById('intentIn'); i.value = 'Reply to Sam'; i.dispatchEvent(new Event('input')); 1");
  await S(be, 'plus-blocked-intent');
  await ev(be, "document.getElementById('intentForm').requestSubmit()"); await sleep(1500);
  const sess = await ev(w, "chrome.declarativeNetRequest.getSessionRules().then(r => JSON.stringify(r.map(x => [x.priority, x.condition.requestDomains[0]])))");
  check('earn: allow rule above normal blocks for the site', /\[85,"distracting\.test"\]/.test(sess), sess);
  const after = JSON.parse(await ev(dash, "chrome.storage.local.get(['plusEarn','plusIntents']).then(r => JSON.stringify(r))"));
  check('earn: bank spent; intent saved with minutes', after.plusEarn.mins === 0 && after.plusIntents.slice(-1)[0].text === 'Reply to Sam' && after.plusIntents.slice(-1)[0].allowedMins === 4, after);

  // pause page asks why (Plus, intent on)
  const pp = await open('blocked/pause.html?u=' + encodeURIComponent('https://other.test/'));
  await sleep(3500);
  check('plus pause: Continue waits for an answer after the countdown', (await ev(pp, "!!document.getElementById('intentIn') && document.getElementById('goBtn').disabled")) === true);
  await ev(pp, "const i = document.getElementById('intentIn'); i.value = 'one tutorial'; i.dispatchEvent(new Event('input')); 1");
  check('plus pause: ...and opens once answered', (await ev(pp, "document.getElementById('goBtn').disabled")) === false);
  await S(pp, 'plus-pause-intent');

  // schedule block screen
  await ev(dash, "chrome.storage.local.set({ plusEarn: { day: '" + today() + "', mins: 6 } })");
  const bsch = await open('blocked/blocked.html?r=schedule&u=' + encodeURIComponent('https://youtube.test/watch'));
  const schBody = await ev(bsch, "document.getElementById('body').textContent");
  check('schedule blocked: names the schedule and its end', /(Study hours|Evenings)” schedule blocks it until \d/.test(schBody), schBody);   // both cover youtube.test at night
  check('schedule blocked: earned minutes offered (not strict)', /Use 6 minutes/.test(await ev(bsch, "document.getElementById('actions').textContent")));
  await S(bsch, 'plus-blocked-schedule');

  // switching Plus off removes schedule rules and brings the locks back
  await ev(dash, "chrome.storage.local.remove('plusKey')"); await sleep(1500);
  const ids3 = await ev(w, "chrome.declarativeNetRequest.getDynamicRules().then(r => JSON.stringify(r.map(x => x.id)))");
  check('plus off: schedule rules gone at once', !/310[12]/.test(ids3), ids3);
  check('plus off: dashboard shows the locks again', (await ev(dash, "document.querySelectorAll('.pf-locks .plus-lock').length")) === 5);
}, { wait: 1800 }).then(() => {
  console.log('\nscreenshots in ' + OUT);
  if (fails) { console.log(fails + ' check(s) FAILED'); process.exitCode = 1; } else console.log('all checks passed');
});
