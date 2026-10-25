#!/usr/bin/env python3
"""PerdeGo ekran goruntulerini download klasorune kopyalar + katalog (contact sheet) uretir."""
import os
import shutil
from PIL import Image, ImageDraw, ImageFont

SRC = "/home/z/my-project/docs/qa/screenshots"
DST = "/home/z/my-project/download/perdego-ekran-goruntuleri"
os.makedirs(DST, exist_ok=True)

# Sıralı, kullanıcı-dostu isimler (mevcut dosya adları zaten Türkçe + numaralı)
files = sorted(f for f in os.listdir(SRC) if f.endswith(".png"))
for f in files:
    shutil.copy2(os.path.join(SRC, f), os.path.join(DST, f))
print(f"Kopyalanan ekran goruntu sayisi: {len(files)}")

# ---- Katalog (contact sheet) ----
COLS, ROWS = 6, 4
THUMB_W = 250
PAD = 18
LABEL_H = 34
HEADER_H = 96

thumbs = []
for f in files:
    img = Image.open(os.path.join(SRC, f)).convert("RGB")
    ratio = THUMB_W / img.width
    th = img.resize((THUMB_W, int(img.height * ratio)), Image.LANCZOS)
    thumbs.append((f, th))

THUMB_H = max(t.height for _, t in thumbs)
CELL_W = THUMB_W + PAD
CELL_H = THUMB_H + LABEL_H + PAD
SHEET_W = COLS * CELL_W + PAD
SHEET_H = HEADER_H + ROWS * CELL_H + PAD

sheet = Image.new("RGB", (SHEET_W, SHEET_H), (16, 12, 14))  # PerdeGo koyu zemin
draw = ImageDraw.Draw(sheet)

def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

f_title = font(40, bold=True)
f_sub = font(20)
f_label = font(15)

draw.text((PAD, 18), "PerdeGo — Örnek Ekran Görüntüleri", fill=(244, 240, 238), font=f_title)
draw.text((PAD, 66), "Dikey kısa film ve mini dizi platformu · 23 ekran · mock veri modu (geliştirme)", fill=(200, 140, 150), font=f_sub)

RED = (200, 34, 51)
for i, (name, th) in enumerate(thumbs):
    r, c = divmod(i, COLS)
    x = PAD + c * CELL_W
    y = HEADER_H + r * CELL_H
    # çerçeve
    draw.rectangle([x - 1, y - 1, x + THUMB_W, y + th.height], outline=(70, 52, 56), width=1)
    sheet.paste(th, (x, y))
    # etiket: numarayı at, açıklamayı göster
    label = name.split("-", 1)[1].replace(".png", "").replace("-", " ")
    draw.text((x + 2, y + th.height + 6), f"{label[:32]}", fill=(190, 180, 182), font=f_label)

out = os.path.join(DST, "00-katalog-tum-ekranlar.png")
sheet.save(out, optimize=True)
print(f"Katalog olusturuldu: {out} ({sheet.width}x{sheet.height})")
