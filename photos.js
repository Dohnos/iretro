/* ==========================================================
   Fotky – SPOLEČNÉ pro appku i dashboard.

   - interaktivní čtvercový ořez (stejný výřez, jaký pak vidí Aukro)
   - nahrání na Cloudinary
   - zmenšené náhledy přes transformace Cloudinary (dashboard)
   ==========================================================*/
(function () {
  const CLOUDINARY_UPLOAD_URL = "https://api.cloudinary.com/v1_1/drrzl7evt/auto/upload";
  const CLOUDINARY_UPLOAD_PRESET = "Retroaukce";
  window.CLOUDINARY_UPLOAD_URL = CLOUDINARY_UPLOAD_URL;
  window.CLOUDINARY_UPLOAD_PRESET = CLOUDINARY_UPLOAD_PRESET;

  // Nejvýš tolik fotek na jeden produkt (appka i úprava v dashboardu).
  window.MAX_PHOTOS = 12;

  // Ořez se ukládá jako 1600×1600 JPEG. 0.92 je okem k nerozeznání od 0.98,
  // ale soubor je zhruba poloviční – na mobilních datech se to pozná.
  const CROP_SIZE = 1600;
  const JPEG_QUALITY = 0.92;

  /* ---------------------------------
     Interaktivní náhled a úprava ořezu
     (čtverec 1:1, přesně jak to uloží
     Cloudinary po nahrání)
  -----------------------------------*/
  function buildCropModal() {
    const existing = document.getElementById("crop-modal");
    if (existing) return existing;

    // Styly ořezu jsou ve styles.css (sekce „Ořez fotky“).
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="modal" id="crop-modal">
        <div class="modal-background"></div>
        <div class="modal-content">
          <div class="box">
            <p class="modal-title">Ořez fotky</p>
            <p class="muted" id="crop-modal-subtitle"></p>
            <div id="crop-viewport">
              <img id="crop-image" draggable="false" alt="Náhled ořezu fotky" />
            </div>
            <div class="crop-controls">
              ${window.icon("search")}
              <input type="range" id="crop-zoom-slider" min="1" max="4" step="0.01" value="1"
                     aria-label="Přiblížení">
            </div>
            <p class="crop-hint">Táhni pro posun, sliderem nebo dvěma prsty přibliž.</p>
            <div class="crop-buttons">
              <button type="button" class="btn btn--quiet btn--sm" id="crop-reset-btn">
                ${window.icon("undo")} Reset
              </button>
              <button type="button" class="btn btn--ghost btn--sm" id="crop-cancel-btn">
                ${window.icon("x")} Zrušit
              </button>
              <button type="button" class="btn btn--sm" id="crop-confirm-btn">
                ${window.icon("check")} Použít
              </button>
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
  window.cropImageInteractive = function (file, label) {
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
      modal.classList.add("is-active");

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
        modal.classList.remove("is-active");
        resolve(result);
      }

      confirmBtn.onclick = () => {
        const scaleFactor = state.baseScale * state.zoom;
        const sx = -state.offX / scaleFactor;
        const sy = -state.offY / scaleFactor;
        const sSize = state.vpSize / scaleFactor;

        const canvas = document.createElement("canvas");
        canvas.width = CROP_SIZE;
        canvas.height = CROP_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(imgEl, sx, sy, sSize, sSize, 0, 0, CROP_SIZE, CROP_SIZE);

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
          JPEG_QUALITY
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
        // clientWidth, ne getBoundingClientRect: modál se při otevření animuje
        // (scale) a změřená šířka by byla o pár pixelů menší než skutečná.
        const vpSize = viewport.clientWidth;
        state = {
          natW: imgEl.naturalWidth,
          natH: imgEl.naturalHeight,
          vpSize: vpSize,
          baseScale: Math.max(
            vpSize / imgEl.naturalWidth,
            vpSize / imgEl.naturalHeight
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
  };


  /* ---------------------------------
     Nahrání jedné fotky na Cloudinary.
     Vrátí https adresu nahraného obrázku.
  -----------------------------------*/
  window.uploadImageToCloudinary = async function (file, indexForImages = 1) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    // Např.: IMAGE_25032025_1042_1_ABCD (datum, čas, pořadí, náhodný sufix)
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = pad(now.getDate()) + pad(now.getMonth() + 1) + now.getFullYear();
    const timeStr = pad(now.getHours()) + pad(now.getMinutes());
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    formData.append("folder", "media_library");
    formData.append("public_id", `IMAGE_${dateStr}_${timeStr}_${indexForImages}_${randomSuffix}`);

    const resp = await fetch(CLOUDINARY_UPLOAD_URL, { method: "POST", body: formData });
    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Chyba při nahrávání: ${resp.status} - ${errorText}`);
    }
    const data = await resp.json();
    return data.secure_url;
  };

  /* ---------------------------------
     Zmenšený náhled z Cloudinary.
     Originály mají 1600 px a ~0,5 MB; dashboard se
     stovkou karet by je jinak stahoval všechny.
     U adres mimo Cloudinary vrátí adresu beze změny.
  -----------------------------------*/
  window.cloudinaryThumb = function (url, size) {
    const s = String(url || "");
    if (!/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(s)) return s;
    return s.replace(
      "/image/upload/",
      `/image/upload/c_fill,w_${size},h_${size},q_auto,f_auto/`
    );
  };
})();
