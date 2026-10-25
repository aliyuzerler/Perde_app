"""Keşfet 'Dram' çipi tıklama denemesi — neden timeout?"""
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
    page.get_by_text("Keşfet", exact=True).first.click()
    time.sleep(2.5)

    locs = page.get_by_text("Dram", exact=True)
    print("eşleşme:", locs.count())
    for i in range(locs.count()):
        el = locs.nth(i)
        box = el.bounding_box()
        visible = el.is_visible()
        print(f"  [{i}] visible={visible} box={box}")
    # İlk eşleşmenin kapsayıcı zincirine bak
    info = page.evaluate("""() => {
        const walker = document.evaluate("//div[normalize-space(text())='Dram']", document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        const out = [];
        for (let i = 0; i < Math.min(walker.snapshotLength, 3); i++) {
            const el = walker.snapshotItem(i);
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            out.push({tag: el.tagName, rect: {x: r.x, y: r.y, w: r.width, h: r.height}, pe: cs.pointerEvents, disp: cs.display});
        }
        return out;
    }""")
    for x in info:
        print("  xpath:", x)
    # JS ile tıkla
    clicked = page.evaluate("""() => {
        const els = document.evaluate("//div[normalize-space(text())='Dram']", document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        if (els.snapshotLength === 0) return 'yok';
        els.snapshotItem(0).click();
        return 'tıklandı';
    }""")
    print("JS tıklama:", clicked)
    time.sleep(2.5)
    body = page.locator("body").inner_text()
    print("sonrası url:", page.url, "| Sayfa başlığı/konu:", body[:120].replace(chr(10), ' | '))
    page.screenshot(path="/tmp/dbg-dram.png")
    browser.close()
