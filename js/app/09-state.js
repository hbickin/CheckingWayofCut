/* BIÇKIN — Durum, hız ve biçimlendirme / state & format helpers. Telif © 2026 Hüseyin BIÇKIN. */
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
