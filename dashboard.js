/* ---------------------------------
   iAUKRO Dashboard – přehled produktů
   Čte data z Firestore (kolekce "products"),
   umožňuje produkty upravit, smazat, označit
   "prodáno" a vyexportovat Excel ve stejném
   formátu jako appka – buď všechny neprodané,
   nebo jen ručně vybrané.
-----------------------------------*/

let allProducts = [];

// ID dokumentů (_docId) ručně vybraných k exportu.
const selectedIds = new Set();

// Výchozí doprava (ZS or BA) – stejná jako v appce.
const DEFAULT_SHIPPING_ID = "2438895";

const container = document.getElementById("products-container");
const searchInput = document.getElementById("search");
const hideSoldInput = document.getElementById("hide-sold");
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

/* Hlavičky Excelu – MUSÍ sedět s appkou (formát pro Aukro/Cloudinary) */
const EXPORT_HEADERS = [
  "entityId", "name", "language", "extId", "categoryId", "description",
  "auctionPriceAmount", "auctionPriceCurrency", "buyNowPriceAmount",
  "buyNowPriceCurrency", "quantity", "quantityUnit", "startingAt", "duration",
  "reexposeType", "location", "shippingTemplateId", "shippingPayer", "images",
  "bestOffer", "onlyVerifiedBuyersEnabledOverride", "attributes",
  "priorityListing", "boldTitle", "highlight"
];

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
// Startovní čas aukce = celá hodina, +1h (stejně jako v appce)
function getRoundedISODate() {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d.toISOString().replace(".000Z", "Z");
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
  allProducts = snap.docs.map((doc) => {
    const d = doc.data() || {};
    d._docId = doc.id;
    if (d.created_at && typeof d.created_at.toDate === "function") d.created_at = d.created_at.toDate().toISOString();
    if (d.sold_at && typeof d.sold_at.toDate === "function") d.sold_at = d.sold_at.toDate().toISOString();
    return d;
  });
  // Řazení: nejnovější nahoře; při shodném čase (hromadný import) podle čísla ID sestupně
  const numOf = (pid) => {
    const m = /^([A-Za-z]+)(\d+)$/.exec(pid || "");
    return m ? parseInt(m[2], 10) : -1;
  };
  allProducts.sort((a, b) => {
    const t = String(b.created_at || "").localeCompare(String(a.created_at || ""));
    return t !== 0 ? t : numOf(b.product_id) - numOf(a.product_id);
  });

  // Ve výběru necháme jen produkty, které v databázi pořád jsou.
  const known = new Set(allProducts.map((p) => p._docId));
  Array.from(selectedIds).forEach((id) => { if (!known.has(id)) selectedIds.delete(id); });

  updateStats();
  animateNextRender = true;
  render();
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
  return allProducts.filter((p) => {
    if (hideSold && p.sold) return false;
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
      <div class="prod-actions">
        <button class="btn btn--ghost btn--sm edit-toggle">
          ${window.icon("pencil")} Upravit
        </button>
        <button class="btn btn--sm sold-toggle ${p.sold ? "btn--ghost" : ""}">
          ${p.sold ? window.icon("undo") + " Vrátit" : window.icon("check") + " Prodáno"}
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
  return el;
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
   Úprava produktu
   Uloží se jak "ploché" sloupce (pro dashboard), tak odpovídající
   pole v "raw" – z toho se skládá Excel pro Aukro, ať se obojí
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

function openEdit(p) {
  editingProduct = p;
  editPhotos = imagesOf(p).map((url) => ({ url }));

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
  showStatus(`Produkt ${label} byl smazán z databáze.`, "warning", 4000);
}

/* --- Export Excelu ---
   Řádek pro Aukro se skládá z plochých sloupců, chybějící hodnoty
   doplní "raw" (původní podoba produktu z appky). */
function toExportRow(p, i) {
  const r = p.raw || {};
  return {
    entityId: r.entityId != null ? r.entityId : i + 1,
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
    startingAt: getRoundedISODate(),
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

// Zapíše dané produkty do .xlsx; vrátí false, když není co nebo čím zapsat.
function writeExcel(items, fileSuffix) {
  if (typeof XLSX === "undefined") {
    showStatus("Knihovna XLSX se nenačetla.", "error");
    return false;
  }
  const ws = XLSX.utils.json_to_sheet(items.map(toExportRow), { header: EXPORT_HEADERS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");

  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  XLSX.writeFile(wb, `products_${dd}${mm}${yyyy}_${fileSuffix}.xlsx`);
  return true;
}

// Všechny neprodané produkty.
function exportExcel() {
  const items = allProducts.filter((p) => !p.sold);
  if (!items.length) {
    showStatus("Žádné neprodané produkty k exportu.", "warning", 4000);
    return;
  }
  if (writeExcel(items, "export")) {
    showStatus(
      `Vyexportováno ${window.pluralCz(items.length, "produkt", "produkty", "produktů")} (prodané vynechány).`,
      "success",
      4000
    );
  }
}

// Jen ručně vybrané produkty – přesně ty, které jsou označené
// (včetně prodaných, pokud si je uživatel vybral), v pořadí z dashboardu.
function exportSelected() {
  const items = allProducts.filter((p) => selectedIds.has(p._docId));
  if (!items.length) {
    showStatus("Nejdřív označ produkty, které chceš exportovat.", "warning", 4000);
    return;
  }
  if (writeExcel(items, "vyber")) {
    showStatus(
      `Vyexportováno: ${window.pluralCz(items.length, "vybraný produkt", "vybrané produkty", "vybraných produktů")}.`,
      "success",
      4000
    );
  }
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
hideSoldInput.addEventListener("change", render);
refreshBtn.addEventListener("click", loadProducts);
exportBtn.addEventListener("click", exportExcel);
exportSelectedBtn.addEventListener("click", exportSelected);
selectAllBtn.addEventListener("click", toggleSelectAllVisible);
selectionClearBtn.addEventListener("click", clearSelection);
statusMsg.addEventListener("click", hideStatus);
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
  closePhotos();
  closeEdit();
});

/* --- Start (až po přihlášení vlastníka) --- */
window.onAuthReady(loadProducts);
