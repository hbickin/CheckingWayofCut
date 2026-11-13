/* BIÇKIN — Araç renkleri (T1-T8) / tool colors. Telif © 2026 BIÇKIN. */
  // ------------------------------------------------------------------
  // Araç renkleri
  // ------------------------------------------------------------------
  var toolColors = loadToolColors();
  function loadToolColors() {
    var c = TOOL_DEFAULTS.slice();
    try {
      var saved = JSON.parse(localStorage.getItem(TOOL_STORE_KEY) || 'null');
      if (Array.isArray(saved)) saved.forEach(function (v, i) { if (i < TOOL_COUNT && /^#[0-9a-f]{6}$/i.test(v)) c[i] = v; });
    } catch (e) { /* tarayıcı depolaması kullanılamıyor */ }
    return c;
  }
  function saveToolColors() {
    try { localStorage.setItem(TOOL_STORE_KEY, JSON.stringify(toolColors)); } catch (e) { /* yok say */ }
  }
  function toolName(t) { return 'T' + t + ' ' + (t === 1 ? L('tool.pen') : t === 2 ? L('tool.knife') : L('tool.n', { n: t })); }
  function toolColor(t) { return toolColors[t - 1] || '#64748b'; }

  function buildToolList() {
    els.toolList.innerHTML = '';
    for (var t = 1; t <= TOOL_COUNT; t++) {
      var used = data && data.tools && data.tools[t];
      var lab = document.createElement('label');
      lab.className = 'tool' + (used ? ' used' : '');
      lab.title = L('tool.pick', { tool: toolName(t) });
      var inp = document.createElement('input');
      inp.type = 'color'; inp.value = toolColor(t); inp.dataset.tool = t;
      inp.addEventListener('input', onToolColor);
      inp.addEventListener('change', function (e) {
        var n = Number(e.target.dataset.tool);
        log('info', L('tool.colorSet', { tool: toolName(n), color: toolColor(n) }));
      });
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(toolName(t)));
      if (used) {
        var sm = document.createElement('small');
        sm.textContent = L('tool.paths', { n: used });
        lab.appendChild(sm);
      }
      els.toolList.appendChild(lab);
    }
  }
  function onToolColor(e) {
    var t = Number(e.target.dataset.tool);
    toolColors[t - 1] = e.target.value;
    saveToolColors();
    if (data) { renderPreview(true); renderSim(); }
  }
  els.btnToolReset.addEventListener('click', function () {
    toolColors = TOOL_DEFAULTS.slice();
    saveToolColors(); buildToolList();
    if (data) { renderPreview(true); renderSim(); }
    log('info', L('tool.resetDone'));
  });
