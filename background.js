// WebWell background service worker: tracks active-tab time per domain.
'use strict';
importScripts('lib/time.js', 'lib/categories.js', 'lib/ai.js', 'lib/protect.js', 'lib/plus.js', 'lib/plus-focus.js');

// ---------------------------------------------------------------------------
// MV3 service workers are killed ~30s after the last event, which wipes ALL
// module state — including the in-progress timing session. The session is
// therefore persisted to storage on every change and re-loaded at the start
// of every handler, and the periodic alarm re-derives the true state
// (idle? focused? which tab?) instead of trusting stale in-memory flags.
// ---------------------------------------------------------------------------
let current = { domain: null, startedAt: null }; // ongoing session (in-memory copy)
let windowFocused = true;
let idleState = 'active';

// Serialize top-level event handlers: two overlapping async handlers can
// interleave their read-modify-write storage cycles (both read startedAt=T0,
// both credit from T0) and lose seconds. Chaining them avoids the race.
// Only the listener callbacks are wrapped — never the functions they call.
let handlerChain = Promise.resolve();
function serialized(fn) {
  const p = handlerChain.then(() => fn().catch(() => {}));
  handlerChain = p;
  return p;
}

// Longest gap ever credited in one flush. The alarm fires every minute while
// the browser runs, so a bigger gap means the browser was closed or asleep —
// time we cannot honestly claim the user spent browsing.
const MAX_FLUSH_GAP_SECS = 180;

async function loadSession() {
  try {
    const r = await storeGet(['wwSession']);
    if (r && r.wwSession && r.wwSession.domain) current = r.wwSession;
    else if (!current.domain) current = { domain: null, startedAt: null };
  } catch (e) {}
}

async function saveSession() {
  try { await storeSet({ wwSession: current }); } catch (e) {}
}

async function trueIdleState() {
  try {
    const s = await getSettings();
    const st = await chrome.idle.queryState(s.idleTimeout);
    // Watching a show means no mouse or keyboard input, which the browser reads as
    // "idle". If the tab you are looking at is playing sound, you are still there.
    if (st === 'idle' && await activeTabAudible()) return 'active';
    return st;
  } catch (e) { return 'active'; }
}

async function activeTabAudible() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return !!(tab && tab.audible);
  } catch (e) { return false; }
}

async function snapshotActiveTab() {
  try {
    const wins = await chrome.windows.getAll({ populate: true });
    const focused = wins.find(w => w.focused);
    if (!focused) return null;
    const active = (focused.tabs || []).find(t => t.active);
    if (!active) return null;
    return domainOf(active.url);
  } catch (e) { return null; }
}

// Write the elapsed seconds of the current session into today's bucket.
async function flush() {
  await loadSession();
  if (!current.domain || !current.startedAt) return;
  const settings = await getSettings();
  if (!settings.trackingEnabled) { current = { domain: null, startedAt: null }; await saveSession(); return; }
  const now = Date.now();
  const gapSecs = Math.floor((now - current.startedAt) / 1000);
  if (gapSecs > MAX_FLUSH_GAP_SECS) {
    // Unobserved gap (browser was closed/asleep — the alarm would have
    // flushed otherwise). Restart the session without crediting the gap.
    current.startedAt = now;
    await saveSession();
    return;
  }
  if (gapSecs > 0) {
    // A session can span local midnight — split the credit at the day boundary
    // so pre-midnight seconds land on the correct day. (gapSecs is capped at
    // MAX_FLUSH_GAP_SECS, so at most one midnight can be crossed.)
    let segStart = current.startedAt;
    let remaining = gapSecs;
    let guard = 0;
    while (remaining > 0 && guard++ < 4) {
      const nextMidnight = new Date(segStart);
      nextMidnight.setHours(24, 0, 0, 0);
      const segEnd = Math.min(segStart + remaining * 1000, nextMidnight.getTime());
      const segSecs = Math.max(0, Math.round((segEnd - segStart) / 1000));
      if (segSecs <= 0) break;
      const key = dayKey(segStart);
      const data = await getDay(key);
      data.domains[current.domain] = (data.domains[current.domain] || 0) + segSecs;
      data.total += segSecs;
      const hr = new Date(segStart).getHours();
      data.hourly[hr] = (data.hourly[hr] || 0) + segSecs;
      await setDay(key, data);
      remaining -= segSecs;
      segStart = segEnd;
    }
  }
  current.startedAt = now; // continue the same session
  await saveSession();
}

async function countVisit(domain) {
  const key = dayKey(Date.now());
  const data = await getDay(key);
  data.visits[domain] = (data.visits[domain] || 0) + 1;
  await setDay(key, data);
}

