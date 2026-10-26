# FAZ 10 QA — Release Candidate, Güvenlik Sertleştirmesi ve Regresyon

- **Tarih**: 2026-10-26
- **Doğrulanan kapsam**: ROADMAP "Faz 7 — sertleştirme ve mağaza yayınlama" adımının
  QA bölümü (uygulamada FAZ 10); tüm bileşenler (mobil, API, admin, contracts)
  yayın adayı (RC 1.0.0) ölçütleriyle test edildi.
- **Sonuç**: **PASS WITH WARNINGS** (kritik hata yok; açık maddeler dış bağımlılık
  kaynaklı ve RELEASE_CHECKLIST.md §10-12'de numaralandırıldı)

## 1. Faz Adı ve Test Kapsamı

| Alan | Kapsam |
|------|--------|
| Statik kalite | typecheck, lint (4 workspace), production build (api + admin) |
| Otomatik testler | contracts (95) + API entegrasyon/birim (278, gerçek PostgreSQL) + mobile (153) |
| Temiz DB | sıfır veritabanı üzerinde migrate deploy + seed doğrulaması |
| Canlı kabul koşumları | faz4 medya 44, AUTH 22, F5 16, P2C katalog 41, faz7 ödeme 42, faz8 admin 102, faz9 bildirim 36, **FAZ10 güvenlik 102 + 7 üretim savunması + log maskeleme** |
| Admin UI E2E | Playwright production build üzerinde 19 kontrol |
| Mağaza hazırlığı | eas.json, sürüm yükseltme, docs/store taslakları, ürün kimliği eşlemesi |

## 2. Çalıştırılan Komutlar (gerçek)

```bash
pnpm typecheck                    # 4/4 yeşil
pnpm lint                         # 4/4 yeşil
pnpm test                         # 526/526 yeşil (95+278+153)
pnpm --filter @perdego/api run build     # nest build ✓
pnpm --filter @perdego/admin run build   # next build ✓ (13 rota)
pnpm exec prisma migrate deploy / db seed   # temiz DB (perdego_faz10clean) ✓
bash scripts/qa-faz4-run-probes.sh        # 44/44
bash scripts/qa-faz5-run-probes.sh        # AUTH 22 + F5 16 + P2C 41
bash scripts/qa-faz7-run-acceptance.sh    # 21+14+7 = 42/42
bash scripts/qa-faz8-run-acceptance.sh    # 102/102
bash scripts/qa-faz8-run-ui-e2e.sh        # 19/19
bash scripts/qa-faz9-run-acceptance.sh    # 36/36
bash scripts/qa-faz10-run.sh              # A 67 + B 15 + C 20 + D 7 + S12 ✓
corepack pnpm audit --prod                # başta 4→2 açık; 2 düzeltildi, 2 belgelendi
bash scripts/qa-faz10-baseline.sh         # nihai tam koşum: TÜMÜ YEŞİL
```

## 3. Gerçek Sonuçlar

- **Otomatik**: 526/526 test; typecheck/lint/build yeşil.
- **Canlı kabul toplamı**: 44+22+16+41+42+102+19+36 = **322 önceki-faz kontrolü**
  + **109 FAZ10 güvenlik kontrolü** + **7 üretim env savunması** + log maskeleme =
  **438 canlı kontrol — 0 başarısız** (taze seed'li PostgreSQL üzerinde).
- Performans kanıtı: 2.000 yapım/8.000 bölüm sentetik katalogda sayfa-1 ort 5ms,
  derin sayfa 7ms, arama 8ms, devam-et 6ms; yayın listesi sorgusu
  `contents_status_publishedAt_idx` indeksini kullanıyor (EXPLAIN).
- Kabul kriterleri: tercihler uygulanıyor ✓, doğru hedefe yönlendirme ✓
  (derin bağlantı + probe), mükerrer bildirim/ödeme kontrolü ✓.

## 4. Bulunan Hatalar ve Düzeltmeler

| ID | Önem | Bulgu | Düzeltme | Kanıt |
|----|------|-------|----------|-------|
| F10-01 | **Yüksek** | API yanıtlarında temel güvenlik başlıkları yok (nosniff/DENY/no-referrer/HSTS) | bootstrap'a minimal başlık middleware'i (HSTS yalnız üretim) | bootstrap.spec 3 test + FAZ10-A S10 |
| F10-02 | **Yüksek** | `POST /auth/step-up` parola doğrulaması hız sınırsız → brute-force açığı | `AUTH_RATE_LIMIT_STEPUP_MAX` (varsayılan 5/dk) eklendi; faz8 spec env'i kalibre edildi | FAZ10-C 6. deneme 429 |
| F10-03 | **Orta** | Swagger `/api/docs` üretimde de açıktı → saldırı yüzeyi haritası sızar | üretimde varsayılan kapalı; `SWAGGER_ENABLED=true` ile bilinçli açılır | bootstrap.spec 2 test |
| F10-04 | Düşük | Mailer logu alıcı e-postasını açık yazıyordu (PII) | `ku***@etki` maskesi | S12 + log çıktısı |
| F10-05 | Düşük | Depoda takip edilen bayat kök `.env` (artık kullanılmayan SQLite yolu) | `git rm --cached` + silindi | `git ls-files` temiz |
| F10-06 | **Yüksek** | js-yaml 5.3.0 (GHSA-r3ph-w7gj-g6xm) + multer 2.4.0 DoS (GHSA) zincirlerde savunmasız sürümde | `pnpm-workspace.yaml` overrides → js-yaml 5.4.1, multer 2.5.0; pnpm 12'de overrides'ın `pnpm-workspace.yaml`'dan okunduğu gözlendi (package.json `pnpm` alanı artık okunmuyor) | `pnpm audit --prod` yeniden koşum |
| — | Orta (araç) | Koşum betikleri ilk sürümde pnpm PATH eksikliği ve QA_LIMITS'in 429 spec'ini bozması | betik düzeltildi (PATH export, test adımında limit env'i kaldırıldı) | baseline çıktıları |

Kritik hata bulunamadı. Ürün kodu değişiklikleri yalnız F10-01..04 kapsamındadır;
F10-05/06 bağımlılık/depo hijyenidir. Hiçbir yeni özellik eklenmedi.

## 5. Başarısız veya Çalıştırılamayan Testler

- **Gerçek cihaz/emülatör testleri**: sandbox'ta Android/iOS SDK ve cihaz yok →
  cihaz üstü oynatma, OS izin diyaloğu, gerçek push, arka plan/ön plan geçişi,
  farklı ekran boyutları doğrulanamadı. Mobil taraf 153 birim testi ve
  sunucu tarafı canlı kontrollerle karşılandı; bunlar cihaz doğrulaması
  SAYILMAZ (RELEASE_CHECKLIST §12).
- **Gerçek mağaza satın alma/renewal/iade**: RevenueCat sandbox hesabı ve
  mağaza ürünleri yok → mock/simüle sonuçlar üretim doğrulaması olarak
  sunulmadı; fail-closed 503 davranışı kanıtlandı.
- **EAS build / imzalı AAB / TestFlight**: hesap gerektirir.
- **pnpm audit kalan 2 yüksek**: node-forge (yama yok) ve zod — ikisi de
  `@expo/cli` geliştirme araç zincirinde; cihaz paketine girmiyor, çalışma
  zamanı zod 4.6.7 (≥4.6.6 yamalı). Kabul edilmiş risk.

## 6. Regresyon (önceki fazlar)

Tüm önceki faz canlı koşumları TAZE veritabanında yeniden koşuldu ve geçti:
faz4 44/44, AUTH 22/22, F5 16/16, P2C 41/41, faz7 42/42 (iade clawback dahil),
faz8 102/102 + UI E2E 19/19, faz9 36/36 (FAZ9'un billing kancaları akışları
bozmuyor). FAZ10'un step-up hız sınırı faz8 spec'inde ortam kalibrasyonuyla
çözüldü (ürün davranışı değişmedi; 429 davranışı ayrıca FAZ10-C'de kanıtlı).

## 7. Ortam Olayları (tekrar önlemi)

1. Sandbox node_modules temizliği → yeniden kurulum; postinstall için
   `corepack enable --install-directory ~/.local/bin` gerekti.
2. `apps/api/.env` silinmiş → PORT=3002 ile yeniden oluşturuldu (faz8 runner
   port çakışması böyleydi: API 3000'e açılıp admin ile çakışıyordu).
3. `scripts/qa-pg/package.json` silinmiş → lockfile'dan yeniden oluşturuldu.
4. Gömülü PG her çağrı arası öldüğü için tüm koşumlar tek çağrıda PG
   ön-kurulumlu yapıldı (bilinen sandbox dersi).

## 8. Sonraki Faza Geçiş Kararı

**PASS WITH WARNINGS** — Kritik hata yok; kabul kriterleri canlı kanıtla
karşılandı. Mağaza gönderimi için gereken dış adımlar (hesaplar, cihaz,
hukuk, medya sağlayıcı) RELEASE_CHECKLIST.md §10-11'de numaralandırıldı;
bunlar tamamlanmadan uygulama mağazaya gönderilemez. Kod tarafı RC olarak
onaylandı: **"RELEASE CANDIDATE — dış bağımlılık adımları beklemede"**.
