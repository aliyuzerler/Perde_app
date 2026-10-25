# PerdeGo — Ürün Gereksinimleri Dokümanı (PRD)

> Sürüm: 1.0 · Tarih: 2026-10-25 · Durum: Onaya hazır
> Bu belge; ürün vizyonunu, kullanıcı senaryolarını, MVP kapsamını ve iş
> kurallarını tanımlar. Mimari kararlar için bkz. `ARCHITECTURE.md`,
> faz planı için bkz. `RELEASE_PLAN.md` ve `ROADMAP.md`.

## 1. Ürün Özeti ve Vizyon

**PerdeGo**, dikey (9:16) kısa filmler ve mini dizilere odaklanan, mobil öncelikli
bir premium yayın platformudur. Ürün; sinematik, koyu ve yüksek kaliteli bir
izleme deneyimini, TV kalitesindeki içerik ile mobilde "bir solukta izleme"
alışkanlığını birleştirir.

**Değer önerisi:**

1. **Dikey ekran için üretilmiş içerik** — yatay içerikten kesilmiş değil, 9:16
   formatında çekilmiş kısa filmler ve mini diziler.
2. **Esas erişim modeli** — ücretsiz bölümlerle giriş, abonelikle sınırsız
   izleme, kredi ile tekil premium bölüm açma. Kullanıcıya üç farklı
   katkı noktası sunulur.
3. **Sinematik marka dili** — koyu zemin (`#0D0D0F`), marka kırmızısı
   (`#B71C36`), dikdörtgen kartlar, 0–4 px köşe yarıçapı (bkz. `DESIGN.md`).

**Ürün hedefi (MVP sonunda):** Türkiye'de yayınlanan, App Store ve Google Play
üzerinden indirilebilen, içerik yönetimi tamamen web admin panelinden yapılabilen
çalışan bir monetizasyon döngüsüne sahip platform.

## 2. Hedef Kitle ve Personalar

| Persona | Tanım | Ana ihtiyaç | Kullandığı model |
|---------|-------|-------------|------------------|
| **P1 — Boş Vaktini Bölerek İzleyen** (22–34) | Vardiyalı çalışan, günde 2–3 kez 10–15 dk boşluk | Telefonda dikey, hızlı başlayan, kesintisiz kısa içerik | Ücretsiz bölümler + abonelik |
| **P2 — Dizi Tüketicisi** (25–45) | Haftada birkaç saat dizi izler, yeni bölüm çıkışını takip eder | Yeni bölüm bildirimi, "devam et", favoriler | Abonelik (aylık/yıllık) |
| **P3 — Seçici İzleyici** (18–40) | Tek tek içerik seçer, abonelik istemez | Tek bölümü tek seferlik krediyle açabilmek | Kredi paketleri |

## 3. Kullanıcı Senaryoları

**US-01 — Kayıt ve ilk izleme:** Kullanıcı e-posta ile kayıt olur (ad + e-posta +
şifre), uygulamaya girer. Ana sayfada "Ücretsiz Bölümler" rayı görünür; herhangi
bir kısa filme dokunur, giriş/kayıt zorunluluğu olmadan konuk izlemeye başlar
(bkz. BR-08). Beğenirse kayıt olup izleme geçmişinin saklanmasını ister.

**US-02 — Abone olma:** P2, sevdiği bir dizinin 2. bölümünde "Abonelik Gerekli"
kilit ekranını görür. Plan ekranından aylık planı seçer, App Store/Play
abirometer üzerinden onaylar. Satın alma doğrulanınca bölüm anında açılır;
tüm `SUBSCRIPTION` içerikler kilit logolu izlenebilir hâle gelir.

**US-03 — Kredi ile bölüm açma:** P3 abone olmak istemez. 10 kredilik paket
satın alır (StoreKit/Play Billing). Premium bir bölümün kilit ekranında
"Bölümü Aç (2 kredi)" seçeneğini onaylar. Kredisi düşülür ve bölüm bu hesapta
**kalıcı olarak** açılır (BR-03); bir sonraki girişte kilit yoktur.

