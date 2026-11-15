/* ---------------------------------
   iAUKRO Dashboard – přehled produktů
   Čte data z Firestore (kolekce "products"),
   umožňuje produkty upravit, smazat, označit
   "prodáno" a vyexportovat CSV ve stejném
   formátu jako appka – buď všechny neprodané,
   nebo jen ručně vybrané.
-----------------------------------*/

let allProducts = [];

// Dokument products/_meta: kdy se naposled nahrály ceny prodejů
// (prices_updated_at) a hromadně prodané (sold_updated_at).
let dashMeta = {};

// ID dokumentů (_docId) ručně vybraných k exportu.
const selectedIds = new Set();

// Výchozí doprava (ZS or BA) – stejná jako v appce.
const DEFAULT_SHIPPING_ID = "2438895";

const container = document.getElementById("products-container");
const searchInput = document.getElementById("search");
const hideSoldInput = document.getElementById("hide-sold");
const onlySoldInput = document.getElementById("only-sold");
const statusMsg = document.getElementById("status-msg");
const refreshBtn = document.getElementById("refresh-btn");
const exportBtn = document.getElementById("export-btn");
const photoModal = document.getElementById("photo-modal");
const photoModalBody = document.getElementById("photo-modal-body");

const selectAllBtn = document.getElementById("select-all-btn");
const selectAllText = document.getElementById("select-all-text");
const selectionBar = document.getElementById("selection-bar");
const selectionCountElem = document.getElementById("selection-count");
const selectionClearBtn = document.getElementById("selection-clear-btn");
const exportSelectedBtn = document.getElementById("export-selected-btn");

/* --- Pomocné --- */
// Typ určuje ikonu a důraz: info | success | warning | error | progress
const STATUS_ICONS = {
  info: "info",
  success: "check-circle",
  warning: "alert",
  error: "x-circle",
  progress: "loader"
};
let statusTimer = null;
function showStatus(msg, type = "info", autoHideMs = 0) {
  clearTimeout(statusTimer);
  statusMsg.dataset.type = type;
  statusMsg.innerHTML =
    window.icon(STATUS_ICONS[type] || "info", type === "progress" ? "spin" : "") +
    '<span class="status-text"></span>';
  statusMsg.querySelector(".status-text").textContent = msg;
  statusMsg.classList.remove("is-hidden", "is-fresh");
  void statusMsg.offsetWidth;
  statusMsg.classList.add("is-fresh");
  if (autoHideMs) statusTimer = setTimeout(hideStatus, autoHideMs);
}
function hideStatus() {
  statusMsg.classList.add("is-hidden");
}
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function fmtDate(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  if (isNaN(d)) return "–";
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}
function imagesOf(p) {
  if (Array.isArray(p.image_list) && p.image_list.length) return p.image_list;
  if (p.images) return String(p.images).split(" ").filter(Boolean);
  return [];
}
// Poznámka může být u starších zápisů jen v "raw".
function noteOf(p) {
  if (p.note != null) return String(p.note);
  return p.raw && p.raw.note ? String(p.raw.note) : "";
}

/* --- Načtení dat --- */
async function loadProducts() {
  if (!window.db) {
    showStatus("Firebase není nastaven. Zkontroluj firebase-config.js.", "warning");
    container.innerHTML = "";
    return;
  }
  showStatus("Načítám produkty…", "progress");
  refreshBtn.classList.add("is-loading");
  let snap;
  try {
    snap = await window.db.collection("products").get();
  } catch (e) {
    refreshBtn.classList.remove("is-loading");
    showStatus("Chyba při načítání: " + (e.message || e), "error");
    return;
  }
  refreshBtn.classList.remove("is-loading");
  hideStatus();
  // doc.id si uložíme do _docId (potřebujeme ho pro update "prodáno").
  // Firestore Timestamp převedeme na ISO string, ať sedí s appkou i řazením.
  // products/_meta není produkt – jen data k popiskům aktualizací.
  dashMeta = {};
  const productDocs = snap.docs.filter((doc) => {
    if (doc.id !== window.META_DOC_ID) return true;
    dashMeta = doc.data() || {};
    return false;
  });
  renderUpdateLabels();
  allProducts = productDocs.map((doc) => {
    const d = doc.data() || {};
    d._docId = doc.id;
    if (d.created_at && typeof d.created_at.toDate === "function") d.created_at = d.created_at.toDate().toISOString();
    if (d.sold_at && typeof d.sold_at.toDate === "function") d.sold_at = d.sold_at.toDate().toISOString();
    return d;
  });
  sortProducts();

  // Ve výběru necháme jen produkty, které v databázi pořád jsou.
  const known = new Set(allProducts.map((p) => p._docId));
  Array.from(selectedIds).forEach((id) => { if (!known.has(id)) selectedIds.delete(id); });

  updateStats();
  animateNextRender = true;
  render();
}

// Řazení: nejnovější nahoře; při shodném čase (hromadný import) podle čísla ID sestupně
function sortProducts() {
  const numOf = (pid) => {
    const m = /^([A-Za-z]+)(\d+)$/.exec(pid || "");
    return m ? parseInt(m[2], 10) : -1;
  };
  allProducts.sort((a, b) => {
    const t = String(b.created_at || "").localeCompare(String(a.created_at || ""));
    return t !== 0 ? t : numOf(b.product_id) - numOf(a.product_id);
  });
}

/* --- Statistiky --- */
function updateStats() {
  const total = allProducts.length;
  const soldCount = allProducts.filter((p) => p.sold).length;
  const today = window.localDateString();
  const todayCount = allProducts.filter(
    (p) => p.date_added === today || (p.created_at && String(p.created_at).startsWith(today))
  ).length;

  // "Poslední ID" = ID s nejvyšším číslem (ne podle času vložení)
  let lastId = "–", bestNum = -1;
  allProducts.forEach((p) => {
    const m = /^([A-Za-z]+)(\d+)$/.exec(p.product_id || "");
    if (m && parseInt(m[2], 10) > bestNum) {
      bestNum = parseInt(m[2], 10);
      lastId = p.product_id;
    }
  });

  document.getElementById("stat-total").textContent = total;
  document.getElementById("stat-today").textContent = todayCount;
  document.getElementById("stat-sold").textContent = soldCount;
  document.getElementById("stat-last").textContent = lastId;
}

/* --- Vykreslení --- */
// Produkty odpovídající hledání a filtru (to, co je právě vidět).
function visibleProducts() {
  const q = searchInput.value.trim().toLowerCase();
  const hideSold = hideSoldInput.checked;
  const onlySold = onlySoldInput.checked;
  return allProducts.filter((p) => {
    if (hideSold && p.sold) return false;
    if (onlySold && !p.sold) return false;
    if (!q) return true;
    return [p.product_id, p.name, p.location, noteOf(p)].some(
      (v) => v && String(v).toLowerCase().includes(q)
    );
  });
}

// Název bez koncového „| ID“ – ID je na kartě vedle v kolečku, nemusí být dvakrát.
function displayName(p) {
  const name = String(p.name || "");
  if (!p.product_id) return name;
  const suffix = new RegExp("\\s*\\|\\s*" + p.product_id + "\\s*$", "i");
  return name.replace(suffix, "") || name;
}

// Obrázek, který při chybě náhledu (např. vypnuté transformace na
// Cloudinary) přepne na originál.
function thumbImg(url, size, alt, extra) {
  const small = window.cloudinaryThumb(url, size);
  const fallback = small !== url ? ` data-full="${escapeHtml(url)}"` : "";
  return `<img src="${escapeHtml(small)}"${fallback} alt="${escapeHtml(alt)}" ${extra || ""} />`;
}
// Jeden posluchač pro všechny náhledy (error události nebublají, proto capture).
document.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (img && img.tagName === "IMG" && img.dataset && img.dataset.full) {
      img.src = img.dataset.full;
      delete img.dataset.full;
    }
  },
  true
);

// Karty najíždějí jen při načtení dat. Při hledání, filtru nebo změně
// jedné karty by opakovaná animace celé mřížky jen blikala.
let animateNextRender = true;

function render() {
  const list = visibleProducts();

  container.classList.toggle("no-anim", !animateNextRender);
  animateNextRender = false;
  container.innerHTML = "";
  if (!list.length) {
    container.innerHTML = `<p class="dash-empty">Žádné produkty k zobrazení.</p>`;
  } else {
    list.forEach((p, i) => container.appendChild(card(p, i)));
  }
  updateSelectionUI();
}

function card(p, index) {
  const el = document.createElement("article");
  el.className =
    "prod-card" + (p.sold ? " is-sold" : "") + (selectedIds.has(p._docId) ? " is-selected" : "");
  // Karty najíždějí postupně; u dlouhých seznamů zpoždění zastropujeme.
  el.style.animationDelay = Math.min(index, 14) * 30 + "ms";

  const imgs = imagesOf(p);
  const thumb = imgs[0] || "";
  const note = noteOf(p);

  el.innerHTML = `
    <div class="prod-thumb">
      ${thumb
        ? thumbImg(thumb, 480, displayName(p), 'loading="lazy" decoding="async"')
        : window.icon("image")}
      <label class="prod-select" title="Vybrat k exportu">
        <input type="checkbox" ${selectedIds.has(p._docId) ? "checked" : ""}
               aria-label="Vybrat ${escapeHtml(p.product_id || "produkt")} k exportu" />
        <span class="prod-check">${window.icon("check")}</span>
      </label>
      ${p.sold ? '<span class="sold-badge">Prodáno</span>' : ""}
      ${imgs.length ? `<span class="prod-thumb-count">${window.icon("images")}${imgs.length}</span>` : ""}
    </div>
    <div class="prod-body">
      <div class="prod-top">
        <span class="prod-id">${escapeHtml(p.product_id || "—")}</span>
        <span class="prod-price">${p.price != null ? escapeHtml(p.price) + " Kč" : "—"}</span>
      </div>
      <div class="prod-name" title="${escapeHtml(p.name || "")}">${escapeHtml(displayName(p))}</div>
      <div class="prod-meta">
        <span>${window.icon("pin")}${escapeHtml(p.location || "—")}</span>
        <span>${window.icon("calendar")}${fmtDate(p.created_at)}</span>
      </div>
      ${note ? `<div class="prod-note">${window.icon("note")}<span>${escapeHtml(note)}</span></div>` : ""}
      ${saleLine(p)}
      <div class="prod-actions">
        <button class="btn btn--ghost btn--sm edit-toggle">
          ${window.icon("pencil")} Upravit
        </button>
        <button class="btn btn--sm sold-toggle ${p.sold ? "btn--ghost" : ""}">
          ${p.sold ? window.icon("undo") + " Vrátit" : window.icon("check") + " Prodáno"}
        </button>
        <button class="btn btn--ghost btn--sm btn--icon duplicate-toggle"
                title="Duplikovat" aria-label="Duplikovat ${escapeHtml(p.product_id || "produkt")}">
          ${window.icon("copy")}
        </button>
      </div>
    </div>
  `;

  const thumbEl = el.querySelector(".prod-thumb");
  if (imgs.length) {
    thumbEl.classList.add("is-clickable");
    thumbEl.addEventListener("click", () => openPhotos(imgs));
  }
  // Klik na zaškrtávátko nesmí otevřít náhled fotek pod ním.
  const selectLabel = el.querySelector(".prod-select");
  selectLabel.addEventListener("click", (e) => e.stopPropagation());
  selectLabel.querySelector("input").addEventListener("change", (e) => {
    toggleSelected(p, e.target.checked, el);
  });
  el.querySelector(".sold-toggle").addEventListener("click", (e) => toggleSold(p, e.currentTarget));
  el.querySelector(".edit-toggle").addEventListener("click", () => openEdit(p));
  el.querySelector(".duplicate-toggle").addEventListener("click", () => openDuplicate(p));
  const saleBtn = el.querySelector(".prod-sale");
  if (saleBtn) saleBtn.addEventListener("click", () => openSales(p));
  return el;
}

