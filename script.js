/* ---------------------------------
   Základní konfigurace
-----------------------------------*/
const CLOUDINARY_UPLOAD_URL = "https://api.cloudinary.com/v1_1/drrzl7evt/auto/upload";
const CLOUDINARY_UPLOAD_PRESET = "Retroaukce";

/* ---------------------------------
   Proměnné
-----------------------------------*/
let photos = [];
let categories = [];

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

// V zpětném režimu stačí aspoň 1 fotka, v reálném čase chceme všechny 3.
const MAX_PHOTOS = 3;
function minPhotosRequired() {
  return isRetroMode() ? 1 : MAX_PHOTOS;
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
const photoStepTitle = document.getElementById("photo-step-title");
const photoPreview = document.getElementById("photo-preview");

const modeLiveRadio = document.getElementById("mode-live");
const modeRetroRadio = document.getElementById("mode-retro");
const retroDateField = document.getElementById("retro-date-field");
const retroDateInput = document.getElementById("retro-date");
const retroBadge = document.getElementById("retro-badge");
const statusElem = document.getElementById("status");
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

const exitModal = document.getElementById("exit-modal");
const deleteDataBtn = document.getElementById("delete-data-btn");
const closeModalBtn = document.getElementById("close-modal-btn");

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
    updateStatus('❌ Chyba při načítání kategorií! Zkontroluj soubor.');
  });

/* ---------------------------------
   Pomocné funkce
-----------------------------------*/
function updateStatus(message) {
  statusElem.textContent = message;
  updateDailyCountDisplay();
}

function ensurePortrait(file) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        canvas.width = 1600;
        canvas.height = 1600;
        
        // Zjistíme menší z rozměrů pro čtvercový ořez
        const size = Math.min(img.width, img.height);
        
        // Vypočteme souřadnice pro středový ořez
        const sourceX = (img.width - size) / 2;
        const sourceY = (img.height - size) / 2;
        
        // Vykreslíme výřez na cílovou velikost 1600x1600 px
        ctx.drawImage(img, sourceX, sourceY, size, size, 0, 0, 1600, 1600);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const croppedFile = new File([blob], file.name, {
                type: "image/jpeg",
                lastModified: Date.now()
              });
              resolve(croppedFile);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          0.98
        );
      };
      img.onerror = () => resolve(file);
    };
    reader.onerror = () => resolve(file);
  });
}

/* ---------------------------------
   Interaktivní náhled a úprava ořezu
   (čtverec 1:1, přesně jak to uloží
   Cloudinary po nahrání)
-----------------------------------*/
function injectCropModalStyles() {
  if (document.getElementById("crop-modal-styles")) return;
  const style = document.createElement("style");
  style.id = "crop-modal-styles";
  style.textContent = `
    #crop-modal .crop-modal-box { max-width: 380px; margin: 0 auto; }
    #crop-modal .crop-modal-title { font-weight: 600; margin-bottom: 2px; }
    #crop-modal .crop-modal-subtitle { color: #888; margin-bottom: 10px; font-size: 0.9rem; }
    #crop-viewport {
      position: relative;
      width: min(78vw, 320px);
      aspect-ratio: 1 / 1;
      margin: 0 auto 12px;
      overflow: hidden;
      border-radius: 8px;
      background: #111;
      touch-action: none;
      cursor: grab;
    }
    #crop-viewport:active { cursor: grabbing; }
    #crop-viewport img {
      position: absolute;
      top: 0;
      left: 0;
      max-width: none;
      max-height: none;
      user-select: none;
      -webkit-user-drag: none;
      pointer-events: none;
    }
    #crop-modal .crop-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    #crop-modal .crop-controls input[type="range"] { flex: 1; }
    #crop-modal .crop-hint {
      font-size: 0.78rem;
      color: #999;
      text-align: center;
      margin-bottom: 12px;
    }
    #crop-modal .crop-buttons {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }
  `;
  document.head.appendChild(style);
}

