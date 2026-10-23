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
    { id: 'focus', eyebrow: 'Focus sessions', title: 'One focus. <em>One</em> tap.', img: 'img/tour/focus.webp',
      text: 'Write what matters today, then press <b>Start focusing</b>. A full-screen timer keeps you on it for 25, 50 or 90 minutes.',
      where: 'On every new tab: type your focus in the middle, or tap <b>Focus</b> at the top right.' },
    { id: 'music', eyebrow: 'Music', title: 'Rain, radio or <em>your</em> Spotify.', img: 'img/tour/music.webp',
      text: 'Calm sounds, lofi radio, Spotify and SoundCloud play from your new tab and keep going when you switch tabs.',
      where: 'Open the player at the <b>top left</b> of any new tab. Tap the heart to keep a song one click away.' },
    { id: 'protect', eyebrow: 'Blocking', title: 'Distractions <em>wait</em> until you’re done.', img: 'img/tour/protect.webp',
      text: 'During a focus session, sites you mark as distracting are blocked. You can also add a mindful pause, a short-video blocker and an adult-content filter.',
      where: 'Dashboard → <b>Protect</b>. Everything there stays off until you switch it on.' },
    { id: 'stats', eyebrow: 'Private screen time', title: 'Your day, in <em>honest</em> numbers.', img: 'img/tour/stats.webp',
      text: 'See your daily score, the sites that took your time and your 24-hour rhythm. It is stored only in this browser: no account, no server.',
      where: 'Tap the <b>chart icon</b> at the top right of your new tab, or the WebWell icon in your toolbar.' },
    { id: 'yours' }
  ];

  const api = { shouldShow, STEPS };
  if (typeof window === 'undefined') { module.exports = api; return; }
  window.WW_WELCOME = api;

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let root = null, step = 0, opts = null, name = '', ended = false;

  function tiles() {
    const V = window.WW_VBG;
    if (!V || !V.dataUri) return '';
    return [['mountains', 'dawn'], ['waves', 'ocean'], ['hills', 'sakura']]
      .map(t => '<span class="wl-tile" style="background-image:url(&quot;' + V.dataUri(t[0], t[1]) + '&quot;)"></span>').join('');
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
        '<p class="wl-hint">Shown in your greeting. You can change it any time in Settings.</p>' +
        '</div>';
    }
    if (s.id === 'yours') {
      const hi = name ? ', ' + esc(name) : '';
      return '<div class="wl-solo">' +
        '<p class="wl-eyebrow">You’re all set</p>' +
        '<h2 class="wl-title" id="wlTitle">Make it <em>yours</em>' + hi + '.</h2>' +
        '<p class="wl-text">Pick a landmark photo, a calm vector scene or an animated gradient. Add your favourite sites to the dock and keep a short task list for today.</p>' +
        '<div class="wl-tiles" aria-hidden="true">' + tiles() + '</div>' +
        '<ul class="wl-tips">' +
          '<li><b>Backgrounds, clock and theme:</b> the settings icon at the top right of your new tab.</li>' +
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
      '<div class="wl-shot"><img src="' + s.img + '" alt=""></div>' +
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
    const input = root.querySelector('#wlName');
    if (input) {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); next(); } });
      setTimeout(() => input.focus(), 30);
    }
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
  }

  // opts: { name, forced, onName(v) -> Promise, onEnd() }. Resolves true if the tour was shown.
  api.start = async function (o) {
    opts = o || {};
    if (root) return true;
    let state = null;
    try { state = (await chrome.storage.local.get(['ntWelcome'])).ntWelcome || null; } catch (e) {}
    const forced = !!opts.forced;
    if (!shouldShow(state, !!opts.name, forced)) return false;
    if (!forced && document.body.classList.contains('locked')) return false;
    name = opts.name || ''; step = 0; ended = false;
    build(); render();
    return true;
  };
})();