// Řádek na kartě: za kolik a kdy se produkt naposled prodal (klik = graf).
function saleLine(p) {
  const all = window.salesOf(p);
  if (!all.length) return "";
  const last = window.lastRealSale(p);
  const n = all.length;
  // Letošní datum bez roku – na úzké kartě by se jinak zalamovalo.
  const d = last && new Date(last.ended_at);
  const when = !d || isNaN(d)
    ? "–"
    : d.getFullYear() === new Date().getFullYear()
      ? d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })
      : fmtDate(last.ended_at);
  const text = last
    ? `Prodáno <b>${escapeHtml(window.formatKc(last.price))}</b> · ${when}`
    : `Neprodáno · v aukci ${n}×`;
  return `
    <button type="button" class="prod-sale${last ? "" : " is-unsold"}"
            title="Historie cen" aria-label="Historie cen ${escapeHtml(p.product_id || "")}">
      ${window.icon("chart")}<span class="prod-sale-text">${text}</span>${
        last && n > 1 ? `<span class="prod-sale-n">${n}×</span>` : ""
      }
    </button>`;
}

/* --- Výběr produktů k exportu --- */
function toggleSelected(p, isSelected, cardEl) {
  if (isSelected) selectedIds.add(p._docId);
  else selectedIds.delete(p._docId);
  if (cardEl) cardEl.classList.toggle("is-selected", isSelected);
  updateSelectionUI();
}

function updateSelectionUI() {
  const count = selectedIds.size;
  selectionCountElem.textContent = count;
  selectionBar.classList.toggle("is-visible", count > 0);
  selectionBar.setAttribute("aria-hidden", count > 0 ? "false" : "true");

  // „Vybrat vše“ se týká jen toho, co je právě vidět (po hledání/filtru).
  const visible = visibleProducts();
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selectedIds.has(p._docId));
  selectAllText.textContent = allVisibleSelected ? "Zrušit výběr" : "Vybrat vše";
  selectAllBtn.disabled = visible.length === 0;
}

function toggleSelectAllVisible() {
  const visible = visibleProducts();
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selectedIds.has(p._docId));
  visible.forEach((p) => {
    if (allVisibleSelected) selectedIds.delete(p._docId);
    else selectedIds.add(p._docId);
  });
  syncSelectionToCards();
}

function clearSelection() {
  selectedIds.clear();
  syncSelectionToCards();
}

// Promítne výběr do už vykreslených karet (bez překreslení a nové animace).
function syncSelectionToCards() {
  const visible = visibleProducts();
  container.querySelectorAll(".prod-card").forEach((cardEl, i) => {
    const p = visible[i];
    if (!p) return;
    const on = selectedIds.has(p._docId);
    cardEl.classList.toggle("is-selected", on);
    const input = cardEl.querySelector(".prod-select input");
    if (input) input.checked = on;
  });
  updateSelectionUI();
}

/* --- Označit / zrušit prodáno --- */
async function toggleSold(p, btn) {
  if (!window.db) return;
  const newVal = !p.sold;
  btn.classList.add("is-loading");
  try {
    await window.db.collection("products").doc(p._docId).update({
      sold: newVal,
      sold_at: newVal ? new Date().toISOString() : null
    });
  } catch (e) {
    btn.classList.remove("is-loading");
    showStatus("Nepovedlo se uložit: " + (e.message || e), "error");
    return;
  }
  btn.classList.remove("is-loading");
  p.sold = newVal;
  updateStats();
  render();
}

/* ==========================================================
   Hromadné označení prodaných
   Uživatel vloží názvy prodaných aukcí (třeba celý text zkopírovaný
   z Aukra). Z každého „… | RA86“ se vezme ID za svislítkem, ukáže
   se náhled a teprve po potvrzení se vše zapíše najednou.
   ==========================================================*/
const bulkSoldModal = document.getElementById("bulk-sold-modal");
const bulkSoldInput = document.getElementById("bulk-sold-input");
const bulkSoldSummary = document.getElementById("bulk-sold-summary");
const bulkSoldList = document.getElementById("bulk-sold-list");
const bulkSoldWarning = document.getElementById("bulk-sold-warning");
const bulkSoldConfirm = document.getElementById("bulk-sold-confirm");
const bulkSoldConfirmText = document.getElementById("bulk-sold-confirm-text");
let bulkSoldPlan = null; // { toMark: [produkty], ... } z posledního rozboru textu

// Normalizovaný klíč ID: „ra086“ i „RA86“ → „RA86“.
function idKey(prefix, num) {
  return String(prefix).toUpperCase() + parseInt(num, 10);
}
function productIdKey(p) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(p.product_id || "");
  return m ? idKey(m[1], m[2]) : null;
}

