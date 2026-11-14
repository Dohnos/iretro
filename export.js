/* ==========================================================
   Export produktů pro Aukro – SPOLEČNÝ pro appku (WhatsApp)
   i dashboard.

   Formát odpovídá souboru, který Aukro při importu přijalo:
   - UTF-8 BEZ značky BOM (s ní Aukro nepoznalo první sloupec entityId)
   - oddělovač čárka, mezi řádky CRLF, za posledním řádkem nic
   - logické hodnoty jako TRUE / FALSE
   - v HTML popisu „&“ místo „&amp;“

   entityId se v každém souboru čísluje znovu od 1: první řádek 1,
   druhý 2 … poslední N. Je tak vždy unikátní v rámci souboru
   a nezávisí na tom, kdy a kde byl produkt přidaný.
   ==========================================================*/
(function () {
  // Pořadí sloupců – MUSÍ sedět s importní šablonou Aukra.
  const EXPORT_HEADERS = [
    "entityId", "name", "language", "extId", "categoryId", "description",
    "auctionPriceAmount", "auctionPriceCurrency", "buyNowPriceAmount",
    "buyNowPriceCurrency", "quantity", "quantityUnit", "startingAt", "duration",
    "reexposeType", "location", "shippingTemplateId", "shippingPayer", "images",
    "bestOffer", "onlyVerifiedBuyersEnabledOverride", "attributes",
    "priorityListing", "boldTitle", "highlight"
  ];
  window.EXPORT_HEADERS = EXPORT_HEADERS;

  // Jedna buňka podle RFC 4180: do uvozovek jen když je potřeba
  // (čárka, uvozovka, konec řádku, mezera na kraji); uvozovky se zdvojí.
  // Popis nabídky je HTML plné uvozovek, takže tohle je důležité.
  function csvCell(value) {
    if (value == null) return "";
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    const s = String(value);
    if (/[",\r\n]/.test(s) || s !== s.trim()) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  // Řádky (objekty se sloupci výše) → text CSV. entityId se přečísluje 1…N.
  window.buildExportCsv = function (rows) {
    const lines = [EXPORT_HEADERS.join(",")];
    rows.forEach((row, i) => {
      const numbered = Object.assign({}, row, { entityId: i + 1 });
      // Uložený popis zůstává v databázi beze změny; jen do exportu jde
      // „&“ místo „&amp;“, stejně jako v souboru, který Aukro přijalo.
      if (typeof numbered.description === "string") {
        numbered.description = numbered.description.replace(/&amp;/g, "&");
      }
      lines.push(EXPORT_HEADERS.map((h) => csvCell(numbered[h])).join(","));
    });
    // Mezi řádky CRLF, za posledním řádkem nic.
    return lines.join("\r\n");
  };

  // CSV jako soubor – čisté UTF-8 bez BOM.
  window.exportCsvFile = function (csv, fileName) {
    return new File([csv], fileName, { type: "text/csv;charset=utf-8" });
  };

  // Stáhne CSV do zařízení.
  window.downloadExportCsv = function (csv, fileName) {
    const url = URL.createObjectURL(window.exportCsvFile(csv, fileName));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // products_DDMMYYYY_<přípona>.csv
  window.exportFileName = function (suffix) {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `products_${pad(d.getDate())}${pad(d.getMonth() + 1)}${d.getFullYear()}_${suffix}.csv`;
  };
})();
