# Gerber Tech Cut File Reader — BIÇKIN

Gerber Technology / RS-274X (ISO) kesim dosyalarını (`.CUT`), HPGL plot dosyalarını (`.PLT`) ve DXF çizimlerini (`.DXF`) tarayıcıda
açan, pastalı/kalıbı gösteren ve kesim makinesinin bıçak (ya da plotter kaleminin) hareketini simüle eden
**tek dosyalık** HTML uygulaması.

**Canlı sürüm:** https://hbickin.github.io/CheckingWayofCut/

Kurulum gerekmez: `index.html` dosyasını tarayıcıda açmanız yeterlidir; internet bağlantısı da gerekmez.
Seçtiğiniz `.CUT` dosyaları hiçbir sunucuya gönderilmez, tamamen tarayıcınızda okunur.

## Özellikler

- Pastalın tamamı üstteki 200 px'lik önizlemede; parça adları, bedenleri ve sağ/sol bilgisi etiketlerde
- Ayarlanabilir hızla (mm/sn) bıçak hareketi simülasyonu: kesim, çentik ve bıçak kalkık boş hareketler
- Başlangıç parçası seçimi ve "Sadece bu parça" seçeneği
- Parça kenarlarında kesim yönü ikonları (yeşil `>` saat yönü, mor `<` saat yönü tersi) ve kara başlangıç noktası (●)
- Yakınlaştırma / kaydırma, bıçağı takip etme, ölçek göstergesi
- Alt bölümde işlem günlüğü: bilgi, uyarı ve hatalar

## PLT (HPGL) dosyaları

`.PLT` / `.HPGL` dosyaları otomatik tanınır. Her `SP1`…`SP8` aracı ayrı renkte çizilir:

| Araç | Varsayılan renk |
|---|---|
| T1 Kalem | siyah |
| T2 Bıçak | kırmızı |
| T3–T8 | mavi, yeşil, turuncu, mor, camgöbeği, pembe |

Renkler **Araçlar** şeridindeki renk kutularından değiştirilebilir; seçim tarayıcıda hatırlanır,
**Varsayılan renkler** ile (veya ⟲ Reset ile) geri alınır. Dosyada kullanılan araçlar kalın yazılır.

Desteklenen HPGL komutları: `IN`, `IP`, `SC` (ölçekleme), `SP` (araç), `PU`/`PD` (kalem/bıçak yukarı/aşağı),
`PA`/`PR` (mutlak/göreli), `LB` (etiket, `DT` sonlandırıcısıyla), `DI`/`DR` (yazı yönü), `SI` (yazı boyu),
`LO` (yazı hizası). Plotter birimi 0,025 mm'dir. Her kalem/bıçak aşağı yol bir "yol" (Y1, Y2 …) olarak
listelenir; kapalı konturlarda saat yönü / tersi, açık yollarda gri yön ikonları gösterilir.

## DXF dosyaları

