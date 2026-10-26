"use client";

/**
 * PerdeGo Admin — Bildirim Yönetimi (modül 7, FAZ 8).
 *
 * Kampanya listesi (durum + alıcı/okunma sayaçları), yeni duyuru (derhal
 * veya planlı gönderim) ve planlı kampanyayı iptal. Gönderim uçları
 * ADMIN + adım-yukarı ister (sunucu).
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api, fieldErrors, formatDateTime, readSession } from "@/lib/api";
import { AppShell } from "@/components/shell";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  Modal,
  Select,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  useStepUp,
  useToast,
} from "@/components/ui";

interface Campaign {
  id: string;
  type: "NEW_EPISODE" | "NEW_CONTENT" | "PROMO" | "SYSTEM";
  titleTr: string;
  titleEn: string;
  bodyTr: string;
  bodyEn: string;
  status: "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "FAILED" | "CANCELLED";
  scheduledFor: string | null;
  sentAt: string | null;
  recipientCount: number;
  readCount: number;
  failedCount: number;
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  NEW_EPISODE: "Yeni bölüm",
  NEW_CONTENT: "Yeni içerik",
  PROMO: "Promo",
  SYSTEM: "Sistem",
};

export default function NotificationsPage() {
  const { push } = useToast();
  const { run } = useStepUp();
  const isAdmin = readSession()?.user.role === "ADMIN";

  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {

      const data = await api.get<{ items: Campaign[] }>("/admin/notification-campaigns");
      setCampaigns(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kampanyalar yüklenemedi");
    }
  }, []);

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

  const cancel = async (campaign: Campaign) => {
    if (!window.confirm(`"${campaign.titleTr}" planlı kampanyası iptal edilecek. Onaylıyor musunuz?`)) return;
    try {
      await run(() => api.post(`/admin/notification-campaigns/${campaign.id}/cancel`));
      push("success", "Kampanya iptal edildi");
      await load();
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "İptal edilemedi");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Bildirim Yönetimi</h1>
            <p className="mt-0.5 text-sm text-[var(--pg-text-dim)]">
              Duyurular tüm aktif kullanıcılara gider; planlı gönderimler sunucu tarafından zamanında dağıtılır.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!isAdmin} title={isAdmin ? undefined : "ADMIN rolü gerekir"}>
            + Yeni Duyuru
          </Button>
        </div>

        {error && <Card className="mb-5 border-l-4 border-l-[var(--pg-red)] p-4 text-sm text-[var(--pg-red)]">{error}</Card>}

        {!campaigns && !error && <Loading label="Kampanyalar yükleniyor…" />}

        {campaigns && (
          <Card>
            {campaigns.length === 0 ? (
              <EmptyState message="Henüz kampanya yok." />
            ) : (
              <Table
                head={
                  <>
                    <Th>Kampanya</Th>
                    <Th>Tip</Th>
                    <Th>Durum</Th>
                    <Th className="text-right">Alıcı / Okunma</Th>
                    <Th>Plan / Gönderim</Th>
                    <Th className="text-right">İşlem</Th>
                  </>
                }
              >
                {campaigns.map((campaign) => (
                  <tr key={campaign.id} className="row-hover">
                    <Td>
                      <p className="font-medium">{campaign.titleTr}</p>
                      <p className="max-w-[280px] truncate text-xs text-[var(--pg-text-dim)]">{campaign.bodyTr}</p>
                    </Td>
                    <Td className="text-[var(--pg-text-dim)]">{TYPE_LABELS[campaign.type]}</Td>
                    <Td><StatusBadge status={campaign.status} /></Td>
                    <Td className="num text-right">
                      {campaign.recipientCount}
                      <span className="text-[var(--pg-text-faint)]"> / {campaign.readCount}</span>
                      {campaign.failedCount > 0 && <p className="text-xs text-[var(--pg-red)]">{campaign.failedCount} hata</p>}
                    </Td>
                    <Td className="text-[var(--pg-text-dim)]">
                      {campaign.scheduledFor ? `Plan: ${formatDateTime(campaign.scheduledFor)}` : "Derhal"}
                      {campaign.sentAt && <p className="text-xs">Gönderim: {formatDateTime(campaign.sentAt)}</p>}
                    </Td>
                    <Td>
                      <div className="flex justify-end">
                        {(campaign.status === "SCHEDULED" || campaign.status === "DRAFT") && (
                          <Button small variant="danger" disabled={!isAdmin} onClick={() => void cancel(campaign)}>
                            İptal Et
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        )}

        {createOpen && (
          <CreateCampaignModal
            onClose={() => setCreateOpen(false)}
            onSaved={async () => {
              setCreateOpen(false);
              await load();
            }}
          />
        )}
      </div>
    </AppShell>
  );
}

function CreateCampaignModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const { push } = useToast();
  const { run } = useStepUp();
  const [form, setForm] = useState({
    type: "NEW_EPISODE",
    titleTr: "",
    titleEn: "",
    bodyTr: "",
    bodyEn: "",
    scheduledFor: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    const local: Record<string, string> = {};
    if (!form.titleTr.trim()) local.titleTr = "Zorunludur";
    if (!form.titleEn.trim()) local.titleEn = "Zorunludur";
    if (!form.bodyTr.trim()) local.bodyTr = "Zorunludur";
    if (!form.bodyEn.trim()) local.bodyEn = "Zorunludur";
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        type: form.type,
        titleTr: form.titleTr.trim(),
        titleEn: form.titleEn.trim(),
        bodyTr: form.bodyTr.trim(),
        bodyEn: form.bodyEn.trim(),
      };
      if (form.scheduledFor) body.scheduledFor = new Date(form.scheduledFor).toISOString();
      const created = await run(() =>
        api.post<{ status: string; recipientCount: number }>("/admin/notification-campaigns", body),
      );
      if (created.status === "SENT") {
        push("success", `Duyuru ${created.recipientCount} kullanıcıya gönderildi`);
      } else {
        push("success", "Duyuru planlandı");
      }
      await onSaved();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length > 0) setErrors(fe);
      else push("error", err instanceof ApiError ? err.message : "Oluşturulamadı");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Yeni Duyuru" wide>
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tip" required>
            <Select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              <option value="NEW_EPISODE">Yeni bölüm duyurusu</option>
              <option value="NEW_CONTENT">Yeni içerik bildirimi</option>
              <option value="PROMO">Promo</option>
              <option value="SYSTEM">Sistem mesajı</option>
            </Select>
          </Field>
          <Field label="Planlı Gönderim" hint="Boşsa derhal gönderilir">
            <Input
              type="datetime-local"
              value={form.scheduledFor}
              onChange={(e) => setForm((f) => ({ ...f, scheduledFor: e.target.value }))}
            />
          </Field>
          <Field label="Başlık (TR)" required error={errors.titleTr}>
            <Input value={form.titleTr} onChange={(e) => setForm((f) => ({ ...f, titleTr: e.target.value }))} />
          </Field>
          <Field label="Başlık (EN)" required error={errors.titleEn}>
            <Input value={form.titleEn} onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))} />
          </Field>
          <Field label="Gövde (TR)" required error={errors.bodyTr}>
            <Textarea value={form.bodyTr} onChange={(e) => setForm((f) => ({ ...f, bodyTr: e.target.value }))} />
          </Field>
          <Field label="Gövde (EN)" required error={errors.bodyEn}>
            <Textarea value={form.bodyEn} onChange={(e) => setForm((f) => ({ ...f, bodyEn: e.target.value }))} />
          </Field>
        </div>
        <p className="mt-4 text-xs text-[var(--pg-text-faint)]">
          Gönderim ADMIN + parola doğrulaması (step-up) ister; gönderim sonrası audit log kaydı oluşur.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" loading={busy}>
            {form.scheduledFor ? "Step-up ile Planla" : "Step-up ile Gönder"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
