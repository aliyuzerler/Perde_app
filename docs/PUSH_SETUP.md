# PUSH_SETUP — PerdeGo Bildirim Altyapısı Kurulum ve Test Rehberi (FAZ 9)

Bu belge, PerdeGo'nun uçtan uca bildirim altyapısının (Expo push → API →
uygulama içi merkez → admin izleme) kurulum adımlarını, simülatör/gerçek
cihaz test senaryolarını ve üretim geçiş kontrol listesini içerir.

---

## 1. Mimari Özet

```
[Olay kaynağı]                    [API — NestJS]                     [İstemci]
admin yayın akışı        →  PushDispatchService                →  Expo push servisi
  · title publish             · tercihe göre süzme                  (exp.host)
  · episode publish           · dedupKey (mükerrer yok)        →  cihaz (APNs/FCM)
billing (satın alma/iade)       · izin listeli payload              ↓
admin kredi düzeltmesi          · cihaz başına iz (PENDING/     mobil: dokunma →
abonelik hatırlatma               SENT/FAILED, attempts)          derin bağlantı
kampanya (admin panel)          · geçersiz token → invalidAt
                                · TTL süpürme (silme)
```

**Tablolar:** `devices` (çoklu cihaz token; `invalidAt/invalidReason` izi),
`notifications` (uygulama içi merkez; `dedupKey` tekilleştirme,
`pushSentAt`), `notification_sends` (cihaz başına gönderim izi),
`notification_preferences` (tercihler; `system` salt okunur — işlem
bildirimleri kapatılamaz), `notification_campaigns` (yönetim duyuruları).

**Güvenlik kuralları (uygulamada zorunlu):**
- Push payload'ına yalnız izin listesi girer: `kind, contentId, episodeId,
  campaignId, subscriptionId`. Tutar/kart/token/e-posta push'a ASLA girmez
  (`PushDispatchService.toPushMessage` — savunma derinliği).
- Tercihle çelişen kullanıcıya bildirim satırı bile açılmaz.
- Aynı olay için `dedupKey` (`EP_PUBLISHED:{episodeId}:{userId}` vb.)
  veritabanı düzeyinde tekilleştirir.
- Geçersiz token (sağlayıcı `DeviceNotRegistered`) `invalidAt` ile işaretlenir;
  `PUSH_INVALID_TOKEN_TTL_DAYS` (varsayılan 7 gün) aşınca süpürme siler.
- `PUSH_PROVIDER=simulated` üretimde env şeması tarafından reddedilir
  (sahte başarı yok).

## 2. Ortam Değişkenleri (apps/api/.env)

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PUSH_PROVIDER` | `none` | `none` → push kapalı (in-app bildirimler yine yazılır; gönderimler PENDING kalır). `simulated` → yalnız dev/test. `expo` → gerçek Expo push servisi. |
| `EXPO_PUSH_BASE_URL` | `https://exp.host` | Expo push API kökü (testler için geçersiz kılınabilir). |
| `PUSH_DISPATCH_INTERVAL_MS` | `30000` | PENDING gönderim dispatch çevrimi. |
| `PUSH_INVALID_TOKEN_TTL_DAYS` | `7` | Geçersiz token silme gecikmesi. |
| `SUB_REMINDER_DAYS` | `3` | Abonelik yenileme/bitiş hatırlatma penceresi. |
| `PUSH_SWEEP_INTERVAL_MS` | `3600000` | Süpürme çevrimi (token temizliği + hatırlatma). |

Mobil taraf (apps/mobile/.env): `EXPO_PUBLIC_EAS_PROJECT_ID` — EAS proje
kimliği (§4). Ayrıca `app.json` içinde `expo.extra.eas.projectId` yer alır;
`eas init` gerçek kimliği yazar.

## 3. Simülatör ve Expo Go Durumları (dürüst sınırlar)

| Ortam | Push token | Sonuç |
|---|---|---|
| iOS Simulator | ÜRETİLEMEZ (APNs kaydı yok) | Uygulama `UNSUPPORTED` durumunu sessizce atlar; uygulama içi merkez çalışır |
| Android Emulator (GMS'siz) | ÜRETİLEMEZ | Aynı şekilde atlanır |
| Expo Go (Android, SDK 53+) | Desteklenmiyor | `UNSUPPORTED (expo-go-android)` — dev build gerekir |
| Expo Go (iOS) | Kısmen çalışabilir | Güvenilir değil; test için dev build önerilir |
| **Gerçek cihaz (dev/preview build)** | **Üretilir** | Uçtan uca push testinin doğru yolu |

Uygulama içi bildirim merkezi (liste/okundu/tercihler) TÜM ortamlarda
çalışır — push yalnız dağıtım kanalıdır.

## 4. Gerçek Cihaz Kurulumu (uçtan uca push için)

1. **EAS projesi:** `cd apps/mobile && npx eas init` → üretilen projectId'yi
   `app.json → expo.extra.eas.projectId` alanına yaz (veya
   `EXPO_PUBLIC_EAS_PROJECT_ID` env).
2. **Dev build:** `npx eas build --profile development --platform android`
   (veya ios) → cihaza kur.
3. **API'yi expo sağlayıcıyla başlat:** `apps/api/.env` →
   `PUSH_PROVIDER=expo`.
4. **Giriş yap:** uygulama açılışında izin istenir; kabul ederseniz token
   `POST /notifications/devices` ile backend'e yazılır (upsert — her açılışta
   yenilenir). Admin paneli → Kullanıcılar → kullanıcı detayından doğrulayın.
