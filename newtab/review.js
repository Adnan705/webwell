// One quiet, optional "would you review WebWell?" card on the new tab.
// Shown at most twice, only after the person has actually used focus sessions, never during one,
// and never again after any answer. Nothing is sent anywhere: the button just opens the store page.
(function () {
  'use strict';
  const STORE_REVIEWS = 'https://chromewebstore.google.com/detail/webwell/mnjakeggjhfdookcdgjdgmamhcobnofi/reviews';
  const DAY = 86400000, MIN_AGE_DAYS = 2, MIN_SESSIONS = 3, SNOOZE_DAYS = 14, MAX_ASKS = 2;

  function shouldAsk(now, rv, sessions) {
    if (!rv || !rv.firstSeen) return false;
    if (rv.state === 'done' || rv.state === 'never') return false;
    if (now - rv.firstSeen < MIN_AGE_DAYS * DAY) return false;
    if (rv.nextAt && now < rv.nextAt) return false;
    return sessions >= MIN_SESSIONS;
  }
  function totalSessions(log) {
    let n = 0; for (const k of Object.keys(log || {})) n += (log[k] && log[k].sessions) | 0; return n;
  }
  const api = { shouldAsk, totalSessions, STORE_REVIEWS };
  if (typeof window === 'undefined') { module.exports = api; return; }
  window.WW_REVIEW = api;

  const $ = id => document.getElementById(id);
  let rv = null;
  const save = () => { try { chrome.storage.local.set({ ntReview: rv }); } catch (e) {} };
  const hide = () => { const c = $('reviewCard'); if (c) c.classList.add('hidden'); };

  async function init() {
    const card = $('reviewCard'); if (!card) return;
    let r = {};
    try { r = await chrome.storage.local.get(['ntReview', 'focusLog']); } catch (e) { return; }
    rv = Object.assign({ firstSeen: 0, state: '', nextAt: 0, asked: 0 }, r.ntReview || {});
    if (!rv.firstSeen) { rv.firstSeen = Date.now(); save(); }
    if (!shouldAsk(Date.now(), rv, totalSessions(r.focusLog))) return;

    $('reviewYes').addEventListener('click', () => {
      rv.state = 'done'; save(); hide();
      try { chrome.tabs.create({ url: STORE_REVIEWS }); } catch (e) { window.open(STORE_REVIEWS, '_blank', 'noopener'); }
    });
    $('reviewLater').addEventListener('click', () => {
      rv.asked = (rv.asked | 0) + 1; rv.nextAt = Date.now() + SNOOZE_DAYS * DAY;
      if (rv.asked >= MAX_ASKS) rv.state = 'never';
      save(); hide();
    });
    $('reviewNo').addEventListener('click', () => { rv.state = 'never'; save(); hide(); });

    // wait a moment so it never competes with the page loading, and never appear during a focus session
    setTimeout(() => { if (!document.body.classList.contains('locked') && !document.hidden) card.classList.remove('hidden'); }, 3500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
