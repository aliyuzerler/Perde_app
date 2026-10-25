"use client";

/**
 * PerdeGo Admin — Faz 2a başlangıç ekranı.
 *
 * Amaç: admin panelinin çalıştığını ve API altyapısına eriştiğini tek
 * bakışta göstermek. Sağlık göstergesi DÜRÜSTTÜR: API/DB erişilemezse
 * hata durumu gösterilir; asla başarılı taklidi yapılmaz (görev madde 10).
 *
 * Tasarım: docs/DESIGN.md — koyu sinematik tema, dikdörtgen kartlar,
 * 0–4 px köşe yarıçapı.
 */

import { useCallback, useEffect, useState } from "react";

const DEFAULT_API_BASE = "http://localhost:3000";

type HealthState = "loading" | "up" | "down" | "error";

interface DbCheck {
  status: "up" | "down";
  latencyMs?: number;
  error?: string;
}

export default function AdminHomePage() {
  const envBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  const apiBase = envBase && envBase.length > 0 ? envBase : DEFAULT_API_BASE;

  const [apiState, setApiState] = useState<HealthState>("loading");
  const [dbCheck, setDbCheck] = useState<DbCheck | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  /**
   * Sağlık kontrolü — yalnızca await sonrasında setState yapar (senkron
   * setState yok). Mount efektinde ve buton tıklamasında kullanılır.
   */
  const check = useCallback(async () => {
    setApiError(null);
    setDbCheck(null);

    try {
      // 1) Süreç canlılığı (liveness)
      const liveRes = await fetch(`${apiBase}/health`, { cache: "no-store" });
      if (!liveRes.ok) {
        throw new Error(`/health ${liveRes.status} döndü`);
      }
      await liveRes.json();

      // 2) Veritabanı hazırlığı (readiness) — 503 de "yanıt" sayılır:
      //    API ayakta ama DB down ise down DURUMU gösterilir.
      const dbRes = await fetch(`${apiBase}/health/db`, { cache: "no-store" });
      const dbJson = (await dbRes.json()) as {
        checks?: { database?: DbCheck };
      };
      setDbCheck(dbJson.checks?.database ?? { status: "down" });

      setApiState("up");
      setCheckedAt(new Date().toLocaleTimeString("tr-TR"));
    } catch (error) {
      setApiState("error");
      setApiError(
        error instanceof Error ? error.message : "Bilinmeyen bağlantı hatası",
      );
    }
  }, [apiBase]);

  // İlk yüklemede otomatik kontrol (iptal güvenli; senkron setState yok)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const onError = () => {
        if (!cancelled) {
          setApiState("error");
        }
      };
      window.addEventListener("pagehide", onError);
      try {
        await check();
      } finally {
        window.removeEventListener("pagehide", onError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [check]);

  const apiLabel: Record<HealthState, string> = {
    loading: "Kontrol ediliyor…",
    up: "API çalışıyor",
    down: "API hazır değil",
    error: "API'ye erişilemedi",
  };

  const apiColor =
    apiState === "up"
      ? "text-[#2E7D32]"
      : apiState === "error" || apiState === "down"
        ? "text-[#B71C36]"
        : "text-[#F5F1EA]/64";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      {/* Başlık */}
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="inline-block h-8 w-1.5 bg-[#B71C36]" aria-hidden />
          <h1 className="text-2xl font-extrabold tracking-tight">
            PerdeGo Admin
          </h1>
        </div>
        <p className="text-sm text-[#F5F1EA]/64">
          İçerik ve işletme yönetim paneli — Faz 2a temel altyapı ekranı.
          İçerik yönetimi modülleri Faz 6&apos;da eklenecek.
        </p>
      </header>

      {/* Ortam bilgisi */}
      <section
        aria-label="Ortam yapılandırması"
        className="rounded-[4px] border border-[#F5F1EA]/8 bg-[#19191D] p-4"
      >
        <h2 className="text-sm font-semibold text-[#F5F1EA]/90">Ortam</h2>
        <ul className="mt-2 space-y-1 text-sm text-[#F5F1EA]/64">
          <li>
            API adresi: <code className="text-[#F5F1EA]">{apiBase}</code>
            {!envBase && (
              <span className="ml-2 rounded-[2px] bg-[#B71C36]/18 px-1.5 py-0.5 text-xs text-[#B71C36]">
                NEXT_PUBLIC_API_BASE_URL tanımlı değil — varsayılan kullanılıyor
              </span>
            )}
          </li>
        </ul>
      </section>

      {/* Sağlık kartları */}
      <section aria-label="Sağlık durumu" className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[4px] border border-[#F5F1EA]/8 bg-[#19191D] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">API servisi</h2>
            <span className={`text-sm font-semibold ${apiColor}`}>
              {apiLabel[apiState]}
            </span>
          </div>
          <p className="mt-2 text-xs text-[#F5F1EA]/40">
            {checkedAt ? `Son kontrol: ${checkedAt}` : "Henüz kontrol edilmedi"}
          </p>
          {apiState === "error" && apiError && (
            <p
              role="alert"
              className="mt-3 rounded-[2px] bg-[#B71C36]/18 p-2 text-xs text-[#B71C36]"
            >
              Hata: {apiError} — API çalışıyor mu? (pnpm dev:api)
            </p>
          )}
        </div>

        <div className="rounded-[4px] border border-[#F5F1EA]/8 bg-[#19191D] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Veritabanı</h2>
            <span
              className={`text-sm font-semibold ${
                dbCheck?.status === "up"
                  ? "text-[#2E7D32]"
                  : dbCheck === null
                    ? "text-[#F5F1EA]/40"
                    : "text-[#B71C36]"
              }`}
            >
              {dbCheck === null
                ? "—"
                : dbCheck.status === "up"
                  ? `Bağlı (${dbCheck.latencyMs ?? "?"} ms)`
                  : "Bağlantı yok"}
            </span>
          </div>
          <p className="mt-2 text-xs text-[#F5F1EA]/40">
            PostgreSQL — API üzerinden /health/db ile gerçek bağlantı testi.
          </p>
          {dbCheck?.status === "down" && dbCheck.error && (
            <p
              role="alert"
              className="mt-3 rounded-[2px] bg-[#B71C36]/18 p-2 text-xs text-[#B71C36]"
            >
              {dbCheck.error} — PostgreSQL çalışıyor mu? (pnpm db:up)
            </p>
          )}
        </div>
      </section>

      {/* Eylemler */}
      <section className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setApiState("loading");
            void check();
          }}
          disabled={apiState === "loading"}
          className="min-h-11 rounded-[4px] bg-[#B71C36] px-4 text-sm font-semibold text-[#F5F1EA] disabled:opacity-50"
        >
          {apiState === "loading" ? "Kontrol ediliyor…" : "Sağlığı Yenile"}
        </button>
      </section>

      <footer className="mt-auto pt-6 text-xs text-[#F5F1EA]/40">
        PerdeGo · pnpm monorepo · apps/admin (Next.js 16) — admin uçları
        Faz 6&apos;da RBAC ile devreye alınacak.
      </footer>
    </main>
  );
}
