# PerdeGo

Dikey kısa film ve mini dizi izleme platformu — sinematik, modern, premium, koyu.

pnpm workspaces tabanlı monorepo. Ayrıntılı mimari için bkz. `docs/ARCHITECTURE.md`,
faz planı için `docs/ROADMAP.md` ve `docs/RELEASE_PLAN.md`.

## Depo Yapısı

| Yol | Açıklama | Durum |
|-----|----------|-------|
| `apps/mobile` | React Native + Expo (SDK 58) + Expo Router mobil uygulama | ✅ Çalışır (mock veri ile) |
| `apps/api` | NestJS REST API + Prisma + PostgreSQL (tam alan modeli, 13 modül, Swagger) | ✅ Çalışır |
| `apps/admin` | Next.js 16 + Tailwind 4 yönetim paneli — gerçek API bağlantılı (FAZ 8) | ✅ Çalışır |
| `packages/contracts` | Paylaşılan Zod şemaları + TypeScript tipleri | ✅ |
| `docs/` | Mimari, tasarım, QA ve faz raporları | ✅ |
| `docker-compose.yml` | Yerel PostgreSQL 16 + Redis 7 | ✅ |

## Gereksinimler

- **Node.js >= 20** (önerilen: 22 LTS veya 24)
- **pnpm >= 10** (önerilen: 12 — `corepack enable pnpm` ile kurulum; alternatif `npm i -g pnpm`)
- **Docker Desktop** (PostgreSQL/Redis için) — Windows'ta WSL2 backend açık olmalı
- Mobil cihazda test için **Expo Go** uygulaması (veya Android Studio / Xcode emülatörü)

## Hızlı Başlangıç (macOS / Linux)

```bash
# 0) pnpm kurulumu (bir kez; corepack Node 20+ ile gelir)
corepack enable pnpm

# 1) Kurulum — kök dizinden tüm workspace'ler
pnpm install

# 2) Ortam değişkenleri (her uygulama kendi .env dosyasını okur)
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
cp apps/admin/.env.example apps/admin/.env.local

# 3) PostgreSQL + Redis başlat (Docker)
pnpm db:up          # healthcheck'li; "healthy" olması için birkaç saniye bekleyin

# 4) Veritabanı şeması + örnek veri
pnpm db:deploy      # mevcut migration'ları uygula (init + full_domain)
pnpm db:seed        # özgün kurgu içerik (idempotent)

# 5) Uygulamalar — her biri ayrı terminalde, bağımsız başlatılır
pnpm dev:api        # http://localhost:3000  (Swagger: /api/docs, health: /health, /health/db)
pnpm dev:admin      # http://localhost:3000  (yönetim paneli; API 3002'de ayrıca başlar)
pnpm dev:mobile     # Expo dev server — Expo Go ile QR okutun
```

> **Migration notu:** Depoda iki migration hazır (`init`, `full_domain`);
> sıfırdan kurulumda `pnpm db:deploy` yeterlidir. Yeni migration üretmek
> için: `pnpm db:migrate --name <ad>` (parametre iletimi doğrulanmıştır).

## Windows Kurulumu (PowerShell)

