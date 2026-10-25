"""Login akışı hata ayıklama — adım adım URL + ekran kaydı."""
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8081"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on("console", lambda m: print("  CE:", m.text[:150]) if m.type == "error" else None)
    page.on("pageerror", lambda e: print("  PE:", str(e)[:150]))

    page.goto(BASE + "/", wait_until="domcontentloaded", timeout=120000)
    page.get_by_text("Misafir olarak keşfet").first.wait_for(state="visible", timeout=60000)
    page.get_by_text("Misafir olarak keşfet").first.click()
    time.sleep(3)
    print("1) home url:", page.url)

    page.get_by_text("Profil", exact=True).first.click()
    time.sleep(2)
    print("2) profil url:", page.url)
    labels = page.evaluate("""() => Array.from(document.querySelectorAll('[aria-label]')).map(e => e.getAttribute('aria-label'))""")
    print("3) aria-labels:", labels[:12])

    btn = page.get_by_label("Giriş Yap")
    print("4) 'Giriş Yap' eşleşme sayısı:", btn.count())
    if btn.count() > 0:
        btn.first.click()
        time.sleep(2.5)
        print("5) tıklama sonrası url:", page.url)
        inputs = page.evaluate("""() => Array.from(document.querySelectorAll('input')).map(e => ({type: e.type, role: e.getAttribute('role'), visible: e.offsetParent !== null}))""")
        print("6) inputs:", inputs)
        page.screenshot(path="/tmp/dbg-login.png")
        body = page.locator("body").inner_text()
        print("7) E-posta görünür:", "E-posta" in body, "| Profil başlığı:", body.startswith("Profil"))
    browser.close()
