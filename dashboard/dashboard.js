// WebWell dashboard.
'use strict';

// ---------------------------------------------------------------------------
// Bug reports: paste your Google Form link or GitHub Issues URL here.
// Examples:
//   const BUG_REPORT_URL = 'https://forms.gle/xxxx';
//   const BUG_REPORT_URL = 'https://github.com/yourname/webwell/issues/new';
// Leave empty to disable the button until the link is set.
// ---------------------------------------------------------------------------
const BUG_REPORT_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSc3o1kfbSudJYkBzvkUIA0NCeifbXgTccBnzUps0IlZq1Exdg/viewform';

let viewingKey = dayKey(Date.now());
let siteFilter = 'all', siteQuery = '', trendDays = 14;

function isTodayKey(k) { return k === dayKey(Date.now()); }

async function getDayData(key) {
  const data = await getDay(key);
  if (isTodayKey(key)) {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'webwell-live' });
      const live = res && res.live;
      if (live) {
        data.domains[live.domain] = (data.domains[live.domain] || 0) + live.elapsed;
        data.total += live.elapsed;
      }
    } catch (e) { /* background asleep */ }
  }
  return data;
}

function entriesOf(data, cats) {
  return Object.keys(data.domains).map(d => ({
    domain: d, secs: data.domains[d], visits: data.visits[d] || 0,
    cat: categoryOf(d, cats)
  })).sort((a, b) => b.secs - a.secs);
}

function scoreOf(entries) {
  let w = 0, t = 0;
  for (const e of entries) { w += CATEGORY_META[e.cat].score * e.secs; t += e.secs; }
  return t ? Math.round(w / t) : 0;
}

function catTotals(entries) {
  const t = { productive: 0, neutral: 0, distracting: 0 };
  for (const e of entries) t[e.cat] += e.secs;
  return t;
}

function scoreVerdict(s) {
  if (s >= 75) return 'Excellent focus today.';
  if (s >= 55) return 'Solid day — room to trim distractions.';
  if (s >= 35) return 'Distractions are winning today.';
  return 'Rough day. Tomorrow is a reset.';
}

function shiftDay(n) {
  const d = new Date(viewingKey + 'T12:00:00');
  d.setDate(d.getDate() + n);
  viewingKey = dayKey(d.getTime());
  renderAll();
}

/* ---------------- OVERVIEW ---------------- */
let actCat = 'all', actQuery = '';
let animateWidgets = true; // draw/count-up animations: only on day change & first load

function countUp(el, target, fmt) {
  if (!animateWidgets || !(target > 0)) { el.textContent = fmt(target); return; }
  const t0 = performance.now(), dur = 900;
  (function fr(t) {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(target * e);
    if (p < 1) requestAnimationFrame(fr);
  })(t0);
}

function filterActivity(cat) {
  actCat = cat;
  animateWidgets = false;
  document.querySelectorAll('.fchip').forEach(x => x.classList.toggle('active', x.dataset.c === cat));
  renderOverview();
}

function sparkMini(vals, color, h, anim) {
  // small area sparkline, 300 x h viewBox
  h = h || 64;
  if (!vals || vals.length < 2) return '';
  const w = 300;
  const max = Math.max.apply(null, vals.concat([1]));
  const pts = vals.map((v, i) => (i / (vals.length - 1) * w).toFixed(1) + ',' + (h - 5 - (v / max) * (h - 12)).toFixed(1)).join(' ');
  return '<polygon class="' + (anim ? 'fade-grow' : '') + '" points="0,' + h + ' ' + pts + ' ' + w + ',' + h + '" fill="' + color + '" opacity="0.14"/>' +
    '<polyline pathLength="1" class="' + (anim ? 'draw-line' : '') + '" points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
}

function concentricSegs(segs, anim) {
  // segs: [{frac, color}] — nested rings like the reference's annual-profits chart.
  // Center is kept empty (total lives in the card's tag pill) so arcs can never
  // collide with a label.
  const cx = 86, cy = 86;
  let r = 74;
  return segs.map(function (sg) {
    const c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, sg.frac)));
    const arc = sg.frac > 0
      ? '<circle class="' + (anim ? 'draw-arc' : '') + '" style="--c:' + c.toFixed(1) + ';--off:' + off.toFixed(1) + '" cx="' + cx + '" cy="' + cy + '" r="' + r +
        '" fill="none" stroke="' + sg.color + '" stroke-width="13" stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>'
      : '';
    const el = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="rgba(140,140,150,.14)" stroke-width="13"/>' + arc;
    r -= 19;
    return el;
  }).join('');
}

function hourFmt(h) {
  if (h === 0) return '12am';
  if (h < 12) return h + 'am';
  if (h === 12) return '12pm';
  return (h - 12) + 'pm';
}

function renderActivity(entries, data) {
  const q = actQuery.trim().toLowerCase();
  let list = entries.slice(0, 12);
  if (actCat !== 'all') list = list.filter(e => e.cat === actCat);
  if (q) list = list.filter(e => e.domain.includes(q));
  document.getElementById('actCount').textContent = entries.length ? entries.length + ' sites' : '—';
  const max = Math.max.apply(null, entries.map(e => e.secs).concat([1]));
  document.getElementById('actList').innerHTML = list.length ? list.map(e =>
    '<div class="act-item">' +
    '<img src="' + faviconUrl(e.domain) + '" onerror="this.style.display=\'none\'" alt="">' +
    '<div style="min-width:0;flex:none;width:34%"><div class="a-t">' + esc(e.domain) + '</div>' +
    '<div class="a-s">' + e.visits + ' visits · ' + CATEGORY_META[e.cat].label + '</div></div>' +
    '<div class="act-bar"><div style="width:' + Math.max(3, Math.round(e.secs / max * 100)) + '%;background:' + CATEGORY_META[e.cat].color + '"></div></div>' +
    '<div class="act-val">' + fmtDur(e.secs) + '</div>' +
    '</div>').join('')
    : '<div class="empty">' + (entries.length ? 'No websites match.' : 'Nothing tracked this day.') + '</div>';
}

