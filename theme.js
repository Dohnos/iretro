/* ---------------------------------
   Přepínač světlý / tmavý režim
   Sdílené pro index.html i dashboard.html.
   Ikony bere z icons.js (musí být načtený dřív).
   Volba se ukládá do localStorage ("theme"); bez uložené volby se
   řídí nastavením systému.

   Tlačítko se vloží do hlavičky stránky (prvek s atributem
   data-topbar-actions). Kde hlavička není, plave vpravo nahoře.
-----------------------------------*/
(function () {
  const KEY = "theme";

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    // Barva lišty prohlížeče (Safari, Chrome na Androidu) podle motivu.
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = theme === "dark" ? "#0a0a0a" : "#ffffff";
  }

  function readSaved() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  // Nastavíme co nejdřív (skript je v <head>), ať to neblikne.
  const prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  apply(readSaved() || (prefersDark ? "dark" : "light"));

  function buildToggle() {
    if (document.getElementById("theme-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "theme-toggle";
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
      try {
        localStorage.setItem(KEY, next);
      } catch (e) {
        /* soukromé okno – volba platí jen do zavření stránky */
      }
      refreshLabel();
    });

    const slot = document.querySelector("[data-topbar-actions]");
    if (slot) {
      btn.className = "btn btn--ghost btn--icon topbar-btn theme-toggle";
      slot.appendChild(btn); // motiv je v hlavičce vždy poslední
    } else {
      btn.className = "theme-toggle is-floating";
      document.body.appendChild(btn);
    }
  }

  if (document.body) buildToggle();
  else document.addEventListener("DOMContentLoaded", buildToggle);
})();