1. **Node.js 20+** kurun (winget: `winget install OpenJS.NodeJS.LTS`).
2. **pnpm**: PowerShell'i yeniden açın ve `corepack enable pnpm` çalıştırın
   (izin hatasında PowerShell'i "Yönetici olarak çalıştır" ile açın).
   Sorun devam ederse: `npm install -g pnpm`.
3. **Docker Desktop** kurun: `winget install Docker.DockerDesktop` — kurulumdan
   sonra Docker Desktop'ı açın, **Settings → General → Use WSL 2 based engine**
   seçili olsun; WSL2 kurulması istenirse `wsl --install` ile tamamlayın ve
   makineyi yeniden başlatın.
4. Depo klasöründe PowerShell ile:
   ```powershell
   pnpm install
   Copy-Item apps\api\.env.example apps\api\.env
   Copy-Item apps\mobile\.env.example apps\mobile\.env
   Copy-Item apps\admin\.env.example apps\admin\.env.local
   pnpm db:up
   pnpm db:migrate    # migration adı sorulursa: init
   pnpm db:seed
   ```
5. Uygulamalar (ayrı PowerShell pencereleri):
   ```powershell
   pnpm dev:api       # http://localhost:3000
   pnpm dev:admin     # http://localhost:3000  (admin@perdego.dev / Admin12345 demo hesabı: apps/api/prisma/seed.ts)
   pnpm dev:mobile    # Expo; Android emülatörde otomatik açmak için: pnpm --filter @perdego/mobile run android
   ```
6. Mobil cihazdan Expo Go ile bağlanırken, aynı Wi-Fi ağında olun; cihaz
   `EXPO_PUBLIC_API_BASE_URL` içindeki `localhost` yerine bilgisayarınızın
   yerel IP'sini kullanmalıdır (örn. `http://192.168.1.25:3000`) — aksi halde
   API'ye erişilemez (admin panelindeki kart "API'ye erişilemedi" gösterir).

## Kök Komutları

| Komut | Ne yapar |
|-------|----------|
| `pnpm install` | Tüm workspace bağımlılıklarını kurar |
| `pnpm dev:api` / `dev:admin` / `dev:mobile` | İlgili uygulamayı geliştirme modunda başlatır (birbirinden bağımsız) |
| `pnpm typecheck` / `lint` / `test` | Tüm workspace'lerde kalite kapıları (`--if-present`, script'i olmayan paket atlanır) |
| `pnpm build` | Tüm workspace'lerde üretim derlemesi |
| `pnpm db:up` / `db:down` / `db:logs` | Docker Compose: PostgreSQL + Redis |
| `pnpm db:migrate` / `db:deploy` / `db:seed` / `db:studio` | Prisma: geliştirme migration, üretime uygulama, seed, görsel arayüz |

## Sağlık Uçları (apps/api)

| Uç | Anlamı | Davranış |
|----|--------|----------|
| `GET /health` | Süreç canlılığı | Her zaman hızlı 200; dış servis beklemez |
| `GET /health/db` | PostgreSQL gerçek bağlantı testi (SELECT 1) | Bağlantı varsa 200 + gecikme; **yoksa 503 + hata detayı** |

**Dürüstlük kuralı:** Sağlıksız dış servis asla başarılı gösterilmez. DB/Redis
erişilemezse `/health/db` 503 döner; admin panelindeki kart da kırmızı
"Bağlantı yok" gösterir. Ortam değişkenleri eksik/geçersizse API başlamaz ve
sorunlu her değişken için anlaşılır bir satır yazdırır:

```
[PerdeGo API] Ortam değişkenleri doğrulanamadı:
  - DATABASE_URL: DATABASE_URL zorunludur (örn. postgresql://perdego:PAROLA@localhost:5432/perdego)
  Çözüm: apps/api dizininde `cp .env.example .env` yapıp değerleri doldurun...
```

## API (apps/api) — Hızlı Referans

- **Swagger / OpenAPI:** `http://localhost:3000/api/docs` (JSON: `/api/docs-json`)
- **Zarf:** her yanıt `{ ok: true, data }` ya da `{ ok: false, error: { code, message, details } }`
- **Kimlik:** `Authorization: Bearer <accessToken>` (RS256, 15 dk); para/kredi
  POST uçlarında `Idempotency-Key` zorunludur (BR-06)