// Z vloženého textu vytáhne ID v pořadí, jak jsou v textu, bez duplicit.
// Bere „| RA86“ (i když je ID až na dalším řádku, jak se to zalomí
// při kopírování z mobilu) a řádek, na kterém je jen samotné ID.
//
// U každého ID zjistí i kupujícího: v textu z Aukra je „Kupující: jméno“
// vždy za názvem aukce, takže se hledá v úseku od ID do dalšího ID.
// Vrací [{ key: "RA86", buyer: "lubomir87" | null }].
function parseSoldIds(text) {
  const src = String(text || "");
  const hits = [];
  const patterns = [
    /\|\s*([A-Za-z]{1,6})\s*(\d{1,6})(?!\d)/g,          // „… | RA86“
    /^[ \t]*([A-Za-z]{1,6})(\d{1,6})[ \t]*$/gm            // řádek „RA86“
  ];
  patterns.forEach((re) => {
    let m;
    while ((m = re.exec(src))) hits.push({ at: m.index, key: idKey(m[1], m[2]) });
  });
  hits.sort((a, b) => a.at - b.at);

  const byKey = new Map();
  hits.forEach((h, i) => {
    const segment = src.slice(h.at, i + 1 < hits.length ? hits[i + 1].at : src.length);
    // Jen „Kupující:“ s dvojtečkou – řádek „Kupující 1“ je počet kupujících.
    const bm = /Kupuj[ií]c[ií]\s*:\s*([^\s(]+)/i.exec(segment);
    const buyer = bm ? bm[1] : null;
    if (!byKey.has(h.key)) byKey.set(h.key, { key: h.key, buyer });
    else if (buyer && !byKey.get(h.key).buyer) byKey.get(h.key).buyer = buyer;
  });
  return Array.from(byKey.values());
}

// Kupující, u kterých se předmět jako prodaný NEoznačí – jen se upozorní.
const BULK_SOLD_SKIP_BUYERS = ["aledas", "ebisu"];
function isSkippedBuyer(buyer) {
  return !!buyer && BULK_SOLD_SKIP_BUYERS.includes(String(buyer).toLowerCase());
}

function openBulkSold() {
  bulkSoldInput.value = "";
  renderBulkSold();
  bulkSoldModal.classList.add("is-active");
  bulkSoldInput.focus();
}
function closeBulkSold() {
  if (bulkSoldConfirm.classList.contains("is-loading")) return; // právě se ukládá
  bulkSoldModal.classList.remove("is-active");
  bulkSoldPlan = null;
}

function renderBulkSold() {
  const ids = parseSoldIds(bulkSoldInput.value);
  const byKey = new Map();
  allProducts.forEach((p) => {
    const key = productIdKey(p);
    if (key) byKey.set(key, p);
  });

  const rows = ids.map(({ key, buyer }) => {
    const p = byKey.get(key);
    if (!p) return { key, buyer, p: null, status: "missing" };
    // Kupující Aledas / Ebisu: neoznačovat, jen varovat.
    if (isSkippedBuyer(buyer)) return { key, buyer, p, status: "skipped" };
    return { key, buyer, p, status: p.sold ? "already" : "mark" };
  });
  const toMark = rows.filter((r) => r.status === "mark").map((r) => r.p);
  const skipped = rows.filter((r) => r.status === "skipped");
  const already = rows.filter((r) => r.status === "already").length;
  const missing = rows.filter((r) => r.status === "missing").length;
  bulkSoldPlan = { toMark, skipped };

  // Souhrn
  if (!ids.length) {
    bulkSoldSummary.classList.toggle("is-hidden", !bulkSoldInput.value.trim());
    bulkSoldSummary.textContent = "V textu jsem nenašel žádné ID za „|“.";
  } else {
    bulkSoldSummary.classList.remove("is-hidden");
    const parts = [`Nalezeno ${window.pluralCz(ids.length, "ID", "ID", "ID")}`];
    parts.push(`označí se ${toMark.length}`);
    if (skipped.length) parts.push(`přeskočeno kvůli kupujícímu ${skipped.length}`);
    if (already) parts.push(`už prodané ${already}`);
    if (missing) parts.push(`nenalezeno ${missing}`);
    bulkSoldSummary.textContent = parts.join(" · ");
  }

  // Varování: kupující, u kterých se neoznačuje.
  bulkSoldWarning.innerHTML = "";
  if (skipped.length) {
    const p = document.createElement("p");
    p.className = "export-issue export-issue--warning";
    p.innerHTML = window.icon("alert");
    p.appendChild(document.createTextNode(
      "Neoznačí se jako prodané (kupující " +
        skipped.map((r) => `${r.buyer}: ${r.p.product_id}`).join(", ") +
        ")."
    ));
    bulkSoldWarning.appendChild(p);
  }
  bulkSoldWarning.classList.toggle("is-hidden", !skipped.length);

  // Seznam: nejdřív co se označí, pak ostatní
  const order = { mark: 0, skipped: 1, already: 2, missing: 3 };
  const LABEL = { mark: "označí se", skipped: "neoznačí se", already: "už prodaný", missing: "není v databázi" };
  bulkSoldList.innerHTML = "";
  rows
    .slice()
    .sort((a, b) => order[a.status] - order[b.status])
    .forEach((r) => {
      const li = document.createElement("li");
      li.className = "bulk-item bulk-item--" + r.status;
      const img = r.p && imagesOf(r.p)[0];
      li.innerHTML = `
        <span class="export-thumb">${img ? thumbImg(img, 96, "", 'loading="lazy" decoding="async"') : window.icon(r.p ? "image" : "x")}</span>
        <span class="export-info">
          <span class="export-name"><b>${escapeHtml(r.p ? r.p.product_id : r.key)}</b> ${r.p ? escapeHtml(displayName(r.p)) : ""}</span>
          <span class="export-meta">${
            r.status === "skipped"
              ? `Kupující ${escapeHtml(r.buyer)} – zůstane neprodaný${r.p.sold ? " (v databázi už je prodaný)" : ""}`
              : r.p && r.p.price != null
                ? escapeHtml(r.p.price) + " Kč" + (r.buyer ? " · " + escapeHtml(r.buyer) : "")
                : r.p
                  ? "bez ceny"
                  : "Zkontroluj ID – produkt s ním v databázi není."
          }</span>
        </span>
        <span class="bulk-status">${
          r.status === "mark" ? window.icon("check") : r.status === "skipped" ? window.icon("alert") : ""
        }${LABEL[r.status]}</span>
      `;
      bulkSoldList.appendChild(li);
    });

  bulkSoldConfirm.disabled = toMark.length === 0;
  // Krátký popisek, ať se tlačítko vejde i na úzký telefon.
  bulkSoldConfirmText.textContent = toMark.length ? `Označit prodané (${toMark.length})` : "Označit prodané";
}

async function confirmBulkSold() {
  if (!window.db || !bulkSoldPlan || !bulkSoldPlan.toMark.length) return;
  const items = bulkSoldPlan.toMark.slice();
  const skipped = bulkSoldPlan.skipped || [];
  const soldAt = new Date().toISOString();

  bulkSoldConfirm.classList.add("is-loading");
  try {
    const col = window.db.collection("products");
    const ops = items.map((p) => ({ ref: col.doc(p._docId), data: { sold: true, sold_at: soldAt } }));
    // Datum pro popisek „Hromadně prodané“.
    ops.push({ ref: col.doc(window.META_DOC_ID), data: { sold_updated_at: soldAt }, merge: true });
    await commitOps(ops);
  } catch (e) {
    bulkSoldConfirm.classList.remove("is-loading");
    bulkSoldSummary.classList.remove("is-hidden");
    bulkSoldSummary.textContent = "Uložení selhalo: " + (e.message || e);
    return;
  }
  bulkSoldConfirm.classList.remove("is-loading");

  items.forEach((p) => {
    p.sold = true;
    p.sold_at = soldAt;
  });
  dashMeta.sold_updated_at = soldAt;
  renderUpdateLabels();
  closeBulkSold();
  updateStats();
  render();
  showStatus(
    `Označeno jako prodané: ${window.pluralCz(items.length, "produkt", "produkty", "produktů")} (${items.map((p) => p.product_id).join(", ")}).` +
      (skipped.length
        ? ` Přeskočeno kvůli kupujícímu: ${skipped.map((r) => `${r.p.product_id} (${r.buyer})`).join(", ")}.`
        : ""),
    skipped.length ? "warning" : "success",
    skipped.length ? 9000 : 6000
  );
}

// Zápis po dávkách (Firestore batch = vše, nebo nic; limit je 500 zápisů).
// op = { ref, data, merge }: s merge se dokument vytvoří/doplní (set),
// jinak se jen upraví existující (update).
async function commitOps(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = window.db.batch();
    ops.slice(i, i + 400).forEach((op) => {
      if (op.merge) batch.set(op.ref, op.data, { merge: true });
      else batch.update(op.ref, op.data);
    });
    await batch.commit();
  }
}