async function startSession(domain, isVisit) {
  await loadSession();
  if (!domain || domain === current.domain) return;
  await flush();
  current = { domain, startedAt: Date.now() };
  await saveSession();
  if (isVisit) await countVisit(domain);
}

async function stopSession() {
  await loadSession();
  await flush();
  current = { domain: null, startedAt: null };
  await saveSession();
}

async function resync() {
  await loadSession();
  const settings = await getSettings();
  if (!settings.trackingEnabled) { await stopSession(); return; }
  // Re-derive truth instead of trusting module flags that may have been
  // wiped by a service-worker restart.
  idleState = await trueIdleState();
  const domain = await snapshotActiveTab(); // null when no window is focused
  if (!domain) { await stopSession(); return; }
  if (idleState !== 'active') { await stopSession(); return; }
  if (domain !== current.domain) await startSession(domain, true);
  else if (!current.startedAt) { current.startedAt = Date.now(); await saveSession(); }
}

// ---- event listeners ----
chrome.tabs.onActivated.addListener(() => serialized(async () => {
  await loadSession();
  const settings = await getSettings();
  if (!settings.trackingEnabled || !windowFocused || idleState !== 'active') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const domain = tab ? domainOf(tab.url) : null;
  if (domain) await startSession(domain, true);
  else await stopSession();
}));

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => serialized(async () => {
  if (!tab.active || changeInfo.status !== 'complete') return;
  await loadSession();
  const settings = await getSettings();
  if (!settings.trackingEnabled || !windowFocused || idleState !== 'active') return;
  const domain = domainOf(tab.url);
  if (domain) await startSession(domain, false); // same-tab navigation isn't a new "visit"
  else await stopSession();
}));

chrome.windows.onFocusChanged.addListener((windowId) => serialized(async () => {
  await loadSession();
  windowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  await resync();
}));

chrome.idle.onStateChanged.addListener((state) => serialized(async () => {
  await loadSession();
  idleState = state; // 'active' | 'idle' | 'locked'
  await resync();
}));

// ---- periodic heartbeat: re-establish truth, flush, check limits ----
chrome.alarms.onAlarm.addListener((alarm) => serialized(async () => {
  if (alarm.name === 'lockin-end') { await finishLockinPhase(); return; }
  if (alarm.name === 'ww-protect-retry') { await syncProtectRules(); return; }
  if (alarm.name === 'ww-sched') { await syncProtectRules(); return; }   // a block schedule opens or closes now
  if (alarm.name !== 'webwell-tick') return;
  try { await updateBadge(); } catch (e) {}
  try { await expirePauseAllows(); } catch (e) {}
  try { await plusFocusTick(); } catch (e) {}
  await resync(); // restarts the session if the worker was killed mid-session
  await flush();  // banks the elapsed time
  // Each check is isolated: one throwing must not skip the rest this minute.
  try { await checkLimits(); } catch (e) {}
  try { await checkMilestones(); } catch (e) {}
  try { await checkForecastNudge(); } catch (e) {}
}));

async function checkLimits() {
  if (!chrome.notifications) return;   // alerts not allowed yet: do not use up today's alert
  const limits = await getLimits();
  const domains = Object.keys(limits);
  if (!domains.length) return;
  const key = dayKey(Date.now());
  const data = await getDay(key);
  const r = await storeGet(['notifiedLimits']);
  const notified = r.notifiedLimits || {};
  if (notified.day !== key) { notified.day = key; notified.domains = []; }
  await loadSession(); // snapshot the session after the awaits above
  for (const d of domains) {
    const limitSecs = limits[d] * 60;
    const spent = (data.domains[d] || 0) + ((current.domain === d && current.startedAt) ? Math.floor((Date.now() - current.startedAt) / 1000) : 0);
    if (spent >= limitSecs && !(notified.domains || []).includes(d)) {
      notified.domains.push(d);
      await storeSet({ notifiedLimits: notified });
      notify('limit-' + d + '-' + key, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'WebWell: time limit reached',
        message: 'You have spent ' + fmtDur(spent) + ' on ' + d + ' today (limit ' + limits[d] + 'm). Time to move on?'
      });
    }
  }
}

// Alerts are an optional permission. Without it nothing is shown (and nothing crashes).
function notify(id, opts) {
  if (!chrome.notifications) return false;
  try { chrome.notifications.create(id, opts); return true; } catch (e) { return false; }
}

