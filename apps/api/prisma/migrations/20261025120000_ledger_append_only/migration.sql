-- FAZ-3 QA düzeltmesi (F3-02): credit_ledger append-only garantisi DB düzeyinde.
--
-- ERD §credit_ledger: "append-only dövmez (BR-04)" — dövmez kimlik alanları
-- (userId, type, delta, purchasedDelta, grantedDelta, referenceType,
-- referenceId, idempotencyKey, expiresAt) eklendikten sonra DEĞİŞEMEZ.
-- FAZ-2B raporunda "append-only yazma rolü SQL'e elle eklendi" iddiası
-- gerçek değildi; bu migration iddiayı gerçekleştirir.
--
-- Tasarım notu: ERD'deki rol tabanlı model (perdego_ledger_writer) mevcut
-- dağıtım topolojisinde (docker POSTGRES_USER=perdego = superuser) koruma
-- sağlamaz — yetkiler superuser'ı bağlamaz. Tetikleyici her rol için çalışır
-- ve hem gömülü QA hem compose ortamında aynı davranışı verir.
--
-- İzin verilen tek güncelleme: bakiye snapshot alanları
-- (balanceAfterPurchased / balanceAfterGranted) — uygulamanın "create → aynı
-- transaction içinde snapshot tamamla" deseni credits.service'te kullanılır.

CREATE OR REPLACE FUNCTION "credit_ledger_append_only_guard_fn"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'credit_ledger append-only (BR-04): % reddedildi', TG_OP
      USING ERRCODE = 'P0001';
  END IF;
  -- UPDATE: finansal öz kimlik alanları değişemez.
  IF OLD."userId"          IS DISTINCT FROM NEW."userId"
     OR OLD."type"         IS DISTINCT FROM NEW."type"
     OR OLD."delta"        IS DISTINCT FROM NEW."delta"
     OR OLD."purchasedDelta" IS DISTINCT FROM NEW."purchasedDelta"
     OR OLD."grantedDelta" IS DISTINCT FROM NEW."grantedDelta"
     OR OLD."referenceType"  IS DISTINCT FROM NEW."referenceType"
     OR OLD."referenceId"  IS DISTINCT FROM NEW."referenceId"
     OR OLD."idempotencyKey" IS DISTINCT FROM NEW."idempotencyKey"
     OR OLD."expiresAt"    IS DISTINCT FROM NEW."expiresAt" THEN
    RAISE EXCEPTION 'credit_ledger append-only (BR-04): finansal alan güncellemesi reddedildi'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "credit_ledger_append_only_row_guard"
BEFORE UPDATE OR DELETE ON "credit_ledger"
FOR EACH ROW EXECUTE FUNCTION "credit_ledger_append_only_guard_fn"();

CREATE TRIGGER "credit_ledger_append_only_truncate_guard"
BEFORE TRUNCATE ON "credit_ledger"
FOR EACH STATEMENT EXECUTE FUNCTION "credit_ledger_append_only_guard_fn"();
