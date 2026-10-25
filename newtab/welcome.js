// First-run welcome tour on the new tab: asks for a name, then shows each feature and where to find it.
// Shown once to new users (no name yet, never finished or skipped), and again whenever the page
// is opened with #tour (Settings → "Show the tour again"). Every step can be skipped.
(function () {
  'use strict';

  function shouldShow(state, hasName, forced) {
    if (forced) return true;
    if (state && state.done) return false;
    return !hasName;
  }

  const STEPS = [
    { id: 'name' },
    { id: 'focus', eyebrow: 'Focus sessions', title: 'One focus. <em>One</em> tap.', scene: 'focus',
      text: 'Write what matters today, then press <b>Start focusing</b>. A full-screen timer keeps you on it for 25, 50 or 90 minutes.',
      where: 'On every new tab: type your focus in the middle, or tap <b>Focus</b> at the top right.' },
    { id: 'music', eyebrow: 'Music', title: 'Rain, radio or <em>your</em> Spotify.', scene: 'music',
      text: 'Calm sounds, lofi radio, Spotify and SoundCloud play from your new tab and keep going when you switch tabs.',
      where: 'Open the player at the <b>top left</b> of any new tab. Tap the heart to keep a song one click away.' },
    { id: 'protect', eyebrow: 'Blocking', title: 'Distractions <em>wait</em> until you’re done.', scene: 'protect',
      text: 'During a focus session, sites you mark as distracting are blocked. You can also add a mindful pause, a short-video blocker and an adult-content filter.',
      where: 'Dashboard → <b>Protect</b>. Everything there stays off until you switch it on.' },
    { id: 'stats', eyebrow: 'Private screen time', title: 'Your day, in <em>honest</em> numbers.', scene: 'stats',
      text: 'See your daily score, the sites that took your time and your 24-hour rhythm. It is stored only in this browser: no account, no server. You choose on the next step whether WebWell may count your time at all.',
      where: 'Tap the <b>chart icon</b> at the top right of your new tab, or the WebWell icon in your toolbar.' },
    { id: 'privacy' },
    { id: 'yours' }
  ];

  // Animated feature scenes: a small UI drawn in HTML on a 480x300 stage, with a cursor that
  // moves, clicks and changes it (see the .sc-* keyframes in newtab.css). Loops every 6 s.
  const CURSOR = '<span class="sc-cur"><i class="sc-ring"></i><svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 2.5l13.5 12.2-6 .6 3.6 6.6-2.7 1.4-3.6-6.7-4.8 4z" fill="#fff" stroke="#1d1d1f" stroke-width="1.4" stroke-linejoin="round"/></svg></span>';
  const HEART = (cls) => '<svg class="' + cls + '" viewBox="0 0 24 24" width="15" height="15"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';
  const SCENES = {
    focus: { bg: ['mountains', 'dawn'], html:
      '<div class="sc-nt"><p class="sc-q">What’s your main focus today?</p><p class="sc-f">Finish the landing page copy</p></div>' +
      '<span class="sc-ntbtn">Start focusing</span>' +
      '<div class="sc-card sc-fcard"><p class="sc-cap">Focusing</p><p class="sc-mut">Finish the landing page copy</p>' +
        '<p class="sc-time">24<b>:</b>59</p><div class="sc-track"><i></i></div>' +
        '<div class="sc-chips"><span class="on">Rain</span><span>Waves</span><span>Lofi radio</span></div></div>' },
    music: { bg: ['waves', 'ocean'], html:
      '<div class="sc-card sc-mcard">' +
        '<img class="sc-art" src="img/lofi-girl.webp" alt="">' +
        '<p class="sc-mt">Deep Focus</p><p class="sc-ms">Lofi radio</p><span class="sc-eq"><b></b><b></b><b></b></span>' +
        '<div class="sc-mtrack"><i></i></div>' +
        '<span class="sc-play"><svg class="pl" viewBox="0 0 24 24" width="14" height="14"><path d="M8 5l11 7-11 7z" fill="#fff"/></svg><svg class="pa" viewBox="0 0 24 24" width="14" height="14"><rect x="6" y="5" width="4" height="14" rx="1" fill="#fff"/><rect x="14" y="5" width="4" height="14" rx="1" fill="#fff"/></svg></span>' +
        '<div class="sc-list">' +
          [['Rain', 'Steady rainfall', 'lofi-night'], ['Waves', 'Slow ocean swell', 'lofi-disc'], ['Sweater Weather', 'Your Spotify', 'lofi-sakura']].map((r, i) =>
            '<div class="sc-li"><img src="img/' + r[2] + '.webp" alt=""><span><b>' + r[0] + '</b><em>' + r[1] + '</em></span>' +
            HEART('h-o') + (i === 2 ? HEART('h-f') : '') + '</div>').join('') +
        '</div></div>' },
    protect: { bg: ['hills', 'sakura'], html:
      '<div class="sc-card sc-tcard">' +
        [['Mindful pause', 'on'], ['Short-video blocker', 'flip'], ['Adult-content filter', '']].map(r =>
          '<div class="sc-tr"><span>' + r[0] + '</span><i class="sc-tg ' + r[1] + '"></i></div>').join('') +
      '</div>' +
      '<div class="sc-card sc-bcard"><span class="sc-shield"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ef6a52" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path d="M9.5 12l2 2 3.5-4"/></svg></span>' +
        '<p class="sc-bt">youtube.com can wait.</p><p class="sc-mut">Blocked until your focus session ends.</p>' +
        '<div class="sc-bb"><span class="c">Back to focus</span><span>Unblock</span></div></div>' },
    stats: { bg: ['contours', 'forest'], html:
      '<div class="sc-card sc-scard">' +
        '<svg class="sc-ringc" viewBox="0 0 80 80" width="80" height="80"><circle cx="40" cy="40" r="32" fill="none" stroke="#eeeef1" stroke-width="9"/><circle class="arc" cx="40" cy="40" r="32" fill="none" stroke="#34c759" stroke-width="9" stroke-linecap="round" transform="rotate(-90 40 40)"/></svg>' +
        '<p class="sc-score">82<em>SCORE</em></p>' +
        '<p class="sc-cap sc-today">Today</p><p class="sc-big">5h 12m focused</p><p class="sc-mut sc-up">Up 40 minutes on yesterday</p>' +
        [['github.com', '2h 10m', 100, '#1d1d1f'], ['docs.google.com', '1h 05m', 50, '#5b8def'], ['figma.com', '48m', 37, '#a259ff'], ['youtube.com', '24m', 18, '#ef6a52']].map((r, i) =>
          '<div class="sc-bar sr' + i + '"><span>' + r[0] + '</span><em>' + r[1] + '</em><div><i style="--w:' + r[2] + '%;background:' + r[3] + '"></i></div></div>').join('') +
      '</div>' }
  };
  function sceneHtml(id) {
    const s = SCENES[id];
    const V = typeof window !== 'undefined' && window.WW_VBG;
    const bg = V && V.dataUri ? 'background-image:url(&quot;' + V.dataUri(s.bg[0], s.bg[1]) + '&quot;)' : '';
    return '<div class="wl-scene sc-' + id + '" style="' + bg + '"><div class="sc-stage">' + s.html + CURSOR + '</div></div>';
  }

  // Background choices on the last step. Picking one applies it to the new tab behind the tour.
  const BG_CHOICES = [
    { id: 'photos', label: 'Landmark photos', bg: { bgMode: 'photos' } },
    { id: 'mountains-dawn', label: 'Mountains', bg: { bgMode: 'vector', vecStyle: 'mountains', vecPal: 'dawn' } },
    { id: 'waves-ocean', label: 'Waves', bg: { bgMode: 'vector', vecStyle: 'waves', vecPal: 'ocean' } },
    { id: 'hills-sakura', label: 'Hills', bg: { bgMode: 'vector', vecStyle: 'hills', vecPal: 'sakura' } },
    { id: 'orbs-midnight', label: 'Orbs', bg: { bgMode: 'vector', vecStyle: 'orbs', vecPal: 'midnight' } },
    { id: 'gradient', label: 'Gradient', bg: { bgMode: 'gradient' } }
  ];
  function bgChoiceFor(cur) {
    if (!cur) return 'photos';
    if (cur.bgMode === 'gradient') return 'gradient';
    if (cur.bgMode === 'vector') { const c = BG_CHOICES.find(b => b.bg.vecStyle === cur.vecStyle && b.bg.vecPal === cur.vecPal); return c ? c.id : ''; }
    return 'photos';
  }

  const api = { shouldShow, STEPS, SCENES, sceneHtml, BG_CHOICES, bgChoiceFor };
  if (typeof window === 'undefined') { module.exports = api; return; }
  window.WW_WELCOME = api;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let root = null, step = 0, opts = null, name = '', ended = false;

  // Permissions the user can switch on here. Each needs a click, so it is a real choice.
  const PERMS = {
    track: { permissions: ['tabs', 'webNavigation', 'favicon'] },
    notif: { permissions: ['notifications'] }
  };
  let perm = { track: false, notif: false };
  async function loadPerms() {
    for (const k of Object.keys(PERMS)) {
      try { perm[k] = await chrome.permissions.contains(PERMS[k]); } catch (e) { perm[k] = false; }
    }
  }
  // Called straight from the click so the browser accepts the prompt.
  async function togglePerm(k, btn) {
    if (!PERMS[k]) return;
    let on = perm[k];
    try {
      on = on ? !(await chrome.permissions.remove(PERMS[k])) : await chrome.permissions.request(PERMS[k]);
    } catch (e) {}
    perm[k] = !!on;
    btn.setAttribute('aria-checked', perm[k]);
    btn.classList.toggle('on', perm[k]);
    if (k === 'track') {
      const n = root && root.querySelector('#wlTrackNote');
      if (n) n.classList.toggle('hidden', perm.track);
      try {
        if (perm.track) {
          const st = (await chrome.storage.local.get(['settings'])).settings || {};
          if (st.trackingEnabled === false) { st.trackingEnabled = true; await chrome.storage.local.set({ settings: st }); }
        }
      } catch (e) {}
    }
  }
  function permRow(k, title, text) {
    return '<div class="wl-perm"><div class="wl-perm-t"><b>' + title + '</b><span>' + text + '</span></div>' +
      '<button type="button" class="wl-sw' + (perm[k] ? ' on' : '') + '" role="switch" aria-checked="' + perm[k] + '" aria-label="' + title + '" data-perm="' + k + '"><i></i></button></div>';
  }

  let bgCur = '';
  function tiles() {
    const V = window.WW_VBG;
    return BG_CHOICES.map(c => {
      let style = '';
      if (c.bg.bgMode === 'photos') style = 'background-image:url(img/tour-photos.webp)';
      else if (c.bg.bgMode === 'vector' && V && V.dataUri) style = 'background-image:url(&quot;' + V.dataUri(c.bg.vecStyle, c.bg.vecPal) + '&quot;)';
      return '<button type="button" class="wl-bg' + (c.id === bgCur ? ' on' : '') + '" data-bg="' + c.id + '" aria-pressed="' + (c.id === bgCur) + '">' +
        '<span class="wl-bg-img wl-bg-' + c.bg.bgMode + '" style="' + style + '"></span><span class="wl-bg-label">' + c.label + '</span></button>';
    }).join('');
  }
  async function pickBg(id) {
    const c = BG_CHOICES.find(b => b.id === id);
    if (!c || !root) return;
    bgCur = id;
    root.querySelectorAll('.wl-bg').forEach(b => { const on = b.dataset.bg === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    try { if (opts.onBackground) await opts.onBackground(Object.assign({}, c.bg)); } catch (e) {}
  }

  function stepHtml(i) {
    const s = STEPS[i];
    if (s.id === 'name') {
      return '<div class="wl-solo">' +
        '<img class="wl-logo" src="../icons/icon128.png" alt="">' +
        '<p class="wl-eyebrow">Welcome to WebWell</p>' +
        '<h2 class="wl-title" id="wlTitle">A calmer new tab, <em>made</em> for you.</h2>' +
        '<p class="wl-text">Let’s set it up in under a minute. What should we call you?</p>' +
        '<input class="wl-name" id="wlName" type="text" maxlength="40" placeholder="Your name" autocomplete="off" value="' + esc(name) + '">' +
        '<p class="wl-hint">Shown in your greeting. You can change it any time in Settings. Your data never leaves this device.</p>' +
        '</div>';
    }
    if (s.id === 'privacy') {
      return '<div class="wl-solo wl-priv">' +
        '<p class="wl-eyebrow">Your privacy, your choice</p>' +
        '<h2 class="wl-title" id="wlTitle">You decide what WebWell <em>can see</em>.</h2>' +
        '<p class="wl-text">WebWell never collects your data. No account, no servers, no ads. Everything stays on this device, and you can change these any time.</p>' +
        '<div class="wl-perms">' +
          permRow('track', 'Screen-time tracking', 'Counts the time you spend on the site in your active tab, so you can see where your day goes. Your browser may call this “read your browsing history”. It is never sent anywhere.') +
          permRow('notif', 'Alerts', 'A gentle nudge when a focus session ends or a time limit is reached.') +
        '</div>' +
        '<p class="wl-warn' + (perm.track ? ' hidden' : '') + '" id="wlTrackNote">Without tracking, WebWell cannot count your time, so you won’t get screen-time stats, site limits or the blocked-page message. The timer, music, tasks and backgrounds still work.</p>' +
        '<p class="wl-later"><b>Asked only if you use it:</b> blocking sites, SoundCloud and Spotify, and the AI chat. We will ask first, at that moment.</p>' +
        '</div>';
    }
    if (s.id === 'yours') {
      const hi = name ? ', ' + esc(name) : '';
      return '<div class="wl-solo">' +
        '<p class="wl-eyebrow">You’re all set</p>' +
        '<h2 class="wl-title" id="wlTitle">Make it <em>yours</em>' + hi + '.</h2>' +
        '<p class="wl-text">Pick a background for your new tab. It changes right away, and you can switch any time.</p>' +
        '<div class="wl-tiles" role="group" aria-label="Background">' + tiles() + '</div>' +
        '<ul class="wl-tips">' +
          '<li><b>More backgrounds, clock and theme:</b> the settings icon at the top right of your new tab.</li>' +
          '<li><b>Tasks:</b> the Tasks button at the bottom left.</li>' +
          '<li><b>Pin WebWell:</b> click the puzzle piece in your browser toolbar, then the pin next to WebWell.</li>' +
        '</ul>' +
        '</div>';
    }
    return '<div class="wl-split">' +
      '<div class="wl-copy">' +
        '<p class="wl-eyebrow">' + s.eyebrow + '</p>' +
        '<h2 class="wl-title" id="wlTitle">' + s.title + '</h2>' +
        '<p class="wl-text">' + s.text + '</p>' +
        '<p class="wl-where"><span class="wl-tag">Where</span><span>' + s.where + '</span></p>' +
      '</div>' +
      '<div class="wl-shot" aria-hidden="true">' + sceneHtml(s.scene) + '</div>' +
    '</div>';
  }

  function render() {
    const last = step === STEPS.length - 1;
    root.querySelector('.wl-body').innerHTML = stepHtml(step);
    root.querySelector('.wl-dots').innerHTML = STEPS.map((_, i) => '<i class="' + (i === step ? 'on' : i < step ? 'past' : '') + '"></i>').join('');
    root.querySelector('#wlBack').classList.toggle('invisible', step === 0);
    root.querySelector('#wlNext').textContent = last ? 'Start using WebWell' : step === 0 ? 'Continue' : 'Next';
    root.querySelector('#wlSkip').classList.toggle('invisible', last);
    root.querySelector('.wl-card').setAttribute('data-step', STEPS[step].id);
    fitScene();
    root.querySelectorAll('.wl-bg').forEach(b => b.addEventListener('click', () => pickBg(b.dataset.bg)));
    root.querySelectorAll('.wl-sw').forEach(b => b.addEventListener('click', () => togglePerm(b.dataset.perm, b)));
    const input = root.querySelector('#wlName');
    if (input) {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); next(); } });
      setTimeout(() => input.focus(), 30);
    }
  }

  // The scene is drawn at 480x300 and scaled to whatever width the layout gives it.
  function fitScene() {
    if (!root) return;
    const sc = root.querySelector('.wl-scene');
    if (!sc) return;
    const w = sc.clientWidth;
    if (w) sc.querySelector('.sc-stage').style.transform = 'scale(' + (w / 480) + ')';
  }

  async function saveName() {
    const input = root.querySelector('#wlName');
    if (!input) return;
    const v = input.value.trim();
    if (v && v !== name) {
      name = v;
      try { await opts.onName(v); } catch (e) {}
    }
  }

  async function next() {
    if (step === 0) await saveName();
    if (step >= STEPS.length - 1) return finish(false);
    step++; render();
  }
  async function back() {
    if (step === 0) return;
    step--; render();
  }

  async function finish(skipped) {
    if (ended) return;
    ended = true;
    if (step === 0) await saveName();
    try { await chrome.storage.local.set({ ntWelcome: { done: true, skipped: !!skipped, at: Date.now() } }); } catch (e) {}
    root.classList.add('leaving');
    setTimeout(() => { root.remove(); root = null; }, 260);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', fitScene);
    if (opts.onEnd) opts.onEnd();
  }

  function onKey(e) {
    if (!root) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(true); return; }
    const typing = e.target && e.target.id === 'wlName';
    if (typing) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  }

  function build() {
    root = document.createElement('div');
    root.className = 'welcome';
    root.id = 'welcome';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'wlTitle');
    root.innerHTML =
      '<div class="wl-card">' +
        '<div class="wl-top"><span class="wl-brand"><img src="../icons/icon48.png" alt="">WebWell</span>' +
          '<button type="button" class="wl-skip" id="wlSkip">Skip tour</button></div>' +
        '<div class="wl-body"></div>' +
        '<div class="wl-foot">' +
          '<button type="button" class="wl-back" id="wlBack">Back</button>' +
          '<div class="wl-dots" aria-hidden="true"></div>' +
          '<button type="button" class="wl-next" id="wlNext">Continue</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    root.querySelector('#wlSkip').addEventListener('click', () => finish(true));
    root.querySelector('#wlBack').addEventListener('click', back);
    root.querySelector('#wlNext').addEventListener('click', next);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', fitScene);
  }

  // opts: { name, bg: { bgMode, vecStyle, vecPal }, forced, onName(v) -> Promise, onBackground(bg) -> Promise, onEnd() }. Resolves true if the tour was shown.
  api.start = async function (o) {
    opts = o || {};
    if (root) return true;
    let state = null;
    try { state = (await chrome.storage.local.get(['ntWelcome'])).ntWelcome || null; } catch (e) {}
    const forced = !!opts.forced;
    if (!shouldShow(state, !!opts.name, forced)) return false;
    if (!forced && document.body.classList.contains('locked')) return false;
    name = opts.name || ''; step = 0; ended = false; bgCur = bgChoiceFor(opts.bg);
    await loadPerms();
    build(); render();
    return true;
  };
})();
