// Runs synchronously in <head>, before the first paint. Reads the tiny snapshot
// the new tab keeps in localStorage (synchronous, unlike chrome.storage) so the
// page can render its real content immediately instead of "--:--" placeholders.
(function () {
  var b = {};
  try { b = JSON.parse(localStorage.getItem('ww_boot') || '{}') || {}; } catch (e) { b = {}; }
  if (b.v !== 1) b = {};
  window.__WW_BOOT = b;
  var de = document.documentElement;
  var mode = b.bgMode === 'gradient' ? 'gradient' : b.bgMode === 'vector' && window.WW_VBG ? 'vector' : 'photos';
  de.setAttribute('data-theme', b.theme || 'dusk');
  de.setAttribute('data-bgmode', mode);
  // A saved Plus palette only paints while Plus was on last time (newtab.js re-checks it right after).
  var V = window.WW_VBG;
  var pal = b.vecPal;
  if (V && V.isPlusPal && V.isPlusPal(pal) && !b.plusOn) pal = 'dawn';
  if (mode === 'vector') de.style.backgroundColor = V.base(pal);
  // Plus accent and clock style, set before first paint so the clock does not jump.
  if (b.plusOn && b.clockStyle && b.clockStyle !== 'classic') de.setAttribute('data-clock', b.clockStyle);

  // Start fetching today's photo right now (before CSS/JS are even parsed).
  var L = window.WW_LANDMARKS || [];
  if (mode === 'photos' && L.length) {
    var d = new Date();
    var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    var idx = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000) % L.length;
    if (b.bgPick && b.bgPick.date === key && b.bgPick.idx >= 0 && b.bgPick.idx < L.length) idx = b.bgPick.idx;
    de.style.backgroundColor = L[idx].c || '';
    var l = document.createElement('link');
    l.rel = 'preload'; l.as = 'image'; l.href = 'bg/' + L[idx].file;
    document.head.appendChild(l);
  }
})();