**US-04 — Devam et:** Kullanıcı yarım bıraktığı bölüme Ana Sayfa → "İzlemeye
Devam Et" rayından döner; oynatıcı kaldığı saniyeden başlar (BR-09).

**US-05 — Yeni bölüm bildirimi:** Abone bir kullanıcının favorilerine eklediği
diziye yeni bölüm yayınlanır; cihazına push bildirim gelir, bildirime
dokununca ilgili bölüm sayfası açılır.

**US-06 — Hesap silme:** Kullanıcı Profil → Hesap → "Hesabımı Sil" adımını
izler; şifre onayı sonrası hesabı silinir (BR-11). Uygulama silme öncesi
kalan kredi bakiyesi ve aktif aboneliğin mağazadan iptal gerektirdiğini açıkça
bildirir.

**US-07 — Bağlantı kaybı:** Oynatma sırasında ağ kopar; oynatıcı
"Bağlantı sağlanamadı — Tekrar Dene" durumuna geçer, ilerleme kaybolmaz.

## 4. Özellik Gereksinimleri

Öncelik anahtarı: **M** = MVP (Faz 1–7), **P** = MVP sonrası.

### 4.1 Kimlik ve Hesap
| ID | Gereksinim | Öncelik |
|----|------------|---------|
| F-01 | E-posta + şifre ile kayıt, giriş, çıkış (Zod doğrulamalı formlar) | M |
| F-02 | Profil görüntüleme/güncelleme (ad, avatar, arayüz dili) | M |
| F-03 | Şifre değiştirme, şifremi unuttum (e-posta sıfırlama) | M |
| F-04 | Uygulama içi hesap silme (Apple 5.1.1(v) ve Google Data safety uyumlu) | M |
| F-05 | Apple/Google ile sosyal giriş | P |

### 4.2 Katalog ve Keşif
| ID | Gereksinim | Öncelik |
|----|------------|---------|
| F-10 | Ana sayfa rayları: Hero, Devam Et, Yeni Eklenenler, Ücretsiz, Kategoriler | M |
| F-11 | Kategori sayfaları (sayfalı grid) | M |
| F-12 | Arama (başlık + özgün ad, sayfalı; boş/sonuç yok durumları) | M |
| F-13 | İçerik detayı: afiş, özet, kadro, sezon/bölüm listesi, erişim rozetleri | M |
| F-14 | İçerik türleri: dikey kısa film (`SHORT_FILM`), dizi (`SERIES`), mini dizi (`SERIES` + `format=MINI`) | M |
| F-15 | Kişiselleştirilmiş öneriler | P |

### 4.3 Oynatma ve İzleme
| ID | Gereksinim | Öncelik |
|----|------------|---------|
| F-20 | HLS oynatma, ABR kalite, dikey tam ekran, 10 sn ileri/geri | M |
| F-21 | Sunucu imzalı kısa ömürlü oynatma URL'si (erişim kararı sunucuda) | M |
| F-22 | İzleme geçmişi + konum senkronizasyonu (izlemeye devam et) | M |
| F-23 | Favorilere ekleme/çıkarma ve favoriler sekmesi | M |
| F-24 | Çevrimdışı indirme | P |
| F-25 | Altyazı (TR/EN) | P |

### 4.4 Monetizasyon
| ID | Gereksinim | Öncelik |
|----|------------|---------|
| F-30 | Bölüm başına erişim türü: `FREE` / `SUBSCRIPTION` / `CREDIT` | M |
| F-31 | Aylık + yıllık otomatik yenilenen abonelik (StoreKit + Play Billing) | M |
| F-32 | Kredi paketleri (consumable IAP), kredi cüzdanı, işlem geçmişi | M |
| F-33 | Kredi ile bölüm kilidi açma (hesap bazlı, kalıcı) | M |
| F-34 | Paywall ekranları: plan karşılaştırma, paket listesi, bakiye durumu | M |
| F-35 | İade/iptal akışları: mağaza yönlendirmesi + sunucu iptal işleme | M |
| F-36 | Abonelik teklifleri (intro price, teklif kodları) | P |

