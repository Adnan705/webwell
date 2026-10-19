// WebWell popup: today's quick view.
'use strict';

// MV3 CSP blocks inline onerror handlers — hide broken favicons via capture-phase listener.
document.addEventListener('error', e => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.dataset && t.dataset.domain) t.style.visibility = 'hidden';
}, true);

function productivityScore(data, cats) {
  let w = 0, t = 0;
  for (const d of Object.keys(data.domains)) {
    const secs = data.domains[d];
    w += CATEGORY_META[categoryOf(d, cats)].score * secs;
    t += secs;
  }
  return t ? Math.round(w / t) : 0;
}

async function render() {
  const key = dayKey(Date.now());
  document.getElementById('dateLine').textContent =
    new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  // One storage read + the live-session ping, in parallel (was 3 sequential reads).
  const livePromise = chrome.runtime.sendMessage({ type: 'webwell-live' }).catch(() => null);
  const r = await storeGet(['days', 'categories', 'settings']);
  const settings = Object.assign({ trackingEnabled: true, darkMode: false }, r.settings || {});
  const cats = r.categories || {};
  const data = (r.days || {})[key] || { domains: {}, visits: {}, hourly: {}, total: 0 };
  document.body.classList.toggle('dark', !!settings.darkMode);
  setPauseButton(settings.trackingEnabled);

  const res = await livePromise;
  const live = res && res.live;
  const total = data.total + (live ? live.elapsed : 0);

  const entries = Object.keys(data.domains).map(d => ({
    domain: d,
    secs: data.domains[d] + (live && live.domain === d ? live.elapsed : 0),
    visits: data.visits[d] || 0,
    cat: categoryOf(d, cats)
  })).sort((a, b) => b.secs - a.secs);
  if (live && !data.domains[live.domain]) {
    entries.push({ domain: live.domain, secs: live.elapsed, visits: 1, cat: categoryOf(live.domain, cats) });
    entries.sort((a, b) => b.secs - a.secs);
  }

  const score = productivityScore({ domains: Object.fromEntries(entries.map(e => [e.domain, e.secs])) }, cats);
  const split = { productive: 0, neutral: 0, distracting: 0 };
  entries.forEach(e => { split[e.cat] = (split[e.cat] || 0) + e.secs; });
  const sTotal = split.productive + split.neutral + split.distracting;

  let html = '';
  if (!settings.trackingEnabled) {
    html += '<div class="paused"><span>Tracking is paused.</span><button id="resumeBtn">Resume</button></div>';
  }
  html += '<div class="card hero">' + svgScoreRing(score, 104) +
    '<div><div class="big">' + fmtDur(total) + '</div>' +
    '<div class="cap">tracked today across ' + entries.length + ' sites</div>' +
    (live ? '<div class="live"><span class="dot"></span>Now: ' + esc(live.domain) + '</div>' : '') +
    '</div></div>';

  if (sTotal > 0) {
    const seg = c => '<i style="width:' + (split[c] / sTotal * 100).toFixed(1) + '%;background:' + CATEGORY_META[c].color + '" title="' +
      CATEGORY_META[c].label + ' · ' + fmtDur(split[c]) + '"></i>';
    html += '<div class="split"><div class="split-bar">' + seg('productive') + seg('neutral') + seg('distracting') + '</div>' +
      '<div class="split-leg">' + ['productive', 'neutral', 'distracting'].map(c =>
        '<span><b style="background:' + CATEGORY_META[c].color + '"></b>' + CATEGORY_META[c].label + ' ' + Math.round(split[c] / sTotal * 100) + '%</span>').join('') +
      '</div></div>';
  }

  html += '<div class="card"><h4>Top sites today</h4>';
  if (!entries.length) {
    html += '<div class="empty">No browsing tracked yet today. It starts counting as you browse.</div>';
  } else {
    html += entries.slice(0, 5).map(e =>
      '<div class="site"><span class="cat-dot" style="background:' + CATEGORY_META[e.cat].color + '" title="' + CATEGORY_META[e.cat].label + '"></span>' +
      iconImg(e.domain, 18) +
      '<span class="nm">' + esc(e.domain) + '</span><span class="tm">' + fmtDur(e.secs) + '</span></div>'
    ).join('');
  }
  html += '</div>';

  document.getElementById('main').innerHTML = html;
  const rb = document.getElementById('resumeBtn');
  if (rb) rb.addEventListener('click', () => setTracking(true));
}

function setPauseButton(on) {
  const b = document.getElementById('pauseBtn');
  b.innerHTML = on
    ? '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1.5" width="3" height="9" rx="1"/><rect x="7" y="1.5" width="3" height="9" rx="1"/></svg>'
    : '<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.8v8.4a.6.6 0 0 0 .9.5l6.7-4.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5z"/></svg>';
  b.title = on ? 'Pause tracking' : 'Resume tracking';
  b.setAttribute('aria-label', b.title);
  b.classList.toggle('off', !on);
}

async function setTracking(on) {
  const st = await getSettings();
  st.trackingEnabled = on;
  await storeSet({ settings: st });   // background reacts instantly (storage.onChanged)
  render();
}
document.getElementById('pauseBtn').addEventListener('click', async () => {
  const st = await getSettings();
  setTracking(!st.trackingEnabled);
});

document.getElementById('openDash').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  window.close();
});

render();

// ---- mini music controller: talks to the offscreen player ----
let popUI = { playing: false, tab: 'radio', title: 'Lofi Focus Radio', sub: 'Tap play to start', art: '../newtab/img/lofi-disc.webp' };

async function popEnsurePlayer() {
  try { await chrome.runtime.sendMessage({ type: 'ww-ensure-player' }); } catch (e) {}
}
async function popPlayerExists() {
  try { return !!(chrome.offscreen && await chrome.offscreen.hasDocument()); } catch (e) { return false; }
}
async function popSend(msg) {
  await popEnsurePlayer();
  let lastErr;
  for (let i = 0; i < 5; i++) {
    try {
      return await chrome.runtime.sendMessage(Object.assign({ target: 'ww-player' }, msg));
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 120 * (i + 1))); }
  }
  throw lastErr;
}
function applyPopUI(ui) {
  if (!ui) return;
  popUI = ui;
  const art = document.getElementById('popArt');
  art.src = ui.art || '../newtab/img/lofi-disc.webp';
  art.classList.toggle('spinning', !!ui.playing);
  document.getElementById('popTitle').textContent = ui.title || 'Lofi Focus Radio';
  document.getElementById('popSub').textContent = ui.sub || '';
  document.getElementById('popToggle').textContent = ui.playing ? '⏸' : '▶';
}
document.getElementById('popToggle').addEventListener('click', () => {
  popSend({ cmd: popUI.tab === 'soundcloud' ? 'sc-toggle' : 'radio-toggle' }).catch(() => {});
});
document.getElementById('popNext').addEventListener('click', () => {
  popSend({ cmd: popUI.tab === 'soundcloud' ? 'sc-next' : 'station-next' }).catch(() => {});
});
document.getElementById('popPrev').addEventListener('click', () => {
  popSend({ cmd: popUI.tab === 'soundcloud' ? 'sc-prev' : 'station-prev' }).catch(() => {});
});
chrome.runtime.onMessage.addListener(msg => {
  if (msg && msg.target === 'ww-player-ui') applyPopUI(msg.ui);
});
// FIX: don't spawn the player just because the popup opened.
popPlayerExists().then(has => has ? popSend({ cmd: 'get-state' }) : null)
  .then(st => { if (st && st.ui) applyPopUI(st.ui); }).catch(() => {});