async function renderOverview() {
  const AW = animateWidgets; animateWidgets = false;
  const data = await getDayData(viewingKey);
  const cats = await getCategories();
  const entries = entriesOf(data, cats);
  const score = scoreOf(entries);
  const ct = catTotals(entries);
  const totalVisits = Object.values(data.visits).reduce((a, b) => a + b, 0);

  // yesterday delta
  const yd = new Date(viewingKey + 'T12:00:00'); yd.setDate(yd.getDate() - 1);
  const ydata = await getDay(dayKey(yd.getTime()));
  const delta = data.total - ydata.total;

  // hero
  const d = new Date(viewingKey + 'T12:00:00');
  document.getElementById('heroDateNum').textContent = d.getDate();
  document.getElementById('heroDayTitle').textContent = dayTitle();
  document.getElementById('todayDot').style.display = isTodayKey(viewingKey) ? 'none' : '';
  document.getElementById('heroSub').textContent = data.total > 0
    ? fmtDur(data.total) + ' across ' + entries.length + ' websites — tracked privately, on this device.'
    : 'No browsing tracked this day — tracked privately, on this device.';
  const dt = dayTitle();
  document.getElementById('scoreDay').textContent = dt;
  document.getElementById('splitDay').textContent = dt;

  // score card
  if (data.total > 0) countUp(document.getElementById('scoreNum'), score, v => Math.round(v));
  else document.getElementById('scoreNum').textContent = '–';
  document.getElementById('scoreVerdict').textContent = data.total > 0 ? scoreVerdict(score) : 'Browse a little and I\'ll score your focus.';
  document.getElementById('scoreVs').innerHTML = data.total > 60
    ? '<span class="' + (delta > 0 ? 'up' : 'down') + '" style="font-weight:700">' +
      (delta > 0 ? '▲ ' : '▼ ') + fmtDur(Math.abs(delta)) + '</span> vs yesterday'
    : '';

  // time split
  countUp(document.getElementById('splitProd'), ct.productive, fmtDur);
  countUp(document.getElementById('splitDist'), ct.distracting, fmtDur);
  document.getElementById('splitProdSub').textContent = data.total ? pct(ct.productive, data.total) + '% of browsing' : '';
  document.getElementById('splitDistSub').textContent = data.total ? pct(ct.distracting, data.total) + '% of browsing' : '';

  // score donut (reference-style black ring + coral arc)
  document.getElementById('scoreDonut').innerHTML =
    svgScoreRing(data.total > 0 ? score : 0, 128, data.total > 0 ? score : '–', AW);
  document.getElementById('donutSub').textContent = data.total > 0 ? fmtDur(data.total) + ' total · ' + totalVisits + ' visits' : 'no data yet';

  // streak — last 13 days
  const r = await storeGet(['days']);
  const allDays = r.days || {};
  const last13 = [];
  for (let i = 12; i >= 0; i--) {
    const dd = new Date(viewingKey + 'T12:00:00'); dd.setDate(dd.getDate() - i);
    last13.push(dayKey(dd.getTime()));
  }
  const tracked = last13.filter(k => (allDays[k] || {}).total > 0);
  const streakTotal = tracked.reduce((a, k) => a + allDays[k].total, 0);
  countUp(document.getElementById('streakNum'), tracked.length, v => Math.round(v));
  document.getElementById('streakDots').innerHTML = last13.map((k, i) =>
    '<i class="' + (tracked.includes(k) ? 'on' : '') + (AW ? ' pop' : '') + '" style="animation-delay:' + (i * 45) + 'ms" title="' + k + '"></i>').join('');
  document.getElementById('streakSub').textContent = tracked.length ? fmtDur(streakTotal) + ' in 13 days' : 'Browse to start your streak';

  // week sparkline
  const weekVals = [];
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(viewingKey + 'T12:00:00'); dd.setDate(dd.getDate() - i);
    weekVals.push((allDays[dayKey(dd.getTime())] || {}).total || 0);
  }
  const weekTotal = weekVals.reduce((a, b) => a + b, 0);
  countUp(document.getElementById('weekTotal'), weekTotal, fmtDur);
  document.getElementById('weekSvg').innerHTML = sparkMini(weekVals, '#e8604c', 64, AW);
  document.getElementById('weekSub').textContent = 'Last 7 days ending ' + dt.toLowerCase();

  // categories — concentric rings
  const tot = data.total || 1;
  document.getElementById('catSvg').innerHTML = concentricSegs([
    { frac: ct.productive / tot, color: CATEGORY_META.productive.color },
    { frac: ct.neutral / tot, color: CATEGORY_META.neutral.color },
    { frac: ct.distracting / tot, color: CATEGORY_META.distracting.color },
  ], AW);
  document.getElementById('catTotal').textContent = data.total > 0 ? fmtDur(data.total) : '–';
  document.getElementById('catLegend').innerHTML = ['productive', 'neutral', 'distracting'].map(c =>
    '<span class="sub-mut leg-item' + (actCat === c ? ' sel' : '') + '" data-cat="' + c + '" title="Filter activity to ' +
    CATEGORY_META[c].label.toLowerCase() + ' sites"><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' +
    CATEGORY_META[c].color + ';margin-right:5px"></i>' + CATEGORY_META[c].label + ' · ' + fmtDur(ct[c]) + '</span>').join('');
  document.querySelectorAll('#catLegend .leg-item').forEach(elm =>
    elm.addEventListener('click', () => filterActivity(elm.dataset.cat)));

  // activity manager
  const as = document.getElementById('actSearch');
  if (document.activeElement !== as) as.value = actQuery;
  renderActivity(entries, data);

  // rhythm — 24h mini bars + peak hour
  let peakH = 0, peakV = 0;
  for (let h = 0; h < 24; h++) if ((data.hourly[h] || 0) > peakV) { peakV = data.hourly[h]; peakH = h; }
  document.getElementById('rhythmPeak').textContent = peakV > 0 ? hourFmt(peakH) : '–';
  const mx = Math.max.apply(null, Object.values(data.hourly || {}).concat([1]));
  document.getElementById('rhythmBars').innerHTML = Array.from({ length: 24 }, (_, h) => {
    const v = data.hourly[h] || 0;
    return '<div class="mb' + (h === peakH && v > 0 ? ' hot' : '') + (AW ? ' rise' : '') + '" style="height:' +
      Math.max(6, Math.round(v / mx * 100)) + '%;animation-delay:' + (h * 25) + 'ms" title="' + hourFmt(h) + ' — ' + fmtDur(v) + '"></div>';
  }).join('');
  document.getElementById('rhythmSub').textContent = peakV > 0 ? fmtDur(peakV) + ' at peak' : 'no hourly data';

  // insights
  document.getElementById('insights').innerHTML = await insightsHtml(entries, data, ydata, cats);

  // forecast — slump + golden hour from the last 14 days
  try {
    const fr = await storeGet(['days']);
    const f = computeForecast(fr.days || {}, cats);
    const fb = document.getElementById('forecastBody');
    if (fb) {
      if (f.daysUsed < 3 || (f.slumpHour < 0 && f.goldenHour < 0)) {
        fb.innerHTML = '<span class="sub-mut">Not enough history yet — your forecast appears after a few days of tracking.</span>';
      } else {
        let html = '<div class="forecast-line">';
        if (f.slumpHour >= 0) {
          html += '<span class="fchip-stat">📉 Slump around <b>' + hourLabel(f.slumpHour) + '</b> ' +
            '<span class="sub-mut">· avg ' + fmtDurShort(Math.round(f.slumpAvg)) + ' distractions</span></span>';
        }
        if (f.goldenHour >= 0 && f.goldenHour !== f.slumpHour) {
          html += '<span class="fchip-stat">🥇 Golden hour <b>' + hourLabel(f.goldenHour) + '</b> ' +
            '<span class="sub-mut">· avg ' + fmtDurShort(Math.round(f.goldenAvg)) + ' focused</span></span>';
        }
        html += '</div><div class="sub-mut" style="margin-top:10px">Based on your last ' + f.daysUsed +
          ' days. Get a 15-minute warning before the slump in Settings → Tracking.</div>';
        fb.innerHTML = html;
      }
    }
  } catch (e) { /* forecast is best-effort */ }
}

