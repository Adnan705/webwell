// WebWell popup: today's quick view.
'use strict';

// MV3 CSP blocks inline onerror handlers — hide broken favicons via capture-phase listener.
document.addEventListener('error', e => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && String(t.src || '').indexOf('google.com/s2/favicons') !== -1) {
    t.style.display = 'none';
  }
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
  const settings = await getSettings();
  document.getElementById('dateLine').textContent =
    new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const key = dayKey(Date.now());
  const data = await getDay(key);
  const cats = await getCategories();

  // fold in the live session so "right now" is accurate
  let live = null;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'webwell-live' });
    live = res && res.live;
  } catch (e) { /* background asleep */ }
  const total = data.total + (live ? live.elapsed : 0);

  const entries = Object.keys(data.domains).map(d => ({
    domain: d,
    secs: data.domains[d] + (live && live.domain === d ? live.elapsed : 0),
    visits: data.visits[d] || 0,
    cat: categoryOf(d, cats)
  })).sort((a, b) => b.secs - a.secs);

  const score = productivityScore({ domains: Object.fromEntries(entries.map(e => [e.domain, e.secs])) }, cats);

  let html = '';
  if (!settings.trackingEnabled) {
    html += '<div class="paused">Tracking is paused. Resume it in the dashboard settings.</div>';
  }
  html += '<div class="card hero">' + svgScoreRing(score, 104) +
    '<div><div class="big">' + fmtDur(total) + '</div>' +
    '<div class="cap">tracked today across ' + entries.length + ' sites</div>' +
    (live ? '<div class="live"><span class="dot"></span>Now: ' + esc(live.domain) + '</div>' : '') +
    '</div></div>';

  html += '<div class="card"><h4>Top sites today</h4>';
  if (!entries.length) {
    html += '<div style="color:var(--mut);font-size:13px">No browsing tracked yet today. It starts counting as you browse.</div>';
  } else {
    html += entries.slice(0, 5).map(e =>
      '<div class="site"><span class="cat-dot" style="background:' + CATEGORY_META[e.cat].color + '" title="' + CATEGORY_META[e.cat].label + '"></span>' +
      '<img src="' + faviconUrl(e.domain) + '" alt="">' +
      '<span class="nm">' + esc(e.domain) + '</span><span class="tm">' + fmtDur(e.secs) + '</span></div>'
    ).join('');
  }
  html += '</div>';

  document.getElementById('main').innerHTML = html;
}

document.getElementById('openDash').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  window.close();
});

render();