function buildCropModal() {
  const existing = document.getElementById("crop-modal");
  if (existing) return existing;

  injectCropModalStyles();

  const container = document.createElement("div");
  container.innerHTML = `
    <div class="modal" id="crop-modal">
      <div class="modal-background"></div>
      <div class="modal-content crop-modal-box">
        <div class="box">
          <p class="crop-modal-title">📸 Náhled ořezu (jak bude na Cloudinary)</p>
          <p class="crop-modal-subtitle" id="crop-modal-subtitle"></p>
          <div id="crop-viewport">
            <img id="crop-image" draggable="false" alt="Náhled ořezu fotky" />
          </div>
          <div class="crop-controls">
            <span>🔍</span>
            <input type="range" id="crop-zoom-slider" min="1" max="4" step="0.01" value="1">
          </div>
          <p class="crop-hint">👉 Táhni prstem pro posun, sliderem nebo gestem pro zoom.</p>
          <div class="crop-buttons">
            <button type="button" class="button is-light" id="crop-reset-btn">↺ Reset</button>
            <button type="button" class="button is-danger is-light" id="crop-cancel-btn">✖ Zrušit fotku</button>
            <button type="button" class="button is-success" id="crop-confirm-btn">✔ Použít ořez</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(container.firstElementChild);
  return document.getElementById("crop-modal");
}

// Zobrazí interaktivní ořez pro jeden soubor.
// Vrací Promise<File|null> - null pokud uživatel fotku zruší.
function cropImageInteractive(file, label) {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    const modal = buildCropModal();
    const viewport = document.getElementById("crop-viewport");
    const imgEl = document.getElementById("crop-image");
    const zoomSlider = document.getElementById("crop-zoom-slider");
    const subtitleElem = document.getElementById("crop-modal-subtitle");
    const confirmBtn = document.getElementById("crop-confirm-btn");
    const cancelBtn = document.getElementById("crop-cancel-btn");
    const resetBtn = document.getElementById("crop-reset-btn");

    subtitleElem.textContent = label || "";
    zoomSlider.value = 1;
    openModal(modal);

    let state = null;
    let mode = null; // "pan" | "pinch"
    const pointers = new Map();
    let lastX = 0, lastY = 0;
    let pinchStartDist = 1, pinchStartZoom = 1;

    function displayedSize() {
      return {
        w: state.natW * state.baseScale * state.zoom,
        h: state.natH * state.baseScale * state.zoom
      };
    }
    function clampOffsets() {
      const { w, h } = displayedSize();
      state.offX = Math.min(0, Math.max(state.vpSize - w, state.offX));
      state.offY = Math.min(0, Math.max(state.vpSize - h, state.offY));
    }
    function render() {
      const { w, h } = displayedSize();
      imgEl.style.width = w + "px";
      imgEl.style.height = h + "px";
      imgEl.style.transform = `translate(${state.offX}px, ${state.offY}px)`;
    }
    function resetCrop() {
      state.zoom = 1;
      const { w, h } = displayedSize();
      state.offX = (state.vpSize - w) / 2;
      state.offY = (state.vpSize - h) / 2;
      zoomSlider.value = 1;
      render();
    }

    function handlePointerDown(ev) {
      viewport.setPointerCapture?.(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 1) {
        mode = "pan";
        lastX = ev.clientX;
        lastY = ev.clientY;
      } else if (pointers.size === 2) {
        mode = "pinch";
        const [a, b] = Array.from(pointers.values());
        pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        pinchStartZoom = state.zoom;
      }
    }
    function handlePointerMove(ev) {
      if (!pointers.has(ev.pointerId)) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (mode === "pan" && pointers.size === 1) {
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        state.offX += dx;
        state.offY += dy;
        clampOffsets();
        render();
      } else if (mode === "pinch" && pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        let newZoom = pinchStartZoom * (dist / pinchStartDist);
        newZoom = Math.min(4, Math.max(1, newZoom));
        state.zoom = newZoom;
        zoomSlider.value = newZoom.toFixed(2);
        clampOffsets();
        render();
      }
    }
    function handlePointerUp(ev) {
      pointers.delete(ev.pointerId);
      if (pointers.size === 1) {
        mode = "pan";
        const [p] = Array.from(pointers.values());
        lastX = p.x;
        lastY = p.y;
      } else if (pointers.size === 0) {
        mode = null;
      }
    }
    function handleWheel(ev) {
      ev.preventDefault();
      let newZoom = state.zoom - ev.deltaY * 0.0015;
      newZoom = Math.min(4, Math.max(1, newZoom));
      state.zoom = newZoom;
      zoomSlider.value = newZoom.toFixed(2);
      clampOffsets();
      render();
    }
    function handleSliderInput() {
      state.zoom = parseFloat(zoomSlider.value);
      clampOffsets();
      render();
    }

    function attachListeners() {
      viewport.addEventListener("pointerdown", handlePointerDown);
      viewport.addEventListener("pointermove", handlePointerMove);
      viewport.addEventListener("pointerup", handlePointerUp);
      viewport.addEventListener("pointercancel", handlePointerUp);
      viewport.addEventListener("pointerleave", handlePointerUp);
      viewport.addEventListener("wheel", handleWheel, { passive: false });
      zoomSlider.addEventListener("input", handleSliderInput);
      resetBtn.addEventListener("click", resetCrop);
    }
    function detachListeners() {
      viewport.removeEventListener("pointerdown", handlePointerDown);
      viewport.removeEventListener("pointermove", handlePointerMove);
      viewport.removeEventListener("pointerup", handlePointerUp);
      viewport.removeEventListener("pointercancel", handlePointerUp);
      viewport.removeEventListener("pointerleave", handlePointerUp);
      viewport.removeEventListener("wheel", handleWheel);
      zoomSlider.removeEventListener("input", handleSliderInput);
      resetBtn.removeEventListener("click", resetCrop);
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    }
    function finish(result) {
      detachListeners();
      closeModal(modal);
      resolve(result);
    }

    confirmBtn.onclick = () => {
      const scaleFactor = state.baseScale * state.zoom;
      const sx = -state.offX / scaleFactor;
      const sy = -state.offY / scaleFactor;
      const sSize = state.vpSize / scaleFactor;

      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1600;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgEl, sx, sy, sSize, sSize, 0, 0, 1600, 1600);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const croppedFile = new File([blob], file.name, {
              type: "image/jpeg",
              lastModified: Date.now()
            });
            finish(croppedFile);
          } else {
            finish(file);
          }
        },
        "image/jpeg",
        0.98
      );
    };

    cancelBtn.onclick = () => finish(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      imgEl.src = e.target.result;
    };
    reader.onerror = () => finish(file);
    reader.readAsDataURL(file);

    imgEl.onload = () => {
      const vpRect = viewport.getBoundingClientRect();
      state = {
        natW: imgEl.naturalWidth,
        natH: imgEl.naturalHeight,
        vpSize: vpRect.width,
        baseScale: Math.max(
          vpRect.width / imgEl.naturalWidth,
          vpRect.width / imgEl.naturalHeight
        ),
        zoom: 1,
        offX: 0,
        offY: 0
      };
      resetCrop();
      attachListeners();
    };
    imgEl.onerror = () => finish(file);
  });
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
  if (isRetroMode() && retroDateStr) {
    dailyCountElem.textContent =
      `(K datu ${formatDateCz(dateStr)} přidáno: ${dailyCount} produktů)`;
  } else {
    dailyCountElem.textContent = `(Dnes přidáno: ${dailyCount} produktů)`;
  }
}

// Zobrazí historii umístění
function updateLocationHistory() {
  const locationHistoryDiv = document.getElementById("location-history");
  const locations = JSON.parse(localStorage.getItem("locationHistory")) || [];
  if (locations.length === 0) {
    locationHistoryDiv.textContent = "Žádná historie umístění.";
  } else {
    const items = locations
      .map(
        (loc) =>
          `<span class="has-text-link" style="cursor:pointer" onclick="document.getElementById('product-location').value='${loc}'">${loc}</span>`
      )
      .join(", ");
    locationHistoryDiv.innerHTML = "Historie: " + items;
  }
}

// Otevření a zavření Bulma modálu
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
    photoStepTitle.textContent = retro ? "1️⃣ Vyber fotky" : "1️⃣ Nafoť fotky";
  }
  if (photoCountLabel) {
    photoCountLabel.textContent = retro ? "Vybráno:" : "Nafoceno:";
  }
  if (takePhotoBtn) {
    // Ve zpětném režimu je hlavní cesta galerie, focení necháme jako doplněk.
    takePhotoBtn.classList.toggle("is-success", !retro);
    takePhotoBtn.classList.toggle("is-light", retro);
  }
  if (pickPhotoBtn) {
    pickPhotoBtn.classList.toggle("is-info", retro);
    pickPhotoBtn.classList.toggle("is-light", !retro);
  }

  if (retroBadge) {
    if (retro) {
      retroBadge.classList.remove("is-hidden");
      retroBadge.innerHTML = retroDateStr
        ? `🕓 Zpětné zadání – produkt se uloží k datu <strong>${formatDateCz(retroDateStr)}</strong>.`
        : "🕓 Zpětné zadání – datum se doplní podle první fotky.";
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
        ? "🕓 Zpětné zadání zapnuto – vyber datum a pak fotky z galerie."
        : "📷 Režim focení v reálném čase."
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
        ? `🕓 Produkty se uloží k datu ${formatDateCz(retroDateStr)}.`
        : "🕓 Datum se doplní podle první vybrané fotky."
    );
  });
}

/* ---------------------------------
   Inicializace
-----------------------------------*/
initEntryMode();
updateStatus("👉 Začni zadáním ID produktu");
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
-----------------------------------*/
function updatePhotoCountDisplay() {
  if (photoCountElem) photoCountElem.textContent = `${photos.length}/${MAX_PHOTOS}`;
  if (takePhotoBtn) takePhotoBtn.disabled = photos.length >= MAX_PHOTOS;
  if (pickPhotoBtn) pickPhotoBtn.disabled = photos.length >= MAX_PHOTOS;
  renderPhotoPreview();
}

// Náhledy vybraných fotek – hlavně pro zpětné zadání, ať je vidět,
// co se z galerie vybralo, a jde to opravit.
function renderPhotoPreview() {
  if (!photoPreview) return;
  photoPreview.innerHTML = "";
  photos.forEach((file, index) => {
    const item = document.createElement("div");
    item.className = "photo-preview-item";

    const img = document.createElement("img");
    img.alt = `Fotka ${index + 1}`;
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "photo-remove-btn";
    removeBtn.title = "Odebrat fotku";
    removeBtn.innerHTML = "&times;";
    removeBtn.addEventListener("click", () => removePhoto(index));

    item.appendChild(img);
    item.appendChild(removeBtn);
    photoPreview.appendChild(item);
  });
}

function removePhoto(index) {
  photos.splice(index, 1);
  updatePhotoCountDisplay();
  updateStatus(`🗑️ Fotka odebrána (zbývá ${photos.length}/${MAX_PHOTOS}).`);
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
      updateStatus(`🕓 Datum doplněno podle fotky: ${formatDateCz(retroDateStr)}`);
    }
  }

  for (let i = 0; i < files.length; i++) {
    if (photos.length >= MAX_PHOTOS) {
      updateStatus(`ℹ️ Na produkt jdou max. ${MAX_PHOTOS} fotky – zbytek přeskočen.`);
      break;
    }
    const label = `Foto ${photos.length + 1} / ${MAX_PHOTOS}`;
    updateStatus(`✂️ Uprav ořez fotky č. ${photos.length + 1}...`);
    const processedFile = await cropImageInteractive(files[i], label);
    if (processedFile) {
      photos.push(processedFile);
      updateStatus(`📸 Načtena fotka č. ${photos.length}.`);
    } else {
      updateStatus("🚫 Fotka byla zrušena. Zkus to znovu.");
    }
    updatePhotoCountDisplay();
  }

  updatePhotoCountDisplay();

  // Jakmile máme všechny fotky, automaticky přejdeme na detaily
  if (photos.length === MAX_PHOTOS) {
    updateStatus("✅ Fotky byly úspěšně načteny. Teď detail.");
    photoSectionSection.classList.add("is-hidden");
    productDetailsSection.classList.remove("is-hidden");
    updateLocationHistory();
    updateStepProgressBar(2);
  } else if (photos.length >= minPhotosRequired()) {
    updateStatus(
      `📸 Máš ${photos.length}/${MAX_PHOTOS} fotek. Můžeš přidat další, nebo jít tlačítkem „Dál“ na detaily.`
    );
  } else if (photos.length > 0) {
    updateStatus(`📸 Načtena fotka ${photos.length}/${MAX_PHOTOS}. Pokračuj další.`);
  }
}

takePhotoBtn.addEventListener("click", () => {
  if (photos.length < MAX_PHOTOS) {
    photoInput.click();
  } else {
    updateStatus(`✅ Máš už ${MAX_PHOTOS} fotky! Vyplň název a cenu.`);
  }
});

if (pickPhotoBtn) {
  pickPhotoBtn.addEventListener("click", () => {
    if (photos.length < MAX_PHOTOS) {
      galleryInput.click();
    } else {
      updateStatus(`✅ Máš už ${MAX_PHOTOS} fotky! Vyplň název a cenu.`);
    }
  });
}

// Jakmile uživatel vybere soubory (fotoaparát i galerie)
photoInput.addEventListener("change", async () => {
  const files = photoInput.files;
  // Vynulujeme input, aby šlo vybrat stejnou fotku znovu
  const picked = Array.from(files || []);
  photoInput.value = "";
  await handleSelectedPhotos(picked);
});

if (galleryInput) {
  galleryInput.addEventListener("change", async () => {
    const picked = Array.from(galleryInput.files || []);
    galleryInput.value = "";
    await handleSelectedPhotos(picked);
  });
}

/* ---------------------------------
   Výběr kategorie
-----------------------------------*/
categoryBtn.addEventListener("click", () => {
  openModal(categoryModal);
  categorySearch.value = "";
  updateCategoryList("");
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
      groupEl.textContent = '📂 ' + group.name;
      categoryList.appendChild(groupEl);
      filtered.forEach(cat => {
        const btn = document.createElement('button');
        btn.innerHTML = '📦 ' + cat.name;
        btn.onclick = () => {
          categoryIdInput.value = cat.id;
          categoryBtnText.innerHTML = '<span class="category-selected">KATEGORIE <i class="fa-solid fa-check"></i></span>';
          updateStatus('✅ Kategorie vybrána!');
          closeModal(categoryModal);
        };
        categoryList.appendChild(btn);
      });
      found = true;
    }
  });
  if (!found) {
    const noResult = document.createElement('p');
    noResult.classList.add('has-text-grey');
    noResult.innerText = '😕 Žádné kategorie nenalezeny.';
    categoryList.appendChild(noResult);
  }
}

categoryCloseBtn.addEventListener("click", () => {
  closeModal(categoryModal);
});

/* ---------------------------------
   Nahrávání: Unikátní názvy fotek + Excel
-----------------------------------*/
async function uploadFile(file, indexForImages = 1) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  // Datum & čas
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear());
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const dateStr = day + month + year; // "26032025"
  const timeStr = hours + minutes;    // "1042"

  // Náhodný sufix (4 znaky)
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();

  if (file.type.includes("image")) {
    formData.append("folder", "media_library");
    // Např.: IMAGE_25032025_1042_1_ABCD
    const publicId = `IMAGE_${dateStr}_${timeStr}_${indexForImages}_${randomSuffix}`;
    formData.append("public_id", publicId);

  } else {
    formData.append("folder", "excel_files");
    // Např.: products_25032025_RA_ABCD
    const publicId = `products_${dateStr}_${productIdPrefix}_${randomSuffix}`;
    formData.append("public_id", publicId);
  }

  const resp = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: formData
  });
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Chyba při nahrávání: ${resp.status} - ${errorText}`);
  }
  const data = await resp.json();
  return data.secure_url;
}