async function checkMilestones() {
  if (!chrome.notifications) return;
  // Gentle nudge when distracting time crosses 50% of today's browsing.
  const key = dayKey(Date.now());
  const r = await storeGet(['notifiedMilestones']);
  const seen = r.notifiedMilestones || {};
  if (seen.day === key && seen.halfDistracting) return;
  const data = await getDay(key);
  if (data.total < 30 * 60) return; // need at least 30 min of data
  const cats = await getCategories();
  let distracting = 0;
  for (const d of Object.keys(data.domains)) {
    if (categoryOf(d, cats) === 'distracting') distracting += data.domains[d];
  }
  if (distracting >= data.total * 0.5) {
    await storeSet({ notifiedMilestones: { day: key, halfDistracting: true } });
    notify('milestone-distracting-' + key, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'WebWell: check-in',
      message: 'Over half your browsing today (' + fmtDur(distracting) + ') went to distracting sites. Want a break?'
    });
  }
}

async function checkForecastNudge() {
  // Warn once per day, 15 minutes before the user's usual distraction slump.
  const todayK = dayKey(Date.now());
  const r = await storeGet(['days', 'categories', 'settings', 'forecastNudge']);
  const seen = r.forecastNudge || {};
  if (seen.day === todayK) return;
  const s = r.settings || {};
  if (!s.forecastNudge) return;
  const f = computeForecast(r.days || {}, r.categories || {});
  if (f.slumpHour < 0) return;
  const now = new Date();
  const target = new Date();
  target.setHours(f.slumpHour, 0, 0, 0);
  const minsBefore = (target - now) / 60000;
  if (minsBefore > 0 && minsBefore <= 15) {
    // Mark the day seen only if the notification actually goes out.
    try {
      if (!chrome.notifications) return;   // no permission yet: try again next time
      notify('forecast-' + todayK, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'WebWell forecast 🔮',
        message: 'Your ' + hourLabel(f.slumpHour) + ' slump is coming (usually ' +
          fmtDurShort(Math.round(f.slumpAvg)) + ' of distractions). How about a focus session instead?'
      });
      await storeSet({ forecastNudge: { day: todayK } });
    } catch (e) {}
  }
}

// FIX: these used to run un-serialized, so onInstalled/onStartup and the
// top-level resync() could overlap on a worker start and double-count a visit.
// When WebWell is removed, the browser opens this page: one optional question, nothing is sent from the extension.
const UNINSTALL_URL = 'https://webwell.app/goodbye';
function registerUninstallPage() {
  try { if (chrome.runtime.setUninstallURL) chrome.runtime.setUninstallURL(UNINSTALL_URL); } catch (e) {}
}

chrome.runtime.onInstalled.addListener((details) => serialized(async () => {
  const settings = await getSettings();
  chrome.idle.setDetectionInterval(settings.idleTimeout);
  chrome.alarms.create('webwell-tick', { periodInMinutes: 1 });
  registerUninstallPage();
  if (details.reason === 'install') {
    // Open the new tab, where the welcome tour starts (newtab/welcome.js).
    chrome.tabs.create({ url: chrome.runtime.getURL('newtab/newtab.html') });
  }
  await resync();
  syncProtectRules();
  scheduleLockin();
}));

chrome.runtime.onStartup.addListener(() => serialized(async () => {
  const settings = await getSettings();
  chrome.idle.setDetectionInterval(settings.idleTimeout);
  chrome.alarms.create('webwell-tick', { periodInMinutes: 1 });
  registerUninstallPage();
  await resync();
  syncProtectRules();
  scheduleLockin();
}));

// Only the service worker can reliably create the offscreen music player.
// The new tab / popup ask for it here instead of each calling
// chrome.offscreen themselves (which raced and threw "only a single
// offscreen document" errors).
// Pause/resume or idle-timeout changes made in the popup/dashboard apply at once
// (before, they waited for the next tab event or the 1-minute alarm).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  // Blocking follows its settings, the focus-session state and the user's categories.
  if (changes.protect || changes.lockin || changes.categories) syncProtectRules();
  // Plus: schedules apply as soon as they are saved, and vanish the moment Plus is switched off.
  else if (changes.plusSchedules || changes.plusKey) syncProtectRules();
  if (changes.lockin) scheduleLockin();
  if (!changes.settings) return;
  serialized(async () => {
    const s = await getSettings();
    try { chrome.idle.setDetectionInterval(Math.max(15, s.idleTimeout || 60)); } catch (e) {}
    await resync();
  });
});

// The "all sites" permission is requested from a page; rules that needed it
// (redirects, header changes, the short-video script) start working now.
if (chrome.permissions && chrome.permissions.onAdded) {
  chrome.permissions.onAdded.addListener(() => syncProtectRules());
  chrome.permissions.onRemoved.addListener(() => syncProtectRules());
}

