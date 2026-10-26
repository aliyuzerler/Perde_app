# PerdeGo v1.0.0 — Yayın APK'sı

| Özellik | Değer |
|---------|-------|
| Dosya | `PerdeGo-v1.0.0-release.apk` (42.9 MB) |
| Uygulama kimliği | `com.perdego.app` |
| Sürüm | 1.0.0 (versionCode 1) |
| Derleme türü | `assembleRelease` (Hermes, minify kapalı — Expo şablon varsayılanı) |
| İmza | `perdego-upload` yükleme keystore'u (PKCS12, RSA 2048, geçerlilik ~27 yıl) |
| API adresi | `https://api.perdego.com` (üretim env'i — `eas.json` production profili) |
| Derleme ortamı | Gradle 9.4.1, AGP (Expo 58 şablonu), JDK 21, Android SDK 36 |
| Mimari | `arm64-v8a` (2026 gerçek cihaz kapsamı; Play 64-bit zorunluluğu) |
| Reçete | `docs/ANDROID_BUILD.md` |

## Kurulum

APK'yı Android cihaza kopyalayıp açın (bilinmeyen kaynaklar izni gerekebilir).
Android 8+ üzerinde "Bu uygulama güvenli değil" benzeri Play Protect uyarısı
gelirse "Yine de kur" ile ilerleyin — imza mağaza dışı dağıtım içindir.

## Önemli — bu APK'nın çalışma durumu

APK, `EXPO_PUBLIC_API_BASE_URL=https://api.perdego.com` ile derlendi. Bu adresin
DNS'i henüz yayında DEĞİL; backend dağıtımı (Release Checklist → manuel adımlar)
tamamlanana kadar uygulama açılır, onboarding ve yerel arayüz çalışır, katalog/
giriş/akış çağrıları ağ hatası durumuna düşer. Bu kasıtlı ve belgelenmiş bir
dürüstlük durumdur: gerçekte var olmayan bir sunucuya sahte veri gösterilmez.

## İmza (keystore) yönetimi

Yükleme keystore'u güvenlik gereği bu depoya COMMIT EDİLMEDİ. Derleme makinesinde
`build/perdego-upload.keystore` olarak üretilmiş olup teslimatta ayrıca verilir.
Sonraki sürümlerin aynı imzayla üretilmesi için keystore dosyasını ve
`gradle.properties` içindeki `MY_APP_UPLOAD_*` parametrelerini GÜVENLİ saklayın
(kaybedilirse aynı uygulama kimliğine imzalı güncelleme yüklenemez):

- `MY_APP_UPLOAD_STORE_FILE=perdego-upload.keystore`
- `MY_APP_UPLOAD_KEY_ALIAS=perdego-upload`
- Mağaza/anahtar parolası: keystore teslim paketindeki `KEYSTORE_BILGILERI.txt` içinde

Mağaza gönderimi öncesi (Play App Signing) bu yükleme anahtarı Google'a
yüklenir; istenirse yeni bir keystore ile döndürme yapılabilir — bkz.
`RELEASE_CHECKLIST.md` § Android imza adımları.
