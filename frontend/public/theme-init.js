// runs before react so the page doesn't flash the wrong theme
// (kept as a separate file because the CSP blocks inline scripts)
(function () {
  try {
    var root = document.documentElement;
    var mode = localStorage.getItem("theme") || "system";
    var dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);

    // keep this list in sync with src/lib/themes.ts
    var colors = ["zinc", "stone", "slate", "gray", "blue", "green", "orange", "rose", "red", "yellow"];
    var color = localStorage.getItem("theme-color");
    if (colors.indexOf(color) !== -1) root.setAttribute("data-color", color);
  } catch (e) {
    // localStorage blocked, just use the default
  }
})();
