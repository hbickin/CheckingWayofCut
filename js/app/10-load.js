/* BIÇKIN — Dosya okuma ve birleştirme / file loading & merge. Telif © 2026 Hüseyin BIÇKIN. */
  // ------------------------------------------------------------------
  // Dosya okuma
  // ------------------------------------------------------------------
  // Birden çok dosya seçilebilir:
  //  - seçimde pastal (CUT, çerçeveli DXF ya da birden çok parçalı dosya) varsa yalnızca pastal gösterilir;
  //    birden çok pastal varsa listede en sondaki alınır,
  //  - yalnızca tek parçalık dosyalar (ör. PLT kalıpları) seçildiyse hepsi birleştirilip nesting yapılır.
  els.file.addEventListener('change', function () {
    var files = Array.prototype.slice.call(els.file.files || []);
    els.file.value = '';
    if (!files.length) return;
    stopSim(true);
    files = files.filter(function (f) {
      log('info', L('l.reading', { name: f.name, kb: num(f.size / 1024, 1) }));
      if (f.size > 50 * 1024 * 1024) { log('error', f.name + ': ' + L('l.tooBig')); return false; }
      return true;
    });
    Promise.all(files.map(readText)).then(function (texts) {
      var t0 = performance.now(), items = [], multi = files.length > 1;
      texts.forEach(function (text, i) {
        var f = files[i];
        if (text === null) return;
        var res;
        try { res = parseAny(text, f.name); }
        catch (e) { log('error', (multi ? f.name + ': ' : '') + L('l.parseErr', { msg: e.message })); return; }
        res.warnings.forEach(function (w) { log('warn', (multi ? f.name + ': ' : '') + w); });
        if (res.errors.length) {
          res.errors.forEach(function (e) { log('error', (multi ? f.name + ': ' : '') + e); });
          log('error', multi ? L('l.failedFile', { name: f.name }) : L('l.failed'));
          return;
        }
        if (res.format !== 'cut' && !res.info['Marker Name']) res.info['Marker Name'] = f.name.replace(/\.[^.]+$/, '');
        items.push({ res: res, name: f.name });
      });
      if (!items.length) { if (multi) log('error', L('l.failed')); setData(null); return; }

      var markers = items.filter(function (it) { return isMarker(it.res); });
      if (markers.length || items.length === 1) {
        var pick = markers.length ? markers[markers.length - 1] : items[0];
        if (items.length > 1) {
          log('info', L('l.pickMarker', { n: items.length, name: pick.name,
            skip: items.filter(function (it) { return it !== pick; }).map(function (it) { return it.name; }).join(', ') }));
        }
        els.fileName.textContent = pick.name; els.fileName.removeAttribute('data-i18n');
        setData(pick.res);
        logSummary(pick.res, performance.now() - t0);
        return;
      }
      var merged = mergePieceFiles(items);
      els.fileName.textContent = L('l.filesN', { n: items.length }) + ': ' + items.map(function (it) { return it.name; }).join(', ');
      els.fileName.removeAttribute('data-i18n');
      setData(merged);
      log('ok', L('l.mergeDone', { n: items.length, pieces: unitsOf(merged).length }));
      unitsOf(merged).forEach(function (u) { nestSel[u.id] = true; });
      buildNestList();
      applyNest();
    });
  });

  function readText(file) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onerror = function () {
        log('error', file.name + ': ' + L('l.readErr', { msg: reader.error ? reader.error.message : L('l.unknownErr') }));
        resolve(null);
      };
      reader.onload = function () { resolve(String(reader.result)); };
      reader.readAsText(file);
    });
  }

  function parseAny(text, name) {
    return isDxf(text, name) ? parseDxf(text) : isPlt(text, name) ? parsePlt(text) : parseCut(text);
  }

  // Pastal mı, tek parçalık kalıp dosyası mı?
  function isMarker(res) {
    if (res.format === 'cut') return true;
    if (res.format === 'dxf' && res.hasBorder) return true;
    return unitsOf(res).length > 1;
  }

  // Tek parçalık dosyaları yan yana tek bir veri setinde birleştirir (ardından nesting yapılır)
  var MERGE_FABRIC_MM = 1500;
  function mergePieceFiles(items) {
    var unitMm = Math.min.apply(null, items.map(function (it) { return it.res.unitMm; }));
    var fmt = items.every(function (it) { return it.res.format === items[0].res.format; }) ? items[0].res.format : 'dxf';
    var m = {
      format: fmt, segments: [], pieces: {}, pieceOrder: [], info: { 'Marker Name': L('l.multiName', { n: items.length }) },
      bounds: null, message: '', unitMm: unitMm, feed: null, warnings: [], errors: [], ended: true, labels: [], tools: {}, header: []
    };
    var offX = 0, maxH = 0, px = 0, py = 0, gap = 20 / unitMm;
    items.forEach(function (it, k) {
      var r = it.res, f = r.unitMm / unitMm, base = (k + 1) * 100000;
      var baseName = it.name.replace(/\.[^.]+$/, '');
      var mainIds = {};
      unitsOf(r).forEach(function (u) { mainIds[u.id] = 1; });
      r.pieceOrder.forEach(function (id) {
        var p = r.pieces[id], attrs = Object.assign({}, p.attrs);
        if (mainIds[id] && !attrs['PIECE NAME']) attrs['PIECE NAME'] = baseName;
        m.pieces[base + id] = { id: base + id, num: p.num || id, code: p.code, tool: p.tool, attrs: attrs, color: p.color,
          closed: p.closed, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, cutLen: 0, firstSeg: -1, lastSeg: -1 };
        m.pieceOrder.push(base + id);
        if (p.tool) m.tools[p.tool] = (m.tools[p.tool] || 0) + 1;
      });
      r.segments.forEach(function (sg) {
        if (sg.type === 'move') return;
        var x0 = sg.x0 * f + offX, y0 = sg.y0 * f, x1 = sg.x1 * f + offX, y1 = sg.y1 * f, pid = base + sg.piece;
        if (Math.abs(x0 - px) > 1e-6 || Math.abs(y0 - py) > 1e-6) {
          m.segments.push({ x0: px, y0: py, x1: x0, y1: y0, len: Math.hypot(x0 - px, y0 - py), type: 'move', piece: pid, tool: sg.tool });
        }
        m.segments.push({ x0: x0, y0: y0, x1: x1, y1: y1, len: sg.len * f, type: sg.type, piece: pid, tool: sg.tool });
        var np = m.pieces[pid];
        if (np) {
          np.minX = Math.min(np.minX, x0, x1); np.maxX = Math.max(np.maxX, x0, x1);
          np.minY = Math.min(np.minY, y0, y1); np.maxY = Math.max(np.maxY, y0, y1);
          if (sg.type === 'cut') np.cutLen += sg.len * f;
          if (np.firstSeg < 0) np.firstSeg = m.segments.length - 1;
          np.lastSeg = m.segments.length - 1;
        }
        px = x1; py = y1;
      });
      (r.labels || []).forEach(function (l) {
        m.labels.push({ x: l.x * f + offX, y: l.y * f, text: l.text, h: l.h * f, lo: l.lo, tool: l.tool, ang: l.ang });
      });
      offX += r.bounds.w * f + gap;
      maxH = Math.max(maxH, r.bounds.h * f);
    });
    m.bounds = { w: offX, h: Math.max(maxH, MERGE_FABRIC_MM / unitMm) };
    return m;
  }

  function logSummary(res, ms) {
    if (res.format === 'plt') { logPltSummary(res, ms); return; }
    if (res.format === 'dxf') { logDxfSummary(res, ms); return; }
    var cutLen = 0, moveLen = 0, notches = 0;
    res.segments.forEach(function (s) {
      if (s.type === 'move') moveLen += s.len;
      else { cutLen += s.len; if (s.type === 'notch') notches++; }
    });
    log('ok', L('l.loaded', { ms: Math.round(ms), pieces: res.pieceOrder.length, moves: res.segments.length, notches: notches }));
    log('info', L('l.lengths', { cut: fmtLen(cutLen), move: fmtLen(moveLen), time: fmtTime(totalTime), speed: speedMm() }));
    if (res.message) log('info', L('l.message', { msg: res.message }));
    var cw = 0, ccw = 0;
    res.pieceOrder.forEach(function (id) { var d = res.pieces[id].dir; if (d === 'cw') cw++; else if (d === 'ccw') ccw++; });
    log('info', L('l.dirs', { cw: cw, ccw: ccw }));
  }

  function logPltSummary(res, ms) {
    var cutLen = 0, moveLen = 0, closed = 0;
    res.segments.forEach(function (s) { if (s.type === 'move') moveLen += s.len; else cutLen += s.len; });
    res.pieceOrder.forEach(function (id) { if (res.pieces[id].closed) closed++; });
    log('ok', L('l.pltLoaded', { ms: Math.round(ms), paths: res.pieceOrder.length, closed: closed,
      moves: res.segments.length, labels: res.labels.length }));
    var used = Object.keys(res.tools).map(Number).sort(function (a, b) { return a - b; });
    log('info', L('l.toolsUsed', { list: used.map(function (t) { return L('l.toolPaths', { tool: toolName(t), n: res.tools[t] }); }).join(', ') }));
    log('info', L('l.pltLengths', { cut: fmtLen(cutLen), move: fmtLen(moveLen), time: fmtTime(totalTime), speed: speedMm() }));
    res.labels.forEach(function (l) { log('info', L('l.label', { tool: toolName(l.tool), text: l.text.trim() })); });
    var cw = 0, ccw = 0, open = 0;
    res.pieceOrder.forEach(function (id) { var d = res.pieces[id].dir; if (d === 'cw') cw++; else if (d === 'ccw') ccw++; else open++; });
    log('info', L('l.pltDirs', { cw: cw, ccw: ccw, open: open }));
  }

  function logDxfSummary(res, ms) {
    var cutLen = 0, moveLen = 0, pieces = 0, lines = 0;
    res.segments.forEach(function (s) { if (s.type === 'move') moveLen += s.len; else cutLen += s.len; });
    res.pieceOrder.forEach(function (id) { if (res.pieces[id].closed) pieces++; else lines++; });
    log('ok', L('l.dxfLoaded', { ms: Math.round(ms), pieces: pieces, lines: lines, labels: res.labels.length, unit: res.unitName }));
    res.header.forEach(function (h) { log('info', L('l.dxfHeader', { text: h })); });
    log('info', L('l.pltLengths', { cut: fmtLen(cutLen), move: fmtLen(moveLen), time: fmtTime(totalTime), speed: speedMm() }));
    var cw = 0, ccw = 0, open = 0;
    res.pieceOrder.forEach(function (id) { var d = res.pieces[id].dir; if (d === 'cw') cw++; else if (d === 'ccw') ccw++; else open++; });
    log('info', L('l.pltDirs', { cw: cw, ccw: ccw, open: open }));
  }

  // Dosyadan okunan özgün veri; "data" ise ekranda gösterilen (özgün ya da nesting) veridir
