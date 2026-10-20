/* WebWell site analytics: Google Analytics 4, loaded only after the visitor accepts. Inert while GA_ID is empty. */
(function () {
  var GA_ID = 'G-5YHM8S6XM2'; // e.g. 'G-XXXXXXXXXX'
  if (!GA_ID) return;
  var KEY = 'ww-consent';
  var get = function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  var set = function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} };

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });

  var loaded = false;
  function load() {
    if (loaded) return; loaded = true;
    gtag('consent', 'update', { analytics_storage: 'granted' });
    var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }
  function track(name, params) { if (loaded) gtag('event', name, params || {}); }

  function where(el) {
    if (el.closest('.nav, .nav-shell')) return 'nav';
    if (el.closest('.hero')) return 'hero';
    if (el.closest('.cta-band')) return 'closing';
    if (el.closest('footer')) return 'footer';
    if (el.closest('.step')) return 'install_page';
    return 'page';
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('a, button'); if (!el) return;
    var href = el.getAttribute('href') || '';
    var p = { location: where(el) };
    if (el.hasAttribute('data-install') && el.getAttribute('aria-disabled') === 'true') return track('webstore_click', p);
    if (href === '/install') return track('install_click', p);
    if (/main\.zip$/.test(href)) return track('download_zip', p);
    if (el.hasAttribute('data-copy')) return track('copy_extensions_url', { target: el.getAttribute('data-copy') });
    if (el.id === 'vbig' || el.id === 'vplay') return track('video_play', p);
    if (href.indexOf('mailto:') === 0) return track('email_click', p);
    if (href.indexOf('github.com') > -1 || el.hasAttribute('data-github')) return track('github_click', p);
  }, true);

  function banner() {
    var css = '.ww-cb{position:fixed;left:16px;right:16px;bottom:16px;z-index:100;max-width:560px;margin-inline:auto;padding:16px 18px;border-radius:18px;background:var(--card,#fff);color:var(--ink,#18171c);border:1px solid var(--rule,#e9e6e3);box-shadow:0 20px 50px -20px rgba(24,23,28,.35);font:400 14px/1.5 var(--f-sans,system-ui,sans-serif)}' +
      '.ww-cb p{margin:0 0 12px;color:var(--ink-2,#57555d)}.ww-cb a{text-decoration:underline;text-underline-offset:3px}.ww-cb div{display:flex;gap:8px;justify-content:flex-end}' +
      '.ww-cb button{font:500 14px/1 var(--f-sans,system-ui,sans-serif);height:38px;padding:0 16px;border-radius:999px;border:1px solid var(--rule,#e9e6e3);background:var(--card,#fff);color:inherit;cursor:pointer}' +
      '.ww-cb button.ok{background:#e8553f;border-color:#c9412c;color:#fff}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    var b = document.createElement('div'); b.className = 'ww-cb'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Cookie choice');
    b.innerHTML = '<p>I use Google Analytics to see how many people visit and click install. It sets cookies and is off unless you accept. The WebWell extension itself never tracks you. <a href="/privacy#website">Details</a></p><div><button type="button" class="no">No thanks</button><button type="button" class="ok">Accept</button></div>';
    document.body.appendChild(b);
    b.querySelector('.ok').onclick = function () { set('yes'); b.remove(); load(); };
    b.querySelector('.no').onclick = function () { set('no'); b.remove(); };
  }

  function init() {
    var c = get();
    if (c === 'yes') load(); else if (c !== 'no') banner();
    var fl = document.querySelector('.foot-links');
    if (fl) { var a = document.createElement('a'); a.href = '#'; a.textContent = 'Cookie choice'; a.onclick = function (e) { e.preventDefault(); try { localStorage.removeItem(KEY); } catch (x) {} location.reload(); }; fl.appendChild(a); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
