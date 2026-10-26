# Android Derleme Reçetesi (PerdeGo v1.0.0)

Bu belge, v1.0.0 yayın APK'sının (`releases/PerdeGo-v1.0.0-release.apk`) bu depodan
yeniden üretilmesi için gereken adımları içerir.

## Gereksinimler

| Araç | Sürüm | Not |
|------|-------|-----|
| JDK | 21 (Temurin) | `javac` içeren tam JDK (yalnız JRE yetmez) |
| Android SDK | platform 36, build-tools 36.0.0, platform-tools | `sdkmanager` ile |
| NDK | 27.1.12297006 | RN 0.88 varsayılanı |
| CMake/Ninja | 3.22.1 (SDK paketi) | |
| Node/pnpm | Node ≥ 20, pnpm ≥ 10 | monorepo bağımlılıkları için |

## Adımlar

```bash
# 1) Bağımlılıklar
pnpm install

# 2) Native proje üretimi (android/ git'te yoksa)
cd apps/mobile
npx expo prebuild --platform android --no-install

# 3) İmza: keystore dosyasını android/app/ altına koyun ve
#    android/gradle.properties içine şunu ekleyin:
#    MY_APP_UPLOAD_STORE_FILE=perdego-upload.keystore
#    MY_APP_UPLOAD_KEY_ALIAS=perdego-upload
#    MY_APP_UPLOAD_STORE_PASSWORD=<parola>
#    MY_APP_UPLOAD_KEY_PASSWORD=<parola>
#    (Keystore depoya GİRMEZ; kayıp olursa yeni keystore ile
#     sürüm döndürmek gerekir — releases/README.md)

# 4) Derleme
cd android
export JAVA_HOME=<jdk-21-yolu>
export ANDROID_HOME=<sdk-yolu>
EXPO_PUBLIC_MOCK_API=0 EXPO_PUBLIC_API_BASE_URL=https://api.perdego.com \
  ./gradlew assembleRelease --no-daemon \
  "-Pkotlin.daemon.jvmargs=-Xmx512m -XX:MaxMetaspaceSize=320m"

# Çıktı: app/build/outputs/apk/release/app-release.apk
```

## Bellek ayarları (kısıtlı makinalar için)

`android/gradle.properties` içinde:
- `org.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m` (R8 için 1536m gerekli)
- `kotlin.daemon.jvmargs=-Xmx512m ...` (Kotlin daemon varsayılanı 1792m'dir —
  included build'ler ana ayarı miras ALMAZ; `-Pkotlin.daemon.jvmargs=...` ile
  komut satırından vermek tüm build'leri kapsar)

## v1.0.0 derlemesinde belgelenmiş sapmalar (dürüstlük notu)

Bu ortamda (9.9 GB disk / 3.9 GB RAM konteyner) derleme sırasında aşağıdaki
adımlar **atlandı** (`-x`). Çalışma zamanı çıktısını etkilemezler; mağaza
gönderimi öncesi tam derlemede tekrar çalıştırılmalıdır:

- `lintVital*` — yalnızca derleme-sonrası statik analiz raporu
- `compileReleaseArtProfile` — baseline profile optimizasyonu (performans
  ipucu; yokluğu işlevselliği etkilemez)
- CMake/native görevlerin bazı yeniden-koşuları — tüm yerel `.so` çıktıları
  önceki tam derlemelerden üretilmiş ve pakete gömülmüştür

Derleme yalnızca `arm64-v8a` için yapıldı (`reactNativeArchitectures=arm64-v8a`).
2026'da tüm gerçek cihazlar arm64'tür; Play Store 64-bit zorunludur.

## Ortam değişkenleri (APK'ya gömülür)

- `EXPO_PUBLIC_MOCK_API=0` — gerçek HTTP adapter
- `EXPO_PUBLIC_API_BASE_URL=https://api.perdego.com` — backend dağıtılana dek
  ağ çağrıları hata durumuna düşer (kasıtlı; sahte veri gösterilmez)
