# PerdeGo v1.0.0 — Ekran Görüntüleri

Bu klasör, v1.0.0 yayın adayına (release candidate) ait ekran görsellerini içerir.

## `mobil/` — Mobil uygulama (20 görüntü)

**Yakalama yöntemi:** Gerçek uygulama, **gerçek API'ye** (seed verili geliştirme
PostgreSQL'i üzerinde NestJS REST API) bağlanarak Expo web çalışma zamanında
(React Native web, 412×915 @2x = 824×1830) Playwright ile otomatik yakalandı
(`scripts/make-release-shots.sh`). Görseller mock değil; uygulamada gerçekten
görünen arayüzdür.

> **Dürüstlük notu:** Bu görüntüler gerçek uygulama arayüzünün tarayıcı
> (React Native web) çıktısıdır. Derleme ortamında Android/iOS emülatörü
> bulunmadığından doğrudan cihaz ekran görüntüsü alınamadı; RN web çıktısı
> yerel arayüzle birebir aynı bileşen ağacını kullanır. Mağaza gönderimi
> öncesi gerçek cihaz ekran görüntüleriyle yenilenmesi önerilir
> (RELEASE_CHECKLIST.md → manuel adımlar).

| # | Görüntü | Akış |
|---|---------|------|
| 01 | `01-onboarding` | İlk açılış onboarding kapısı |
| 02 | `02-anasayfa-misafir` | Misafir ana sayfa (gerçek katalog verisi) |
| 03 | `03-kesfet` | Keşfet sekmesi (kategori ızgarası) |
| 04 | `04-arama-bos` | Arama sekmesi (boş durum) |
| 05 | `05-arama-sonuc` | Arama sonuçları ("kayıp") |
| 06 | `06-detay-free` | FREE yapım detayı (Kayıp Sinyal) |
| 07 | `07-oynatici-oynuyor` | Oynatıcı — video oynuyor, kontroller + kalite seçici |
| 08 | `08-kredi-kilit` | CREDIT bölüm kilidi + kredi ile aç CTA |
| 09 | `09-abonelik-etiketleri` | SUBSCRIPTION bölümü "Üyelere özel" rozetleri |
| 10 | `10-giris-doldurulmus` | Giriş ekranı (doldurulmuş form) |
| 11 | `11-giris-sonrasi-anasayfa` | Üye girişi sonrası ana sayfa |
| 12 | `12-anasayfa-devam-et` | İzleme senkronu sonrası "Devam Et" sırası |
| 13 | `13-planim` | Planım sekmesi (izleme listesi / geçmiş) |
| 14 | `14-profil` | Profil sekmesi |
| 15 | `15-abonelik-planlari` | Abonelik planları (paywall) |
| 16 | `16-kredi-paketleri` | Kredi paketleri ekranı |
| 17 | `17-bildirimler` | Bildirim merkezi (FAZ 9) |
| 18 | `18-bildirim-tercihleri` | Bildirim tercihleri |
| 19 | `19-hesap-silme` | Hesap silme akışı (mağaza zorunluluğu) |
| 20 | `20-kayit` | Kayıt ekranı |

## `admin/` — Yönetim paneli (11 görüntü)

FAZ 8 kabul koşumundan (**gerçek tarayıcı + gerçek API**) alınmış Playwright
görüntüleri: oturum açma doğrulaması, dashboard, yapım oluşturma, yapım detayı,
gelir modeli (step-up), kullanıcı arama, denetim kaydı ve tablet görünümü.
Kaynak koşum: `scripts/qa-faz8-run-ui-e2e.sh` (rapor: `docs/qa/FAZ-8-QA.md`).
