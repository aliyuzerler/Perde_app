# PerdeGo

Dikey kısa film ve mini dizi izleme platformu — sinematik, modern, premium, koyu.

pnpm workspaces tabanlı monorepo. Ayrıntılı mimari için bkz. `docs/ARCHITECTURE.md`,
faz planı için `docs/ROADMAP.md` ve `docs/RELEASE_PLAN.md`.

## Depo Yapısı

| Yol | Açıklama | Durum |
|-----|----------|-------|
| `apps/mobile` | React Native + Expo (SDK 58) + Expo Router mobil uygulama | ✅ Çalışır (mock veri ile) |
| `apps/api` | NestJS REST API + Prisma + PostgreSQL (health uçları) | ✅ Çalışır |
| `apps/admin` | Next.js 16 + Tailwind 4 yönetim paneli (sağlık ekranı) | ✅ Çalışır |
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
pnpm db:migrate     # prisma migrate dev (ilk seferde 'init' migration'ı oluşturun)
pnpm db:seed        # özgün kurgu içerik (idempotent)

# 5) Uygulamalar — her biri ayrı terminalde, bağımsız başlatılır
pnpm dev:api        # http://localhost:3000  (health: /health, /health/db)
pnpm dev:admin      # http://localhost:3001  (API sağlık kartları)
pnpm dev:mobile     # Expo dev server — Expo Go ile QR okutun
```

> **Migration notu:** İlk migration'a bir ad verin: `pnpm db:migrate --name init`
> (parametre iletimi doğrulanmıştır). Alternatif: `pnpm --filter @perdego/api exec
> prisma migrate dev --name init`.

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
   pnpm dev:admin     # http://localhost:3001
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

- `pnpm install` — 3 workspace + kök, temiz kurulum
- `pnpm typecheck`, `pnpm lint`, `pnpm test` — hepsi yeşil (contracts 16, mobile 49, api 11 test)
- `pnpm --filter @perdego/api run build` (nest build) ve `pnpm --filter @perdego/admin run build` (next build) — başarılı
- `pnpm dev:api` karşılığı `node dist/main.js` ile canlı çalıştırma: `/health` → 200, `/health/db` (DB yokken) → **503 + açık hata**; env eksikken anlaşılır hata ve 1 koduyla çıkış
- Mobil: `npx expo export --platform ios` — bundle derlemesi başarılı (pnpm düzeni ile)

Sandbox'ta Docker bulunmadığı için **`pnpm db:up → db:migrate → db:seed`
adımları bu ortamda canlı çalıştırılamadı**; komutlar ve compose dosyası
hazırdır, Docker Desktop olan bir makinede (macOS/Linux/Windows) yukarıdaki
adımlar izlenerek doğrulanmalıdır. DB'ye gerçek bağlantı kanıtı,
`/health/db`'nin 200 dönmesiyle alınacaktır.

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
