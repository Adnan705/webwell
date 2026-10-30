// WebWell Plus: extra looks for the new tab (accent colours, clock styles, Plus backgrounds)
// and the small "Customise" panel where every background choice lives on the new tab.
//
// Plus choices are saved in the normal profile (vecStyle, vecPal, accent, clockStyle). When
// Plus is not active they are only *displayed* as the free default: nothing is deleted, so the
// look comes back by itself when Plus does. effective() is the one place that decides this.
(function (root) {
  'use strict';

  const ACCENTS = [
    { id: 'coral', name: 'Coral', c: '#ef6a52', hover: '#e25a42', soft: '#ff9b8a' },   // the free default
    { id: 'sky',   name: 'Sky',   c: '#3f9cf0', hover: '#2f88da', soft: '#9ccdff', plus: true },
    { id: 'mint',  name: 'Mint',  c: '#22b38a', hover: '#1a9b77', soft: '#8ee8c9', plus: true },
    { id: 'lilac', name: 'Lilac', c: '#8f6dff', hover: '#7d58f5', soft: '#c8b6ff', plus: true },
    { id: 'gold',  name: 'Gold',  c: '#d9952a', hover: '#c4831c', soft: '#ffd28a', plus: true },
    { id: 'rose',  name: 'Rose',  c: '#e0537f', hover: '#cc426d', soft: '#ffa3c0', plus: true }
  ];
  const CLOCKS = [
    { id: 'classic', name: 'Classic' },
    { id: 'large',   name: 'Large light', plus: true },
    { id: 'mono',    name: 'Mono', plus: true },
    { id: 'minimal', name: 'Minimal', plus: true }
  ];
  const FREE = { vecStyle: 'mountains', vecPal: 'dawn', accent: 'coral', clockStyle: 'classic' };

  const V = () => root.WW_VBG || null;
  const isPlusAccent = id => ACCENTS.some(a => a.id === id && a.plus);
  const isPlusClock = id => CLOCKS.some(c => c.id === id && c.plus);
  const isPlusStyle = id => !!(V() && V().isPlusStyle && V().isPlusStyle(id));
  const isPlusPal = id => !!(V() && V().isPlusPal && V().isPlusPal(id));

  // What to SHOW for this profile. Saved values are never changed here.
  function effective(profile, plusOn) {
    const p = profile || {};
    const ok = (v, isPlus, known, dflt) => (!v || !known(v)) ? dflt : (isPlus(v) && !plusOn ? dflt : v);
    return {
      vecStyle: ok(p.vecStyle, isPlusStyle, () => true, FREE.vecStyle),
      vecPal: ok(p.vecPal, isPlusPal, () => true, FREE.vecPal),
      accent: ok(p.accent, isPlusAccent, v => ACCENTS.some(a => a.id === v), FREE.accent),
      clockStyle: ok(p.clockStyle, isPlusClock, v => CLOCKS.some(c => c.id === v), FREE.clockStyle)
    };
  }

  // Accent and clock are plain attributes on <html>; the CSS does the rest. The free default
  // sets no attribute at all, so the free page renders exactly as before.
  function applyLook(look, de) {
    de = de || (typeof document !== 'undefined' && document.documentElement);
    if (!de) return;
    const acc = ACCENTS.find(a => a.id === look.accent);
    if (acc && acc.plus) {
      de.setAttribute('data-accent', acc.id);
      de.style.setProperty('--acc', acc.c); de.style.setProperty('--acc-hover', acc.hover); de.style.setProperty('--acc-soft', acc.soft);
    } else {
      de.removeAttribute('data-accent');
      de.style.removeProperty('--acc'); de.style.removeProperty('--acc-hover'); de.style.removeProperty('--acc-soft');
    }
    if (look.clockStyle && look.clockStyle !== 'classic') de.setAttribute('data-clock', look.clockStyle);
    else de.removeAttribute('data-clock');
  }

  const api = { ACCENTS, CLOCKS, FREE, effective, applyLook, isPlusAccent, isPlusClock, isPlusStyle, isPlusPal };
  root.WW_THEMES = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ---------------- the Customise panel (new tab only) ---------------- */
  if (typeof document === 'undefined') return;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const badge = '<span class="plus-badge lk-pb">Plus</span>';
  let ctx = null;   // { getProfile, isPlus, save(patch) } from newtab.js
  let lockShown = false;

  function tileHtml(s, pr, on, plus) {
    return '<button type="button" class="look-tile' + (on ? ' on' : '') + '" data-vstyle="' + s.id + '" aria-pressed="' + on + '" title="' + esc(s.name) + '">' +
      '<span class="look-img" data-prev="' + s.id + '">' + (s.plus && !plus ? badge : '') + '</span><span class="look-name">' + esc(s.name) + '</span></button>';
  }
  function render() {
    const pop = document.getElementById('lookPop');
    if (!pop || !ctx) return;
    const V_ = V(), pr = ctx.getProfile(), plus = ctx.isPlus();
    const mode = pr.bgMode === 'vector' || pr.bgMode === 'gradient' ? pr.bgMode : 'photos';
    const vs = pr.vecStyle || FREE.vecStyle, vp = pr.vecPal || FREE.vecPal;
    const acc = pr.accent || FREE.accent, clk = pr.clockStyle || FREE.clockStyle;
    const chip = (attr, id, name, on, isPlus) => '<button type="button" class="look-chip' + (on ? ' on' : '') + '" data-' + attr + '="' + id + '" aria-pressed="' + on + '">' + esc(name) + (isPlus && !plus ? badge : '') + '</button>';
    let h = '<div class="look-head"><strong id="lookTitle">Customise</strong><button type="button" class="mc-ic look-x" id="lookClose" aria-label="Close">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
    if (!plus) h += '<div class="look-lock' + (lockShown ? '' : ' hidden') + '" id="lookLock">' + (typeof plusLockHtml === 'function' ? plusLockHtml('themes') : '') + '</div>';
    h += '<p class="look-h">Background</p><div class="look-chips">' +
      chip('bgmode', 'photos', 'Photos', mode === 'photos') + chip('bgmode', 'vector', 'Vector art', mode === 'vector') + chip('bgmode', 'gradient', 'Gradient', mode === 'gradient') + '</div>';
    if (V_) {
      h += '<div class="look-tiles">' + V_.STYLES.concat(V_.PLUS_STYLES || []).map(s => tileHtml(s, pr, mode === 'vector' && s.id === vs, plus)).join('') + '</div>';
      h += '<p class="look-h">Colours</p><div class="look-pals">' + V_.PALETTES.concat(V_.PLUS_PALETTES || []).map(p =>
        '<button type="button" class="look-pal' + (p.id === vp ? ' on' : '') + (p.plus && !plus ? ' is-plus' : '') + '" data-vpal="' + p.id + '" aria-pressed="' + (p.id === vp) + '" title="' + esc(p.name) + (p.plus && !plus ? ' (Plus)' : '') + '" aria-label="' + esc(p.name) + (p.plus && !plus ? ', Plus' : '') + '" style="background:linear-gradient(135deg,' + p.sky[0] + ',' + p.sky[1] + ' 55%,' + p.sky[2] + ')"></button>').join('') + '</div>';
    }
    h += '<p class="look-h">Accent' + (plus ? '' : badge) + '</p><div class="look-pals">' + ACCENTS.map(a =>
      '<button type="button" class="look-pal look-acc' + (a.id === acc ? ' on' : '') + (a.plus && !plus ? ' is-plus' : '') + '" data-accent="' + a.id + '" aria-pressed="' + (a.id === acc) + '" title="' + esc(a.name) + '" aria-label="' + esc(a.name) + ' accent' + (a.plus && !plus ? ', Plus' : '') + '" style="background:' + a.c + '"></button>').join('') + '</div>';
    h += '<p class="look-h">Clock</p><div class="look-chips">' + CLOCKS.map(c => chip('clock', c.id, c.name, c.id === clk, c.plus)).join('') + '</div>';
    if (!plus) h += '<p class="look-foot">Plus looks are marked. Free choices always stay free.</p>';
    pop.innerHTML = h;
    if (typeof plusWireLocks === 'function') plusWireLocks(pop);
    // Previews are drawn small and lazily, only while the panel is open.
    if (V_) pop.querySelectorAll('[data-prev]').forEach(el => { el.style.backgroundImage = 'url("' + V_.dataUri(el.dataset.prev, vp) + '")'; });
  }

  function showLock() {
    lockShown = true;
    const l = document.getElementById('lookLock');
    if (l) { l.classList.remove('hidden'); const b = l.querySelector('.plus-btn'); if (b) b.focus(); l.scrollIntoView({ block: 'nearest' }); }
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b || !ctx) return;
    if (b.id === 'lookClose') { setOpen(false); document.getElementById('lookBtn').focus(); return; }
    const plus = ctx.isPlus();
    let patch = null, isPlus = false;
    if (b.dataset.bgmode) patch = { bgMode: b.dataset.bgmode };
    else if (b.dataset.vstyle) { patch = { bgMode: 'vector', vecStyle: b.dataset.vstyle }; isPlus = isPlusStyle(b.dataset.vstyle); }
    else if (b.dataset.vpal) { patch = { bgMode: 'vector', vecPal: b.dataset.vpal }; isPlus = isPlusPal(b.dataset.vpal); }
    else if (b.dataset.accent) { patch = { accent: b.dataset.accent }; isPlus = isPlusAccent(b.dataset.accent); }
    else if (b.dataset.clock) { patch = { clockStyle: b.dataset.clock }; isPlus = isPlusClock(b.dataset.clock); }
    if (!patch) return;
    // A Plus choice without Plus explains itself instead of quietly doing nothing.
    if (isPlus && !plus) { showLock(); return; }
    lockShown = false;
    ctx.save(patch);
    render();
    const again = document.querySelector('#lookPop [data-' + Object.keys(b.dataset)[0].toLowerCase() + '="' + b.dataset[Object.keys(b.dataset)[0]] + '"]');
    if (again) again.focus();
  }

  function setOpen(open) {
    const pop = document.getElementById('lookPop'), btn = document.getElementById('lookBtn');
    if (!pop || !btn) return;
    if (open) { lockShown = false; render(); }
    pop.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  // Called by newtab.js once its profile is ready.
  api.wire = function (o) {
    ctx = o;
    const btn = document.getElementById('lookBtn'), pop = document.getElementById('lookPop');
    if (!btn || !pop) return;
    btn.addEventListener('click', e => { e.preventDefault(); setOpen(pop.classList.contains('hidden')); });
    pop.addEventListener('click', onClick);
    pop.addEventListener('keydown', e => { if (e.key === 'Escape') { setOpen(false); btn.focus(); } });
    // isConnected: a clicked option re-renders the panel, so it is detached by the time this runs
    document.addEventListener('click', e => { if (!pop.classList.contains('hidden') && e.target.isConnected && !e.target.closest('#lookPop') && !e.target.closest('#lookBtn')) setOpen(false); });
  };
  api.refresh = function () { const pop = document.getElementById('lookPop'); if (pop && !pop.classList.contains('hidden')) render(); };
})(typeof window !== 'undefined' ? window : globalThis);