function statCard(label, num, cap, extra) {
  return '<div class="card stat"><h3>' + label + '</h3><div class="num">' + num + '</div>' +
    '<div class="cap">' + cap + '</div>' + (extra || '') + '</div>';
}

async function insightsHtml(entries, data, ydata, cats) {
  const out = [];
  if (!entries.length) return '<div class="empty">Browse a little and insights will appear here.</div>';

  const top = entries[0];
  const topDistracting = entries.find(e => e.cat === 'distracting');
  if (topDistracting && topDistracting.secs >= 15 * 60) {
    out.push(warn('⚠️', '<b>' + esc(topDistracting.domain) + '</b> ate <b>' + fmtDur(topDistracting.secs) + '</b> — ' +
      pct(topDistracting.secs, data.total) + '% of your browsing today. That is your biggest time sink.'));
  }
  const topProd = entries.find(e => e.cat === 'productive');
  if (topProd && topProd.secs >= 20 * 60) {
    out.push(info('🎯', 'Most productive stretch: <b>' + fmtDur(topProd.secs) + '</b> on <b>' + esc(topProd.domain) + '</b>.'));
  }
  // late night
  let late = 0;
  for (const h of [23, 0, 1, 2, 3]) late += (data.hourly[h] || 0);
  if (late >= 30 * 60) out.push(warn('🌙', '<b>' + fmtDur(late) + '</b> of browsing happened late at night (11pm–4am).'));
  // new sites vs yesterday
  const yDomains = new Set(Object.keys(ydata.domains || {}));
  const fresh = entries.filter(e => !yDomains.has(e.domain) && e.secs >= 5 * 60);
  if (fresh.length) out.push(info('🆕', '<b>' + fresh.length + '</b> new site' + (fresh.length > 1 ? 's' : '') +
    ' crossed 5 minutes today: ' + fresh.slice(0, 3).map(e => '<b>' + esc(e.domain) + '</b>').join(', ') + '.'));
  // peak hour
  let peakH = 0, peakV = 0;
  for (let h = 0; h < 24; h++) if ((data.hourly[h] || 0) > peakV) { peakV = data.hourly[h]; peakH = h; }
  if (peakV >= 15 * 60) out.push(info('📈', 'Peak browsing hour: <b>' + peakH + ':00</b> with ' + fmtDur(peakV) + '.'));
  // distracting share
  const ct = catTotals(entries);
  const dShare = pct(ct.distracting, data.total);
  if (dShare >= 40 && data.total >= 60 * 60) {
    out.push(warn('🚨', '<b>' + dShare + '%</b> of today went to distracting sites. Consider a daily limit — set one in the Websites tab.'));
  } else if (dShare < 20 && data.total >= 60 * 60) {
    out.push(info('✅', 'Only <b>' + dShare + '%</b> went to distractions. Focused day — keep it up.'));
  }
  if (!out.length) out.push(info('💡', '<b>' + esc(top.domain) + '</b> leads today at ' + fmtDur(top.secs) + ' across ' + top.visits + ' visits.'));
  return out.join('');
}
function warn(ic, html) { return '<div class="insight warn"><span class="ic">' + ic + '</span><span>' + html + '</span></div>'; }
function info(ic, html) { return '<div class="insight"><span class="ic">' + ic + '</span><span>' + html + '</span></div>'; }

