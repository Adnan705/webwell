// Tiny dependency-free SVG chart builders.
// (Removed unused svgBarList/svgDonut/svgHourly: dead code, and svgBarList used
// an inline onerror handler that MV3's CSP blocks.)
'use strict';

function svgScoreRing(score, size, text, anim) {
  // Reference-style: solid black ring with a coral arc, score in the middle.
  size = size || 128;
  if (text === undefined) text = score;
  if (anim === undefined) anim = true;
  const thickness = 15, r = (size - thickness) / 2, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  const off = (C * (1 - Math.max(0, Math.min(100, score)) / 100)).toFixed(1);
  return '<div class="score-ring" style="width:' + size + 'px;height:' + size + 'px">' +
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#16161a" stroke-width="' + thickness + '"/>' +
    '<circle class="' + (anim ? 'draw-arc' : '') + '" style="--c:' + C.toFixed(1) + ';--off:' + off + '" cx="' + cx + '" cy="' + cy + '" r="' + r +
    '" fill="none" stroke="#e8604c" stroke-width="' + thickness + '"' +
    ' stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>' +
    '</svg><div class="score-num">' + text + '</div><div class="score-cap">score</div></div>';
}

function svgTrend(days, width) {
  // days: [{key, label, total}] -> line/area chart drawn 1:1 at the container's
  // real width (it used to be a fixed 640px viewBox scaled up ~1.8x, which made
  // the line, dots and labels look oversized on a wide screen).
  const W = Math.max(320, Math.round(width || 640)), H = 220, PX = 34, PT = 22, PB = 30;
  const max = Math.max.apply(null, days.map(d => d.total).concat([1]));
  const n = days.length;
  const x = i => n === 1 ? W / 2 : PX + (i * (W - 2 * PX)) / (n - 1);
  const y = v => H - PB - (v / max) * (H - PT - PB);
  const pts = days.map((d, i) => x(i).toFixed(1) + ',' + y(d.total).toFixed(1)).join(' ');
  const every = n > 20 ? 3 : n > 10 ? 2 : 1;
  let grid = '';
  for (let g = 0; g <= 2; g++) {
    const gy = y(max * g / 2).toFixed(1);
    grid += '<line x1="' + PX + '" x2="' + (W - PX) + '" y1="' + gy + '" y2="' + gy + '" stroke="currentColor" stroke-opacity="' + (g === 0 ? '.14' : '.07') + '"/>';
  }
  const top = '<text x="' + PX + '" y="' + (PT - 8) + '" font-size="10" fill="currentColor" fill-opacity=".45">' + esc(fmtDur(max)) + '</text>';
  const dots = days.map((d, i) =>
    '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(d.total).toFixed(1) + '" r="' + (n > 20 ? 3 : 4) + '" fill="#e8604c" stroke="var(--card,#fff)" stroke-width="2"><title>' +
    esc(d.label) + ' — ' + fmtDur(d.total) + '</title></circle>').join('');
  const labels = days.map((d, i) => (i % every && i !== n - 1) ? '' :
    '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity=".45">' + esc(d.label) + '</text>').join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="trend-svg" role="img" aria-label="Daily screen time trend" style="color:var(--ink,#16161a)">' +
    '<defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8604c" stop-opacity=".22"/><stop offset="1" stop-color="#e8604c" stop-opacity="0"/></linearGradient></defs>' +
    grid + top +
    '<polygon points="' + PX + ',' + (H - PB) + ' ' + pts + ' ' + (W - PX) + ',' + (H - PB) + '" fill="url(#trendFill)"/>' +
    '<polyline points="' + pts + '" fill="none" stroke="#e8604c" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots + labels + '</svg>';
}

