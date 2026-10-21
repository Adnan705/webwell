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
