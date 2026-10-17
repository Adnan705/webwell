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
    const key = dayKey(now);
    const data = await getDay(key);
    data.domains[current.domain] = (data.domains[current.domain] || 0) + gapSecs;
    data.total += gapSecs;
    const hr = new Date(now).getHours();
    data.hourly[hr] = (data.hourly[hr] || 0) + gapSecs;
    await setDay(key, data);
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
chrome.tabs.onActivated.addListener(async () => {
  await loadSession();
  const settings = await getSettings();
  if (!settings.trackingEnabled || !windowFocused || idleState !== 'active') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const domain = tab ? domainOf(tab.url) : null;
  if (domain) await startSession(domain, true);
  else await stopSession();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!tab.active || changeInfo.status !== 'complete') return;
  await loadSession();
  const settings = await getSettings();
  if (!settings.trackingEnabled || !windowFocused || idleState !== 'active') return;
  const domain = domainOf(tab.url);
  if (domain) await startSession(domain, false); // same-tab navigation isn't a new "visit"
  else await stopSession();
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  await loadSession();
  windowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  await resync();
});

chrome.idle.onStateChanged.addListener(async (state) => {
  await loadSession();
  idleState = state; // 'active' | 'idle' | 'locked'
  await resync();
});

// ---- periodic heartbeat: re-establish truth, flush, check limits ----
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'webwell-tick') return;
  await resync(); // restarts the session if the worker was killed mid-session
  await flush();  // banks the elapsed time
  await checkLimits();
  await checkMilestones();
  await checkForecastNudge();
});

async function checkLimits() {
  const limits = await getLimits();
  const domains = Object.keys(limits);
  if (!domains.length) return;
  const key = dayKey(Date.now());
  const data = await getDay(key);
  const r = await storeGet(['notifiedLimits']);
  const notified = r.notifiedLimits || {};
  if (notified.day !== key) { notified.day = key; notified.domains = []; }
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
    await storeSet({ forecastNudge: { day: todayK } });
    chrome.notifications.create('forecast-' + todayK, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'WebWell forecast 🔮',
      message: 'Your ' + hourLabel(f.slumpHour) + ' slump is coming (usually ' +
        fmtDurShort(Math.round(f.slumpAvg)) + ' of distractions). How about a focus session instead?'
    });
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const settings = await getSettings();
  chrome.idle.setDetectionInterval(settings.idleTimeout);
  chrome.alarms.create('webwell-tick', { periodInMinutes: 1 });
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  }
  await resync();
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  chrome.idle.setDetectionInterval(settings.idleTimeout);
  chrome.alarms.create('webwell-tick', { periodInMinutes: 1 });
  await resync();
});

// Dashboard/popup ask for the live session so "right now" is accurate.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
