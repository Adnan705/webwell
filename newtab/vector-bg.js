// Minimal vector backgrounds for the new tab. Pure functions, no DOM: each style is drawn
// as a small SVG (a few KB) from a seed, so it is sharp at any screen size and works offline.
(function (root) {
  'use strict';
  const W = 1920, H = 1080;

  // sky = [top, middle, horizon]; layers = far -> near; sun = glow colour
  const PALETTES = [
    { id: 'dawn',     name: 'Dawn',     sky: ['#2b2150', '#8a4f7d', '#f2a182'], layers: ['#6d4a86', '#5a3d78', '#46316a', '#34255a', '#241a46'], sun: '#ffd7a8', stars: false },
    { id: 'dusk',     name: 'Dusk',     sky: ['#1b1645', '#3b2a7a', '#7a52c9'], layers: ['#4b3a99', '#3b2e82', '#2d2468', '#211b50', '#171338'], sun: '#ffb4d9', stars: true },
    { id: 'ocean',    name: 'Ocean',    sky: ['#0a1d3a', '#14508a', '#4fb3d9'], layers: ['#1c6fa8', '#175c93', '#124a7a', '#0d3961', '#082a49'], sun: '#cdeeff', stars: false },
    { id: 'forest',   name: 'Forest',   sky: ['#0b2a22', '#1a5a45', '#7fcf9b'], layers: ['#2e7d5d', '#256b4f', '#1c5740', '#14442f', '#0c3022'], sun: '#e8ffd2', stars: false },
    { id: 'ember',    name: 'Ember',    sky: ['#2a0f12', '#8a2b1e', '#ff9a4d'], layers: ['#a8402a', '#8a3322', '#6b271b', '#4d1c14', '#33130e'], sun: '#ffe0a8', stars: false },
    { id: 'sakura',   name: 'Sakura',   sky: ['#2a1730', '#8c4a7a', '#ffb5c8'], layers: ['#b4608a', '#9a4f78', '#7d3f64', '#5f2f4d', '#43213a'], sun: '#fff0d6', stars: false },
    { id: 'midnight', name: 'Midnight', sky: ['#05060f', '#0d1233', '#1e2a6e'], layers: ['#18235a', '#121b48', '#0d1437', '#090e28', '#05081a'], sun: '#cfd8ff', stars: true },
    { id: 'mono',     name: 'Mono',     sky: ['#15171c', '#2a2f3a', '#4a5263'], layers: ['#3a4150', '#2f3541', '#262b35', '#1d2129', '#14171d'], sun: '#e6e9ef', stars: true }
  ];
  const STYLES = [
    { id: 'mountains', name: 'Mountains' },
    { id: 'hills',     name: 'Hills' },
    { id: 'waves',     name: 'Waves' },
    { id: 'orbs',      name: 'Orbs' },
    { id: 'contours',  name: 'Contours' },
    { id: 'dots',      name: 'Dots' }
  ];

  const pal = id => PALETTES.find(p => p.id === id) || PALETTES[0];
  const styleOf = id => STYLES.find(s => s.id === id) || STYLES[0];
  const base = id => pal(id).sky[1];

  // small deterministic random + smooth 1D noise, so a given style/palette always looks the same
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function noise1(r) { const v = Array.from({ length: 64 }, () => r()); return x => { const i = Math.floor(x), f = x - i, a = v[((i % 64) + 64) % 64], b = v[(((i + 1) % 64) + 64) % 64], s = f * f * (3 - 2 * f); return a + (b - a) * s; }; }
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const f = n => Math.round(n * 10) / 10;

  function skyDefs(p, id) {
    return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset=".55" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[2]}"/></linearGradient>`;
  }
  function glow(p, cx, cy, r, op) {
    return `<radialGradient id="glow" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${p.sun}" stop-opacity="${op}"/><stop offset="1" stop-color="${p.sun}" stop-opacity="0"/></radialGradient>`;
  }
  function stars(p, r) {
    if (!p.stars) return '';
    let s = '';
    for (let i = 0; i < 70; i++) s += `<circle cx="${f(r() * W)}" cy="${f(r() * H * 0.5)}" r="${f(0.7 + r() * 1.5)}" fill="#fff" opacity="${f(0.25 + r() * 0.55)}"/>`;
    return s;
  }
  function ridge(r, n, baseY, amp, rough, sharp, fill) {
    const nz = noise1(r), nz2 = noise1(r), step = 24, ph = r() * 40;
    let d = `M0 ${H} L0 ${f(baseY)}`;
    for (let x = 0; x <= W + step; x += step) {
      let v = nz(ph + x / rough) * 0.75 + nz2(ph + x / (rough / 2.4)) * 0.25;
      if (sharp) v = 1 - Math.abs(v * 2 - 1);
      d += ` L${x} ${f(baseY - v * amp)}`;
    }
    return `<path d="${d} L${W + step} ${H} Z" fill="${fill}"/>`;
  }

  const DRAW = {
    mountains(p, r) {
      const sx = 380 + r() * 1160, sy = 250 + r() * 130;
      let s = `<defs>${skyDefs(p, 'sky')}${glow(p, sx, sy, 520, 0.85)}</defs><rect width="${W}" height="${H}" fill="url(#sky)"/>${stars(p, r)}`;
      s += `<circle cx="${f(sx)}" cy="${f(sy)}" r="520" fill="url(#glow)"/><circle cx="${f(sx)}" cy="${f(sy)}" r="70" fill="${p.sun}" opacity=".92"/>`;
      p.layers.forEach((c, i) => { s += ridge(r, 0, 560 + i * 105, 250 - i * 28, 150 - i * 12, true, c); });
      return s;
    },
    hills(p, r) {
      const sx = 300 + r() * 1320, sy = 330 + r() * 80;
      let s = `<defs>${skyDefs(p, 'sky')}${glow(p, sx, sy, 600, 0.8)}</defs><rect width="${W}" height="${H}" fill="url(#sky)"/>${stars(p, r)}`;
      s += `<circle cx="${f(sx)}" cy="${f(sy)}" r="600" fill="url(#glow)"/><circle cx="${f(sx)}" cy="${f(sy)}" r="92" fill="${p.sun}" opacity=".95"/>`;
      p.layers.forEach((c, i) => { s += ridge(r, 0, 620 + i * 92, 150 - i * 12, 520 - i * 50, false, c); });
      return s;
    },
    waves(p, r) {
      const sx = 400 + r() * 1100, hy = 560;
      let s = `<defs>${skyDefs(p, 'sky')}${glow(p, sx, hy, 640, 0.8)}</defs><rect width="${W}" height="${H}" fill="url(#sky)"/>${stars(p, r)}`;
      s += `<circle cx="${f(sx)}" cy="${f(hy)}" r="640" fill="url(#glow)"/><circle cx="${f(sx)}" cy="${f(hy - 40)}" r="86" fill="${p.sun}" opacity=".95"/>`;
      p.layers.forEach((c, i) => {
        const y = 600 + i * 92, a1 = 46 + i * 9, a2 = 12 + i * 2, l1 = 1000 - i * 90, l2 = 470 - i * 40, ph = r() * 6.28, ph2 = r() * 6.28;
        let d = `M0 ${H} L0 ${f(y)}`;
        for (let x = 0; x <= W + 16; x += 20) d += ` L${x} ${f(y + Math.sin(x / l1 * 6.28 + ph) * a1 + Math.sin(x / l2 * 6.28 + ph2) * a2)}`;
        s += `<path d="${d} L${W + 16} ${H} Z" fill="${c}"/>`;
      });
      return s;
    },
    orbs(p, r) {
      let s = `<defs>${skyDefs(p, 'sky')}`;
      const cols = [p.sun, p.sky[2], p.layers[0], p.sky[1], p.layers[1], p.sun];
      const orbs = [];
      for (let i = 0; i < 6; i++) { const cx = f(r() * W), cy = f(r() * H), rad = f(260 + r() * 420); orbs.push([cx, cy, rad, cols[i]]); s += `<radialGradient id="o${i}" cx="${cx}" cy="${cy}" r="${rad}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${cols[i]}" stop-opacity="${f(0.55 + r() * 0.3)}"/><stop offset="1" stop-color="${cols[i]}" stop-opacity="0"/></radialGradient>`; }
      s += `</defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`;
      orbs.forEach((o, i) => { s += `<circle cx="${o[0]}" cy="${o[1]}" r="${o[2]}" fill="url(#o${i})"/>`; });
      for (let i = 0; i < 3; i++) s += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(160 + r() * 260)}" fill="none" stroke="${p.sun}" stroke-opacity=".16" stroke-width="2"/>`;
      return s;
    },
    contours(p, r) {
      const cx = 520 + r() * 880, cy = 320 + r() * 440, nz = noise1(r), nz2 = noise1(r);
      let s = `<defs>${skyDefs(p, 'sky')}${glow(p, cx, cy, 700, 0.35)}</defs><rect width="${W}" height="${H}" fill="url(#sky)"/><circle cx="${f(cx)}" cy="${f(cy)}" r="700" fill="url(#glow)"/>`;
      for (let k = 1; k <= 16; k++) {
        const base_ = 38 * k + 20 * Math.pow(k, 1.25); let d = '';
        for (let a = 0; a <= 120; a++) {
          const t = a / 120 * 6.2832, wob = 1 + (nz(Math.cos(t) * 1.6 + 8 + k * 0.07) - 0.5) * 0.5 + (nz2(Math.sin(t) * 2.4 + 20 + k * 0.05) - 0.5) * 0.22;
          d += (a ? ' L' : 'M') + f(cx + Math.cos(t) * base_ * 1.35 * wob) + ' ' + f(cy + Math.sin(t) * base_ * 0.95 * wob);
        }
        s += `<path d="${d} Z" fill="none" stroke="${k % 4 === 0 ? p.sun : p.layers[k % 5]}" stroke-opacity="${k % 4 === 0 ? 0.42 : 0.34}" stroke-width="${k % 4 === 0 ? 2.6 : 1.5}"/>`;
      }
      return s;
    },
    dots(p, r) {
      const cx = 640 + r() * 640, cy = 380 + r() * 320;
      let s = `<defs>${skyDefs(p, 'sky')}${glow(p, cx, cy, 760, 0.5)}<pattern id="dg" width="44" height="44" patternUnits="userSpaceOnUse"><circle cx="22" cy="22" r="2.4" fill="${p.sun}"/></pattern><radialGradient id="fade" cx="${cx}" cy="${cy}" r="820" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="m"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask></defs>`;
      s += `<rect width="${W}" height="${H}" fill="url(#sky)"/><circle cx="${f(cx)}" cy="${f(cy)}" r="760" fill="url(#glow)"/><rect width="${W}" height="${H}" fill="url(#dg)" opacity=".85" mask="url(#m)"/>`;
      s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="120" fill="${p.sun}" opacity=".16"/><circle cx="${f(cx)}" cy="${f(cy)}" r="64" fill="${p.sun}" opacity=".3"/>`;
      return s;
    }
  };

  function svg(styleId, palId, seed) {
    const st = styleOf(styleId), p = pal(palId);
    const r = rng((seed == null ? hash(st.id + ':' + p.id) : seed >>> 0) + 1);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${DRAW[st.id](p, r)}</svg>`;
  }
  const dataUri = (styleId, palId, seed) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg(styleId, palId, seed));
  const pick = (cur) => {
    let s, p;
    do { s = STYLES[Math.floor(Math.random() * STYLES.length)].id; p = PALETTES[Math.floor(Math.random() * PALETTES.length)].id; } while (cur && s === cur.style && p === cur.pal);
    return { style: s, pal: p };
  };

  root.WW_VBG = { W, H, PALETTES, STYLES, pal, styleOf, base, svg, dataUri, pick };
})(typeof window !== 'undefined' ? window : globalThis);
