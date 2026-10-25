# Hesap Silme Politikası ve Veri Yaşam Döngüsü (BR-11, KVKK)

> Kapsam: PerdeGo hesap silme talebi → nefallet süresi → kalıcı temizlik.
> Uygulama: `apps/api/src/account/account.service.ts` (Faz 3b).
> İlgili metinler: gizlilik politikası §4 (saklama süreleri), kullanım
> koşulları §2 (hesap).

## 1. Süreç özeti

```
[1] POST /account/delete-request (parola teyitli)
    ├─ hesap kilitlenir: status=DELETED, deletedAt=mühür
    ├─ TÜM oturumlar iptal edilir (refresh reddedilir)
    ├─ account_deletion_requests satırı açılır (purgeAt = +30 gün)
    └─ onay e-postası gider (geri alma yolu anlatılır)

[2] Nefallet (30 gün): kullanıcı hesabına giriş yapamaz, ancak
    POST /account/restore { email, password } ile talebi geri alabilir
    → status=ACTIVE, talep CANCELED, tam oturum döner, bilgilendirme e-postası.

[3] purgeExpiredDeletions(now) — nefallet dolan talepler:
    ├─ kişisel veriler silinir/anonimleştirilir (§2 matrisi)
    ├─ talep COMPLETED + purgedAt mühürlenir
    └─ geri alma artık imkânsız (giriş 401, e-posta anonim adres)
```

Üretimde purge'un günlük cron/kuyruk ile koşması Faz 6 dağıtım maddesidir;
bu fazda yöntem entegrasyon testiyle kanıtlanmıştır.

## 2. Veri matrisi: silinen vs. korunan

| Veri | Karar | Gerekçe |
|------|-------|---------|
| E-posta | **Anonimleştirilir** → `deleted-{sha256(userId)[:24]}@anonymized.invalid` | Hesap geri açılamaz; FK bütünlüğü korunur |
| Parola hash'i | **Silinir** (NULL) | Kimlik doğrulama imkânsızlaşır |
| Görünen ad | **Değiştirilir** → `Silinmiş kullanıcı` | PII |
| Avatar | **Silinir** (dosya + URL) | PII |
| Doğum yılı | **Silinir** (NULL) | PII |
| Oturumlar, cihazlar, e-posta anahtarları | **Silinir** | Güvenlik gereği |
| İzleme geçmişi (watch_history) | **Silinir** | Kullanıcı talebi (KVKK m.7 silme hakkı) |
| Favoriler | **Silinir** | Kullanıcı talebi |
| Oynatma oturumları | **Silinir** | Teknik veri |
| Bildirimler + tercihi | **Silinir** | PII |
| **store_transactions** | **KORUNUR** | Vergi mevzuatı (VUK 10 yıl), ihtilaf/iade savunması |
| **credit_ledger** | **KORUNUR** | Append-only finansal kayıt (BR-04), denetim |
| **subscriptions** | **KORUNUR** | Sözleşme + mağaza mutabakatı |
| **episode unlock hakları** | **KORUNUR** | Ödenmiş hak kaydı (anonim) |
| Audit log'ları | **KORUNUR** | Denetim gerekliliği |

Finansal kayıtlar kullanıcı kimliğine (anonim FK) bağlı kalır; hiçbir alan
PII içermez. "Silinmiş kullanıcı" hesabı tekrar üye olamaz — e-posta adresi
sistemde anonim adresle değiştirilmiştir; yeni kayıt aynı adresle mümkündür.

## 3. E-posta bildirimleri

| Olay | Şablon | İçerik |
|------|--------|--------|
| Talep alındı | `deletionScheduledEmail` | purgeAt tarihi + geri alma yolu |
| Talep iptal | `deletionCanceledEmail` | hesap yeniden etkin |

## 4. Kullanıcıya gösterim (mobil)

- `Hesabımı sil` ekranı: süreç, nefallet, finansal saklama düz dille anlatılır
  (parola teyidi zorunlu).
- Silme sonrası ekran: purgeAt tarihi + "bu tarihe kadar geri alabilirsin".
- Girişte `BAD_CREDENTIALS` — silinmiş hesap ile normal giriş arasında
  ayrım sızdırılmaz (sayım engeli). Geri alma `restore` ucu üzerinden yapılır.
