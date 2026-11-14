/* ---------------------------------
   Základní konfigurace
-----------------------------------*/
// Cloudinary (adresa, preset) je v photos.js – sdílí ho appka i dashboard.
const CLOUDINARY_UPLOAD_URL = window.CLOUDINARY_UPLOAD_URL;
const CLOUDINARY_UPLOAD_PRESET = window.CLOUDINARY_UPLOAD_PRESET;

// Výchozí doprava (ZS or BA). Po každém produktu se výběr vrací sem.
const DEFAULT_SHIPPING_ID = "2438895";

/* ---------------------------------
   Proměnné
-----------------------------------*/
let photos = [];
let categories = [];
let currentStep = 0; // 0 = ID, 1 = fotky, 2 = detaily, 3 = hotovo

/* ---------------------------------
   ID produktu (nahrazuje výběr obchodu)
-----------------------------------*/
let currentProductId = null; // aktuální ID, např. "RA01"
let productIdPrefix = "";     // písmenná část, např. "RA"
let productIdNum = 0;         // číselná část, např. 1
let productIdWidth = 2;       // šířka číselné části pro doplnění nul

/* ---------------------------------
   Režim přidávání
   "live"  = produkt fotím právě teď
   "retro" = fotky už mám v mobilu a produkty
             zadávám zpětně (s vlastním datem)
-----------------------------------*/
let entryMode = "live";
let retroDateStr = ""; // YYYY-MM-DD; prázdné = doplní se z data fotky

// Fotky: při focení jsou povinné 3, ve zpětném režimu stačí 1.
// Nad povinný počet jde přidat další, až do MAX_PHOTOS.
const BASE_PHOTOS = 3;
const MAX_PHOTOS = window.MAX_PHOTOS;
function minPhotosRequired() {
  return isRetroMode() ? 1 : BASE_PHOTOS;
}
function isRetroMode() {
  return entryMode === "retro";
}

/* ---------------------------------
   DOM prvky
-----------------------------------*/
const startProductIdInput = document.getElementById("start-product-id");
const lastIdDisplay = document.getElementById("last-id-display");
const photoInput = document.getElementById("photo-input");
const galleryInput = document.getElementById("gallery-input");
const takePhotoBtn = document.getElementById("take-photo-btn");
const pickPhotoBtn = document.getElementById("pick-photo-btn");
const photoCountElem = document.getElementById("photo-count");
const photoCountLabel = document.getElementById("photo-count-label");
const photoCountHint = document.getElementById("photo-count-hint");
const photoStepTitle = document.getElementById("photo-step-title");
const photoPreview = document.getElementById("photo-preview");
const photoPreviewDetails = document.getElementById("photo-preview-details");
const detailsPhotoCount = document.getElementById("details-photo-count");
const productNoteInput = document.getElementById("product-note");

const modeLiveRadio = document.getElementById("mode-live");
const modeRetroRadio = document.getElementById("mode-retro");
const retroDateField = document.getElementById("retro-date-field");
const retroDateInput = document.getElementById("retro-date");
const retroBadge = document.getElementById("retro-badge");
const statusElem = document.getElementById("status");
const statusIconElem = document.getElementById("status-icon");
const statusTextElem = document.getElementById("status-text");
const dailyCountElem = document.getElementById("daily-count");

const shopSelectionSection = document.getElementById("shop-selection");
const photoSectionSection = document.getElementById("photo-section");
const productDetailsSection = document.getElementById("product-details");
const finishSection = document.getElementById("finish-section");

const categoryBtn = document.getElementById("category-btn");
const categoryBtnText = document.getElementById("category-btn-text");
const categoryIdInput = document.getElementById("category-id");
const categoryModal = document.getElementById("category-modal");
const categorySearch = document.getElementById("category-search");
const categoryList = document.getElementById("category-list");
const categoryCloseBtn = document.getElementById("category-close-btn");

const progressBar = document.getElementById("progress-bar");

const confirmModal = document.getElementById("confirm-modal");
const confirmYesBtn = document.getElementById("confirm-yes");
const confirmNoBtn = document.getElementById("confirm-no");

const finishBtn = document.getElementById("finish-btn");
const resetBtn = document.getElementById("reset-btn");


const shippingMethodSelect = document.getElementById("shippingMethod");

/* ---------------------------------
   Načtení kategorií (MapaKat.txt)
   - parsování je v categories.js
     (sdílené s dashboardem)
   - pokud v Android prohlížeči fetch
     selže, kategorie se nenačtou,
     ale zbytek poběží normálně.
-----------------------------------*/
window.loadCategoryGroups()
  .then((groups) => {
    categories = groups;
  })
  .catch((err) => {
    updateStatus('Chyba při načítání kategorií! Zkontroluj soubor.', "error");
  });

/* ---------------------------------
   Pomocné funkce
-----------------------------------*/
// Typ určuje ikonu a důraz: info | success | warning | error | progress
const STATUS_ICONS = {
  info: "info",
  success: "check-circle",
  warning: "alert",
  error: "x-circle",
  progress: "loader"
};
function updateStatus(message, type = "info") {
  const iconName = STATUS_ICONS[type] || STATUS_ICONS.info;
  statusElem.dataset.type = type;
  statusIconElem.innerHTML = window.icon(iconName, type === "progress" ? "spin" : "");
  statusTextElem.textContent = message;

  // Krátké „nadechnutí“, ať je vidět, že se zpráva změnila.
  statusElem.classList.remove("is-fresh");
  void statusElem.offsetWidth;
  statusElem.classList.add("is-fresh");

  updateDailyCountDisplay();
}

// Vrátí YYYY-MM-DD (lokální datum, ne UTC – jinak by se po půlnoci UTC
// posouval den)
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function getTodayDateString() {
  return toDateString(new Date());
}

// "2025-03-26" -> "26. 3. 2025"
function formatDateCz(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("cs-CZ");
}

// Datum, se kterým se produkt uloží – u zpětného zadání vybrané,
// jinak dnešní.
function getEffectiveDateString() {
  if (isRetroMode() && retroDateStr) return retroDateStr;
  return getTodayDateString();
}