/* --- Popisky „kdy naposled“ (ceny prodejů, hromadně prodané) --- */
function fmtDateTimeIso(iso) {
  const d = new Date(iso);
  return isNaN(d)
    ? "–"
    : d.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function renderUpdateLabels() {
  [
    ["upd-prices", dashMeta.prices_updated_at, "Poslední import cen prodejů"],
    ["upd-sold", dashMeta.sold_updated_at, "Poslední hromadné označení prodaných"]
  ].forEach(([id, iso, label]) => {
    const pill = document.getElementById(id);
    if (!pill) return;
    pill.classList.toggle("is-on", !!iso);
    document.getElementById(id + "-date").textContent = iso ? fmtDate(iso) : "zatím ne";
    pill.title = iso ? `${label}: ${fmtDateTimeIso(iso)}` : `${label}: zatím neproběhl`;
  });
}

/* ==========================================================
   Ceny prodejů
   Uživatel vloží skončené aukce zkopírované z Aukra. U každé se
   najde produkt (ID za „|“), ukáže se náhled a po potvrzení se
   k produktu uloží historie: číslo aukce, cena, konec, kupující.
   Číslo aukce je klíč – opakovaný import stejné aukce nic nezdvojí.
   ==========================================================*/
const pricesModal = document.getElementById("prices-modal");
const pricesInput = document.getElementById("prices-input");
const pricesSummary = document.getElementById("prices-summary");
const pricesList = document.getElementById("prices-list");
const pricesConfirm = document.getElementById("prices-confirm");
const pricesConfirmText = document.getElementById("prices-confirm-text");
let pricesPlan = null; // { toSave: [{ p, merged, added }] }

function productsByKey() {
  const byKey = new Map();
  allProducts.forEach((p) => {
    const key = productIdKey(p);
    if (key) byKey.set(key, p);
  });
  return byKey;
}
function fmtShortDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "–" : d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

function openPrices() {
  pricesInput.value = "";
  renderPrices();
  pricesModal.classList.add("is-active");
  pricesInput.focus();
}
function closePrices() {
  if (pricesConfirm.classList.contains("is-loading")) return; // právě se ukládá
  pricesModal.classList.remove("is-active");
  pricesPlan = null;
}

function renderPrices() {
  // Stejná aukce vložená dvakrát se počítá jednou.
  const seen = new Set();
  const auctions = window.parseAukroSales(pricesInput.value).filter((a) => {
    if (seen.has(a.auction)) return false;
    seen.add(a.auction);
    return true;
  });
  const byKey = productsByKey();
  const groups = new Map();
  auctions.forEach((a) => {
    if (!groups.has(a.key)) groups.set(a.key, []);
    groups.get(a.key).push(a);
  });

  const rows = Array.from(groups, ([key, list]) => {
    const p = byKey.get(key);
    if (!p) return { key, list, p: null, added: 0, status: "missing" };
    const { merged, added } = window.mergeSales(p.sales, list);
    return { key, list, p, merged, added, status: added ? "new" : "known" };
  });
  const toSave = rows.filter((r) => r.status === "new");
  const addedTotal = toSave.reduce((s, r) => s + r.added, 0);
  const knownTotal = rows.filter((r) => r.p).reduce((s, r) => s + r.list.length - r.added, 0);
  const missingRows = rows.filter((r) => r.status === "missing");
  const missingTotal = missingRows.reduce((s, r) => s + r.list.length, 0);
  pricesPlan = { toSave, addedTotal };

  // Souhrn
  if (!auctions.length) {
    pricesSummary.classList.toggle("is-hidden", !pricesInput.value.trim());
    pricesSummary.textContent =
      "V textu jsem nenašel žádnou aukci – každá potřebuje „| ID“, číslo aukce v závorce a řádek „Cena“.";
  } else {
    pricesSummary.classList.remove("is-hidden");
    const parts = [
      `Nalezeno ${window.pluralCz(auctions.length, "aukce", "aukce", "aukcí")} u ${window.pluralCz(groups.size, "produktu", "produktů", "produktů")}`,
      `nové ${addedTotal}`
    ];
    if (knownTotal) parts.push(`už uložené ${knownTotal}`);
    if (missingTotal) parts.push(`bez produktu v databázi ${missingTotal}`);
    pricesSummary.textContent = parts.join(" · ");
  }

  // Seznam: nejdřív co se uloží, pak už uložené, nakonec nenalezené
  const order = { new: 0, known: 1, missing: 2 };
  const CLASS = { new: "mark", known: "already", missing: "missing" };
  pricesList.innerHTML = "";
  rows
    .slice()
    .sort((a, b) => order[a.status] - order[b.status])
    .forEach((r) => {
      const real = r.list.filter((a) => a.real);
      const fake = r.list.length - real.length;
      const lastReal = real.slice().sort((a, b) => String(b.ended_at).localeCompare(String(a.ended_at)))[0];
      const meta = [window.pluralCz(r.list.length, "aukce", "aukce", "aukcí")];
      if (lastReal) meta.push(`prodáno ${window.formatKc(lastReal.price)} (${fmtShortDate(lastReal.ended_at)})`);
      if (fake) meta.push(`odkoupeno ${fake}×`);
      if (!r.p) meta.push("ID není v databázi");

      const li = document.createElement("li");
      li.className = "bulk-item bulk-item--" + CLASS[r.status];
      li.dataset.key = r.key;
      const img = r.p && imagesOf(r.p)[0];
      li.innerHTML = `
        <span class="export-thumb">${img ? thumbImg(img, 96, "", 'loading="lazy" decoding="async"') : window.icon(r.p ? "image" : "x")}</span>
        <span class="export-info">
          <span class="export-name"><b>${escapeHtml(r.p ? r.p.product_id : r.key)}</b> ${escapeHtml(r.p ? displayName(r.p) : r.list[0].title)}</span>
          <span class="export-meta">${escapeHtml(meta.join(" · "))}</span>
        </span>
        <span class="bulk-status">${
          r.status === "new" ? window.icon("check") + "+" + r.added : r.status === "known" ? "už uloženo" : "není v DB"
        }</span>
      `;
      pricesList.appendChild(li);
    });

  pricesConfirm.disabled = addedTotal === 0;
  pricesConfirmText.textContent = addedTotal
    ? `Uložit ceny (${addedTotal})`
    : auctions.length && !missingTotal
      ? "Vše už je uložené"
      : "Uložit ceny";
}

async function confirmPrices() {
  if (!window.db || !pricesPlan || !pricesPlan.toSave.length) return;
  const rows = pricesPlan.toSave.slice();
  const added = pricesPlan.addedTotal;
  const now = new Date().toISOString();

  pricesConfirm.classList.add("is-loading");
  try {
    const col = window.db.collection("products");
    const ops = rows.map((r) => ({ ref: col.doc(r.p._docId), data: { sales: r.merged, sales_updated_at: now } }));
    // Datum pro popisek „Ceny prodejů“.
    ops.push({ ref: col.doc(window.META_DOC_ID), data: { prices_updated_at: now }, merge: true });
    await commitOps(ops);
  } catch (e) {
    pricesConfirm.classList.remove("is-loading");
    pricesSummary.classList.remove("is-hidden");
    pricesSummary.textContent = "Uložení selhalo: " + (e.message || e);
    return;
  }
  pricesConfirm.classList.remove("is-loading");

  rows.forEach((r) => {
    r.p.sales = r.merged;
    r.p.sales_updated_at = now;
  });
  dashMeta.prices_updated_at = now;
  renderUpdateLabels();
  closePrices();
  render();
  showStatus(
    `Uloženo ${window.pluralCz(added, "aukce", "aukce", "aukcí")} u ${window.pluralCz(rows.length, "produktu", "produktů", "produktů")}.`,
    "success",
    5000
  );
}

/* ==========================================================
   Historie cen jednoho produktu
   Nahoře poslední skutečný prodej, pod ním graf (osa x = konec
   aukce, osa y = cena) a seznam všech aukcí jako textová podoba
   grafu. Plné body = prodáno, duté = odkoupeno (Aledas / Ebisu).
   ==========================================================*/
const salesModal = document.getElementById("sales-modal");
const salesChart = document.getElementById("sales-chart");
let salesProduct = null;

function openSales(p) {
  salesProduct = p;
  const sales = window.salesOf(p);
  const last = window.lastRealSale(p);
  const fake = sales.filter((s) => s.real === false).length;

  document.getElementById("sales-title").textContent = `Historie cen · ${p.product_id || ""}`;
  document.getElementById("sales-name").textContent = displayName(p);

  const hero = document.getElementById("sales-hero");
  hero.innerHTML = last
    ? `<span class="sales-hero-label">Naposled prodáno za</span>
       <span class="sales-hero-num">${escapeHtml(window.formatKc(last.price))}</span>
       <span class="sales-hero-meta">${fmtDate(last.ended_at)}${last.buyer ? " · " + escapeHtml(last.buyer) : ""}${last.buy_now ? " · Kup teď" : ""}</span>`
    : `<span class="sales-hero-label">Zatím neprodáno</span>
       <span class="sales-hero-meta">V aukci ${sales.length}×${fake ? " – pokaždé odkoupeno (Aledas / Ebisu)" : ""}</span>`;

  // Seznam aukcí, nejnovější nahoře
  const list = document.getElementById("sales-list");
  list.innerHTML = "";
  const nameKey = displayName(p).trim().toLowerCase();
  sales
    .slice()
    .sort((a, b) => String(b.ended_at || "").localeCompare(String(a.ended_at || "")))
    .forEach((s) => {
      const li = document.createElement("li");
      const real = s.real !== false;
      li.className = "sales-row" + (real ? "" : " is-fake");
      const d = s.ended_at ? new Date(s.ended_at) : null;
      const title = s.title && s.title.trim().toLowerCase() !== nameKey ? s.title : "";
      li.innerHTML = `
        <span class="sales-row-date">${d ? fmtDate(s.ended_at) : "–"}<small>${d ? fmtTime(d) : ""}</small></span>
        <span class="sales-row-info">
          <b>${escapeHtml(window.formatKc(s.price))}</b>
          <small>${escapeHtml([s.buyer, title, "aukce " + s.auction].filter(Boolean).join(" · "))}</small>
        </span>
        <span class="bulk-status">${real ? (s.buy_now ? "kup teď" : "prodáno") : "odkoupeno"}</span>
      `;
      list.appendChild(li);
    });

  salesModal.classList.add("is-active");
  salesModal.querySelector(".modal-content").scrollTop = 0;
  drawSalesChart(salesChart, sales);
}
function closeSales() {
  salesModal.classList.remove("is-active");
  salesProduct = null;
}

// Hezké dělení osy y: krok 1 / 2 / 5 × 10^n, zhruba 4 dílky.
function niceScale(maxValue) {
  const v = Math.max(1, maxValue);
  const raw = v / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = Math.max(1, (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag);
  // Rezerva nahoře pro popisek hodnoty nad nejvyšším bodem.
  return { step, max: Math.ceil((v * 1.12) / step) * step };
}

function drawSalesChart(fig, sales) {
  const SVG = "http://www.w3.org/2000/svg";
  const pts = sales
    .filter((s) => s.ended_at && s.price != null && !isNaN(new Date(s.ended_at)))
    .map((s) => ({ s, t: new Date(s.ended_at).getTime(), v: Number(s.price), real: s.real !== false }))
    .sort((a, b) => a.t - b.t);
  fig.innerHTML = "";
  // Jedna aukce = jedno číslo; to říká přehled nahoře i seznam, graf by nic nepřidal.
  fig.classList.toggle("is-hidden", pts.length < 2);
  if (pts.length < 2) return;

  const W = Math.max(260, Math.round(fig.clientWidth || 480));
  const H = 220;
  const m = { l: 46, r: 16, t: 26, b: 30 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const DAY = 864e5;
  let t0 = pts[0].t;
  let t1 = pts[pts.length - 1].t;
  if (t1 - t0 < DAY) { t0 -= 3 * DAY; t1 += 3 * DAY; }
  const pad = (t1 - t0) * 0.07;
  t0 -= pad;
  t1 += pad;
  const { step, max: yMax } = niceScale(Math.max.apply(null, pts.map((p) => p.v)));
  const x = (t) => m.l + ((t - t0) / (t1 - t0)) * iw;
  const y = (v) => m.t + ih - (v / yMax) * ih;
  pts.forEach((p) => { p.x = x(p.t); p.y = y(p.v); });

  const el = (name, attrs, text) => {
    const n = document.createElementNS(SVG, name);
    Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k]));
    if (text != null) n.textContent = text;
    return n;
  };
  const svg = el("svg", {
    class: "sales-svg", width: W, height: H, viewBox: `0 0 ${W} ${H}`,
    role: "img", "aria-label": `Graf cen ${pts.length} aukcí, osa x datum konce, osa y cena v Kč`
  });

  // Mřížka + popisky osy y (tlumeně, ať nepřebíjí data)
  const grid = el("g", { class: "sales-grid" });
  for (let v = 0; v <= yMax; v += step) {
    grid.appendChild(el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }));
    grid.appendChild(el("text", { x: m.l - 8, y: y(v), "text-anchor": "end", "dominant-baseline": "middle" },
      v.toLocaleString("cs-CZ")));
  }
  grid.appendChild(el("text", { x: m.l - 8, y: m.t - 14, "text-anchor": "end", class: "sales-unit" }, "Kč"));
  svg.appendChild(grid);

  // Popisky osy x: datum u bodů, jen pokud se nepřekrývají (poslední má přednost).
  const spansYears = new Date(pts[0].t).getFullYear() !== new Date(pts[pts.length - 1].t).getFullYear();
  const fmtX = (t) =>
    new Date(t).toLocaleDateString("cs-CZ", spansYears
      ? { day: "numeric", month: "numeric", year: "2-digit" }
      : { day: "numeric", month: "numeric" });
  const placed = [];
  const MIN_GAP = spansYears ? 70 : 52;
  pts.forEach((p, i) => {
    if (placed.length && p.x - placed[placed.length - 1].x < MIN_GAP) {
      if (i !== pts.length - 1) return;
      placed.pop();
    }
    placed.push(p);
  });
  const xAxis = el("g", { class: "sales-xaxis" });
  placed.forEach((p) => {
    xAxis.appendChild(el("text", { x: Math.min(W - m.r - 18, Math.max(m.l + 18, p.x)), y: H - 8, "text-anchor": "middle" }, fmtX(p.t)));
  });
  svg.appendChild(xAxis);

  // Spojnice v čase (2 px) – jak dopadla každá další aukce
  svg.appendChild(el("polyline", { class: "sales-line", points: pts.map((p) => `${p.x},${p.y}`).join(" ") }));

  // Body: plný = prodáno, dutý = odkoupeno
  const dots = el("g");
  pts.forEach((p) => {
    p.dot = el("circle", { class: "sales-dot" + (p.real ? "" : " is-fake"), cx: p.x, cy: p.y, r: p.real ? 5 : 4.5 });
    dots.appendChild(p.dot);
  });
  svg.appendChild(dots);

  // Hodnoty jen u posledního a nejvyššího bodu (ne u každého)
  const lastP = pts[pts.length - 1];
  const maxP = pts.reduce((a, b) => (b.v > a.v ? b : a));
  const labelled = maxP === lastP ? [lastP] : [maxP, lastP];
  labelled.forEach((p) => {
    const tx = Math.min(W - m.r - 4, Math.max(m.l + 4, p.x));
    const anchor = tx > W - m.r - 30 ? "end" : tx < m.l + 30 ? "start" : "middle";
    svg.appendChild(el("text", { class: "sales-value", x: tx, y: p.y - 12, "text-anchor": anchor }, window.formatKc(p.v)));
  });

  // Zóny pro najetí / klávesnici (větší než bod) + bublina s detailem
  const tip = document.createElement("div");
  tip.className = "sales-tip is-hidden";
  tip.setAttribute("role", "status");
  const hits = el("g", { class: "sales-hits" });
  const show = (p) => {
    pts.forEach((q) => q.dot.classList.toggle("is-active", q === p));
    const s = p.s;
    tip.innerHTML = `<b>${escapeHtml(window.formatKc(s.price))}</b>
      <span>${fmtDate(s.ended_at)} ${fmtTime(new Date(s.ended_at))}</span>
      <span>${escapeHtml(s.buyer || "—")} · ${p.real ? (s.buy_now ? "kup teď" : "prodáno") : "odkoupeno"}</span>`;
    tip.classList.remove("is-hidden");
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(W - tw - 2, Math.max(2, p.x - tw / 2)) + "px";
    tip.style.top = Math.max(0, p.y - tip.offsetHeight - 14) + "px";
  };
  const hide = () => {
    tip.classList.add("is-hidden");
    pts.forEach((q) => q.dot.classList.remove("is-active"));
  };
  pts.forEach((p) => {
    const s = p.s;
    const hit = el("circle", {
      cx: p.x, cy: p.y, r: 16, tabindex: 0, focusable: "true",
      "aria-label": `${fmtDate(s.ended_at)}: ${window.formatKc(s.price)}, ${p.real ? "prodáno" : "odkoupeno"}${s.buyer ? " (" + s.buyer + ")" : ""}`
    });
    hit.addEventListener("pointerenter", () => show(p));
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("focus", () => show(p));
    hit.addEventListener("blur", hide);
    hit.addEventListener("click", () => show(p)); // dotyk na mobilu
    hits.appendChild(hit);
  });
  svg.appendChild(hits);

  fig.appendChild(svg);
  fig.appendChild(tip);

  // Legenda jen když jsou v grafu oba druhy bodů
  if (pts.some((p) => p.real) && pts.some((p) => !p.real)) {
    const cap = document.createElement("figcaption");
    cap.className = "sales-legend";
    cap.innerHTML =
      '<span><i class="lg-dot"></i>prodáno</span>' +
      '<span><i class="lg-dot is-fake"></i>odkoupeno (Aledas / Ebisu)</span>';
    fig.appendChild(cap);
  }
}

