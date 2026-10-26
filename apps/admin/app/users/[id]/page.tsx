"use client";

/**
 * PerdeGo Admin — Kullanıcı Detayı (modül 6, FAZ 8).
 *
 * Profil + cüzdan + abonelik + son kredi hareketleri; yönetim aksiyonları:
 * kredi düzeltmesi (ADMIN, gerekçe zorunlu), durum değişikliği ve rol
 * değişikliği (ADMIN + step-up). Her işlem sunucuda audit loglanır.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api, fieldErrors, formatDateTime, readSession } from "@/lib/api";
import { AppShell } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Loading,
  Select,
  StatCard,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  useStepUp,
  useToast,
} from "@/components/ui";

interface UserDetail {
  id: string;
  email: string;
  displayName: string;
  role: "USER" | "EDITOR" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  locale: string;
  emailVerified: boolean;
  createdAt: string;
  wallet: { purchased: number; granted: number; total: number } | null;
  subscription: {
    id: string;
    planCode: string;
    planTitle: string;
    platform: "IOS" | "ANDROID";
    status: string;
    autoRenew: boolean;
    currentPeriodEnd: string | null;
    expiresAt: string | null;
    canceledAt: string | null;
  } | null;
  recentLedger: Array<{
    id: string;
    type: string;
    delta: number;
    note: string | null;
    createdAt: string;
    balanceAfterPurchased: number;
    balanceAfterGranted: number;
  }>;
  stats: { unlockCount: number; favoriteCount: number; purchaseCount: number; totalSpentKurus: number };
}

export default function UserDetailPage() {
  // `useParams` dinamik okuma; prerender güvenliği için Suspense sınırı.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--pg-text-dim)]">Yükleniyor…</div>}>
      <UserDetailInner />
    </Suspense>
  );
}

function UserDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { push } = useToast();
  const { run } = useStepUp();
  const me = readSession()?.user;
  const isAdmin = me?.role === "ADMIN";

  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Kredi düzeltmesi
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({ purchasedDelta: "0", grantedDelta: "0", note: "" });
  const [adjustErrors, setAdjustErrors] = useState<Record<string, string>>({});
  const [adjustBusy, setAdjustBusy] = useState(false);

  // Durum / rol
  const [statusAction, setStatusAction] = useState<"SUSPENDED" | "ACTIVE" | null>(null);
  const [roleAction, setRoleAction] = useState<"USER" | "EDITOR" | "ADMIN" | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<UserDetail>(`/admin/users/${id}`);
      setUser(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanıcı yüklenemedi");
    }
  }, [id]);

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

  const submitAdjust = async (e: FormEvent) => {
    e.preventDefault();
    setAdjustErrors({});
    const purchased = Number(adjustForm.purchasedDelta || "0");
    const granted = Number(adjustForm.grantedDelta || "0");
    const local: Record<string, string> = {};
    if (!Number.isInteger(purchased)) local.purchasedDelta = "Tam sayı girin";
    if (!Number.isInteger(granted)) local.grantedDelta = "Tam sayı girin";
    if (purchased === 0 && granted === 0) local.note = "En az biri nonzero olmalıdır";
    if (adjustForm.note.trim().length < 3) local.note = "Gerekçe zorunludur (en az 3 karakter)";
    if (Object.keys(local).length > 0) {
      setAdjustErrors(local);
      return;
    }
    setAdjustBusy(true);
    try {
      const result = await api.post<{ wallet: { purchased: number; granted: number } }>(
        `/admin/users/${id}/credits/adjust`,
        { purchasedDelta: purchased, grantedDelta: granted, note: adjustForm.note.trim() },
      );
      push("success", `Kredi düzeltmesi uygulandı (yeni bakiye: ${result.wallet.purchased + result.wallet.granted})`);
      setAdjustOpen(false);
      setAdjustForm({ purchasedDelta: "0", grantedDelta: "0", note: "" });
      await load();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length > 0) setAdjustErrors(fe);
      else push("error", err instanceof ApiError ? err.message : "Düzeltme başarısız");
    } finally {
      setAdjustBusy(false);
    }
  };

  const submitStatus = async () => {
    if (!statusAction) return;
    setActionBusy(true);
    try {
      await run(() => api.patch(`/admin/users/${id}/status`, { status: statusAction }));
      push("success", statusAction === "SUSPENDED" ? "Kullanıcı askıya alındı" : "Kullanıcı yeniden aktifleştirildi");
      setStatusAction(null);
      await load();
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "İşlem başarısız");
    } finally {
      setActionBusy(false);
    }
  };

  const submitRole = async () => {
    if (!roleAction) return;
    setActionBusy(true);
    try {
      await run(() => api.patch(`/admin/users/${id}/role`, { role: roleAction }));
      push("success", `Rol güncellendi: ${roleAction}`);
      setRoleAction(null);
      await load();
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "İşlem başarısız");
    } finally {
      setActionBusy(false);
    }
  };

  if (error) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl border-l-4 border-l-[var(--pg-red)] p-5 text-sm">
          {error}
          <div className="mt-3">
            <Link href="/users" className="text-[var(--pg-accent-hover)] hover:underline">← Kullanıcılara dön</Link>
          </div>
        </Card>
      </AppShell>
    );
  }
  if (!user) {
    return (
      <AppShell>
        <Loading label="Kullanıcı yükleniyor…" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl">
        <Link href="/users" className="text-xs text-[var(--pg-text-faint)] hover:text-[var(--pg-text)]">
          ← Kullanıcılar
        </Link>

        <div className="mt-2 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-3 text-lg font-semibold">
              {user.displayName}
              <Badge tone={user.role === "ADMIN" ? "accent" : user.role === "EDITOR" ? "blue" : "neutral"}>{user.role}</Badge>
              <StatusBadge status={user.status} />
            </h1>
            <p className="mt-1 text-sm text-[var(--pg-text-dim)]">
              {user.email} · {user.locale.toUpperCase()} · {user.emailVerified ? "e-posta doğrulanmış" : "e-posta doğrulanmamış"} · kayıt {formatDateTime(user.createdAt)}
            </p>
          </div>
          {isAdmin && user.status !== "DELETED" && (
            <div className="flex flex-wrap gap-2">
              <Button small onClick={() => setAdjustOpen(true)}>Kredi Düzelt</Button>
              {user.status === "ACTIVE" ? (
                <Button small variant="danger" onClick={() => setStatusAction("SUSPENDED")}>Askıya Al</Button>
              ) : (
                <Button small variant="success" onClick={() => setStatusAction("ACTIVE")}>Aktifleştir</Button>
              )}
              <Select
                className="w-28"
                value=""
                aria-label="Rol değiştir"
                onChange={(e) => {
                  const role = e.target.value as "USER" | "EDITOR" | "ADMIN";
                  if (role && role !== user.role) setRoleAction(role);
                }}
              >
                <option value="">Rol değiştir…</option>
                <option value="USER">USER</option>
                <option value="EDITOR">EDITOR</option>
                <option value="ADMIN">ADMIN</option>
              </Select>
            </div>
          )}
        </div>

        {/* Özet kartlar */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Kredi Bakiyesi"
            value={user.wallet ? user.wallet.total : "—"}
            sub={user.wallet ? `${user.wallet.purchased} satın alınan · ${user.wallet.granted} hediye` : "cüzdan yok"}
            tone="accent"
          />
          <StatCard label="Bölüm Açma" value={user.stats.unlockCount} sub="toplam krediyle açılan bölüm" />
          <StatCard label="Satın Alma" value={user.stats.purchaseCount} sub={`toplam ${user.stats.totalSpentKurus / 100}₺`} tone="green" />
          <StatCard label="Favori" value={user.stats.favoriteCount} />
        </div>

        {/* Abonelik */}
        <Card className="mb-6 p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--pg-text-dim)]">Abonelik</h2>
          {user.subscription ? (
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <p><span className="text-[var(--pg-text-dim)]">Plan:</span> <strong>{user.subscription.planTitle}</strong> <span className="font-mono text-xs text-[var(--pg-text-faint)]">({user.subscription.planCode})</span></p>
              <p><span className="text-[var(--pg-text-dim)]">Platform:</span> {user.subscription.platform === "IOS" ? "iOS" : "Android"}</p>
              <p className="flex items-center gap-2">
                <span className="text-[var(--pg-text-dim)]">Durum:</span> <StatusBadge status={user.subscription.status} />
                {user.subscription.autoRenew && <span className="text-xs text-[var(--pg-text-faint)]">(otomatik yenileme açık)</span>}
              </p>
              <p><span className="text-[var(--pg-text-dim)]">Dönem sonu:</span> {formatDateTime(user.subscription.currentPeriodEnd)}</p>
            </div>
          ) : (
            <p className="text-sm text-[var(--pg-text-faint)]">Abonelik yok.</p>
          )}
        </Card>

        {/* Son kredi hareketleri */}
        <Card>
          <div className="px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--pg-text-dim)]">Son Kredi Hareketleri</h2>
          </div>
          {user.recentLedger.length === 0 ? (
            <EmptyState message="Hareket yok." />
          ) : (
            <Table
              head={
                <>
                  <Th>Tip</Th>
                  <Th className="text-right">Delta</Th>
                  <Th className="text-right">Kalan (P/G)</Th>
                  <Th>Not</Th>
                  <Th>Zaman</Th>
                </>
              }
            >
              {user.recentLedger.map((entry) => (
                <tr key={entry.id} className="row-hover">
                  <Td>
                    <Badge tone={entry.delta > 0 ? "green" : "red"}>{entry.type}</Badge>
                  </Td>
                  <Td className={`num text-right ${entry.delta > 0 ? "text-[var(--pg-green)]" : "text-[var(--pg-red)]"}`}>
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                  </Td>
                  <Td className="num text-right text-[var(--pg-text-dim)]">
                    {entry.balanceAfterPurchased} / {entry.balanceAfterGranted}
                  </Td>
                  <Td className="max-w-[260px] truncate text-xs text-[var(--pg-text-dim)]">{entry.note ?? "—"}</Td>
                  <Td className="text-[var(--pg-text-dim)]">{formatDateTime(entry.createdAt)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        {/* Kredi düzeltme modalı */}
        {adjustOpen && (
          <ModallessAdjust
            form={adjustForm}
            setForm={setAdjustForm}
            errors={adjustErrors}
            busy={adjustBusy}
            onSubmit={submitAdjust}
            onClose={() => setAdjustOpen(false)}
          />
        )}

        {/* Askı onayı */}
        <ConfirmDialog
          open={statusAction !== null}
          title={statusAction === "SUSPENDED" ? "Kullanıcıyı askıya al" : "Kullanıcıyı aktifleştir"}
          message={
            statusAction === "SUSPENDED"
              ? <>
                  <strong>{user.email}</strong> askıya alınacak; oturumları tokenla dolaşamaz hale gelir
                  (sunucu her istekte hesap durumunu yeniden denetler).
                </>
              : <>
                  <strong>{user.email}</strong> yeniden aktifleştirilecek.
                </>
          }
          confirmLabel="Onayla"
          danger={statusAction === "SUSPENDED"}
          loading={actionBusy}
          onConfirm={() => void submitStatus()}
          onCancel={() => setStatusAction(null)}
        />

        {/* Rol onayı */}
        <ConfirmDialog
          open={roleAction !== null}
          title="Rolü değiştir"
          message={
            <>
              <strong>{user.email}</strong> rolü <strong>{roleAction}</strong> olacak.
              {roleAction !== "USER" && " EDITOR/ADMIN rolleri yönetim uçlarına erişim verir — dikkatli onaylayın."}
              {me && ` İşlem ${me.email} adına audit loglanacaktır.`}
            </>
          }
          confirmLabel="Onayla"
          loading={actionBusy}
          onConfirm={() => void submitRole()}
          onCancel={() => setRoleAction(null)}
        />
      </div>
    </AppShell>
  );
}

/** Kredi düzeltme modalı (ADMIN; gerekçe zorunlu; sunucu audit loglar). */
function ModallessAdjust({
  form,
  setForm,
  errors,
  busy,
  onSubmit,
  onClose,
}: {
  form: { purchasedDelta: string; grantedDelta: string; note: string };
  setForm: React.Dispatch<React.SetStateAction<{ purchasedDelta: string; grantedDelta: string; note: string }>>;
  errors: Record<string, string>;
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Kredi düzeltmesi">
      <div className="fade-up w-full max-w-md rounded-[4px] border border-[var(--pg-border-strong)] bg-[var(--pg-surface)] shadow-2xl">
        <div className="border-b border-[var(--pg-border)] px-5 py-3.5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Kredi Düzeltmesi</h2>
        </div>
        <form onSubmit={onSubmit} noValidate className="p-5">
          <p className="mb-4 text-xs text-[var(--pg-text-faint)]">
            Düzeltme ledger kaydıyla uygulanır (ADJUSTMENT/GRANT); bakiye cüzdana doğrudan yazılmaz.
            Negatif değerler bakiyeyi düşürür.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Satın Alınan Δ" error={errors.purchasedDelta}>
              <Input type="number" value={form.purchasedDelta} onChange={(e) => setForm((f) => ({ ...f, purchasedDelta: e.target.value }))} />
            </Field>
            <Field label="Hediye Δ" error={errors.grantedDelta}>
              <Input type="number" value={form.grantedDelta} onChange={(e) => setForm((f) => ({ ...f, grantedDelta: e.target.value }))} />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Gerekçe" required error={errors.note}>
              <Textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Örn. ödeme sorunu nedeniyle 50 kredi telafi edildi"
              />
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
            <Button type="submit" loading={busy}>Uygula</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
