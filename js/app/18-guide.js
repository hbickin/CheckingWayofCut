/* BIÇKIN — Kullanım kılavuzu / user guide. Telif © 2026 Hüseyin BIÇKIN. */
  // ------------------------------------------------------------------
  // Kullanım kılavuzu (ekran görüntüsü üzerinde numaralı anlatım)
  // ------------------------------------------------------------------
  // Numaraların resim üzerindeki yeri (% olarak sol, üst); ekran görüntüsü alınırken ölçüldü
  var GUIDE_POS = window.BK_GUIDE_POS;
  var GUIDE_IMG = window.BK_GUIDE_IMG;
  var GUIDE = window.BK_GUIDE;
  function renderGuide() {
    var g = GUIDE[lang] || GUIDE.tr;
    var ids = Object.keys(g.items).map(Number).sort(function (a, b) { return a - b; });
    var badges = ids.filter(function (n) { return GUIDE_POS[n]; }).map(function (n) {
      return '<span class="gbadge" data-n="' + n + '" style="left:' + GUIDE_POS[n][0] + '%;top:' + GUIDE_POS[n][1] + '%" title="' +
        esc(g.items[n][0]) + '">' + n + '</span>';
    }).join('');
    els.guideBody.innerHTML =
      '<p class="muted">' + g.intro + '</p>' +
      '<p><b>' + g.stepsTitle + '</b></p><ul class="guide-steps">' + g.steps.map(function (st, i) {
        return '<li><b>' + L('guide.step', { n: String.fromCharCode(65 + i) }) + '</b> ' +
          st.replace(/\{(\d+)\}/g, function (m, n) { return '<span class="num-inline" data-n="' + n + '">' + n + '</span>'; }) + '</li>';
      }).join('') + '</ul>' +
      '<div class="guide-figure"><img alt="" src="' + GUIDE_IMG + '">' + badges + '</div>' +
      '<ol class="guide-list">' + ids.map(function (n) {
        return '<li data-n="' + n + '"><span class="num">' + n + '</span><span><b>' + g.items[n][0] + '</b><br><span class="t">' + g.items[n][1] + '</span></span></li>';
      }).join('') + '</ol>' +
      '<div class="guide-tips"><p><b>💡 ' + g.tipsTitle + '</b></p>' + g.tips.map(function (t) { return '<p>• ' + t + '</p>'; }).join('') + '</div>';
  }
  // Numara ile açıklamayı birbirine bağla: birinin üzerine gelince ikisi de vurgulanır
  function guideHighlight(n) {
    Array.prototype.forEach.call(els.guideBody.querySelectorAll('[data-n]'), function (el) {
      el.classList.toggle('hl', el.getAttribute('data-n') === n);
    });
  }
  els.guideBody.addEventListener('mouseover', function (e) {
    var t = e.target.closest('[data-n]');
    guideHighlight(t ? t.getAttribute('data-n') : null);
  });
  els.guideBody.addEventListener('click', function (e) {
    var t = e.target.closest('.gbadge, .num-inline');
    if (!t) return;
    var li = els.guideBody.querySelector('li[data-n="' + t.getAttribute('data-n') + '"]');
    guideHighlight(t.getAttribute('data-n'));
    if (li) li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  els.btnGuide.addEventListener('click', function () { renderGuide(); openDialog(els.guideDialog); });

  function openDialog(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  Array.prototype.forEach.call(document.querySelectorAll('dialog.modal'), function (dlg) {
    dlg.querySelector('[data-close]').addEventListener('click', function () { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); });
    // Pencerenin dışına (karartılmış alana) tıklayınca kapanır
    dlg.addEventListener('click', function (e) { if (e.target === dlg && dlg.close) dlg.close(); });
  });
