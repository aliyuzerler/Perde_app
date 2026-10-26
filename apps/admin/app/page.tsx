"use client";

/**
 * PerdeGo Admin — Panel Özeti (modül 1, FAZ 8).
 *
 * GET /admin/dashboard?from&to: kullanıcı, abonelik, katalog, satın alma ve
 * kredi özetleri + günlük seri (kayıt/gelir/açma) + son denetim kayıtları.
 * Tarih aralığı seçimi temel raporları yeniden hesaplar.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, formatDate, formatDateTime, formatKurus } from "@/lib/api";
import { AppShell } from "@/components/shell";
import {
  Card,
  EmptyState,
  Loading,
  Select,
  StatCard,
  Table,
  Td,
  Th,
} from "@/components/ui";

interface Dashboard {
  range: { from: string; to: string };
  users: { total: number; active: number; suspended: number; newInRange: number };
  subscriptions: { active: number; trialing: number; canceled: number; expired: number; gracePeriod: number };
  catalog: {
    publishedTitles: number;
    draftTitles: number;
    processingTitles: number;
    archivedTitles: number;
    totalEpisodes: number;
    publishedEpisodes: number;
  };
  purchases: {
    inRangeCount: number;
    inRangeRevenueKurus: number;
    totalCount: number;
    totalRevenueKurus: number;
    refundCount: number;
    refundedAmountKurus: number;
    subscriptionCount: number;
    creditPackCount: number;
  };
  credits: {
    grantedInRange: number;
    purchasedInRange: number;
    spentInRange: number;
    refundAdjustInRange: number;
    balancePurchased: number;
    balanceGranted: number;
  };
  series: Array<{ day: string; signups: number; revenueKurus: number; unlocks: number }>;
  recentAudit: Array<{ id: string; action: string; entityType: string; entityId: string; createdAt: string }>;
}

const RANGES = [
  { key: "7", label: "Son 7 gün" },
  { key: "30", label: "Son 30 gün" },
  { key: "90", label: "Son 90 gün" },
] as const;

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<string>("30");

  const load = useCallback(async (days: string) => {
    try {

      const to = new Date();
      const from = new Date(Date.now() - Number(days) * 86_400_000);
      const data = await api.get<Dashboard>(
        `/admin/dashboard?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      );
      setData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Panel verisi alınamadı.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load(range);
      void cancelled;
    })();
    return () => {
      cancelled = true;
    };
  }, [load, range]);

  const maxRevenue = Math.max(1, ...(data?.series.map((s) => s.revenueKurus) ?? [1]));
  const maxSignups = Math.max(1, ...(data?.series.map((s) => s.signups) ?? [1]));
  const maxUnlocks = Math.max(1, ...(data?.series.map((s) => s.unlocks) ?? [1]));

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Panel Özeti</h1>
            <p className="mt-0.5 text-sm text-[var(--pg-text-dim)]">
              {data ? `${formatDate(data.range.from)} — ${formatDate(data.range.to)}` : "…"}
            </p>
          </div>
          <div className="w-44">
            <Select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Tarih aralığı">
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error && (
          <Card className="mb-6 border-l-4 border-l-[var(--pg-red)] p-4 text-sm text-[var(--pg-red)]">
            {error}
          </Card>
        )}

        {!data && !error && <Loading label="Panel verisi yükleniyor…" />}

        {data && (
          <div className="space-y-6">
            {/* Üst metrikler */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Toplam Kullanıcı"
                value={data.users.total}
                sub={`+${data.users.newInRange} (aralıkta) · ${data.users.active} aktif`}
              />
              <StatCard
                label="Aktif Abonelik"
                value={data.subscriptions.active}
                tone="accent"
                sub={
                  [
                    data.subscriptions.trialing > 0 ? `${data.subscriptions.trialing} deneme` : null,
                    data.subscriptions.gracePeriod > 0 ? `${data.subscriptions.gracePeriod} ödeme aralığı` : null,
                    data.subscriptions.canceled > 0 ? `${data.subscriptions.canceled} iptal` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "deneme yok"
                }
              />
              <StatCard
                label="Yayında İçerik"
                value={data.catalog.publishedTitles}
                sub={`${data.catalog.publishedEpisodes}/${data.catalog.totalEpisodes} bölüm yayında`}
              />
              <StatCard
                label="Aralıkta Gelir"
                value={formatKurus(data.purchases.inRangeRevenueKurus)}
                tone="green"
                sub={`${data.purchases.inRangeCount} satın alma`}
              />
            </div>

            {/* Gelir & kredi özetleri */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--pg-text-dim)]">
                  Satın Alma Özeti
                </h2>
                <dl className="grid grid-cols-2 gap-y-3 text-sm">
                  <dt className="text-[var(--pg-text-dim)]">Toplam gelir</dt>
                  <dd className="num text-right font-medium">{formatKurus(data.purchases.totalRevenueKurus)}</dd>
                  <dt className="text-[var(--pg-text-dim)]">Toplam satın alma</dt>
                  <dd className="num text-right font-medium">{data.purchases.totalCount}</dd>
                  <dt className="text-[var(--pg-text-dim)]">Abonelik / paket</dt>
                  <dd className="num text-right font-medium">
                    {data.purchases.subscriptionCount} / {data.purchases.creditPackCount}
                  </dd>
                  <dt className="text-[var(--pg-text-dim)]">İade</dt>
                  <dd className="num text-right font-medium text-[var(--pg-amber)]">
                    {data.purchases.refundCount} · {formatKurus(data.purchases.refundedAmountKurus)}
                  </dd>
                </dl>
              </Card>
              <Card className="p-5">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--pg-text-dim)]">
                  Kredi Kullanım Özeti
                </h2>
                <dl className="grid grid-cols-2 gap-y-3 text-sm">
                  <dt className="text-[var(--pg-text-dim)]">Aralıkta satın alınan</dt>
                  <dd className="num text-right font-medium">{data.credits.purchasedInRange}</dd>
                  <dt className="text-[var(--pg-text-dim)]">Aralıkta verilen (hediye)</dt>
                  <dd className="num text-right font-medium">{data.credits.grantedInRange}</dd>
                  <dt className="text-[var(--pg-text-dim)]">Aralıkta harcanan</dt>
                  <dd className="num text-right font-medium text-[var(--pg-accent-hover)]">{data.credits.spentInRange}</dd>
                  <dt className="text-[var(--pg-text-dim)]">Cüzdan bakiyeleri (P/G)</dt>
                  <dd className="num text-right font-medium">
                    {data.credits.balancePurchased} / {data.credits.balanceGranted}
                  </dd>
                </dl>
              </Card>
            </div>

            {/* Günlük seri grafiği (saf CSS — dış bağımlılık yok) */}
            <Card className="p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-[var(--pg-text-dim)]">
                Günlük Akış <span className="ml-2 font-normal normal-case text-[var(--pg-text-faint)]">(kayıt · gelir · açma)</span>
              </h2>
              <div className="flex h-40 items-end gap-[3px] overflow-x-auto pb-1">
                {data.series.map((point) => (
                  <div key={point.day} className="group relative flex min-w-[10px] flex-1 flex-col justify-end gap-[2px]" title={`${point.day}: ${point.signups} kayıt, ${formatKurus(point.revenueKurus)}, ${point.unlocks} açma`}>
                    <div className="rounded-t-[1px] bg-[var(--pg-blue)] opacity-80" style={{ height: `${Math.max(2, (point.signups / maxSignups) * 46)}px` }} />
                    <div className="rounded-t-[1px] bg-[var(--pg-accent)]" style={{ height: `${Math.max(2, (point.revenueKurus / maxRevenue) * 60)}px` }} />
                    <div className="rounded-t-[1px] bg-[var(--pg-green)] opacity-80" style={{ height: `${Math.max(2, (point.unlocks / maxUnlocks) * 30)}px` }} />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-5 text-xs text-[var(--pg-text-faint)]">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[1px] bg-[var(--pg-blue)]" /> Kayıt</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[1px] bg-[var(--pg-accent)]" /> Gelir</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[1px] bg-[var(--pg-green)]" /> Bölüm açma</span>
              </div>
            </Card>

            {/* Son denetim kayıtları */}
            <Card>
              <div className="flex items-center justify-between px-5 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--pg-text-dim)]">
                  Son Denetim Kayıtları
                </h2>
                <Link href="/audit" className="text-xs text-[var(--pg-accent-hover)] hover:underline">
                  Tümünü gör →
                </Link>
              </div>
              {data.recentAudit.length === 0 ? (
                <EmptyState message="Henüz denetim kaydı yok." />
              ) : (
                <Table
                  head={
                    <>
                      <Th>Eylem</Th>
                      <Th>Varlık</Th>
                      <Th>Zaman</Th>
                    </>
                  }
                >
                  {data.recentAudit.map((row) => (
                    <tr key={row.id} className="row-hover">
                      <Td>
                        <span className="font-mono text-xs">{row.action}</span>
                      </Td>
                      <Td className="text-[var(--pg-text-dim)]">
                        {row.entityType} · <span className="font-mono text-xs">{row.entityId.slice(0, 10)}…</span>
                      </Td>
                      <Td className="text-[var(--pg-text-dim)]">{formatDateTime(row.createdAt)}</Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