ASCII DXF (AutoCAD R12 ve sonrası, ör. Gerber AccuMark'ın DXF çıktısı) okunur. Birim `$INSUNITS`'ten alınır
(inç / mm / cm / m; yoksa mm kabul edilir). Desteklenen nesneler: `POLYLINE`, `LWPOLYLINE` (yay/bulge dahil),
`LINE`, `ARC`, `CIRCLE`, `TEXT`, `MTEXT`. Her şeyi kapsayan dikdörtgen pastal çerçevesi sayılır; çerçeve
dışındaki yazılar (`MK:`, `MODEL:`, `W=… L=…`) pastal bilgisi olarak İşlemler alanına yazılır. Kapalı konturlar
parça (P1, P2 …), açık çizgiler iç çizgi (Y1, Y2 …) olur; parça içindeki yazılar sırasıyla parça adı, beden ve
demet bilgisi olarak okunur. `T001…` katmanları araç numarasına (T1…) eşlenir.

## Parça seçimi ve nesting

**☰ Parçalar** düğmesi dosyadaki parçaları listeler:

- **Birden çok parça** seçilince pastal yerine bu parçaların **nesting** yerleşimi gösterilir: parçalar büyükten
  küçüğe, kumaş eni boyunca en sola kayabilecekleri satıra yerleştirilir (3 mm boşlukla, 5 mm satır çözünürlüğüyle).
  **180° çevirmeye izin ver** işaretliyse her parça için iki yön denenir (çevirme düz boy ipliği yönünü korur).
  Pastal şeridinde **NESTING** etiketi, toplam boy ve verim görünür; simülasyon yeni yerleşim üzerinde çalışır.
- **Tek parça** seçilince pastalda o parça "Sadece bu parça" olarak seçilir.
- Seçim temizlenince özgün pastala dönülür.

CUT, PLT ve DXF dosyalarının hepsinde çalışır.

## Birden çok dosya açma

**📂 Dosya Seç** penceresinde birden çok dosya seçilebilir (Ctrl / Shift ile):

- Seçimde **pastal** varsa (CUT dosyası, çerçeveli DXF ya da birden çok parçalı dosya) yalnızca pastal gösterilir;
  birden çok pastal seçildiyse listedeki **en sondaki** açılır, diğerleri İşlemler alanında "atlandı" olarak yazılır.
- Yalnızca **tek parçalık** dosyalar (ör. her biri bir kalıp olan PLT dosyaları) seçildiyse hepsi birleştirilir,
  tüm parçalar seçili hale gelir ve 150 cm kumaş eninde nesting yapılır.

## Dil / Language

Sağ üstteki **TR | EN** düğmeleriyle arayüz Türkçe ya da İngilizce olur; seçim tarayıcıda hatırlanır.
İlk açılışta tarayıcı dili Türkçeyse Türkçe, değilse İngilizce gelir.

## Geri bildirim

Sağ üstteki **💬 Geri Bildirim** düğmesi bir form açar (tür: hata bildirimi / özellik isteği / soru,
başlık, açıklama). **GitHub'da gönder** ile bu repodaki
[Issues](https://github.com/hbickin/CheckingWayofCut/issues) sayfası yeni sekmede, form doldurulmuş
olarak açılır; gönderen kişi orada **Create** ile kaydı oluşturur (GitHub hesabı gerekir).
İstenirse dosya adı/türü, tarayıcı ve son günlük satırları da eklenir; dosyanın içeriği gönderilmez.

## Kullanım

1. **📂 Dosya Seç** ile `.CUT` veya `.PLT` dosyasını seçin.
2. **Başlangıç** listesinden simülasyonun başlayacağı parçayı seçin (varsayılan: tüm pastal baştan).
   **Sadece bu parça** işaretliyse yalnızca o parça kesilir.
3. **Hız (mm/sn)** kutusuna tam sayı bir hız girin (bıçak kalkıkken boş hareket bunun 2 katı hızla yapılır).
4. **▶ Simüle Et** ile başlatın; **Duraklat** / **Durdur** ile kontrol edin (Boşluk tuşu da başlatır/duraklatır).
   **Durdur** seçili başlangıca geri alır; **⟲ Reset** dosyayı, ayarları ve günlüğü tamamen sıfırlar.
5. Simülasyon alanında fare tekerleği ile yakınlaştırın, sürükleyerek kaydırın, çift tıkla sığdırın.
   Önizlemeye tıklamak görünümü o noktaya götürür.

## Desteklenen komutlar

| Komut | Anlam |
|---|---|
| `H1` | Başlık |
| `N<n>` | Parça numarası |
| `X<x>Y<y>` | Konuma git (birim 0,01 inç = 0,254 mm) |
| `M14` / `M15` | Bıçak aşağı / yukarı |
| `M19` | Sonraki hareket çentik (notch) kesimi |
| `M20` | Sonraki alan mesaj (`/L=..CM/W=..CM` boy/en kontrolünde kullanılır) |
| `M26 M70 M80–M85`, `D2` | Tanınır, çizime etkisi yoktur |
| `Q X<x>Y<y>` | Pastal ilerleme/son konumu |
| `M0` | Program sonu |

`M0*` sonrasındaki virgüllü satırlar da okunur: `B` (pastal sınırı), `M` (pastal bilgileri),
`V` / `L` / `D` (parça adı, beden, sağ/sol vb. etiketleri).

Örnek dosyalar: [`sample/`](sample).

## Yayınlama (GitHub Pages)

Repo ayarlarında **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
dal olarak `main` ve klasör olarak `/ (root)` seçin. Birkaç dakika içinde site
`https://hbickin.github.io/CheckingWayofCut/` adresinde yayında olur; `main` dalına
yapılan her değişiklik siteyi otomatik günceller.
