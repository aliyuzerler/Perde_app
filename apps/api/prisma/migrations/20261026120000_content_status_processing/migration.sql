-- Faz 2c: içerik yaşam döngüsüne "işleniyor" (PROCESSING) durumu eklendi.
-- Taslak → İşleniyor → Yayında → Arşivde akışı; PROCESSING kayıtları
-- herkese açık katalog uçlarında görünmez (publishedContentFilter yalnızca
-- status='PUBLISHED' eşleşmesine bakar — kod düzeyinde kanıt: catalog.service.ts).
-- Not: PostgreSQL ADD VALUE ile yeni enum değeri mevcut transaction'da
-- kullanılamaz; migration runner ayrı transaction koştuğu için güvenlidir.
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