/* ---------------- SITES ---------------- */
async function renderSites() {
  const el = document.getElementById('view-sites');
  const data = await getDayData(viewingKey);
  const cats = await getCategories();
  const limits = await getLimits();
  let entries = entriesOf(data, cats);
  if (siteFilter !== 'all') entries = entries.filter(e => e.cat === siteFilter);
  if (siteQuery) entries = entries.filter(e => e.domain.includes(siteQuery));

  el.innerHTML =
    '<div class="card"><h3>All websites — ' + esc(dayTitle()) + '</h3>' +
    '<div class="toolbar">' +
    '<input id="siteSearch" class="search" placeholder="Search websites…" value="' + esc(siteQuery) + '">' +
    '<div class="seg" id="catSeg">' +
    ['all', 'productive', 'neutral', 'distracting'].map(c =>
      '<button data-c="' + c + '" class="' + (siteFilter === c ? 'active' : '') + '">' +
      (c === 'all' ? 'All' : CATEGORY_META[c].label) + '</button>').join('') +
    '</div></div>' +
    (entries.length ?
      '<table class="sites"><thead><tr><th>Website</th><th>Time</th><th>Visits</th><th>Category</th><th>Daily limit</th></tr></thead><tbody>' +
      entries.map(e =>
        '<tr><td><div class="site-cell"><img src="' + faviconUrl(e.domain) + '" onerror="this.style.display=\'none\'">' +
        esc(e.domain) + '</div></td>' +
        '<td class="num">' + fmtDur(e.secs) + '</td>' +
        '<td class="num">' + e.visits + '</td>' +
        '<td><select class="cat" data-d="' + esc(e.domain) + '">' +
        ['productive', 'neutral', 'distracting'].map(c =>
          '<option value="' + c + '"' + (e.cat === c ? ' selected' : '') + '>' + CATEGORY_META[c].label + '</option>').join('') +
        '</select></td>' +
        '<td><input class="limit-in" type="number" min="0" max="1440" placeholder="min" data-d="' + esc(e.domain) + '"' +
        (limits[e.domain] ? ' value="' + limits[e.domain] + '"' : '') + ' title="Warn me after this many minutes per day"></td>' +
        '</tr>').join('') +
      '</tbody></table>' :
      '<div class="empty">No websites match.</div>') +
    '<div class="btn-row"><button class="btn" id="saveLimits">Save limits</button>' +
    '<span style="font-size:12px;color:var(--mut);align-self:center">Limits warn you once per day per site.</span></div>' +
    '</div>';

  document.getElementById('siteSearch').addEventListener('input', e => { siteQuery = e.target.value.toLowerCase(); renderSites(); keepFocus('siteSearch'); });
  document.querySelectorAll('#catSeg button').forEach(b => b.addEventListener('click', () => { siteFilter = b.dataset.c; renderSites(); }));
  document.querySelectorAll('select.cat').forEach(s => s.addEventListener('change', async () => {
    const c = await getCategories(); c[s.dataset.d] = s.value;
    await storeSet({ categories: c }); toast('Saved: ' + s.dataset.d + ' → ' + CATEGORY_META[s.value].label);
  }));
  document.getElementById('saveLimits').addEventListener('click', async () => {
    const lim = await getLimits();
    document.querySelectorAll('.limit-in').forEach(inp => {
      const v = parseInt(inp.value, 10);
      if (v > 0) lim[inp.dataset.d] = v; else delete lim[inp.dataset.d];
    });
    await storeSet({ limits: lim }); toast('Daily limits saved.');
  });
}

function keepFocus(id) {
  const i = document.getElementById(id);
  i.focus(); i.setSelectionRange(i.value.length, i.value.length);
}

/* ---------------- TRENDS ---------------- */
async function renderTrends() {
  const el = document.getElementById('view-trends');
  const r = await storeGet(['days']);
  const days = r.days || {};
  const cats = await getCategories();

  const list = [];
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dayKey(d.getTime());
    const dd = days[key] || { domains: {}, total: 0 };
    list.push({
      key, total: dd.total,
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      full: d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
      entries: entriesOf(dd, cats)
    });
  }
  const total = list.reduce((a, d) => a + d.total, 0);
  const avg = list.length ? Math.round(total / list.length) : 0;
  const best = list.reduce((a, d) => d.total > a.total ? d : a, list[0]);
  const scores = list.map(d => scoreOf(d.entries));
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  el.innerHTML =
    '<div class="card"><h3>Browsing trends</h3>' +
    '<div class="toolbar"><div class="seg" id="trendSeg">' +
    [7, 14, 30].map(n => '<button data-n="' + n + '" class="' + (trendDays === n ? 'active' : '') + '">Last ' + n + ' days</button>').join('') +
    '</div><button class="btn small" id="shareWeekBtn" title="Download a shareable image of your last 7 days">⤴ Share my week</button></div>' +
    '<div class="grid g4" style="margin-bottom:16px">' +
    statCard('Total', fmtDur(total), 'in this period', '') +
    statCard('Daily average', fmtDur(avg), 'per day', '') +
    statCard('Heaviest day', fmtDur(best.total), best.full, '') +
    statCard('Avg. score', avgScore + '/100', scoreVerdict(avgScore), '') +
    '</div>' +
    svgTrend(list) +
    '</div>' +
    '<div class="card" style="margin-top:16px"><h3>Day by day</h3>' +
    '<table class="sites"><thead><tr><th>Day</th><th>Screen time</th><th>Top site</th><th>Score</th></tr></thead><tbody>' +
    list.slice().reverse().map(d => {
      const top = d.entries[0];
      return '<tr><td><b>' + d.full + '</b></td><td class="num">' + fmtDur(d.total) + '</td>' +
        '<td>' + (top ? '<div class="site-cell"><img src="' + faviconUrl(top.domain) + '" onerror="this.style.display=\'none\'">' + esc(top.domain) +
        ' <span class="num" style="color:var(--mut)">· ' + fmtDur(top.secs) + '</span></div>' : '—') + '</td>' +
        '<td class="num">' + scoreOf(d.entries) + '</td></tr>';
    }).join('') + '</tbody></table></div>';

  document.querySelectorAll('#trendSeg button').forEach(b =>
    b.addEventListener('click', () => { trendDays = parseInt(b.dataset.n, 10); renderTrends(); }));
  const shareBtn = document.getElementById('shareWeekBtn');
  if (shareBtn) shareBtn.addEventListener('click', shareWeek);
}

/* ---------------- ASK AI (shared chat panel: full view + floating drawer) ---------------- */
let chatUid = 0;

