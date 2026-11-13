/* BIÇKIN — PLT (HPGL) okuyucu / PLT reader. Telif © 2026 Hüseyin BIÇKIN. */

  // Dosya türü: Gerber .CUT mi, HPGL .PLT mi?
  function isPlt(text, name) {
    if (/\.(plt|hpgl?|hpg)$/i.test(name || '')) return true;
    if (/\.cut$/i.test(name || '')) return false;
    if (/^\s*H\d*\*/.test(text) || /\*M0+\*/.test(text)) return false;
    return /^\s*(\x1b[^A-Za-z]*[A-Za-z][^;:]*[;:]?\s*)*(IN|DF|IP|SC|SP|PU|PD|PA)\s*[;\d-]/i.test(text);
  }

  // HPGL (.PLT) ayrıştırıcı. Çıktı parseCut ile aynı yapıdadır; her kalem/bıçak aşağı
  // yolu bir "parça" (Y1, Y2 ...) olur ve her hareket hangi araçla yapıldığını (tool) taşır.
  var PLT_IGNORED = { VS: 1, FS: 1, PT: 1, LT: 1, PW: 1, CT: 1, DF: 1, IW: 1, RO: 1, SR: 1, SL: 1, TL: 1, ES: 1, CS: 1, CA: 1, SS: 1, SA: 1, PS: 1, BP: 1, PG: 1, FT: 1, AS: 1, OI: 1, OS: 1, OP: 1, OE: 1 };
  function parsePlt(text) {
    var res = {
      format: 'plt', segments: [], pieces: {}, pieceOrder: [], info: {}, bounds: null, message: '',
      unitMm: PLT_UNIT_MM, feed: null, warnings: [], errors: [], ended: true, labels: [], tools: {}
    };
    var warnOnce = {};
    function warn(key, msg) {
      if (warnOnce[key]) { warnOnce[key].n++; return; }
      warnOnce[key] = { n: 1, msg: msg };
    }

    text = text.replace(/^﻿/, '');
    if (!text.trim()) { res.errors.push(L('p.empty')); return res; }
    if (/[\x00-\x02\x04-\x08\x0E-\x1A\x1C-\x1F]/.test(text.slice(0, 2000))) {
      res.errors.push(L('p.binaryPlt'));
      return res;
    }

    var x = 0, y = 0, down = false, tool = 1, rel = false;
    var ip = [0, 0, 1016, 1016], sc = null;
    var dirAng = 0, charH = 0.375, lo = 1, term = '\x03';
    var piece = null, pathCount = 0, closeTol = 0.5 / PLT_UNIT_MM;

    function scaleX() { return sc ? (ip[2] - ip[0]) / (sc[1] - sc[0]) : 1; }
    function scaleY() { return sc ? (ip[3] - ip[1]) / (sc[3] - sc[2]) : 1; }
    function abs(ux, uy) {
      return sc ? [ip[0] + (ux - sc[0]) * scaleX(), ip[1] + (uy - sc[2]) * scaleY()] : [ux, uy];
    }
    function endPath() {
      if (piece) {
        var p = res.pieces[piece];
        p.closed = Math.hypot(p.sx - x, p.sy - y) <= closeTol;
      }
      piece = null;
    }
    function moveTo(nx, ny) {
      if (!isFinite(nx) || !isFinite(ny)) { warn('nan', L('p.badCoord')); return; }
      var len = Math.hypot(nx - x, ny - y);
      if (down && !piece) {
        piece = ++pathCount;
        res.pieces[piece] = {
          id: piece, code: 'Y', tool: tool, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
          attrs: {}, cutLen: 0, firstSeg: -1, lastSeg: -1, sx: x, sy: y
        };
        res.pieceOrder.push(piece);
        res.tools[tool] = (res.tools[tool] || 0) + 1;
      }
      if (len > 0) {
        var type = down ? 'cut' : 'move';
        res.segments.push({ x0: x, y0: y, x1: nx, y1: ny, len: len, type: type, piece: down ? piece : 0, tool: tool });
        if (down) {
          var p = res.pieces[piece];
          p.minX = Math.min(p.minX, x, nx); p.maxX = Math.max(p.maxX, x, nx);
          p.minY = Math.min(p.minY, y, ny); p.maxY = Math.max(p.maxY, y, ny);
          p.cutLen += len;
          if (p.firstSeg < 0) p.firstSeg = res.segments.length - 1;
          p.lastSeg = res.segments.length - 1;
        }
      }
      x = nx; y = ny;
    }
    function plotPoints(nums, mn) {
      if (nums.length % 2) warn('odd' + mn, L('p.oddCoords', { cmd: mn }));
      for (var k = 0; k + 1 < nums.length; k += 2) {
        if (rel) moveTo(x + nums[k] * scaleX(), y + nums[k + 1] * scaleY());
        else { var a = abs(nums[k], nums[k + 1]); moveTo(a[0], a[1]); }
      }
    }

    var i = 0, n = text.length, first = true;
    while (i < n) {
      var ch = text[i];
      if (/[\s;,]/.test(ch)) { i++; continue; }
      if (ch === '\x1b') {                     // aygıt kontrol dizisi (ESC.…): satır sonuna ya da ':' e kadar atla
        var e = text.slice(i).search(/[:\r\n]/);
        i = e < 0 ? n : i + e + 1;
        continue;
      }
      var mm = /^[A-Za-z]{2}/.exec(text.slice(i, i + 2));
      if (!mm) { warn('chr' + ch, L('p.badChar', { ch: ch })); i++; continue; }
      var mn = mm[0].toUpperCase();
      i += 2;
      if (first) {
        first = false;
        if (mn !== 'IN' && mn !== 'DF') res.warnings.push(L('p.noIN'));
      }

      if (mn === 'LB') {
        var end = text.indexOf(term, i);
        if (end < 0) {
          var nl = text.slice(i).search(/[\r\n]/);
          end = nl < 0 ? n : i + nl;
          warn('lbterm', L('p.lbTerm'));
        }
        var lbText = text.slice(i, end).replace(/[\r\n]+/g, ' ');
        i = end < n && text[end] === term ? end + 1 : end;
        if (lbText.trim()) {
          res.labels.push({ x: x, y: y, text: lbText, ang: dirAng, h: charH * 10 / PLT_UNIT_MM, lo: lo, tool: tool });
          res.tools[tool] = res.tools[tool] || 0;
        }
        continue;
      }
      if (mn === 'DT') {
        if (i < n && text[i] !== ';') { term = text[i]; i++; }
        continue;
      }

      var pe = text.slice(i).search(/[;A-Za-z\x1b]/);
      var raw = pe < 0 ? text.slice(i) : text.slice(i, i + pe);
      i = pe < 0 ? n : i + pe;
      var nums = raw.trim() ? raw.trim().split(/[\s,]+/).map(Number) : [];

      switch (mn) {
        case 'IN':
          endPath(); down = false; rel = false; sc = null; ip = [0, 0, 1016, 1016];
          dirAng = 0; charH = 0.375; lo = 1; term = '\x03';
          break;
        case 'IP': if (nums.length >= 4) ip = nums.slice(0, 4); break;
        case 'SC':
          if (nums.length >= 4 && nums[1] !== nums[0] && nums[3] !== nums[2]) {
            sc = nums.slice(0, 4);
            if (Math.abs(scaleX() - scaleY()) > 1e-9) warn('aniso', L('p.aniso'));
          } else sc = null;
          break;
        case 'SP':
          endPath(); down = false;
          var t = nums.length ? Math.round(nums[0]) : 0;
          if (t < 1 || t > TOOL_COUNT) warn('sp' + t, L('p.badSP', { n: t, max: TOOL_COUNT }));
          tool = t >= 1 && t <= TOOL_COUNT ? t : 1;
          break;
        case 'PU': endPath(); down = false; plotPoints(nums, mn); break;
        case 'PD': down = true; plotPoints(nums, mn); break;
        case 'PA': rel = false; plotPoints(nums, mn); break;
        case 'PR': rel = true; plotPoints(nums, mn); break;
        case 'DI': case 'DR':
          if (nums.length >= 2 && (nums[0] || nums[1])) dirAng = Math.atan2(nums[1], nums[0]);
          else dirAng = 0;
          break;
        case 'SI': if (nums.length >= 2 && nums[1] > 0) charH = nums[1]; break;
        case 'LO': if (nums.length && nums[0] >= 1 && nums[0] <= 19) lo = ((Math.round(nums[0]) - 1) % 10) % 9 + 1; break;
        default:
          if (PLT_IGNORED[mn]) break;
          warn('mn' + mn, L('p.unsupported', { cmd: mn }));
      }
    }
    endPath();

    // Boş hareketleri bir sonraki yola bağla (yola yaklaşma hareketi o yolun parçası sayılır)
    var next = 0;
    for (var j = res.segments.length - 1; j >= 0; j--) {
      var sg = res.segments[j];
      if (sg.type !== 'move') next = sg.piece;
      else sg.piece = next || pathCount;
    }

    // Negatif koordinat varsa her şeyi kaydırarak (0,0) başlangıcına al
    var mnX = 0, mnY = 0, mxX = 0, mxY = 0;
    res.segments.forEach(function (s) {
      mnX = Math.min(mnX, s.x0, s.x1); mnY = Math.min(mnY, s.y0, s.y1);
      mxX = Math.max(mxX, s.x0, s.x1); mxY = Math.max(mxY, s.y0, s.y1);
    });
    res.labels.forEach(function (l) { mnX = Math.min(mnX, l.x); mnY = Math.min(mnY, l.y); mxX = Math.max(mxX, l.x); mxY = Math.max(mxY, l.y + l.h); });
    if (mnX < 0 || mnY < 0) {
      var dx = -mnX, dy = -mnY;
      res.segments.forEach(function (s) { s.x0 += dx; s.x1 += dx; s.y0 += dy; s.y1 += dy; });
      res.labels.forEach(function (l) { l.x += dx; l.y += dy; });
      res.pieceOrder.forEach(function (id) { var p = res.pieces[id]; p.minX += dx; p.maxX += dx; p.minY += dy; p.maxY += dy; });
      mxX += dx; mxY += dy;
      res.warnings.push(L('p.shifted'));
    }
    var margin = 5 / PLT_UNIT_MM;
    res.bounds = { w: mxX + margin, h: mxY + margin };

    Object.keys(warnOnce).forEach(function (k) {
      var w = warnOnce[k];
      res.warnings.push(w.msg + (w.n > 1 ? L('p.times', { n: w.n }) : ''));
    });
    if (!res.segments.some(function (s) { return s.type !== 'move'; })) {
      res.errors.push(L('p.noDrawPlt'));
    }
    return res;
  }
