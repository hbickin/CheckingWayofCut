/* BIÇKIN — Gerber .CUT okuyucu / CUT reader. Telif © 2026 Hüseyin BIÇKIN. */
  function parseCut(text) {
    var res = {
      format: 'cut', segments: [], pieces: {}, pieceOrder: [], info: {}, bounds: null, message: '',
      unitMm: DEFAULT_UNIT_MM, feed: null, warnings: [], errors: [], ended: false
    };
    var warnOnce = {};
    function warn(key, msg) {
      if (warnOnce[key]) { warnOnce[key].n++; return; }
      warnOnce[key] = { n: 1, msg: msg };
    }

    text = text.replace(/^﻿/, '');
    if (!text.trim()) { res.errors.push(L('p.empty')); return res; }
    if (/[\x00-\x08\x0E-\x1F]/.test(text.slice(0, 2000))) {
      res.errors.push(L('p.binaryCut'));
      return res;
    }

    // Geometri akışı "M0*" ile biter, ardından virgüllü bilgi satırları gelir
    var geom, trailer = '';
    var end = /\*M0+\*/.exec(text);
    if (end) {
      geom = text.slice(0, end.index + end[0].length);
      trailer = text.slice(end.index + end[0].length);
    } else {
      var tm = /^[A-Z],/m.exec(text);
      geom = tm ? text.slice(0, tm.index) : text;
      trailer = tm ? text.slice(tm.index) : '';
      res.warnings.push(L('p.noM0'));
    }

    var tokens = geom.replace(/[\r\n]+/g, '').split('*');
    var x = 0, y = 0, down = false, piece = 0, notchNext = false, expectMessage = false;
    var first = true;
    var tokRe = /([A-Z])(-?\d+(?:\.\d+)?)?/y;

    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i].trim();
      if (!tok) continue;
      if (expectMessage) { res.message = tok; expectMessage = false; continue; }

      var fields = [], pos = 0, ok = true;
      tokRe.lastIndex = 0;
      while (pos < tok.length) {
        tokRe.lastIndex = pos;
        var m = tokRe.exec(tok);
        if (!m) { ok = false; break; }
        fields.push({ c: m[1], v: m[2] === undefined ? null : Number(m[2]) });
        pos = tokRe.lastIndex;
      }
      if (!ok || !fields.length) {
        warn('tok:' + tok.slice(0, 12), L('p.badToken', { tok: tok.slice(0, 30), i: i }));
        continue;
      }

      if (first) {
        first = false;
        if (fields[0].c !== 'H') res.warnings.push(L('p.noH'));
      }

      var nx = null, ny = null, isFeed = false;
      for (var f = 0; f < fields.length; f++) {
        var c = fields[f].c, v = fields[f].v;
        switch (c) {
          case 'X': nx = v; break;
          case 'Y': ny = v; break;
          case 'Q': isFeed = true; break;
          case 'H': break;
          case 'D': break;
          case 'N':
            piece = v;
            if (!res.pieces[piece]) {
              res.pieces[piece] = { id: piece, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, attrs: {}, cutLen: 0, firstSeg: -1, lastSeg: -1 };
              res.pieceOrder.push(piece);
            } else {
              warn('dupN' + piece, L('p.dupN', { n: piece }));
            }
            break;
          case 'M':
            if (v === 0) { res.ended = true; }
            else if (v === 14) down = true;
            else if (v === 15) down = false;
            else if (v === 19) notchNext = true;
            else if (v === 20) expectMessage = true;
            else if (!M_INFO[v]) warn('M' + v, L('p.unknownM', { n: v }));
            break;
          default:
            warn('c' + c, L('p.unknownC', { c: c }));
        }
      }

      if (nx === null && ny === null) continue;
      if (nx === null) nx = x;
      if (ny === null) ny = y;
      if (!isFinite(nx) || !isFinite(ny)) { warn('nan', L('p.badCoord')); continue; }
      if (isFeed) { res.feed = { x: nx, y: ny }; continue; }

      var len = Math.hypot(nx - x, ny - y);
      if (len > 0) {
        var type = down ? (notchNext ? 'notch' : 'cut') : 'move';
        res.segments.push({ x0: x, y0: y, x1: nx, y1: ny, len: len, type: type, piece: piece });
        var p = res.pieces[piece];
        if (p && type !== 'move') {
          p.minX = Math.min(p.minX, x, nx); p.maxX = Math.max(p.maxX, x, nx);
          p.minY = Math.min(p.minY, y, ny); p.maxY = Math.max(p.maxY, y, ny);
          if (type === 'cut') p.cutLen += len;
          if (p.firstSeg < 0) p.firstSeg = res.segments.length - 1;
          p.lastSeg = res.segments.length - 1;
        }
        if (down && !piece) warn('nopiece', L('p.noPiece'));
      }
      if (nx < 0 || ny < 0) warn('neg', L('p.neg'));
      x = nx; y = ny; notchNext = false;
    }
    if (expectMessage) res.warnings.push(L('p.m20'));
    if (down) res.warnings.push(L('p.knifeDown'));

    parseTrailer(trailer, res);

    // Birim kontrolü: M20 mesajındaki "L=..CM" ile B (sınır) satırını karşılaştır
    var lm = /L=([\d.]+)\s*CM/i.exec(res.message);
    var bx = res.bounds ? res.bounds.w : (res.feed ? res.feed.x : 0);
    if (lm && bx > 0) {
      var unit = parseFloat(lm[1]) * 10 / bx;
      if (Math.abs(unit - DEFAULT_UNIT_MM) / DEFAULT_UNIT_MM > 0.02) {
        res.unitMm = unit;
        res.warnings.push(L('p.unit', { u: num(unit, 4) }));
      }
    }

    // Sınır bilgisi yoksa geometriden hesapla
    var gx = 0, gy = 0;
    res.segments.forEach(function (s) { gx = Math.max(gx, s.x0, s.x1); gy = Math.max(gy, s.y0, s.y1); });
    if (!res.bounds) {
      res.bounds = { w: Math.max(gx, res.feed ? res.feed.x : 0), h: gy };
      res.warnings.push(L('p.noB'));
    } else if (gx > res.bounds.w * 1.001 || gy > res.bounds.h * 1.001) {
      res.warnings.push(L('p.outB'));
    }

    Object.keys(warnOnce).forEach(function (k) {
      var w = warnOnce[k];
      res.warnings.push(w.msg + (w.n > 1 ? L('p.times', { n: w.n }) : ''));
    });
    if (!res.segments.some(function (s) { return s.type !== 'move'; })) {
      res.errors.push(L('p.noCut'));
    }
    return res;
  }

  function parseTrailer(trailer, res) {
    var vNames = {}, cur = null;
    trailer.split(/\r?\n/).forEach(function (line) {
      line = line.trim().replace(/\*$/, '');
      if (!line) return;
      var p = line.split(',');
      switch (p[0]) {
        case 'B':
          var w = Number(p[1]), h = Number(p[2]);
          if (w > 0 && h > 0) res.bounds = { w: w, h: h };
          else res.warnings.push(L('p.badB', { line: line }));
          break;
        case 'M': if (p[1]) res.info[p[1]] = p[2] || ''; break;
        case 'V': vNames[p[2]] = p[1]; break;
        case 'L':
          var n = Number(p[1]);
          cur = res.pieces[n] || null;
          if (n && !cur) res.warnings.push(L('p.noPieceForL', { n: n }));
          break;
        case 'P': if (cur) cur.labelPos = { x: Number(p[1]), y: Number(p[2]) }; break;
        case 'D':
          if (!cur) break;
          if (p.length >= 6 && p[3] !== '' && !isNaN(p[3])) cur.color = [Number(p[3]), Number(p[4]), Number(p[5])];
          cur.attrs[vNames[p[1]] || ('D' + p[1])] = p[2];
          break;
      }
    });
  }