/* ==========================================================
   Úprava produktu
   Uloží se jak "ploché" sloupce (pro dashboard), tak odpovídající
   pole v "raw" – z toho se skládá export pro Aukro, ať se obojí
   nerozejde.
   ==========================================================*/
let editingProduct = null;   // produkt otevřený v modálu
let editPhotos = [];         // rozpracovaný seznam fotek: { url } nebo { file, preview }
let editSaving = false;      // během ukládání (a nahrávání fotek) se modál nezavírá
let categoryGroups = [];     // kategorie z MapaKat.txt

const editModal = document.getElementById("edit-modal");
const editNameInput = document.getElementById("edit-name");
const editPriceInput = document.getElementById("edit-price");
const editLocationInput = document.getElementById("edit-location");
const editNoteInput = document.getElementById("edit-note");
const editDateInput = document.getElementById("edit-date");
const editShippingSelect = document.getElementById("edit-shipping");
const editCategoryBtn = document.getElementById("edit-category-btn");
const editCategoryText = document.getElementById("edit-category-text");
const editCategoryIdInput = document.getElementById("edit-category-id");
const editCategoryPanel = document.getElementById("edit-category-panel");
const editCategorySearch = document.getElementById("edit-category-search");
const editCategoryList = document.getElementById("category-list");
const editPromoPriority = document.getElementById("edit-promo-priority");
const editPromoBold = document.getElementById("edit-promo-bold");
const editPromoHighlight = document.getElementById("edit-promo-highlight");
const editPhotosBox = document.getElementById("edit-photos");
const editPhotoCountElem = document.getElementById("edit-photo-count");
const editPhotoCamera = document.getElementById("edit-photo-camera");
const editPhotoGallery = document.getElementById("edit-photo-gallery");
const editProgressElem = document.getElementById("edit-progress");
const editPhotoUrlInput = document.getElementById("edit-photo-url");
const editPhotoAddBtn = document.getElementById("edit-photo-add");
const editErrorElem = document.getElementById("edit-error");
const editSaveBtn = document.getElementById("edit-save-btn");
const editCancelBtn = document.getElementById("edit-cancel-btn");
const editDeleteBtn = document.getElementById("edit-delete-btn");
const editDeleteConfirm = document.getElementById("edit-delete-confirm");
const editDeleteIdElem = document.getElementById("edit-delete-id");
const editDeleteYesBtn = document.getElementById("edit-delete-yes");
const editDeleteNoBtn = document.getElementById("edit-delete-no");

// Kategorie načteme na pozadí, ať je výběr hned po otevření modálu.
window.loadCategoryGroups()
  .then((groups) => {
    categoryGroups = groups;
    if (editingProduct) refreshCategoryButton();
  })
  .catch(() => {
    /* Bez MapaKat.txt jde kategorie zadat jen číslem – modál dál funguje. */
  });

// "2025-03-26" z ISO data nebo z date_added
function dateInputValue(p) {
  if (p.date_added && /^\d{4}-\d{2}-\d{2}$/.test(p.date_added)) return p.date_added;
  if (p.created_at) {
    const d = new Date(p.created_at);
    if (!isNaN(d)) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    }
  }
  return "";
}

function refreshCategoryButton() {
  const id = editCategoryIdInput.value.trim();
  if (!id) {
    editCategoryText.textContent = "Vybrat kategorii";
    return;
  }
  const name = window.findCategoryName(categoryGroups, id);
  editCategoryText.textContent = name ? `${name} (${id})` : `Kategorie ${id}`;
}

function renderCategoryList(query) {
  const q = String(query || "").toLowerCase().trim();
  editCategoryList.innerHTML = "";
  let found = false;
  categoryGroups.forEach((group) => {
    const filtered = (group.cats || []).filter((c) => c.name.toLowerCase().includes(q));
    if (!filtered.length) return;
    const groupEl = document.createElement("div");
    groupEl.className = "category-group";
    groupEl.innerHTML = window.icon("folder");
    groupEl.appendChild(document.createTextNode(group.name));
    editCategoryList.appendChild(groupEl);
    filtered.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = cat.name;
      btn.addEventListener("click", () => {
        editCategoryIdInput.value = cat.id;
        refreshCategoryButton();
        editCategoryPanel.classList.add("is-hidden");
      });
      editCategoryList.appendChild(btn);
    });
    found = true;
  });
  if (!found) {
    const none = document.createElement("p");
    none.className = "empty";
    none.textContent = categoryGroups.length
      ? "Žádné kategorie nenalezeny."
      : "Kategorie se nepodařilo načíst (MapaKat.txt).";
    editCategoryList.appendChild(none);
  }
}

// Položka v editPhotos je buď už nahraná fotka { url }, nebo nová
// { file, preview } – ta se nahraje na Cloudinary až při uložení, takže
// zrušená úprava nenechá na Cloudinary nic navíc.
function pendingPhotoCount() {
  return editPhotos.filter((ph) => ph.file).length;
}

function revokePreviews(list) {
  list.forEach((ph) => { if (ph.preview) URL.revokeObjectURL(ph.preview); });
}

function buildAddTile(iconName, label, onClick) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "photo-add-tile";
  tile.innerHTML = window.icon(iconName) + `<span>${label}</span>`;
  tile.addEventListener("click", onClick);
  return tile;
}

