/* BIÇKIN — Versiyon geçmişi / version history. Telif © 2026 BIÇKIN. */
  // ------------------------------------------------------------------
  // Versiyon geçmişi
  // ------------------------------------------------------------------
  var APP_VERSION = '1.10';
  var VERSIONS = window.BK_VERSIONS;
  function renderVersions() {
    els.btnVersion.textContent = 'ⓘ ' + L('ver.btn', { v: APP_VERSION });
    els.verList.innerHTML = VERSIONS.map(function (r) {
      var cur = r.v === APP_VERSION;
      return '<section class="ver' + (cur ? ' current' : '') + '"><h3>V' + r.v + ' <small>' + r.date +
        (cur ? ' · ' + L('ver.current') : '') + '</small></h3><ul>' +
        (r[lang] || r.tr).map(function (li) { return '<li>' + li + '</li>'; }).join('') + '</ul></section>';
    }).join('');
  }
  els.btnVersion.addEventListener('click', function () { renderVersions(); openDialog(els.verDialog); });
