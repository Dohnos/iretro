/* ==========================================================
   Přihlašovací brána (Firebase Auth).

   Dokud není přihlášen VLASTNÍK (window.OWNER_EMAIL), překryje
   stránku přihlašovacím formulářem. Po úspěšném přihlášení spustí
   všechny callbacky zaregistrované přes window.onAuthReady(cb).

   Vloží se na KAŽDOU stránku HNED za firebase-config.js.
   Styly jsou vlastní (nezávislé na Bulma), aby fungovaly všude.
   ==========================================================*/
(function () {
  const auth = window.fbAuth;
  const OWNER = String(window.OWNER_EMAIL || "").toLowerCase();
  const readyCbs = [];
  let ready = false;

  // Registrace callbacku, který se spustí po přihlášení vlastníka.
  window.onAuthReady = function (cb) {
    if (typeof cb !== "function") return;
    if (ready) { try { cb(); } catch (e) { /* noop */ } }
    else readyCbs.push(cb);
  };
  window.fbSignOut = function () { if (auth) auth.signOut(); };

  if (!auth) {
    console.error("Firebase Auth není načtený – zkontroluj SDK a firebase-config.js.");
    return;
  }

  /* --- Styly overlaye --- */
  const style = document.createElement("style");
  style.textContent = `
    #fb-auth-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;
      justify-content:center;background:rgba(10,10,10,.6);backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);font-family:'Inter',system-ui,-apple-system,sans-serif}
    #fb-auth-card{background:#fff;color:#0a0a0a;width:min(92vw,360px);padding:28px 26px;
      border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.35);
      animation:fb-auth-in .4s cubic-bezier(.22,1,.36,1)}
    @keyframes fb-auth-in{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
    #fb-auth-card h2{display:flex;align-items:center;gap:9px;margin:0 0 4px;font-size:1.3rem;
      font-weight:700;letter-spacing:-.02em}
    #fb-auth-card h2 svg{width:20px;height:20px}
    #fb-auth-card p.sub{margin:0 0 20px;font-size:.9rem;color:#6e6e6e}
    #fb-auth-card label{display:block;font-size:.72rem;font-weight:600;letter-spacing:.08em;
      text-transform:uppercase;margin:0 0 6px;color:#6e6e6e}
    #fb-auth-card input{width:100%;padding:12px 14px;margin:0 0 14px;border:1px solid #cfcfcf;
      border-radius:10px;font-size:1rem;box-sizing:border-box;font-family:inherit;
      background:#fff;color:#0a0a0a;transition:border-color .16s,box-shadow .16s}
    #fb-auth-card input:focus{outline:none;border-color:#0a0a0a;box-shadow:0 0 0 1px #0a0a0a}
    #fb-auth-btn{width:100%;min-height:46px;border:0;border-radius:10px;background:#0a0a0a;color:#fff;
      font-weight:600;font-size:.95rem;cursor:pointer;transition:opacity .16s,transform .16s;
      font-family:inherit}
    #fb-auth-btn:hover{opacity:.86}
    #fb-auth-btn:active{transform:scale(.98)}
    #fb-auth-btn:disabled{opacity:.5;cursor:default}
    #fb-auth-err{color:#0a0a0a;font-weight:600;font-size:.83rem;margin:12px 0 0;min-height:1em}
    #fb-signout{position:fixed;top:14px;right:62px;z-index:150;display:none;height:40px;
      background:var(--bg,#fff);color:var(--fg,#0a0a0a);border:1px solid var(--line-strong,#cfcfcf);
      border-radius:999px;padding:0 14px;font-size:.82rem;font-weight:600;cursor:pointer;
      font-family:'Inter',system-ui,sans-serif;transition:border-color .16s}
    #fb-signout:hover{border-color:var(--fg,#0a0a0a)}
  `;
  document.documentElement.appendChild(style);

  /* --- DOM overlaye --- */
  const overlay = document.createElement("div");
  overlay.id = "fb-auth-overlay";
  overlay.innerHTML = `
    <form id="fb-auth-card" autocomplete="on">
      <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Přihlášení</h2>
      <p class="sub">iAUKRO – přístup jen pro vlastníka.</p>
      <label for="fb-email">E-mail</label>
      <input id="fb-email" type="email" autocomplete="username" required />
      <label for="fb-pass">Heslo</label>
      <input id="fb-pass" type="password" autocomplete="current-password" required />
      <button id="fb-auth-btn" type="submit">Přihlásit se</button>
      <p id="fb-auth-err"></p>
    </form>`;

  const signout = document.createElement("button");
  signout.id = "fb-signout";
  signout.textContent = "Odhlásit";
  signout.addEventListener("click", function () { auth.signOut(); });

  function mount() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", mount);
      return;
    }
    document.body.appendChild(overlay);
    document.body.appendChild(signout);
    const form = overlay.querySelector("#fb-auth-card");
    const err = overlay.querySelector("#fb-auth-err");
    const btn = overlay.querySelector("#fb-auth-btn");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      err.textContent = "";
      btn.disabled = true;
      btn.textContent = "Přihlašuji…";
      const email = overlay.querySelector("#fb-email").value.trim();
      const pass = overlay.querySelector("#fb-pass").value;
      auth.signInWithEmailAndPassword(email, pass)
        .catch(function (e2) { err.textContent = humanErr(e2); })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = "Přihlásit se";
        });
    });
  }

  function humanErr(e) {
    const c = (e && e.code) || "";
    if (c.indexOf("wrong-password") >= 0 || c.indexOf("invalid-credential") >= 0) return "Špatný e-mail nebo heslo.";
    if (c.indexOf("user-not-found") >= 0) return "Uživatel neexistuje.";
    if (c.indexOf("too-many-requests") >= 0) return "Příliš mnoho pokusů, zkus to prosím za chvíli.";
    if (c.indexOf("invalid-email") >= 0) return "Neplatný e-mail.";
    if (c.indexOf("network") >= 0) return "Chyba sítě – zkontroluj připojení.";
    return (e && e.message) || "Přihlášení selhalo.";
  }

  function showOverlay() { overlay.style.display = "flex"; signout.style.display = "none"; }
  function hideOverlay() { overlay.style.display = "none"; signout.style.display = "block"; }

  mount();

  auth.onAuthStateChanged(function (user) {
    const isOwner = user && String(user.email || "").toLowerCase() === OWNER;
    if (isOwner) {
      hideOverlay();
      if (!ready) {
        ready = true;
        readyCbs.forEach(function (fn) { try { fn(); } catch (e) { /* noop */ } });
      }
    } else if (user) {
      // Přihlášený, ale nesprávný účet – hned odhlásit.
      const err = overlay.querySelector("#fb-auth-err");
      if (err) err.textContent = "Tento účet nemá přístup.";
      auth.signOut();
      showOverlay();
    } else {
      showOverlay();
    }
  });
})();
