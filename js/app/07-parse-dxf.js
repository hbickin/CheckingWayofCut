/* BIÇKIN — DXF okuyucu / DXF reader. Telif © 2026 Hüseyin BIÇKIN. */
  // ------------------------------------------------------------------
  // DXF (ASCII, R12 ve sonrası) ayrıştırıcı
  // ------------------------------------------------------------------
  // İç birim 0,1 mm; DXF koordinatları $INSUNITS'e göre çevrilir
  var DXF_UNIT_MM = 0.1;
  var DXF_UNITS = { 1: { mm: 25.4, name: 'inch' }, 2: { mm: 304.8, name: 'ft' }, 4: { mm: 1, name: 'mm' }, 5: { mm: 10, name: 'cm' }, 6: { mm: 1000, name: 'm' } };
  var DXF_SKIP = { SEQEND: 1, ATTRIB: 1, ATTDEF: 1, VIEWPORT: 1 };

  function isDxf(text, name) {
    if (/\.dxf$/i.test(name || '')) return true;
    return /^\s*(999|0)\s*\r?\n/.test(text) && /\n\s*SECTION\s*\r?\n/.test(text.slice(0, 4000));
  }

  function polyArea(pts) {
    var a = 0;
    for (var i = 0, n = pts.length; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
    return a / 2;
  }
  function pointInPoly(x, y, pts) {
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function parseDxf(text) {
    var res = {
      format: 'dxf', segments: [], pieces: {}, pieceOrder: [], info: {}, bounds: null, message: '',
      unitMm: DXF_UNIT_MM, feed: null, warnings: [], errors: [], ended: true, labels: [], tools: {}, header: [], unitName: 'mm'
    };
    var warnOnce = {};
    function warn(key, msg) {
      if (warnOnce[key]) { warnOnce[key].n++; return; }
      warnOnce[key] = { n: 1, msg: msg };
    }
    text = text.replace(/^﻿/, '');
    if (!text.trim()) { res.errors.push(L('p.empty')); return res; }
    if (/^AutoCAD Binary DXF/.test(text)) { res.errors.push(L('p.dxfBad')); return res; }

    var lines = text.split(/\r?\n/), pairs = [];
    for (var i = 0; i + 1 < lines.length; i += 2) {
      var code = parseInt(lines[i], 10);
      if (isNaN(code)) { if (lines[i].trim() === '' && i + 1 >= lines.length - 1) break; res.errors.push(L('p.dxfBad')); return res; }
      pairs.push([code, lines[i + 1].replace(/\s+$/, '')]);
    }

    // Birim
    var insUnits = 0;
    for (i = 0; i < pairs.length - 1; i++) {
      if (pairs[i][0] === 9 && pairs[i][1].trim() === '$INSUNITS') { insUnits = parseInt(pairs[i + 1][1], 10); break; }
    }
    var unit = DXF_UNITS[insUnits];
    if (!unit) { unit = DXF_UNITS[4]; res.warnings.push(L('p.dxfUnits')); }
    res.unitName = unit.name;
    var k = unit.mm / DXF_UNIT_MM;

    // ENTITIES bölümünü nesnelere ayır
    var start = -1;
    for (i = 0; i < pairs.length - 1; i++) {
      if (pairs[i][0] === 0 && pairs[i][1].trim() === 'SECTION' && pairs[i + 1][0] === 2 && pairs[i + 1][1].trim() === 'ENTITIES') { start = i + 2; break; }
    }
    if (start < 0) { res.errors.push(L('p.dxfNoEnt')); return res; }
    var ents = [], cur = null;
    for (i = start; i < pairs.length; i++) {
      var pr = pairs[i];
      if (pr[0] === 0) {
        var t = pr[1].trim();
        if (t === 'ENDSEC' || t === 'EOF') break;
        cur = { type: t, g: [] }; ents.push(cur);
      } else if (cur) cur.g.push(pr);
    }
    function gv(e, code, def) {
      for (var j = 0; j < e.g.length; j++) if (e.g[j][0] === code) { var v = parseFloat(e.g[j][1]); return isNaN(v) ? def : v; }
      return def;
    }
    function gs(e, code) {
      for (var j = 0; j < e.g.length; j++) if (e.g[j][0] === code) return e.g[j][1];
      return undefined;
    }
    function toolOf(layer) {
      var m = /^T0*(\d+)/i.exec((layer || '').trim());
      var t = m ? Number(m[1]) : 1;
      return t >= 1 && t <= TOOL_COUNT ? t : 1;
    }
    // Yay (bulge) noktaları: p0'dan p1'e, bulge = tan(açı/4)
    function bulgePts(out, x0, y0, x1, y1, b) {
      var dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
      if (!b || !d) { out.push([x1, y1]); return; }
      var th = 4 * Math.atan(b), off = (d / 2) / Math.tan(th / 2);
      var cx = (x0 + x1) / 2 - dy / d * off, cy = (y0 + y1) / 2 + dx / d * off;
      var r = Math.hypot(x0 - cx, y0 - cy), a0 = Math.atan2(y0 - cy, x0 - cx);
      var n = Math.max(2, Math.ceil(Math.abs(th) / (Math.PI / 24)));
      for (var q = 1; q < n; q++) { var a = a0 + th * q / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      out.push([x1, y1]);
    }
    function arcPts(cx, cy, r, a0, a1) {
      var out = [], sweep = a1 - a0;
      var n = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 36)));
      for (var q = 0; q <= n; q++) { var a = a0 + sweep * q / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      return out;
    }

    var paths = [], texts = [];
    function addPath(pts, closed, layer) {
      if (pts.length < 2) return;
      if (closed) { var f = pts[0], l = pts[pts.length - 1]; if (f[0] !== l[0] || f[1] !== l[1]) pts.push([f[0], f[1]]); }
      paths.push({ pts: pts, tool: toolOf(layer) });
    }
    function verticesToPts(vs, closed) {
      var pts = [[vs[0].x, vs[0].y]];
      var n = vs.length, last = closed ? n : n - 1;
      for (var q = 0; q < last; q++) {
        var a = vs[q], b = vs[(q + 1) % n];
        bulgePts(pts, a.x, a.y, b.x, b.y, a.b);
      }
      return pts;
    }

    for (i = 0; i < ents.length; i++) {
      var e = ents[i], layer = gs(e, 8);
      switch (e.type) {
        case 'POLYLINE': {
          var closedPl = (gv(e, 70, 0) & 1) === 1, vs = [];
          while (i + 1 < ents.length && ents[i + 1].type === 'VERTEX') {
            i++;
            var ve = ents[i];
            if (gv(ve, 70, 0) & 16) continue;                 // spline çerçeve noktası
            vs.push({ x: gv(ve, 10, 0), y: gv(ve, 20, 0), b: gv(ve, 42, 0) });
          }
          if (vs.length >= 2) addPath(verticesToPts(vs, closedPl), closedPl, layer);
          break;
        }
        case 'LWPOLYLINE': {
          var lv = [], vcur = null;
          e.g.forEach(function (g) {
            if (g[0] === 10) { vcur = { x: parseFloat(g[1]), y: 0, b: 0 }; lv.push(vcur); }
            else if (g[0] === 20 && vcur) vcur.y = parseFloat(g[1]);
            else if (g[0] === 42 && vcur) vcur.b = parseFloat(g[1]);
          });
          var closedLw = (gv(e, 70, 0) & 1) === 1;
          if (lv.length >= 2) addPath(verticesToPts(lv, closedLw), closedLw, layer);
          break;
        }
        case 'LINE':
          addPath([[gv(e, 10, 0), gv(e, 20, 0)], [gv(e, 11, 0), gv(e, 21, 0)]], false, layer);
          break;
        case 'ARC': {
          var a0 = gv(e, 50, 0) * Math.PI / 180, a1 = gv(e, 51, 0) * Math.PI / 180;
          if (a1 <= a0) a1 += Math.PI * 2;
          addPath(arcPts(gv(e, 10, 0), gv(e, 20, 0), gv(e, 40, 0), a0, a1), false, layer);
          break;
        }
        case 'CIRCLE':
          addPath(arcPts(gv(e, 10, 0), gv(e, 20, 0), gv(e, 40, 0), 0, Math.PI * 2), true, layer);
          break;
        case 'TEXT': case 'MTEXT': {
          var str = gs(e, 1) || '';
          if (e.type === 'MTEXT') {
            str = e.g.filter(function (g) { return g[0] === 3; }).map(function (g) { return g[1]; }).join('') + str;
            str = str.replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '');
          }
          if (!str.trim()) break;
          var h72 = gv(e, 72, 0), v73 = gv(e, 73, 0), hIdx = 0, vIdx = 0;
          var tx = gv(e, 10, 0), ty = gv(e, 20, 0);
          if (e.type === 'TEXT') {
            if ((h72 || v73) && gs(e, 11) !== undefined) { tx = gv(e, 11, tx); ty = gv(e, 21, ty); }
            hIdx = h72 === 1 || h72 === 4 ? 1 : h72 === 2 ? 2 : 0;
            vIdx = h72 === 4 ? 1 : v73 === 2 ? 1 : v73 === 3 ? 2 : 0;
          } else {
            var att = gv(e, 71, 7);                          // 1 sol üst … 9 sağ alt
            hIdx = (att - 1) % 3; vIdx = 2 - Math.floor((att - 1) / 3);
          }
          texts.push({ x: tx, y: ty, text: str, h: gv(e, 40, 2.5), ang: gv(e, 50, 0) * Math.PI / 180,
            lo: hIdx * 3 + vIdx + 1, tool: toolOf(layer) });
          break;
        }
        default:
          if (!DXF_SKIP[e.type] && e.type !== 'VERTEX') warn('ent' + e.type, L('p.dxfUnsupported', { type: e.type }));
      }
    }

    if (!paths.length) {
      Object.keys(warnOnce).forEach(function (kk) { res.warnings.push(warnOnce[kk].msg); });
      res.errors.push(L('p.dxfNoGeom')); return res;
    }

    // Dosya birimi → iç birim
    paths.forEach(function (pp) { pp.pts = pp.pts.map(function (q) { return [q[0] * k, q[1] * k]; }); });
    texts.forEach(function (tt) { tt.x *= k; tt.y *= k; tt.h *= k; });

    // Pastal çerçevesi: diğer her şeyi kapsayan eksene paralel en büyük dikdörtgen
    var border = null, bArea = 0;
    paths.forEach(function (pp, idx) {
      var q = pp.pts;
      if (q.length < 4 || q.length > 5) return;
      var xs = q.map(function (v) { return v[0]; }), ys = q.map(function (v) { return v[1]; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
      var axis = q.every(function (v) { return (Math.abs(v[0] - x0) < 1 || Math.abs(v[0] - x1) < 1) && (Math.abs(v[1] - y0) < 1 || Math.abs(v[1] - y1) < 1); });
      if (axis && (x1 - x0) * (y1 - y0) > bArea) { bArea = (x1 - x0) * (y1 - y0); border = { idx: idx, x0: x0, y0: y0, x1: x1, y1: y1 }; }
    });
    if (border) {
      var tol = 0.01 * Math.max(border.x1 - border.x0, border.y1 - border.y0);
      var fits = paths.every(function (pp, idx) {
        return idx === border.idx || pp.pts.every(function (v) {
          return v[0] >= border.x0 - tol && v[0] <= border.x1 + tol && v[1] >= border.y0 - tol && v[1] <= border.y1 + tol;
        });
      });
      if (fits && paths.length > 1) paths.splice(border.idx, 1); else border = null;
    }

    // Kaydırma: çerçevenin (yoksa geometrinin) sol alt köşesi (0,0) olsun
    var ox = Infinity, oy = Infinity, mx = -Infinity, my = -Infinity;
    if (border) { ox = border.x0; oy = border.y0; mx = border.x1; my = border.y1; }
    else paths.forEach(function (pp) { pp.pts.forEach(function (v) { ox = Math.min(ox, v[0]); oy = Math.min(oy, v[1]); mx = Math.max(mx, v[0]); my = Math.max(my, v[1]); }); });
    paths.forEach(function (pp) { pp.pts.forEach(function (v) { v[0] -= ox; v[1] -= oy; }); });
    texts.forEach(function (tt) { tt.x -= ox; tt.y -= oy; });
    var W = mx - ox, H = my - oy;
    var margin = border ? 0 : 5 / DXF_UNIT_MM;
    res.bounds = { w: W + margin, h: H + margin };

    // Çerçeve dışındaki yazılar pastal bilgisidir (MK:, MODEL:, W=… L=…)
    texts.forEach(function (tt) {
      if (border && (tt.x < -1 || tt.x > W + 1 || tt.y < -1 || tt.y > H + 1)) {
        res.header.push(tt.text);
        var mk = /^MK:\s*(.+)$/.exec(tt.text.trim());
        if (mk) res.info['Marker Name'] = mk[1];
      } else res.labels.push(tt);
    });
    if (res.header.length) res.message = res.header.join(' | ');
    res.hasBorder = !!border;

    // Yollar → hareketler; kapalı olanlar parça (P), açık olanlar iç çizgi (Y)
    var x = 0, y = 0, closeTol = 0.5 / DXF_UNIT_MM, nP = 0, nY = 0;
    paths.forEach(function (pp, idx) {
      var id = idx + 1, q = pp.pts;
      var first = q[0], last = q[q.length - 1];
      var closed = q.length >= 4 && Math.hypot(first[0] - last[0], first[1] - last[1]) <= closeTol;
      // Görünen numara: parçalar P1, P2 …; iç çizgiler Y1, Y2 … (iç kimlik dosya sırasıdır)
      var pc = { id: id, num: closed ? ++nP : ++nY, code: closed ? 'P' : 'Y', tool: pp.tool, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
        attrs: {}, cutLen: 0, firstSeg: -1, lastSeg: -1, closed: closed, poly: closed ? q : null };
      res.pieces[id] = pc; res.pieceOrder.push(id);
      res.tools[pp.tool] = (res.tools[pp.tool] || 0) + 1;
      if (x !== first[0] || y !== first[1]) {
        res.segments.push({ x0: x, y0: y, x1: first[0], y1: first[1], len: Math.hypot(first[0] - x, first[1] - y), type: 'move', piece: id, tool: pp.tool });
      }
      for (var q2 = 1; q2 < q.length; q2++) {
        var a = q[q2 - 1], b = q[q2], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (!len) continue;
        res.segments.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], len: len, type: 'cut', piece: id, tool: pp.tool });
        pc.minX = Math.min(pc.minX, a[0], b[0]); pc.maxX = Math.max(pc.maxX, a[0], b[0]);
        pc.minY = Math.min(pc.minY, a[1], b[1]); pc.maxY = Math.max(pc.maxY, a[1], b[1]);
        pc.cutLen += len;
        if (pc.firstSeg < 0) pc.firstSeg = res.segments.length - 1;
        pc.lastSeg = res.segments.length - 1;
      }
      x = last[0]; y = last[1];
    });

    // Parça içindeki yazılar sırasıyla parça adı, beden ve demet bilgisidir
    var keys = ['PIECE NAME', 'PIECE SIZE', 'BUNDLE ID'];
    var closedPieces = res.pieceOrder.map(function (id) { return res.pieces[id]; }).filter(function (pc) { return pc.closed; });
    res.labels.forEach(function (tt) {
      for (var c = 0; c < closedPieces.length; c++) {
        var pc = closedPieces[c];
        if (tt.x < pc.minX || tt.x > pc.maxX || tt.y < pc.minY || tt.y > pc.maxY || !pointInPoly(tt.x, tt.y, pc.poly)) continue;
        var n = Object.keys(pc.attrs).length;
        if (n < keys.length) pc.attrs[keys[n]] = tt.text.trim();
        break;
      }
    });

    Object.keys(warnOnce).forEach(function (kk) {
      var w = warnOnce[kk];
      res.warnings.push(w.msg + (w.n > 1 ? L('p.times', { n: w.n }) : ''));
    });
    return res;
  }
