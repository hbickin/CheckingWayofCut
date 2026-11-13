/* BIÇKIN — Gerber Tech Cut File Reader. Telif © 2026 BIÇKIN (show.bickin.net). Tüm hakları saklıdır. */
(function () {
  'use strict';

  // Gerber kesim dosyalarında koordinat birimi 0,01 inç = 0,254 mm
  var DEFAULT_UNIT_MM = 0.254;
  // Bıçak kalkıkken boş hareket, kesim hızının bu katı ile yapılır
  var MOVE_SPEED_FACTOR = 2;

  var COLORS = {
    fabric: '#f7f3ea', fabricEdge: '#b9b2a2', grid: 'rgba(0,0,0,.06)',
    pieceFill: 'rgba(255,210,130,.35)', ghost: '#a9a6a0',
    cut: '#1f6feb', notch: '#e8590c', move: 'rgba(34,197,94,.9)',
    current: 'rgba(59,130,246,.22)', label: '#3d3a33',
    knifeDown: '#ef4444', knifeUp: '#22c55e', viewport: '#ef4444',
    dirCw: '#15803d', dirCcw: '#9333ea', dirOpen: '#64748b', start: '#000000'
  };
  // HPGL plotter birimi: 0,025 mm (1/40 mm)
  var PLT_UNIT_MM = 0.025;
  // PLT araçları (SP1..SP8): varsayılan renk ve adlar
  var TOOL_COUNT = 8;
  var TOOL_DEFAULTS = ['#000000', '#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#9333ea', '#0891b2', '#db2777'];
  var TOOL_STORE_KEY = 'bickin.toolColors';
  // Yön ikonları için kontur üzerinde aday nokta aralığı (mm)
  var ARROW_STEP_MM = 20;
  // Ekranda iki yön ikonu arasındaki en küçük mesafe (px)
  var ARROW_GAP_PX = 70;

  // ------------------------------------------------------------------
  // Dil (Türkçe / İngilizce)
  // ------------------------------------------------------------------
  var LANG_STORE_KEY = 'bickin.lang';
  var FEEDBACK_REPO = 'hbickin/CheckingWayofCut';
  var I18N = window.BK_I18N;
  var lang = (function () {
    try { var v = localStorage.getItem(LANG_STORE_KEY); if (v === 'tr' || v === 'en') return v; } catch (e) { /* yok say */ }
    return /^tr\b/i.test(navigator.language || '') ? 'tr' : 'en';
  })();
  // Çeviri: L('anahtar', { ad: değer }) — {ad} yer tutucuları doldurulur
  function L(key, vars) {
    var str = (I18N[lang] && I18N[lang][key]) || I18N.tr[key] || key;
    return vars ? str.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; }) : str;
  }
  // Ondalık sayı: Türkçede virgül, İngilizcede nokta
  function num(x, digits) {
    var str = Number(x).toFixed(digits);
    return lang === 'tr' ? str.replace('.', ',') : str;
  }

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    file: $('fileInput'), fileName: $('fileName'), speed: $('speed'),
    btnSim: $('btnSim'), btnPause: $('btnPause'), btnStop: $('btnStop'), btnFit: $('btnFit'),
    btnReset: $('btnReset'), startPiece: $('startPiece'), onlyPiece: $('onlyPiece'),
    follow: $('follow'), showDir: $('showDir'), markerInfo: $('markerInfo'),
    preview: $('preview'), sim: $('sim'),
    knifeDot: $('knifeDot'), knifeState: $('knifeState'), pos: $('pos'),
    pieceInfo: $('pieceInfo'), timeInfo: $('timeInfo'),
    progressBar: $('progressBar'), progressPct: $('progressPct'),
    log: $('log'), logCounts: $('logCounts'), btnClearLog: $('btnClearLog'),
    toolList: $('toolList'), btnToolReset: $('btnToolReset'), btnFeedback: $('btnFeedback'),
    fbDialog: $('fbDialog'), fbType: $('fbType'), fbTitle: $('fbTitle'), fbBody: $('fbBody'),
    fbDiag: $('fbDiag'), fbErr: $('fbErr'), fbSend: $('fbSend'), fbCancel: $('fbCancel'),
    btnVersion: $('btnVersion'), verDialog: $('verDialog'), verList: $('verList'),
    btnGuide: $('btnGuide'), guideDialog: $('guideDialog'), guideBody: $('guideBody'),
    btnPieces: $('btnPieces'), nestPanel: $('nestPanel'), nestList: $('nestList'), nestCount: $('nestCount'),
    nestAll: $('nestAll'), nestNone: $('nestNone'), nestRotate: $('nestRotate')
  };

  // ------------------------------------------------------------------
  // Günlük (footer)
  // ------------------------------------------------------------------
  var logCount = { warn: 0, error: 0 };
  function log(level, msg) {
    var row = document.createElement('div');
    row.className = 'row ' + level;
    var t = document.createElement('span');
    t.className = 't';
    t.textContent = new Date().toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-GB');
    var icon = { info: 'ℹ', ok: '✔', warn: '⚠', error: '✖' }[level] || '';
    row.appendChild(t);
    row.appendChild(document.createTextNode(icon + ' ' + msg));
    els.log.appendChild(row);
    els.log.scrollTop = els.log.scrollHeight;
    if (level === 'warn' || level === 'error') { logCount[level]++; updateLogCounts(); }
  }
  function updateLogCounts() {
    var parts = [];
    if (logCount.error) parts.push(L('log.errors', { n: logCount.error }));
    if (logCount.warn) parts.push(L('log.warns', { n: logCount.warn }));
    els.logCounts.textContent = parts.join(', ');
  }
  els.btnClearLog.addEventListener('click', function () {
    els.log.innerHTML = ''; logCount = { warn: 0, error: 0 }; updateLogCounts();
  });
  window.addEventListener('error', function (e) { log('error', L('unexpected', { msg: e.message })); });

  // ------------------------------------------------------------------
  // Ayrıştırıcı
  // ------------------------------------------------------------------
  // Bilinen ama çizime etkisi olmayan M kodları
  var M_INFO = {
    26: 'parça başlangıcı', 70: 'başlık', 80: 'çentik başlangıcı', 81: 'çentik sonu',
    82: 'köşe/aşırı kesim', 83: 'keskin köşe', 84: 'eğri noktası', 85: 'parça kontur başlangıcı'
  };

  // ------------------------------------------------------------------
  // Araç renkleri
  // ------------------------------------------------------------------
  var toolColors = loadToolColors();
  function loadToolColors() {
    var c = TOOL_DEFAULTS.slice();
    try {
      var saved = JSON.parse(localStorage.getItem(TOOL_STORE_KEY) || 'null');
      if (Array.isArray(saved)) saved.forEach(function (v, i) { if (i < TOOL_COUNT && /^#[0-9a-f]{6}$/i.test(v)) c[i] = v; });
    } catch (e) { /* tarayıcı depolaması kullanılamıyor */ }
    return c;
  }
  function saveToolColors() {
    try { localStorage.setItem(TOOL_STORE_KEY, JSON.stringify(toolColors)); } catch (e) { /* yok say */ }
  }
  function toolName(t) { return 'T' + t + ' ' + (t === 1 ? L('tool.pen') : t === 2 ? L('tool.knife') : L('tool.n', { n: t })); }
  function toolColor(t) { return toolColors[t - 1] || '#64748b'; }

  function buildToolList() {
    els.toolList.innerHTML = '';
    for (var t = 1; t <= TOOL_COUNT; t++) {
      var used = data && data.tools && data.tools[t];
      var lab = document.createElement('label');
      lab.className = 'tool' + (used ? ' used' : '');
      lab.title = L('tool.pick', { tool: toolName(t) });
      var inp = document.createElement('input');
      inp.type = 'color'; inp.value = toolColor(t); inp.dataset.tool = t;
      inp.addEventListener('input', onToolColor);
      inp.addEventListener('change', function (e) {
        var n = Number(e.target.dataset.tool);
        log('info', L('tool.colorSet', { tool: toolName(n), color: toolColor(n) }));
      });
      lab.appendChild(inp);
      lab.appendChild(document.createTextNode(toolName(t)));
      if (used) {
        var sm = document.createElement('small');
        sm.textContent = L('tool.paths', { n: used });
        lab.appendChild(sm);
      }
      els.toolList.appendChild(lab);
    }
  }
  function onToolColor(e) {
    var t = Number(e.target.dataset.tool);
    toolColors[t - 1] = e.target.value;
    saveToolColors();
    if (data) { renderPreview(true); renderSim(); }
  }
  els.btnToolReset.addEventListener('click', function () {
    toolColors = TOOL_DEFAULTS.slice();
    saveToolColors(); buildToolList();
    if (data) { renderPreview(true); renderSim(); }
    log('info', L('tool.resetDone'));
  });

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

  // ------------------------------------------------------------------
  // Durum
  // ------------------------------------------------------------------
  var data = null;
  var paths = null;          // statik Path2D'ler
  var done = null;           // tamamlanan hareketlerin Path2D'leri
  // start/end: simüle edilecek hareket aralığı [start, end)
  function newSim() {
    return { idx: 0, pos: 0, t: 0, start: 0, end: 0, started: false, running: false, finished: false, lastTs: 0 };
  }
  var sim = newSim();
  var cam = { x: 0, y: 0, s: 1 };
  var previewView = { s: 1, ox: 0, oy: 0 };
  var previewCache = null;
  var totalTime = 0;

  function speedMm() {
    return Number(els.speed.value);
  }
  function validSpeed() {
    var raw = els.speed.value.trim();
    var v = Number(raw);
    if (raw === '' || !Number.isInteger(v) || v < 1 || v > 1000000) {
      log('error', L('speed.bad', { v: raw }));
      return false;
    }
    return true;
  }

  function segTime(seg, from) {
    var mm = (seg.len - (from || 0)) * data.unitMm;
    return mm / (speedMm() * (seg.type === 'move' ? MOVE_SPEED_FACTOR : 1));
  }
  function computeTotalTime() {
    totalTime = 0;
    if (!data) return;
    var r = simRange();
    for (var i = r.start; i < r.end; i++) totalTime += segTime(data.segments[i]);
  }

  function fmtTime(sec) {
    if (!isFinite(sec)) return '—';
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
  }
  function fmtLen(units) {
    var cm = units * data.unitMm / 10;
    return cm >= 100 ? num(cm / 100, 2) + ' m' : num(cm, 1) + ' cm';
  }

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

  // ------------------------------------------------------------------
  // Versiyon geçmişi
  // ------------------------------------------------------------------
  var APP_VERSION = '1.10';
  var VERSIONS = window.BK_VERSIONS;
  function renderVersions() {
    els.btnVersion.textContent = 'ⓘ ' + L('ver.btn', { v: APP_VERSION });
    els.verList.innerHTML = VERSIONS.map(function (r) {
      var cur = r.v === APP_VERSION;
      return '<section class="ver' + (cur ? ' current' : '') + '"><h3>V' + r.v + ' <small>' + r.date +
        (cur ? ' · ' + L('ver.current') : '') + '</small></h3><ul>' +
        (r[lang] || r.tr).map(function (li) { return '<li>' + li + '</li>'; }).join('') + '</ul></section>';
    }).join('');
  }
  els.btnVersion.addEventListener('click', function () { renderVersions(); openDialog(els.verDialog); });

  // ------------------------------------------------------------------
  // Kullanım kılavuzu (ekran görüntüsü üzerinde numaralı anlatım)
  // ------------------------------------------------------------------
  // Numaraların resim üzerindeki yeri (% olarak sol, üst); ekran görüntüsü alınırken ölçüldü
  var GUIDE_POS = window.BK_GUIDE_POS;
  var GUIDE_IMG = window.BK_GUIDE_IMG;
  var GUIDE = window.BK_GUIDE;
  function renderGuide() {
    var g = GUIDE[lang] || GUIDE.tr;
    var ids = Object.keys(g.items).map(Number).sort(function (a, b) { return a - b; });
    var badges = ids.filter(function (n) { return GUIDE_POS[n]; }).map(function (n) {
      return '<span class="gbadge" data-n="' + n + '" style="left:' + GUIDE_POS[n][0] + '%;top:' + GUIDE_POS[n][1] + '%" title="' +
        esc(g.items[n][0]) + '">' + n + '</span>';
    }).join('');
    els.guideBody.innerHTML =
      '<p class="muted">' + g.intro + '</p>' +
      '<p><b>' + g.stepsTitle + '</b></p><ul class="guide-steps">' + g.steps.map(function (st, i) {
        return '<li><b>' + L('guide.step', { n: String.fromCharCode(65 + i) }) + '</b> ' +
          st.replace(/\{(\d+)\}/g, function (m, n) { return '<span class="num-inline" data-n="' + n + '">' + n + '</span>'; }) + '</li>';
      }).join('') + '</ul>' +
      '<div class="guide-figure"><img alt="" src="' + GUIDE_IMG + '">' + badges + '</div>' +
      '<ol class="guide-list">' + ids.map(function (n) {
        return '<li data-n="' + n + '"><span class="num">' + n + '</span><span><b>' + g.items[n][0] + '</b><br><span class="t">' + g.items[n][1] + '</span></span></li>';
      }).join('') + '</ol>' +
      '<div class="guide-tips"><p><b>💡 ' + g.tipsTitle + '</b></p>' + g.tips.map(function (t) { return '<p>• ' + t + '</p>'; }).join('') + '</div>';
  }
  // Numara ile açıklamayı birbirine bağla: birinin üzerine gelince ikisi de vurgulanır
  function guideHighlight(n) {
    Array.prototype.forEach.call(els.guideBody.querySelectorAll('[data-n]'), function (el) {
      el.classList.toggle('hl', el.getAttribute('data-n') === n);
    });
  }
  els.guideBody.addEventListener('mouseover', function (e) {
    var t = e.target.closest('[data-n]');
    guideHighlight(t ? t.getAttribute('data-n') : null);
  });
  els.guideBody.addEventListener('click', function (e) {
    var t = e.target.closest('.gbadge, .num-inline');
    if (!t) return;
    var li = els.guideBody.querySelector('li[data-n="' + t.getAttribute('data-n') + '"]');
    guideHighlight(t.getAttribute('data-n'));
    if (li) li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  els.btnGuide.addEventListener('click', function () { renderGuide(); openDialog(els.guideDialog); });

  function openDialog(dlg) {
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  Array.prototype.forEach.call(document.querySelectorAll('dialog.modal'), function (dlg) {
    dlg.querySelector('[data-close]').addEventListener('click', function () { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); });
    // Pencerenin dışına (karartılmış alana) tıklayınca kapanır
    dlg.addEventListener('click', function (e) { if (e.target === dlg && dlg.close) dlg.close(); });
  });

  // ------------------------------------------------------------------
  // Dil değiştirme
  // ------------------------------------------------------------------
  function applyLang() {
    document.documentElement.lang = lang;
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (el) { el.textContent = L(el.getAttribute('data-i18n')); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-title]'), function (el) { el.title = L(el.getAttribute('data-i18n-title')); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-ph]'), function (el) { el.placeholder = L(el.getAttribute('data-i18n-ph')); });
    Array.prototype.forEach.call(document.querySelectorAll('.lang button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
      b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false');
    });
    renderMarkerInfo(); fillPieceSelect(); buildToolList(); buildNestList(); renderVersions();
    if (els.guideDialog.open) renderGuide();
    if (els.verDialog.open) renderVersions();
    updateButtons(); updateStatus(); updateLogCounts();
    renderPreview(true); renderSim();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.lang button'), function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-lang');
      if (v === lang) return;
      lang = v;
      try { localStorage.setItem(LANG_STORE_KEY, lang); } catch (e) { /* yok say */ }
      applyLang();
      log('info', L('lang.changed'));
    });
  });

  // ------------------------------------------------------------------
  // Geri bildirim → GitHub Issues
  // ------------------------------------------------------------------
  els.btnFeedback.addEventListener('click', function () {
    els.fbErr.textContent = '';
    if (typeof els.fbDialog.showModal === 'function') els.fbDialog.showModal();
    else els.fbDialog.setAttribute('open', '');
    els.fbTitle.focus();
  });
  els.fbTitle.addEventListener('input', function () { els.fbErr.textContent = ''; });
  els.fbCancel.addEventListener('click', function () { els.fbDialog.close ? els.fbDialog.close() : els.fbDialog.removeAttribute('open'); });
  els.fbSend.addEventListener('click', function () {
    var title = els.fbTitle.value.trim();
    if (!title) { els.fbErr.textContent = L('fb.needTitle'); els.fbTitle.focus(); return; }
    var url = feedbackUrl(els.fbType.value, title, els.fbBody.value.trim(), els.fbDiag.checked);
    // Kullanıcı tıklamasıyla açılan bağlantı açılır pencere engelleyicisine takılmaz
    var link = document.createElement('a');
    link.href = url; link.target = '_blank'; link.rel = 'noopener';
    document.body.appendChild(link); link.click(); link.remove();
    log('ok', L('fb.opened'));
    els.fbTitle.value = ''; els.fbBody.value = '';
    if (els.fbDialog.close) els.fbDialog.close(); else els.fbDialog.removeAttribute('open');
  });

  // GitHub "yeni issue" adresi: başlık, gövde ve etiket önceden doldurulur
  function feedbackUrl(type, title, desc, withDiag) {
    var MAX_BODY = 6000;
    var body = '### ' + L('fb.h.desc') + '\n\n' + (desc || '-') + '\n';
    if (withDiag) {
      var rows = Array.prototype.slice.call(els.log.querySelectorAll('.row'), -15)
        .map(function (r) { return r.textContent; });
      body += '\n### ' + L('fb.h.diag') + '\n\n' +
        '- ' + L('fb.k.file') + ': ' + (data ? els.fileName.textContent : '—') + '\n' +
        '- ' + L('fb.k.format') + ': ' + (data ? ({ plt: 'HPGL (PLT)', dxf: 'DXF', cut: 'Gerber (CUT)' }[data.format] + (data.nested ? ' + nesting' : '')) : '—') + '\n' +
        '- ' + L('fb.k.lang') + ': ' + lang + '\n' +
        '- ' + L('fb.k.browser') + ': ' + navigator.userAgent + '\n' +
        '- ' + L('fb.k.page') + ': ' + location.href.split('#')[0].split('?')[0] + '\n' +
        '\n<details><summary>' + L('fb.h.log') + '</summary>\n\n```\n' + rows.join('\n') + '\n```\n</details>\n';
    }
    if (body.length > MAX_BODY) body = body.slice(0, MAX_BODY) + '\n\n' + L('fb.truncated');
    var prefix = { bug: '[Hata/Bug] ', enhancement: '[İstek/Request] ', question: '[Soru/Question] ' }[type] || '';
    return 'https://github.com/' + FEEDBACK_REPO + '/issues/new?' +
      'title=' + encodeURIComponent(prefix + title) +
      '&body=' + encodeURIComponent(body) +
      '&labels=' + encodeURIComponent(type);
  }

  applyLang();
  renderPreview(); renderSim(); updateButtons();
  log('info', L('ready'));
  log('info', L('copyright'));

  // Test ve konsol kullanımı için
  window.CutSim = { parseCut: parseCut, parsePlt: parsePlt, parseDxf: parseDxf, nestData: nestData, feedbackUrl: feedbackUrl, load: function (text, name) {
    var res = isDxf(text, name) ? parseDxf(text) : isPlt(text, name) ? parsePlt(text) : parseCut(text);
    res.warnings.forEach(function (w) { log('warn', w); });
    if (res.errors.length) { res.errors.forEach(function (e) { log('error', e); }); setData(null); return res; }
    els.fileName.textContent = name || 'test';
    setData(res); return res;
  } };
})();