### 4.5 Bildirimler
| ID | Gereksinim | Öncelik |
|----|------------|---------|
| F-40 | Push izin akışı ve cihaz token kaydı | M |
| F-41 | Yeni bölüm / yeni içerik bildirimleri (favori + kategori bazlı) | M |
| F-42 | Uygulama içi bildirim merkezi + okunmadı işareti | M |
| F-43 | Bildirim tercihleri (yeni bölüm / duyuru / kampanya) | M |

### 4.6 Admin Paneli (Next.js, web)
| ID | Gereksinim | Öncelik |
|----|------------|---------|
| F-50 | Admin girişi, RBAC (ADMIN / EDITOR), oturum yönetimi | M |
| F-51 | İçerik/seri/kategori CRUD + yayın akışı (draft → published) | M |
| F-52 | Bölüm yönetimi + video yükleme/encode durumu görüntüleme | M |
| F-53 | Kullanıcı arama, detay, askıya alma | M |
| F-54 | Abonelik/kredi işlemleri listesi, manuel kredi düzeltme (denetim kayıtlı) | M |
| F-55 | Bildirim kampanyası gönderimi | M |
| F-56 | Temel metrikler (DAU, izlenme, gelir) | P |

## 5. İş Kuralları (Bağlayıcı)

Bu kurallar hem PRD hem API/SECURITY belgelerinin referansıdır; ihlali
kabul kriterlerini bozar.

| ID | Kural |
|----|-------|
| **BR-01** | `FREE` erişimli bölümler, oturum olsun olmasın **kredi harcamadan** ve abonelik aranmadan oynatılır. |
| **BR-02** | `SUBSCRIPTION` erişimli bölümler yalnızca **geçerli aboneliği** olan hesaplara açılır. Geçerlilik her oynatma oturumunda sunucuda yeniden doğrulanır; abonelik dönemi bittiğinde erişim otomatik kesilir (grace period hariç, bkz. BR-10). |
| **BR-03** | `CREDIT` erişimli bir bölüm, başarılı kredi işleminden sonra kullanıcının **hesabına** kaydedilir (`episode_unlocks`); açılma hakkı cihaza değil hesaba bağlıdır ve süresizdir. |
| **BR-04** | Kredi bakiyesi **yalnızca değiştirilemez (append-only) ledger kayıtları** üzerinden değişir. Bakiye alanı doğrudan güncellenmez; gösterilen bakiye, ledger'dan türetilen önbellektir ve her ledger yazımıyla aynı veritabanı işleminde güncellenir. |
| **BR-05** | **Satın alınan krediler süresizdir.** Kampanya/abonelik ile verilen hediye krediler ayrı tutulur ve son kullanma tarihi taşıyabilir. (Apple'ın satın alınan kredilerin sürekliliğine ilişkin yaklaşımı nedeniyle satın alma akışında sona erme tanımlanmaz; hukuki doğrulama `RELEASE_PLAN.md` Faz 6 checklist'inde yer alır.) |
| **BR-06** | **İdempotens:** Aynı mağaza satın alması veya bölüm açma isteği iki kez işlenmez. Tüm satın alma doğrulama ve unlock uçları `Idempotency-Key` zorunlu tutar; mağaza işlem kimlikleri `unique(platform, storeTransactionId)` ile tekilleştirilir. |
| **BR-07** | **Yetkilendirme:** Her kullanıcı yalnızca yetkili olduğu içeriğe erişir. Oynatma URL'si üretimi (imzalı token) ancak sunucu tarafı yetki kontrolünden geçer; istemcinin erişim kararı verme yetkisi yoktur (Genel Kural 10). |
| **BR-08** | Konuk kullanıcı (oturumsuz) `FREE` içerikleri izleyebilir; izleme geçmişi ve favoriler cihazda yerel tutulur, kayıt sonrası sunucuya taşınır. |
| **BR-09** | İzleme konumu en fazla 10 sn aralıkla sunucuya gönderilir; "devam et" noktası tamamlanmış bölümlerde bir sonraki bölüme işaret eder. |
| **BR-10** | Abonelik yenileme başarısızlığında Apple/Google **grace period** içinde erişim devam eder; dönem sonunda erişim kesilir, ödeme düzeltildiğinde otomatik geri açılır. İptal eden kullanıcı dönem sonuna kadar erişmeye devam eder. |
| **BR-11** | Hesap silme; kişisel verileri anonimleştirir/gunar, cihaz token'larını ve oturumları iptal eder. **Finansal ledger kayıtları yasal saklama için anonimleştirilmiş biçimde korunur**; bakiye sıfırlanır ve yeniden kurulamaz. |
| **BR-12** | İade (refund) bildirimi geldiğinde: satın alınmış ve **harcanmamış** krediler geri alınır; krediyle açılmış bölüm hakkı, iade politikamıza göre (tek seferlik nazik kullanım) yönetilir; abonelik iadesinde erişim derhâl kesilir. Tüm iadeler ledger'a negatif kayıt olarak yazılır. |
| **BR-13** | Aynı içerik için admin panelden yayınlanan `accessType` değişikliği geriye dönük hakları bozmaz: krediyle açılmış bölüm sonradan `FREE` olsa da kullanıcıda kalır. |

