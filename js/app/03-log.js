/* BIÇKIN — İşlem günlüğü / activity log. Telif © 2026 BIÇKIN. */
  // ------------------------------------------------------------------
  // Günlük (footer)
  // ------------------------------------------------------------------
  var logCount = { warn: 0, error: 0 };
  function log(level, msg) {
    var row = document.createElement('div');
    row.className = 'row ' + level;
    var t = document.createElement('span');
    t.className = 't';
    t.textContent = new Date().toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-GB');
    var icon = { info: 'ℹ', ok: '✔', warn: '⚠', error: '✖' }[level] || '';
    row.appendChild(t);
    row.appendChild(document.createTextNode(icon + ' ' + msg));
    els.log.appendChild(row);
    els.log.scrollTop = els.log.scrollHeight;
    if (level === 'warn' || level === 'error') { logCount[level]++; updateLogCounts(); }
  }
  function updateLogCounts() {
    var parts = [];
    if (logCount.error) parts.push(L('log.errors', { n: logCount.error }));
    if (logCount.warn) parts.push(L('log.warns', { n: logCount.warn }));
    els.logCounts.textContent = parts.join(', ');
  }
  els.btnClearLog.addEventListener('click', function () {
    els.log.innerHTML = ''; logCount = { warn: 0, error: 0 }; updateLogCounts();
  });
  window.addEventListener('error', function (e) { log('error', L('unexpected', { msg: e.message })); });