// created_at pro databázi. U zpětného zadání použijeme vybrané datum
// (poledne), aby dashboard produkt zobrazil i seřadil ke správnému dni.
function getEffectiveCreatedAtISO() {
  if (isRetroMode() && retroDateStr) {
    const d = new Date(`${retroDateStr}T12:00:00`);
    if (!isNaN(d)) return d.toISOString();
  }
  return new Date().toISOString();
}

// Datum pořízení fotky (z metadat souboru) – použije se jako návrh
// data při zpětném zadávání.
function fileDateString(file) {
  if (!file || !file.lastModified) return null;
  const d = new Date(file.lastModified);
  if (isNaN(d)) return null;
  return toDateString(d);
}

// Aktualizace počtu přidaných produktů (u zpětného zadání k vybranému datu)
function updateDailyCountDisplay() {
  const products = JSON.parse(localStorage.getItem("products")) || [];
  const dateStr = getEffectiveDateString();
  let dailyCount = 0;
  products.forEach((p) => {
    if (p.dateAdded === dateStr) {
      dailyCount++;
    }
  });
  const countText = window.pluralCz(dailyCount, "produkt", "produkty", "produktů");
  dailyCountElem.textContent =
    isRetroMode() && retroDateStr
      ? `K datu ${formatDateCz(dateStr)} přidáno: ${countText}`
      : `Dnes přidáno: ${countText}`;
}

// Zobrazí dříve použitá umístění (štítky pod polem)
function updateLocationHistory() {
  renderInputHistory("product-location");
}

// Otevření a zavření modálu
function openModal(modalElem) {
  modalElem.classList.add("is-active");
}
function closeModal(modalElem) {
  modalElem.classList.remove("is-active");
}


/* ---------------------------------
   Režim přidávání (fotím teď / zpětně)
   – volba se pamatuje v localStorage,
     takže při zpětném zadávání více
     produktů se nastavuje jen jednou.
-----------------------------------*/
function saveEntryModeState() {
  localStorage.setItem(
    "entryModeState",
    JSON.stringify({ mode: entryMode, date: retroDateStr })
  );
}

// Popisky a viditelnost prvků podle zvoleného režimu
function applyEntryModeUI() {
  const retro = isRetroMode();

  if (modeLiveRadio) modeLiveRadio.checked = !retro;
  if (modeRetroRadio) modeRetroRadio.checked = retro;
  if (retroDateField) retroDateField.classList.toggle("is-hidden", !retro);
  if (retroDateInput) {
    retroDateInput.max = getTodayDateString();
    if (retroDateInput.value !== retroDateStr) retroDateInput.value = retroDateStr;
  }

  if (photoStepTitle) {
    photoStepTitle.textContent = retro ? "Vyber fotky" : "Nafoť fotky";
  }
  if (photoCountLabel) {
    photoCountLabel.textContent = retro ? "Vybráno:" : "Nafoceno:";
  }
  if (takePhotoBtn) {
    // Ve zpětném režimu je hlavní cesta galerie, focení necháme jako doplněk.
    takePhotoBtn.classList.toggle("btn--ghost", retro);
  }
  if (pickPhotoBtn) {
    pickPhotoBtn.classList.toggle("btn--ghost", !retro);
  }

  if (retroBadge) {
    if (retro) {
      retroBadge.classList.remove("is-hidden");
      retroBadge.innerHTML =
        window.icon("history") +
        (retroDateStr
          ? `<span>Zpětné zadání – produkt se uloží k datu <strong>${formatDateCz(retroDateStr)}</strong>.</span>`
          : "<span>Zpětné zadání – datum se doplní podle první fotky.</span>");
    } else {
      retroBadge.classList.add("is-hidden");
      retroBadge.innerHTML = "";
    }
  }

  updatePhotoCountDisplay();
  updateDailyCountDisplay();
}

function setEntryMode(mode, { silent = false } = {}) {
  entryMode = mode === "retro" ? "retro" : "live";
  if (!isRetroMode()) retroDateStr = "";
  saveEntryModeState();
  applyEntryModeUI();
  if (!silent) {
    updateStatus(
      isRetroMode()
        ? "Zpětné zadání zapnuto – vyber datum a pak fotky z galerie."
        : "Režim focení v reálném čase."
    );
  }
}

function setRetroDate(value) {
  const today = getTodayDateString();
  // Do budoucna zpětně přidávat nejde – datum ořízneme na dnešek.
  retroDateStr = value && value > today ? today : (value || "");
  saveEntryModeState();
  applyEntryModeUI();
}

function initEntryMode() {
  // 1) odkaz s ?rezim=zpetne (např. z dashboardu) má přednost
  let mode = null;
  try {
    const param = new URLSearchParams(window.location.search).get("rezim");
    if (param === "zpetne" || param === "retro") mode = "retro";
    if (param === "live" || param === "teď" || param === "ted") mode = "live";
  } catch (e) {
    /* starší prohlížeč – ignorujeme */
  }

  // 2) jinak poslední použitá volba
  const saved = JSON.parse(localStorage.getItem("entryModeState") || "null");
  if (!mode && saved && saved.mode) mode = saved.mode;
  entryMode = mode === "retro" ? "retro" : "live";
  retroDateStr = isRetroMode() && saved && saved.date ? saved.date : "";

  applyEntryModeUI();
}

if (modeLiveRadio) {
  modeLiveRadio.addEventListener("change", () => {
    if (modeLiveRadio.checked) setEntryMode("live");
  });
}
if (modeRetroRadio) {
  modeRetroRadio.addEventListener("change", () => {
    if (modeRetroRadio.checked) setEntryMode("retro");
  });
}
if (retroDateInput) {
  retroDateInput.addEventListener("change", () => {
    setRetroDate(retroDateInput.value);
    updateStatus(
      retroDateStr
        ? `Produkty se uloží k datu ${formatDateCz(retroDateStr)}.`
        : "Datum se doplní podle první vybrané fotky."
    );
  });
}

/* ---------------------------------
   Inicializace
-----------------------------------*/
initEntryMode();
updateStatus("Začni zadáním ID produktu");
updateDailyCountDisplay();
updateStepProgressBar(0);

/* ---------------------------------
   ID produktu (výběr počátečního ID)
-----------------------------------*/
// Rozparsuje "RA01" -> { prefix:"RA", num:1, width:2 }
function parseProductId(raw) {
  const s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  const m = s.match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  return { prefix: m[1], num: parseInt(m[2], 10), width: m[2].length };
}