let creatingPlayer = null;
async function ensurePlayerDoc() {
  try {
    if (!chrome.offscreen) return false;
    if (chrome.offscreen.hasDocument && await chrome.offscreen.hasDocument()) return true;
    if (!creatingPlayer) {
      creatingPlayer = chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Keep WebWell music playing when the new tab is closed.'
      }).catch(() => {}).finally(() => { creatingPlayer = null; });
    }
    await creatingPlayer;
    return true;
  } catch (e) { return false; }
}

// Dashboard/popup ask for the live session so "right now" is accurate.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'ww-ensure-player') {
    ensurePlayerDoc().then(ok => sendResponse({ ok }));
    return true;
  }
  if (msg && msg.type === 'webwell-live') {
    loadSession().then(() => {
      const live = current.domain && current.startedAt
        ? { domain: current.domain, elapsed: Math.floor((Date.now() - current.startedAt) / 1000) }
        : null;
      sendResponse({ live });
    });
    return true;
  }
  if (msg && msg.type === 'ww-blocked-info') {
    const tabId = sender.tab && sender.tab.id;
    lastNavFor(tabId).then(url => sendResponse({ url }));
    return true;
  }
  if (msg && msg.type === 'ww-blocked-hit') {
    countBlock(String(msg.reason || 'other')).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg && msg.type === 'ww-pause-continue') {
    allowAfterPause(String(msg.url || '')).then(async ok => {
      if (ok && msg.intent) { try { await saveIntent(domainOf(String(msg.url || '')), msg.intent, PAUSE_ALLOW_MS / 60000); } catch (e) {} }
      sendResponse({ ok });
    }, () => sendResponse({ ok: false }));
    return true;
  }
  if (msg && msg.type === 'ww-plus-blocked-info') {
    plusBlockedInfo(String(msg.url || '')).then(sendResponse, () => sendResponse({ plus: false }));
    return true;
  }
  if (msg && msg.type === 'ww-earn-use') {
    earnUse(String(msg.url || ''), msg.intent).then(sendResponse, () => sendResponse({ ok: false }));
    return true;
  }
  if (msg && msg.type === 'ww-protect-sync') {
    syncProtectRules().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg && msg.type === 'ww-lockin') {
    // A strict session refuses some ops; the page is told why so it can say so.
    serialized(() => lockinOp(msg)).then(res => sendResponse(res && res.refused ? { ok: false, refused: res.refused } : { ok: true }),
      () => sendResponse({ ok: false }));
    return true;
  }
  return false;
});

// ===========================================================================
// Protect: keep Chrome's blocking rules in step with the user's settings.
// ===========================================================================
let protectChain = Promise.resolve();
function syncProtectRules() {
  protectChain = protectChain.then(applyProtectRules).catch(() => {});
  return protectChain;
}

async function applyProtectRules() {
  // Blocking is an optional permission. Until it is granted there is nothing to do; try again shortly in case
  // it was only just granted and this worker has not picked up the new API yet.
  if (!chrome.declarativeNetRequest) { try { chrome.alarms.create('ww-protect-retry', { delayInMinutes: 0.2 }); } catch (e) {} return; }
  const r = await storeGet(['protect', 'lockin', 'categories', 'plusSchedules']);
  const p = protectState(r.protect);
  const plus = await plusProtectExtras(r, p);
  const rules = buildDynamicRules(p, r.lockin, r.categories || {}, plus.extra);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const ours = existing.map(x => x.id).filter(id => id >= 1000 && id < 5000);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ours, addRules: rules });
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      p.adult ? { enableRulesetIds: ['adult'] } : { disableRulesetIds: ['adult'] });
  } catch (e) {}
  if (!p.pause) {
    try {
      // Only the mindful-pause allowances go with the pause; minutes someone earned (Plus) are theirs to keep.
      const sess = await chrome.declarativeNetRequest.getSessionRules();
      const ids = sess.filter(x => x.id >= RULE_IDS.pauseAllow && x.priority !== RULE_PRIORITY.earnAllow).map(x => x.id);
      if (ids.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
    } catch (e) {}
  }
  if (plus.extra) {
    // One alarm at the next minute any schedule opens or closes, so blocking flips on time.
    try {
      if (plus.next) chrome.alarms.create('ww-sched', { when: Math.max(Date.now() + 1000, plus.next + 500) });
      else await chrome.alarms.clear('ww-sched');
    } catch (e) {}
  }
  await syncShortsScript(p);
}

