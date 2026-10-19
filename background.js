// WebWell background service worker: tracks active-tab time per domain.
'use strict';
importScripts('lib/time.js', 'lib/categories.js', 'lib/ai.js');

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
    return await chrome.idle.queryState(s.idleTimeout);
  } catch (e) { return 'active'; }
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
  if (alarm.name !== 'webwell-tick') return;
  await resync(); // restarts the session if the worker was killed mid-session
  await flush();  // banks the elapsed time
  // Each check is isolated: one throwing must not skip the rest this minute.
  try { await checkLimits(); } catch (e) {}
  try { await checkMilestones(); } catch (e) {}
  try { await checkForecastNudge(); } catch (e) {}
}));

async function checkLimits() {
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
      chrome.notifications.create('limit-' + d + '-' + key, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'WebWell: time limit reached',
        message: 'You have spent ' + fmtDur(spent) + ' on ' + d + ' today (limit ' + limits[d] + 'm). Time to move on?'
      });
    }
  }
}

async function checkMilestones() {
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
    chrome.notifications.create('milestone-distracting-' + key, {
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
      chrome.notifications.create('forecast-' + todayK, {
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
chrome.runtime.onInstalled.addListener((details) => serialized(async () => {
  const settings = await getSettings();
  chrome.idle.setDetectionInterval(settings.idleTimeout);
  chrome.alarms.create('webwell-tick', { periodInMinutes: 1 });
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  }
  await resync();
}));

chrome.runtime.onStartup.addListener(() => serialized(async () => {
  const settings = await getSettings();
  chrome.idle.setDetectionInterval(settings.idleTimeout);
  chrome.alarms.create('webwell-tick', { periodInMinutes: 1 });
  await resync();
}));

// Only the service worker can reliably create the offscreen music player.
// The new tab / popup ask for it here instead of each calling
// chrome.offscreen themselves (which raced and threw "only a single
// offscreen document" errors).
// Pause/resume or idle-timeout changes made in the popup/dashboard apply at once
// (before, they waited for the next tab event or the 1-minute alarm).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  serialized(async () => {
    const s = await getSettings();
    try { chrome.idle.setDetectionInterval(Math.max(15, s.idleTimeout || 60)); } catch (e) {}
    await resync();
  });
});

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
  return false;
});

// A worker restart re-runs this file with wiped module flags. Refresh the
// true state immediately (rather than trusting the optimistic defaults until
// the next alarm tick) so a tab event arriving first can't start a phantom
// session in an unfocused/idle window.
serialized(resync);
