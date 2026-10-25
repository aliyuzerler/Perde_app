"""Oturum kalıcılığı denetimi: UI ile giriş → tam sayfa yenileme → hâlâ üye mi?"""
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8081"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on("pageerror", lambda e: print("  PE:", str(e)[:200]))

    page.goto(BASE + "/", wait_until="domcontentloaded", timeout=120000)
    page.get_by_text("Misafir olarak keşfet").first.wait_for(state="visible", timeout=60000)
    page.get_by_text("Misafir olarak keşfet").first.click()
    time.sleep(3)

    # Profil → giriş
    page.get_by_text("Profil", exact=True).first.click()
    time.sleep(2)
    try:
        page.get_by_label("Giriş Yap").first.click(timeout=6000)
    except Exception:
        page.goto(BASE + "/auth/login", wait_until="domcontentloaded", timeout=60000)
    page.get_by_text("E-posta").first.wait_for(state="visible", timeout=20000)
    time.sleep(1)
    page.locator('input[type="email"]').first.fill("viewer@perdego.dev")
    page.locator('input[type="password"]').first.fill("Dev12345")
    page.get_by_label("Giriş Yap").last.click()
    for _ in range(20):
        time.sleep(1)
        b = page.locator("body").inner_text()
        if "Demo İzleyici" in b or "Çıkış Yap" in b:
            break
    print("1) giriş sonrası 'Demo İzleyici':", "Demo İzleyici" in page.locator("body").inner_text())

    # localStorage anahtarları (giriş anında)
    keys = page.evaluate("() => Object.keys(window.localStorage)")
    print("2) localStorage anahtarları:", keys)

    # TAM SAYFA YENİLEME → profil
    page.goto(BASE + "/profile", wait_until="domcontentloaded", timeout=60000)
    time.sleep(4)
    b2 = page.locator("body").inner_text()
    print("3) yenileme sonrası 'Demo İzleyici':", "Demo İzleyici" in b2)
    print("4) yenileme sonrası 'Misafir':", "Misafir" in b2)
    print("5) 'Çıkış Yap' var:", "Çıkış Yap" in b2)
    page.screenshot(path="/tmp/dbg-after-reload.png")

    # Planım ekranı
    page.goto(BASE + "/library", wait_until="domcontentloaded", timeout=60000)
    time.sleep(4)
    b3 = page.locator("body").inner_text()
    print("6) library 'Misafir modu':", "Misafir modu" in b3)
    print("7) library 'Son Vardiya' (devam):", "Son Vardiya" in b3)
    page.screenshot(path="/tmp/dbg-library-after-reload.png")
    browser.close()
