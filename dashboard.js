/* ---------------------------------
   iAUKRO Dashboard – přehled produktů
   Čte data z Firestore (kolekce "products"),
   umožňuje označit "prodáno" a vyexportovat
   Excel ve stejném formátu jako appka (bez prodaných).
-----------------------------------*/

let allProducts = [];

const container = document.getElementById("products-container");
const searchInput = document.getElementById("search");
const hideSoldInput = document.getElementById("hide-sold");
const statusMsg = document.getElementById("status-msg");
const refreshBtn = document.getElementById("refresh-btn");
const exportBtn = document.getElementById("export-btn");
const photoModal = document.getElementById("photo-modal");
const photoModalBody = document.getElementById("photo-modal-body");

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
function showStatus(msg, type = "is-info") {
  statusMsg.className = `notification is-rounded ${type}`;
  statusMsg.textContent = msg;
  statusMsg.classList.remove("is-hidden");
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
  return d.toLocaleString("cs-CZ", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}
function imagesOf(p) {
  if (Array.isArray(p.image_list) && p.image_list.length) return p.image_list;
  if (p.images) return String(p.images).split(" ").filter(Boolean);
  return [];
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
    showStatus("⚠️ Firebase není nastaven. Zkontroluj firebase-config.js.", "is-warning");
    container.innerHTML = "";
    return;
  }
  showStatus("⏳ Načítám produkty…");
  let snap;
  try {
    snap = await window.db.collection("products").get();
  } catch (e) {
    showStatus("❌ Chyba při načítání: " + (e.message || e), "is-danger");
    return;
  }
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
  updateStats();
  render();
}

/* --- Statistiky --- */
function updateStats() {
  const total = allProducts.length;
  const soldCount = allProducts.filter((p) => p.sold).length;
  const today = new Date().toISOString().split("T")[0];
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
function render() {
  const q = searchInput.value.trim().toLowerCase();
  const hideSold = hideSoldInput.checked;

  const list = allProducts.filter((p) => {
    if (hideSold && p.sold) return false;
    if (!q) return true;
    return (
      (p.product_id && p.product_id.toLowerCase().includes(q)) ||
      (p.name && p.name.toLowerCase().includes(q))
    );
  });

  container.innerHTML = "";
  if (!list.length) {
    container.innerHTML = `<p class="has-text-grey p-4">😕 Žádné produkty k zobrazení.</p>`;
    return;
  }
  list.forEach((p) => container.appendChild(card(p)));
}

function card(p) {
  const el = document.createElement("div");
  el.className = "prod-card" + (p.sold ? " is-sold" : "");

  const imgs = imagesOf(p);
  const thumb = imgs[0] || "";

  el.innerHTML = `
    ${p.sold ? '<span class="sold-badge">✅ PRODÁNO</span>' : ""}
    <div class="prod-thumb" ${thumb ? `style="background-image:url('${escapeHtml(thumb)}')"` : ""}>
      ${thumb ? "" : '<i class="fa-solid fa-image"></i>'}
      ${imgs.length ? `<span class="prod-thumb-count">📷 ${imgs.length}</span>` : ""}
    </div>
    <div class="prod-body">
      <div class="prod-id">${escapeHtml(p.product_id || "—")}</div>
      <div class="prod-name">${escapeHtml(p.name || "")}</div>
      <div class="prod-meta">
        <span>💰 ${p.price != null ? escapeHtml(p.price) + " Kč" : "—"}</span>
        <span>📦 ${escapeHtml(p.location || "—")}</span>
      </div>
      <div class="prod-date">🕒 ${fmtDate(p.created_at)}</div>
      <div class="prod-actions">
        <button class="button is-small is-rounded edit-toggle is-light">
          ✏️ Upravit
        </button>
        <button class="button is-small is-rounded sold-toggle ${p.sold ? "is-light" : "is-danger"}">
          ${p.sold ? "↩️ Zrušit prodej" : "✅ Označit jako prodáno"}
        </button>
      </div>
    </div>
  `;

  const thumbEl = el.querySelector(".prod-thumb");
  if (imgs.length) {
    thumbEl.classList.add("is-clickable");
    thumbEl.addEventListener("click", () => openPhotos(imgs));
  }
  el.querySelector(".sold-toggle").addEventListener("click", (e) => toggleSold(p, e.currentTarget));
  el.querySelector(".edit-toggle").addEventListener("click", () => openEdit(p));
  return el;
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
    showStatus("❌ Nepovedlo se uložit: " + (e.message || e), "is-danger");
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
let editPhotos = [];         // rozpracovaný seznam fotek
let categoryGroups = [];     // kategorie z MapaKat.txt

const editModal = document.getElementById("edit-modal");
const editNameInput = document.getElementById("edit-name");
const editPriceInput = document.getElementById("edit-price");
const editLocationInput = document.getElementById("edit-location");
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
const editPhotoUrlInput = document.getElementById("edit-photo-url");
const editPhotoAddBtn = document.getElementById("edit-photo-add");
const editErrorElem = document.getElementById("edit-error");
const editSaveBtn = document.getElementById("edit-save-btn");
const editCancelBtn = document.getElementById("edit-cancel-btn");

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
    groupEl.textContent = "📂 " + group.name;
    editCategoryList.appendChild(groupEl);
    filtered.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = "📦 " + escapeHtml(cat.name);
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
    none.className = "has-text-grey";
    none.textContent = categoryGroups.length
      ? "😕 Žádné kategorie nenalezeny."
      : "⚠️ Kategorie se nepodařilo načíst (MapaKat.txt).";
    editCategoryList.appendChild(none);
  }
}