function renderEditPhotos() {
  editPhotosBox.innerHTML = "";
  const pending = pendingPhotoCount();
  editPhotoCountElem.textContent =
    `${editPhotos.length} z max. ${window.MAX_PHOTOS}` + (pending ? ` · ${pending} k nahrání` : "");

  editPhotos.forEach((ph, index) => {
    const item = document.createElement("div");
    item.className = "edit-photo-item" + (ph.file ? " is-pending" : "");
    item.innerHTML =
      (ph.file
        ? `<img src="${ph.preview}" alt="nová fotka ${index + 1}" />`
        : thumbImg(ph.url, 240, `fotka ${index + 1}`, 'decoding="async"')) +
      // Jeden štítek dole: hlavní / nová / hlavní · nová
      ((index === 0 || ph.file)
        ? `<span class="edit-photo-main">${[index === 0 ? "hlavní" : "", ph.file ? "nová" : ""].filter(Boolean).join(" · ")}</span>`
        : "");

    if (index > 0) {
      const firstBtn = document.createElement("button");
      firstBtn.type = "button";
      firstBtn.className = "edit-photo-first";
      firstBtn.title = "Dát jako hlavní";
      firstBtn.setAttribute("aria-label", "Dát jako hlavní");
      firstBtn.innerHTML = window.icon("star");
      firstBtn.addEventListener("click", () => {
        editPhotos.splice(index, 1);
        editPhotos.unshift(ph);
        renderEditPhotos();
      });
      item.appendChild(firstBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "edit-photo-remove";
    removeBtn.title = "Odebrat fotku";
    removeBtn.setAttribute("aria-label", "Odebrat fotku");
    removeBtn.innerHTML = window.icon("x");
    removeBtn.addEventListener("click", () => {
      revokePreviews(editPhotos.splice(index, 1));
      renderEditPhotos();
    });
    item.appendChild(removeBtn);

    editPhotosBox.appendChild(item);
  });

  if (editPhotos.length < window.MAX_PHOTOS) {
    editPhotosBox.appendChild(buildAddTile("camera", "Vyfotit", () => editPhotoCamera.click()));
    editPhotosBox.appendChild(buildAddTile("images", "Z galerie", () => editPhotoGallery.click()));
  }
}

// Nové fotky: každou nejdřív ořízneme (stejně jako v appce), pak čeká na uložení.
async function addEditPhotoFiles(fileList) {
  const files = Array.from(fileList || []);
  let skipped = false;
  for (let i = 0; i < files.length; i++) {
    if (!editingProduct) return; // modál mezitím zavřený
    if (editPhotos.length >= window.MAX_PHOTOS) {
      skipped = true;
      break;
    }
    const cropped = await window.cropImageInteractive(files[i], `Fotka ${editPhotos.length + 1}`);
    if (cropped) {
      editPhotos.push({ file: cropped, preview: URL.createObjectURL(cropped) });
      renderEditPhotos();
    }
  }
  editErrorElem.textContent = skipped
    ? `Na produkt jde nejvýš ${window.MAX_PHOTOS} fotek – zbytek přeskočen.`
    : "";
}

function setEditBusy(busy, message) {
  editSaving = busy;
  [editSaveBtn, editCancelBtn, editDeleteBtn].forEach((b) => { b.disabled = busy; });
  editSaveBtn.classList.toggle("is-loading", busy);
  editModal.classList.toggle("is-busy", busy);
  editProgressElem.textContent = message || "";
  editProgressElem.classList.toggle("is-hidden", !message);
}

// Okno Upravit má dva režimy: "edit" (úprava uloženého produktu)
// a "duplicate" (nový produkt podle vzoru, uloží se pod novým ID).
let editMode = "edit";

function openEdit(p, mode = "edit") {
  editMode = mode;
  editingProduct = p;
  editPhotos = imagesOf(p).map((url) => ({ url }));

  const dup = mode === "duplicate";
  document.getElementById("edit-title").textContent = dup ? "Duplikovat produkt" : "Upravit produkt";
  document.getElementById("edit-id-label").textContent = dup ? "Nové ID" : "ID";
  document.getElementById("edit-id-hint").textContent = dup
    ? `přidělené automaticky (další volné) · kopie z ${p._source ? p._source.product_id : "—"}`
    : "nedá se měnit, je to klíč v databázi";
  document.getElementById("edit-save-text").textContent = dup ? "Vytvořit kopii" : "Uložit";
  editDeleteBtn.classList.toggle("is-hidden", dup);

  document.getElementById("edit-product-id").textContent = p.product_id || "—";
  editNameInput.value = p.name || "";
  editPriceInput.value = p.price != null ? p.price : "";
  editLocationInput.value = p.location || "";
  editNoteInput.value = noteOf(p);
  editDateInput.value = dateInputValue(p);
  editCategoryIdInput.value = p.category_id != null ? p.category_id : "";
  refreshCategoryButton();

  // Bez uložené dopravy nabídneme výchozí; neznámé ID (starší produkt)
  // do selectu doplníme, ať ho uložení omylem nepřepíše.
  const shipping =
    p.shipping_template_id != null ? String(p.shipping_template_id) : DEFAULT_SHIPPING_ID;
  if (!Array.from(editShippingSelect.options).some((o) => o.value === shipping)) {
    const opt = document.createElement("option");
    opt.value = shipping;
    opt.textContent = `Jiná (ID ${shipping})`;
    editShippingSelect.appendChild(opt);
  }
  editShippingSelect.value = shipping;

  editPromoPriority.checked = !!p.priority_listing;
  editPromoBold.checked = !!p.bold_title;
  editPromoHighlight.checked = !!p.highlight;

  editCategoryPanel.classList.add("is-hidden");
  editCategorySearch.value = "";
  editPhotoUrlInput.value = "";
  editErrorElem.textContent = "";
  editDeleteConfirm.classList.add("is-hidden");
  setEditBusy(false);
  renderEditPhotos();

  editModal.classList.add("is-active");
  editModal.querySelector(".modal-content").scrollTop = 0;
}

function closeEdit() {
  if (editSaving) return; // nahrávání/ukládání nejde přerušit zavřením
  editModal.classList.remove("is-active");
  editingProduct = null;
  editMode = "edit";
  revokePreviews(editPhotos);
  editPhotos = [];
}

async function saveEdit() {
  if (!editingProduct || !window.db || editSaving) return;
  const p = editingProduct;

  const name = editNameInput.value.trim();
  const priceRaw = editPriceInput.value.trim();
  const location = editLocationInput.value.trim();
  const note = editNoteInput.value.trim();
  const dateStr = editDateInput.value;
  const categoryId = editCategoryIdInput.value.trim();
  const shippingId = editShippingSelect.value;

  if (!name) {
    showEditError("Název nesmí být prázdný.", editNameInput);
    return;
  }
  if (priceRaw === "" || isNaN(parseInt(priceRaw, 10))) {
    showEditError("Zadej cenu číslem.", editPriceInput);
    return;
  }
  editErrorElem.textContent = "";

  // Nejdřív nahrajeme nové fotky. Co se nahraje, rovnou převedeme na { url },
  // takže po chybě sítě a dalším „Uložit“ se nic nenahrává dvakrát.
  const pending = editPhotos.filter((ph) => ph.file);
  let uploaded = 0;
  for (const ph of pending) {
    setEditBusy(true, `Nahrávám fotku ${uploaded + 1} z ${pending.length}…`);
    try {
      const url = await window.uploadImageToCloudinary(ph.file, editPhotos.indexOf(ph) + 1);
      URL.revokeObjectURL(ph.preview);
      delete ph.file;
      delete ph.preview;
      ph.url = url;
      uploaded++;
    } catch (e) {
      setEditBusy(false);
      renderEditPhotos();
      showEditError("Nahrání fotky selhalo: " + (e.message || e) + " Zkus Uložit znovu.");
      return;
    }
  }
  if (pending.length) renderEditPhotos();
  setEditBusy(true, pending.length ? "Ukládám…" : "");

  const price = parseInt(priceRaw, 10);
  const categoryNum = categoryId ? parseInt(categoryId, 10) : null;
  const shippingNum = shippingId ? parseInt(shippingId, 10) : null;
  const imageUrls = editPhotos.map((ph) => ph.url);
  const images = imageUrls.join(" ");
  const extId = p.product_id ? `${location} | ${p.product_id}` : p.ext_id || null;

  const patch = {
    name,
    price,
    location: location || null,
    ext_id: extId,
    category_id: categoryNum,
    shipping_template_id: shippingNum,
    images,
    image_list: imageUrls,
    priority_listing: editPromoPriority.checked,
    bold_title: editPromoBold.checked,
    highlight: editPromoHighlight.checked,
    updated_at: new Date().toISOString()
  };

  // Poznámka je součástí popisu nabídky. Popis přegenerujeme jen při její
  // změně – jinak necháme uložený text být, ať úprava ceny nepřepíše popis.
  const noteChanged = note !== noteOf(p).trim();
  if (noteChanged) {
    patch.note = note || null;
    patch.description = window.buildProductDescription(note);
  }

  // Datum: mění se jen když ho uživatel opravdu přepsal. Do created_at
  // dáváme poledne, stejně jako zpětné zadávání v appce.
  if (dateStr && dateStr !== dateInputValue(p)) {
    const d = new Date(`${dateStr}T12:00:00`);
    patch.date_added = dateStr;
    if (!isNaN(d)) patch.created_at = d.toISOString();
  }

  // "raw" drží podobu produktu pro export do Aukra – držíme ho v souladu.
  const rawPatch = {
    name,
    extId,
    auctionPriceAmount: price,
    categoryId: categoryNum,
    shippingTemplateId: shippingNum,
    images,
    locationName: location,
    priorityListing: editPromoPriority.checked,
    boldTitle: editPromoBold.checked,
    highlight: editPromoHighlight.checked,
    dateAdded: patch.date_added || p.date_added || null
  };
  if (noteChanged) {
    rawPatch.note = note;
    rawPatch.description = patch.description;
  }
  patch.raw = Object.assign({}, p.raw || {}, rawPatch);

  if (editMode === "duplicate") {
    await saveDuplicate(p, patch, uploaded);
    return;
  }

  try {
    await window.db.collection("products").doc(p._docId).update(patch);
  } catch (e) {
    setEditBusy(false);
    showEditError("Uložení selhalo: " + (e.message || e));
    return;
  }
  setEditBusy(false);

  Object.assign(p, patch);
  closeEdit();
  updateStats();
  render();
  if (exportJob) {
    exportJob.lastEditedId = p._docId;
    renderExportReview();
  }
  showStatus(
    `Produkt ${p.product_id || ""} upraven` +
      (uploaded ? ` · nahráno ${window.pluralCz(uploaded, "nová fotka", "nové fotky", "nových fotek")}.` : "."),
    "success",
    3500
  );
}

// Chyba v modálu úprav: text nad lištou tlačítek + skok na problémové pole.
function showEditError(message, field) {
  editErrorElem.textContent = message;
  const target = field || editErrorElem;
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  if (field) field.focus({ preventScroll: true });
}

/* ==========================================================
   Duplikace produktu
   Kopie dostane další volné ID se stejným prefixem (po nejvyšším
   v databázi – stejně jako v appce, takže se ID nikdy nepoužije
   dvakrát). Otevře se v okně Upravit, kde jde před uložením změnit
   název, cenu, fotky atd. Do databáze se zapíše až „Vytvořit kopii“.
   ==========================================================*/
function nextFreeProductId(src) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(src.product_id || "");
  const prefix = m ? m[1].toUpperCase() : "RA";
  const width = m ? Math.max(2, m[2].length) : 2;
  let max = 0;
  allProducts.forEach((p) => {
    const mm = /^([A-Za-z]+)(\d+)$/.exec(p.product_id || "");
    if (mm && mm[1].toUpperCase() === prefix) max = Math.max(max, parseInt(mm[2], 10));
  });
  return prefix + String(max + 1).padStart(width, "0");
}

// „VÁZA | RA86“ → „VÁZA | RA99“; bez koncovky ID se nové ID připojí.
function nameWithId(name, oldId, newId) {
  const base = String(name || "").trim();
  if (oldId) {
    const re = new RegExp("\\s*\\|\\s*" + oldId + "\\s*$", "i");
    if (re.test(base)) return base.replace(re, " | " + newId);
  }
  return base ? `${base} | ${newId}` : `| ${newId}`;
}

function openDuplicate(src) {
  const newId = nextFreeProductId(src);
  const note = noteOf(src);
  const nowIso = new Date().toISOString();
  const today = window.localDateString();
  const draft = {
    _docId: newId,
    _source: src,
    product_id: newId,
    name: nameWithId(src.name, src.product_id, newId),
    price: src.price,
    location: src.location || null,
    ext_id: `${src.location || ""} | ${newId}`,
    category_id: src.category_id != null ? src.category_id : null,
    shipping_template_id: src.shipping_template_id != null ? src.shipping_template_id : null,
    images: imagesOf(src).join(" "),
    image_list: imagesOf(src).slice(),
    priority_listing: !!src.priority_listing,
    bold_title: !!src.bold_title,
    highlight: !!src.highlight,
    note: note || null,
    // Popis z aktuální šablony (s poznámkou vzoru).
    description: window.buildProductDescription(note),
    excel_url: null,
    sold: false,
    sold_at: null,
    date_added: today,
    created_at: nowIso,
    entry_mode: "duplicate",
    duplicated_from: src.product_id || null,
    raw: Object.assign({}, src.raw || {}, {
      productId: newId,
      note: note || "",
      description: window.buildProductDescription(note),
      dateAdded: today,
      createdAt: nowIso,
      entryMode: "duplicate"
    })
  };
  delete draft.raw.syncedToDb;
  delete draft.raw.entityId;
  openEdit(draft, "duplicate");
}

async function saveDuplicate(draft, patch, uploaded) {
  const col = window.db.collection("products");
  const newId = draft.product_id;
  // Interní pole (_docId, _source) do databáze nepatří.
  const doc = {};
  Object.keys(draft).forEach((k) => { if (k[0] !== "_") doc[k] = draft[k]; });
  Object.assign(doc, patch);
  delete doc.updated_at;

  try {
    // Pojistka: mezitím mohl stejné ID dostat produkt z appky.
    const existing = await col.doc(newId).get();
    if (existing.exists) {
      setEditBusy(false);
      showEditError(`ID ${newId} už mezitím dostal jiný produkt. Zavři okno, obnov dashboard a duplikuj znovu.`);
      return;
    }
    await col.doc(newId).set(doc);
  } catch (e) {
    setEditBusy(false);
    showEditError("Vytvoření kopie selhalo: " + (e.message || e));
    return;
  }
  setEditBusy(false);

  const created = Object.assign({ _docId: newId }, doc);
  allProducts.push(created);
  sortProducts();
  closeEdit();
  updateStats();
  render();
  showStatus(
    `Vytvořena kopie ${newId} (z ${draft._source ? draft._source.product_id : "—"})` +
      (uploaded ? ` · nahráno ${window.pluralCz(uploaded, "nová fotka", "nové fotky", "nových fotek")}.` : "."),
    "success",
    4500
  );
}

/* --- Smazání produktu z databáze --- */
async function deleteProduct() {
  if (!editingProduct || !window.db) return;
  const p = editingProduct;
  const label = p.product_id || p._docId;

  editDeleteYesBtn.classList.add("is-loading");
  try {
    await window.db.collection("products").doc(p._docId).delete();
  } catch (e) {
    editDeleteYesBtn.classList.remove("is-loading");
    editErrorElem.textContent = "Smazání selhalo: " + (e.message || e);
    editDeleteConfirm.classList.add("is-hidden");
    return;
  }
  editDeleteYesBtn.classList.remove("is-loading");

  allProducts = allProducts.filter((x) => x !== p);
  selectedIds.delete(p._docId);
  closeEdit();
  updateStats();
  render();
  if (exportJob) {
    exportJob.items = exportJob.items.filter((x) => x !== p);
    if (exportJob.items.length) renderExportReview();
    else closeExportReview();
  }
  showStatus(`Produkt ${label} byl smazán z databáze.`, "warning", 4000);
}

/* --- Export CSV ---
   Řádek pro Aukro se skládá z plochých sloupců, chybějící hodnoty
   doplní "raw" (původní podoba produktu z appky). entityId doplní
   buildExportCsv (export.js) – v každém souboru 1…N. */
function toExportRow(p) {
  const r = p.raw || {};
  return {
    name: p.name != null ? p.name : r.name,
    language: r.language || "cs-CZ",
    extId: p.ext_id != null ? p.ext_id : r.extId,
    categoryId: p.category_id != null ? p.category_id : r.categoryId,
    description: p.description != null ? p.description : r.description,
    auctionPriceAmount: p.price != null ? p.price : r.auctionPriceAmount,
    auctionPriceCurrency: r.auctionPriceCurrency || "CZK",
    buyNowPriceAmount: r.buyNowPriceAmount != null ? r.buyNowPriceAmount : 0,
    buyNowPriceCurrency: r.buyNowPriceCurrency || "CZK",
    quantity: r.quantity != null ? r.quantity : 1,
    quantityUnit: r.quantityUnit || "pieces",
    duration: r.duration != null ? r.duration : 7,
    reexposeType: r.reexposeType != null ? r.reexposeType : 0,
    location: r.location || JSON.stringify({ countryCode: "CZ", postCode: "789 01", city: "Zvole" }),
    shippingTemplateId: p.shipping_template_id != null ? p.shipping_template_id : r.shippingTemplateId,
    shippingPayer: r.shippingPayer || "buyer",
    images: p.images != null ? p.images : r.images,
    bestOffer: r.bestOffer != null ? r.bestOffer : 1,
    onlyVerifiedBuyersEnabledOverride:
      r.onlyVerifiedBuyersEnabledOverride != null ? r.onlyVerifiedBuyersEnabledOverride : 0,
    attributes: r.attributes || "",
    priorityListing: p.priority_listing != null ? p.priority_listing : false,
    boldTitle: p.bold_title != null ? p.bold_title : false,
    highlight: p.highlight != null ? p.highlight : false
  };
}

// Číslo z ID produktu (RA07 → 7); produkty bez ID jdou na konec.
function idNumber(p) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(p.product_id || "");
  return m ? parseInt(m[2], 10) : Infinity;
}

