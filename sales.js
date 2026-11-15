/* ==========================================================
   Ceny prodejů – SPOLEČNÉ pro dashboard i appku.

   • parseAukroSales(text) – z textu zkopírovaného ze seznamu
     skončených aukcí na Aukru vytáhne každou aukci: ID produktu
     (za „|“), číslo aukce, konec, kupujícího a cenu.
   • mergeSales(staré, nové) – sloučí historii bez duplicit
     (klíčem je číslo aukce, takže opakovaný import nic nezdvojí).
   • suggestPrice(název, kategorie, produkty) – cena podle podobných
     prodaných předmětů (stejný autor / výrobce / název, kategorie).

   Kupující Aledas a Ebisu jsou vlastní účty – aukce, kterou
   „vyhráli“, se uloží (je vidět v grafu), ale jako prodej se
   nepočítá a do našeptávání ceny nevstupuje.
   ==========================================================*/
(function () {
  const SALES_SKIP_BUYERS = ["aledas", "ebisu"];

  // Měsíce v 2. pádě, jak je píše Aukro („8. listopadu 2026“).
  const MONTHS = {
    ledna: 0, unora: 1, brezna: 2, dubna: 3, kvetna: 4, cervna: 5,
    cervence: 6, srpna: 7, zari: 8, rijna: 9, listopadu: 10, prosince: 11
  };

  function stripDiacritics(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function isRealBuyer(buyer) {
    return !buyer || !SALES_SKIP_BUYERS.includes(String(buyer).toLowerCase());
  }

  // „1 189 Kč“ (mezery i pevné mezery) → 1189
  function parseKc(s) {
    const n = parseInt(String(s).replace(/[\s  .]/g, ""), 10);
    return isNaN(n) ? null : n;
  }

  // „skončeno (ne 8. listopadu 2026, 20:00:00)“ → ISO (místní čas)
  function parseEnded(segment) {
    const m = /skon[čc]eno\s*\((?:[^\d)]*?)(\d{1,2})\.\s*([^\s\d,]+)\s+(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/i.exec(segment);
    if (!m) return null;
    const month = MONTHS[stripDiacritics(m[2]).toLowerCase()];
    if (month == null) return null;
    const d = new Date(+m[3], month, +m[1], +m[4], +m[5], +(m[6] || 0));
    return isNaN(d) ? null : d.toISOString();
  }

  // Normalizovaný klíč ID: „ra086“ i „RA86“ → „RA86“.
  function idKey(prefix, num) {
    return String(prefix).toUpperCase() + parseInt(num, 10);
  }

  /* Rozbor textu z Aukra. Každá aukce má na samostatném řádku své
     číslo v závorce „(7140052063)“ – podle něj se text rozdělí:
       • před číslem je název aukce „… | RA86“ (Aukro ho opakuje),
       • za číslem konec aukce, „Kupující:“ a „Cena“ / „Kup teď“.
     Vrací [{ key, title, auction, ended_at, buyer, price, buy_now, real }]
     v pořadí z textu. Aukce bez ID nebo bez ceny se vynechají. */
  function parseAukroSales(text) {
    const src = String(text || "").replace(/\r\n?/g, "\n");
    const anchors = [];
    const reAuction = /^[ \t]*\((\d{6,})\)[ \t]*$/gm;
    let m;
    while ((m = reAuction.exec(src))) anchors.push({ at: m.index, end: m.index + m[0].length, auction: m[1] });

    const out = [];
    anchors.forEach((a, i) => {
      const before = src.slice(i ? anchors[i - 1].end : 0, a.at);
      const after = src.slice(a.end, i + 1 < anchors.length ? anchors[i + 1].at : src.length);

      // Poslední „| ID“ před číslem aukce patří k této aukci.
      const reId = /^(.*?)\|\s*([A-Za-z]{1,6})\s*(\d{1,6})(?!\d)/gm;
      let last = null, im;
      while ((im = reId.exec(before))) last = im;
      if (!last) return;

      const priceM = /^[ \t]*(Cena|Kup\s+te[ďd])[ \t:]+([\d   .]+?)\s*K[čc]/im.exec(after);
      const price = priceM ? parseKc(priceM[2]) : null;
      if (price == null) return;

      // Jen „Kupující:“ s dvojtečkou – řádek „Kupující 1“ je počet kupujících.
      const buyerM = /Kupuj[ií]c[ií]\s*:\s*([^\s(]+)/i.exec(after);
      const buyer = buyerM ? buyerM[1] : null;

      out.push({
        key: idKey(last[2], last[3]),
        title: last[1].replace(/\s+$/, "").replace(/^\s+/, ""),
        auction: a.auction,
        ended_at: parseEnded(after),
        buyer,
        price,
        buy_now: !!priceM && /^kup/i.test(priceM[1]),
        real: isRealBuyer(buyer)
      });
    });
    return out;
  }

  // Sloučí historii prodejů. Vrací { merged, added } – merged je seřazený
  // od nejstarší aukce, added = kolik aukcí je nových.
  function mergeSales(existing, incoming) {
    const byAuction = new Map();
    (Array.isArray(existing) ? existing : []).forEach((s) => byAuction.set(String(s.auction), s));
    let added = 0;
    (incoming || []).forEach((s) => {
      const k = String(s.auction);
      if (byAuction.has(k)) return;
      byAuction.set(k, {
        auction: k,
        price: s.price,
        buy_now: !!s.buy_now,
        ended_at: s.ended_at || null,
        buyer: s.buyer || null,
        real: s.real !== false,
        title: s.title || null
      });
      added++;
    });
    const merged = Array.from(byAuction.values()).sort((a, b) =>
      String(a.ended_at || "").localeCompare(String(b.ended_at || ""))
    );
    return { merged, added };
  }

  function salesOf(p) {
    return p && Array.isArray(p.sales) ? p.sales : [];
  }
  function realSalesOf(p) {
    return salesOf(p).filter((s) => s.real !== false && s.price != null);
  }
  // Poslední skutečný prodej (podle konce aukce).
  function lastRealSale(p) {
    const list = realSalesOf(p);
    let best = null;
    list.forEach((s) => {
      if (!best || String(s.ended_at || "") > String(best.ended_at || "")) best = s;
    });
    return best;
  }

  function formatKc(n) {
    if (n == null || n === "") return "—";
    return Number(n).toLocaleString("cs-CZ") + " Kč";
  }

  /* --- Podobnost názvů ---
     Názvy se porovnávají podle slov bez diakritiky. Obecná slova
     („nádherný“, „starožitný“, „retro“…) se nepočítají – zbude autor,
     výrobce a typ předmětu (URBACH, PRIM, KRAVSKO, VÁZA, LUSTR…).
     Slova se zkracují na základ (prvních 5 písmen), takže „váza“
     najde i „vázy“ a „lustr“ i „lustry“. */
  const STOPWORDS = new Set([
    "top", "nadherny", "nadherna", "nadherne", "nadhernou", "starozitny", "starozitna",
    "starozitne", "starozitnou", "stary", "stara", "stare", "retro", "mohutny", "mohutna",
    "mohutne", "krasny", "krasna", "krasne", "honosny", "honosna", "honosne", "vintage",
    "original", "puvodni", "velky", "velka", "velke", "maly", "mala", "male", "pekny", "pekna",
    "pekne", "ks", "kus", "kusy", "cm", "mm", "pro", "pod", "nad", "and", "the", "set", "sada"
  ]);

  function nameTokens(name) {
    const base = stripDiacritics(name)
      .toLowerCase()
      .replace(/\|\s*[a-z]{1,6}\s*\d{1,6}\s*$/i, " ") // koncovka „| RA86“
      .replace(/#\d+/g, " ");
    const words = base.split(/[^a-z0-9]+/).filter(Boolean);
    const stems = new Set();
    words.forEach((w) => {
      if (STOPWORDS.has(w)) return;
      if (/^\d+$/.test(w)) {
        if (w.length === 4) stems.add(w); // rok (1922) ano, „2 ks“ ne
        return;
      }
      if (w.length < 3) return;
      stems.add(w.length > 5 ? w.slice(0, 5) : w);
    });
    return Array.from(stems);
  }

  function median(nums) {
    const a = nums.slice().sort((x, y) => x - y);
    if (!a.length) return null;
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
  }

  // Hezké zaokrouhlení návrhu (437 → 440, 1 263 → 1 260, 12 → 12).
  function roundNice(n) {
    if (n < 50) return Math.round(n);
    if (n < 1000) return Math.round(n / 10) * 10;
    return Math.round(n / 50) * 50;
  }

  /* Návrh ceny: najde produkty se skutečným prodejem a podobným názvem.
     skóre = podíl slov z nového názvu, která má i starý název
             (+0,3 při stejné kategorii). Bere se max. 6 nejlepších
             (jen ty, co mají skóre blízko nejlepšímu); návrh = medián.
     Vrací null, nebo { price, min, max, count, matches: [{ product, sale, score }] }. */
  function suggestPrice(name, categoryId, products) {
    const q = nameTokens(name);
    if (!q.length) return null;
    const cat = categoryId != null && categoryId !== "" ? String(categoryId) : null;
    const scored = [];
    (products || []).forEach((p) => {
      const sale = lastRealSale(p);
      if (!sale) return;
      const t = new Set(nameTokens(p.name));
      const shared = q.filter((w) => t.has(w)).length;
      if (!shared) return;
      const sameCat = cat && p.category_id != null && String(p.category_id) === cat;
      const score = shared / q.length + (sameCat ? 0.3 : 0);
      if (score < 0.5) return;
      scored.push({ product: p, sale, score });
    });
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score || String(b.sale.ended_at || "").localeCompare(String(a.sale.ended_at || "")));
    // Jen ty nejpodobnější: „PRIM BUDÍK“ se má řídit budíkem PRIM,
    // ne každým dalším předmětem PRIM, který se prodal.
    const best = scored[0].score;
    const top = scored.filter((x) => x.score >= best - 0.2).slice(0, 6);
    const prices = top.map((x) => x.sale.price);
    return {
      price: roundNice(median(prices)),
      min: Math.min.apply(null, prices),
      max: Math.max.apply(null, prices),
      count: top.length,
      matches: top
    };
  }

  window.SALES_SKIP_BUYERS = SALES_SKIP_BUYERS;
  window.parseAukroSales = parseAukroSales;
  window.mergeSales = mergeSales;
  window.salesOf = salesOf;
  window.realSalesOf = realSalesOf;
  window.lastRealSale = lastRealSale;
  window.formatKc = formatKc;
  window.nameTokens = nameTokens;
  window.suggestPrice = suggestPrice;
  // Doklad o posledních aktualizacích (dokument products/_meta).
  window.META_DOC_ID = "_meta";
})();