5. **Test bildirimi:** Admin paneli → Bildirimler → "+ Yeni Duyuru" (ADMIN +
   adım-yukarı parolası) → derhal gönder. Cihaza push düşer; dokunma ile
   derin bağlantı çalışır (kampanya → bildirim merkezi).

## 5. Zorunlu Test Senaryoları (görev gereği)

### 5.1 Bildirim izni reddedilirse
- Cihaz ayarlarından PerdeGo bildirimlerini KAPALI yapın.
- Uygulamayı açın: izin istemi `PERMISSION_DENIED` döner; uygulama
  tekrar tekrar istemez, çökmaz; uygulama içi merkez çalışmaya devam eder.
- Sonrasında izni açıp uygulamayı yeniden başlatın → token kaydı tamamlanır
  (yeniden isteme, açılış akışında).

### 5.2 Token yenilenmesi
- Token her uygulama açılışında upsert edilir (`devices.pushToken` unique).
- Expo token'ı değişirse (uygulama güncellemesi/cihaz taşıma): eski token
  satırı kalır ama push `DeviceNotRegistered` döner → `invalidAt` işaretlenir
  → 7 gün sonra süpürülür; yeni token yeni satır olarak aktiftir.
- Çoklu cihaz: aynı hesapla iki cihazda giriş → iki token → bildirim HER
  İKİSİNE de gider (`notification_sends` cihaz başına iz taşır).

### 5.3 Uygulamanın kapalı olduğu durum (soğuk başlangıç)
- Uygulamayı tamamen kapatın; push gönderin (admin kampanyası veya
  `exp.host` üzerinden).
- Bildirim tepsisinde görünür; dokunun → uygulama açılır ve
  `getLastNotificationResponseAsync` ile derin bağlantı işlenir
  (EPISODE → oynatıcı, TITLE → içerik, diğer → merkez/hesap).

### 5.4 Ön plan davranışı
- Uygulama açıkken gelen push banner + ses ile gösterilir
  (`setNotificationHandler`); dokunma yine derin bağlantıya gider.

### 5.5 Uçtan uca doğrulama (sandbox'ta koşulan)
```bash
bash scripts/qa-faz9-run-acceptance.sh   # 36 kontrol + DB denetimi
```
Gerçek cihazda: yukarıdaki adımlar + admin panelinden kampanya gönderimi.

## 6. Zamanlanmış Görevler ve Ölçekleme Kararı

FAZ 9'da dispatch/süpürme çevrimleri **tek örnek in-process** (setInterval +
DB destekli kuyruk + koşullu claim) olarak kuruldu; Redis/BullMQ zorunluluğu
değerlendirildi: sandbox'ta Redis yok ve görevler DB tablolarından
izlenebilir durumda. Yatay ölçeklemede (çok API örneği) BullMQ'ya geçiş:

1. `REDIS_URL` + `bullmq` bağımlılığı eklenir.
2. `dispatchPending/runSweeps` çağrıları BullMQ worker'larına taşınır
   (tablolar aynı kalır — PENDING satırları iş kalemidir).
3. Çevrim env'leri (`PUSH_DISPATCH_INTERVAL_MS` vb.) repeat-job yapılandırmasına
   çevrilir. Kampanya claim'i (`SCHEDULED→SENDING` atomik güncelleme) zaten
   çoklu örneğe hazırdır.

## 7. Admin Paneli (izleme)

- **Bildirimler sayfası:** kampanya listesi + "Gönderim" butonu → cihaz
  başına PENDING/SENT/FAILED listesi, deneme sayısı, sağlayıcı, hata izi,
  maskeli token; durum filtresi + sayfalama.
- **POST /admin/push/dispatch** (ADMIN + step-up): dispatch + süpürmeleri
  elle tetikler (operasyonel retry/temizlik aracı).
- Kredi/abonelik bildirimleri `SYSTEM` tipiyle merkezde otomatik görünür.

## 8. Üretim Geçiş Kontrol Listesi

- [ ] `PUSH_PROVIDER=expo`
- [ ] `eas init` projectId `app.json` içinde (placeholder `__EAS_PROJECT_ID__` kalmamalı)
- [ ] iOS: APNs anahtarı EAS'e yüklenmiş; Android: FCM servis hesabı
- [ ] `PUSH_DISPATCH_INTERVAL_MS`/`PUSH_SWEEP_INTERVAL_MS` üretim değerleri
- [ ] Bildirim ikonu `app.json` expo-notifications plugin (`color`) yapılandırması
- [ ] Gerçek cihazda §5 senaryolarının tamamı elden geçirilmiş
- [ ] Admin panelinde gönderim izleri ekranı kontrol edilmiş
