/* ==========================================================
   Drobné UI pomůcky – SPOLEČNÉ pro appku i dashboard.
   ==========================================================*/
(function () {
  // České skloňování: pluralCz(5, "produkt", "produkty", "produktů") → "5 produktů"
  window.pluralCz = function (n, one, few, many) {
    const word = n === 1 ? one : n >= 2 && n <= 4 ? few : many;
    return `${n} ${word}`;
  };

  // Dnešní datum YYYY-MM-DD v místním čase. toISOString() vrací UTC, takže
  // v Česku by mezi půlnocí a 1–2 hodinou ráno vracel ještě včerejšek.
  window.localDateString = function (date) {
    const d = date || new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // Když je otevřený modál, stránka pod ním se nemá posouvat (na iPhonu
  // jinak scroll „propadává“ do pozadí). Hlídáme třídu is-active na všech
  // modálech, takže to funguje i pro modály vytvořené až za běhu (ořez).
  function syncScrollLock() {
    const open = document.querySelector(".modal.is-active");
    document.documentElement.classList.toggle("has-modal", !!open);
  }
  function watch() {
    new MutationObserver((records) => {
      if (records.some((r) => r.target.classList && r.target.classList.contains("modal"))) {
        syncScrollLock();
      }
    }).observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true });
  }
  if (document.body) watch();
  else document.addEventListener("DOMContentLoaded", watch);
})();
