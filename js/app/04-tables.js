/* BIÇKIN — M kod açıklamaları / M-code table. Telif © 2026 Hüseyin BIÇKIN. */
  // ------------------------------------------------------------------
  // Ayrıştırıcı
  // ------------------------------------------------------------------
  // Bilinen ama çizime etkisi olmayan M kodları
  // GERBERcutter M kodları. Hız ve delme kodları ayrıştırıcıda ayrıca işlenir;
  // buradakiler "bilinen ama geometriyi/çizimi etkilemeyen" kodlardır (uyarı verilmez).
  var M_INFO = {
    0: 'program sonu', 1: 'isteğe bağlı duruş',
    17: 'maksimum ilerleme', 18: 'sonraki aşırı kesimi engelle',
    25: 'kesim hızını azalt', 26: 'normal kesim hızı',
    43: 'delme', 44: 'yardımcı delme', 46: 'köşede kaldır-indir', 47: 'bıçak zekâsını kapat',
    60: 'kesim hızı %95', 61: 'kesim hızı %90', 62: 'kesim hızı %85', 63: 'kesim hızı %80',
    64: 'kesim hızı %75', 65: 'kesim hızı %70', 66: 'kesim hızı %65', 68: 'çentik (E)',
    70: 'başlık', 80: 'çentik başlangıcı', 81: 'çentik sonu',
    82: 'köşe/aşırı kesim', 83: 'keskin köşe', 84: 'eğri noktası', 85: 'parça kontur başlangıcı'
  };