// ===========================================================================
// WebWell Plus: block schedules, strict focus, intent check, earn your break.
// Pure rules live in lib/plus-focus.js; this part only reads storage and acts.
// ===========================================================================
let lastSchedSig = null;   // which schedules were open at the last sync (null after a worker restart)

// The Plus additions to the blocking rules, or { extra: null } for free users (rules stay exactly free).
async function plusProtectExtras(r, p) {
  if (!(await plusActive())) { lastSchedSig = ''; return { extra: null, next: null }; }
  const now = new Date();
  const focusList = focusBlockList(p, r.categories || {});
  const open = activeSchedules(r.plusSchedules, now);
  const schedule = [], scheduleStrict = [];
  for (const s of open) (s.strict ? scheduleStrict : schedule).push(...scheduleSites(s, focusList));
  lastSchedSig = open.map(s => s.id).join(',');
  return { extra: { strict: strictLocked(r.lockin, now.getTime()), schedule, scheduleStrict },
    next: nextScheduleChange(r.plusSchedules, now) };
}

// Every minute: a safety net behind the alarms, which can be late or lost while the computer sleeps.
async function plusFocusTick() {
  if (!(await plusActive())) return;
  const r = await storeGet(['plusSchedules', 'lockin']);
  const l = r.lockin;
  // A strict session must always end on time, even if its alarm never fired. Nobody stays locked in.
  if (l && l.strict && l.phase === 'focus' && l.pausedLeft == null && l.endsAt && l.endsAt <= Date.now()) await finishLockinPhase();
  const sig = activeSchedules(r.plusSchedules, new Date()).map(s => s.id).join(',');
  if (sig !== lastSchedSig) await syncProtectRules();
}

function listedIn(host, list) { return !!host && (list || []).some(d => d && (host === d || host.endsWith('.' + d))); }

// What the blocked page needs to offer the Plus extras for this address.
async function plusBlockedInfo(url) {
  if (!(await plusActive())) return { plus: false };
  const host = domainOf(url) || '';
  const r = await storeGet(['protect', 'categories', 'lockin', 'plusSchedules', 'plusEarn', 'plusFocusPrefs']);
  const now = new Date();
  const p = protectState(r.protect);
  const focusList = focusBlockList(p, r.categories || {});
  const open = activeSchedules(r.plusSchedules, now).filter(s => listedIn(host, scheduleSites(s, focusList)));
  const pick = open.find(s => s.strict) || open[0];
  const strictFocus = strictLocked(r.lockin, now.getTime());
  return {
    plus: true,
    intent: focusPrefs(r.plusFocusPrefs).intent,
    bank: earnBank(r.plusEarn, dayKey(now.getTime())),
    strictFocus,
    strict: (strictFocus && r.lockin.block !== false && listedIn(host, r.lockin.strictList)) || !!(pick && pick.strict),
    schedule: pick ? { name: pick.name, until: scheduleUntil(pick, now).getTime(), strict: !!pick.strict } : null
  };
}

async function saveIntent(host, text, allowedMins) {
  if (!host || !(await plusActive())) return;
  const t = intentClean(text);
  if (!t) return;
  const r = await storeGet(['plusIntents']);
  await storeSet({ plusIntents: intentAdd(r.plusIntents, { ts: Date.now(), domain: host, text: t, allowedMins: Math.round(allowedMins) }) });
}

// Spend today's banked minutes on one site. Strict blocks stay shut: nothing opens those early.
async function earnUse(url, intentText) {
  if (!chrome.declarativeNetRequest || !(await plusActive())) return { ok: false };
  const host = domainOf(url);
  if (!host) return { ok: false };
  const r = await storeGet(['protect', 'categories', 'lockin', 'plusSchedules', 'plusEarn']);
  const now = new Date(), today = dayKey(now.getTime());
  if (earnBank(r.plusEarn, today) < 1) return { ok: false, error: 'none' };
  if (strictLocked(r.lockin, now.getTime())) return { ok: false, error: 'strict' };
  const p = protectState(r.protect);
  const focusList = focusBlockList(p, r.categories || {});
  const open = activeSchedules(r.plusSchedules, now);
  if (listedIn(host, open.filter(s => s.strict).flatMap(s => scheduleSites(s, focusList)))) return { ok: false, error: 'strict' };
  const spend = earnSpend(r.plusEarn, today);
  const lists = p.blocklist.map(normalizeHost).filter(Boolean).concat(focusList, open.flatMap(s => scheduleSites(s, focusList)));
  if (!(await allowHost(host, lists, spend.used * 60000, RULE_PRIORITY.earnAllow))) return { ok: false };
  await storeSet({ plusEarn: spend.bank });
  if (intentText) { try { await saveIntent(host, intentText, spend.used); } catch (e) {} }
  return { ok: true, mins: spend.used };
}

