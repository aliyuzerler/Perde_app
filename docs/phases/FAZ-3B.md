# FAZ 3B — Uçtan Uca Kimlik Doğrulama (Mobil + NestJS)

**Durum:** ✅ TAMAMLANDI · **Karar:** PASS (bilinçli sınırlar belgelendi)
**Tarih:** 2026-10-26 · **Kapsam:** e-posta/parola kimlik doğrulama, oturum
yönetimi, e-posta doğrulama, parola sıfırlama/değiştirme, profil + avatar,
hesap silme/geri alma, yasal metinler, rate limit, Mailpit e-posta altyapısı.

## 1. Teslim Edilen Özellikler

### Sunucu (apps/api)

| Özellik | Uçlar | Not |
|---------|-------|-----|
| Kayıt + doğrulama e-postası | `POST /auth/register` | argon2id; kayıt oturum açar ama `emailVerified=false` |
| Giriş kuralı | `POST /auth/login` | doğrulanmamış → `403 EMAIL_NOT_VERIFIED` (refresh dahil) |
| Refresh rotasyonu | `POST /auth/refresh` | tek kullanımlık + reuse-detection aile iptali (mevcut) |
| E-posta doğrulama | `verify-email`, `resend-verification` | `email_tokens` tablosu; tek aktif anahtar; yarış güvenli tüketim |
| Parola sıfırlama | `forgot-password`, `reset-password` | reset tüm oturumları kapatır; forgot sayım engelli |
| Parola değiştirme | `POST /auth/change-password` | mevcut parola doğrulanır; diğer cihazlar kapanır |
| Oturum yönetimi | `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `logout-all` | cihaz listesi + uzaktan iptal |
| Profil | `GET/PATCH /me` (mevcut) | maskeli e-posta |
| Avatar | `POST/DELETE /me/avatar` + `/uploads` statik | jpeg/png/webp magic-byte doğrulaması, ≤2 MB, rastgele UUID ad, eski dosya temizliği |
| Hesap silme | `POST /account/delete-request`, `POST /account/restore` | parola teyitli; 30 gün nefallet; `purgeExpiredDeletions()` anonimleştirme |
| Yasal metinler | `GET /legal/terms`, `/legal/privacy`, `/legal/:slug` | sürümlü Türkçe Markdown, anonim |
| E-posta servisi | `MailerService` (mail modülü) | `SMTP_HOST` → Mailpit SMTP; boşsa JSONL outbox (`MAIL_OUTBOX_FILE`) |
| Rate limit | register/login/forgot/resend/reset | kayan pencere (IP+bucket); 429 + `retryAfterSeconds` |

### Sözleşmeler (packages/contracts)

- `auth.ts`: `emailVerified` + 9 yeni şema (verify/resend/forgot/reset/
  change/sessions/deletion/restore/legal).
- `account.ts`: `AuthSession` artık sunucu yanıtıyla birebir — `tokens`
  çifti; mock `sessionToken` kaldırıldı (v1→v2 kırıcı değişiklik, mobil
  persist migrate'ı ile güvenli geçiş).

### Mobil (apps/mobile)

| Özellik | Dosya/Ekran | Not |
|---------|-------------|-----|
| Güvenli oturum depolaması | `services/secure-storage.ts` | expo-secure-store (Keychain/Keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`); web düşüşü bellek içi |
| auth-store v2 | `store/auth-store.ts` | token çifti + `updateUser` + `onSessionExpired` olayı; v1 mock oturumları migrate'ta düşürülür |
| API istemcisi v2 | `services/api-client.ts` | Authorization enjeksiyonu; 401 → **tek uçuş** refresh → tek tekrar; refresh reddi → `onSessionExpired`; `details.reason` taşıma |
| Oturum koruması | `services/session-guard.ts` + `_layout.tsx` | süresi dolan oturumda `/auth/login?reason=session-expired` tek seferlik yönlendirme |
| Tüm hesap uçları | `ports.ts` + `http-adapter.ts` + `mock-adapter.ts` | mock kutusu (outbox) ile geliştirme akışı gerçek akışın birebir taklidi |
| Giriş ekranı | `auth/login.tsx` | şifre göster/gizle, sunucu nedeni→Türkçe mesaj, EMAIL_NOT_VERIFIED→doğrulama akışı, süresi dolmuş oturum bilgisi |
| Kayıt ekranı | `auth/register.tsx` | şifre politikası (8+ harf+rakam), koşul onayı + yasal metin linkleri |
| Doğrulama akışı | `verify-email-notice`, `verify-email` | yeniden gönderme; derin bağlantı hedefi `{PUBLIC_BASE_URL}/auth/verify-email?token=…` |
| Parola akışları | `forgot-password`, `reset-password`, `account/change-password` | çift giriş teyidi, politika ipucu, başarı ekranları |
| Hesap güvenliği | `account/sessions`, `account/delete-account`, `account/edit-profile` | cihaz listesi/iptal, parola teyitli silme + geri alma yolu açıklaması |
| Yasal metinler | `legal/[doc].tsx` | misafir dahil erişim (profil bölümü + kayıt linki) |
| Profil ekranı | `(tabs)/profile.tsx` | misafir/üye farklı deneyim: üye → hesap güvenliği bölümü + doğrulama rozeti; misafir → giriş/kayıt + yasal |
| Türkçe mesajlar | `utils/api-error.ts` + i18n (tr/en) | `details.reason` → anlaşılır mesaj eşlemesi (Teknik Kural 8) |

## 2. Test Kanıtları (gerçek koşumlar)

