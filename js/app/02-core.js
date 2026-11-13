/* BIÇKIN — Dil çekirdeği, L()/num(), $ ve els / i18n core & DOM refs. Telif © 2026 Hüseyin BIÇKIN. */
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