async function mountChat(rootEl) {
  const r = await storeGet(['aiKey', 'aiChat']);
  const hasKey = !!((r.aiKey || '').trim());
  const hist = Array.isArray(r.aiChat) ? r.aiChat.slice(-40) : [];
  const uid = 'q' + (++chatUid) + '_';
  rootEl.innerHTML =
    (hasKey ? '' :
      '<div class="ask-warn">Add your Gemini API key in <b>Settings → AI features</b> to enable the chat. ' +
      '<button class="link-coral" id="' + uid + 'go">Open settings →</button></div>') +
    '<div class="chat-log" id="' + uid + 'log"></div>' +
    '<div class="chat-suggest">' +
    ['When am I most distracted?', 'How was my week?', 'What should I cut down on?'].map(q =>
      '<button class="fchip" data-q="' + esc(q) + '">' + esc(q) + '</button>').join('') +
    '</div>' +
    '<div class="chat-input-row"><input id="' + uid + 'in" type="text" placeholder="Ask about your habits…" autocomplete="off" maxlength="300">' +
    '<button class="btn" id="' + uid + 'send">Send</button></div>';

  const log = document.getElementById(uid + 'log');
  const input = document.getElementById(uid + 'in');
  const pushMsg = (role, text) => {
    const d = document.createElement('div');
    d.className = 'msg ' + role;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  };
  hist.forEach(m => pushMsg(m.role, m.text));
  if (!hist.length) pushMsg('ai', 'Hey! I can see your browsing stats. Try asking "when do I lose focus?" or "how was my week?"');

  const goBtn = document.getElementById(uid + 'go');
  if (goBtn) goBtn.addEventListener('click', () => { closeAiDrawer(); showView('settings'); });

  const send = async (text) => {
    const q = (text || '').trim();
    if (!q) return;
    if (!hasKey) { toast('Add your Gemini API key in Settings → AI features first.'); return; }
    input.value = '';
    pushMsg('user', q);
    const typing = document.createElement('div');
    typing.className = 'msg ai typing';
    typing.textContent = 'Thinking…';
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;
    try {
      const rr = await storeGet(['days', 'categories', 'aiChat']);
      const summary = buildDataSummary(rr.days || {}, rr.categories || {});
      const history = Array.isArray(rr.aiChat) ? rr.aiChat.slice(-6) : [];
      const reply = await aiGenerate(buildAskPrompt(summary, history, q), 600);
      typing.remove();
      pushMsg('ai', reply);
      const updated = (Array.isArray(rr.aiChat) ? rr.aiChat : [])
        .concat([{ role: 'user', text: q }, { role: 'ai', text: reply }]).slice(-40);
      await storeSet({ aiChat: updated });
    } catch (err) {
      typing.remove();
      pushMsg('ai', err.code === 'no-key'
        ? 'No API key set — add it in Settings → AI features.'
        : 'Hmm, that didn\'t work (' + err.message + '). Check your key in Settings → AI.');
    }
  };

  document.getElementById(uid + 'send').addEventListener('click', () => send(input.value));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(input.value); });
  rootEl.querySelectorAll('.fchip').forEach(b => b.addEventListener('click', () => send(b.dataset.q)));
}

async function renderAsk() {
  const el = document.getElementById('view-ask');
  el.innerHTML = '<div class="card ask-card"><h3>Ask WebWell <span style="font-size:18px">✨</span></h3>' +
    '<p class="ask-sub">Ask anything about your browsing. The AI only ever sees a short summary of your stats — nothing else leaves this device.</p>' +
    '<div id="askMount"></div></div>';
  await mountChat(document.getElementById('askMount'));
}

/* floating drawer controls */
function openAiDrawer() {
  const d = document.getElementById('aiDrawer');
  if (!d.classList.contains('hidden')) return;
  d.classList.remove('hidden');
  requestAnimationFrame(() => d.classList.add('open'));
  mountChat(document.getElementById('aiDrawerBody'));
  setTimeout(() => {
    const i = document.querySelector('#aiDrawerBody input');
    if (i) i.focus();
  }, 350);
}
function closeAiDrawer() {
  const d = document.getElementById('aiDrawer');
  if (d.classList.contains('hidden')) return;
  d.classList.remove('open');
  setTimeout(() => d.classList.add('hidden'), 320);
}

