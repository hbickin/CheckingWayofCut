/* BIÇKIN — Veri yerleştirme, pastal bilgisi, yollar / data & paths. Telif © 2026 BIÇKIN. */
  var source = null;
  function setData(res) {
    source = res;
    nestSel = {};
    buildNestList();
    showData(res);
  }

  function showData(res) {
    data = res;
    sim = newSim();
    paths = null; done = null; previewCache = null;
    if (data) {
      buildPaths();
      els.startPiece.value = '';
      fillPieceSelect();
      els.onlyPiece.checked = false;
      prepareSim();
      fitView();
    }
    renderMarkerInfo();
    if (!data) fillPieceSelect();
    buildToolList();
    updateButtons();
    updateStatus();
    renderPreview(true);
    renderSim();
  }

  function renderMarkerInfo() {
    if (!data) { els.markerInfo.textContent = '—'; return; }
    (function () {
      var i = data.info, b = data.bounds;
      var bits = [];
      if (i['Marker Name']) bits.push('<b>' + esc(i['Marker Name']) + '</b>');
      bits.push(L('m.length') + ': <b>' + fmtLen(data.nested ? data.nestStats.len : b.w) + '</b>');
      bits.push(L('m.width') + ': <b>' + fmtLen(b.h) + '</b>');
      if (data.nested) {
        bits.unshift('<span class="badge">' + L('nest.badge') + '</span>');
        bits.push(L('m.pieces') + ': <b>' + data.nestStats.count + '</b>');
        bits.push(L('nest.util') + ': <b>' + (lang === 'tr' ? '%' + num(data.nestStats.util, 1) : num(data.nestStats.util, 1) + '%') + '</b>');
        els.markerInfo.innerHTML = bits.join(' &nbsp;·&nbsp; ');
        return;
      }
      if (data.format === 'plt') {
        bits.push(L('m.format') + ': <b>HPGL (PLT)</b>');
        bits.push(L('m.paths') + ': <b>' + data.pieceOrder.length + '</b>');
      } else if (data.format === 'dxf') {
        bits.push(L('m.format') + ': <b>DXF</b>');
        bits.push(L('m.pieces') + ': <b>' + data.pieceOrder.filter(function (id) { return data.pieces[id].closed; }).length + '</b>');
      } else {
        bits.push(L('m.pieces') + ': <b>' + data.pieceOrder.length + '</b>');
      }
      var util = i['MARKER UTILTIZATION'] || i['MARKER UTILIZATION'];
      if (util) bits.push(L('m.util') + ': <b>' + (lang === 'tr' ? '%' + esc(util) : esc(util) + '%') + '</b>');
      if (i['CUT GEN DATE']) bits.push(L('m.date') + ': <b>' + esc(i['CUT GEN DATE']) + '</b>');
      els.markerInfo.innerHTML = bits.join(' &nbsp;·&nbsp; ');
    })();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  function buildPaths() {
    paths = { ghost: new Path2D(), notch: new Path2D(), fills: {}, tools: {} };
    var lastPiece = null, poly = null;
    var plt = toolFmt();
    data.segments.forEach(function (s) {
      if (s.type === 'move') return;
      if (plt) {
        // PLT: her araç kendi rengiyle; yalnızca kapalı konturlar doldurulur
        var tp = paths.tools[s.tool] || (paths.tools[s.tool] = new Path2D());
        tp.moveTo(s.x0, s.y0); tp.lineTo(s.x1, s.y1);
        if (!data.pieces[s.piece] || !data.pieces[s.piece].closed) return;
        if (s.piece !== lastPiece) { poly = paths.fills[s.piece] = new Path2D(); lastPiece = s.piece; poly.moveTo(s.x0, s.y0); }
        poly.lineTo(s.x1, s.y1);
        return;
      }
      var target = s.type === 'notch' ? paths.notch : paths.ghost;
      target.moveTo(s.x0, s.y0); target.lineTo(s.x1, s.y1);
      // Parça dolgusu: çentik uçlarını atlayıp kontur noktalarını tek çokgende birleştir
      if (s.type === 'notch') return;
      if (s.piece !== lastPiece) { poly = paths.fills[s.piece] = new Path2D(); lastPiece = s.piece; poly.moveTo(s.x0, s.y0); }
      poly.lineTo(s.x1, s.y1);
    });
    buildDirections();
  }

  // Her parça için kesim yönü (saat yönü / tersi), başlangıç noktası ve
  // kontur boyunca eşit aralıklı yön ikonu adayları
  function buildDirections() {
    var step = ARROW_STEP_MM / data.unitMm;
    var acc = {};
    data.segments.forEach(function (s) {
      if (s.type !== 'cut') return;
      var p = data.pieces[s.piece];
      if (!p) return;
      var a = acc[s.piece];
      if (!a) {
        a = acc[s.piece] = { area: 0, next: step / 2, dist: 0 };
        p.start = { x: s.x0, y: s.y0 };
        p.arrows = [];
      }
      a.area += s.x0 * s.y1 - s.x1 * s.y0;
      var ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
      while (a.next <= a.dist + s.len) {
        var k = (a.next - a.dist) / s.len;
        p.arrows.push({ x: s.x0 + (s.x1 - s.x0) * k, y: s.y0 + (s.y1 - s.y0) * k, a: ang });
        a.next += step;
      }
      a.dist += s.len;
    });
    Object.keys(acc).forEach(function (id) {
      var p = data.pieces[id];
      // Y ekseni yukarı: pozitif alan = saat yönü tersi. PLT'de kapalı olmayan yol "açık" sayılır.
      p.dir = p.closed === false ? 'open' : acc[id].area > 0 ? 'ccw' : 'cw';
      p.perimeter = acc[id].dist;
    });
  }

  function dirText(p) {
    return p && p.dir ? L('dir.' + p.dir) : '';
  }

  // Parça konturlarına yön ikonlarını (>) ve başlangıç noktasını (●) çizer; ekran koordinatlarında
  function drawDirections(ctx, d, s, ox, oy) {
    var stepPx = ARROW_STEP_MM / data.unitMm * s;
    var every = Math.max(1, Math.ceil(ARROW_GAP_PX / stepPx));
    var r = Math.max(3, Math.min(6, s * 20));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    data.pieceOrder.forEach(function (id) {
      var p = data.pieces[id];
      if (!p.arrows || !isFinite(p.minX)) return;
      if (ox + p.maxX * s < -20 || ox + p.minX * s > d.w + 20 || oy - p.minY * s < -20 || oy - p.maxY * s > d.h + 20) return;
      if (p.perimeter * s < 40) return;
      var n = p.arrows.length;
      var list = [];
      if (n <= every) { if (n) list.push(p.arrows[Math.floor(n / 2)]); }
      else for (var i = Math.floor(every / 2); i < n; i += every) list.push(p.arrows[i]);
      ctx.strokeStyle = p.dir === 'cw' ? COLORS.dirCw : p.dir === 'ccw' ? COLORS.dirCcw : COLORS.dirOpen;
      ctx.lineWidth = 2;
      ctx.beginPath();
      list.forEach(function (ar) {
        var sx = ox + ar.x * s, sy = oy - ar.y * s;
        if (sx < -10 || sx > d.w + 10 || sy < -10 || sy > d.h + 10) return;
        // Dünya açısı ekranda Y ters çevrildiği için -a olur
        var c = Math.cos(-ar.a), sn = Math.sin(-ar.a);
        var pt = function (u, v) { return [sx + u * c - v * sn, sy + u * sn + v * c]; };
        var a1 = pt(-r * 0.6, -r), a2 = pt(r * 0.6, 0), a3 = pt(-r * 0.6, r);
        ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); ctx.lineTo(a3[0], a3[1]);
      });
      ctx.stroke();
      // Başlangıç noktası: kara ikon
      var bx = ox + p.start.x * s, by = oy - p.start.y * s;
      ctx.beginPath(); ctx.arc(bx, by, r * 0.8 + 1, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.start; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    });
  }

  function resetDone() {
    done = { cut: new Path2D(), notch: new Path2D(), move: new Path2D(), tools: {} };
  }
  function appendDone(s) {
    var p = toolFmt() && s.type !== 'move'
      ? (done.tools[s.tool] || (done.tools[s.tool] = new Path2D()))
      : done[s.type];
    p.moveTo(s.x0, s.y0); p.lineTo(s.x1, s.y1);
  }
