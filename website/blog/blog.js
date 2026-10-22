(function () {
  var root = document.documentElement, btn = document.getElementById("theme-btn");
  if (!btn) return;
  function apply(t) { root.setAttribute("data-theme", t); btn.setAttribute("aria-label", t === "dark" ? "Switch to light mode" : "Switch to dark mode"); }
  var saved = null; try { saved = localStorage.getItem("ww-theme"); } catch (e) {}
  apply(saved === "dark" ? "dark" : "light");
  btn.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    apply(next); try { localStorage.setItem("ww-theme", next); } catch (e) {}
  });
})();

(function () {
  document.querySelectorAll("[data-copy-target]").forEach(function (b) {
    b.addEventListener("click", function () {
      var el = document.getElementById(b.getAttribute("data-copy-target")); if (!el) return;
      var done = function () { var t = b.textContent; b.textContent = "Copied"; setTimeout(function () { b.textContent = t; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.value).then(done, function () { el.select(); });
      else { el.select(); try { document.execCommand("copy"); done(); } catch (e) {} }
    });
  });
})();