/* ---------------- SHARE WEEK CARD ---------------- */
async function shareWeek() {
  toast('Painting your week…');
  const r = await storeGet(['days']);
  const days = r.days || {};
  const cats = await getCategories();
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d.getTime());
    const dd = days[k] || { domains: {}, total: 0 };
    week.push({ d, total: dd.total || 0, entries: entriesOf(dd, cats) });
  }
  const total = week.reduce((a, w) => a + w.total, 0);
  const avgScore = Math.round(week.reduce((a, w) => a + scoreOf(w.entries), 0) / 7);
  let p = 0, x = 0;
  const siteSecs = {};
  for (const w of week) for (const e of w.entries) {
    if (e.cat === 'productive') p += e.secs; else if (e.cat === 'distracting') x += e.secs;
    siteSecs[e.domain] = (siteSecs[e.domain] || 0) + e.secs;
  }
  const topSites = Object.keys(siteSecs).map(d => ({ d, s: siteSecs[d] }))
    .sort((a, b) => b.s - a.s).slice(0, 3);
  const best = week.reduce((a, w) => w.total > a.total ? w : a, week[0]);

  const W = 1080, H = 1350, cx = W / 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const F = '"Inter",system-ui,-apple-system,"Segoe UI",sans-serif';

  const bgGrad = g.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#18181e'); bgGrad.addColorStop(1, '#0d0d11');
  g.fillStyle = bgGrad; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(cx, 320, 40, cx, 320, 640);
  glow.addColorStop(0, 'rgba(232,96,76,0.30)'); glow.addColorStop(1, 'rgba(232,96,76,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);

  g.textAlign = 'center';
  g.fillStyle = '#fff'; g.font = '700 46px ' + F;
  g.fillText('My week with WebWell', cx, 118);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '400 30px ' + F;
  g.fillText(
    week[0].d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' +
    week[6].d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cx, 168);

  // score ring
  const R = 148, cy = 415;
  g.lineWidth = 34; g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,0.10)';
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#e8604c';
  g.beginPath(); g.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (avgScore / 100)); g.stroke();
  g.fillStyle = '#fff'; g.font = '800 108px ' + F;
  g.fillText(String(avgScore), cx, cy + 38);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '600 25px ' + F;
  g.fillText('WEEK SCORE', cx, cy + 86);

  // stat row
  const stats = [
    [fmtDur(total), 'screen time'],
    [Math.round(p / Math.max(1, total) * 100) + '%', 'productive'],
    [Math.round(x / Math.max(1, total) * 100) + '%', 'distracting']
  ];
  stats.forEach((st, i) => {
    const x0 = cx + (i - 1) * 305;
    g.fillStyle = '#fff'; g.font = '800 50px ' + F;
    g.fillText(st[0], x0, 690);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '500 26px ' + F;
    g.fillText(st[1], x0, 732);
  });

  // 7-day bars
  const maxV = Math.max(1, ...week.map(w => w.total));
  const bw = 92, gap = (W - 160 - bw * 7) / 6, baseY = 1010, maxH = 200;
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.font = '600 25px ' + F;
  g.fillText('DAILY SCREEN TIME', cx, 800);
  week.forEach((w, i) => {
    const h = Math.max(8, (w.total / maxV) * maxH);
    const x0 = 80 + i * (bw + gap), y0 = baseY - h;
    g.fillStyle = 'rgba(232,96,76,0.92)';
    g.beginPath();
    if (g.roundRect) g.roundRect(x0, y0, bw, h, 16); else g.rect(x0, y0, bw, h);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.62)'; g.font = '500 24px ' + F;
    g.fillText(w.d.toLocaleDateString('en-US', { weekday: 'narrow' }), x0 + bw / 2, 1048);
  });
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = '400 24px ' + F;
  g.fillText('Best day: ' + best.d.toLocaleDateString('en-US', { weekday: 'long' }) +
    ' (' + fmtDurShort(best.total) + ')', cx, 1090);

  // top sites
  g.textAlign = 'left';
  g.fillStyle = '#fff'; g.font = '700 30px ' + F;
  g.fillText('Top sites', 80, 1150);
  g.font = '400 27px ' + F;
  if (!topSites.length) {
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillText('No browsing recorded this week.', 80, 1198);
  }
  topSites.forEach((s, i) => {
    g.fillStyle = 'rgba(255,255,255,0.88)';
    g.fillText((i + 1) + '.  ' + s.d, 80, 1198 + i * 46);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.textAlign = 'right';
    g.fillText(fmtDurShort(s.s), W - 80, 1198 + i * 46);
    g.textAlign = 'left';
  });

  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,0.38)'; g.font = '400 23px ' + F;
  g.fillText('Tracked privately on this device · WebWell', cx, 1310);

  const a = document.createElement('a');
  a.download = 'webwell-week-' + dayKey(Date.now()) + '.png';
  a.href = c.toDataURL('image/png');
  a.click();
  toast('Report card downloaded — share it anywhere.');
}

