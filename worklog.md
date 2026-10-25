# PerdeGo — Çok Ajanlı Çalışma Günlüğü

---
Task ID: 1
Agent: Ana ajan (Z.ai)
Task: PerdeGo Faz 1 — Monorepo temeli, packages/contracts ve mobil uygulama iskeleti

Work Log:
- Mevcut depo incelendi: boş repo (tek commit, .gitignore + .env + download/). Node v24.21.0, npm 11.19.0, pnpm/yarn yok.
- fullstack-dev skill'i incelendi; kök Next.js scaffold init script'i ÇALIŞTIRILMADI (gerekçe: kullanıcı brief'i monorepo yapısını zorunlu kılıyor, Faz 1'de web yüzeyi yok — Faz raporunda belgelendi).
- `create-expo-app --template default --no-install` ile Expo SDK 58 şablonu apps/mobile altına alındı (React Native 0.88, React 19.3, TS 6.0).
- docs/: ROADMAP.md (7 faz), ARCHITECTURE.md, DESIGN.md yazıldı.
- Kök workspace kuruldu: npm workspaces (apps/*, packages/*), tsconfig.base.json, prettier, editorconfig, .env.example, .gitignore güncellendi.
- packages/contracts: Zod 4 şemaları (API zarfı, hata kodları, sayfalama, içerik alanı, profil) + 16 vitest testi.
- apps/mobile: şablon demo bileşenleri kaldırıldı (gerekçe faz raporunda); koyu sinematik tema token'ları (#0D0D0F/#19191D/#B71C36/#F5F1EA, radius 0-4, oranlar 2:3 / 9:16 / 16:9), UI bileşen seti, durum görünümleri, 4 sekme + içerik detayı, dev-only mock adapter (iki katmanlı koruma), TanStack Query + Zustand + i18n (tr/en) yazıldı.
- Bağımlılık uyumu: `npx expo install --check` ile async-storage 2.2.0'a çekildi; react-test-renderer 19.3.0'a sabitlendi (react@19.3.0 peer uyarınca); @expo/vector-icons expo install ile eklendi.
- 6 tur hata düzeltme: JSX dosya uzantısı (.tsx), SDK 58 splash-screen API'si, expo-status-bar backgroundColor kaldırma, zustand persist StateStorage sözleşmesi, RNTL v14 async render + includeHiddenElements, i18n noktalı anahtar tipleri.
- Metro smoke testi: ilk denemede ENOSPC (inotify 8192 limiti, yükseltilemez) → watchFolders yalnızca packages/ izleyecek şekilde daraltıldı; ardından Metro başarıyla başladı ve iOS bundle 1280 modül / HTTP 200 derlendi.
- create-expo-app'in iç içe .git'i kaldırıldı (tek depo: kök); gitlink hatası düzeltildi.
- expo-doctor 20/20; typecheck/lint/test kök düzeyden yeşil (65 test).

Stage Summary:
- Faz 1 tamamlandı ve `docs/phases/FAZ-1.md` raporu yazıldı.
- Üretilen artefaktlar: monorepo kökü, packages/contracts, apps/mobile (4 sekme + detay), 3 doküman + faz raporu.
- Kritik kararlar: npm workspaces, ContentApiPort adapter deseni, iki katmanlı mock koruması, özgün placeholder görseller, koyu tema tek yönlü, token korumalı tasarım kuralları.
- Sonraki ajan için: Faz 2 = apps/api (NestJS + Prisma + PostgreSQL), içerik/feed/arama uçları, mobilde gerçek adapter geçişi. ROADMAP.md ve ARCHITECTURE.md okunmalı.

---
Task ID: 2
Agent: Ana ajan (Z.ai)
Task: PerdeGo ürün analizi ve teknik mimari dokümantasyonu (docs/ altına 7 belge)

Work Log:
- Mevcut depo incelendi: Faz 1 tamam (apps/mobile iskelet, packages/contracts, docs/ROADMAP+DESIGN+ARCHITECTURE v1). Kontratlar okundu: contentKind (FILM|SERIES|SHORT_FILM), accessType (FREE|SUBSCRIPTION|CREDIT), ApiEnvelope/hata kodları, ContentApiPort.
- Resmi kaynaklardan fiyat/politika doğrulaması (2026-10-25): Cloudflare Stream (depolama $5/1.000dk/ay, teslim $1/1.000dk), Bunny Stream (depolama $0,01/GB/ay, teslim $0,005/GB, kodlama ücretsiz, ~$3,25–4,50 alt sınır), Mux (teslim ilk 100K dk ücretsiz, 1080p $0,001/dk; depolama 1080p $0,003/dk/ay), RevenueCat ($2.500 MTR'ye kadar ücretsiz, sonra %1), Apple SBP %15, Google servis bedeli (TR: abonelik %15, diğer ilk $1M %15/üzeri %30; ABD/AB yeni tablo izlenmeli).
- Apple "satın alınan krediler süresiz" maddesi birincil kaynaktan doğrulanamadı → tasarımda güvenli taraf alındı (satın alınan kredi süresiz) ve Faz 6 checklist'ine hukuk teyidi eklendi.
- 7 belge yazıldı: PRD.md (personalar, 20 senaryo/özellik, BR-01..13 iş kuralları, MVP içi/dışı + gerekçe/risk), ARCHITECTURE.md v2 (sistem bağlamı, modül haritası, video karşılaştırma + VideoProviderAdapter sözleşmesi, RevenueCat + sunucu-sahibi entitlement kararı, idempotent satın alma/unlock akışları, karar kaydı D1–D8), ERD.md (Mermaid ER + 21 tablo; append-only credit_ledger, episode_unlocks unique, webhook_events/idempotency_keys), API_CONTRACT.md (zarf + /api/v1 uçları + code/reason hata tablosu, contracts ile uyumlu), SECURITY.md (argon2id+RS256+rotasyon, imzalı video TTL 300sn, ödeme ters-sorgu/webhook, KVKK, OWASP API Top 10), COST_ESTIMATE.md (formüller + S/M/L senaryo tabloları; Bunny ~$0,11/1.000dk vs CF $1,00 vs Mux ~$0,89), RELEASE_PLAN.md (faz kabul kriterleri + faz kapanış teslim listesi + Apple/Google yayın checklist).
- ROADMAP.md, DESIGN.md ve Faz 1 artefaktları bozulmadı; ARCHITECTURE.md v1 içeriği v2'ye korundu.

Stage Summary:
- docs/: PRD.md, ARCHITECTURE.md (v2), ERD.md, API_CONTRACT.md, SECURITY.md, COST_ESTIMATE.md, RELEASE_PLAN.md üretildi.
- Kritik kararlar: Bunny Stream birincil video sağlayıcı (adapter ile CF ikinci impl.), RevenueCat (vendor çıkış yolu contract-test ile), satın alınan kredi süresiz / hediye kredi ayrı bakiye, ledger append-only + idempotency zorunlu.
- Sonraki ajan için: Faz 2 = apps/api (NestJS+Prisma+PostgreSQL); ARCHITECTURE.md §4, ERD.md §3.2, API_CONTRACT.md §3 ve RELEASE_PLAN.md §3.2 okunmalı; EXPO_PUBLIC_MOCK_API=0 geçişi planlanmalı.

---
Task ID: 3
Agent: Ana ajan (Z.ai)
Task: Faz 0 QA — kalite kontrol, test, kabul doğrulaması (dokümantasyon fazı)

Work Log:
- Git geçmişi + package.json'lar + FAZ-1 raporu incelendi; tanımlı komutlar bulundu (kök typecheck/lint/test → contracts+mobile delege).
- Testler GERÇEK çalıştırıldı: typecheck PASS, lint PASS, 65/65 test (vitest 16 + jest 49), expo-doctor 20/20, `expo export --platform ios` bundle (3,9 MB) derlendi. `npm run contracts:build` FAIL: Missing script "build" (bulgu D-09).
- Faz 0 kabul maddeleri (10) tek tek doğrulandı; izlenebilirlik tablosu 9/9 kapsam maddesi + BR-04..13 ile tamam.
- 12 bulgu sınıflandırıldı (Kritik/Yüksek: yok; Orta: 2; Düşük: 10): COST §4 tutarsız hesaplar (kur/kırılım/PRD atfı) yeniden hesaplandı (≈380 abonelik kırılımı); ERD'ye eksik playback_sessions tablosu eklendi; ERD referans hatası + free_until_at kararı; SECURITY BR-12 ifade çelişkisi hizalandı; API_CONTRACT restore akışı eklendi; RELEASE_PLAN Zaman Varsayımları (§1.1) + Faz 0 numaralandırma notu; 2 kırık npm script kaldırıldı; vitest uyarısı kayda alındı.
- Düzeltme sonrası typecheck/lint/test tekrar: yeşil (regresyon yok; src/ koduna dokunulmadı).
- Rapor: docs/qa/FAZ-0-QA.md (izlenebilirlik, bulgular, çalıştırılamayan testler, 9 kalemlik dış bağımlılık risk listesi R-01..R-09, geçiş kararı).

Stage Summary:
- Karar: PASS WITH WARNINGS — Faz 2'ye geçiş onaylandı; uyarılar yalnızca dış bağımlılık riskleri (Apple PLA kredi maddesi, mağaza/RC/video hesapları, kur/hosting teyitleri).
- Değişen dosyalar: docs/{COST_ESTIMATE,ERD,SECURITY,API_CONTRACT,RELEASE_PLAN}.md, docs/qa/FAZ-0-QA.md (yeni), package.json (kök, 1 script), apps/mobile/package.json (1 script).
- Sonraki ajan için: Faz 2'ye hazırdır; RELEASE_PLAN §3.2 kabul kriterleri ve ERD §3 (playback_sessions dahil) esas alınmalı.
