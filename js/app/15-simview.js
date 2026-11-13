/* BIÇKIN — Simülasyon görünümü ve fare / sim view & mouse. Telif © 2026 Hüseyin BIÇKIN. */
  // ------------------------------------------------------------------
  // Simülasyon görünümü
  // ------------------------------------------------------------------
  function fitView() {
    if (!data) return;
    var w = els.sim.clientWidth || 800, h = els.sim.clientHeight || 400, b = data.bounds;
    // Kumaş eni ekranın yüksekliğine sığsın; pastal kısaysa tamamı sığsın
    cam.s = (h - 30) / b.h;
    // PLT çizimleri genelde tek parça/kalıptır: tamamı ekrana sığsın
    if (data.format === 'plt' && !data.nested) cam.s = Math.min(cam.s, (w - 30) / b.w);
    cam.y = b.h / 2;
    var k = knifePos();
    cam.x = (sim.started || sim.start > 0) && k ? k.x : Math.min(b.w / 2, w / 2 / cam.s);
    clampCam();
  }
  function clampCam() {
    if (!data) return;
    var b = data.bounds, w = els.sim.clientWidth, h = els.sim.clientHeight;
    var hw = w / 2 / cam.s, hh = h / 2 / cam.s, m = 20 / cam.s;
    cam.x = b.w + 2 * m <= 2 * hw ? b.w / 2 : Math.max(hw - m, Math.min(b.w - hw + m, cam.x));
    cam.y = b.h + 2 * m <= 2 * hh ? b.h / 2 : Math.max(hh - m, Math.min(b.h - hh + m, cam.y));
  }
  function followKnife() {
    var k = knifePos();
    if (!k) return;
    cam.x += (k.x - cam.x) * 0.2;
    cam.y += (k.y - cam.y) * 0.2;
    clampCam();
  }

  function renderSim() {
    var cv = els.sim, d = sizeCanvas(cv), ctx = cv.getContext('2d');
    if (!data) { drawPlaceholder(ctx, d, L('ph.sim')); return; }
    ctx.setTransform(d.dpr, 0, 0, d.dpr, 0, 0);
    ctx.fillStyle = '#1d2128'; ctx.fillRect(0, 0, d.w, d.h);
    var s = cam.s, ox = d.w / 2 - cam.x * s, oy = d.h / 2 + cam.y * s;
    var k = knifePos();
    var active = sim.started;
    worldTransform(ctx, d.dpr, s, ox, oy);
    drawScene(ctx, s, { grid: true, ghostWidth: 1, currentPiece: active && !sim.finished && k ? k.seg.piece : null });
    drawDone(ctx, s, 2.2, k);

    // Parça etiketleri (PLT'de dosyanın kendi LB etiketleri çizilir)
    ctx.setTransform(d.dpr, 0, 0, d.dpr, 0, 0);
    var fs = Math.max(10, Math.min(14, s * 25));
    if (toolFmt()) drawPltLabels(ctx, d, s, ox, oy);
    // CUT ve DXF parçalarında ad/beden etiketi parçanın ortasına yazılır (DXF yazıları okunamayacak kadar küçükse)
    if (data.format === 'cut' || data.format === 'dxf') {
      ctx.font = fs + 'px "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.label;
      data.pieceOrder.forEach(function (id) {
        var p = data.pieces[id];
        if (!isFinite(p.minX) || p.code === 'Y') return;
        if (data.format === 'dxf' && p.attrs && dxfTextVisible(s)) return;
        var cx = ox + (p.minX + p.maxX) / 2 * s, cy = oy - (p.minY + p.maxY) / 2 * s;
        if (cx < -100 || cx > d.w + 100 || cy < -20 || cy > d.h + 20) return;
        var pw = (p.maxX - p.minX) * s;
        if (pw < 45) return;
        var a = p.attrs;
        ctx.fillText((p.code || 'N') + (p.num || id) + (a['PIECE SIZE'] ? ' · ' + a['PIECE SIZE'] : '') + (p.dir ? (p.dir === 'cw' ? ' ↻' : ' ↺') : ''), cx, cy - fs * 0.6);
        if (a['PIECE NAME'] && pw > 80) {
          ctx.globalAlpha = 0.75; ctx.fillText(a['PIECE NAME'], cx, cy + fs * 0.6); ctx.globalAlpha = 1;
        }
      });
    }

    if (els.showDir.checked) drawDirections(ctx, d, s, ox, oy);

    // Bıçak
    if (k && active) {
      var kx = ox + k.x * s, ky = oy - k.y * s;
      var down = k.down && !sim.finished;
      var col = down ? (toolFmt() ? toolColor(k.seg.tool) : COLORS.knifeDown) : COLORS.knifeUp;
      ctx.save();
      ctx.translate(kx, ky); ctx.rotate(-k.dir);
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-6, -5); ctx.lineTo(-6, 5); ctx.closePath();
      ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      ctx.restore();
      ctx.beginPath(); ctx.arc(kx, ky, down ? 5 : 8, 0, Math.PI * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
      if (down) { ctx.beginPath(); ctx.arc(kx, ky, 2.5, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }
    }

    // Ölçek göstergesi
    var barMm = [10, 50, 100, 500, 1000, 5000].find(function (mm) { return mm / data.unitMm * s >= 60; }) || 5000;
    var barPx = barMm / data.unitMm * s;
    ctx.fillStyle = 'rgba(29,33,40,.75)'; ctx.fillRect(8, d.h - 26, barPx + 70, 20);
    ctx.strokeStyle = '#e6e9ee'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, d.h - 12); ctx.lineTo(14 + barPx, d.h - 12); ctx.stroke();
    ctx.fillStyle = '#e6e9ee'; ctx.font = '11px "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(barMm >= 1000 ? barMm / 1000 + ' m' : barMm >= 10 ? barMm / 10 + ' cm' : barMm + ' mm', 20 + barPx, d.h - 15);
  }

  // Fare ile yakınlaştırma ve kaydırma
  els.sim.addEventListener('wheel', function (e) {
    if (!data) return;
    e.preventDefault();
    var r = els.sim.getBoundingClientRect();
    var mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
    var wx = cam.x + mx / cam.s, wy = cam.y - my / cam.s;
    var minS = Math.min((r.width - 30) / data.bounds.w, (r.height - 30) / data.bounds.h);
    cam.s = Math.max(minS, Math.min(50, cam.s * Math.exp(-e.deltaY * 0.0015)));
    cam.x = wx - mx / cam.s; cam.y = wy + my / cam.s;
    clampCam(); renderSim(); renderPreview();
  }, { passive: false });

  var drag = null;
  els.sim.addEventListener('pointerdown', function (e) {
    if (!data) return;
    drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    els.sim.setPointerCapture(e.pointerId);
    els.sim.classList.add('dragging');
  });
  els.sim.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved && els.follow.checked && sim.running) {
      els.follow.checked = false; log('info', L('follow.offDrag'));
    }
    drag.moved = true;
    cam.x = drag.cx - dx / cam.s; cam.y = drag.cy + dy / cam.s;
    clampCam(); renderSim(); renderPreview();
  });
  function endDrag() { drag = null; els.sim.classList.remove('dragging'); }
  els.sim.addEventListener('pointerup', endDrag);
  els.sim.addEventListener('pointercancel', endDrag);
  els.sim.addEventListener('dblclick', function () { if (data) { fitView(); renderSim(); renderPreview(); } });

  // Boşluk: başlat / duraklat
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space') return;
    // Yazı alanlarında, düğme/listelerde ve açık bir pencere (geri bildirim) varken boşluk normal çalışsın
    var tag = e.target.tagName;
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(tag) || e.target.isContentEditable) return;
    if (document.querySelector('dialog[open]')) return;
    e.preventDefault();
    if (sim.running) pauseSim(); else if (data) startSim();
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { clampCam(); renderPreview(true); renderSim(); }, 60);
  });