function renderEditPhotos() {
  editPhotosBox.innerHTML = "";
  if (!editPhotos.length) {
    editPhotosBox.innerHTML = `<p class="has-text-grey is-size-7">Žádné fotky.</p>`;
    return;
  }
  editPhotos.forEach((url, index) => {
    const item = document.createElement("div");
    item.className = "edit-photo-item";
    item.innerHTML = `
      <img src="${escapeHtml(url)}" alt="foto ${index + 1}" />
      ${index === 0 ? '<span class="edit-photo-main">hlavní</span>' : ""}
    `;

    if (index > 0) {
      const firstBtn = document.createElement("button");
      firstBtn.type = "button";
      firstBtn.className = "edit-photo-first";
      firstBtn.title = "Dát jako hlavní";
      firstBtn.innerHTML = "⭐";
      firstBtn.addEventListener("click", () => {
        editPhotos.splice(index, 1);
        editPhotos.unshift(url);
        renderEditPhotos();
      });
      item.appendChild(firstBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "edit-photo-remove";
    removeBtn.title = "Odebrat fotku";
    removeBtn.innerHTML = "&times;";
    removeBtn.addEventListener("click", () => {
      editPhotos.splice(index, 1);
      renderEditPhotos();
    });
    item.appendChild(removeBtn);

    editPhotosBox.appendChild(item);
  });
}

function openEdit(p) {
  editingProduct = p;
  editPhotos = imagesOf(p).slice();

  document.getElementById("edit-product-id").textContent = p.product_id || "—";
  editNameInput.value = p.name || "";
  editPriceInput.value = p.price != null ? p.price : "";
  editLocationInput.value = p.location || "";
  editDateInput.value = dateInputValue(p);
  editCategoryIdInput.value = p.category_id != null ? p.category_id : "";
  refreshCategoryButton();

  const shipping = p.shipping_template_id != null ? String(p.shipping_template_id) : "";
  // Doprava, kterou seznam nezná (starší produkt), se do selectu doplní.
  if (shipping && !Array.from(editShippingSelect.options).some((o) => o.value === shipping)) {
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
  renderEditPhotos();

  editModal.classList.add("is-active");
}

function closeEdit() {
  editModal.classList.remove("is-active");
  editingProduct = null;
}

async function saveEdit() {
  if (!editingProduct || !window.db) return;
  const p = editingProduct;

  const name = editNameInput.value.trim();
  const priceRaw = editPriceInput.value.trim();
  const location = editLocationInput.value.trim();
  const dateStr = editDateInput.value;
  const categoryId = editCategoryIdInput.value.trim();
  const shippingId = editShippingSelect.value;

  if (!name) {
    editErrorElem.textContent = "⚠️ Název nesmí být prázdný.";
    return;
  }
  if (priceRaw === "" || isNaN(parseInt(priceRaw, 10))) {
    editErrorElem.textContent = "⚠️ Zadej cenu číslem.";
    return;
  }
  editErrorElem.textContent = "";

  const price = parseInt(priceRaw, 10);
  const categoryNum = categoryId ? parseInt(categoryId, 10) : null;
  const shippingNum = shippingId ? parseInt(shippingId, 10) : null;
  const images = editPhotos.join(" ");
  const extId = p.product_id ? `${location} | ${p.product_id}` : p.ext_id || null;

  const patch = {
    name,
    price,
    location: location || null,
    ext_id: extId,
    category_id: categoryNum,
    shipping_template_id: shippingNum,
    images,
    image_list: editPhotos.slice(),
    priority_listing: editPromoPriority.checked,
    bold_title: editPromoBold.checked,
    highlight: editPromoHighlight.checked,
    updated_at: new Date().toISOString()
  };

  // Datum: mění se jen když ho uživatel opravdu přepsal. Do created_at
  // dáváme poledne, stejně jako zpětné zadávání v appce.
  if (dateStr && dateStr !== dateInputValue(p)) {
    const d = new Date(`${dateStr}T12:00:00`);
    patch.date_added = dateStr;
    if (!isNaN(d)) patch.created_at = d.toISOString();
  }

  // "raw" drží podobu produktu pro export do Aukra – držíme ho v souladu.
  patch.raw = Object.assign({}, p.raw || {}, {
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
  });

  editSaveBtn.classList.add("is-loading");
  try {
    await window.db.collection("products").doc(p._docId).update(patch);
  } catch (e) {
    editSaveBtn.classList.remove("is-loading");
    editErrorElem.textContent = "❌ Uložení selhalo: " + (e.message || e);
    return;
  }
  editSaveBtn.classList.remove("is-loading");

  Object.assign(p, patch);
  closeEdit();
  updateStats();
  render();
  showStatus(`✅ Produkt ${p.product_id || ""} upraven.`, "is-success");
  setTimeout(hideStatus, 3000);
}

/* --- Export Excelu (bez prodaných) --- */
function exportExcel() {
  if (typeof XLSX === "undefined") {
    showStatus("❌ Knihovna XLSX se nenačetla.", "is-danger");
    return;
  }
  const items = allProducts.filter((p) => !p.sold);
  if (!items.length) {
    showStatus("😕 Žádné neprodané produkty k exportu.", "is-warning");
    return;
  }

  const data = items.map((p, i) => {
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
  });

  const ws = XLSX.utils.json_to_sheet(data, { header: EXPORT_HEADERS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");

  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  XLSX.writeFile(wb, `products_${dd}${mm}${yyyy}_export.xlsx`);

  showStatus(`✅ Vyexportováno ${items.length} produktů (prodané vynechány).`, "is-success");
}

/* --- Náhled fotek --- */
function openPhotos(imgs) {
  photoModalBody.innerHTML = imgs
    .map((u) => `<img src="${escapeHtml(u)}" alt="foto produktu" />`)
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
    editErrorElem.textContent = "⚠️ Odkaz na fotku musí začínat http(s)://";
    return;
  }
  editErrorElem.textContent = "";
  editPhotos.push(url);
  editPhotoUrlInput.value = "";
  renderEditPhotos();
});
editSaveBtn.addEventListener("click", saveEdit);
editCancelBtn.addEventListener("click", closeEdit);
editModal.querySelector(".modal-background").addEventListener("click", closeEdit);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closePhotos();
    closeEdit();
  }
});

/* --- Start (až po přihlášení vlastníka) --- */
window.onAuthReady(loadProducts);
