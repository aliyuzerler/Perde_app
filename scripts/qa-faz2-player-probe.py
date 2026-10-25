"""Oynatıcı ekranı probu: gerçek metin içeriğini ve durumunu göster."""
import time

from playwright.sync_api import sync_playwright

BASE = "http://localhost:8081"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True)
    page = ctx.new_page()
    errs = []
    page.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)

    for name, url in [
        ("FREE e_kum_101", BASE + "/player/e_kum_101?contentId=c_kum_saati"),
        ("SUBSCRIPTION e_kum_102", BASE + "/player/e_kum_102?contentId=c_kum_saati"),
    ]:
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        time.sleep(15)
        body = page.evaluate("document.body.innerText.slice(0, 500)")
        print(f"=== {name} url={page.url}")
        print(body.replace("\n", " | ")[:480])
        page.screenshot(path=f"/tmp/player-probe-{name.split()[0]}.png")
        print()

    print("--- konsol hataları ---")
    for e in errs[:8]:
        print(" •", e)
    browser.close()
