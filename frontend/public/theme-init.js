// runs before react so the page doesn't flash white in dark mode
// (kept as a separate file because the CSP blocks inline scripts)
(function () {
  try {
    var saved = localStorage.getItem("theme") || "system";
    var dark = saved === "dark" || (saved === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {
    // localStorage blocked, just use the default
  }
})();
