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

  // WebWell Plus extras. Kept in their own lists so the free lists (and every picker that
  // reads them, such as the dashboard and the welcome tour) stay exactly as they were.
  const PLUS_PALETTES = [
    { id: 'aurora', name: 'Aurora', sky: ['#03101b', '#0b2a3a', '#1b5a5e'], layers: ['#0f3b44', '#0c3039', '#09252d', '#061b22', '#041217'], sun: '#7dffc4', stars: true, plus: true },
    { id: 'dune',   name: 'Dune',   sky: ['#2a1a2e', '#7a4a4a', '#e5a170'], layers: ['#c07a52', '#a5633f', '#874f33', '#683c29', '#4a2a1e'], sun: '#ffe2b0', stars: false, plus: true },
    { id: 'lagoon', name: 'Lagoon', sky: ['#061a29', '#0e4a5c', '#3fb8a8'], layers: ['#1d8a86', '#167272', '#115c5e', '#0c4649', '#073236'], sun: '#d8fff3', stars: false, plus: true },
    { id: 'plum',   name: 'Plum',   sky: ['#1a0d24', '#4a2160', '#b0629e'], layers: ['#7d3d86', '#673175', '#522661', '#3d1b4b', '#291235'], sun: '#ffd1ea', stars: true, plus: true },
    { id: 'kraft',  name: 'Kraft',  sky: ['#2b2520', '#5a4a3c', '#a88b6c'], layers: ['#8a7058', '#745d48', '#5e4b3a', '#4a3a2d', '#352920'], sun: '#f3e3c8', stars: false, plus: true },
    { id: 'frost',  name: 'Frost',  sky: ['#0e1624', '#2b3d55', '#8fb3d1'], layers: ['#4f6b8a', '#425b77', '#354a63', '#28394e', '#1b2839'], sun: '#eef6ff', stars: true, plus: true }
  ];
  const PLUS_STYLES = [
    { id: 'aurora',   name: 'Aurora',   plus: true },
    { id: 'dunes',    name: 'Dunes',    plus: true },
    { id: 'topo',     name: 'Topography', plus: true },
    { id: 'nebula',   name: 'Nebula',   plus: true },
    { id: 'paper',    name: 'Paper',    plus: true },
    { id: 'softgrad', name: 'Soft gradient', plus: true }
  ];
  const ALL_PALETTES = PALETTES.concat(PLUS_PALETTES), ALL_STYLES = STYLES.concat(PLUS_STYLES);
  const isPlusStyle = id => PLUS_STYLES.some(s => s.id === id);
  const isPlusPal = id => PLUS_PALETTES.some(p => p.id === id);

  // Lookups know every id (free and Plus) so a saved Plus choice always draws correctly;
  // deciding whether it may be SHOWN is the new tab's job (themes.js).
  const pal = id => ALL_PALETTES.find(p => p.id === id) || PALETTES[0];
  const styleOf = id => ALL_STYLES.find(s => s.id === id) || STYLES[0];
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
    },

    // ----- Plus styles -----
    // Soft curtains of light over a dark ridge. Each curtain is a wavy band with a
    // vertical fade, so no blur filter is needed (filters are slow to repaint at 4K).
    aurora(p, r) {
      const cols = [p.sun, p.sky[2], p.layers[0], p.sun];
      let defs = skyDefs(p, 'sky');
      cols.forEach((c, i) => { defs += `<linearGradient id="au${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset=".35" stop-color="${c}" stop-opacity="${f(0.3 + r() * 0.16)}"/><stop offset=".7" stop-color="${c}" stop-opacity="${f(0.12 + r() * 0.08)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`; });
      let s = `<defs>${defs}</defs><rect width="${W}" height="${H}" fill="url(#sky)"/>${stars(Object.assign({}, p, { stars: true }), r)}`;
      for (let i = 0; i < 4; i++) {
        const nz = noise1(r), top = 120 + i * 70 + r() * 60, depth = 260 + r() * 160, ph = r() * 30;
        let d = '', back = '';
        for (let x = -40; x <= W + 40; x += 40) {
          const y = top + (nz(ph + x / 260) - 0.5) * 260 + Math.sin(x / 300 + i) * 40;
          d += (d ? ' L' : 'M') + x + ' ' + f(y);
          back = ` L${x} ${f(y + depth + (nz(ph + 9 + x / 180) - 0.5) * 120)}` + back;
        }
        s += `<path d="${d}${back} Z" fill="url(#au${i})"/>`;
      }
      s += ridge(r, 0, 900, 120, 380, false, p.layers[3]) + ridge(r, 0, 980, 80, 240, true, p.layers[4]);
      return s;
    },
    // Smooth sand ridges with a lit crest line, low sun.
    dunes(p, r) {
      const sx = 300 + r() * 1300, sy = 380 + r() * 60;
      let s = `<defs>${skyDefs(p, 'sky')}${glow(p, sx, sy, 560, 0.75)}</defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`;
      s += `<circle cx="${f(sx)}" cy="${f(sy)}" r="560" fill="url(#glow)"/><circle cx="${f(sx)}" cy="${f(sy)}" r="78" fill="${p.sun}" opacity=".9"/>`;
      p.layers.forEach((c, i) => {
        const nz = noise1(r), y0 = 560 + i * 100, amp = 120 - i * 10, ph = r() * 40;
        let d = `M0 ${H} L0 ${f(y0)}`, crest = '';
        for (let x = 0; x <= W + 24; x += 24) {
          const v = nz(ph + x / (700 - i * 60)), y = y0 - Math.pow(v, 1.6) * amp;
          d += ` L${x} ${f(y)}`; crest += (crest ? ' L' : 'M') + x + ' ' + f(y);
        }
        s += `<path d="${d} L${W + 24} ${H} Z" fill="${c}"/><path d="${crest}" fill="none" stroke="${p.sun}" stroke-opacity="${f(0.22 - i * 0.03)}" stroke-width="2"/>`;
      });
      return s;
    },
    // A quiet map: thin contour rings around a few peaks on a flat ground.
    topo(p, r) {
      let s = `<defs>${skyDefs(p, 'sky')}</defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`;
      for (let c = 0; c < 4; c++) {
        const cx = r() * W, cy = r() * H, nz = noise1(r), rings = 7 + Math.floor(r() * 6), sc = 0.7 + r() * 0.6;
        for (let k = 1; k <= rings; k++) {
          const rad = k * 46 * sc; let d = '';
          for (let a = 0; a <= 72; a++) {
            const t = a / 72 * 6.2832, wob = 1 + (nz(Math.cos(t) * 1.8 + 5 + k * 0.11) - 0.5) * 0.55;
            d += (a ? ' L' : 'M') + f(cx + Math.cos(t) * rad * 1.3 * wob) + ' ' + f(cy + Math.sin(t) * rad * wob);
          }
          s += `<path d="${d} Z" fill="none" stroke="${k % 5 === 0 ? p.sun : p.layers[0]}" stroke-opacity="${k % 5 === 0 ? 0.34 : 0.3}" stroke-width="${k % 5 === 0 ? 2 : 1.2}"/>`;
        }
      }
      return s;
    },
    // Deep space: soft coloured clouds, lots of small stars and a few bright ones.
    nebula(p, r) {
      const cols = [p.sun, p.sky[2], p.layers[0], p.layers[1], p.sky[2]];
      let defs = `<linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.layers[4]}"/></linearGradient>`;
      const clouds = [];
      for (let i = 0; i < 7; i++) {
        const cx = f(200 + r() * 1520), cy = f(150 + r() * 780), rad = f(220 + r() * 380), c = cols[i % cols.length];
        clouds.push([cx, cy, rad]);
        defs += `<radialGradient id="n${i}" cx="${cx}" cy="${cy}" r="${rad}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c}" stop-opacity="${f(0.42 + r() * 0.25)}"/><stop offset=".6" stop-color="${c}" stop-opacity="${f(0.12 + r() * 0.1)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
      }
      let s = `<defs>${defs}</defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`;
      clouds.forEach((o, i) => { s += `<ellipse cx="${o[0]}" cy="${o[1]}" rx="${f(o[2] * 1.4)}" ry="${o[2]}" fill="url(#n${i})" transform="rotate(${f(r() * 60 - 30)} ${o[0]} ${o[1]})"/>`; });
      for (let i = 0; i < 160; i++) s += `<circle cx="${f(r() * W)}" cy="${f(r() * H)}" r="${f(0.5 + r() * 1.3)}" fill="#fff" opacity="${f(0.2 + r() * 0.6)}"/>`;
      for (let i = 0; i < 5; i++) { const x = f(r() * W), y = f(r() * H); s += `<circle cx="${x}" cy="${y}" r="9" fill="${p.sun}" opacity=".12"/><circle cx="${x}" cy="${y}" r="2.4" fill="#fff" opacity=".95"/>`; }
      return s;
    },
    // Layered paper cut-outs with a soft shadow under each sheet and a fine grain.
    paper(p, r) {
      let grain = '';
      for (let i = 0; i < 46; i++) grain += `<circle cx="${f(r() * 64)}" cy="${f(r() * 64)}" r="${f(0.4 + r() * 0.7)}" fill="${r() > 0.5 ? '#fff' : '#000'}" opacity="${f(0.05 + r() * 0.08)}"/>`;
      const sx = 400 + r() * 1100, sy = 300 + r() * 120;
      let s = `<defs>${skyDefs(p, 'sky')}<pattern id="pg" width="64" height="64" patternUnits="userSpaceOnUse">${grain}</pattern></defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`;
      s += `<circle cx="${f(sx)}" cy="${f(sy + 6)}" r="96" fill="#000" opacity=".18"/><circle cx="${f(sx)}" cy="${f(sy)}" r="96" fill="${p.sun}" opacity=".85"/>`;
      p.layers.forEach((c, i) => {
        const y = 560 + i * 98, a1 = 60 + i * 6, l1 = 1300 - i * 120, ph = r() * 6.28, nz = noise1(r);
        let d = `M0 ${H} L0 ${f(y)}`;
        for (let x = 0; x <= W + 20; x += 20) d += ` L${x} ${f(y + Math.sin(x / l1 * 6.28 + ph) * a1 + (nz(x / 90) - 0.5) * 10)}`;
        d += ` L${W + 20} ${H} Z`;
        s += `<path d="${d}" fill="#000" opacity=".22" transform="translate(0 -9)"/><path d="${d}" fill="${c}"/>`;
      });
      s += `<rect width="${W}" height="${H}" fill="url(#pg)"/>`;
      return s;
    },
    // Nothing but colour: a few very large, soft washes.
    softgrad(p, r) {
      const cols = [p.sun, p.sky[2], p.layers[0], p.layers[2]];
      let defs = skyDefs(p, 'sky'), s = '';
      cols.forEach((c, i) => {
        const cx = f(r() * W), cy = f(r() * H), rad = f(700 + r() * 500);
        defs += `<radialGradient id="g${i}" cx="${cx}" cy="${cy}" r="${rad}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c}" stop-opacity="${i === 0 ? 0.45 : 0.6}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
        s += `<rect width="${W}" height="${H}" fill="url(#g${i})"/>`;
      });
      return `<defs>${defs}</defs><rect width="${W}" height="${H}" fill="url(#sky)"/>` + s;
    }
  };

  function svg(styleId, palId, seed) {
    const st = styleOf(styleId), p = pal(palId);
    const r = rng((seed == null ? hash(st.id + ':' + p.id) : seed >>> 0) + 1);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${DRAW[st.id](p, r)}</svg>`;
  }
  const dataUri = (styleId, palId, seed) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg(styleId, palId, seed));
  // `withPlus` lets the shuffle button include the Plus set for Plus users; free users only ever get free ones.
  const pick = (cur, withPlus) => {
    const ss = withPlus ? ALL_STYLES : STYLES, ps = withPlus ? ALL_PALETTES : PALETTES;
    let s, p;
    do { s = ss[Math.floor(Math.random() * ss.length)].id; p = ps[Math.floor(Math.random() * ps.length)].id; } while (cur && s === cur.style && p === cur.pal);
    return { style: s, pal: p };
  };

  root.WW_VBG = { W, H, PALETTES, STYLES, PLUS_PALETTES, PLUS_STYLES, isPlusStyle, isPlusPal, pal, styleOf, base, svg, dataUri, pick };
})(typeof window !== 'undefined' ? window : globalThis);
