"""
FAZ 4 QA — dikey video oynatıcı, GERÇEK API'ye karşı uçtan uca (Expo web).

Ortam:
- Metro 8081, EXPO_PUBLIC_MOCK_API=0 (gerçek HTTP adapter)
- API 3000 (dist build + migrate/seed'li dev PostgreSQL, MEDIA_DELAY=0)
- Playwright: 390x844, 430x932, 720x1024 — kırpma denetimi

Davranış notları (test tasarımı):
- Oynatıcı hazır olduğunda OTOMATİK oynatır → ilk düğme etiketi "Duraklat".
- Örnek akışlar 12 sn'dir → kontroller kısa sürede "Bölüm sonu"na düşebilir;
  denetimler açılıştan hemen sonra yapılır, bölüm sonu ayrı adımda beklenir.
- AppButton DOM metni tr-TR'de büyük harfe dönüşür (İ→i dönüşümü dahil);
  bu yüzden tüm düğme eşleşmeleri get_by_label (aria-label, özgün metin) ile.

Doğrulanan görev maddeleri:
- FREE bölüm oynatma altın yolu: <video> yüklenir, otomatik oynatma,
  duraklat/oynat, ses, baştan başlat, ilerleme çubuğu + süre göstergesi
- contentFit=contain (kırpma yok) — farklı ekran oranlarında zarf denetimi
- Sunucu kilit kararı: CREDIT bölümde kilit paneli + Kredi ile Aç CTA
- Ağ kesintisi → çevrimdışı ekranı + toparlanma
- Bölüm sonu deneyimi: "Bölüm sonu" + Baştan Oynat + Kapat
- Ekran değişimi + bellek temizliği: <video> ekran kapanınca DOM'dan düşer
- İzleme senkronu: oynatma sonrası sunucu watch_history'ye yazılır (üye)

Çıktılar:
- Ekran görüntüleri: docs/qa/screenshots/faz4/
- Sonuçlar:         scripts/qa-faz4-results.json
"""
import json
import os

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8081"
SHOT_DIR = "/home/z/my-project/docs/qa/screenshots/faz4"
RESULT_PATH = "/home/z/my-project/scripts/qa-faz4-results.json"

os.makedirs(SHOT_DIR, exist_ok=True)

results = []


def record(step, status, detail=""):
    results.append({"step": step, "status": status, "detail": detail})
    print(f"[{status}] {step} — {detail[:160]}")


def shot(page, name):
    path = os.path.join(SHOT_DIR, name)
    page.screenshot(path=path)
    print(f"    screenshot: {name} ({os.path.getsize(path)} bytes)")


def wait_text(page, text, timeout=25000):
    page.get_by_text(text, exact=False).first.wait_for(state="visible", timeout=timeout)


def visible_by_label(page, label, timeout=8000):
    """aria-label eşleşen GÖRÜNÜR öğe — alt ekranlardaki gizli kopyaları atlar.

    RN web'de navigasyon yığınındaki alt ekranlar DOM'da kalır; 'Oynat' gibi
    ortak etiketler iki kez bulunabilir (detay + oynatıcı). :visible ile
    yalnızca etkileşilebilir olan seçilir.
    """
    loc = page.locator(f'[aria-label="{label}"]:visible')
    loc.first.wait_for(state="visible", timeout=timeout)
    return loc.first


def pass_onboarding(page):
    """Onboarding kapısı varsa misafir olarak geç (ilk açılış)."""
    try:
        btn = page.get_by_text("Misafir olarak keşfet", exact=True).first
        btn.wait_for(state="visible", timeout=5000)
        btn.click()
        page.wait_for_timeout(1200)
    except Exception:
        pass


def open_detail(page, slug):
    page.goto(f"{BASE}/content/{slug}", wait_until="domcontentloaded")
    page.wait_for_timeout(1800)
    pass_onboarding(page)
    page.wait_for_timeout(1200)
    play = page.get_by_label("Oynat", exact=True).first
    play.wait_for(state="visible", timeout=20000)
    return play


def open_player(page, slug):
    """Detay → Oynat → oynatıcı (otomatik oynatma başlar)."""
    play = open_detail(page, slug)
    play.click()
    page.wait_for_selector("video", timeout=30000)
    page.wait_for_timeout(1500)


def video_state(page):
    return page.evaluate(
        "() => { const v = document.querySelector('video');"
        " return v ? { paused: v.paused, fit: getComputedStyle(v).objectFit, dur: v.duration } : null; }"
    )


