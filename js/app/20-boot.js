/* BIÇKIN — Geri bildirim ve başlatma / feedback & bootstrap. Telif © 2026 Hüseyin BIÇKIN. */
  // ------------------------------------------------------------------
  // Geri bildirim → GitHub Issues
  // ------------------------------------------------------------------
  els.btnFeedback.addEventListener('click', function () {
    els.fbErr.textContent = '';
    if (typeof els.fbDialog.showModal === 'function') els.fbDialog.showModal();
    else els.fbDialog.setAttribute('open', '');
    els.fbTitle.focus();
  });
  els.fbTitle.addEventListener('input', function () { els.fbErr.textContent = ''; });
  els.fbCancel.addEventListener('click', function () { els.fbDialog.close ? els.fbDialog.close() : els.fbDialog.removeAttribute('open'); });
  els.fbSend.addEventListener('click', function () {
    var title = els.fbTitle.value.trim();
    if (!title) { els.fbErr.textContent = L('fb.needTitle'); els.fbTitle.focus(); return; }
    var url = feedbackUrl(els.fbType.value, title, els.fbBody.value.trim(), els.fbDiag.checked);
    // Kullanıcı tıklamasıyla açılan bağlantı açılır pencere engelleyicisine takılmaz
    var link = document.createElement('a');
    link.href = url; link.target = '_blank'; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
    log('ok', L('fb.opened'));
    els.fbTitle.value = ''; els.fbBody.value = '';
    if (els.fbDialog.close) els.fbDialog.close(); else els.fbDialog.removeAttribute('open');
  });

  // GitHub "yeni issue" adresi: başlık, gövde ve etiket önceden doldurulur
  function feedbackUrl(type, title, desc, withDiag) {
    var MAX_BODY = 6000;
    var body = '### ' + L('fb.h.desc') + '\n\n' + (desc || '-') + '\n';
    if (withDiag) {
      var rows = Array.prototype.slice.call(els.log.querySelectorAll('.row'), -15)
        .map(function (r) { return r.textContent; });
      body += '\n### ' + L('fb.h.diag') + '\n\n' +
        '- ' + L('fb.k.file') + ': ' + (data ? els.fileName.textContent : '—') + '\n' +
        '- ' + L('fb.k.format') + ': ' + (data ? ({ plt: 'HPGL (PLT)', dxf: 'DXF', cut: 'Gerber (CUT)' }[data.format] + (data.nested ? ' + nesting' : '')) : '—') + '\n' +
        '- ' + L('fb.k.lang') + ': ' + lang + '\n' +
        '- ' + L('fb.k.browser') + ': ' + navigator.userAgent + '\n' +
        '- ' + L('fb.k.page') + ': ' + location.href.split('#')[0].split('?')[0] + '\n' +
        '\n<details><summary>' + L('fb.h.log') + '</summary>\n\n```\n' + rows.join('\n') + '\n```\n</details>\n';
    }
    if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY) + '\n\n' + L('fb.truncated');
    var prefix = { bug: '[Hata/Bug] ', enhancement: '[İstek/Request] ', question: '[Soru/Question] ' }[type] || '';
    return 'https://github.com/' + FEEDBACK_REPO + '/issues/new?' +
      'title=' + encodeURIComponent(prefix + title) +
      '&body=' + encodeURIComponent(body) +
      '&labels=' + encodeURIComponent(type);
  }

  applyLang();
  renderPreview(); renderSim(); updateButtons();
  log('info', L('ready'));
  log('info', L('copyright'));

  // Test ve konsol kullanımı için
  window.CutSim = { parseCut: parseCut, parsePlt: parsePlt, parseDxf: parseDxf, nestData: nestData, feedbackUrl: feedbackUrl, load: function (text, name) {
    var res = isDxf(text, name) ? parseDxf(text) : isPlt(text, name) ? parsePlt(text) : parseCut(text);
    res.warnings.forEach(function (w) { log('warn', w); });
    if (res.errors.length) { res.errors.forEach(function (e) { log('error', e); }); setData(null); return res; }
    els.fileName.textContent = name || 'test';
    setData(res); return res;
  } };
