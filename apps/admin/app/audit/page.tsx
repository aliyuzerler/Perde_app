"use client";

/**
 * PerdeGo Admin — Denetim Günlüğü (modül 8, FAZ 8).
 *
 * Kim, neyi, ne zaman değiştirdi: audit_logs kayıtları; eylem/aktör/varlık
 * filtreleri. Kayıtlar salt okunurdur (append-only).
 */

import { useCallback, useEffect, useState } from "react";
import { ApiError, api, formatDateTime } from "@/lib/api";
import { AppShell } from "@/components/shell";
import {
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  Pagination,
  Select,
  Table,
  Td,
  Th,
} from "@/components/ui";

interface AuditRow {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

const ACTIONS = [
  "",
  "CONTENT_CREATE",
  "CONTENT_UPDATE",
  "CONTENT_PUBLISH",
  "CONTENT_STATUS_CHANGE",
  "SEASON_CREATE",
  "SEASON_UPDATE",
  "EPISODE_CREATE",
  "EPISODE_UPDATE",
  "EPISODE_STATUS_CHANGE",
  "EPISODE_DELETE",
  "MEDIA_UPLOAD_URL_ISSUED",
  "MEDIA_DELETE",
  "PLAN_UPDATE",
  "CREDIT_PACK_UPDATE",
  "CREDIT_ADJUSTMENT",
  "USER_STATUS_CHANGE",
  "USER_ROLE_CHANGE",
  "CAMPAIGN_SENT",
  "CAMPAIGN_CANCEL",
  "BANNER_CREATE",
  "BANNER_UPDATE",
  "BANNER_DELETE",
  "HOME_SECTION_CREATE",
  "HOME_SECTION_UPDATE",
  "HOME_SECTION_DELETE",
  "HOME_SECTION_ITEM_ADD",
  "HOME_SECTION_ITEM_REMOVE",
];

/** JSON değerini kompakt ve okunur gösterir. */
function DiffCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-[var(--pg-text-faint)]">—</span>;
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return (
    <span className="num block max-w-[280px] truncate font-mono text-xs text-[var(--pg-text-dim)]" title={text}>
      {text}
    </span>
  );
}

export default function AuditPage() {
  const [data, setData] = useState<{ items: AuditRow[]; meta: { page: number; totalPages: number; totalItems: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [entityType, setEntityType] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (action) params.set("action", action);
    if (actorId.trim()) params.set("actorId", actorId.trim());
    if (entityType) params.set("entityType", entityType);
    try {
      const res = await api.get<{ items: AuditRow[]; meta: { page: number; totalPages: number; totalItems: number } }>(
        `/admin/audit-logs?${params.toString()}`,
      );
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Denetim günlüğü yüklenemedi");
    }
  }, [page, action, actorId, entityType]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      void cancelled;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">
          <h1 className="text-lg font-semibold">Denetim Günlüğü</h1>
          <p className="mt-0.5 text-sm text-[var(--pg-text-dim)]">
            {data ? `${data.meta.totalItems} kayıt` : "…"} · yönetici eylemleri kim/ne zaman/neyi bilgisiyle kayıtlıdır
          </p>
        </div>

        <Card className="mb-5 grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <Field label="Eylem">
            <Select value={action} onChange={(e) => { setPage(1); setAction(e.target.value); }}>
              {ACTIONS.map((a) => (
                <option key={a || "all"} value={a}>{a || "Tümü"}</option>
              ))}
            </Select>
          </Field>
          <Field label="Varlık Tipi">
            <Select value={entityType} onChange={(e) => { setPage(1); setEntityType(e.target.value); }}>
              <option value="">Tümü</option>
              <option value="content">content</option>
              <option value="season">season</option>
              <option value="episode">episode</option>
              <option value="episode_media">episode_media</option>
              <option value="plan">plan</option>
              <option value="credit_pack">credit_pack</option>
              <option value="user">user</option>
              <option value="notification_campaign">notification_campaign</option>
              <option value="banner">banner</option>
              <option value="home_section">home_section</option>
            </Select>
          </Field>
          <Field label="Aktör ID">
            <Input value={actorId} onChange={(e) => { setPage(1); setActorId(e.target.value); }} placeholder="yönetici kullanıcı kimliği" />
          </Field>
        </Card>

        {error && <Card className="mb-5 border-l-4 border-l-[var(--pg-red)] p-4 text-sm text-[var(--pg-red)]">{error}</Card>}

        {!data && !error && <Loading label="Denetim günlüğü yükleniyor…" />}

        {data && (
          <Card>
            {data.items.length === 0 ? (
              <EmptyState message="Filtreyle eşleşen kayıt yok." />
            ) : (
              <Table
                head={
                  <>
                    <Th>Zaman</Th>
                    <Th>Aktör</Th>
                    <Th>Eylem</Th>
                    <Th>Varlık</Th>
                    <Th>Önce</Th>
                    <Th>Sonra</Th>
                  </>
                }
              >
                {data.items.map((row) => (
                  <tr key={row.id} className="row-hover align-top">
                    <Td className="whitespace-nowrap text-[var(--pg-text-dim)]">{formatDateTime(row.createdAt)}</Td>
                    <Td>
                      {row.actorUserId ? (
                        <span className="num font-mono text-xs">{row.actorUserId.slice(0, 10)}…</span>
                      ) : (
                        <span className="text-[var(--pg-text-faint)]">sistem</span>
                      )}
                    </Td>
                    <Td><span className="font-mono text-xs">{row.action}</span></Td>
                    <Td className="text-[var(--pg-text-dim)]">
                      {row.entityType} · <span className="num font-mono text-xs">{row.entityId.slice(0, 10)}…</span>
                    </Td>
                    <Td><DiffCell value={row.before} /></Td>
                    <Td><DiffCell value={row.after} /></Td>
                  </tr>
                ))}
              </Table>
            )}
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} onChange={setPage} />
          </Card>
        )}
      </div>
    </AppShell>
  );
}