const SHORTS_SCRIPT_ID = 'ww-shortform';
const SHORTS_MATCHES = ['https://*.youtube.com/*', 'https://*.instagram.com/*', 'https://*.facebook.com/*', 'https://*.snapchat.com/*'];
async function syncShortsScript(p) {
  if (!chrome.scripting) return;
  let registered = [];
  try { registered = await chrome.scripting.getRegisteredContentScripts({ ids: [SHORTS_SCRIPT_ID] }); } catch (e) {}
  let granted = false;
  try { granted = await chrome.permissions.contains(ALL_URLS); } catch (e) {}
  const want = shortsScriptNeeded(p) && granted;
  try {
    if (want && !registered.length) {
      await chrome.scripting.registerContentScripts([{
        id: SHORTS_SCRIPT_ID, js: ['content/shortform.js'], matches: SHORTS_MATCHES,
        runAt: 'document_start', allFrames: false, persistAcrossSessions: true
      }]);
    } else if (!want && registered.length) {
      await chrome.scripting.unregisterContentScripts({ ids: [SHORTS_SCRIPT_ID] });
    }
  } catch (e) {}
}

// The blocked/pause pages are reached by a redirect, so they ask here which
// address the tab was trying to open.
let navHooked = false;
function hookNavigation() {
  if (navHooked || !chrome.webNavigation) return;
  navHooked = true;
  chrome.webNavigation.onBeforeNavigate.addListener(d => {
    if (d.frameId !== 0 || !/^https?:/.test(d.url)) return;
    chrome.storage.session.set({ ['nav' + d.tabId]: d.url }).catch(() => {});
  });
}
hookNavigation();
// Tracking is optional: the moment it is allowed, start counting without a restart.
chrome.permissions.onAdded.addListener(() => serialized(async () => { hookNavigation(); await resync(); }));
chrome.permissions.onRemoved.addListener(() => serialized(async () => { await stopSession(); }));
chrome.tabs.onRemoved.addListener(tabId => { chrome.storage.session.remove('nav' + tabId).catch(() => {}); });
async function lastNavFor(tabId) {
  if (tabId == null) return '';
  try { return (await chrome.storage.session.get('nav' + tabId))['nav' + tabId] || ''; } catch (e) { return ''; }
}

async function countBlock(reason) {
  const key = dayKey(Date.now());
  const r = await storeGet(['protectStats']);
  const stats = r.protectStats || {};
  const day = stats[key] || {};
  day[reason] = (day[reason] || 0) + 1;
  stats[key] = day;
  const keys = Object.keys(stats).sort();
  while (keys.length > 60) delete stats[keys.shift()];
  await storeSet({ protectStats: stats });
}

// Mindful pause: "Continue" opens the site and lets it through for 10 minutes.
const PAUSE_ALLOW_MS = 10 * 60 * 1000;
async function allowAfterPause(url) {
  if (!chrome.declarativeNetRequest) return false;
  const host = domainOf(url);
  if (!host) return false;
  const cats = await getCategories();
  return allowHost(host, distractingDomains(cats), PAUSE_ALLOW_MS, RULE_PRIORITY.pauseAllow);
}
// A temporary allow rule for one site, lifted by expirePauseAllows(). The rule names the listed
// domain that matched (so every page of reddit.com opens, not only the one asked for).
// The priority decides what it can open: the pause only (pauseAllow) or normal blocks too (earnAllow).
async function allowHost(host, list, ms, priority) {
  let d = host, match = null;
  while (d) {
    if (list.includes(d)) { match = d; break; }
    const i = d.indexOf('.');
    if (i < 0) break;
    d = d.slice(i + 1);
  }
  if (!match) match = host;
  const sess = await chrome.declarativeNetRequest.getSessionRules();
  const same = sess.find(x => x.condition && x.condition.requestDomains && x.condition.requestDomains[0] === match);
  const id = same ? same.id : Math.max(RULE_IDS.pauseAllow - 1, ...sess.map(x => x.id)) + 1;
  const r = await chrome.storage.session.get('pauseAllows');
  const allows = r.pauseAllows || {};
  // Re-allowing a site that is already open never shortens or weakens what it already had.
  const keepUntil = same && same.priority > priority ? (allows[id] || 0) : 0;
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [id],
    addRules: [{ id, priority: same ? Math.max(same.priority || 0, priority) : priority, action: { type: 'allow' },
      condition: { requestDomains: [match], resourceTypes: ['main_frame'] } }]
  });
  allows[id] = Math.max(keepUntil, Date.now() + ms);
  await chrome.storage.session.set({ pauseAllows: allows });
  return true;
}
async function expirePauseAllows() {
  if (!chrome.declarativeNetRequest) return;
  const r = await chrome.storage.session.get('pauseAllows');
  const allows = r.pauseAllows || {};
  const now = Date.now();
  const gone = Object.keys(allows).filter(id => allows[id] <= now).map(Number);
  if (!gone.length) return;
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: gone });
  gone.forEach(id => delete allows[id]);
  await chrome.storage.session.set({ pauseAllows: allows });
}