// Stáhne dané produkty jako CSV pro Aukro. Řadí se od nejstaršího ID,
// takže entityId 1 dostane první produkt (např. RA01) a poslední N.
function sortForExport(items) {
  return items.slice().sort((a, b) => idNumber(a) - idNumber(b));
}
function writeCsv(sortedItems, fileSuffix, startAt) {
  window.downloadExportCsv(
    window.buildExportCsv(sortedItems.map(toExportRow), startAt),
    window.exportFileName(fileSuffix)
  );
}

/* ==========================================================
   Kontrola před exportem
   Než se CSV stáhne, ukáže se okno: volba začátku aukcí
   (každý další produkt +2 min), seznam produktů v pořadí
   exportu s kategorií a časem a upozornění na problémy.
   ==========================================================*/
const exportModal = document.getElementById("export-modal");
const exportSummaryElem = document.getElementById("export-summary");
const exportStartInput = document.getElementById("export-start");
const exportStartHelp = document.getElementById("export-start-help");
const exportIssuesElem = document.getElementById("export-issues");
const exportCatsElem = document.getElementById("export-categories");
const exportListElem = document.getElementById("export-list");
const exportConfirmBtn = document.getElementById("export-confirm-btn");
const exportConfirmText = document.getElementById("export-confirm-text");
const exportCancelBtn = document.getElementById("export-cancel-btn");

let exportJob = null; // { items (seřazené), suffix, successText }
const exportPromosElem = document.getElementById("export-promos");

// Varianty topování na Aukru (sloupce v DB / v raw pro export).
const PROMOS = [
  { key: "priority_listing", raw: "priorityListing", icon: "star", label: "Přednostní výpis", short: "Přednostní" },
  { key: "bold_title", raw: "boldTitle", icon: "bold", label: "Tučný titulek", short: "Tučný" },
  { key: "highlight", raw: "highlight", icon: "highlighter", label: "Zvýraznění", short: "Zvýraznění" }
];

// Zapne / vypne jedno topování přímo z kontroly exportu (uloží se hned).
async function toggleExportPromo(p, pr, chip) {
  if (!window.db || chip.classList.contains("is-loading")) return;
  const newVal = !p[pr.key];
  chip.classList.add("is-loading");
  const patch = { [pr.key]: newVal, updated_at: new Date().toISOString() };
  // „raw“ drží podobu pro export – měníme jen to jedno pole uvnitř.
  patch["raw." + pr.raw] = newVal;
  try {
    await window.db.collection("products").doc(p._docId).update(patch);
  } catch (e) {
    chip.classList.remove("is-loading");
    showStatus("Topování se nepodařilo uložit: " + (e.message || e), "error");
    return;
  }
  p[pr.key] = newVal;
  p.raw = Object.assign({}, p.raw || {}, { [pr.raw]: newVal });
  if (exportJob) {
    exportJob.lastEditedId = null; // bez bliknutí celého řádku – změna je vidět na přepínači
    renderExportReview();
  }
}

// Date ↔ hodnota pro <input type="datetime-local"> (místní čas)
function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function readExportStart() {
  const v = exportStartInput.value;
  if (!v) return null;
  const d = new Date(v); // bez zóny = místní čas
  return isNaN(d) ? null : d;
}
function fmtTime(d) {
  return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}
function fmtDateTime(d) {
  return d.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}
function categoryLabel(p) {
  if (p.category_id == null || p.category_id === "") return null;
  return window.findCategoryName(categoryGroups, p.category_id) || `Kategorie ${p.category_id}`;
}

function openExportReview(items, suffix, successText) {
  exportJob = { items: sortForExport(items), suffix, successText };
  exportStartInput.value = toLocalInputValue(window.defaultExportStart());
  exportStartInput.min = toLocalInputValue(new Date());
  renderExportReview();
  exportModal.classList.add("is-active");
  exportModal.querySelector(".modal-content").scrollTop = 0;
}

function closeExportReview() {
  exportModal.classList.remove("is-active");
  exportJob = null;
}