// Složí ID zpět z částí ("RA", 1, 2) -> "RA01"
function formatProductId(prefix, num, width) {
  return prefix + String(num).padStart(width, "0");
}

// Nastaví aktuální ID a uloží stav do localStorage
function setProductIdState(prefix, num, width) {
  productIdPrefix = prefix;
  productIdNum = num;
  productIdWidth = Math.max(width, 2);
  currentProductId = formatProductId(productIdPrefix, productIdNum, productIdWidth);
  localStorage.setItem(
    "productIdState",
    JSON.stringify({ prefix: productIdPrefix, num: productIdNum, width: productIdWidth })
  );
}

// Posun na další ID v pořadí (po přidání produktu)
function advanceProductId() {
  setProductIdState(productIdPrefix, productIdNum + 1, productIdWidth);
}

// Načte poslední použité ID z databáze (Firestore) a předvyplní další
async function loadLastProductId() {
  let lastId = null;

  // 1) primárně z databáze (Firestore) – bereme ID s NEJVYŠŠÍM číslem
  //    (ne podle času vložení, hromadný import má stejný čas u všech)
  try {
    if (window.db) {
      const snap = await window.db.collection("products").get();
      let bestNum = -1;
      snap.forEach((doc) => {
        const pid = (doc.data() || {}).product_id;
        const p = parseProductId(pid);
        if (p && p.num > bestNum) {
          bestNum = p.num;
          lastId = pid;
        }
      });
    }
  } catch (e) {
    // Databáze nedostupná – použijeme localStorage
  }

  // 2) fallback z localStorage
  if (!lastId) {
    const saved = JSON.parse(localStorage.getItem("productIdState") || "null");
    if (saved && saved.prefix) {
      lastId = formatProductId(saved.prefix, saved.num, saved.width);
    }
  }

  if (lastId && lastIdDisplay) {
    lastIdDisplay.innerHTML = `Poslední: <strong>${lastId}</strong>`;
    const parsed = parseProductId(lastId);
    if (parsed && startProductIdInput && !startProductIdInput.value) {
      // předvyplníme dalším ID v pořadí
      startProductIdInput.value = formatProductId(parsed.prefix, parsed.num + 1, parsed.width);
    }
  } else if (lastIdDisplay) {
    lastIdDisplay.innerHTML = "Zatím žádné ID v databázi. Začni např. <strong>RA01</strong>.";
  }
}

// Ověří, že počáteční ID je volné – tj. je vyšší než nejvyšší už použité
// ID se stejným prefixem. Tím zajistíme, že se ID nikdy nepoužije podruhé.
async function checkStartIdFree(parsed) {
  if (!window.db) return { ok: true };
  try {
    // Prefixový dotaz: product_id v rozsahu <prefix, prefix + >
    const snap = await window.db
      .collection("products")
      .where("product_id", ">=", parsed.prefix)
      .where("product_id", "<=", parsed.prefix + "")
      .get();

    let maxNum = 0;
    snap.forEach((doc) => {
      const m = parseProductId((doc.data() || {}).product_id);
      if (m && m.prefix === parsed.prefix && m.num > maxNum) maxNum = m.num;
    });

    if (parsed.num <= maxNum) {
      return { ok: false, suggest: formatProductId(parsed.prefix, maxNum + 1, parsed.width) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: true };
  }
}

// Spustíme až po přihlášení vlastníka (data jsou za Firebase Auth).
window.onAuthReady(loadLastProductId);

/* ---------------------------------
   Fotky (focení i výběr z galerie)
   Povinný počet je BASE_PHOTOS (ve zpětném
   režimu 1), další jdou přidat až do
   MAX_PHOTOS – i z kroku s detaily.
-----------------------------------*/
function updatePhotoCountDisplay() {
  const count = photos.length;
  const full = count >= MAX_PHOTOS;
  if (photoCountElem) photoCountElem.textContent = String(count);
  if (photoCountHint) {
    photoCountHint.textContent = `(min. ${minPhotosRequired()}, max. ${MAX_PHOTOS})`;
  }
  if (detailsPhotoCount) detailsPhotoCount.textContent = `${count} z max. ${MAX_PHOTOS}`;
  if (takePhotoBtn) takePhotoBtn.disabled = full;
  if (pickPhotoBtn) pickPhotoBtn.disabled = full;
  renderPhotoPreview();
}

function buildPhotoTile(file, index) {
  const item = document.createElement("div");
  item.className = "photo-preview-item";

  const img = document.createElement("img");
  img.alt = `Fotka ${index + 1}`;
  img.src = URL.createObjectURL(file);
  img.onload = () => URL.revokeObjectURL(img.src);

  const badge = document.createElement("span");
  badge.className = "photo-index";
  badge.textContent = String(index + 1);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "photo-remove-btn";
  removeBtn.title = "Odebrat fotku";
  removeBtn.innerHTML = window.icon("x");
  removeBtn.addEventListener("click", () => removePhoto(index));

  item.appendChild(img);
  item.appendChild(badge);
  item.appendChild(removeBtn);
  return item;
}

function buildAddPhotoTile(iconName, label, onClick) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "photo-add-tile";
  tile.innerHTML = window.icon(iconName) + `<span>${label}</span>`;
  tile.addEventListener("click", onClick);
  return tile;
}

// Náhledy se kreslí na dvou místech: v kroku fotek a v kroku s detaily.
// V detailech k nim patří i dlaždice pro přidání dalších fotek.
function renderPhotoPreview() {
  [photoPreview, photoPreviewDetails].forEach((box) => {
    if (!box) return;
    box.innerHTML = "";
    photos.forEach((file, index) => box.appendChild(buildPhotoTile(file, index)));
  });

  if (photoPreviewDetails && photos.length < MAX_PHOTOS) {
    photoPreviewDetails.appendChild(
      buildAddPhotoTile("camera", "Vyfotit", () => photoInput.click())
    );
    photoPreviewDetails.appendChild(
      buildAddPhotoTile("images", "Z galerie", () => galleryInput.click())
    );
  }
}

function removePhoto(index) {
  photos.splice(index, 1);
  updatePhotoCountDisplay();
  const missing = minPhotosRequired() - photos.length;
  if (missing > 0) {
    updateStatus(`Fotka odebrána. Do povinného počtu chybí ještě ${missing}.`, "warning");
  } else {
    updateStatus(`Fotka odebrána, zbývá ${photos.length}.`);
  }
}

