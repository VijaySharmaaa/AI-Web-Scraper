(function () {
  try {
    var root = document.documentElement;
    var mode = localStorage.getItem("theme") || "system";
    var dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", dark);

    var colors = ["zinc", "stone", "slate", "gray"];
    var color = localStorage.getItem("theme-color");
    if (colors.indexOf(color) !== -1) root.setAttribute("data-color", color);
  } catch (e) {}
})();
