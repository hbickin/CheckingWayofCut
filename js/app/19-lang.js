/* BIÇKIN — Dil değiştirme / language switching. Telif © 2026 BIÇKIN. */
  // ------------------------------------------------------------------
  // Dil değiştirme
  // ------------------------------------------------------------------
  function applyLang() {
    document.documentElement.lang = lang;
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) { el.textContent = L(el.getAttribute('data-i18n')); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-title]'), function (el) { el.title = L(el.getAttribute('data-i18n-title')); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-ph]'), function (el) { el.placeholder = L(el.getAttribute('data-i18n-ph')); });
    Array.prototype.forEach.call(document.querySelectorAll('.lang button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
    renderMarkerInfo(); fillPieceSelect(); buildToolList(); buildNestList(); renderVersions();
    if (els.guideDialog.open) renderGuide();
    if (els.verDialog.open) renderVersions();
    updateButtons(); updateStatus(); updateLogCounts();
    renderPreview(true); renderSim();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.lang button'), function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-lang');
      if (v === lang) return;
      lang = v;
      try { localStorage.setItem(LANG_STORE_KEY, lang); } catch (e) { /* yok say */ }
      applyLang();
      log('info', L('lang.changed'));
    });
  });
