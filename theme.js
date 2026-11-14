/* ---------------------------------
   Přepínač světlý / tmavý režim
   Sdílené pro index.html i dashboard.html.
   Ikony bere z icons.js (musí být načtený dřív).
   Volba se ukládá do localStorage ("theme").
-----------------------------------*/
(function () {
  const KEY = "theme";

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  // Nastavíme co nejdřív (skript je v <head>), ať to neblikne.
  const saved = localStorage.getItem(KEY) || "dark";
  apply(saved);

  function buildToggle() {
    if (document.getElementById("theme-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "theme-toggle";
    btn.className = "theme-toggle";
    btn.type = "button";
    btn.title = "Přepnout světlý / tmavý režim";

    function refreshLabel() {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      btn.innerHTML = window.icon(dark ? "sun" : "moon");
      btn.setAttribute("aria-label", dark ? "Zapnout světlý režim" : "Zapnout tmavý režim");
    }
    refreshLabel();

    btn.addEventListener("click", () => {
      const next =
        document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next);
      localStorage.setItem(KEY, next);
      refreshLabel();
    });

    document.body.appendChild(btn);
  }

  if (document.body) buildToggle();
  else document.addEventListener("DOMContentLoaded", buildToggle);
})();
