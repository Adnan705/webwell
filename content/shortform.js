// WebWell short-video blocker (registered only while the feature is on).
// Network rules catch full page loads; this catches in-app navigation on
// single-page sites and hides the Shorts/Reels entry points.
(function () {
  'use strict';
  if (window.__wwShortform) return;
  window.__wwShortform = true;

  const host = location.hostname.replace(/^(www|m|web)\./, '');
  const SITES = {
    'youtube.com': {
      key: 'youtube',
      path: /^\/shorts(\/|$)/,
      css: [
        'ytd-reel-shelf-renderer', 'ytd-rich-shelf-renderer[is-shorts]',
        'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
        'ytd-guide-entry-renderer:has(a[href^="/shorts"])', 'ytd-mini-guide-entry-renderer[aria-label="Shorts"]',
        'ytd-video-renderer:has(a[href^="/shorts/"])', 'ytd-grid-video-renderer:has(a[href^="/shorts/"])',
        'ytd-rich-item-renderer:has(a[href^="/shorts/"])', 'grid-shelf-view-model:has(a[href^="/shorts/"])',
        'ytm-shorts-lockup-view-model', 'ytm-reel-shelf-renderer', 'yt-tab-shape[tab-title="Shorts"]',
        'ytm-pivot-bar-item-renderer:has(.pivot-shorts)'
      ]
    },
    'instagram.com': {
      key: 'instagram',
      path: /^\/(reels?|[^/]+\/reels?)(\/|$)/,
      css: ['a[href="/reels/"]', 'a[href^="/reels/"]', 'a[href*="/reel/"]']
    },
    'facebook.com': {
      key: 'facebook',
      path: /^\/(reels?|watch\/reels?)(\/|$)/,
      css: ['a[href*="/reel/"]', 'a[href*="/reels/"]', 'div[aria-label="Reels"]']
    },
    'snapchat.com': {
      key: 'snapchat',
      path: /^\/spotlight(\/|$)/,
      css: ['a[href^="/spotlight"]']
    }
  };
  const site = SITES[host] || SITES[Object.keys(SITES).find(k => host.endsWith('.' + k))];
  if (!site) return;

  let on = false, styleEl = null;

  function blockedUrl() {
    return chrome.runtime.getURL('blocked/blocked.html') + '?r=shorts&u=' + encodeURIComponent(location.href);
  }

  function check() {
    if (on && site.path.test(location.pathname)) location.replace(blockedUrl());
  }

  function applyCss() {
    if (on && !styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'ww-shortform';
      styleEl.textContent = site.css.join(',\n') + ' { display: none !important; }';
      (document.head || document.documentElement).appendChild(styleEl);
    } else if (!on && styleEl) {
      styleEl.remove(); styleEl = null;
    }
  }

  function load() {
    chrome.storage.local.get('protect', r => {
      const p = r.protect || {};
      const shorts = Object.assign({ youtube: true, instagram: true, facebook: true, snapchat: true }, p.shorts || {});
      on = !!(p.shortsOn && shorts[site.key]);
      applyCss();
      check();
    });
  }

  load();
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.protect) load(); });

  // Single-page apps change the URL without reloading.
  let last = location.href;
  setInterval(() => { if (location.href !== last) { last = location.href; check(); } }, 400);
  window.addEventListener('yt-navigate-start', check, true);
  window.addEventListener('popstate', check, true);
})();
