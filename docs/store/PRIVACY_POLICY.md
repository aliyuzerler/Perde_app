# PerdeGo — Gizlilik Politikası (TASLAK v1.0)

> ⚠️ **YASAL UYARI**: Bu belge yayın öncesi bir hukuk danışmanı tarafından
> gözden geçirilmeli; veri sorumlusu kimliği, iletişim adresi ve barındırma
> yargı yetkisi (`LERİ_` alanları) doldurulmalıdır. Mağaza gönderiminde bu
> metnin yayımlanmış bir URL'de erişilebilir olması ZORUNLUDUR.

Son güncelleme: 2026-10-26

## 1. Veri Sorumlusu

PerdeGo uygulaması, `LERİ_ŞİRKET_ADı` ("PerdeGo") tarafından işletilir.
İletişim: `LERİ_DESTEK_EPOSTA`

## 2. Toplanan Veriler

| Veri | Amaç | Saklama |
|------|------|---------|
| E-posta adresi, görünen ad | Hesap oluşturma, oturum, e-posta doğrulama | Hesap silinene kadar |
| Parola özeti | Kimlik doğrulama (argon2id — düz metin asla saklanmaz) | Hesap silinene kadar |
| İzleme geçmişi ve konum ("kaldığın yerden devam") | İzleme deneyimi | Hesap silinene kadar |
| Favoriler / izleme listesi | Kullanıcı deneyimi | Hesap silinene kadar |
| Cihaz push token'ı (isteğe bağlı) | Yeni bölüm / satın alma bildirimleri | Token geçersiz kılınana veya bildirim izni kaldırılana kadar |
| Bildirim tercihleri | Hangi bildirimlerin gönderileceği | Hesap silinene kadar |
| Satın alma işlemleri (Apple/Google/RicevutCat işlem kimliği) | Abonelik/kredi haklarının doğrulanması, iadeler | Muhasebe mevzuatı süresince |
| Kredi bakiyesi defteri (append-only) | Bakiye bütünlüğü, denetim | Hesap silinene kadar |
| Yönetici işlem kayıtları (audit log) | Platform güvenliği ve denetim | Mevzuat süresince |

**Toplanmayanlar**: Kart/banka bilgisi (ödemeler mağaza altyapısında),
konum, kişi listesi, reklam kimlikleri, üçüncü taraf reklam/izleme
tanımlayıcıları. Uygulama reklam SDK'sı İÇERMEZ.

## 3. Verilerin İşlenme Amaçları

1. Hizmetin sunulması (oynatma, kaldığı yerden devam, kilitli bölüm açma).
2. Satın almaların doğrulanması (mağaza makbuzlarının RevenueCat REST
   servisiyle ters sorgulanması — makbuz verisi ödeme sağlayıcıyla paylaşılır).
3. Bildirim gönderimi (yalnızca kullanıcının tercihleri ve OS izni dahilinde).
4. Hizmet güvenliği (hız sınırlama, kötüye kullanım tespiti, denetim kayıtları).

## 4. Üçüncü Taraf Hizmetler

| Hizmet | Paylaşılan veri | Amaç |
|--------|-----------------|------|
| RevenueCat | Anonim kullanıcı kimliği (app_user_id), mağaza işlem kimlikleri | Abonelik/kredi doğrulama |
| Apple / Google mağazaları | Ödeme işlemi (mağaza hesabınız üzerinden) | Satın alma |
| Expo push servisi (exp.host) | Cihaz push token'ı | Bildirim teslimi |
| E-posta sağlayıcı (SMTP) | E-posta adresi | Doğrulama/şifre sıfırlama e-postaları |

## 5. Hesap Silme (KVKK m.7 / mağaza zorunluluğu)

Uygulama içinde **Profil → Hesabımı Sil** adımından talep oluşturabilirsiniz.
Talep üzerine:
- Hesap önce **nefalet süresine** (varsayılan 30 gün) alınır; bu sürede
  oturum açarak silme talebini geri alabilirsiniz.
- Nefalet sonunda kimlik verileri, izleme geçmişi, favoriler, cihaz
  token'ları ve bildirimler **kalıcı olarak silinir**.
- Kredi defteri ve satın alma kayıtlarının finansal bölümleri, muhasebe
  mevzuatının gerektirdiği asgari sürede saklanır (kimlikle
  ilişkilendirilemez hale gelir).
- Teknik detay: `docs/ACCOUNT_DELETION.md` (grace/purge süreci ve uçlar).

## 6. Çocukların Gizliliği

Uygulama 13 yaş altına yönelik değildir. Yaş derecelendirmesi mağaza
anketleriyle bildirilir; 18+ içerikler sunucu tarafında yaş kısıtıyla
korumalıdır (AGE_RESTRICTED).

## 7. Haklarınız

KVKK m.11 ve GDPR kapsamında erişim, düzeltme, silme ve işlemeye itiraz
haklarınız için `LERİ_DESTEK_EPOSTA` adresine başvurabilirsiniz.