## 6. MVP Kapsamı

**MVP İçinde (Faz 1–7):** F-01..F-04, F-10..F-14, F-20..F-23, F-30..F-35,
F-40..F-43, F-50..F-55 + yukarıdaki tüm iş kuralları + her ekran için
loading/empty/error/network durumları + TR/EN arayüz dili.

**MVP Dışında (bilinçli erteleme):**

| Ertilen | Neden | Ana risk |
|---------|-------|----------|
| Sosyal giriş (F-05) | StoreKit/Play Billing doğrulama hattı MVP'nin kritik yolu; sosyal giriş erişim modelini değiştirmez | Tekrar gelirse auth şeması genişletilir (`identities` tablosu) |
| Çevrimdışı indirme (F-24) | DRM/indirme güvenliği ayrı bir mühendislik bloğu; MVP'de HLS imzalı akış yeterli | İzin verilmeden kopyalama — risk post-MVP DRM ile azaltılır |
| Altyazı (F-25), öneriler (F-15), teklifler (F-36), metrik panel (F-56) | Monetizasyon döngüsü için zorunlu değil | Düşük — API alanları ileriye dönük tasarlandı |
| Reklam modeli | Marka konumu premium; MVP'de yok | Yok |

**MVP kararlarının kabul kriterleri:** Her ertelenen özellik için "geri gelme
maliyeti" ARCHITECTURE.md'deki şema kararlarıyla düşük tutulur (örn. `cast`,
`genres`, `episode_media.provider` alanları şimdiden jeneriktir).

## 7. Başarı Metrikleri (KPI)

| Metrik | MVP hedefi (3. ay) |
|--------|--------------------|
| Kayıtlı kullanıcı | 10.000 |
| DAU / MAU oranı | ≥ %18 |
| Ortalama izlenme (kullanıcı/gün) | ≥ 20 dk |
| Ücretsiz → abonelik dönüşümü | ≥ %4 |
| Ücretsiz → kredi paketi dönüşümü | ≥ %1,5 |
| Abonelik iptal oranı (aylık) | ≤ %8 |
| Oynatma hata oranı | ≤ %0,5 |

## 8. Uyumluluk ve Yerelleştirme

- Arayüz dili varsayılan **Türkçe**; `en` sözlüğü Faz 1'den itibaren bakılır
  (bkz. `ARCHITECTURE.md` §i18n). Sunucu metinleri (`FeedSection.title`) TR/EN
  kolonlu saklanır.
- Kişisel veri işleme **KVKK** uyumludur: açık rıza metinleri, veri envanteri,
  silme hakkı (BR-11). Ayrıntı `SECURITY.md` §10'da.
- Yaş sınırlama: içerik başına `ageRating` (7+/13+/16+/18+); 18+ içerik
  profil yaş onayı olmadan açılmaz.
