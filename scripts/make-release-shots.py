"""
PerdeGo v1.0.0 — yayin ekran goruntuleri (gercek uygulama, Expo web + Playwright).

Ortam:
- Metro 8081, EXPO_PUBLIC_MOCK_API=0 (gercek HTTP adapter)
- API 3000 (dist build + migrate/seed'li dev PostgreSQL)

Cikti: docs/screenshots/v1.0.0/mobil/*.png (412x915 @2x = 824x1830)
Not: RN web'de buton eslesmeleri aria-label ile yapilir (tr-TR buyuk harf
dönüşümü nedeniyle get_by_label güvenlidir — faz4 E2E düzeneğiyle aynı).
"""
import os

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8081"
SHOT_DIR = "/home/z/my-project/docs/screenshots/v1.0.0/mobil"

os.makedirs(SHOT_DIR, exist_ok=True)

done = []
failed = []


def shot(page, name, note=""):
    path = os.path.join(SHOT_DIR, f"{name}.png")
    page.screenshot(path=path)
    size = os.path.getsize(path)
    done.append((name, size))
    print(f"  OK {name}.png ({size} bayt) {note}")


def step(name):
    def deco(fn):
        def wrapper(*a, **k):
            try:
                fn(*a, **k)
            except Exception as e:
                failed.append((name, str(e)[:150]))
                print(f"  FAIL {name} — {str(e)[:150]}")
        return wrapper
    return deco


def pass_onboarding(page):
    try:
        btn = page.get_by_text("Misafir olarak keşfet", exact=True).first
        btn.wait_for(state="visible", timeout=5000)
        btn.click()
        page.wait_for_timeout(1200)
    except Exception:
        pass


def goto(page, path, settle=2500):
    page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    page.wait_for_timeout(settle)
    pass_onboarding(page)
    page.wait_for_timeout(1000)


def open_detail(page, slug):
    page.goto(f"{BASE}/content/{slug}", wait_until="domcontentloaded")
    page.wait_for_timeout(1800)
    pass_onboarding(page)
    page.wait_for_timeout(1200)
    play = page.get_by_label("Oynat", exact=True).first
    play.wait_for(state="visible", timeout=20000)
    return play


