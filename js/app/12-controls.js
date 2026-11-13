/* BIÇKIN — Simülasyon kontrolleri / simulation controls. Telif © 2026 Hüseyin BIÇKIN. */
  // ------------------------------------------------------------------
  // Simülasyon kontrolü
  // ------------------------------------------------------------------
  // Seçili başlangıç parçasına göre simülasyon aralığı
  function simRange() {
    var segs = data.segments, v = els.startPiece.value;
    if (v === '') return { start: 0, end: segs.length, piece: null };
    var p = data.pieces[v];
    if (!p || p.firstSeg < 0) return { start: 0, end: segs.length, piece: null };
    // Parçaya giden boş hareket de (N komutundan sonra gelir) aynı parçaya aittir
    var start = p.firstSeg;
    while (start > 0 && segs[start - 1].piece === p.id) start--;
    return { start: start, end: els.onlyPiece.checked ? p.lastSeg + 1 : segs.length, piece: p };
  }

  function prepareSim() {
    sim = newSim();
    if (data) {
      var r = simRange();
      sim.start = sim.idx = r.start; sim.end = r.end;
      resetDone();
      computeTotalTime();
    }
  }

  function fillPieceSelect() {
    var sel = els.startPiece;
    var prev = sel.value;
    sel.innerHTML = '';
    var all = document.createElement('option');
    all.value = ''; all.textContent = L('start.all');
    sel.appendChild(all);
    if (!data) return;
    data.pieceOrder.forEach(function (id, i) {
      var p = data.pieces[id];
      if (p.firstSeg < 0) return;
      var o = document.createElement('option');
      o.value = id;
      o.textContent = (i + 1) + '. ' + pieceLabel(p);
      sel.appendChild(o);
    });
    sel.value = prev;
    if (sel.value !== prev) sel.value = '';
  }

  function onRangeChange() {
    if (!data) return;
    prepareSim();
    var r = simRange();
    if (r.piece) {
      log('info', L('r.piece', { piece: pieceLabel(r.piece), mode: L(els.onlyPiece.checked ? 'r.onlyThis' : 'r.toEnd'), time: fmtTime(totalTime) }));
      var k = knifePos();
      if (k) { cam.x = k.x; cam.y = k.y; clampCam(); }
    } else {
      log('info', L('r.all', { time: fmtTime(totalTime) }));
    }
    updateButtons(); updateStatus(); renderSim(); renderPreview();
  }
  els.startPiece.addEventListener('change', onRangeChange);
  els.showDir.addEventListener('change', function () { renderSim(); });
  els.onlyPiece.addEventListener('change', function () { if (els.startPiece.value !== '') onRangeChange(); else updateButtons(); });

  els.btnReset.addEventListener('click', function () {
    sim.running = false;
    data = null; source = null;
    els.speed.value = 500;
    els.follow.checked = true;
    els.onlyPiece.checked = false;
    els.fileName.textContent = L('file.none'); els.fileName.setAttribute('data-i18n', 'file.none');
    els.file.value = '';
    lastPieceLogged = null;
    els.log.innerHTML = ''; logCount = { warn: 0, error: 0 }; updateLogCounts();
    toolColors = TOOL_DEFAULTS.slice(); saveToolColors();
    setData(null);
    log('ok', L('reset.done'));
  });

  els.btnSim.addEventListener('click', startSim);
  els.btnPause.addEventListener('click', pauseSim);
  els.btnStop.addEventListener('click', function () { stopSim(false); });
  els.btnFit.addEventListener('click', function () { fitView(); renderSim(); renderPreview(); });

  els.speed.addEventListener('change', function () {
    if (!validSpeed()) { els.speed.value = 500; }
    if (data) {
      computeTotalTime();
      log('info', L('speed.set', { speed: speedMm(), time: fmtTime(totalTime) }));
      updateStatus();
    }
  });

  function startSim() {
    if (!data) { log('warn', L('sim.noFile')); return; }
    if (!validSpeed()) return;
    if (sim.running) return;
    if (sim.finished || !sim.started) prepareSim();
    var fresh = !sim.started;
    sim.started = true;
    sim.running = true;
    sim.lastTs = 0;
    if (fresh) {
      var r = simRange();
      log('info', L('sim.started', { speed: speedMm(),
        from: r.piece ? L(els.onlyPiece.checked ? 'sim.fromOnly' : 'sim.fromPiece', { piece: pieceLabel(r.piece) }) : '' }));
      lastPieceLogged = null;
      if (sim.idx < sim.end) onPieceChange(data.segments[sim.idx].piece);
    } else {
      log('info', L('sim.resumed', { speed: speedMm() }));
    }
    updateButtons();
    requestAnimationFrame(tick);
  }
  function pauseSim() {
    if (!sim.running) return;
    sim.running = false;
    log('info', L('sim.paused', { pct: num(progress(), 1) }));
    updateButtons();
  }
  function stopSim(silent) {
    var wasActive = sim.started;
    prepareSim();
    if (wasActive && !silent) log('info', L('sim.stopped'));
    updateButtons(); updateStatus(); renderSim(); renderPreview();
  }

  function updateButtons() {
    els.btnSim.disabled = !data || sim.running;
    els.btnSim.textContent = L(sim.finished ? 'sim.again' : sim.started ? 'sim.resume' : 'sim.start');
    els.btnPause.disabled = !sim.running;
    els.btnStop.disabled = !data || !sim.started;
    els.startPiece.disabled = !data || sim.running;
    els.onlyPiece.disabled = !data || sim.running || els.startPiece.value === '';
    els.btnFit.disabled = !data;
  }

  var lastPieceLogged = null;
  function tick(ts) {
    if (!sim.running) return;
    var dt = sim.lastTs ? Math.min((ts - sim.lastTs) / 1000, 0.1) : 0;
    sim.lastTs = ts;
    advance(dt);
    if (els.follow.checked) followKnife();
    updateStatus();
    renderSim();
    renderPreview();
    if (sim.running) requestAnimationFrame(tick);
  }

  function advance(dt) {
    var segs = data.segments;
    while (dt > 0 && sim.idx < sim.end) {
      var s = segs[sim.idx];
      var need = segTime(s, sim.pos);
      if (need <= dt) {
        dt -= need; sim.t += need;
        appendDone(s);
        sim.idx++; sim.pos = 0;
        if (sim.idx < sim.end && segs[sim.idx].piece !== s.piece) onPieceChange(segs[sim.idx].piece);
      } else {
        var unitsPerSec = speedMm() * (s.type === 'move' ? MOVE_SPEED_FACTOR : 1) / data.unitMm;
        sim.pos += dt * unitsPerSec; sim.t += dt; dt = 0;
      }
    }
    if (sim.idx >= sim.end && !sim.finished) {
      sim.finished = true; sim.running = false;
      var cut = {};
      for (var i = sim.start; i < sim.end; i++) if (segs[i].type !== 'move') cut[segs[i].piece] = 1;
      log('ok', L('sim.done', { n: Object.keys(cut).length, time: fmtTime(sim.t) }));
      updateButtons();
    }
  }

  function onPieceChange(id) {
    if (id === lastPieceLogged) return;
    lastPieceLogged = id;
    var p = data.pieces[id];
    if (!p) return;
    var plt = p.code === 'Y';
    log('info', L(plt ? (p.tool === 1 ? 'sim.pathDraw' : 'sim.pathCut') : 'sim.pieceCut', {
      i: data.pieceOrder.indexOf(id) + 1, n: data.pieceOrder.length, label: pieceLabel(p),
      dir: p.dir ? ' (' + dirText(p) + ')' : '' }));
  }

  function pieceLabel(p) {
    var a = p.attrs, parts = [(p.code || 'N') + (p.num || p.id)];
    if (p.code === 'Y') parts.push(toolName(p.tool));
    if (a['PIECE NAME']) parts.push(a['PIECE NAME']);
    if (a['PIECE SIZE']) parts.push(L('size', { s: a['PIECE SIZE'] }));
    if (a['LEFT/RIGHT']) parts.push(a['LEFT/RIGHT']);
    if (p.code === 'P' && a['BUNDLE ID']) parts.push(a['BUNDLE ID']);
    if (p.dir && p.dir !== 'open') parts.push(p.dir === 'cw' ? '↻' : '↺');
    return parts.join(' · ');
  }

  function knifePos() {
    if (!data || !data.segments.length) return null;
    var segs = data.segments;
    if (sim.idx >= sim.end) {
      var l = segs[Math.max(sim.start, sim.end - 1)];
      return { x: l.x1, y: l.y1, down: false, seg: l, dir: Math.atan2(l.y1 - l.y0, l.x1 - l.x0) };
    }
    var s = segs[sim.idx], k = s.len ? sim.pos / s.len : 0;
    return { x: s.x0 + (s.x1 - s.x0) * k, y: s.y0 + (s.y1 - s.y0) * k, down: s.type !== 'move', seg: s,
             dir: Math.atan2(s.y1 - s.y0, s.x1 - s.x0) };
  }

  function progress() {
    return totalTime ? Math.min(100, sim.t / totalTime * 100) : 0;
  }

  function updateStatus() {
    var k = data && knifePos();
    if (!k) {
      els.knifeState.textContent = L('st.knife') + ': —'; els.pos.textContent = '—'; els.pieceInfo.textContent = '—';
      els.timeInfo.textContent = '—'; els.progressBar.style.width = '0'; els.progressPct.textContent = '0%';
      els.knifeDot.style.background = '';
      return;
    }
    var active = sim.started;
    var down = active && !sim.finished && k.down;
    if (toolFmt()) {
      var t = k.seg.tool, isPen = t === 1;
      els.knifeState.textContent = toolName(t) + ': ' + L(down ? (isPen ? 'st.downDraw' : 'st.downCut') : 'st.up');
      els.knifeDot.style.background = down ? toolColor(t) : COLORS.knifeUp;
    } else {
      els.knifeState.textContent = L('st.knife') + ': ' + L(down ? (k.seg.type === 'notch' ? 'st.notch' : 'st.downCut') : 'st.up');
      els.knifeDot.style.background = down ? COLORS.knifeDown : COLORS.knifeUp;
    }
    var cm = function (u) { return num(u * data.unitMm / 10, 1); };
    els.pos.textContent = active ? 'X ' + cm(k.x) + ' cm · Y ' + cm(k.y) + ' cm' : '—';
    var p = data.pieces[k.seg.piece];
    els.pieceInfo.textContent = active && p ? (data.pieceOrder.indexOf(p.id) + 1) + '/' + data.pieceOrder.length + ' — ' + pieceLabel(p) : '—';
    els.timeInfo.textContent = fmtTime(sim.t) + ' / ' + fmtTime(totalTime);
    var pct = progress();
    els.progressBar.style.width = pct + '%';
    els.progressPct.textContent = lang === 'tr' ? '%' + num(pct, 1) : num(pct, 1) + '%';
  }