// Zpracuje vybrané soubory – z fotoaparátu i z galerie.
async function handleSelectedPhotos(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  // Zpětné zadání: když datum ještě není vybrané, vezmeme ho z první fotky.
  if (isRetroMode() && !retroDateStr) {
    const fromFile = fileDateString(files[0]);
    if (fromFile) {
      setRetroDate(fromFile);
      updateStatus(`Datum doplněno podle fotky: ${formatDateCz(retroDateStr)}`);
    }
  }

  const before = photos.length;
  let skipped = false;
  for (let i = 0; i < files.length; i++) {
    if (photos.length >= MAX_PHOTOS) {
      skipped = true;
      break;
    }
    updateStatus(`Uprav ořez fotky č. ${photos.length + 1}…`);
    const processedFile = await cropImageInteractive(files[i], `Fotka ${photos.length + 1}`);
    if (processedFile) photos.push(processedFile);
    updatePhotoCountDisplay();
  }

  updatePhotoCountDisplay();
  const added = photos.length - before;

  // Z kroku fotek jdeme rovnou na detaily, jakmile jsou povinné fotky hotové
  // (další jdou přidat tam). Přidávání přímo z detailů krok nemění.
  const addedInDetails = currentStep === 2;
  const advance = currentStep === 1 && added > 0 && photos.length >= BASE_PHOTOS;
  if (advance) showStep(2);

  if (skipped) {
    updateStatus(`Na produkt jde nejvýš ${MAX_PHOTOS} fotek – zbytek přeskočen.`, "warning");
  } else if (!added) {
    updateStatus("Fotka byla zrušena. Zkus to znovu.");
  } else if (addedInDetails) {
    updateStatus(`Přidáno. Produkt má teď ${photos.length} fotek.`, "success");
  } else if (advance) {
    updateStatus("Fotky jsou připravené. Vyplň detaily – další fotky můžeš přidat i tady.", "success");
  } else if (photos.length >= minPhotosRequired()) {
    updateStatus(`Máš ${photos.length} fotek. Přidej další, nebo pokračuj tlačítkem „Dál“.`);
  } else {
    const missing = minPhotosRequired() - photos.length;
    updateStatus(`Načtena fotka č. ${photos.length}. Ještě ${missing}.`);
  }
}

function photoLimitReached() {
  if (photos.length < MAX_PHOTOS) return false;
  updateStatus(`Máš už maximum ${MAX_PHOTOS} fotek.`, "warning");
  return true;
}

takePhotoBtn.addEventListener("click", () => {
  if (!photoLimitReached()) photoInput.click();
});
pickPhotoBtn.addEventListener("click", () => {
  if (!photoLimitReached()) galleryInput.click();
});

// Jakmile uživatel vybere soubory. Input hned nulujeme, aby šlo vybrat
// stejnou fotku znovu.
photoInput.addEventListener("change", async () => {
  const picked = Array.from(photoInput.files || []);
  photoInput.value = "";
  await handleSelectedPhotos(picked);
});
galleryInput.addEventListener("change", async () => {
  const picked = Array.from(galleryInput.files || []);
  galleryInput.value = "";
  await handleSelectedPhotos(picked);
});

/* ---------------------------------
   Výběr kategorie
-----------------------------------*/
categoryBtn.addEventListener("click", () => {
  openModal(categoryModal);
  categorySearch.value = "";
  updateCategoryList("");
  categorySearch.focus();
});
// Kategorie se zavře i klepnutím vedle nebo klávesou Escape.
categoryModal.querySelector(".modal-background").addEventListener("click", () => {
  closeModal(categoryModal);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && categoryModal.classList.contains("is-active")) {
    closeModal(categoryModal);
  }
});

categorySearch.addEventListener("input", () => {
  const query = categorySearch.value.toLowerCase().trim();
  updateCategoryList(query);
});

function updateCategoryList(query) {
  categoryList.innerHTML = '';
  let found = false;
  categories.forEach(group => {
    // Filtrování podle dotazu
    const filtered = group.cats.filter(cat => cat.name.toLowerCase().includes(query.toLowerCase()));
    if (filtered.length > 0) {
      const groupEl = document.createElement('div');
      groupEl.className = 'category-group';
      groupEl.innerHTML = window.icon('folder');
      groupEl.appendChild(document.createTextNode(group.name));
      categoryList.appendChild(groupEl);
      filtered.forEach(cat => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = cat.name;
        btn.onclick = () => {
          categoryIdInput.value = cat.id;
          clearFieldError('category-id');
          // Na tlačítku necháme název vybrané kategorie, ať je vidět, co platí.
          categoryBtnText.innerHTML = '<span class="category-selected">' + window.icon('check') + '<span></span></span>';
          categoryBtnText.querySelector('span span').textContent = cat.name;
          updateStatus('Kategorie vybrána.', "success");
          closeModal(categoryModal);
        };
        categoryList.appendChild(btn);
      });
      found = true;
    }
  });
  if (!found) {
    const noResult = document.createElement('p');
    noResult.className = 'empty';
    noResult.textContent = 'Žádné kategorie nenalezeny.';
    categoryList.appendChild(noResult);
  }
}

categoryCloseBtn.addEventListener("click", () => {
  closeModal(categoryModal);
});