/* ---------------------------------
   Přidání produktu
-----------------------------------*/
async function addProduct() {
  let valid = true;
  const name = document.getElementById('product-name').value.trim();
  const price = document.getElementById('product-price').value.trim();
  const categoryId = categoryIdInput.value.trim();
  const location = document.getElementById('product-location').value.trim();
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
    updateStatus('⚠️ Vyplň všechna povinná pole!');
    return;
  }
  if (photos.length < minPhotosRequired()) {
    updateStatus(
      isRetroMode()
        ? '⚠️ Vyber aspoň jednu fotku produktu!'
        : `⚠️ Nafoť ${MAX_PHOTOS} fotky, než produkt přidáš!`
    );
    return;
  }

  updateStatus("⏳ Zpracovávám a nahrávám fotky...");
  progressBar.classList.remove("is-hidden");
  progressBar.value = 0;

  try {
    const photoUrls = [];
    for (let i = 0; i < photos.length; i++) {
      updateStatus(`🖼️ Nahrávám obrázek ${i + 1}/${photos.length}...`);
      const url = await uploadFile(photos[i], i + 1);
      photoUrls.push(url);
      const percent = Math.round(((i + 1) / photos.length) * 100);
      progressBar.value = percent;
      updateStatus(`📤 Nahrán obrázek ${i + 1}/${photos.length}...`);
    }

    // Uložení umístění do localStorage (kvůli historii)
    if (location) {
      let locationHistory = JSON.parse(localStorage.getItem("locationHistory")) || [];
      if (!locationHistory.includes(location)) {
        locationHistory.push(location);
        localStorage.setItem("locationHistory", JSON.stringify(locationHistory));
      }
    }

    // Generování entityId
    let lastEntityId = parseInt(localStorage.getItem("lastEntityId")) || 0;
    lastEntityId += 1;
    localStorage.setItem("lastEntityId", lastEntityId);

    function getRoundedISODate() {
      let d = new Date();
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(d.getUTCHours() + 1);
      return d.toISOString().replace(".000Z", "Z");
    }

    const productDescription = `<div class="aukro-offer-default"><div data-layout="text"><div style="font-family:Helvetica,Arial,sans-serif;color:#111;background:#fff;border:1px solid #111;border-radius:20px;padding:28px;max-width:900px;margin:auto;"><p style="margin:0 0 20px;"><img src="https://cdn-pipeline-output.picsart.com/pipeline-output/31a3a109-ef8f-49d0-b22a-546a6815f9b4.png" alt="RetroAukce" style="display:block;margin:auto;max-width:100%;border-radius:16px;"></p><h3 style="background:#111;color:#fff;border-radius:12px;padding:10px 18px;margin:0 0 10px;font-size:17px;letter-spacing:.5px;"><strong>🛒 NABÍZENÉ ZBOŽÍ</strong></h3><div style="border:1px solid #ddd;border-radius:14px;padding:16px 18px;margin:0 0 12px;"><p style="margin:0 0 8px;">Stav viz. fotografie 📸</p><p style="margin:0;"><strong>Pro dotazy k aukcím preferuji komunikaci e-mailem, z důvodu flexibilnějšího a rychlejšího vyřízení požadavku. Přeji Vám příjemnou dražbu! 💌 Podívejte se i na mé další aukce a objevte skvělé nabídky! 🚀</strong></p></div><h3 style="background:#111;color:#fff;border-radius:12px;padding:10px 18px;margin:22px 0 10px;font-size:17px;letter-spacing:.5px;"><strong>⚠️ INFORMACE O AUKCI</strong></h3><div style="border:1px solid #ddd;border-radius:14px;padding:16px 18px;margin:0 0 12px;"><p style="margin:0 0 8px;">Na platby čekám jeden týden od vydražení aukce, zboží <strong>zasílám 7–10 dní po obdržení platby</strong>. Zboží bude znovu vystaveno, zda-li nebude uhrazeno v této lhůtě.</p><p style="margin:0;">Berte prosím na vědomí, že vydražené zboží <strong>nezasílám na DOBÍRKU</strong>. Zboží mohu zasílat přes <strong>KURÝRNÍ SLUŽBU (DPD) &amp; také ZÁSILKOVNU & BALÍKOVNU</strong>.</p></div><h3 style="background:#111;color:#fff;border-radius:12px;padding:10px 18px;margin:22px 0 10px;font-size:17px;letter-spacing:.5px;"><strong>💳 PLATBA</strong></h3><div style="border:1px solid #ddd;border-radius:14px;padding:16px 18px;margin:0 0 12px;"><p style="margin:0;">Platbu můžete uskutečnit pouze přes <strong>AUKRO</strong>. Děkuji za pochopení. <strong></strong></p></div><p style="margin:28px 0 0;text-align:center;"><a href="https://aukro.cz/uzivatel/RetroAukce/nabidky" style="display:block;width:fit-content;margin:0 auto;background:#111;color:#fff;text-decoration:none;border-radius:999px;padding:14px 32px;font-weight:bold;letter-spacing:.5px;">➜ ZOBRAZIT NABÍDKY</a></p></div></div></div>`;

    const productId = currentProductId;
    const formattedName = `${name.toUpperCase()} | ${productId}`;
    // U zpětného zadání se uloží vybrané datum, jinak dnešek.
    const addedDateStr = getEffectiveDateString();
    const createdAtIso = getEffectiveCreatedAtISO();

    const product = {
      entityId: lastEntityId,
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
      locationName: location
    };

    let products = JSON.parse(localStorage.getItem("products")) || [];
    products.push(product);
    localStorage.setItem("products", JSON.stringify(products));

    // Posuneme ID produktu na další v pořadí
    advanceProductId();

    // Reset fotek a formuláře
    photos = [];
    updatePhotoCountDisplay();
    document.getElementById("product-name").value = "";
    document.getElementById("product-price").value = "";
    document.getElementById("product-location").value = "";
    categoryIdInput.value = "";
    categoryBtnText.innerHTML = 'Vybrat kategorii';
    shippingMethodSelect.value = "2424163";
    document.getElementById("promo-priority").checked = false;
    document.getElementById("promo-bold").checked = false;
    document.getElementById("promo-highlight").checked = false;

    productDetailsSection.classList.add("is-hidden");
    finishSection.classList.remove("is-hidden");
    updateStepProgressBar(3);

    updateStatus(
      isRetroMode() && retroDateStr
        ? `🎉 Produkt přidán k datu ${formatDateCz(addedDateStr)}! Můžeš uložit do DB nebo přidat další.`
        : "🎉 Produkt přidán! Můžeš dokončit nebo přidat další."
    );
  } catch (error) {
    updateStatus(`❌ Chyba při nahrávání fotek: ${error.message}`);
  }
}