- **Demo hesaplar** (yalnızca seed — Faz 3b'den beri e-postaları doğrulanmış doğar):

| E-posta | Şifre | Rol |
|---------|-------|-----|
| `admin@perdego.dev` | `Admin12345` | ADMIN |
| `editor@perdego.dev` | `Admin12345` | EDITOR |
| `viewer@perdego.dev` | `Dev12345` | USER (abone + kredi cüzdanı) |

- **Kimlik akışı (Faz 3b):** kayıt → Mailpit/outbox'taki bağlantıya dokunma
  (`POST /auth/verify-email`) → giriş. Doğrulanmamış hesapta giriş 403
  `EMAIL_NOT_VERIFIED`. Yerel e-posta testi: `SMTP_HOST=localhost:1025`
  (Mailpit) **veya** SMTP_HOST boşken `MAIL_OUTBOX_FILE` JSONL outbox'u.
- **Canlı probe:** `node scripts/qa-faz3b-auth-probe.mjs [baseUrl]` — auth
  uçlarını uçtan uca denetler (22 kontrol; Mailpit gerektirmez).

Seed verisi özgün kurgudur (telifli afiş/yapım yok); görseller API'nin kendi
SVG placeholder'larıdır (`/placeholders/...`).

## Sorun Giderme

| Sorun | Çözüm |
|-------|-------|
| `pnpm db:up` başarısız | Docker Desktop açık mı? `docker ps` çalışıyor mu? |
| `/health/db` 503 | `pnpm db:up` sonrası 10 sn bekleyin; `apps/api/.env` içindeki `DATABASE_URL` compose şifresiyle aynı mı? |
| Port çakışması (3000/3001/5432/6379) | `apps/api/.env` içinde `PORT`, admin için `package.json` içindeki `-p` değerini değiştirin |
| Expo cihazdan API'ye erişemiyor | `EXPO_PUBLIC_API_BASE_URL` değerini bilgisayarın yerel IP'si yapın; CORS `CORS_ORIGINS` listesine ekleyin |
| Windows'ta corepack/ps1 hatası | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |

## Doğrulama Durumu (bu depo, sandbox ortamı)

Aşağıdaki adımlar bu depoda **gerçekten çalıştırıldı** ve doğrulandı:

- `pnpm install` — workspace'ler, temiz kurulum
- `pnpm typecheck`, `pnpm lint`, `pnpm test` — yeşil (contracts 38, api 79, mobile 70 test; api testlerinin 17'si gerçek PostgreSQL üzerinde uçtan uca entegrasyondur)
- `pnpm build` (nest + next) — başarılı
- Temiz veritabanından sıfırdan `prisma migrate deploy` + seed: entegrasyon testleri her koşuda drop+create+deploy+seed yaparak kanıtlar; gömülü PostgreSQL ile canlı doğrulandı
- Canlı smoke: `/health`, `/health/db`, `/api/docs`, `/api/v1/home`, `/api/v1/catalog/titles`, `/api/v1/catalog/titles/:slug`, `/api/v1/catalog/episodes/:id`, `/api/v1/search` — 13/13 kontrol yeşil (`scripts/qa-faz2b-smoke.sh`)
- Mobil: `npx expo export --platform ios` — bundle derlemesi başarılı (pnpm düzeni ile)

Docker Compose'un kendisi sandbox'ta koşulamadı (Docker yok); PostgreSQL
yerine gömülü PostgreSQL 16 binary'si (`scripts/qa-pg`) ile aynı şifre/rol
paritesi kullanıldı. Docker'lı makinede `pnpm db:up → db:deploy → db:seed`
adımları birebir çalışmalıdır.

## Dokümantasyon

- `docs/PRD.md` — ürün gereksinimleri, kullanıcı senaryoları, MVP kapsamı, iş kuralları
- `docs/ARCHITECTURE.md` — sistem mimarisi, video/ödeme altyapısı kararları
- `docs/ERD.md` — veritabanı şeması ve ER diyagramı
- `docs/API_CONTRACT.md` — REST sözleşmesi, hata kodları
- `docs/SECURITY.md` — kimlik/yetki/video/ödeme güvenliği
- `docs/COST_ESTIMATE.md` — maliyet modeli ve senaryolar
- `docs/RELEASE_PLAN.md` — fazlar, kabul kriterleri, mağaza checklist
- `docs/qa/FAZ-0-QA.md` — Faz 0 kabul raporu
- `docs/phases/` — faz raporları
