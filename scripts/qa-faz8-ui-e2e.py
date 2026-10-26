#!/usr/bin/env python3
"""
FAZ 8 UI E2E — Admin panel tarayıcı testleri (madde 11 + RBAC görünürlük + tablet).
Sunucular ayaktayken koşar: ADMIN_BASE (varsayılan http://127.0.0.1:3000).
Sonuçlar: scripts/qa-faz8-ui-results.json
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3000"
RESULT_PATH = "/home/z/my-project/scripts/qa-faz8-ui-results.json"
SHOT_DIR = "/home/z/my-project/scripts/qa-faz8-ui-shots"

results = []


def record(step, status, detail=""):
    results.append({"step": step, "status": status, "detail": detail})
    print(f"  {status} {step}" + (f" — {detail}" if detail else ""))


def ok(step, cond, detail=""):
    record(step, "PASS" if cond else "FAIL", detail)
    return cond


import os

os.makedirs(SHOT_DIR, exist_ok=True)


def shot(page, name):
    page.screenshot(path=f"{SHOT_DIR}/{name}.png", full_page=False)


def login(page, email, password):
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    page.get_by_placeholder("admin@perdego.dev").fill(email)
    page.get_by_placeholder("••••••••").fill(password)
    page.get_by_role("button", name="Giriş").click()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        # ── U1: boş form doğrulaması ──
        page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        page.get_by_role("button", name="Giriş").click()
        ok("U1 boş form → alan hataları görünür",
           page.get_by_text("E-posta zorunludur").count() > 0
           and page.get_by_text("Parola zorunludur").count() > 0)
        shot(page, "u1-login-validation")

        # ── U2: yanlış parola → sunucu hatası ──
        login(page, "admin@perdego.dev", "yanlis-parola")
        page.wait_for_selector("[role=alert]", timeout=10000)
        ok("U2 yanlış parola → hata uyarısı (role=alert)", page.locator("[role=alert]").count() > 0)
        shot(page, "u2-login-wrong-password")

        # ── U3: başarılı giriş → dashboard ──
        login(page, "admin@perdego.dev", "Admin12345")
        page.wait_for_selector("text=Panel Özeti", timeout=20000)
        ok("U3 admin girişi → Panel Özeti", True)
        ok("U3b tarih aralığı denetimi", page.get_by_label("Tarih aralığı").count() > 0)
        card = page.get_by_text("Toplam Kullanıcı").locator("xpath=..").inner_text()
        ok("U4 Toplam Kullanıcı kartı veriyle dolu", any(ch.isdigit() for ch in card), f"kart={card.strip()[:40]!r}")
        shot(page, "u3-dashboard")

        # ── U5: oturum kalıcılığı (yeniden yükleme) ──
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        ok("U5 reload sonrası oturum korunur", page.url.rstrip("/") == BASE and "Panel Özeti" in page.content())

        # ── U6: Yapımlar — oluşturma modalı boş gönderim → alan hataları ──
        page.get_by_role("link", name="Yapımlar").first.click()
        page.wait_for_selector("text=Yeni Yapım", timeout=20000)
        page.get_by_role("button", name="Yeni Yapım").click()
        page.wait_for_selector("text=Yeni Yapım (taslak)", timeout=10000)
        page.get_by_role("button", name="Taslak Oluştur").click()
        page.wait_for_timeout(1200)
        # Sunucu taraflı doğrulama: API 400 → fieldErrors kırmızı hata metinleri
        err_count = page.locator("span.text-\\[var\\(--pg-red\\)\\]").count()
        ok("U6 boş yapım formu → sunucu doğrulama hataları görüntülenir", err_count > 0, f"hata öğesi={err_count}")
        shot(page, "u6-title-create-validation")

        # ── U7: geçerli form ile taslak oluştur ──
        stamp = str(int(time.time()))
        page.get_by_placeholder("karanlik-sehir").fill(f"qa8-ui-film-{stamp}")
        page.get_by_label("Başlık (TR)").fill(f"QA8 UI Filmi {stamp}")
        page.get_by_label("Başlık (EN)").fill(f"QA8 UI Film {stamp}")
        page.get_by_label("Sinopsis (TR)").fill("UI E2E ile oluşturulan taslak")
        page.get_by_label("Sinopsis (EN)").fill("Draft created by UI E2E")
        page.get_by_role("button", name="Taslak Oluştur").click()
        # Başarılı oluşturma sonrası panel detay sayfasına yönlendirir
        page.wait_for_url("**/titles/*", timeout=15000)
        page.wait_for_selector("text=Bilgiler", timeout=15000)
        created_id = page.url.rstrip("/").split("/")[-1]
        ok("U7 UI ile taslak oluşturuldu → detay sayfası açıldı", len(created_id) > 10, f"id={created_id[:12]}…")
        shot(page, "u7-title-created")

        # ── U8: detay sayfası — bilgi düzenleme ──
        tag = page.get_by_label("Slogan (TR)")
        if tag.count():
            tag.fill(f"UI E2E slogan {stamp}")
            page.get_by_role("button", name="Kaydet").first.click()
            page.wait_for_selector("text=Yapım bilgileri kaydedildi", timeout=8000)
            ok("U8 detay bilgisi kaydedildi (başarı bildirimi)", True)
        else:
            ok("U8 detay bilgisi kaydedildi", False, "Slogan alanı bulunamadı")
        shot(page, "u8-title-detail")

        # ── U9: Gelir Modeli (ADMIN) — düzenle → step-up diyaloğu ──
        page.get_by_role("link", name="Gelir Modeli").first.click()
        page.wait_for_selector("text=Planlar", timeout=15000)
        edit_btns = page.get_by_role("button", name="Düzenle")
        ok("U9 ADMIN için Düzenle etkin", edit_btns.count() > 0 and edit_btns.first.is_enabled())
        edit_btns.first.click()
        page.wait_for_selector("text=Step-up ile Kaydet", timeout=10000)
        page.get_by_role("button", name="Step-up ile Kaydet").click()
        page.wait_for_selector("text=Yeniden kimlik doğrulama", timeout=10000)
        ok("U9b step-up diyaloğu açılıyor (kritik işlem onayı)", True)
        shot(page, "u9-revenue-stepup")
        # yalnızca step-up diyaloğunun kapsamındaki Vazgeç (arkadaki modal üstte gider)
        stepup_dlg = page.locator('[role=dialog][aria-label="Yeniden kimlik doğrulama"]')
        stepup_dlg.get_by_role("button", name="Vazgeç").click()
        page.wait_for_timeout(400)
        # kalan plan düzenleme modalını da kapat
        if page.locator('[role=dialog]').count():
            page.locator('[role=dialog]').first.get_by_role("button", name="Vazgeç").click()
        page.wait_for_timeout(300)

        # ── U10: Kullanıcılar — arama ──
        page.get_by_role("link", name="Kullanıcılar").first.click()
        page.get_by_placeholder("e-posta veya ad…").wait_for(state="visible", timeout=15000)
        page.get_by_placeholder("e-posta veya ad…").fill("viewer@perdego.dev")
        page.wait_for_timeout(1200)
        ok("U10 kullanıcı arama sonuç verir", page.get_by_text("viewer@perdego.dev").count() > 0)
        shot(page, "u10-users-search")

        # ── U11: Denetim günlüğü kayıtları ──
        page.get_by_role("link", name="Denetim Günlüğü").first.click()
        page.wait_for_timeout(1800)
        rows = page.locator("table tbody tr").count()
        ok("U11 audit log tablosu kayıtlı", rows > 0, f"satır={rows}")
        shot(page, "u11-audit")

        # ── U12: çıkış ──
        page.get_by_role("button", name="Oturumu kapat").or_(page.get_by_role("button", name="Çıkış")).first.click()
        page.wait_for_timeout(1500)
        ok("U12 çıkış → /login", "/login" in page.url)
        ctx.close()

        # ── U13: EDITOR RBAC görünürlüğü ──
        ctx2 = browser.new_context(viewport={"width": 1440, "height": 900})
        epage = ctx2.new_page()
        login(epage, "editor@perdego.dev", "Admin12345")
        epage.wait_for_selector("text=Panel Özeti", timeout=20000)
        epage.get_by_role("link", name="Gelir Modeli").first.click()
        epage.wait_for_selector("text=Planlar", timeout=15000)
        ok("U13 EDITOR'e dürüst uyarı metni", epage.get_by_text("yalnızca ADMIN rolüyle").count() > 0)
        ebtn = epage.get_by_role("button", name="Düzenle").first
        ok("U13b EDITOR'de Düzenle devre dışı (disabled)", ebtn.count() > 0 and ebtn.is_disabled())
        shot(epage, "u13-editor-revenue")
        # ── U13c: EDITOR'de kampanya aksiyonu devre dışı ──
        epage.get_by_role("link", name="Bildirimler").first.click()
        epage.wait_for_timeout(1500)
        ann_btn = epage.get_by_role("button", name="Yeni Duyuru").first
        if ann_btn.count():
            ok("U13c EDITOR'de kampanya aksiyonu devre dışı", ann_btn.is_disabled())
        else:
            ok("U13c EDITOR'de kampanya aksiyonu devre dışı", epage.get_by_text("ADMIN").count() > 0, "buton EDITOR'e gizli")
        ctx2.close()

        # ── U14: tablet görünümü (768×1024) ──
        ctx3 = browser.new_context(viewport={"width": 768, "height": 1024})
        tpage = ctx3.new_page()
        login(tpage, "admin@perdego.dev", "Admin12345")
        tpage.wait_for_selector("text=Panel Özeti", timeout=20000)
        menu_btn = tpage.get_by_role("button", name="Menüyü aç")
        ok("U14 tablette menü butonu görünür (çekmece kapalı)", menu_btn.count() > 0 and menu_btn.is_visible())
        if menu_btn.count() and menu_btn.is_visible():
            menu_btn.click()
            tpage.wait_for_timeout(500)
        tpage.get_by_role("link", name="Yapımlar").first.click()
        tpage.wait_for_selector("text=Yeni Yapım", timeout=15000)
        ok("U14b tablette tablo kullanılabilir", tpage.locator("table").count() > 0)
        shot(tpage, "u14-tablet")
        ctx3.close()

        browser.close()

    with open(RESULT_PATH, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    print(f"\n[faz8-ui-e2e] {passed} PASS, {failed} FAIL (toplam {len(results)})")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