/* ---------------------------------
   Přidat další produkt
-----------------------------------*/
function addAnotherProduct() {
  progressBar.value = 0;
  progressBar.classList.add("is-hidden");

  // Reset formuláře pro nový produkt
  photos = [];
  updatePhotoCountDisplay();
  document.getElementById("product-name").value = "";
  document.getElementById("product-price").value = "";
  document.getElementById("product-location").value = "";
  categoryIdInput.value = "";
  categoryBtnText.innerHTML = 'Vybrat kategorii';
  shippingMethodSelect.value = "2424163";
  document.getElementById("promo-priority").checked = false;
  document.getElementById("promo-bold").checked = false;
  document.getElementById("promo-highlight").checked = false;

  // Reset historie pro nový produkt
  ['product-name', 'product-price', 'product-location'].forEach(id => {
    renderInputHistory(id);
  });

  finishSection.classList.add("is-hidden");
  productDetailsSection.classList.add("is-hidden");
  photoSectionSection.classList.remove("is-hidden");
  updateStepProgressBar(1);
  updateStatus(
    isRetroMode()
      ? "👉 Vyber fotky dalšího produktu z galerie."
      : "👉 Nafoť fotky pro další produkt."
  );
}

/* ---------------------------------
   Dokončení – export do Excelu, WhatsApp
-----------------------------------*/
async function finish() {
  const confirmed = await showConfirmModal();
  if (!confirmed) return;

  const products = JSON.parse(localStorage.getItem("products")) || [];
  const savedProductsDiv = document.getElementById("saved-products");
  savedProductsDiv.innerHTML = "";

  if (products.length === 0) {
    savedProductsDiv.innerHTML = "<p>Žádné produkty nebyly přidány. 😕</p>";
    updateStatus("⚠️ Přidej aspoň jeden produkt před dokončením.");
    return;
  }

  const headers = [
    "entityId",
    "name",
    "language",
    "extId",
    "categoryId",
    "description",
    "auctionPriceAmount",
    "auctionPriceCurrency",
    "buyNowPriceAmount",
    "buyNowPriceCurrency",
    "quantity",
    "quantityUnit",
    "startingAt",
    "duration",
    "reexposeType",
    "location",
    "shippingTemplateId",
    "shippingPayer",
    "images",
    "bestOffer",
    "onlyVerifiedBuyersEnabledOverride",
    "attributes",
    "priorityListing",
    "boldTitle",
    "highlight"
  ];

  const data = products.map((p) => ({
    entityId: p.entityId,
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
    startingAt: p.startingAt,
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

  const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Products");

  try {
    updateStatus("⏳ Nahrávám Excel na server...");
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array"
    });
    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    // Vytvoříme jméno souboru: products_26032025_[Z].xlsx
    const dateNow = new Date();
    const dd = String(dateNow.getDate()).padStart(2, "0");
    const mm = String(dateNow.getMonth() + 1).padStart(2, "0");
    const yyyy = String(dateNow.getFullYear());
    const dateStr = dd + mm + yyyy;
    const fileName = `products_${dateStr}_${productIdPrefix}.xlsx`;

    const file = new File([blob], fileName, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    // Pro Excel: doplníme i unikátní sufix do public_id
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const excelUrl = await uploadFileForExcel(file, randomSuffix);

    // Po vygenerování Excelu naimportujeme produkty i do dashboardu (Firestore)
    await syncProductsToFirestore(products, excelUrl);

    // Zkopírování odkazu do schránky
    navigator.clipboard.writeText(excelUrl).then(
      () => {
        updateStatus("✅ Odkaz zkopírován do schránky!");
      },
      (err) => {
        updateStatus("❌ Chyba při kopírování odkazu: " + err);
      }
    );

    // Otevření WhatsApp
    const whatsappUrl = `whatsapp://send?text=Zde je vygenerovaný Excel soubor: ${encodeURIComponent(excelUrl)}`;
    window.location.href = whatsappUrl;

    savedProductsDiv.innerHTML =
      "<p>Soubor byl nahrán a odkaz zkopírován. Otevři WhatsApp a odešli zprávu.</p>";
  } catch (error) {
    updateStatus(`❌ Chyba při nahrávání Excelu: ${error.message}`);
  }
}

/* ---------------------------------
   Funkce pro Excel s unikátním sufixem
-----------------------------------*/
async function uploadFileForExcel(file, randomSuffix) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  // Připravíme datum
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  const dateStr = dd + mm + yyyy; 

  // Např. products_26032025_RA_ABCD
  const publicId = `products_${dateStr}_${productIdPrefix}_${randomSuffix}`;

  formData.append("folder", "excel_files");
  formData.append("public_id", publicId);

  const resp = await fetch(CLOUDINARY_UPLOAD_URL, {
    method: "POST",
    body: formData
  });
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Chyba při nahrávání Excelu: ${resp.status} - ${errorText}`);
  }
  const data = await resp.json();
  return data.secure_url;
}

/* ---------------------------------
   Import produktů do dashboardu (Firestore)
   – zavolá se v finish() po vytvoření Excelu.
   Když Firebase není nastaven, tiše se přeskočí
   a appka dál funguje jen s Excelem.
-----------------------------------*/
async function syncProductsToFirestore(products, excelUrl) {
  if (!window.db) {
    updateStatus("ℹ️ Firebase není nastaven – import do dashboardu přeskočen.");
    return;
  }

  // Importujeme jen produkty, které ještě v databázi nejsou (kvůli
  // opakovanému "Odeslat" nechceme duplicity). product_id používáme jako
  // ID dokumentu, takže se nedá použít podruhé.
  const pending = products.filter((p) => !p.syncedToDb);
  if (!pending.length) return;

  try {
    updateStatus("🗄️ Importuji produkty do dashboardu...");
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
      updateStatus(`✅ Naimportováno ${toWrite.length}. ⛔ ${existing.size} ID už existovalo – přeskočeno.`);
    } else {
      updateStatus("✅ Produkty naimportovány do dashboardu.");
    }
  } catch (e) {
    const msg = (e && e.message) || e;
    updateStatus("⚠️ Import do dashboardu selhal: " + msg);
  }
}

/* ---------------------------------
   Uložení do databáze bez Excelu
   – pro ruční / zpětné zadávání, kdy
     nechceš generovat Excel ani posílat
     nic přes WhatsApp. Excel jde kdykoli
     později vyexportovat z dashboardu.
-----------------------------------*/
async function saveToDatabase() {
  const products = JSON.parse(localStorage.getItem("products")) || [];
  const savedProductsDiv = document.getElementById("saved-products");

  if (!products.length) {
    updateStatus("⚠️ Nejdřív přidej aspoň jeden produkt.");
    return;
  }

  const pending = products.filter((p) => !p.syncedToDb);
  if (!pending.length) {
    updateStatus("ℹ️ Všechny přidané produkty už v databázi jsou.");
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
      `<p>Produkty jsou v databázi – najdeš je v <a href="dashboard.html">dashboardu</a>. Excel si odtamtud můžeš vyexportovat kdykoli později.</p>`;
  }
}

/* ---------------------------------
   Reset úložiště
-----------------------------------*/
async function resetStorage() {
  const confirmed = await showConfirmModal();
  if (!confirmed) return;

  localStorage.clear();
  // Zvolený režim (vč. zpětného data) si necháme – mazání dat neznamená,
  // že uživatel přestal zadávat zpětně.
  saveEntryModeState();
  photos = [];
  currentProductId = null;
  productIdPrefix = "";
  productIdNum = 0;
  productIdWidth = 2;
  if (startProductIdInput) startProductIdInput.value = "";
  updatePhotoCountDisplay();
  document.getElementById("product-name").value = "";
  document.getElementById("product-price").value = "";
  document.getElementById("product-location").value = "";
  categoryIdInput.value = "";
  categoryBtnText.innerHTML = 'Vybrat kategorii';
  shippingMethodSelect.value = "2424163";
  document.getElementById("promo-priority").checked = false;
  document.getElementById("promo-bold").checked = false;
  document.getElementById("promo-highlight").checked = false;
  progressBar.value = 0;
  progressBar.classList.add("is-hidden");

  productDetailsSection.classList.add("is-hidden");
  photoSectionSection.classList.add("is-hidden");
  finishSection.classList.add("is-hidden");
  shopSelectionSection.classList.remove("is-hidden");
  document.getElementById("saved-products").innerHTML = "";
  updateStepProgressBar(0);
  applyEntryModeUI();

  updateStatus("🧹 Data byla vymazána! Začni znovu.");
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

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const currentStep = parseInt(btn.dataset.step, 10);
    const isNext = btn.classList.contains("next-btn");
    const newStep = isNext ? currentStep + 1 : currentStep - 1;

    if (newStep >= 0 && newStep < steps.length) {
      // Krok 0 -> nastavení ID produktu (+ kontrola unikátnosti)
      if (currentStep === 0 && isNext) {
        const parsed = parseProductId(startProductIdInput.value);
        if (!parsed) {
          updateStatus("⚠️ Zadej platné ID produktu, např. RA01");
          return;
        }
        const check = await checkStartIdFree(parsed);
        if (!check.ok) {
          startProductIdInput.value = check.suggest;
          updateStatus(
            `⛔ ID ${formatProductId(parsed.prefix, parsed.num, parsed.width)} už bylo použité. Zkus ${check.suggest}.`
          );
          return;
        }
        setProductIdState(parsed.prefix, parsed.num, parsed.width);
      }
      // Kontrola fotek při přechodu z kroku 1
      // (zpětné zadání: stačí aspoň jedna, jinak chceme všechny 3)
      if (currentStep === 1 && isNext && photos.length < minPhotosRequired()) {
        updateStatus(
          isRetroMode()
            ? "⚠️ Vyber aspoň jednu fotku, než přejdeš dál!"
            : `⚠️ Musíš nafotit ${MAX_PHOTOS} fotky, než přejdeš dál!`
        );
        return;
      }
      // Při přechodu na fotky ještě zaktualizujeme popisky podle režimu
      if (currentStep === 0 && isNext) {
        applyEntryModeUI();
      }
      // Kontrola vyplnění při přechodu z kroku 2
      if (currentStep === 2 && isNext) {
        const name = document.getElementById("product-name").value.trim();
        const price = document.getElementById("product-price").value.trim();
        const categoryId = categoryIdInput.value.trim();
        const shippingId = shippingMethodSelect.value;
        if (!name || !price || !categoryId || !shippingId) {
          updateStatus("⚠️ Vyplň název, cenu, kategorii a dopravu, než přejdeš dál!");
          return;
        }
      }

      steps[currentStep].classList.add("is-hidden");
      steps[newStep].classList.remove("is-hidden");
      updateStatus(`👉 Přepnuto na krok č. ${newStep + 1}`);
      updateStepProgressBar(newStep);
    }
  });
});

/* ---------------------------------
   Potvrzovací modál ANO/NE
-----------------------------------*/
function showConfirmModal() {
  openModal(confirmModal);
  return new Promise((resolve) => {
    confirmYesBtn.onclick = () => {
      closeModal(confirmModal);
      resolve(true);
    };
    confirmNoBtn.onclick = () => {
      closeModal(confirmModal);
      resolve(false);
    };
  });
}

/* ---------------------------------
   Modál pro odchod
-----------------------------------*/
window.addEventListener("beforeunload", (e) => {
  openModal(exitModal);
  e.preventDefault();
  e.returnValue = "";
});

deleteDataBtn.addEventListener("click", () => {
  resetStorage();
  closeModal(exitModal);
  updateStatus("🧹 Data vymazána při odchodu!");
  setTimeout(() => window.location.reload(), 1000);
});

closeModalBtn.addEventListener("click", () => {
  closeModal(exitModal);
});

/* ---------------------------------
   Propojení tlačítek
-----------------------------------*/
finishBtn.addEventListener("click", finish);
resetBtn.addEventListener("click", resetStorage);

// --- Progress bar kroků ---
function updateStepProgressBar(step) {
  const bar = document.getElementById('step-progress-bar');
  const steps = document.querySelectorAll('.step-label');
  const percent = [0, 33, 66, 100][step] || 0;
  bar.style.width = percent + '%';
  steps.forEach((el, idx) => {
    if (idx === step) el.classList.add('active');
    else el.classList.remove('active');
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
  return JSON.parse(localStorage.getItem(key) || '[]');
}
function setInputHistory(inputId, value) {
  const key = inputHistoryKeys[inputId];
  if (!key) return;
  let arr = getInputHistory(inputId);
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
