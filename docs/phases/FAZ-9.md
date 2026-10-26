# FAZ 9 — Uçtan Uca Bildirim Altyapısı (geliştirme raporu)

| | |
|---|---|
| **Faz** | FAZ 9 — Mobil push (Expo Notifications) + backend bildirim servisi + admin izleme |
| **Tarih** | 2026-10-26 |
| **Durum** | Geliştirme tamam; kabul koşumu 36/36 canlı probe + 504 otomatik test yeşil |

## 1. Kapsam ve Kararlar

**Mobil (Expo Notifications):**
- `expo-notifications@58.1.6` kuruldu; `app.json`'a plugin (`color`, `mode`) + `expo.extra.eas.projectId` yer tutucusu eklendi.
- `services/notifications/push-registration.ts`: izin isteme → Expo push token → `POST /notifications/devices` (upsert; **her açılışta yenilenir**). Simülatör/Expo Go Android'de dürüst `UNSUPPORTED`, izin reddinde `PERMISSION_DENIED` (tekrar istemez).
- `services/notifications/deep-link.ts` (saf, testli): EPISODE → `/player/{id}`, TITLE → `/content/{id}`, CAMPAIGN → `/notifications`, BILLING/SUB_REMINDER → `/account`; bilinmeyen/eksik veride `null` (çökmez).
- Kök layout `NotificationBridge`: ön plan sunumu, dokunma yanıtı dinleyicisi, **soğuk başlangıç** (`getLastNotificationResponseAsync`), oturum açılınca token kaydı/yenileme.
- **Bildirim merkezi ekranı** (`/notifications`): okunmamış vurgusu, tek/tümü okundu, sayfalama; **tercihler ekranı** (`/account/notification-preferences`): 3 toggle + `system` salt okunur açıklaması; profil menüsüne iki giriş.
- i18n tr/en (20+ anahtar), http + mock adapter'lara 7 bildirim metodu.

**Backend (NestJS):**
- Migration `20261027090000_faz9_push`: `notification_sends` (cihaz başına iz: PENDING/SENT/FAILED + attempts + provider + ticketId + lastError), `devices.invalidAt/invalidReason`, `notifications.dedupKey` + unique `(userId, dedupKey)`.
- **Push sağlayıcı portu** (port deseni): `ExpoPushProvider` (exp.host, 100'lük parça, bilet eşleme), `SimulatedPushProvider` (dev/test; 'invalid' token → DeviceNotRegistered; üretimde env refine reddeder), `NoopPushProvider` (none → gönderimler dürüstçe PENDING kalır).
- **PushDispatchService** (ayrı servis): tercih süzme (tercihle çelişen kullanıcıya satır bile açılmaz), dedupKey'li oluşturma, çoklu cihaz fan-out, dispatch çevrimi (PENDING→SENT/FAILED, MAX_ATTEMPTS'e kadar retry), geçersiz token işaretleme + TTL süpürme, abonelik hatırlatma süpürmesi (yenileme/bitiş/ödeme sorunu; dönem başına dedup), izin listeli payload üretimi.
- **Olay tetikleyicileri:** içerik/bölüm İLK yayını (NEW_CONTENT herkese + NEW_EPISODE favori/takip), mağaza satın alma ve iade (SYSTEM/BILLING — tutar payload'da yok), admin kredi düzeltmesi, kampanya türüne göre tercih filtresi + push fan-out.
- **Admin:** `GET /admin/notification-campaigns/{id}/sends` (cihaz başına iz + sayaçlar + durum filtresi), `POST /admin/push/dispatch` (ADMIN+step-up; dispatch + süpürmeleri elle tetikler).
- Env: `PUSH_PROVIDER/EXPO_PUSH_BASE_URL/PUSH_DISPATCH_INTERVAL_MS/PUSH_INVALID_TOKEN_TTL_DAYS/SUB_REMINDER_DAYS/PUSH_SWEEP_INTERVAL_MS` (loadEnv'e eklendi — **ilk koşumda eksikti, testler canlı yakaladı**).

**Karar — Redis/BullMQ:** sandbox'ta Redis yok; görevler DB tablolarından izlenebilir olduğundan tek örnek in-process çevrimler + DB destekli kuyruk kuruldu. BullMQ geçiş yolu PUSH_SETUP.md §6'da belgelendi (tablolar aynı kalır).

## 2. Geliştirme Sırasında Bulunan ve Düzeltilen Kusurlar

| Kod | Önem | Kusur | Düzeltme |
|---|---|---|---|
| F9-01 | **Yüksek** | `dispatchPending` biletleri `deviceId` ile eşliyordu; aynı cihaza giden farklı bildirimlerde `find` İLK eşleşmeyi bulup **yanlış gönderim satırını** güncelliyordu (çoklu cihaz × çoklu bildirimde izleme bozulur) | `PushMessage/Ticket`'a `sendId` eklendi; eşleştirme gönderim satırı kimliğiyle (bütünleşik test canlı yakaladı) |
| F9-02 | Orta | FAZ 9 env değişkenleri `loadEnv` açık alan listesine eklenmemişti → `PUSH_PROVIDER=simulated` okunmuyor, sağlayıcı 'none' düşüyordu | loadEnv eşlemesine 6 alan eklendi (+2 env şema testi) |
| F9-03 | Orta | SimulatedPushProvider dokümanda 'invalid' token'ı reddedeceği yazarken yalnız boş kurucu setine bakıyordu → temizlik akışı test edilemiyordu | token içinde 'invalid' → DeviceNotRegistered (belgelenen davranış) |
| F9-04 | Düşük | `applyRefund` erken dönüşü `undefined` dönebilirdi (iade bildirimi çökerdi) | erken dönüş `{ userId: null, ... }` |

## 3. Doğrulama

- **Otomatik:** contracts 95/95 (+7), api 256/256 (+16: faz9 entegrasyonu 14 test — gerçek PG — + env 2), mobile 153/153 (+11: derin bağlantı + mock adapter). Toplam **504**.
- **Statik:** typecheck 4/4, lint 4/4, build api+admin yeşil (admin ◐ Partial Prerender korunur).
- **Canlı kabul:** `bash scripts/qa-faz9-run-acceptance.sh` → **36/36** (cihaz token/upsert/çoklu cihaz, taslak favori kuralı, yayın bildirimleri, dedup, tercih süzme, dispatch izleme, kampanya fan-out + admin ucu + maskeli token, geçersiz token DB'de `DeviceNotRegistered` kanıtlı, hatırlatma dedup, in-app okuma akışı) + DB denetimi (tür dağılımı, iz durumları, dedupKey tekilleştirme).
- **Regresyon:** faz8 kabul 102/102, faz7 kabul TÜMÜ GEÇTİ, faz6 18/18, faz4 44/44, P2C 41/41 (QA verisi temizliği sonrası), F5 16/16, AUTH 22/22.

## 4. Dürüst Sınırlar

- Gerçek cihaz push'u (APNs/FCM) sandbox'ta doğrulanamadı — simüle sağlayıcı ile uçtan uca akış + `exp.host` adapter'ı hazır; gerçek cihaz adımları PUSH_SETUP.md §4-5.
- Expo push token alımı EAS projectId ister (placeholder `__EAS_PROJECT_ID__` — `eas init` ile doldurulmalı).
- BullMQ yolu belgelendi, uygulanmadı (bkz. §1 karar).
