"""Adım-16 hata ayıklama: ara → Son Vardiya → detay → favori düğmesi."""
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8081"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto(BASE + "/", wait_until="domcontentloaded", timeout=120000)
    page.get_by_text("Misafir olarak keşfet").first.wait_for(state="visible", timeout=60000)
    page.get_by_text("Misafir olarak keşfet").first.click()
    time.sleep(3)

    page.goto(BASE + "/search", wait_until="domcontentloaded", timeout=60000)
    time.sleep(3)
    inp = page.locator('input:not([type="checkbox"]):not([type="switch"])').first
    inp.click()
    inp.type("Son", delay=50)
    time.sleep(3)
    page.screenshot(path="/tmp/dbg16-1-arama.png")
    matches = page.get_by_text("Son Vardiya", exact=False)
    print("'Son Vardiya' eşleşme:", matches.count())
    for i in range(matches.count()):
        print(f"  [{i}] box:", matches.nth(i).bounding_box())
    matches.first.click(timeout=8000)
    time.sleep(2.5)
    page.screenshot(path="/tmp/dbg16-2-detay.png")
    labels = page.evaluate("""() => Array.from(document.querySelectorAll('[aria-label]')).map(e => e.getAttribute('aria-label')).slice(0, 20)""")
    print("detay aria-labels:", labels)
    print("url:", page.url)
    browser.close()
