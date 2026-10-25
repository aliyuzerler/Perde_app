# PerdeGo — Altyapı ve İşletme Maliyeti Hesabı

> Sürüm: 1.0 · Tarih: 2026-10-25
> Bu belge maliyetin **nasıl hesaplandığını** (parametreler ve formüller),
> doğrulanmış fiyatları ve üç trafik senaryosunu içerir.
> **Fiyat doğrulama kuralı:** Aşağıdaki tablodaki tüm satıcı fiyatları
> 2026-10-25 tarihinde satıcının resmi sayfasından okunmuştur. Bu belge
> dışındaki rakamlar ("teyit edilecek" etiketli satırlar) tahmindir ve
> teklif/liste fiyatı teyidiyle değiştirilir. Fiyatlar USD ve vergisizdir.

## 1. Hesaplama Yöntemi

**Adım 1 — Trafik parametreleri.** Hedef pazar Türkiye; dikey kısa içerik.

| Parametre | Sembol | S | M (Büyüme) | L (Ölçek) |
|-----------|--------|---|------------|-----------|
| Aylık aktif kullanıcı | MAU | 5.000 | 50.000 | 200.000 |
| Günlük aktif kullanıcı | DAU | 1.000 | 10.000 | 40.000 |
| Kullanıcı başına günlük izleme | m | 25 dk | 25 dk | 25 dk |
| **Aylık teslim edilen dakika** | **D** | **750.000** | **7.500.000** | **30.000.000** |
| Katalog (yüklü içerik) | C | 5.000 dk (~83 saat) | 12.000 dk | 25.000 dk |

`D = DAU × m × 30`.

**Adım 2 — Dakika → GB çevirimi.** Dikey HLS tesliminde ABR ile ortalama
**3 Mbps** kabul edilir (720p/1080p ağırlıklı mobil izleme):
`1 dk ≈ 3 Mbps × 60 / 8 = 22,5 MB ≈ 0,0225 GB`.
Depolanan dosya boyutu için tüm rendition'ların toplam bit hızı ~9,4 Mbps:
`1 dk ≈ 0,0705 GB` (yalnızca GB bazlı depolama faturalayan satıcılar için).

**Adım 3 — Satıcı formülleri.**

| Satıcı | Teslim maliyeti | Depolama maliyeti |
|--------|-----------------|-------------------|
| Cloudflare Stream | `D / 1.000 × $1` | `C / 1.000 × $5` |
| Bunny Stream | `D × 0,0225 GB × $0,005` | `C × 0,0705 GB × $0,01` |
| Mux | `(D − 100.000 ücretsiz) × harmanılmış dk fiyatı*` | `C × dk fiyatı (≤1080p $0,003)` |

\* Harmanılmış Mux teslim oranı: 720p $0,0008 + 1080p $0,001 → 50/50
karışım varsayımıyla **$0,0009/dk**. 4K ağırlığı artarsa oran yükselir.

## 2. Doğrulanmış Fiyatlar (okuma tarihi: 2026-10-25)