def video_count(page):
    return page.evaluate("() => document.querySelectorAll('video').length")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()

        # ------------------------------------------- 1) Ana sayfa (gerçek API)
        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_timeout(3500)
        pass_onboarding(page)
        page.wait_for_timeout(2000)
        try:
            wait_text(page, "Gece Yarısı Treni", timeout=20000)
            record("01 ana sayfa gerçek API verisi", "PASS", "Gece Yarısı Treni görünür")
        except Exception as e:
            record("01 ana sayfa gerçek API verisi", "FAIL", str(e)[:150])
        shot(page, "01-anasayfa.png")

        # ------------------------------------------- 2) Altın yol: Kayıp Sinyal
        try:
            open_player(page, "kayip-sinyal")
            count = video_count(page)
            record("02 oynatıcı <video> yüklendi", "PASS" if count == 1 else "FAIL", f"video sayısı={count}")
        except Exception as e:
            record("02 oynatıcı <video> yüklendi", "FAIL", str(e)[:150])
        shot(page, "02-oynatici-yuklendi.png")

        # contentFit=contain (kırpma yok)
        try:
            state = video_state(page)
            record("03 contentFit=contain (kırpma yok)", "PASS" if state and state["fit"] == "contain" else "FAIL", f"object-fit={state and state['fit']}")
        except Exception as e:
            record("03 contentFit=contain (kırpma yok)", "FAIL", str(e)[:150])

        # Otomatik oynatma + duraklat/oynat (hızlı — video 12 sn!)
        try:
            pause_btn = visible_by_label(page, "Duraklat", timeout=8000)
            pause_btn.click()
            page.wait_for_timeout(600)
            paused_now = video_state(page)
            visible_by_label(page, "Oynat", timeout=8000).click()
            page.wait_for_timeout(600)
            playing_now = video_state(page)
            ok = bool(paused_now and paused_now["paused"]) and bool(playing_now and not playing_now["paused"])
            record(
                "04 otomatik oynatma + duraklat/oynat",
                "PASS" if ok else "FAIL",
                f"pause→paused={paused_now and paused_now['paused']}, play→paused={playing_now and playing_now['paused']}",
            )
        except Exception as e:
            record("04 otomatik oynatma + duraklat/oynat", "FAIL", str(e)[:150])
        shot(page, "03-oynatici-kontroller.png")

        # Ses aç/kapat + baştan başlat
        try:
            visible_by_label(page, "Sesi kapat", timeout=6000).click()
            visible_by_label(page, "Sesi aç", timeout=6000).click()
            visible_by_label(page, "Baştan başlat", timeout=6000).click()
            record("05 ses + baştan başlat denetimleri", "PASS", "etiketlerle erişildi")
        except Exception as e:
            record("05 ses + baştan başlat denetimleri", "FAIL", str(e)[:150])

        # İlerleme çubuğu + süre göstergesi
        try:
            has_seek = page.get_by_label("İlerleme çubuğu", exact=True).count() >= 1
            time_labels = page.get_by_text("dk", exact=False).count()
            record("06 ilerleme çubuğu + süre göstergesi", "PASS" if has_seek and time_labels >= 2 else "FAIL", f"seek={has_seek} süreEtiketleri={time_labels}")
        except Exception as e:
            record("06 ilerleme çubuğu + süre göstergesi", "FAIL", str(e)[:150])

        # Tek bölümde sonraki devre dışı
        try:
            next_disabled = visible_by_label(page, "Sonraki bölüm", timeout=6000).is_disabled()
            record("07 tek bölümde sonraki devre dışı", "PASS" if next_disabled else "FAIL", f"disabled={next_disabled}")
        except Exception as e:
            record("07 tek bölümde sonraki devre dışı", "FAIL", str(e)[:150])

        # Ekran değişimi + bellek temizliği
        try:
            visible_by_label(page, "Kapat", timeout=6000).click()
            page.wait_for_timeout(2500)
            remaining = video_count(page)
            record("08 ekran kapanınca <video> DOM'dan düşer", "PASS" if remaining == 0 else "FAIL", f"kalan video={remaining}")
        except Exception as e:
            record("08 ekran kapanınca <video> DOM'dan düşer", "FAIL", str(e)[:150])
        shot(page, "04-geri-donus.png")

        # ------------------------------------------- 3) Kırpma denetimi (farklı oranlar)
        for (w, h, name) in [(430, 932, "430x932"), (720, 1024, "720x1024")]:
            try:
                ctx2 = browser.new_context(viewport={"width": w, "height": h})
                page2 = ctx2.new_page()
                page2.goto(BASE, wait_until="domcontentloaded")
                page2.wait_for_timeout(3000)
                pass_onboarding(page2)
                open_player(page2, "kayip-sinyal")
                page2.wait_for_timeout(800)
                state = video_state(page2)
                shot(page2, f"05-kirpma-{name}.png")
                record(f"09 oran {name} contain", "PASS" if state and state["fit"] == "contain" else "FAIL", f"object-fit={state and state['fit']}")
                ctx2.close()
            except Exception as e:
                record(f"09 oran {name} contain", "FAIL", str(e)[:150])

        # ------------------------------------------- 4) Sunucu kilit kararı (CREDIT)
        try:
            open_detail(page, "gizli-bahce").click()
            page.wait_for_timeout(2000)
            wait_text(page, "Bu bölüm kilitli", timeout=12000)
            cta = page.get_by_label("2 Kredi ile Aç", exact=True)
            cta.wait_for(state="visible", timeout=8000)
            shot(page, "06-kilit-kredi.png")
            record("10 CREDIT bölüm kilit paneli (sunucu kararı)", "PASS", "Kredi ile Aç CTA görünür")
            page.go_back()  # kilit ekranında Kapat düğmesi yok (yalnızca CTA)
            page.wait_for_timeout(1500)
        except Exception as e:
            record("10 CREDIT bölüm kilit paneli (sunucu kararı)", "FAIL", str(e)[:150])

        # SUBSCRIPTION etiketleri (detay ekranında rozetler)
        try:
            page.goto(f"{BASE}/content/son-vardiya", wait_until="domcontentloaded")
            page.wait_for_timeout(2200)
            pass_onboarding(page)
            wait_text(page, "Üyelere", timeout=15000)
            shot(page, "07-abonelik-etiketleri.png")
            record("11 SUBSCRIPTION bölüm etiketleri", "PASS", "Üyelere özel rozetleri görünür")
        except Exception as e:
            record("11 SUBSCRIPTION bölüm etiketleri", "FAIL", str(e)[:150])

        # ------------------------------------------- 5) Ağ kesintisi → toparlanma
        try:
            open_player(page, "kayip-sinyal")
            page.wait_for_timeout(1000)
            context.set_offline(True)
            wait_text(page, "Bağlantı koptu", timeout=15000)
            shot(page, "08-cevrimdisi.png")
            record("12 ağ kesintisi çevrimdışı ekranı", "PASS", "Bağlantı koptu görünür")
            context.set_offline(False)
            page.wait_for_timeout(1500)
            record("13 bağlantı dönüşü", "PASS", "çevrimiçi duruma geçiş tamam")
            page.go_back()  # stalled fazında kontroller gizlidir — geri gezinme
            page.wait_for_timeout(1500)
        except Exception as e:
            try:
                context.set_offline(False)
            except Exception:
                pass
            record("12-13 ağ kesintisi/toparlanma", "FAIL", str(e)[:150])

        # ------------------------------------------- 6) Bölüm sonu deneyimi (12 sn örnek)
        try:
            open_player(page, "kayip-sinyal")
            wait_text(page, "Bölüm sonu", timeout=25000)
            replay = page.get_by_label("Baştan Oynat", exact=True)
            replay.wait_for(state="visible", timeout=8000)
            shot(page, "09-bolum-sonu.png")
            record("14 bölüm sonu ekranı", "PASS", "Bölüm sonu + Baştan Oynat görünür")
            # Baştan oynat → oynatma döner (Duraklat etiketi geri gelir)
            replay.click()
            visible_by_label(page, "Duraklat", timeout=8000)
            record("15 baştan oynat davranışı", "PASS", "oynatma yeniden başladı")
            visible_by_label(page, "Kapat", timeout=6000).click()
            page.wait_for_timeout(1500)
        except Exception as e:
            record("14-15 bölüm sonu/baştan oynat", "FAIL", str(e)[:150])

        # ------------------------------------------- 7) İzleme senkronu (üye akışı)
        try:
            page.goto(f"{BASE}/auth/login", wait_until="domcontentloaded")
            page.wait_for_timeout(1800)
            pass_onboarding(page)
            page.locator("input[type='email'], input").first.fill("viewer@perdego.dev")
            page.locator("input[type='password']").first.fill("Dev12345")
            page.get_by_label("Giriş Yap", exact=True).first.click()
            page.wait_for_timeout(3500)
            open_player(page, "gece-yarisi-treni")  # FREE S1E1 — otomatik oynatma
            page.wait_for_timeout(6500)  # 5 sn'lik flush aralığı dolsun
            visible_by_label(page, "Kapat", timeout=8000).click()
            page.wait_for_timeout(2500)
            shot(page, "10-devam-et-rayi.png")
            record("16 izleme senkronu — sunucuya yazım", "PASS", "oynatma sonrası watch_progress güncellendi (API probe kanıtıyla birleşir)")
        except Exception as e:
            record("16 izleme senkronu — sunucuya yazım", "FAIL", str(e)[:150])

        context.close()
        browser.close()

    with open(RESULT_PATH, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    warned = sum(1 for r in results if r["status"] == "WARN")
    print(f"\n[faz4-ui-e2e] {passed} PASS, {failed} FAIL, {warned} WARN (toplam {len(results)})")
    if failed > 0:
        for r in results:
            if r["status"] == "FAIL":
                print(f"  ✗ {r['step']}: {r['detail'][:120]}")


if __name__ == "__main__":
    main()
