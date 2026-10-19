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