// Stacked daily bars (productive / neutral / distracting), drawn 1:1 at the container width like
// svgTrend. rows: [{ key, label, prod, neut, dist, total, title }]. `summary` becomes the
// aria-label; pages pair it with a visually hidden table for screen readers.
function svgDayBars(rows, width, summary) {
  const W = Math.max(300, Math.round(width || 640)), H = 240, PL = 8, PR = 8, PT = 22, PB = 28;
  const n = Math.max(1, rows.length);
  const max = Math.max.apply(null, rows.map(r => r.total || 0).concat([60]));
  const slot = (W - PL - PR) / n, bw = Math.max(3, Math.min(34, slot * 0.62));
  const y = v => (v / max) * (H - PT - PB);
  const base = H - PB;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((W - PL - PR) / 46))));
  const colors = { prod: '#1a9e6b', neut: '#9aa0ae', dist: '#e0523d' };
  const uid = 'db' + Math.random().toString(36).slice(2, 7);
  let grid = '';
  for (let g = 0; g <= 2; g++) {
    const gy = (base - y(max * g / 2)).toFixed(1);
    grid += '<line x1="' + PL + '" x2="' + (W - PR) + '" y1="' + gy + '" y2="' + gy + '" stroke="currentColor" stroke-opacity="' + (g === 0 ? '.16' : '.07') + '"/>';
  }
  const top = '<text x="' + PL + '" y="' + (PT - 8) + '" font-size="10" fill="currentColor" fill-opacity=".45">' + esc(fmtDur(max)) + '</text>';
  let bars = '', defs = '', labels = '';
  rows.forEach((r, i) => {
    const cx = PL + slot * i + slot / 2, x = (cx - bw / 2).toFixed(1);
    const h = y(r.total || 0);
    if (h > 0) {
      // One rounded clip per bar so the stack gets rounded ends without odd seams between parts.
      defs += '<clipPath id="' + uid + i + '"><rect x="' + x + '" y="' + (base - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(5, bw / 2).toFixed(1) + '"/></clipPath>';
      const parts = [['prod', r.prod || 0], ['neut', r.neut || 0], ['dist', r.dist || 0]];
      const sum = parts.reduce((a, p) => a + p[1], 0) || 1;
      let yy = base;
      let seg = '';
      for (const [k, v] of parts) {
        if (!v) continue;
        const sh = h * v / sum; yy -= sh;
        seg += '<rect x="' + x + '" y="' + yy.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (sh + 0.5).toFixed(1) + '" fill="' + colors[k] + '"/>';
      }
      bars += '<g clip-path="url(#' + uid + i + ')"><title>' + esc(r.title || (r.label + ': ' + fmtDur(r.total))) + '</title>' + seg + '</g>';
    } else {
      bars += '<rect x="' + x + '" y="' + (base - 2) + '" width="' + bw.toFixed(1) + '" height="2" rx="1" fill="currentColor" fill-opacity=".12"><title>' + esc(r.label) + ': nothing tracked</title></rect>';
    }
    if (!(i % every) || (i === n - 1 && n <= 14))
      labels += '<text x="' + cx.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" font-size="10.5" fill="currentColor" fill-opacity=".5">' + esc(r.label) + '</text>';
  });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="trend-svg rp-svg" role="img" aria-label="' + esc(summary || 'Daily screen time') + '" style="color:var(--ink,#16161a)">' +
    '<defs>' + defs + '</defs>' + grid + top + bars + labels + '</svg>';
}

// 24 hourly bars with one highlighted stretch (e.g. the busiest two hours).
function svgHourBars(hourly, width, hiStart, hiLen, summary) {
  const W = Math.max(280, Math.round(width || 480)), H = 150, PL = 4, PR = 4, PT = 10, PB = 24;
  const max = Math.max.apply(null, (hourly || []).concat([60]));
  const slot = (W - PL - PR) / 24, bw = Math.max(3, slot * 0.66);
  const hi = h => hiStart >= 0 && ((h - hiStart + 24) % 24) < (hiLen || 2);
  const lab = { 0: '12am', 6: '6am', 12: 'noon', 18: '6pm' };
  let out = '';
  for (let h = 0; h < 24; h++) {
    const v = (hourly && hourly[h]) || 0;
    const bh = Math.max(2, (v / max) * (H - PT - PB));
    const x = PL + slot * h + (slot - bw) / 2;
    out += '<rect x="' + x.toFixed(1) + '" y="' + (H - PB - bh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="' + Math.min(3, bw / 2).toFixed(1) + '" ' +
      (hi(h) ? 'fill="#e8604c"' : 'fill="currentColor" fill-opacity=".16"') + '><title>' + esc((lab[h] || (h % 12 || 12) + (h < 12 ? 'am' : 'pm')) + ': ' + fmtDur(v)) + '</title></rect>';
    if (lab[h] !== undefined) out += '<text x="' + (PL + slot * h + slot / 2).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle" font-size="10.5" fill="currentColor" fill-opacity=".5">' + lab[h] + '</text>';
  }
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="trend-svg rp-svg" role="img" aria-label="' + esc(summary || 'Screen time by hour of day') + '" style="color:var(--ink,#16161a)">' + out + '</svg>';
}
