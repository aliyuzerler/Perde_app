#!/usr/bin/env python3
"""env.schema.spec.ts — üretim env testlerini Base64-PEM üreticisiyle düzeltir (satır bazında)."""
import io

path = "/home/z/my-project/apps/api/src/config/env.schema.spec.ts"
with io.open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

# describe bloğundan önce yardımcı üreticileri ekle
helper = (
    "/** Base64 kodlu sahte PEM üretici (test anahtarı — geçersiz içerik, yalnız biçim denetimi). */\n"
    "const fakePem = (tag: string) => `-----BEGIN ${tag}-----\\nZmFrZQ==\\n-----END ${tag}-----`;\n"
    "const fakePrivKey = Buffer.from(fakePem('RSA PRIVATE KEY')).toString('base64');\n"
    "const fakePubKey = Buffer.from(fakePem('PUBLIC KEY')).toString('base64');\n\n"
)

out = []
i = 0
describe_inserted = False
while i < len(lines):
    line = lines[i]
    if not describe_inserted and line.startswith("describe('loadEnv"):
        out.append(helper)
        describe_inserted = True
    # Redacted PEM satırlarını değiştir (test1: pub+priv, test2: pub+priv)
    if "REDACTED:ssh_private_key" in line:
        out.append("      JWT_ACCESS_PRIVATE_KEY: fakePrivKey,\n")
        i += 1
        continue
    if "BEGIN PUBLIC KEY" in line and "JWT_ACCESS_PUBLIC_KEY" in line:
        out.append("      JWT_ACCESS_PUBLIC_KEY: fakePubKey,\n")
        i += 1
        continue
    out.append(line)
    i += 1

with io.open(path, "w", encoding="utf-8") as f:
    f.writelines(out)

print("OK — describe_inserted:", describe_inserted)