| Satıcı | Kalem | Fiyat | Kaynak |
|--------|-------|-------|--------|
| Cloudflare Stream | Depolama | $5 / 1.000 dk / ay (ön ödemeli blok) | developers.cloudflare.com/stream/pricing (sayfa günc. 15.10.2026) |
| Cloudflare Stream | Teslim | $1 / 1.000 dk (bant genişliği dahil, kodlama ücretsiz) | aynı |
| Bunny Stream | Depolama | $0,01 / GB / ay | bunny.net/stream |
| Bunny Stream | Teslim | $0,005 / GB (kodlama ücretsiz, güvenlik ücreti yok) | bunny.net/stream + bunny.net/pricing |
| Bunny Stream | Aylık alt sınır | ~$3,25 (Volume) – $4,50 (Standard) hesaplayıcı alt sınırı | bunny.net/stream |
| Mux | Teslim | İlk 100.000 dk/ay ücretsiz; 720p $0,0008/dk, 1080p $0,001/dk, 2K $0,0016, 4K $0,0032 | mux.com/pricing |
| Mux | Depolama | 720p $0,0024, 1080p $0,003, 2K $0,0048, 4K $0,0096 / dk / ay; izlenmeyen asset'te soğuk depoya kadar %60 indirim | mux.com/pricing |
| Mux | Kodlama | Dosya girişi ücretsiz (720p–4K) | mux.com/pricing |
| Apple | Komisyon | %15 (Small Business Program; önceki yıl işlem hasılatı ≤ $1M) / standart %30 | developer.apple.com/app-store/small-business-program |
| Google Play | Servis bedeli (TR dahil kalan pazarlar) | Abonelik **%15** (gelirden bağımsız); diğer işlemler ilk $1M/yıl **%15**, üzeri %30 | support.google.com/googleplay/android-developer/answer/112622 |
| Google Play | ABD/AB/UK/JP/AU yeni tablo | Abonelik %10 + %5 faturalama bedeli vb. (bölgesel yayılım izlenmeli) | aynı kaynak |
| RevenueCat | Ücret | $2.500 aylık takip edilen gelire kadar ücretsiz; sonra %1 | revenuecat.com/pricing |

## 3. Senaryo Hesapları (aylık, USD)

### 3.1 Video teslim + depolama

| Kalem | S (750K dk) | M (7,5M dk) | L (30M dk) |
|-------|-------------|-------------|------------|
| **Bunny Stream** teslim | 16.875 GB × $0,005 = **$84** | 168.750 GB × $0,005 = **$844** | 675.000 GB × $0,005 = **$3.375** |
| Bunny depolama | $4 | $8 (12.000 dk) | $18 (25.000 dk) |
| **Bunny toplam** | **~$88** | **~$852** | **~$3.393** |
| **Cloudflare** teslim | $750 | $7.500 | $30.000 |
| CF depolama | $25 | $60 | $125 |
| **CF toplam** | **~$775** | **~$7.560** | **~$30.125** |
| **Mux** teslim | 650K dk × $0,0009 = **$585** | 7,4M × $0,0009 = **$6.660** | 29,9M × $0,0009 = **$26.910** |
| Mux depolama | $15 | $36 | $75 |
| **Mux toplam** | **~$600** | **~$6.696** | **~$26.985** |

**Özet birim maliyet (1.000 teslim dk):** Bunny ~$0,11 · Mux ~$0,90 ·
Cloudflare $1,00. Dikey/kısa içerikte düşük bit hızı GB bazlı faturalamayı
önemli ölçüde avantajlı kılar — bu, ARCHITECTURE.md §6.2'deki Bunny kararının
ekonomik dayanağıdır. Süre bazlı faturalamanın tahmin edilebilirliği gerekirse
Cloudflare iyi bir ikinci seçenektir.

### 3.2 Uygulama altyapısı (teyit edilecek satırlar tahminidir)

| Kalem | S | M | L | Not |
|-------|---|---|---|-----|
| API + worker sunucusu (4 vCPU/8 GB) | ~$20 | ~$40 (2 düğüm) | ~$120 | VPS/container liste fiyat teyidi yapılacak |
| Yönetilen PostgreSQL (2 vCPU, PITR) | ~$35 | ~$70 | ~$150 | Yönetilen servis teklifi esası |
| Redis (1–2 GB) | ~$10 | ~$20 | ~$45 | Kuyruk + throttle |
| Afiş/görsel obj. depolama + egress | ~$5 | ~$15 | ~$35 | Egress ücretsiz model tercih edilir |
| E-posta (şifre, bildirim) | ~$0–15 | ~$20 | ~$60 | Sağlayıcı teyidi yapılacak |
| EAS Build/Update | ücretsiz kademe | ~$29+ | teyit | Expo planları yayın öncesi teyit edilecek |
| Hata izleme (Sentry benzeri) | ~$0–26 | ~$26–90 | ~$100 | Geliştirici planı kademesi |
| **Altyapı toplamı (video hariç)** | **~$75–125** | **~$220–290** | **~$650–750** | |

