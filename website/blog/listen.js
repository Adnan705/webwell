// Listen: reads a blog post aloud with the visitor's own device voice, one paragraph at a time.
// Adds its bar under the byline. Nothing is sent anywhere; it uses the browser's built-in speech.
(function () {
  var art = document.querySelector("article.doc"), by = art && art.querySelector(".byline");
  if (!art || !by || !("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) return;
  var synth = window.speechSynthesis;
  var box = document.createElement("div");
  box.className = "listen";
  box.innerHTML = '<button type="button" class="ls-main" aria-label="Listen to this article"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path class="ls-play" d="M8 5v14l11-7z"/><path class="ls-pause" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg><span>Listen</span></button>' +
    '<button type="button" class="ls-stop" aria-label="Stop listening" hidden><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg></button>' +
    '<label class="ls-speed" hidden><span>Speed</span><select aria-label="Reading speed"><option value="0.85">0.85x</option><option value="1" selected>1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="1.75">1.75x</option></select></label>' +
    '<span class="ls-st" role="status" aria-live="polite"></span>';
  by.parentNode.insertBefore(box, by.nextSibling);
  var main = box.querySelector(".ls-main"), stop = box.querySelector(".ls-stop"), sp = box.querySelector(".ls-speed"), sel = sp.querySelector("select"), st = box.querySelector(".ls-st"), label = main.querySelector("span");
  var parts = [], idx = 0, state = "idle", run = 0;          // state: idle | playing | paused

  function words(el) { return (el.textContent || "").replace(/\s+/g, " ").trim(); }
  function build() {
    parts = [];
    var h1 = art.querySelector("h1");
    if (h1) parts.push({ text: words(h1) + ". " + words(by).replace(/\s*·\s*/g, ", ").replace(/^By /, "By ") + "." });
    var list = art.querySelectorAll("h2,h3,p,li,blockquote,tr");
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === by || by.contains(el) || box.contains(el)) continue;
      if (el.closest("pre,textarea,button,nav,aside,figure,.copy,[aria-hidden='true']")) continue;
      var tag = el.tagName;
      if (tag !== "TR" && tag !== "LI" && el.parentElement && el.parentElement.closest("li,blockquote,tr")) continue;
      if (tag === "LI" && el.parentElement && el.parentElement.closest("li") && el.querySelector("ul,ol")) continue;
      if (/^H[23]$/.test(tag) && /^(sources|references)$/i.test(words(el))) { parts.push({ text: "The sources are listed at the end of the article." }); break; }
      var t = tag === "TR" ? [].map.call(el.children, words).filter(Boolean).join(". ") + "." : words(el);
      if (t && t !== ".") parts.push({ el: el, text: t });
    }
  }
  function mark(p) {
    [].forEach.call(art.querySelectorAll(".reading"), function (n) { n.classList.remove("reading"); });
    if (p && p.el) { p.el.classList.add("reading"); var r = p.el.getBoundingClientRect(); if (r.top < 80 || r.bottom > innerHeight - 80) p.el.scrollIntoView({ block: "center" }); }
  }
  function ui() {
    var on = state !== "idle";
    label.textContent = state === "playing" ? "Pause" : state === "paused" ? "Resume" : "Listen";
    main.setAttribute("aria-label", state === "playing" ? "Pause listening" : state === "paused" ? "Resume listening" : "Listen to this article");
    box.classList.toggle("playing", state === "playing");
    stop.hidden = !on; sp.hidden = !on;
  }
  function say() {
    var me = ++run;
    if (idx >= parts.length) { finish("Finished."); return; }
    var p = parts[idx], u = new SpeechSynthesisUtterance(p.text);
    u.rate = parseFloat(sel.value) || 1; u.lang = document.documentElement.lang || "en";
    u.onend = function () { if (me !== run || state !== "playing") return; idx++; say(); };
    u.onerror = function (e) { if (me !== run) return; if (e && (e.error === "canceled" || e.error === "interrupted")) return; finish("Could not play audio on this device."); };
    mark(p); st.textContent = "";
    synth.cancel(); synth.speak(u);
  }
  function finish(msg) { run++; synth.cancel(); state = "idle"; idx = 0; mark(null); ui(); st.textContent = msg || ""; }
  main.addEventListener("click", function () {
    if (state === "idle") { build(); idx = 0; state = "playing"; ui(); say(); }
    else if (state === "playing") { run++; synth.cancel(); state = "paused"; ui(); st.textContent = "Paused."; }   // cancel, not pause(): pause() is unreliable on phones
    else { state = "playing"; ui(); say(); }
  });
  stop.addEventListener("click", function () { finish("Stopped."); main.focus(); });
  sel.addEventListener("change", function () { if (state === "playing") say(); });
  window.addEventListener("pagehide", function () { synth.cancel(); });
  ui();
})();