| Süit | Sonuç |
|------|-------|
| contracts | 48/48 ✅ (10 yeni Faz 3b şema testi dahil) |
| api (birim + entegrasyon) | 109/109 ✅ — 62 birim + 18 Faz 2b entegrasyon (güncellendi) + **16 yeni Faz 3b entegrasyon** + 13 yeni birim (rate limiter 4, avatar 5, mailer 4) |
| mobile | 87/87 ✅ — auth-store v2 (5), api-client oturum akışı (6: tek uçuş refresh, paralel tek refresh, auth uçlarında döngü yok, reason taşıma), mock hesap akışları (11) |
| typecheck + lint | 4 workspace ✅ (0 error) |
| build | `nest build` ✅ · `next build` (admin) ✅ · `expo export --platform web` ✅ (yeni ekranlar derlendi) |
| Canlı probe | **22/22** ✅ (`scripts/qa-faz3b-auth-probe.mjs`, gömülü PG + derleme çıktısı) |
| Migration | Temiz DB (drop+create+deploy, 4 migration) entegrasyon kancasında her koşuda ✅ · dev DB'ye `20261026100000_faz3b_auth` deploy ✅ |

### Zorunlu senaryoların karşılanması

| İstenen test | Kanıt |
|--------------|-------|
| Hatalı parola | A03 (401 BAD_CREDENTIALS) + probe |
| Tekrarlanan kayıt | A02 (409 EMAIL_ALREADY_EXISTS) + probe |
| Doğrulanmamış e-posta | A04 (giriş **ve** refresh 403 EMAIL_NOT_VERIFIED; doğrulama sonrası 201) |
| Süresi dolmuş token | `jwt.service.spec` (1 sn TTL → 401 TOKEN_EXPIRED) + A06 bozuk token 401 |
| İptal edilmiş oturum | A07 (logout → refresh 401), A08 (reset → tüm oturumlar 401), A10, A11 |

## 3. Bu Fazda Bulunan ve Düzeltilen Kusurlar

| # | Şiddet | Kusur | Düzeltme |
|---|--------|-------|----------|
| F3B-01 | Yüksek | `MailModule` AppModule'a bağlanmamıştı → Nest init `UndefinedDependencyException` (MailerService), entegrasyon worker'ı maskelenmiş SIGABRT ile çöküyordu | `modules.ts`'e MailModule eklendi; 18+16 entegrasyon testi yeşil |
| F3B-02 | Orta | Yeni politika (emailVerified + rate limit) mevcut Faz 2b entegrasyon akışlarını kırıyordu: kayıt→refresh 403, 4. kayıt 429 | Spec'e `registerVerified()` yardımcısı (outbox'tan anahtar okuma — gerçek e-posta akışının uçtan uca kanıtı) + test başına limiter izolasyonu eklendi |
| F3B-03 | Düşük | `users.controller`'da kullanılmayan importlar, mock `Array<T>` stili vb. 14 lint uyarısı | Temizlendi; lint 0 error 0 warning |

## 4. Bilinçli Sınırlar (dürüst kapsam dışıları)

1. **Access token iptali gecikmesi**: kapalı oturumun access token'ı 15 dk
   TTL dolana dek kriptografik geçerliliğini korur (durumsuz JWT). Zorlama
   refresh akışındadır; sid blok listesi Faz 6 seçeneği (SECURITY.md §11.2).
2. **Rate limit tek örnekli** (bellek içi): yatay ölçek için Redis Faz 6.
3. **Avatar yerel disk**: CDN/S3 görsel altyapısı Faz 4; bu fazda güvenli ad +
   magic byte + 2 MB sınırı.
4. **Nefallet purge cron'u**: `purgeExpiredDeletions()` servis yöntemi olarak
   kanıtlandı; üretim takvimi (kuyruk) Faz 6.
5. **Avatar seçme UI'ı (mobil)**: `expo-image-picker` kuruldu; ekran butonu
   bu fazda "altyapı hazır" sınırında — sunucu ucu multipart + statik yayın
   entegrasyon testiyle kanıtlı (A12 + probe). UI bağlanması sonraki ekran
   turunda (kural: sahte başarı gösterilmez, düz not bırakıldı).
6. **Mailpit kurulumu**: bu ortamda yok; `SMTP_HOST` boş bırakılarak JSONL
   outbox ile uçtan uca kanıtlandı (entegrasyon + canlı probe). Mailpit'e
   geçiş tek env değişkeni (`apps/api/.env.example`).

## 5. Geçiş Notları (sonraki ajan için)

- Süreç env'sindeki `DATABASE_URL=file:.../custom.db` (platform kalıntısı)
  Prisma CLI çağrılarını ezer → komutlara açık URL ver.
- Entegrasyon testleri `--pool=threads` ister (fork havuzunda Nest init
  hatası SIGABRT olarak maskeleniyor; threads'te gerçek hata görünür).
- Mock oturum v2: `sessionToken` yok — testler `session.tokens.*` okur;
  mock parola `perdego1`, mock kutu `mockOutbox` (`resetMockAccountState()`).
- Mobil gerçek adapter geçişi: `EXPO_PUBLIC_MOCK_API=0` + `EXPO_PUBLIC_API_BASE_URL`;
  refresh kancası `adapter.ts` içinde store'a bağlı.
- Canlı probe: `node scripts/qa-faz3b-auth-probe.mjs [baseUrl]` (API'de
  `MAIL_OUTBOX_FILE` + `UPLOAD_DIR` env'leri aynı olmalı).