/* ---------------- SETTINGS ---------------- */
async function renderSettings() {
  const el = document.getElementById('view-settings');
  const s = await getSettings();
  const p = Object.assign({ name: '', theme: 'dusk', bgMode: 'photos', bgPick: null, pic: '' },
    (await storeGet(['profile'])).profile || {});
  const profPicHtml = p.pic
    ? '<img src="' + p.pic + '" alt="Profile">'
    : esc((p.name || 'W').charAt(0).toUpperCase());
  el.innerHTML =
    '<div class="card"><h3>Profile</h3>' +
    '<div class="prof-wrap"><div class="prof-pic" id="profPic">' + profPicHtml + '</div>' +
    '<div style="flex:1;min-width:0">' +
    setRow('Your name',
      'Shown in greetings on your new tab page.',
      '<input class="txt-in" type="text" id="setName" maxlength="40" placeholder="Your name" value="' + esc(p.name || '') + '">') +
    '<div class="prof-btns"><button class="btn small" id="picUploadBtn">Upload picture</button>' +
    (p.pic ? '<button class="btn small ghost" id="picRemoveBtn">Remove</button>' : '') +
    '<input type="file" id="picFile" accept="image/*" style="display:none"></div>' +
    '</div></div></div>' +
    '<div class="card" style="margin-top:16px"><h3>Tracking</h3>' +
    setRow('Track my browsing',
      'When on, WebWell records active-tab time per website. Everything stays on this device.',
      '<label class="toggle"><input type="checkbox" id="setTracking" ' + (s.trackingEnabled ? 'checked' : '') + '><span class="tk"></span></label>') +
    setRow('Idle timeout',
      'Stop counting after this many seconds without mouse/keyboard activity.',
      '<input class="num-in" type="number" id="setIdle" min="15" max="900" value="' + s.idleTimeout + '"> sec') +
    setRow('Dark mode',
      'Switch the dashboard to a dark theme.',
      '<label class="toggle"><input type="checkbox" id="setDark" ' + (s.darkMode ? 'checked' : '') + '><span class="tk"></span></label>') +
    setRow('Slump forecast nudge',
      'Warn me 15 minutes before my usual daily distraction slump (needs a few days of history).',
      '<label class="toggle"><input type="checkbox" id="setForecastNudge" ' + (s.forecastNudge ? 'checked' : '') + '><span class="tk"></span></label>') +
    '</div>' +
    '<div class="card" style="margin-top:16px"><h3>AI features ✨</h3>' +
    '<div style="font-size:13px;color:var(--mut);line-height:1.7;margin-bottom:4px">' +
    'Ask WebWell answers questions about your habits. It needs a free Gemini key — ' +
    'takes about 2 minutes, no credit card, and the key stays in your browser.' +
    '</div>' +
    '<div class="ai-steps">' +
    '<div class="ai-step"><span class="ai-num">1</span><div><b>Get a free key</b><br>' +
    '<span class="sub-mut">This opens Google AI Studio in a new tab.</span><br>' +
    '<button class="btn small" id="aiGetKeyBtn" style="margin-top:8px">Get free Gemini key ↗</button></div></div>' +
    '<div class="ai-step"><span class="ai-num">2</span><div><b>Create the key</b><br>' +
    '<span class="sub-mut">On Google\'s page click <b>Create API key</b>, then copy the key it shows (starts with AIza…).</span></div></div>' +
    '<div class="ai-step"><span class="ai-num">3</span><div><b>Paste it below</b><br>' +
    '<span class="sub-mut">Paste the key here and hit Test &amp; save. Done — the AI chat unlocks.</span></div></div>' +
    '</div>' +
    setRow('Gemini API key',
      'Powers the Ask AI chat. Stored only on this device.',
      '<input class="txt-in" type="password" id="setAiKey" placeholder="Paste key here (AIza…)" autocomplete="off" style="min-width:230px">') +
    '<div class="prof-btns"><button class="btn small" id="aiTestBtn">Test &amp; save key</button></div>' +
    '<div class="sub-mut" style="margin-top:10px;font-size:12px;line-height:1.6">Only your question and a short stats summary are sent to Google, and only when you ask the AI something. Everyone uses their own free key, so the AI never breaks for others.</div>' +
    '</div>' +
    '<div class="card" style="margin-top:16px"><h3>Help &amp; feedback</h3>' +
    setRow('Report a bug',
      'Found something broken? Tell the developer directly — it takes 30 seconds.',
      '<button class="btn small" id="bugReportBtn">🐞 Report a bug</button>') +
    '<div class="sub-mut" style="margin-top:6px">WebWell v' + esc(chrome.runtime.getManifest().version) + '</div>' +
    '</div>' +
    '<div class="card" style="margin-top:16px"><h3>New Tab page</h3>' +
    setRow('Background',
      'Landmark photos rotate daily — each shows its name and a fact. Gradient uses the animated theme below.',
      '<select class="sel-in" id="setBgMode">' +
        '<option value="photos"' + ((p.bgMode || 'photos') === 'photos' ? ' selected' : '') + '>Landmark photos</option>' +
        '<option value="gradient"' + (p.bgMode === 'gradient' ? ' selected' : '') + '>Animated gradient</option>' +
      '</select>') +
    setRow('Gradient theme',
      'The animated gradient behind your new tab page (used when Background is set to gradient).',
      '<select class="sel-in" id="setTheme">' +
        ['dusk', 'ocean', 'ember', 'forest'].map(t =>
          '<option value="' + t + '"' + ((p.theme || 'dusk') === t ? ' selected' : '') + '>' +
          t.charAt(0).toUpperCase() + t.slice(1) + '</option>').join('') +
      '</select>') +
    '</div>' +
    '<div class="card" style="margin-top:16px"><h3>Your data</h3>' +
    setRow('Export data', 'Download everything WebWell has recorded as JSON.',
      '<button class="btn ghost" id="exportBtn">Export JSON</button>') +
    setRow('Clear all data', 'Permanently delete every recorded day. This cannot be undone.',
      '<button class="btn danger" id="clearBtn">Delete everything</button>') +
    '</div>' +
    '<div class="card" style="margin-top:16px"><h3>How it works</h3>' +
    '<div style="font-size:13px;color:var(--mut);line-height:1.7">' +
    'WebWell counts time only for the tab you are actively looking at, in a focused window, while you are not idle. ' +
    'Switching tabs, minimizing the browser, or walking away pauses the timer. No URLs, page titles, or keystrokes are stored — only the domain name and seconds. ' +
    'There are no accounts, no servers, no analytics. Uninstalling the extension removes everything.' +
    '</div></div>';

  document.getElementById('setTracking').addEventListener('change', async e => {
    const st = await getSettings(); st.trackingEnabled = e.target.checked;
    await storeSet({ settings: st }); updatePill(); toast(e.target.checked ? 'Tracking resumed.' : 'Tracking paused.');
  });
  document.getElementById('setIdle').addEventListener('change', async e => {
    const v = Math.min(900, Math.max(15, parseInt(e.target.value, 10) || 60));
    const st = await getSettings(); st.idleTimeout = v;
    await storeSet({ settings: st });
    chrome.idle.setDetectionInterval(v);
    toast('Idle timeout set to ' + v + ' seconds.');
  });
  document.getElementById('setDark').addEventListener('change', async e => {
    const st = await getSettings(); st.darkMode = e.target.checked;
    await storeSet({ settings: st }); applyTheme();
  });
  document.getElementById('setForecastNudge').addEventListener('change', async e => {
    const st = await getSettings(); st.forecastNudge = e.target.checked;
    await storeSet({ settings: st });
    toast(e.target.checked ? 'Slump warnings on.' : 'Slump warnings off.');
  });
  storeGet(['aiKey']).then(r => {
    const inp = document.getElementById('setAiKey');
    if (inp && (r.aiKey || '').trim()) inp.placeholder = 'Key saved ✓ — paste a new one to replace it';
  });
  document.getElementById('aiGetKeyBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://aistudio.google.com/app/apikey' });
  });
  document.getElementById('aiTestBtn').addEventListener('click', async () => {
    const inp = document.getElementById('setAiKey');
    const key = inp.value.trim();
    if (!key) { toast('Paste your Gemini API key first.'); return; }
    inp.disabled = true;
    const btn = document.getElementById('aiTestBtn');
    btn.textContent = 'Testing…';
    try {
      await aiTestKey(key);
      await storeSet({ aiKey: key });
      inp.value = '';
      inp.placeholder = 'Key saved ✓ — paste a new one to replace it';
      toast('Key works — saved.');
    } catch (err) {
      toast('Key test failed: ' + err.message);
    }
    inp.disabled = false;
    btn.innerHTML = 'Test &amp; save key';
  });
  document.getElementById('bugReportBtn').addEventListener('click', () => {
    if (!BUG_REPORT_URL) {
      toast('Bug reporting isn\'t set up yet — check back soon.');
      return;
    }
    chrome.tabs.create({ url: BUG_REPORT_URL });
  });
  document.getElementById('setName').addEventListener('change', async e => {
    const prof = Object.assign({ name: '', theme: 'dusk' }, (await storeGet(['profile'])).profile || {});
    prof.name = e.target.value.trim().slice(0, 40);
    await storeSet({ profile: prof });
    toast('Name saved.');
  });
  document.getElementById('setTheme').addEventListener('change', async e => {
    const prof = Object.assign({ name: '', theme: 'dusk' }, (await storeGet(['profile'])).profile || {});
    prof.theme = e.target.value;
    await storeSet({ profile: prof });
    toast('New tab theme updated.');
  });
  document.getElementById('setBgMode').addEventListener('change', async e => {
    const prof = Object.assign({ bgMode: 'photos' }, (await storeGet(['profile'])).profile || {});
    prof.bgMode = e.target.value;
    await storeSet({ profile: prof });
    toast(e.target.value === 'photos' ? 'Landmark photos on.' : 'Animated gradient on.');
  });
  document.getElementById('picUploadBtn').addEventListener('click', () => {
    document.getElementById('picFile').click();
  });
  document.getElementById('picFile').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await downscaleImage(file, 128);
      const prof = Object.assign({}, (await storeGet(['profile'])).profile || {});
      prof.pic = dataUrl;
      await storeSet({ profile: prof });
      toast('Profile picture updated.');
      updateAvatar(); renderSettings();
    } catch (err) { toast('Could not read that image.'); }
  });
  const rmBtn = document.getElementById('picRemoveBtn');
  if (rmBtn) rmBtn.addEventListener('click', async () => {
    const prof = Object.assign({}, (await storeGet(['profile'])).profile || {});
    prof.pic = '';
    await storeSet({ profile: prof });
    toast('Profile picture removed.');
    updateAvatar(); renderSettings();
  });
  document.getElementById('exportBtn').addEventListener('click', async () => {
    const r = await storeGet(['days', 'categories', 'limits', 'settings']);
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'webwell-export-' + dayKey(Date.now()) + '.json';
    a.click();
    toast('Export downloaded.');
  });
  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (confirm('Delete ALL WebWell data? This cannot be undone.')) {
      await chrome.storage.local.clear();
      toast('All data deleted.'); renderAll();
    }
  });
}

