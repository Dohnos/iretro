/* ==========================================================
   HTML šablona popisu nabídky pro Aukro – SPOLEČNÁ pro appku
   i dashboard.

   Aukro nepouští vlastní CSS ani třídy, proto jsou všechny styly
   inline. Poznámka k předmětu je volitelná: když je vyplněná,
   vloží se jako první sekce (hned pod logo), jinak se vynechá.
   ==========================================================*/
(function () {
  const WRAP_OPEN =
    '<div class="aukro-offer-default"><div data-layout="text">' +
    '<div style="font-family:Helvetica,Arial,sans-serif;color:#111;background:#fff;border:1px solid #111;border-radius:20px;padding:28px;max-width:900px;margin:auto;">';
  const WRAP_CLOSE = "</div></div></div>";

  const LOGO =
    '<p style="margin:0 0 20px;"><img src="https://cdn-pipeline-output.picsart.com/pipeline-output/31a3a109-ef8f-49d0-b22a-546a6815f9b4.png" alt="RetroAukce" style="display:block;margin:auto;max-width:100%;border-radius:16px;"></p>';

  const BOX_STYLE = "border:1px solid #ddd;border-radius:14px;padding:16px 18px;margin:0 0 12px;";

  // Nadpis sekce – první na stránce nemá horní odsazení.
  function heading(title, isFirst) {
    const margin = isFirst ? "0 0 10px" : "22px 0 10px";
    return (
      `<h3 style="background:#111;color:#fff;border-radius:12px;padding:10px 18px;margin:${margin};font-size:17px;letter-spacing:.5px;">` +
      `<strong>${title}</strong></h3>`
    );
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Poznámka je prostý text od uživatele: escapujeme ho a konce řádků
  // převedeme na <br>, aby víceřádková poznámka držela tvar.
  function noteSection(note) {
    const html = escapeHtml(note.trim()).replace(/\r?\n/g, "<br>");
    return (
      heading("📝 POZNÁMKA K PŘEDMĚTU", true) +
      `<div style="${BOX_STYLE}"><p style="margin:0;">${html}</p></div>`
    );
  }

  window.buildProductDescription = function (note) {
    const hasNote = !!(note && String(note).trim());

    return (
      WRAP_OPEN +
      LOGO +
      (hasNote ? noteSection(String(note)) : "") +
      heading("🛒 NABÍZENÉ ZBOŽÍ", !hasNote) +
      `<div style="${BOX_STYLE}">` +
      '<p style="margin:0 0 8px;">Stav viz. fotografie 📸</p>' +
      '<p style="margin:0;"><strong>Pro dotazy k aukcím preferuji komunikaci e-mailem, z důvodu flexibilnějšího a rychlejšího vyřízení požadavku. Přeji Vám příjemnou dražbu! 💌 Podívejte se i na mé další aukce a objevte skvělé nabídky! 🚀</strong></p>' +
      "</div>" +
      heading("⚠️ INFORMACE O AUKCI", false) +
      `<div style="${BOX_STYLE}">` +
      '<p style="margin:0 0 8px;">Na platby čekám jeden týden od vydražení aukce, zboží <strong>zasílám 7–10 dní po obdržení platby</strong>. Zboží bude znovu vystaveno, zda-li nebude uhrazeno v této lhůtě.</p>' +
      '<p style="margin:0;">Berte prosím na vědomí, že vydražené zboží <strong>nezasílám na DOBÍRKU</strong>. Zboží mohu zasílat přes <strong>KURÝRNÍ SLUŽBU (DPD) &amp; také ZÁSILKOVNU &amp; BALÍKOVNU</strong>.</p>' +
      "</div>" +
      heading("💳 PLATBA", false) +
      `<div style="${BOX_STYLE}">` +
      '<p style="margin:0;">Platbu můžete uskutečnit pouze přes <strong>AUKRO</strong>. Děkuji za pochopení.</p>' +
      "</div>" +
      '<p style="margin:28px 0 0;text-align:center;"><a href="https://aukro.cz/uzivatel/RetroAukce/nabidky" style="display:block;width:fit-content;margin:0 auto;background:#111;color:#fff;text-decoration:none;border-radius:999px;padding:14px 32px;font-weight:bold;letter-spacing:.5px;">➜ ZOBRAZIT NABÍDKY</a></p>' +
      WRAP_CLOSE
    );
  };
})();
