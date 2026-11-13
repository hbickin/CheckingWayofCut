# Gerber Tech Cut File Reader — BIÇKIN

Gerber Technology / RS-274X (ISO) kesim dosyalarını (`.CUT`) ve HPGL plot dosyalarını (`.PLT`) tarayıcıda
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