### 3.3 İşletme kalemleri (MVP'de zorunlu)

| Kalem | Not |
|-------|-----|
| Mağaza komisyonu | Gelirin %15 (Apple SBP + Google abonelik/ilk $1M) — brütten düşülür |
| RevenueCat | ≤ $2.500 MTR ücretsiz; sonra gelirin %1 (doğrulandı) |
| İçerik üretim/lisanslama maliyeti | Bu hesabın kapsamı dışındadır (işletme bütçesi ayrı) |
| KVKK/advokasi, muhasebe, D-U-N-S vb. | Yıllık sabit; işletme bütçesine |

## 4. Birim Ekonomi Örneği (M senaryosu)

Varsayımlar (tümü açık varsayım, teyitli değildir): abonelik aylık
**₺149,99**, kredi paketi ₺79,99 (Apple/Google fiyat kademeleri yayın öncesi
teyit edilir); **1 USD ≈ ₺43** kurs varsayımı — yalnızca bu örnek hesap
içindir, kur riski §5'te değerlendirilir.

Birim brüt: abonelik ₺149,99 ≈ **$3,49**, kredi paketi ₺79,99 ≈ **$1,86**.

| Kalem | Ay |
|-------|----|
| Abonelik: 1.200 × ₺149,99 = ₺179.988 | ~$4.186 brüt |
| Kredi paketi: 250 × ₺79,99 = ₺19.998 | ~$465 brüt |
| Mağaza komisyonu %15 (brüt toplam üzerinden) | −$698 |
| RevenueCat %1 | −$47 |
| Video (Bunny ≈ $852) + altyapı (§3.2 M orta değer ≈ $260) | −$1.112 |
| **Yaklaşık katkı** | **≈ +$2.794/ay** |

Kırılım noktası: toplam aylık maliyet ≈ $1.112 ÷ net abonelik geliri ≈ $2,93
(%15 komisyon + %1 RC sonrası) → **≈ 380 ödeyen abonelik eşdeğeri**.
Hedef karşılaştırması: M senaryosunda %4 abonelik dönüşümü × 50.000 MAU =
2.000 abone (dönüşüm hedefi: PRD §7) durumunda katkı ≈ +$4.750/ay
(yalnızca abonelik geliri baz alınarak).

## 5. Hassasiyet ve Riskler

| Değişken | Etki | Önlem |
|----------|------|-------|
| Ortalama bit hızı 3 → 5 Mbps çıkarsa | Bunny teslim maliyeti ×1,67 (M: $844 → ~$1.407) | ABR parametreleri sağlayıcıda kontrol edilir; harman oranı raporlanır |
| Google ABD/AB tablosunun TR'ye yayılması | Abonelik servis bedeli %15 → %10+5% (nötr-benzer), diğer işlemler değişken | Çeyreklik politika izleme (§6) |
| Apple SBP eşiği aşılırsa ($1M+) | Komisyon %15 → %30 | Gelir modeli güncellenir; kurumsal fiyatlandırma gözden geçirilir |
| Mux ücretsiz 100K dk kotası | S senaryosunda etkin teslim maliyeti ~%15 düşer | Karşılaştırma tablolarında zaten hesaba katıldı |
| TRY/USD kuru | TRY gelirli, USD maliyetli kalemlerde kur riski | Yıllık fiyat revizyonu; USD bazlı iç raporlama |

## 6. Yeniden Doğrulama Prosedürü

1. **Çeyreklik:** Tablo 2'deki her satıcı sayfası yeniden okunur, tarih
   güncellenir; farklar bu belgeye yansıtılır (PR içinde "pricing refresh").
2. **Sağlayıcı değişikliği eşiği:** Bunny etkin birim maliyeti 1.000 dk için
   $0,30'u aşarsa (3× eşik) Cloudflare/Mux karşılaştırması yeniden yapılır.
3. **Yayın öncesi:** Apple SBP koşulları, Google servis bedeli tablosu ve
   EAS/Expo planları tek tek teyit edilir; "teyit edilecek" etiketli satırlar
   gerçek listelere dönüşür.
