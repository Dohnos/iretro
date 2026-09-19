/* ==========================================================
   Kategorie z MapaKat.txt – SPOLEČNÉ pro appku i dashboard.

   Soubor se stáhne jen jednou; appka ho potřebuje při zakládání
   produktu, dashboard při jeho úpravě.
   ==========================================================*/
(function () {
  // Soubor má tvar:
  //   #### Název skupiny
  //   - Název kategorie (12345)
  function parseCategoriesHierarchically(text) {
    const lines = text.split("\n");
    let groups = [];
    let currentGroup = null;
    lines.forEach((line) => {
      if (line.startsWith("####")) {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { name: line.replace(/#+/g, "").trim(), cats: [] };
      } else if (line.match(/\((\d+)\)/)) {
        const match = line.match(/(.*)\((\d+)\)/);
        if (match && currentGroup) {
          currentGroup.cats.push({
            name: match[1].replace(/[-*•]/g, "").trim(),
            id: parseInt(match[2])
          });
        }
      }
    });
    if (currentGroup) groups.push(currentGroup);
    return groups;
  }

  let pending = null;

  // Vrátí Promise se seznamem skupin: [{ name, cats: [{ name, id }] }]
  window.loadCategoryGroups = function () {
    if (!pending) {
      pending = fetch("MapaKat.txt")
        .then((response) => response.text())
        .then(parseCategoriesHierarchically)
        .catch((err) => {
          // Ať jde načtení zkusit znovu (např. po výpadku sítě).
          pending = null;
          throw err;
        });
    }
    return pending;
  };

  // Najde název kategorie podle ID (12345 -> "Hodinky")
  window.findCategoryName = function (groups, id) {
    const wanted = parseInt(id, 10);
    if (isNaN(wanted)) return null;
    const list = groups || [];
    for (let i = 0; i < list.length; i++) {
      const hit = (list[i].cats || []).find((c) => c.id === wanted);
      if (hit) return hit.name;
    }
    return null;
  };
})();
