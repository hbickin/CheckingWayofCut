/* BIÇKIN — Parça seçimi ve nesting / piece selection & nesting. Telif © 2026 BIÇKIN. */
  // ------------------------------------------------------------------
  // Parça seçimi ve nesting
  // ------------------------------------------------------------------
  var NEST_GAP_MM = 3;        // parçalar arası boşluk
  var NEST_ROW_MM = 5;        // yerleştirme ızgarasının satır yüksekliği
  var nestSel = {};
  var toolFmt = function () { return data && data.format !== 'cut'; };

  // Yerleştirilebilir birimler: kapalı kontur (CUT'ta her parça) + içindeki açık çizgiler ve yazılar
  function unitsOf(src) {
    if (src._units) return src._units;
    var units = [], byId = {};
    src.pieceOrder.forEach(function (id) {
      var p = src.pieces[id];
      if (p.firstSeg < 0 || (src.format !== 'cut' && !p.closed)) return;
      var poly = [];
      for (var i = p.firstSeg; i <= p.lastSeg; i++) {
        var sg = src.segments[i];
        if (sg.piece !== p.id || sg.type !== 'cut') continue;
        if (!poly.length) poly.push([sg.x0, sg.y0]);
        poly.push([sg.x1, sg.y1]);
      }
      if (poly.length < 3) return;
      var u = { id: p.id, poly: poly, members: [p.id], labels: [], area: Math.abs(polyArea(poly)),
        minX: p.minX, maxX: p.maxX, minY: p.minY, maxY: p.maxY };
      units.push(u); byId[p.id] = u;
    });
    // Başka bir konturun içinde kalan kapalı konturlar (delik, düğme yeri vb.) o parçanın üyesidir
    if (src.format !== 'cut') {
      var bySize = units.slice().sort(function (a, b) { return b.area - a.area; });
      var inner = {};
      bySize.forEach(function (u, i) {
        for (var j = 0; j < i; j++) {
          var v = bySize[j];
          if (inner[v.id] || v.area <= u.area) continue;
          if (u.minX >= v.minX && u.maxX <= v.maxX && u.minY >= v.minY && u.maxY <= v.maxY && pointInPoly(u.poly[0][0], u.poly[0][1], v.poly)) {
            v.members.push(u.id); inner[u.id] = 1; break;
          }
        }
      });
      units = units.filter(function (u) { return !inner[u.id]; });
      Object.keys(inner).forEach(function (id) { byId[id] = byId[id] || true; });
    }
    function host(x, y) {
      for (var c = 0; c < units.length; c++) {
        var u = units[c];
        if (x >= u.minX && x <= u.maxX && y >= u.minY && y <= u.maxY && pointInPoly(x, y, u.poly)) return u;
      }
      return null;
    }
    if (src.format !== 'cut') src.pieceOrder.forEach(function (id) {
      var p = src.pieces[id];
      if (byId[id] || p.firstSeg < 0) return;
      var sg = src.segments[p.firstSeg], h = host((sg.x0 + sg.x1) / 2, (sg.y0 + sg.y1) / 2);
      if (h) h.members.push(p.id);
    });
    (src.labels || []).forEach(function (l, li) { var h = host(l.x, l.y); if (h) h.labels.push(li); });
    src._units = units;
    return units;
  }

  // Satır profili: her satırda parçanın en sol / en sağ x'i (yerel koordinat, sol alt köşe 0,0)
  function rowProfile(poly, rowU) {
    var minX = Infinity, minY = Infinity, maxY = -Infinity;
    poly.forEach(function (q) { minX = Math.min(minX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); });
    var rows = Math.max(1, Math.ceil((maxY - minY) / rowU - 1e-9));
    var Lp = new Float64Array(rows).fill(Infinity), Rp = new Float64Array(rows).fill(-Infinity);
    function upd(r, xv) { if (r < 0) r = 0; if (r >= rows) r = rows - 1; if (xv < Lp[r]) Lp[r] = xv; if (xv > Rp[r]) Rp[r] = xv; }
    for (var i = 0; i < poly.length - 1; i++) {
      var ax = poly[i][0] - minX, ay = poly[i][1] - minY, bx = poly[i + 1][0] - minX, by = poly[i + 1][1] - minY;
      var r0 = Math.floor(Math.min(ay, by) / rowU), r1 = Math.floor(Math.max(ay, by) / rowU);
      upd(Math.floor(ay / rowU), ax); upd(Math.floor(by / rowU), bx);
      for (var r = r0; r <= r1; r++) {
        var lo = Math.max(r * rowU, Math.min(ay, by)), hi = Math.min((r + 1) * rowU, Math.max(ay, by));
        if (ay === by) continue;
        upd(r, ax + (bx - ax) * (lo - ay) / (by - ay));
        upd(r, ax + (bx - ax) * (hi - ay) / (by - ay));
      }
    }
    for (var r2 = 0; r2 < rows; r2++) if (!isFinite(Lp[r2])) { Lp[r2] = Infinity; Rp[r2] = -Infinity; }
    return { rows: rows, L: Lp, R: Rp, minX: minX, minY: minY };
  }

  // Sol-alt "kaydırma" yerleşimi: her parça kumaş eni boyunca en solda duracağı satıra konur
  function nestData(src, ids, allowRotate) {
    var t0 = performance.now();
    var unitMm = src.unitMm, rowU = NEST_ROW_MM / unitMm, gap = NEST_GAP_MM / unitMm;
    var H = src.bounds.h, nRows = Math.max(1, Math.floor(H / rowU));
    var frontier = new Float64Array(nRows);
    var byId = {};
    unitsOf(src).forEach(function (u) { byId[u.id] = u; });
    var units = ids.map(function (id) { return byId[id]; }).filter(Boolean)
      .sort(function (a, b) { return b.area - a.area; });
    var warnings = [];

    var placed = units.map(function (u) {
      var cx = (u.minX + u.maxX) / 2, cy = (u.minY + u.maxY) / 2;
      var best = null;
      (allowRotate ? [false, true] : [false]).forEach(function (rot) {
        var poly = rot ? u.poly.map(function (q) { return [2 * cx - q[0], 2 * cy - q[1]]; }) : u.poly;
        var pf = rowProfile(poly, rowU);
        var span = Math.min(pf.rows, nRows), maxB = Math.max(0, nRows - pf.rows);
        for (var b = 0; b <= maxB; b++) {
          var x = 0;
          for (var r = 0; r < span; r++) {
            if (!isFinite(pf.L[r])) continue;
            var f = frontier[b + r];
            var need = (f > 0 ? f + gap : 0) - pf.L[r];
            if (need > x) x = need;
          }
          if (!best || x < best.x - 1e-6) best = { x: x, b: b, rot: rot, pf: pf, span: span };
        }
      });
      if (best.pf.rows > nRows) warnings.push(L('nest.oversize', { piece: pieceLabel(src.pieces[u.id]), width: fmtLenU(H, unitMm) }));
      for (var r = 0; r < best.span; r++) {
        if (!isFinite(best.pf.R[r])) continue;
        var nr = best.b + r;
        frontier[nr] = Math.max(frontier[nr], best.x + best.pf.R[r]);
      }
      // Dünya dönüşümü: (çevir) → yerel (min 0,0) → yerleşim
      var dx = best.x - best.pf.minX, dy = best.b * rowU - best.pf.minY;
      var tf = best.rot
        ? function (x, y) { return [2 * cx - x + dx, 2 * cy - y + dy]; }
        : function (x, y) { return [x + dx, y + dy]; };
      return { u: u, tf: tf, rot: best.rot, x: best.x, y: best.b * rowU };
    });

    // Kesim sırası: soldan sağa, aşağıdan yukarı
    placed.sort(function (a, b) { return a.x - b.x || a.y - b.y; });

    var nd = {
      format: src.format, nested: true, segments: [], pieces: {}, pieceOrder: [], info: Object.assign({}, src.info),
      bounds: null, message: '', unitMm: unitMm, warnings: [], errors: [], ended: true, labels: [], tools: {}, header: src.header || []
    };
    var px = 0, py = 0, used = 0, area = 0;
    placed.forEach(function (pl) {
      area += pl.u.area;
      var members = {};
      pl.u.members.forEach(function (id) {
        members[id] = 1;
        var p = src.pieces[id];
        nd.pieces[id] = { id: id, num: p.num, code: p.code, tool: p.tool, attrs: p.attrs, color: p.color, closed: p.closed,
          minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, cutLen: 0, firstSeg: -1, lastSeg: -1 };
        nd.pieceOrder.push(id);
        if (p.tool) nd.tools[p.tool] = (nd.tools[p.tool] || 0) + 1;
      });
      for (var i = 0; i < src.segments.length; i++) {
        var sg = src.segments[i];
        if (!members[sg.piece] || sg.type === 'move') continue;
        var a = pl.tf(sg.x0, sg.y0), b = pl.tf(sg.x1, sg.y1);
        if (Math.abs(a[0] - px) > 1e-6 || Math.abs(a[1] - py) > 1e-6) {
          nd.segments.push({ x0: px, y0: py, x1: a[0], y1: a[1], len: Math.hypot(a[0] - px, a[1] - py), type: 'move', piece: sg.piece, tool: sg.tool });
        }
        nd.segments.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], len: sg.len, type: sg.type, piece: sg.piece, tool: sg.tool });
        var np = nd.pieces[sg.piece];
        np.minX = Math.min(np.minX, a[0], b[0]); np.maxX = Math.max(np.maxX, a[0], b[0]);
        np.minY = Math.min(np.minY, a[1], b[1]); np.maxY = Math.max(np.maxY, a[1], b[1]);
        if (sg.type === 'cut') np.cutLen += sg.len;
        if (np.firstSeg < 0) np.firstSeg = nd.segments.length - 1;
        np.lastSeg = nd.segments.length - 1;
        used = Math.max(used, a[0], b[0]);
        px = b[0]; py = b[1];
      }
      pl.u.labels.forEach(function (li) {
        var l = src.labels[li], q = pl.tf(l.x, l.y);
        nd.labels.push({ x: q[0], y: q[1], text: l.text, h: l.h, lo: l.lo, tool: l.tool, ang: l.ang + (pl.rot ? Math.PI : 0) });
      });
    });
    var margin = 20 / unitMm;
    nd.bounds = { w: used + margin, h: H };
    nd.nestStats = { count: placed.length, len: used, util: used > 0 ? area / (used * H) * 100 : 0, ms: performance.now() - t0 };
    nd.warnings = warnings;
    return nd;
  }
  function fmtLenU(units, unitMm) {
    var cm = units * unitMm / 10;
    return cm >= 100 ? num(cm / 100, 2) + ' m' : num(cm, 1) + ' cm';
  }

  function buildNestList() {
    els.nestList.innerHTML = '';
    els.btnPieces.disabled = !source;
    updateNestCount();
    if (!source) { els.nestPanel.hidden = true; return; }
    unitsOf(source).forEach(function (u) {
      var lab = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = u.id; cb.checked = !!nestSel[u.id];
      cb.addEventListener('change', function () { if (cb.checked) nestSel[u.id] = true; else delete nestSel[u.id]; scheduleNest(); });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(pieceLabel(source.pieces[u.id])));
      els.nestList.appendChild(lab);
    });
  }
  function updateNestCount() {
    var n = Object.keys(nestSel).length;
    els.nestCount.textContent = n ? '(' + n + ')' : '';
  }
  var nestTimer = null;
  function scheduleNest() {
    updateNestCount();
    clearTimeout(nestTimer);
    nestTimer = setTimeout(applyNest, 250);
  }
  function applyNest() {
    if (!source) return;
    var ids = unitsOf(source).map(function (u) { return u.id; }).filter(function (id) { return nestSel[id]; });
    sim.running = false;
    if (ids.length >= 2) {
      var nd = nestData(source, ids, els.nestRotate.checked);
      nd.warnings.forEach(function (w) { log('warn', w); });
      showData(nd);
      log('ok', L('nest.done', { n: nd.nestStats.count, len: fmtLen(nd.nestStats.len), width: fmtLen(nd.bounds.h),
        util: num(nd.nestStats.util, 1), ms: Math.round(nd.nestStats.ms) }));
    } else {
      var wasNested = data && data.nested;
      if (wasNested || ids.length === 1) showData(source);
      if (ids.length === 1) {
        els.startPiece.value = String(ids[0]); els.onlyPiece.checked = true;
        log('info', L('nest.single', { piece: pieceLabel(source.pieces[ids[0]]) }));
        onRangeChange();
      } else if (wasNested) log('info', L('nest.back'));
    }
  }
  els.btnPieces.addEventListener('click', function (e) {
    e.stopPropagation();
    els.nestPanel.hidden = !els.nestPanel.hidden;
  });
  els.nestPanel.addEventListener('click', function (e) { e.stopPropagation(); });
  document.addEventListener('click', function () { els.nestPanel.hidden = true; });
  els.nestAll.addEventListener('click', function () {
    if (!source) return;
    unitsOf(source).forEach(function (u) { nestSel[u.id] = true; });
    buildNestList(); scheduleNest();
  });
  els.nestNone.addEventListener('click', function () { nestSel = {}; buildNestList(); scheduleNest(); });
  els.nestRotate.addEventListener('change', function () { if (Object.keys(nestSel).length >= 2) scheduleNest(); });
