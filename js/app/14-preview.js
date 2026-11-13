/* BIÇKIN — Önizleme (200px) / preview. Telif © 2026 BIÇKIN. */
  // ------------------------------------------------------------------
  // Önizleme (tam resim, 200px)
  // ------------------------------------------------------------------
  function renderPreview(rebuild) {
    var cv = els.preview, d = sizeCanvas(cv), ctx = cv.getContext('2d');
    if (!data) { drawPlaceholder(ctx, d, L('ph.preview')); return; }
    var b = data.bounds, pad = 10;
    var s = Math.min((d.w - 2 * pad) / b.w, (d.h - 2 * pad) / b.h);
    var ox = (d.w - b.w * s) / 2, oy = (d.h + b.h * s) / 2;
    if (rebuild || !previewCache || previewCache.width !== cv.width || previewCache.height !== cv.height) {
      previewCache = document.createElement('canvas');
      previewCache.width = cv.width; previewCache.height = cv.height;
      var c2 = previewCache.getContext('2d');
      c2.setTransform(d.dpr, 0, 0, d.dpr, 0, 0);
      c2.fillStyle = '#1d2128'; c2.fillRect(0, 0, d.w, d.h);
      worldTransform(c2, d.dpr, s, ox, oy);
      drawScene(c2, s, { grid: false, ghostWidth: 1 });
    }
    previewView = { s: s, ox: ox, oy: oy };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(previewCache, 0, 0);
    worldTransform(ctx, d.dpr, s, ox, oy);
    var k = knifePos();
    drawDone(ctx, s, 1.3, k);

    // Simülasyon penceresinin önizlemedeki karşılığı
    ctx.setTransform(d.dpr, 0, 0, d.dpr, 0, 0);
    var sd = { w: els.sim.clientWidth, h: els.sim.clientHeight };
    var vw = sd.w / cam.s * s, vh = sd.h / cam.s * s;
    var vx = ox + cam.x * s - vw / 2, vy = oy - cam.y * s - vh / 2;
    if (vw < b.w * s * 0.98 || vh < b.h * s * 0.98) {
      ctx.strokeStyle = COLORS.viewport; ctx.lineWidth = 1.5;
      ctx.strokeRect(vx, vy, vw, vh);
    }
    if (k && sim.started) {
      ctx.beginPath(); ctx.arc(ox + k.x * s, oy - k.y * s, 4, 0, Math.PI * 2);
      ctx.fillStyle = k.down && !sim.finished ? (toolFmt() ? toolColor(k.seg.tool) : COLORS.knifeDown) : COLORS.knifeUp; ctx.fill();
    }
  }

  els.preview.addEventListener('click', function (e) {
    if (!data) return;
    var r = els.preview.getBoundingClientRect();
    cam.x = (e.clientX - r.left - previewView.ox) / previewView.s;
    cam.y = (previewView.oy - (e.clientY - r.top)) / previewView.s;
    if (sim.running && els.follow.checked) { els.follow.checked = false; log('info', L('follow.offPreview')); }
    clampCam(); renderSim(); renderPreview();
  });