def login(page):
    page.goto(f"{BASE}/auth/login", wait_until="domcontentloaded")
    page.wait_for_timeout(1800)
    pass_onboarding(page)
    page.locator("input[type='email'], input").first.fill("viewer@perdego.dev")
    page.locator("input[type='password']").first.fill("Dev12345")
    shot(page, "10-giris-doldurulmus")
    page.get_by_label("Giriş Yap", exact=True).first.click()
    page.wait_for_timeout(3500)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        ctx = browser.new_context(
            viewport={"width": 412, "height": 915},
            device_scale_factor=2,
        )
        page = ctx.new_page()

        # --- MISAFIR AKISI -------------------------------------------------
        # 01 onboarding (taze ilk acilis)
        page.goto(BASE, wait_until="domcontentloaded")
        page.wait_for_timeout(4000)
        shot(page, "01-onboarding")

        # 02 misafir ana sayfa
        try:
            page.get_by_text("Misafir olarak keşfet", exact=True).first.click()
            page.wait_for_timeout(3500)
            shot(page, "02-anasayfa-misafir")
        except Exception as e:
            failed.append(("02", str(e)[:120])); print(f"  FAIL 02 {e}")

        # 03 kesfet
        try:
            goto(page, "/explore", 3000)
            shot(page, "03-kesfet")
        except Exception as e:
            failed.append(("03", str(e)[:120])); print(f"  FAIL 03 {e}")

        # 04 arama bos
        try:
            goto(page, "/search", 3000)
            shot(page, "04-arama-bos")
        except Exception as e:
            failed.append(("04", str(e)[:120])); print(f"  FAIL 04 {e}")

        # 05 arama sonuc
        try:
            page.locator("input").first.fill("kayıp")
            page.wait_for_timeout(2500)
            shot(page, "05-arama-sonuc")
        except Exception as e:
            failed.append(("05", str(e)[:120])); print(f"  FAIL 05 {e}")

        # 06 detay (FREE)
        try:
            open_detail(page, "kayip-sinyal")
            shot(page, "06-detay-free")
        except Exception as e:
            failed.append(("06", str(e)[:120])); print(f"  FAIL 06 {e}")

        # 07 oynatici (video yuklu, kontroller gorunur)
        try:
            page.get_by_label("Oynat", exact=True).first.click()
            page.wait_for_selector("video", timeout=30000)
            page.wait_for_timeout(2500)
            shot(page, "07-oynatici-oynuyor")
            page.wait_for_timeout(5000)  # izleme senkronu flush
        except Exception as e:
            failed.append(("07", str(e)[:120])); print(f"  FAIL 07 {e}")

        # 08 kredi kilit paneli (CREDIT bolum)
        try:
            try:
                page.get_by_label("Kapat", exact=True).first.click()
                page.wait_for_timeout(1200)
            except Exception:
                page.go_back(); page.wait_for_timeout(1200)
            open_detail(page, "gizli-bahce").click()
            page.wait_for_timeout(2000)
            page.get_by_text("Bu bölüm kilitli", exact=False).first.wait_for(state="visible", timeout=12000)
            shot(page, "08-kredi-kilit")
            page.go_back(); page.wait_for_timeout(1200)
        except Exception as e:
            failed.append(("08", str(e)[:120])); print(f"  FAIL 08 {e}")

        # 09 abonelik etiketleri (SUBSCRIPTION bolum rozetleri)
        try:
            page.goto(f"{BASE}/content/son-vardiya", wait_until="domcontentloaded")
            page.wait_for_timeout(2200)
            pass_onboarding(page)
            page.get_by_text("Üyelere", exact=False).first.wait_for(state="visible", timeout=15000)
            shot(page, "09-abonelik-etiketleri")
        except Exception as e:
            failed.append(("09", str(e)[:120])); print(f"  FAIL 09 {e}")

        # --- UYE AKISI -----------------------------------------------------
        # 10/11 giris
        try:
            login(page)
            shot(page, "11-giris-sonrasi-anasayfa")
        except Exception as e:
            failed.append(("10-11", str(e)[:120])); print(f"  FAIL 10-11 {e}")

        # 12 devam et (izleme sonrasi ana sayfa)
        try:
            page.goto(f"{BASE}/", wait_until="domcontentloaded")
            page.wait_for_timeout(3000)
            shot(page, "12-anasayfa-devam-et")
        except Exception as e:
            failed.append(("12", str(e)[:120])); print(f"  FAIL 12 {e}")

        # 13 planim (library)
        try:
            goto(page, "/library", 3000)
            shot(page, "13-planim")
        except Exception as e:
            failed.append(("13", str(e)[:120])); print(f"  FAIL 13 {e}")

        # 14 profil
        try:
            goto(page, "/profile", 3000)
            shot(page, "14-profil")
        except Exception as e:
            failed.append(("14", str(e)[:120])); print(f"  FAIL 14 {e}")

        # 15 paywall (abonelik planlari)
        try:
            goto(page, "/paywall", 3500)
            shot(page, "15-abonelik-planlari")
        except Exception as e:
            failed.append(("15", str(e)[:120])); print(f"  FAIL 15 {e}")

        # 16 kredi paketleri
        try:
            goto(page, "/credits", 3000)
            shot(page, "16-kredi-paketleri")
        except Exception as e:
            failed.append(("16", str(e)[:120])); print(f"  FAIL 16 {e}")

        # 17 bildirim merkezi
        try:
            goto(page, "/notifications", 3000)
            shot(page, "17-bildirimler")
        except Exception as e:
            failed.append(("17", str(e)[:120])); print(f"  FAIL 17 {e}")

        # 18 bildirim tercihleri
        try:
            goto(page, "/account/notification-preferences", 3000)
            shot(page, "18-bildirim-tercihleri")
        except Exception as e:
            failed.append(("18", str(e)[:120])); print(f"  FAIL 18 {e}")

        # 19 hesap silme (magaza gereksinimi)
        try:
            goto(page, "/account/delete-account", 3000)
            shot(page, "19-hesap-silme")
        except Exception as e:
            failed.append(("19", str(e)[:120])); print(f"  FAIL 19 {e}")

        # 20 kayit
        try:
            ctx_misafir = browser.new_context(viewport={"width": 412, "height": 915}, device_scale_factor=2)
            p2 = ctx_misafir.new_page()
            p2.goto(f"{BASE}/auth/register", wait_until="domcontentloaded")
            p2.wait_for_timeout(2200)
            pass_onboarding(p2)
            p2.wait_for_timeout(800)
            shot(p2, "20-kayit")
            ctx_misafir.close()
        except Exception as e:
            failed.append(("20", str(e)[:120])); print(f"  FAIL 20 {e}")

        ctx.close()
        browser.close()

    print(f"\n[release-shots] {len(done)} ekran görüntüsü, {len(failed)} başarısız adım")
    for name, err in failed:
        print(f"  ✗ {name}: {err}")


if __name__ == "__main__":
    main()