// ===========================================================================
// Focus sessions: timer state machine. Pages send ops; this is the only
// writer of `lockin`, so the timer, the badge and blocking always agree.
//   focus -> (break) -> done      (done = summary shown on the new tab)
// ===========================================================================
async function getLockin() { return (await storeGet(['lockin'])).lockin || null; }

function lockinLeft(l) {
  if (!l) return 0;
  if (l.pausedLeft != null) return l.pausedLeft;
  return Math.max(0, (l.endsAt || 0) - Date.now());
}

async function lockinOp(msg) {
  const l = await getLockin();
  const now = Date.now();
  // Plus strict focus: while it runs, nothing ends, pauses or replaces the session early, whichever
  // page asks. strictLocked() is false for anything odd or overdue, so this can never trap anyone.
  const strictOn = strictLocked(l, now) && await plusActive();
  if (strictOn && (msg.op === 'start' || msg.op === 'pause' || msg.op === 'end' || msg.op === 'dismiss')) return { refused: 'strict' };
  switch (msg.op) {
    case 'start': {
      const mins = Math.max(1, Math.min(240, msg.mins | 0 || LOCKIN_DEFAULTS.mins));
      const next = {
        phase: 'focus', task: String(msg.task || '').slice(0, 120), mins,
        breakMins: Math.max(0, Math.min(30, msg.breakMins == null ? LOCKIN_DEFAULTS.breakMins : msg.breakMins | 0)),
        totalMs: mins * 60000, startedAt: now, endsAt: now + mins * 60000, pausedLeft: null,
        sound: String(msg.sound || 'none'), block: msg.block !== false
      };
      if (msg.preset) next.preset = String(msg.preset).slice(0, 24);
      if (msg.strict && await plusActive()) {
        next.strict = true;
        // Freeze what is blocked right now (focus list + always-blocked), so edits made during the
        // session cannot open anything until the timer ends.
        if (next.block) {
          const r = await storeGet(['protect', 'categories']);
          const p = protectState(r.protect);
          next.strictList = [...new Set(focusBlockList(p, r.categories || {}).concat(p.blocklist.map(normalizeHost).filter(Boolean)))];
        }
      }
      await storeSet({ lockin: next });
      break;
    }
    case 'emergency':   // the strict session's safety valve: the user typed the phrase on purpose
      if (!l || l.phase !== 'focus') break;
      if (!strictPhraseOk(msg.phrase)) return { refused: 'phrase' };
      await completeFocus(l, Math.max(0, (l.totalMs || 0) - lockinLeft(l)), false, { emergency: true });
      break;
    case 'pause':
      if (l && l.phase === 'focus' && l.pausedLeft == null) await storeSet({ lockin: Object.assign(l, { pausedLeft: lockinLeft(l), endsAt: null }) });
      break;
    case 'resume':
      if (l && l.pausedLeft != null) await storeSet({ lockin: Object.assign(l, { endsAt: now + l.pausedLeft, pausedLeft: null }) });
      break;
    case 'add':
      if (l && (l.phase === 'focus' || l.phase === 'break')) {
        const add = 5 * 60000;
        if (l.pausedLeft != null) l.pausedLeft += add; else l.endsAt += add;
        l.totalMs = (l.totalMs || 0) + add;
        await storeSet({ lockin: l });
      }
      break;
    case 'end':        // stop early: keep the minutes actually focused
      if (l && l.phase === 'focus') await completeFocus(l, Math.max(0, (l.totalMs || 0) - lockinLeft(l)), false);
      else if (l && l.phase === 'break') await storeSet({ lockin: { phase: 'done', doneMins: l.doneMins || 0, doneAt: now } });
      break;
    case 'dismiss':
      await chrome.storage.local.remove('lockin');
      break;
  }
}