function setRow(t, d, control) {
  return '<div class="set-row"><div><div class="t">' + t + '</div><div class="d">' + d + '</div></div><div>' + control + '</div></div>';
}

/* ---------------- shell ---------------- */
function dayTitle() {
  if (isTodayKey(viewingKey)) return 'Today';
  const yd = new Date(); yd.setDate(yd.getDate() - 1);
  if (viewingKey === dayKey(yd.getTime())) return 'Yesterday';
  return new Date(viewingKey + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

async function updatePill() {
  const s = await getSettings();
  const p = document.getElementById('trackingState');
  p.innerHTML = s.trackingEnabled ? '<span class="pulse"></span>Tracking' : '○ Paused';
  p.classList.toggle('off', !s.trackingEnabled);
}

async function applyTheme() {
  const s = await getSettings();
  document.body.classList.toggle('dark', !!s.darkMode);
}

async function updateAvatar() {
  const prof = (await storeGet(['profile'])).profile || {};
  const el = document.querySelector('.user .avatar');
  if (!el) return;
  if (prof.pic) {
    el.innerHTML = '<img src="' + prof.pic + '" alt="Profile">';
  } else {
    el.textContent = (prof.name || 'W').charAt(0).toUpperCase();
  }
}

// Downscale an uploaded image to a small square data URL (keeps storage tiny).
function downscaleImage(file, size) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = size;
          const ctx = c.getContext('2d');
          const s = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
          resolve(c.toDataURL('image/jpeg', 0.85));
        } catch (e) { reject(e); }
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

async function renderAll() {
  const hdt = document.getElementById('heroDayTitle');
  if (hdt) hdt.textContent = dayTitle();
  document.getElementById('nextDay').style.visibility = isTodayKey(viewingKey) ? 'hidden' : 'visible';
  await updatePill();
  await updateAvatar();
  await renderOverview(); await renderSites(); await renderTrends(); await renderAsk(); await renderSettings();
}

function showView(name) {
  document.querySelectorAll('.nav').forEach(x => x.classList.toggle('active', x.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const target = document.getElementById('view-' + name);
  if (target) target.classList.remove('hidden');
}

document.querySelectorAll('.nav').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

// Deep link from the new tab page, e.g. dashboard.html#settings
(function () {
  const h = (location.hash || '').replace('#', '');
  if (h && document.getElementById('view-' + h)) showView(h);
})();

document.getElementById('prevDay').addEventListener('click', () => { animateWidgets = true; shiftDay(-1); });
document.getElementById('nextDay').addEventListener('click', () => { animateWidgets = true; shiftDay(1); });
document.getElementById('goToday').addEventListener('click', () => { animateWidgets = true; viewingKey = dayKey(Date.now()); renderAll(); });
document.getElementById('themeToggle').addEventListener('click', async () => {
  const s = await getSettings(); s.darkMode = !s.darkMode;
  await storeSet({ settings: s }); applyTheme(); renderSettings();
});

// ---- reference-shell wiring ----
document.getElementById('menuBtn').addEventListener('click', () => document.body.classList.toggle('rail-hidden'));
document.getElementById('heroCta').addEventListener('click', () => {
  const el = document.getElementById('insightsCard');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.getElementById('splitFoot').addEventListener('click', () => {
  const el = document.getElementById('activityCard');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
function goView(name) {
  document.querySelectorAll('.nav').forEach(x => x.classList.toggle('active', x.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + name).classList.remove('hidden');
}
document.querySelectorAll('.split-block.clickable').forEach(b =>
  b.addEventListener('click', () => filterActivity(b.dataset.cat)));
document.getElementById('goTrends').addEventListener('click', () => goView('trends'));
document.getElementById('goSites').addEventListener('click', () => goView('sites'));
document.getElementById('actSearch').addEventListener('input', e => {
  actQuery = e.target.value.toLowerCase();
  renderOverview();
  const i = document.getElementById('actSearch');
  i.focus(); i.setSelectionRange(i.value.length, i.value.length);
});
document.querySelectorAll('.fchip').forEach(b => b.addEventListener('click', () => {
  actCat = b.dataset.c;
  document.querySelectorAll('.fchip').forEach(x => x.classList.toggle('active', x === b));
  renderOverview();
}));
document.getElementById('globalSearch').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  siteQuery = e.target.value.trim().toLowerCase();
  goView('sites');
  renderSites();
});

document.getElementById('aiFab').addEventListener('click', () => {
  const d = document.getElementById('aiDrawer');
  if (d.classList.contains('hidden')) openAiDrawer(); else closeAiDrawer();
});
document.getElementById('aiDrawerClose').addEventListener('click', closeAiDrawer);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAiDrawer();
});

applyTheme().then(renderAll);
