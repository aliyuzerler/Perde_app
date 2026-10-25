# PerdeGo — Tasarım Sistemi (v1)

> Sinematik, modern, premium ve koyu. Tüm istemciler (mobil, ileride admin)
> bu token setini kullanır.

## 1. Renk Paleti

| Token | Değer | Kullanım |
|-------|-------|----------|
| `bg` | `#0D0D0F` | Uygulama zemini (en koyu) |
| `surface` | `#19191D` | Kartlar, taban çubuğu, input zeminleri |
| `accent` | `#B71C36` | Marka vurgusu: CTA, aktif sekme, ilerleme, rozetler |
| `text` | `#F5F1EA` | Birincil metin (sıcak beyaz) |

Türetilmiş token'lar:

| Token | Değer | Kullanım |
|-------|-------|----------|
| `textMuted` | `#F5F1EA` %64 opaklık | İkincil metin, açıklamalar |
| `textSubtle` | `#F5F1EA` %40 opaklık | Meta bilgisi, zaman damgası |
| `surfaceElevated` | `#232328` | Üst üste binen yüzeyler (modal, dropdown) |
| `surfacePressed` | `#101013` | Basılı kart durumu |
| `accentSoft` | `#B71C36` %18 opaklık | Vurgu zemini (rozet arka planı) |
| `border` | `#F5F1EA` %8 opaklık | Ayrım çizgileri, kart konturu |
| `success` | `#2E7D32` | Onay durumları |
| `warning` | `#C28A1D` | Uyarı durumları |
| `danger` | `#B71C36` | Hata durumları (marka kırmızısı ile aynı) |
| `overlay` | `#0D0D0F` %60 opaklık | Hero üstü gradyan ve karartma |

## 2. Köşe Yarıçapı (ZORUNLU: 0–4 px)

| Token | Değer | Kullanım |
|-------|-------|----------|
| `radiusNone` | 0 | Tam kenar (hero görseli) |
| `radiusSm` | 2 | Küçük rozetler, çipler |
| `radius` | 4 | Tüm kartlar, posterler, butonlar, input'lar |

**Yasak**: yuvarlak video kartları, büyük oval kartlar, hap (pill) butonlar,
`borderRadius > 4`. Daire yalnızca küçük ikonografik öğelerde (ör. avatar,
oynat düğmesi) kabul edilir — kart/buton formlarında asla.

## 3. Kart ve Görsel Oranları

- Film/dizi/bölüm kartları **dikdörtgendir**.
- Oran token'ları:
  - `poster` → **2:3** (afişler kesilmeden, zorlanmadan)
  - `vertical` → **9:16** (dikey kısa film/bölüm önizlemesi)
  - `wide` → **16:9** (hero ve yatay görseller)
- Görsel alanı `expo-image` `contentFit="cover"` + sabit en-boy oranı kullanır:
  görsel hiçbir zaman kendi başına serbest orana zorlanmaz. Kaynak görsel
  eksikse orijinal **gradient + tipografi placeholder**'ı aynı oranda çizilir.
- Placeholder'lar özgündür; telifli yapım afişleri kullanılmaz.

## 4. Tipografi

| Stil | Boyut / Satır | Ağırlık | Kullanım |
|------|---------------|---------|----------|
| display | 28/34 | 800 | Hero başlık |
| title | 20/26 | 700 | Ekran başlıkları, kart başlığı (büyük) |
| heading | 17/24 | 600 | Bölüm başlıkları, kart başlıkları |
| body | 15/22 | 400 | Genel metin |
| caption | 13/18 | 400 | Meta, açıklama |
| label | 12/16 | 600 | Rozetler, sekme etiketleri, buton metni |

Yazı yüzü: sistem varsayılanı (iOS: SF Pro, Android: Roboto). Faz 1'de özel font
yüklenmez; ileride marka fontu eklenirse `expo-font` ile token tabanına bağlanır.

## 5. Aralık ve Izgara

| Token | Değer |
|-------|-------|
| `space-1` | 4 |
| `space-2` | 8 |
| `space-3` | 12 |
| `space-4` | 16 |
| `space-5` | 20 |
| `space-6` | 24 |

- Ekran yatay kenar boşluğu: 16. Ray (rail) kart genişliği: poster 110–130,
  dikey 150–170. Hero yüksekliği ekranın ~%52'si.
- Dokunma hedefleri minimum **44×44**.
- Tüm kaydırılabilir listeler `Safe Area` bilinçli; sekme çubuğu alt güvenli
  alanı-padding'lidir.

## 6. Durum Tasarımları (her ekran için zorunlu)

| Durum | Desen |
|-------|-------|
| Loading | Basılı kart iskeletleri (shimmer yok, Faz 1'de sabit opaklık) |
| Empty | İkon + kısa başlık + açıklama + (varsa) eylem butonu |
| Error | İkon + başlık + açıklama + "Tekrar Dene" butonu |
| Network failure | Error varyantı: uçak/duvar ikonu + "Bağlantı sağlanamadı" |

## 7. Erişilebilirlik

- Tüm etkileşimli öğeler `accessibilityRole` + `accessibilityLabel` taşır.
- Metin/arka plan kontrastı WCAG AA (4.5:1) hedeflenir; `#F5F1EA` üzerine
  `#B71C36` kontrastı ~5.4:1 — buton zemini olarak güvenli.
- Dinamik tip: `allowFontScaling` kapalı DEĞİLDİR; düzenler %120 ölçeğe kadar
  bozulmayacak şekilde tasarlanır.