/* ---------------------------------
   Přidání produktu
-----------------------------------*/
async function addProduct() {
  let valid = true;
  const name = document.getElementById('product-name').value.trim();
  const price = document.getElementById('product-price').value.trim();
  const categoryId = categoryIdInput.value.trim();
  const location = document.getElementById('product-location').value.trim();
  const note = productNoteInput.value.trim();
  const shippingId = shippingMethodSelect.value;

  clearFieldError('product-name');
  clearFieldError('product-price');
  clearFieldError('category-id');
  clearFieldError('shippingMethod');

  if (!name) {
    showFieldError('product-name', 'Zadej název produktu!');
    valid = false;
  }
  if (!price) {
    showFieldError('product-price', 'Zadej cenu!');
    valid = false;
  }
  if (!categoryId) {
    showFieldError('category-id', 'Vyber kategorii!');
    valid = false;
  }
  if (!shippingId) {
    showFieldError('shippingMethod', 'Vyber dopravu!');
    valid = false;
  }
  if (!valid) {
    updateStatus('Vyplň všechna povinná pole!', "warning");
    // Tlačítko je na konci dlouhého formuláře – skočíme na první chybu.
    const firstError = productDetailsSection.querySelector('.input-error, .error-message:not(:empty)');
    const target = firstError && firstError.closest('.field');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (photos.length < minPhotosRequired()) {
    updateStatus(
      isRetroMode()
        ? 'Vyber aspoň jednu fotku produktu!'
        : `Nafoť aspoň ${BASE_PHOTOS} fotky, než produkt přidáš!`, "warning"
    );
    return;
  }

  // Během nahrávání tlačítko zamkneme, ať se produkt nepřidá dvakrát.
  const addBtn = document.getElementById("add-product-btn");
  addBtn.classList.add("is-loading");
  updateStatus("Zpracovávám a nahrávám fotky…", "progress");
  progressBar.classList.remove("is-hidden");
  progressBar.value = 0;

  try {
    const photoUrls = [];
    for (let i = 0; i < photos.length; i++) {
      updateStatus(`Nahrávám obrázek ${i + 1}/${photos.length}...`, "progress");
      const url = await window.uploadImageToCloudinary(photos[i], i + 1);
      photoUrls.push(url);
      const percent = Math.round(((i + 1) / photos.length) * 100);
      progressBar.value = percent;
      updateStatus(`Nahrán obrázek ${i + 1}/${photos.length}...`, "progress");
    }

    // Uložení umístění do localStorage (kvůli historii)
    if (location) {
      let locationHistory = JSON.parse(localStorage.getItem("locationHistory")) || [];
      if (!locationHistory.includes(location)) {
        locationHistory.push(location);
        localStorage.setItem("locationHistory", JSON.stringify(locationHistory));
      }
    }

    // entityId se nedává tady: export ho čísluje v každém souboru 1…N (export.js).

    function getRoundedISODate() {
      let d = new Date();
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(d.getUTCHours() + 1);
      return d.toISOString().replace(".000Z", "Z");
    }

    // Šablona popisu je v description.js; poznámka se do ní vloží jako první sekce.
    const productDescription = window.buildProductDescription(note);

    const productId = currentProductId;
    const formattedName = `${name.toUpperCase()} | ${productId}`;
    // U zpětného zadání se uloží vybrané datum, jinak dnešek.
    const addedDateStr = getEffectiveDateString();
    const createdAtIso = getEffectiveCreatedAtISO();

    const product = {
      name: formattedName,
      language: "cs-CZ",
      extId: `${location} | ${productId}`,
      categoryId: parseInt(categoryId),
      description: productDescription,
      auctionPriceAmount: parseInt(price),
      auctionPriceCurrency: "CZK",
      buyNowPriceAmount: 0,
      buyNowPriceCurrency: "CZK",
      quantity: 1,
      quantityUnit: "pieces",
      startingAt: getRoundedISODate(),
      duration: 7,
      reexposeType: 0,
      location: JSON.stringify({
        countryCode: "CZ",
        postCode: "789 01",
        city: "Zvole"
      }),
      shippingTemplateId: parseInt(shippingId),
      shippingPayer: "buyer",
      images: photoUrls.join(" "),
      bestOffer: 1,
      onlyVerifiedBuyersEnabledOverride: 0,
      attributes: JSON.stringify(),
      priorityListing: document.getElementById("promo-priority").checked,
      boldTitle: document.getElementById("promo-bold").checked,
      highlight: document.getElementById("promo-highlight").checked,
      dateAdded: addedDateStr,
      createdAt: createdAtIso,
      entryMode: entryMode,
      productId: productId,
      locationName: location,
      note: note
    };

    let products = JSON.parse(localStorage.getItem("products")) || [];
    products.push(product);
    localStorage.setItem("products", JSON.stringify(products));

    // Posuneme ID produktu na další v pořadí
    advanceProductId();

    resetProductForm();
    showStep(3);

    updateStatus(
      isRetroMode() && retroDateStr
        ? `Produkt přidán k datu ${formatDateCz(addedDateStr)}! Můžeš uložit do DB nebo přidat další.`
        : "Produkt přidán! Můžeš dokončit nebo přidat další.", "success"
    );
  } catch (error) {
    updateStatus(`Chyba při nahrávání fotek: ${error.message}`, "error");
  } finally {
    addBtn.classList.remove("is-loading");
  }
}

/* ---------------------------------
   Vyprázdnění formuláře produktu
   – jedno místo pro všechny resety, aby se
     výchozí hodnoty (hlavně doprava) nerozešly.
-----------------------------------*/
function resetProductForm() {
  photos = [];
  updatePhotoCountDisplay();
  document.getElementById("product-name").value = "";
  document.getElementById("product-price").value = "";
  document.getElementById("product-location").value = "";
  productNoteInput.value = "";
  categoryIdInput.value = "";
  categoryBtnText.textContent = "Vybrat kategorii";
  shippingMethodSelect.value = DEFAULT_SHIPPING_ID;
  document.getElementById("promo-priority").checked = false;
  document.getElementById("promo-bold").checked = false;
  document.getElementById("promo-highlight").checked = false;
  progressBar.value = 0;
  progressBar.classList.add("is-hidden");
  ["product-name", "product-price", "category-id", "shippingMethod"].forEach(clearFieldError);
}

/* ---------------------------------
   Přidat další produkt
-----------------------------------*/
function addAnotherProduct() {
  resetProductForm();

  // Reset historie pro nový produkt
  ['product-name', 'product-price', 'product-location'].forEach(id => {
    renderInputHistory(id);
  });

  showStep(1);
  updateStatus(
    isRetroMode()
      ? "Vyber fotky dalšího produktu z galerie."
      : "Nafoť fotky pro další produkt."
  );
}

/* ---------------------------------
   Dokončení – export do CSV, WhatsApp
-----------------------------------*/
async function finish() {
  const products = JSON.parse(localStorage.getItem("products")) || [];
  const savedProductsDiv = document.getElementById("saved-products");
  savedProductsDiv.innerHTML = "";

  // Bez produktů není co potvrzovat.
  if (products.length === 0) {
    savedProductsDiv.innerHTML = "<p>Zatím nebyl přidán žádný produkt.</p>";
    updateStatus("Přidej aspoň jeden produkt před dokončením.", "warning");
    return;
  }

  // Začátek aukcí: nejbližší celá hodina; stejný čas jde do dialogu i do souboru.
  const startAt = window.defaultExportStart();
  const confirmed = await showConfirmModal({
    title: "Odeslat přes WhatsApp?",
    text:
      `Z ${window.pluralCz(products.length, "přidaného produktu", "přidaných produktů", "přidaných produktů")} ` +
      "se vytvoří CSV, nahraje se a produkty se uloží do databáze. " +
      `Aukce začnou v ${startAt.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}, ` +
      `každá další o ${window.EXPORT_STAGGER_MINUTES} min později.`,
    confirmLabel: "Odeslat"
  });
  if (!confirmed) return;

  // Řádky v pořadí přidání → entityId 1 je první přidaný produkt (export.js).
  // startingAt doplní export: nejbližší celá hodina, každý další +2 min.
  const rows = products.map((p) => ({
    name: p.name,
    language: p.language,
    extId: p.extId,
    categoryId: p.categoryId,
    description: p.description,
    auctionPriceAmount: p.auctionPriceAmount,
    auctionPriceCurrency: p.auctionPriceCurrency,
    buyNowPriceAmount: p.buyNowPriceAmount,
    buyNowPriceCurrency: p.buyNowPriceCurrency,
    quantity: p.quantity,
    quantityUnit: p.quantityUnit,
    duration: p.duration,
    reexposeType: p.reexposeType,
    location: p.location,
    shippingTemplateId: p.shippingTemplateId,
    shippingPayer: p.shippingPayer,
    images: p.images,
    bestOffer: p.bestOffer,
    onlyVerifiedBuyersEnabledOverride: p.onlyVerifiedBuyersEnabledOverride,
    attributes: p.attributes,
    priorityListing: p.priorityListing ?? false,
    boldTitle: p.boldTitle ?? false,
    highlight: p.highlight ?? false
  }));

  try {
    updateStatus("Nahrávám CSV na server…", "progress");
    const file = window.exportCsvFile(window.buildExportCsv(rows, startAt), window.exportFileName(productIdPrefix || "export"));
    const exportUrl = await uploadExportFile(file);

    // Po vygenerování exportu naimportujeme produkty i do dashboardu (Firestore)
    await syncProductsToFirestore(products, exportUrl);

    // Zkopírování odkazu do schránky
    navigator.clipboard.writeText(exportUrl).then(
      () => {
        updateStatus("Odkaz zkopírován do schránky!", "success");
      },
      (err) => {
        updateStatus("Chyba při kopírování odkazu: " + err, "error");
      }
    );

    // Otevření WhatsApp
    const whatsappUrl = `whatsapp://send?text=Zde je vygenerovaný CSV soubor: ${encodeURIComponent(exportUrl)}`;
    window.location.href = whatsappUrl;

    savedProductsDiv.innerHTML =
      "<p>Soubor byl nahrán a odkaz zkopírován. Otevři WhatsApp a odešli zprávu.</p>";
  } catch (error) {
    updateStatus(`Chyba při nahrávání CSV: ${error.message}`, "error");
  }
}

/* ---------------------------------
   Nahrání exportu (CSV) na Cloudinary
   CSV je pro Cloudinary „raw“ soubor – ten si
   příponu nedoplní sám, proto je .csv přímo
   v public_id (jinak by odkaz neměl příponu).
-----------------------------------*/
async function uploadExportFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  // Např. products_26032025_RA_ABCD.csv
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const publicId = file.name.replace(/\.csv$/, "") + "_" + randomSuffix + ".csv";

  // Složka zůstává stejná jako u dřívějších Excelů, ať je vše na jednom místě.
  formData.append("folder", "excel_files");
  formData.append("public_id", publicId);

  const resp = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: formData
  });
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Chyba při nahrávání CSV: ${resp.status} - ${errorText}`);
  }
  const data = await resp.json();
  return data.secure_url;
}

/* ---------------------------------
   Import produktů do dashboardu (Firestore)
   – zavolá se v finish() po vytvoření exportu (CSV).
   Když Firebase není nastaven, tiše se přeskočí
   a appka dál funguje jen s exportem.
-----------------------------------*/
async function syncProductsToFirestore(products, excelUrl) {
  if (!window.db) {
    updateStatus("Firebase není nastaven – import do dashboardu přeskočen.");
    return;
  }

  // Importujeme jen produkty, které ještě v databázi nejsou (kvůli
  // opakovanému "Odeslat" nechceme duplicity). product_id používáme jako
  // ID dokumentu, takže se nedá použít podruhé.
  const pending = products.filter((p) => !p.syncedToDb);
  if (!pending.length) return;

  try {
    updateStatus("Importuji produkty do dashboardu...", "progress");
    const col = window.db.collection("products");

    // Zjistíme, která product_id už v databázi jsou – ta nikdy nepřepíšeme.
    const withId = pending.filter((p) => p.productId);
    const existing = new Set();
    const checks = await Promise.all(
      withId.map((p) => col.doc(p.productId).get().then((s) => (s.exists ? p.productId : null)))
    );
    checks.forEach((id) => { if (id) existing.add(id); });

    // Zapíšeme jen produkty, jejichž ID ještě neexistuje.
    const toWrite = pending.filter((p) => !(p.productId && existing.has(p.productId)));
    if (toWrite.length) {
      const batch = window.db.batch();
      toWrite.forEach((p) => {
        const ref = p.productId ? col.doc(p.productId) : col.doc();
        batch.set(ref, {
          product_id: p.productId || null,
          name: p.name,
          price: p.auctionPriceAmount,
          location: p.locationName || null,
          ext_id: p.extId,
          category_id: p.categoryId,
          shipping_template_id: p.shippingTemplateId,
          images: p.images,
          image_list: p.images ? p.images.split(" ").filter(Boolean) : [],
          priority_listing: !!p.priorityListing,
          bold_title: !!p.boldTitle,
          highlight: !!p.highlight,
          description: p.description,
          excel_url: excelUrl || null,
          note: p.note || null,
          sold: false,
          sold_at: null,
          raw: p, // celý produkt pro pozdější re-export ve formátu pro Aukro
          date_added: p.dateAdded,
          // U zpětně zadaných produktů je to datum, které si uživatel vybral,
          // ať je v dashboardu produkt vidět u správného dne.
          created_at: p.createdAt || new Date().toISOString(),
          entry_mode: p.entryMode || "live"
        });
      });
      await batch.commit();
    }

    // Označíme produkty jako zapsané, ať je při dalším "Odeslat" neduplikujeme
    // (i ty, co už v DB existovaly – ať se nezkoušejí donekonečna).
    const all = JSON.parse(localStorage.getItem("products")) || [];
    const doneIds = new Set(pending.map((p) => p.productId));
    all.forEach((p) => {
      if (doneIds.has(p.productId)) p.syncedToDb = true;
    });
    localStorage.setItem("products", JSON.stringify(all));

    if (existing.size) {
      updateStatus(`Naimportováno ${toWrite.length}. ${existing.size} ID už existovalo – přeskočeno.`, "success");
    } else {
      updateStatus("Produkty naimportovány do dashboardu.", "success");
    }
  } catch (e) {
    const msg = (e && e.message) || e;
    updateStatus("Import do dashboardu selhal: " + msg, "warning");
  }
}

/* ---------------------------------
   Uložení do databáze bez exportu
   – pro ruční / zpětné zadávání, kdy
     nechceš generovat CSV ani posílat
     nic přes WhatsApp. CSV jde kdykoli
     později vyexportovat z dashboardu.
-----------------------------------*/
async function saveToDatabase() {
  const products = JSON.parse(localStorage.getItem("products")) || [];
  const savedProductsDiv = document.getElementById("saved-products");

  if (!products.length) {
    updateStatus("Nejdřív přidej aspoň jeden produkt.", "warning");
    return;
  }

  const pending = products.filter((p) => !p.syncedToDb);
  if (!pending.length) {
    updateStatus("Všechny přidané produkty už v databázi jsou.");
    return;
  }

  const saveBtn = document.getElementById("save-db-btn");
  if (saveBtn) saveBtn.classList.add("is-loading");
  await syncProductsToFirestore(pending, null);
  if (saveBtn) saveBtn.classList.remove("is-loading");

  // Po zápisu se změnilo poslední použité ID – načteme znovu.
  loadLastProductId();

  if (savedProductsDiv) {
    savedProductsDiv.innerHTML =
      `<p>Produkty jsou v databázi – najdeš je v <a href="dashboard.html">dashboardu</a>. CSV si odtamtud můžeš vyexportovat kdykoli později.</p>`;
  }
}

/* ---------------------------------
   Reset úložiště
-----------------------------------*/
async function resetStorage() {
  const products = JSON.parse(localStorage.getItem("products")) || [];
  const unsynced = products.filter((p) => !p.syncedToDb).length;
  const confirmed = await showConfirmModal({
    title: "Smazat rozpracovaná data?",
    text:
      "Vymaže se seznam přidaných produktů v tomhle zařízení. Co už je v databázi, zůstane." +
      (unsynced
        ? ` Pozor: ${window.pluralCz(unsynced, "produkt ještě není", "produkty ještě nejsou", "produktů ještě není")} v databázi a ztratí se.`
        : ""),
    confirmLabel: "Smazat"
  });
  if (!confirmed) return;

  // Volbu světlého/tmavého režimu mazání dat nemá rušit.
  const theme = localStorage.getItem("theme");
  localStorage.clear();
  if (theme) localStorage.setItem("theme", theme);
  // Zvolený režim (vč. zpětného data) si necháme – mazání dat neznamená,
  // že uživatel přestal zadávat zpětně.
  saveEntryModeState();
  photos = [];
  currentProductId = null;
  productIdPrefix = "";
  productIdNum = 0;
  productIdWidth = 2;
  if (startProductIdInput) startProductIdInput.value = "";
  resetProductForm();

  document.getElementById("saved-products").innerHTML = "";
  showStep(0);
  applyEntryModeUI();

  updateStatus("Data byla vymazána! Začni znovu.");
  loadLastProductId();
}

/* ---------------------------------
   Navigace mezi kroky (Zpět / Dál)
-----------------------------------*/
const steps = [
  shopSelectionSection,
  photoSectionSection,
  productDetailsSection,
  finishSection
];

// Nápověda ve stavovém řádku po přechodu na krok.
const STEP_HINTS = [
  "Začni zadáním ID produktu",
  "Přidej fotky produktu",
  "Vyplň detaily produktu",
  "Produkty můžeš uložit, odeslat, nebo přidat další"
];

// Přepne na daný krok (0–3). Panel se při zobrazení animuje sám přes CSS.
function showStep(step) {
  steps.forEach((el, idx) => el.classList.toggle("is-hidden", idx !== step));
  currentStep = step;
  updateStepProgressBar(step);
  if (step === 2) updateLocationHistory();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const fromStep = parseInt(btn.dataset.step, 10);
    const isNext = btn.classList.contains("next-btn");
    const newStep = isNext ? fromStep + 1 : fromStep - 1;

    if (newStep >= 0 && newStep < steps.length) {
      // Krok 0 -> nastavení ID produktu (+ kontrola unikátnosti)
      if (fromStep === 0 && isNext) {
        const parsed = parseProductId(startProductIdInput.value);
        if (!parsed) {
          updateStatus("Zadej platné ID produktu, např. RA01", "warning");
          return;
        }
        const check = await checkStartIdFree(parsed);
        if (!check.ok) {
          startProductIdInput.value = check.suggest;
          updateStatus(
            `ID ${formatProductId(parsed.prefix, parsed.num, parsed.width)} už bylo použité. Zkus ${check.suggest}.`, "warning"
          );
          return;
        }
        setProductIdState(parsed.prefix, parsed.num, parsed.width);
      }
      // Kontrola fotek při přechodu z kroku 1
      // (zpětné zadání: stačí aspoň jedna, jinak chceme všechny 3)
      if (fromStep === 1 && isNext && photos.length < minPhotosRequired()) {
        updateStatus(
          isRetroMode()
            ? "Vyber aspoň jednu fotku, než přejdeš dál!"
            : `Musíš nafotit aspoň ${BASE_PHOTOS} fotky, než přejdeš dál!`, "warning"
        );
        return;
      }
      // Při přechodu na fotky ještě zaktualizujeme popisky podle režimu
      if (fromStep === 0 && isNext) {
        applyEntryModeUI();
      }

      showStep(newStep);
      updateStatus(STEP_HINTS[newStep]);
    }
  });
});

/* ---------------------------------
   Potvrzovací modál
   Vždy říká, co se přesně stane, a tlačítko
   nese název akce (ne jen „Ano“).
-----------------------------------*/
const confirmTitleElem = document.getElementById("confirm-title");
const confirmTextElem = document.getElementById("confirm-text");

function showConfirmModal({ title = "Opravdu?", text = "", confirmLabel = "Ano" } = {}) {
  confirmTitleElem.textContent = title;
  confirmTextElem.textContent = text;
  confirmTextElem.classList.toggle("is-hidden", !text);
  confirmYesBtn.textContent = confirmLabel;
  openModal(confirmModal);
  return new Promise((resolve) => {
    const done = (result) => {
      closeModal(confirmModal);
      confirmYesBtn.onclick = confirmNoBtn.onclick = confirmBackdrop.onclick = null;
      resolve(result);
    };
    confirmYesBtn.onclick = () => done(true);
    confirmNoBtn.onclick = () => done(false);
    confirmBackdrop.onclick = () => done(false);
  });
}
const confirmBackdrop = confirmModal.querySelector(".modal-background");

/* ---------------------------------
   Odchod ze stránky
   Prohlížeč se zeptá jen tehdy, když by se
   něco ztratilo: rozdělané fotky, nebo produkty,
   které ještě nejsou v databázi. Odkaz na
   dashboard jinak funguje bez otázek.
-----------------------------------*/
function hasUnsavedWork() {
  if (photos.length > 0) return true;
  const products = JSON.parse(localStorage.getItem("products")) || [];
  return products.some((p) => !p.syncedToDb);
}
window.addEventListener("beforeunload", (e) => {
  if (!hasUnsavedWork()) return;
  e.preventDefault();
  e.returnValue = "";
});

/* ---------------------------------
   Propojení tlačítek
-----------------------------------*/
// addProduct se níže obaluje (ukládání historie), proto ho voláme až při kliku.
document.getElementById("add-product-btn").addEventListener("click", () => addProduct());
document.getElementById("add-another-btn").addEventListener("click", addAnotherProduct);
document.getElementById("save-db-btn").addEventListener("click", saveToDatabase);
finishBtn.addEventListener("click", finish);
resetBtn.addEventListener("click", resetStorage);

// --- Progress bar kroků ---
function updateStepProgressBar(step) {
  const bar = document.getElementById('step-progress-bar');
  const labels = document.querySelectorAll('.step-label');
  // Čára končí pod popiskem aktuálního kroku (4 sloupce po 25 %).
  bar.style.width = ((step + 1) * 25) + '%';
  labels.forEach((el, idx) => {
    el.classList.toggle('active', idx === step);
    el.classList.toggle('done', idx < step);
  });
}

// --- Validace a chybové hlášky pod pole ---
function showFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  input.classList.add('input-error');
  let err = input.parentNode.querySelector('.error-message');
  if (!err) {
    err = document.createElement('div');
    err.className = 'error-message';
    input.parentNode.appendChild(err);
  }
  err.textContent = message;
}
function clearFieldError(inputId) {
  const input = document.getElementById(inputId);
  input.classList.remove('input-error');
  let err = input.parentNode.querySelector('.error-message');
  if (err) err.textContent = '';
}

// --- Historie a autocomplete pro inputy ---
const inputHistoryKeys = {
  'product-name': 'history_product_name',
  'product-price': 'history_product_price',
  'product-location': 'history_product_location'
};

function getInputHistory(inputId) {
  const key = inputHistoryKeys[inputId];
  if (!key) return [];
  const recent = JSON.parse(localStorage.getItem(key) || '[]');
  if (inputId !== 'product-location') return recent;
  // U umístění nabízíme i všechna dříve použitá, nejen poslední dvě.
  const all = JSON.parse(localStorage.getItem('locationHistory') || '[]');
  return recent.concat(all.filter(v => !recent.includes(v)));
}
function setInputHistory(inputId, value) {
  const key = inputHistoryKeys[inputId];
  if (!key) return;
  let arr = JSON.parse(localStorage.getItem(key) || '[]');
  arr = arr.filter(v => v !== value && v !== '');
  arr.unshift(value);
  if (arr.length > 2) arr = arr.slice(0, 2);
  localStorage.setItem(key, JSON.stringify(arr));
}
function renderInputHistory(inputId) {
  const input = document.getElementById(inputId);
  const historyDiv = document.getElementById(inputId.replace('product-', '') + '-history');
  if (!historyDiv) return;
  const val = input.value.trim();
  const history = getInputHistory(inputId).filter(v => v && (!val || v.toLowerCase().includes(val.toLowerCase())));
  historyDiv.innerHTML = '';
  history.forEach(item => {
    const el = document.createElement('span');
    el.className = 'history-item';
    el.textContent = item;
    el.onclick = () => {
      input.value = item;
      renderInputHistory(inputId);
    };
    historyDiv.appendChild(el);
  });
}
function clearInputValue(inputId) {
  const input = document.getElementById(inputId);
  input.value = '';
  renderInputHistory(inputId);
}
['product-name', 'product-price', 'product-location'].forEach(id => {
  const input = document.getElementById(id);
  if (input) {
    input.addEventListener('input', () => renderInputHistory(id));
    input.addEventListener('focus', () => renderInputHistory(id));
    input.addEventListener('blur', () => setTimeout(() => renderInputHistory(id), 200));
  }
});
document.querySelectorAll('.clear-input-btn').forEach(btn => {
  btn.onclick = (e) => {
    const inputId = btn.getAttribute('data-input');
    clearInputValue(inputId);
  };
});
// --- Při přidání produktu aktualizuj historii ---
const origAddProduct = addProduct;
addProduct = async function() {
  const name = document.getElementById('product-name').value.trim();
  const price = document.getElementById('product-price').value.trim();
  const location = document.getElementById('product-location').value.trim();
  if (name) setInputHistory('product-name', name);
  if (price) setInputHistory('product-price', price);
  if (location) setInputHistory('product-location', location);
  await origAddProduct.apply(this, arguments);
};
