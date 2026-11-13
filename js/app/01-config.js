/* BIÇKIN — Sabitler ve renkler / constants & colors. Telif © 2026 Hüseyin BIÇKIN. */

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