function renderExportReview() {
  if (!exportJob) return;
  const items = exportJob.items;
  const n = items.length;
  const start = readExportStart();

  exportSummaryElem.textContent =
    `${window.pluralCz(n, "produkt", "produkty", "produktů")} · ` +
    `každý další začne o ${window.EXPORT_STAGGER_MINUTES} min později.`;

  // Čas začátku
  const errors = [];
  if (!start) {
    errors.push("Vyber datum a čas začátku.");
    exportStartHelp.textContent = "";
  } else {
    const last = window.exportStartFor(start, n - 1);
    exportStartHelp.textContent =
      n > 1 ? `První ${fmtDateTime(start)}, poslední ${fmtDateTime(last)}.` : `Začátek ${fmtDateTime(start)}.`;
    if (start.getTime() < Date.now()) errors.push("Začátek je v minulosti – Aukro by aukce nevystavilo.");
  }

  // Upozornění k produktům (stažení nebrání, jen na ně upozorní)
  const noCat = items.filter((p) => !categoryLabel(p));
  const noPhoto = items.filter((p) => !imagesOf(p).length);
  const noPrice = items.filter((p) => p.price == null || p.price === "");
  const sold = items.filter((p) => p.sold);
  const ids = (list) => list.map((p) => p.product_id || "bez ID").join(", ");
  const warnings = [];
  if (noCat.length) warnings.push(`Bez kategorie: ${ids(noCat)}`);
  if (noPhoto.length) warnings.push(`Bez fotky: ${ids(noPhoto)}`);
  if (noPrice.length) warnings.push(`Bez ceny: ${ids(noPrice)}`);
  if (sold.length) warnings.push(`Už prodané: ${ids(sold)}`);

  exportIssuesElem.innerHTML = "";
  [...errors.map((t) => ["error", t]), ...warnings.map((t) => ["warning", t])].forEach(([type, text]) => {
    const row = document.createElement("p");
    row.className = "export-issue export-issue--" + type;
    row.innerHTML = window.icon(type === "error" ? "x-circle" : "alert");
    row.appendChild(document.createTextNode(text));
    exportIssuesElem.appendChild(row);
  });
  exportIssuesElem.classList.toggle("is-hidden", !errors.length && !warnings.length);

  // Topování: kolik produktů má kterou variantu
  exportPromosElem.innerHTML = "";
  PROMOS.forEach((pr) => {
    const count = items.filter((p) => !!p[pr.key]).length;
    const chip = document.createElement("span");
    chip.className = "export-cat" + (count ? " is-on" : "");
    chip.innerHTML = window.icon(pr.icon);
    chip.appendChild(document.createTextNode(pr.label));
    const c = document.createElement("b");
    c.textContent = count;
    chip.appendChild(c);
    exportPromosElem.appendChild(chip);
  });
  const plain = items.filter((p) => !PROMOS.some((pr) => !!p[pr.key])).length;
  const plainChip = document.createElement("span");
  plainChip.className = "export-cat";
  plainChip.textContent = "Bez topování";
  const pc = document.createElement("b");
  pc.textContent = plain;
  plainChip.appendChild(pc);
  exportPromosElem.appendChild(plainChip);

  // Kategorie: kolik produktů v které
  const byCat = new Map();
  items.forEach((p) => {
    const label = categoryLabel(p) || "Bez kategorie";
    byCat.set(label, (byCat.get(label) || 0) + 1);
  });
  exportCatsElem.innerHTML = "";
  Array.from(byCat.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "cs"))
    .forEach(([label, count]) => {
      const chip = document.createElement("span");
      chip.className = "export-cat" + (label === "Bez kategorie" ? " is-missing" : "");
      chip.textContent = label;
      const c = document.createElement("b");
      c.textContent = count;
      chip.appendChild(c);
      exportCatsElem.appendChild(chip);
    });

  // Produkty v pořadí exportu
  exportListElem.innerHTML = "";
  items.forEach((p, i) => {
    const li = document.createElement("li");
    const cat = categoryLabel(p);
    const img = imagesOf(p)[0];
    const promoted = PROMOS.some((pr) => !!p[pr.key]);
    li.className = "export-item" + (!cat || !img ? " has-issue" : "") +
      (promoted ? " is-promoted" : "") +
      (p._docId === exportJob.lastEditedId ? " is-updated" : "");
    // Celý řádek je tlačítko: otevře úpravu produktu nad kontrolou exportu.
    li.innerHTML = `
      <button type="button" class="export-item-btn" title="Upravit ${escapeHtml(p.product_id || "produkt")}">
        <span class="export-n">${i + 1}</span>
        <span class="export-thumb">${img ? thumbImg(img, 96, "", 'loading="lazy" decoding="async"') : window.icon("image")}</span>
        <span class="export-info">
          <span class="export-name"><b>${escapeHtml(p.product_id || "—")}</b> ${escapeHtml(displayName(p))}</span>
          <span class="export-meta">${p.price != null ? escapeHtml(p.price) + " Kč" : "bez ceny"} · ${escapeHtml(cat || "Bez kategorie")}</span>
        </span>
        <time class="export-time">${start ? fmtTime(window.exportStartFor(start, i)) : "–"}</time>
        <span class="export-edit">${window.icon("pencil")}</span>
      </button>
      <div class="export-promos" role="group" aria-label="Topování ${escapeHtml(p.product_id || "")}"></div>
    `;
    li.querySelector(".export-item-btn").addEventListener("click", () => openEdit(p));
    // Přepínače topování – mění se rovnou v databázi.
    const promosBox = li.querySelector(".export-promos");
    PROMOS.forEach((pr) => {
      const on = !!p[pr.key];
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "promo-chip";
      chip.dataset.promo = pr.key;
      chip.setAttribute("aria-pressed", on ? "true" : "false");
      // Jen ikona; co dělá, říká title (najetí myší) a aria-label (čtečky).
      chip.title = (on ? "Zrušit: " : "Zapnout: ") + pr.label;
      chip.setAttribute("aria-label", pr.label);
      chip.innerHTML = window.icon(pr.icon);
      chip.addEventListener("click", () => toggleExportPromo(p, pr, chip));
      promosBox.appendChild(chip);
    });
    exportListElem.appendChild(li);
  });

  exportConfirmBtn.disabled = errors.length > 0;
  exportConfirmText.textContent = warnings.length ? "Stáhnout i tak" : "Stáhnout CSV";
}

function confirmExport() {
  const start = readExportStart();
  if (!exportJob || !start || start.getTime() < Date.now()) {
    renderExportReview(); // ukáže, co chybí
    return;
  }
  const { items, suffix, successText } = exportJob;
  writeCsv(items, suffix, start);
  closeExportReview();
  showStatus(`${successText} První začíná ${fmtDateTime(start)}.`, "success", 5000);
}

// Všechny neprodané produkty.
function exportAll() {
  const items = allProducts.filter((p) => !p.sold);
  if (!items.length) {
    showStatus("Žádné neprodané produkty k exportu.", "warning", 4000);
    return;
  }
  openExportReview(
    items,
    "export",
    `Vyexportováno ${window.pluralCz(items.length, "produkt", "produkty", "produktů")} do CSV (prodané vynechány).`
  );
}

// Jen ručně vybrané produkty – přesně ty, které jsou označené
// (včetně prodaných, pokud si je uživatel vybral).
function exportSelected() {
  const items = allProducts.filter((p) => selectedIds.has(p._docId));
  if (!items.length) {
    showStatus("Nejdřív označ produkty, které chceš exportovat.", "warning", 4000);
    return;
  }
  openExportReview(
    items,
    "vyber",
    `Vyexportováno do CSV: ${window.pluralCz(items.length, "vybraný produkt", "vybrané produkty", "vybraných produktů")}.`
  );
}

/* --- Náhled fotek --- */
function openPhotos(imgs) {
  photoModalBody.innerHTML = imgs
    .map((u, i) => thumbImg(u, 1200, `fotka ${i + 1}`, 'decoding="async"'))
    .join("");
  photoModal.classList.add("is-active");
}
function closePhotos() {
  photoModal.classList.remove("is-active");
}

/* --- Události --- */
searchInput.addEventListener("input", render);
// „Skrýt prodané“ a „Jen prodané“ se vylučují – zapnutí jednoho vypne druhý.
hideSoldInput.addEventListener("change", () => {
  if (hideSoldInput.checked) onlySoldInput.checked = false;
  render();
});
onlySoldInput.addEventListener("change", () => {
  if (onlySoldInput.checked) hideSoldInput.checked = false;
  render();
});
refreshBtn.addEventListener("click", loadProducts);
exportBtn.addEventListener("click", exportAll);
exportSelectedBtn.addEventListener("click", exportSelected);
selectAllBtn.addEventListener("click", toggleSelectAllVisible);
selectionClearBtn.addEventListener("click", clearSelection);
statusMsg.addEventListener("click", hideStatus);

/* --- Události hromadného označení prodaných --- */
document.getElementById("bulk-sold-btn").addEventListener("click", openBulkSold);
bulkSoldInput.addEventListener("input", renderBulkSold);
bulkSoldConfirm.addEventListener("click", confirmBulkSold);
document.getElementById("bulk-sold-cancel").addEventListener("click", closeBulkSold);
bulkSoldModal.querySelector(".modal-background").addEventListener("click", closeBulkSold);

/* --- Události cen prodejů a historie cen --- */
document.getElementById("prices-btn").addEventListener("click", openPrices);
pricesInput.addEventListener("input", renderPrices);
pricesConfirm.addEventListener("click", confirmPrices);
document.getElementById("prices-cancel").addEventListener("click", closePrices);
pricesModal.querySelector(".modal-background").addEventListener("click", closePrices);
document.getElementById("sales-close").addEventListener("click", closeSales);
salesModal.querySelector(".modal-background").addEventListener("click", closeSales);
// Graf se kreslí na šířku okna – při otočení telefonu / změně okna znovu.
let salesResizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(salesResizeTimer);
  salesResizeTimer = setTimeout(() => {
    if (salesProduct) drawSalesChart(salesChart, window.salesOf(salesProduct));
  }, 120);
});

/* --- Události kontroly exportu --- */
exportStartInput.addEventListener("input", renderExportReview);
exportConfirmBtn.addEventListener("click", confirmExport);
exportCancelBtn.addEventListener("click", closeExportReview);
exportModal.querySelector(".modal-background").addEventListener("click", closeExportReview);
photoModal
  .querySelectorAll(".modal-background, .modal-close")
  .forEach((el) => el.addEventListener("click", closePhotos));

/* --- Události modálu úprav --- */
editCategoryBtn.addEventListener("click", () => {
  const hidden = editCategoryPanel.classList.toggle("is-hidden");
  if (!hidden) {
    renderCategoryList(editCategorySearch.value);
    editCategorySearch.focus();
  }
});
editCategorySearch.addEventListener("input", () => renderCategoryList(editCategorySearch.value));
editPhotoAddBtn.addEventListener("click", () => {
  const url = editPhotoUrlInput.value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) {
    editErrorElem.textContent = "Odkaz na fotku musí začínat http(s)://";
    return;
  }
  if (editPhotos.length >= window.MAX_PHOTOS) {
    editErrorElem.textContent = `Na produkt jde nejvýš ${window.MAX_PHOTOS} fotek.`;
    return;
  }
  editErrorElem.textContent = "";
  editPhotos.push({ url });
  editPhotoUrlInput.value = "";
  renderEditPhotos();
});
[editPhotoCamera, editPhotoGallery].forEach((input) => {
  input.addEventListener("change", async () => {
    const picked = Array.from(input.files || []);
    input.value = ""; // ať jde stejnou fotku vybrat znovu
    await addEditPhotoFiles(picked);
  });
});
editSaveBtn.addEventListener("click", saveEdit);
editCancelBtn.addEventListener("click", closeEdit);
editDeleteBtn.addEventListener("click", () => {
  if (!editingProduct) return;
  editErrorElem.textContent = "";
  editDeleteIdElem.textContent = editingProduct.product_id || editingProduct._docId || "—";
  editDeleteConfirm.classList.remove("is-hidden");
  editDeleteConfirm.scrollIntoView({ block: "nearest" });
});
editDeleteNoBtn.addEventListener("click", () => editDeleteConfirm.classList.add("is-hidden"));
editDeleteYesBtn.addEventListener("click", deleteProduct);
editModal.querySelector(".modal-background").addEventListener("click", closeEdit);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  // Ořez fotky má vlastní tlačítka; Escape by pod ním zavřel celou úpravu.
  if (document.querySelector("#crop-modal.is-active")) return;
  // Zavírá se jen horní okno: úprava otevřená z kontroly exportu nejdřív.
  if (editModal.classList.contains("is-active")) {
    closeEdit();
    return;
  }
  closePhotos();
  closeExportReview();
  closeBulkSold();
  closePrices();
  closeSales();
});

/* --- Start (až po přihlášení vlastníka) --- */
window.onAuthReady(loadProducts);
