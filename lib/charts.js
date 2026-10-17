// Tiny dependency-free SVG chart builders.
'use strict';

function svgBarList(rows, opts) {
  // rows: [{label, sub, value(secs), color, icon}]
  opts = opts || {};
  const max = Math.max.apply(null, rows.map(r => r.value).concat([1]));
  return rows.map(r => {
    const w = Math.max(2, Math.round((r.value / max) * 100));
    const icon = r.icon ? '<img class="bar-icon" src="' + r.icon + '" alt="" onerror="this.style.display=\'none\'">' : '';
    return '<div class="bar-row">' +
      '<div class="bar-top">' + icon +
      '<span class="bar-label">' + esc(r.label) + '</span>' +
      '<span class="bar-val">' + esc(fmtDur(r.value)) + (r.sub ? ' <span class="bar-sub">' + esc(r.sub) + '</span>' : '') + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + w + '%;background:' + r.color + '"></div></div>' +
      '</div>';
  }).join('');
}

function svgDonut(segments, size, thickness) {
  // segments: [{value, color, label}]
  size = size || 168; thickness = thickness || 22;
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  let offset = 0, paths = '';
  segments.forEach(s => {
    const frac = s.value / total;
    paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + s.color + '"' +
      ' stroke-width="' + thickness + '" stroke-dasharray="' + (frac * C) + ' ' + C + '"' +
      ' stroke-dashoffset="' + (-offset * C) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" stroke-linecap="butt"/>';
    offset += frac;
  });
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' + paths + '</svg>';
}

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

function svgHourly(hourly, color) {
  // 24 vertical bars
  const max = Math.max.apply(null, Object.values(hourly).concat([1]));
  let bars = '';
  for (let h = 0; h < 24; h++) {
    const v = hourly[h] || 0;
    const pctH = Math.max(3, Math.round((v / max) * 100));
    const label = h + ':00';
    bars += '<div class="hr-col" title="' + label + ' — ' + fmtDur(v) + '">' +
      '<div class="hr-bar" style="height:' + pctH + '%;background:' + color + '"></div>' +
      '<div class="hr-lbl">' + (h % 3 === 0 ? h : '') + '</div></div>';
  }
  return '<div class="hr-chart">' + bars + '</div>';
}

function svgTrend(days) {
  // days: [{key, label, total}] -> simple line/area chart
  const W = 640, H = 160, P = 28;
  const max = Math.max.apply(null, days.map(d => d.total).concat([1]));
  const n = days.length;
  const x = i => n === 1 ? W / 2 : P + (i * (W - 2 * P)) / (n - 1);
  const y = v => H - P - (v / max) * (H - 2 * P);
  let pts = days.map((d, i) => x(i).toFixed(1) + ',' + y(d.total).toFixed(1)).join(' ');
  let dots = days.map((d, i) =>
    '<circle cx="' + x(i) + '" cy="' + y(d.total) + '" r="4.5" fill="#e8604c"><title>' + d.label + ' — ' + fmtDur(d.total) + '</title></circle>'
  ).join('');
  let labels = days.map((d, i) =>
    '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="#b9b9c2">' + esc(d.label) + '</text>'
  ).join('');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="trend-svg">' +
    '<polygon points="' + P + ',' + (H - P) + ' ' + pts + ' ' + (W - P) + ',' + (H - P) + '" fill="rgba(232,96,76,.12)"/>' +
    '<polyline points="' + pts + '" fill="none" stroke="#e8604c" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots + labels + '</svg>';
}
