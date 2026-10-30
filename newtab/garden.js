// WebWell Plus: the focus garden and streaks on the new tab.
// Reads `focusLog` ({ 'YYYY-MM-DD': { mins, sessions } }, written by background.js when a
// focus session ends). Each session plants one plant; longer sessions grow taller plants,
// and total focused minutes make the ground itself greener.
// The logic at the top is pure (no DOM, no chrome.*) so tools/test-plus-garden.js runs it in node.
(function (root) {
  'use strict';

  /* ---------------- pure logic ---------------- */
  const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const pad = n => String(n).padStart(2, '0');
  // Local calendar dates, stepped with setDate(): this is what makes month ends, leap years,
  // New Year and daylight-saving days count as exactly one day each.
  function parseKey(k) {
    const m = KEY_RE.exec(String(k || ''));
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getMonth() === +m[2] - 1 ? d : null;   // rejects 2026-02-31
  }
  const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  function addDays(key, n) { const d = parseKey(key); if (!d) return null; d.setDate(d.getDate() + n); return keyOf(d); }

  const daySessions = v => (v && typeof v === 'object' && Number(v.sessions) > 0) ? Math.floor(Number(v.sessions)) : 0;
  const dayMins = v => (v && typeof v === 'object' && Number(v.mins) > 0) ? Number(v.mins) : 0;
  // Days that count: a real date with at least one finished session.
  function activeDays(log) {
    return Object.keys(log || {}).filter(k => parseKey(k) && daySessions(log[k]) > 0).sort();
  }

  // current: consecutive days ending today, or ending yesterday while today is still open
  // (the streak is not lost until a whole day passes without a session).
  function streaks(log, today) {
    const days = activeDays(log), set = new Set(days);
    const todayDone = set.has(today);
    let current = 0, k = todayDone ? today : addDays(today, -1);
    while (k && set.has(k)) { current++; k = addDays(k, -1); }
    let best = 0, run = 0, prev = null;
    for (const d of days) {
      if (d > today) continue;                 // a clock set back must not invent a streak
      run = prev && addDays(prev, 1) === d ? run + 1 : 1;
      if (run > best) best = run;
      prev = d;
    }
    return { current, best: Math.max(best, current), todayDone };
  }

  const MILESTONES = [
    { days: 3, text: 'Three days in a row. A lovely start.' },
    { days: 7, text: 'A whole week of focus. Your garden is thriving.' },
    { days: 14, text: 'Two weeks in a row. That is real momentum.' },
    { days: 30, text: 'Thirty days. Focus is a habit now.' }
  ];
  // The highest milestone the current streak has reached, or null.
  function milestoneFor(streak) {
    let m = null;
    for (const x of MILESTONES) if (streak >= x.days) m = x;
    return m;
  }
  function nextMilestone(streak) {
    const x = MILESTONES.find(m => m.days > streak);
    return x ? x.days : null;
  }

  // How tall a plant grows, from the average session length that day.
  function stageFor(avgMins) { return avgMins < 10 ? 1 : avgMins < 25 ? 2 : avgMins < 45 ? 3 : 4; }

  const LEVELS = [
    { mins: 0, name: 'Bare soil' },
    { mins: 60, name: 'First sprouts' },
    { mins: 240, name: 'Little patch' },
    { mins: 600, name: 'Growing bed' },
    { mins: 1500, name: 'Lush garden' },
    { mins: 3000, name: 'Meadow' }
  ];
  function levelFor(totalMins) {
    let i = 0;
    while (i + 1 < LEVELS.length && totalMins >= LEVELS[i + 1].mins) i++;
    return { level: i, name: LEVELS[i].name, nextAt: LEVELS[i + 1] ? LEVELS[i + 1].mins : null };
  }

  const PLANT_TYPES = ['tulip', 'daisy', 'fern', 'lavender', 'sunflower'];
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // One plant per session, oldest first. Only the newest `limit` are drawn; the seed comes from
  // the day and the session number, so the same garden always looks the same.
  function plantsFrom(log, today, limit) {
    const out = [];
    for (const d of activeDays(log)) {
      if (today && d > today) continue;
      const n = daySessions(log[d]), stage = stageFor(dayMins(log[d]) / n);
      for (let i = 0; i < n; i++) { const seed = hash(d + ':' + i); out.push({ day: d, i, seed, type: PLANT_TYPES[seed % PLANT_TYPES.length], stage }); }
    }
    return limit ? out.slice(-limit) : out;
  }

  function gardenState(log, today, opts) {
    const o = opts || {};
    const s = streaks(log, today);
    const days = activeDays(log).filter(d => d <= today);
    const totalMins = days.reduce((a, d) => a + dayMins(log[d]), 0);
    const totalPlants = days.reduce((a, d) => a + daySessions(log[d]), 0);
    const best = Math.max(s.best, o.storedBest || 0);   // focusLog keeps 120 days; the best is remembered separately
    return {
      plants: plantsFrom(log, today, o.limit || 16), totalPlants, totalMins,
      streak: s.current, best, todayDone: s.todayDone,
      level: levelFor(totalMins), milestone: milestoneFor(s.current), next: nextMilestone(s.current)
    };
  }

  // The one short line under the garden.
  function message(st) {
    if (!st.totalPlants) return 'Finish a focus session to plant your first seed.';
    if (st.milestone && (st.todayDone || st.streak === st.milestone.days)) return st.milestone.text;
    if (st.streak > 0 && !st.todayDone) return 'Focus today to keep your streak going.';
    if (st.next && st.streak > 0) { const n = st.next - st.streak; return n + (n === 1 ? ' more day' : ' more days') + ' to a ' + st.next + '-day streak.'; }
    return 'One session a day keeps it growing.';
  }

  /* ---------------- drawing (pure: returns SVG text) ---------------- */
  const VW = 300, VH = 96, GROUND = 80;
  function flower(p, x, y) {
    const t = p.type, st = p.stage;
    if (st < 3 || t === 'fern') return '';
    if (st === 3) {   // a closed bud
      const c = { tulip: '#ff8fa3', daisy: '#fff3c4', lavender: '#b69cff', sunflower: '#ffcf5a' }[t];
      return `<ellipse cx="${x}" cy="${y - 2}" rx="2.4" ry="3.4" fill="${c}"/>`;
    }
    if (t === 'tulip') return `<path d="M${x - 4.5} ${y - 1}q0-7 4.5-8.5q4.5 1.5 4.5 8.5q-4.5 3-9 0z" fill="#ff8fa3"/><path d="M${x} ${y - 9.5}q2.6 4 0 8.2q-2.6-4.2 0-8.2z" fill="#ff6f8a"/>`;
    if (t === 'lavender') { let s = ''; for (let i = 0; i < 5; i++) s += `<ellipse cx="${x + (i % 2 ? 1.6 : -1.6)}" cy="${y - i * 2.6}" rx="1.7" ry="2.1" fill="${i % 2 ? '#c3adff' : '#a68bff'}"/>`; return s; }
    const big = t === 'sunflower', n = big ? 9 : 7, rr = big ? 4.6 : 3.6, pc = big ? '#ffcf5a' : '#ffffff';
    let s = '';
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; s += `<ellipse cx="${(x + Math.cos(a) * rr).toFixed(1)}" cy="${(y - 3 + Math.sin(a) * rr).toFixed(1)}" rx="${big ? 2.4 : 1.9}" ry="${big ? 1.5 : 1.2}" transform="rotate(${(a * 180 / Math.PI).toFixed(0)} ${(x + Math.cos(a) * rr).toFixed(1)} ${(y - 3 + Math.sin(a) * rr).toFixed(1)})" fill="${pc}"/>`; }
    return s + `<circle cx="${x}" cy="${y - 3}" r="${big ? 2.8 : 1.9}" fill="${big ? '#8a5a2b' : '#ffc94a'}"/>`;
  }
  function plantSvg(p, x) {
    const by = GROUND + ((p.seed >> 5) % 5) - 2;
    const h = [0, 8, 18, 27, 34][p.stage] * (0.88 + ((p.seed >> 9) % 8) / 30);
    const lean = (((p.seed >> 3) % 7) - 3) * 0.7, tx = x + lean, ty = by - h;
    const leaf = (lx, ly, dir, sz, c) => `<path d="M${lx.toFixed(1)} ${ly.toFixed(1)}q${(dir * sz).toFixed(1)} ${(-sz * 0.9).toFixed(1)} ${(dir * sz * 1.7).toFixed(1)} ${(-sz * 0.2).toFixed(1)}q${(-dir * sz).toFixed(1)} ${(sz * 0.8).toFixed(1)} ${(-dir * sz * 1.7).toFixed(1)} ${(sz * 0.2).toFixed(1)}z" fill="${c}"/>`;
    if (p.stage === 1) return `<g class="g-plant">${leaf(x, by - 1, -1, 3.4, '#7fd68f')}${leaf(x, by - 1, 1, 3.4, '#5fbf7a')}<path d="M${x} ${by}v-2.5" stroke="#5aa96b" stroke-width="1.4" stroke-linecap="round"/></g>`;
    let s = `<path d="M${x} ${by}Q${(x + lean * 2).toFixed(1)} ${(by - h / 2).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}" stroke="#5aa96b" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    const pairs = p.type === 'fern' ? Math.max(2, p.stage + 1) : 1;
    for (let i = 0; i < pairs; i++) {
      const f = p.type === 'fern' ? 0.25 + i * (0.65 / pairs) : 0.45, ly = by - h * f, lx = x + lean * f * 1.4, sz = p.type === 'fern' ? 4.2 - i * 0.6 : 4;
      s += leaf(lx, ly, -1, sz, '#7fd68f') + leaf(lx, ly, 1, sz, '#5fbf7a');
    }
    return `<g class="g-plant">${s}${flower(p, tx.toFixed(1) * 1, ty.toFixed(1) * 1)}</g>`;
  }
  function gardenSvg(st, opts) {
    const o = opts || {}, lvl = st.level ? st.level.level : 0;
    const soil = ['#6b4b3a', '#5f6b3a', '#4f7a40', '#3f8448', '#348c4f', '#2c9455'][lvl];
    let s = `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${o.label || 'Your focus garden'}" class="g-svg">`;
    s += `<path d="M0 ${GROUND + 2}Q75 ${GROUND - 6} 150 ${GROUND}T300 ${GROUND - 2}V${VH}H0z" fill="${soil}" opacity=".9"/>`;
    s += `<path d="M0 ${GROUND + 9}Q90 ${GROUND + 3} 170 ${GROUND + 8}T300 ${GROUND + 6}V${VH}H0z" fill="#000" opacity=".16"/>`;
    // grass tufts: more as the ground levels up
    for (let i = 0; i < lvl * 7; i++) {
      const h = hash('tuft' + i), x = (h % 2900) / 10, y = GROUND + 1 + (h >> 12) % 6;
      s += `<path d="M${x.toFixed(1)} ${y}l-1.6-4.2M${x.toFixed(1)} ${y}l.3-5M${x.toFixed(1)} ${y}l2-3.8" stroke="${i % 2 ? '#8fdc9c' : '#6cc77f'}" stroke-width="1" stroke-linecap="round" opacity=".85"/>`;
    }
    const n = st.plants.length;
    st.plants.forEach((p, i) => { const x = Math.round(((i + 1) / (n + 1)) * VW + (((p.seed >> 14) % 9) - 4)); s += plantSvg(p, x); });
    return s + '</svg>';
  }

  // A fixed little garden for the locked preview, so people can see what they would get.
  function sampleState() {
    const log = {}, base = '2026-03-01';
    [[2, 70], [1, 30], [3, 100], [2, 60], [1, 50], [2, 40], [3, 120]].forEach((d, i) => { log[addDays(base, i)] = { sessions: d[0], mins: d[1] }; });
    return gardenState(log, addDays(base, 6), { limit: 12 });
  }

  const api = { parseKey, keyOf, addDays, activeDays, streaks, MILESTONES, milestoneFor, nextMilestone, stageFor, levelFor, PLANT_TYPES, plantsFrom, gardenState, message, gardenSvg, sampleState };
  root.WW_GARDEN = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ---------------- the widget ---------------- */
  if (typeof document === 'undefined' || typeof chrome === 'undefined' || !chrome.storage) return;
  const $g = id => document.getElementById(id);
  let log = {}, storedBest = 0, open = false;
  const isPlus = () => !!(root.wwPlus && root.wwPlus.on);
  const todayKey = () => keyOf(new Date());
  const fmtMins = m => m >= 60 ? Math.floor(m / 60) + ' h ' + String(Math.round(m % 60)).padStart(2, '0') + ' m' : Math.round(m) + ' m';

  function render() {
    const box = $g('gardenWidget'), body = $g('gardenBody'), count = $g('gardenCount');
    if (!box || !body) return;
    const plus = isPlus();
    box.classList.toggle('is-locked', !plus);
    if (!plus) {
      count.innerHTML = '<span class="plus-badge">Plus</span>';
      $g('gardenToggle').setAttribute('aria-label', 'Focus garden, a WebWell Plus feature');
      if (open) {
        body.innerHTML = '<div class="g-sample">' + gardenSvg(sampleState(), { label: 'A sample garden' }) + '</div>' + (typeof plusLockHtml === 'function' ? plusLockHtml('garden') : '');
        if (typeof plusWireLocks === 'function') plusWireLocks(body);
      }
      return;
    }
    const st = gardenState(log, todayKey(), { storedBest, limit: 16 });
    if (st.best > storedBest) { storedBest = st.best; try { chrome.storage.local.set({ plusGarden: { best: storedBest } }); } catch (e) {} }
    count.textContent = st.streak ? st.streak + (st.streak === 1 ? ' day' : ' days') : '';
    $g('gardenToggle').setAttribute('aria-label', 'Focus garden' + (st.streak ? ', ' + st.streak + '-day streak' : ''));
    if (!open) return;
    const days = n => n + (n === 1 ? ' day' : ' days');
    body.innerHTML =
      '<div class="g-top"><div><b class="g-streak">' + (st.streak ? days(st.streak) : 'No streak yet') + '</b><span class="g-sub">Best ' + days(st.best) + '</span></div>' +
        '<span class="g-level">' + st.level.name + '</span></div>' +
      '<div class="g-plot">' + gardenSvg(st) + '</div>' +
      '<p class="g-msg' + (st.milestone && (st.todayDone || st.streak === st.milestone.days) ? ' is-milestone' : '') + '">' + message(st) + '</p>' +
      '<p class="g-foot">' + st.totalPlants + (st.totalPlants === 1 ? ' plant' : ' plants') + ' · ' + fmtMins(st.totalMins) + ' focused</p>';
  }

  function setOpen(v) {
    open = v;
    $g('gardenWidget').classList.toggle('collapsed', !v);
    $g('gardenToggle').setAttribute('aria-expanded', v ? 'true' : 'false');
    render();
  }

  async function init() {
    const box = $g('gardenWidget');
    if (!box) return;
    try { const r = await chrome.storage.local.get(['focusLog', 'plusGarden']); log = r.focusLog || {}; storedBest = (r.plusGarden && r.plusGarden.best) || 0; } catch (e) {}
    $g('gardenToggle').addEventListener('click', () => setOpen(!open));
    document.addEventListener('click', e => { if (open && e.target.isConnected && !e.target.closest('#gardenWidget')) setOpen(false); });
    box.addEventListener('keydown', e => { if (e.key === 'Escape' && open) { setOpen(false); $g('gardenToggle').focus(); } });
    chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.focusLog) { log = c.focusLog.newValue || {}; render(); } });
    if (root.wwPlus) root.wwPlus.onChange(render);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