async function completeFocus(l, focusedMs, finished, opts) {
  const mins = Math.round(focusedMs / 60000);
  const emergency = !!(opts && opts.emergency);
  const key = dayKey(Date.now());
  if (mins >= 1 || emergency) {
    const r = await storeGet(['focusLog']);
    const log = r.focusLog || {};
    const day = log[key] || { mins: 0, sessions: 0 };
    if (mins >= 1) { day.mins += mins; day.sessions += 1; }
    if (emergency) day.emergencyExits = (day.emergencyExits || 0) + 1;   // Plus strict mode: kept honest in the record
    log[key] = day;
    const keys = Object.keys(log).sort();
    while (keys.length > 120) delete log[keys.shift()];
    await storeSet({ focusLog: log });
  }
  // Plus: a session that ran to the end earns break minutes.
  let earned = 0;
  if (finished && mins >= 1) {
    try {
      if (await plusActive()) {
        const r = await storeGet(['plusEarn', 'plusFocusPrefs']);
        const c = earnCredit(r.plusEarn, key, mins, r.plusFocusPrefs);
        earned = c.gained;
        if (earned) await storeSet({ plusEarn: c.bank });
      }
    } catch (e) {}
  }
  const earnedText = earned ? ' You earned ' + earned + ' break minute' + (earned === 1 ? '' : 's') + '.' : '';
  const plusFields = Object.assign({}, earned ? { earned } : {}, emergency ? { emergency: true } : {});
  stopPlayerSound();
  const now = Date.now();
  if (finished && l.breakMins > 0) {
    notify('lockin-' + now, {
      type: 'basic', iconUrl: 'icons/icon128.png', title: 'Session complete',
      message: mins + ' minutes focused. Take a ' + l.breakMins + '-minute break.' + earnedText
    });
    await storeSet({ lockin: Object.assign({ phase: 'break', task: l.task, mins: l.mins, breakMins: l.breakMins, doneMins: mins,
      totalMs: l.breakMins * 60000, startedAt: now, endsAt: now + l.breakMins * 60000, pausedLeft: null, block: false }, plusFields) });
  } else {
    if (finished) {
      notify('lockin-' + now, {
        type: 'basic', iconUrl: 'icons/icon128.png', title: 'Session complete', message: mins + ' minutes focused. Nice work.' + earnedText
      });
    }
    await storeSet({ lockin: Object.assign({ phase: 'done', doneMins: mins, doneAt: now }, plusFields) });
  }
}

async function finishLockinPhase() {
  const l = await getLockin();
  if (!l || !l.endsAt) return;
  if (l.endsAt - Date.now() > 1500) { scheduleLockin(); return; } // stale alarm
  if (l.phase === 'focus') {
    await completeFocus(l, l.totalMs || l.mins * 60000, true);
  } else if (l.phase === 'break') {
    notify('lockin-break-' + Date.now(), {
      type: 'basic', iconUrl: 'icons/icon128.png', title: 'Break’s over', message: 'Ready for another focus session?'
    });
    await storeSet({ lockin: { phase: 'done', doneMins: l.doneMins || 0, doneAt: Date.now() } });
  }
}

async function scheduleLockin() {
  try {
    await chrome.alarms.clear('lockin-end');
    const l = await getLockin();
    if (l && (l.phase === 'focus' || l.phase === 'break') && l.endsAt && l.pausedLeft == null) {
      chrome.alarms.create('lockin-end', { when: Math.max(Date.now() + 500, l.endsAt) });
    }
  } catch (e) {}
  await updateBadge();
}

async function updateBadge() {
  const l = await getLockin();
  let text = '', color = '#e8553f';
  if (l && (l.phase === 'focus' || l.phase === 'break')) {
    text = l.pausedLeft != null ? '||' : Math.max(1, Math.ceil(lockinLeft(l) / 60000)) + 'm';
    if (l.phase === 'break') color = '#1a9e6b';
  }
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    await chrome.action.setBadgeText({ text });
  } catch (e) {}
}

function stopPlayerSound() {
  const stop = () => {
    const p = chrome.runtime.sendMessage({ target: 'ww-player', cmd: 'stop-all' });
    if (p && p.catch) p.catch(() => {});   // no player open: nothing to stop
  };
  if (chrome.offscreen && chrome.offscreen.hasDocument) {
    chrome.offscreen.hasDocument().then(has => { if (has) stop(); }).catch(() => {});
  } else stop();
}

// A worker restart re-runs this file with wiped module flags. Refresh the
// true state immediately (rather than trusting the optimistic defaults until
// the next alarm tick) so a tab event arriving first can't start a phantom
// session in an unfocused/idle window.
serialized(resync);
