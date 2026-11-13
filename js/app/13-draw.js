/* BIÇKIN — Çizim yardımcıları / canvas drawing helpers. Telif © 2026 Hüseyin BIÇKIN. */
  // ------------------------------------------------------------------
  // Çizim yardımcıları
  // ------------------------------------------------------------------
  function sizeCanvas(cv) {
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    return { w: w, h: h, dpr: dpr };
  }

  function drawPlaceholder(ctx, d, text) {
    ctx.setTransform(d.dpr, 0, 0, d.dpr, 0, 0);
    ctx.fillStyle = '#1d2128'; ctx.fillRect(0, 0, d.w, d.h);
    ctx.fillStyle = '#9aa3b2'; ctx.font = '14px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, d.w / 2, d.h / 2);
  }

  // Dünya (pastal birimi) → ekran dönüşümü; Y ekseni yukarı
  function worldTransform(ctx, dpr, s, ox, oy) {
    ctx.setTransform(dpr * s, 0, 0, -dpr * s, dpr * ox, dpr * oy);
  }

  function drawScene(ctx, s, opts) {
    var b = data.bounds;
    ctx.fillStyle = COLORS.fabric; ctx.fillRect(0, 0, b.w, b.h);
    ctx.lineWidth = 1 / s; ctx.strokeStyle = COLORS.fabricEdge; ctx.strokeRect(0, 0, b.w, b.h);

    if (opts.grid) {
      var step = 100 / data.unitMm;               // 10 cm
      if (step * s < 25) step *= 10;              // 1 m
      if (step * s >= 12) {
        ctx.beginPath();
        for (var gx = step; gx < b.w; gx += step) { ctx.moveTo(gx, 0); ctx.lineTo(gx, b.h); }
        for (var gy = step; gy < b.h; gy += step) { ctx.moveTo(0, gy); ctx.lineTo(b.w, gy); }
        ctx.strokeStyle = COLORS.grid; ctx.stroke();
      }
    }

    Object.keys(paths.fills).forEach(function (id) {
      var p = data.pieces[id];
      ctx.fillStyle = p && p.color ? 'rgba(' + p.color.join(',') + ',.35)' : COLORS.pieceFill;
      ctx.fill(paths.fills[id]);
    });
    if (opts.currentPiece != null && paths.fills[opts.currentPiece]) {
      ctx.fillStyle = COLORS.current; ctx.fill(paths.fills[opts.currentPiece]);
    }

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = opts.ghostWidth / s;
    if (toolFmt()) {
      // Henüz yapılmamış yollar araç renginde, soluk
      ctx.globalAlpha = 0.45;
      Object.keys(paths.tools).forEach(function (t) { ctx.strokeStyle = toolColor(Number(t)); ctx.stroke(paths.tools[t]); });
      ctx.globalAlpha = 1;
      return;
    }
    ctx.strokeStyle = COLORS.ghost; ctx.stroke(paths.ghost); ctx.stroke(paths.notch);
  }

  // DXF parça yazıları ekranda okunabilir boyuttaysa (≥ 5 px) dosyanın kendi yazıları gösterilir
  function dxfTextVisible(s) {
    var l = data.labels && data.labels[0];
    return !!l && l.h * s >= 5;
  }

  // PLT etiketleri (LB): araç renginde, DI yönü, SI boyu ve LO hizalamasıyla; ekran koordinatlarında
  function drawPltLabels(ctx, d, s, ox, oy) {
    var aligns = ['left', 'center', 'right'], bases = ['bottom', 'middle', 'top'];
    data.labels.forEach(function (l) {
      var px = l.h * s;
      if (px < 5) return;
      var sx = ox + l.x * s, sy = oy - l.y * s;
      if (sx < -2000 || sx > d.w + 2000 || sy < -200 || sy > d.h + 200) return;
      var lo = l.lo || 1;
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(-l.ang);
      ctx.font = '600 ' + (px * 1.35).toFixed(1) + 'px "Segoe UI", sans-serif';
      ctx.textAlign = aligns[Math.floor((lo - 1) / 3)] || 'left';
      ctx.textBaseline = bases[(lo - 1) % 3] || 'bottom';
      ctx.fillStyle = toolColor(l.tool);
      ctx.fillText(l.text, 0, 0);
      ctx.restore();
    });
  }

  function drawDone(ctx, s, cutWidth, k) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([6 / s, 5 / s]);
    ctx.lineWidth = 1 / s; ctx.strokeStyle = COLORS.move; ctx.stroke(done.move);
    ctx.setLineDash([]);
    ctx.lineWidth = cutWidth / s;
    ctx.strokeStyle = COLORS.cut; ctx.stroke(done.cut);
    ctx.strokeStyle = COLORS.notch; ctx.stroke(done.notch);
    Object.keys(done.tools).forEach(function (t) { ctx.strokeStyle = toolColor(Number(t)); ctx.stroke(done.tools[t]); });
    // Yarım kalan aktif hareket
    if (k && !sim.finished && (sim.pos > 0)) {
      var sg = k.seg;
      ctx.beginPath(); ctx.moveTo(sg.x0, sg.y0); ctx.lineTo(k.x, k.y);
      if (sg.type === 'move') { ctx.setLineDash([6 / s, 5 / s]); ctx.lineWidth = 1 / s; ctx.strokeStyle = COLORS.move; }
      else {
        ctx.lineWidth = cutWidth / s;
        ctx.strokeStyle = toolFmt() ? toolColor(sg.tool) : sg.type === 'notch' ? COLORS.notch : COLORS.cut;
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
  }
