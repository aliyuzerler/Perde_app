"use client";

/**
 * PerdeGo Admin — Gelir Modeli (modül 5, FAZ 8).
 *
 * Sekmeler: Planlar (aylık/yıllık abonelik ürünleri + platform ürün
 * kimlikleri) · Kredi Paketleri · Satın Alma Kayıtları (iade/durum takibi) ·
 * Kredi Ledger (tüm hareketler).
 *
 * Güncelleme uçları ADMIN + adım-yukarı (sunucu zorunlu tutar); panelde
 * ek onay diyaloğu + parola ile yeniden kimlik doğrulama uygulanır.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api, fieldErrors, formatDateTime, formatKurus, readSession } from "@/lib/api";
import { AppShell } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  Modal,
  Pagination,
  Select,
  StatusBadge,
  Table,
  Tabs,
  Td,
  Th,
  useStepUp,
  useToast,
} from "@/components/ui";

interface Plan {
  id: string;
  code: string;
  titleTr: string;
  titleEn: string;
  platformProductIdIos: string | null;
  platformProductIdAndroid: string | null;
  billingPeriod: "MONTHLY" | "YEARLY";
  priceKurus: number;
  currency: string;
  trialDays: number;
  gracePeriodDays: number;
  isActive: boolean;
  sortOrder: number;
  activeSubscriberCount: number;
}

interface CreditPack {
  id: string;
  code: string;
  credits: number;
  bonusCredits: number;
  platformProductIdIos: string | null;
  platformProductIdAndroid: string | null;
  priceKurus: number;
  currency: string;
  isActive: boolean;
  sortOrder: number;
}

interface StoreTransaction {
  id: string;
  userId: string | null;
  userEmail: string | null;
  platform: "IOS" | "ANDROID";
  productType: "SUBSCRIPTION" | "CREDIT_PACK";
  productId: string;
  storeTransactionId: string;
  priceKurus: number | null;
  currency: string | null;
  purchaseState: "PENDING" | "PURCHASED" | "REFUNDED" | "REVOKED";
  refundedAt: string | null;
  createdAt: string;
}

interface LedgerEntry {
  id: string;
  userId: string;
  userEmail: string | null;
  displayName: string | null;
  type: string;
  delta: number;
  purchasedDelta: number;
  grantedDelta: number;
  balanceAfterPurchased: number;
  balanceAfterGranted: number;
  note: string | null;
  createdAt: string;
}

const LEDGER_LABELS: Record<string, string> = {
  PURCHASE: "Satın alma",
  GRANT: "Hediye",
  UNLOCK_SPEND: "Bölüm açma",
  REFUND: "İade",
  ADJUSTMENT: "Düzeltme",
  EXPIRY: "Geçersizlik",
};

const TABS = [
  { key: "plans", label: "Planlar" },
  { key: "packs", label: "Kredi Paketleri" },
  { key: "transactions", label: "Satın Alma Kayıtları" },
  { key: "ledger", label: "Kredi Ledger" },
];

export default function RevenuePage() {
  const [tab, setTab] = useState("plans");
  const isAdmin = readSession()?.user.role === "ADMIN";

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">
          <h1 className="text-lg font-semibold">Gelir Modeli</h1>
          <p className="mt-0.5 text-sm text-[var(--pg-text-dim)]">
            Abonelik planları, kredi paketleri ve tüm finansal hareketler. Finansal güncellemeler
            {isAdmin ? " adım-yukarı doğrulamasıyla" : " yalnızca ADMIN rolüyle"} yapılır.
          </p>
          {!isAdmin && (
            <p className="mt-1 text-xs text-[var(--pg-amber)]">Bu sayfada görüntüleme yetkiniz var; güncelleme uçları sunucuda ADMIN rolü ister.</p>
          )}
        </div>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        <div className="mt-5">
          {tab === "plans" && <PlansTab />}
          {tab === "packs" && <PacksTab />}
          {tab === "transactions" && <TransactionsTab />}
          {tab === "ledger" && <LedgerTab />}
        </div>
      </div>
    </AppShell>
  );
}

// --- Planlar --------------------------------------------------------------------

function PlansTab() {
  const isAdmin = readSession()?.user.role === "ADMIN";
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ items: Plan[] }>("/admin/plans");
      setPlans(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Planlar yüklenemedi");
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

  if (error) return <Card className="border-l-4 border-l-[var(--pg-red)] p-4 text-sm text-[var(--pg-red)]">{error}</Card>;
  if (!plans) return <Loading label="Planlar yükleniyor…" />;

  return (
    <Card>
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--pg-text-dim)]">Abonelik Planları</h2>
        <p className="mt-0.5 text-xs text-[var(--pg-text-faint)]">
          Platform ürün kimlikleri RevenueCat / App Store Connect / Google Play Console eşlemesiyle birebir olmalıdır.
          İstemci fiyatı mağazadan okur; buradaki kuruş değeri sunucu kaydıdır.
        </p>
      </div>
      <Table
        head={
          <>
            <Th>Plan</Th>
            <Th>Periyot</Th>
            <Th>Fiyat</Th>
            <Th>iOS Ürün ID</Th>
            <Th>Android Ürün ID</Th>
            <Th>Abone</Th>
            <Th>Durum</Th>
            <Th className="text-right">İşlem</Th>
          </>
        }
      >
        {plans.map((plan) => (
          <tr key={plan.id} className="row-hover">
            <Td>
              <p className="font-medium">{plan.titleTr}</p>
              <p className="font-mono text-xs text-[var(--pg-text-faint)]">{plan.code}</p>
            </Td>
            <Td className="text-[var(--pg-text-dim)]">{plan.billingPeriod === "MONTHLY" ? "Aylık" : "Yıllık"}</Td>
            <Td className="num">{formatKurus(plan.priceKurus, plan.currency)}</Td>
            <Td className="font-mono text-xs">{plan.platformProductIdIos ?? <span className="text-[var(--pg-amber)]">atanmadı</span>}</Td>
            <Td className="font-mono text-xs">{plan.platformProductIdAndroid ?? <span className="text-[var(--pg-amber)]">atanmadı</span>}</Td>
            <Td className="num">{plan.activeSubscriberCount}</Td>
            <Td><StatusBadge status={plan.isActive ? "ACTIVE" : "EXPIRED"} /></Td>
            <Td>
              <div className="flex justify-end">
                <Button small variant="subtle" disabled={!isAdmin} title={isAdmin ? undefined : "ADMIN rolü gerekir"} onClick={() => setEditing(plan)}>
                  Düzenle
                </Button>
              </div>
            </Td>
          </tr>
        ))}
      </Table>
      {editing && (
        <PlanEditModal
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </Card>
  );
}

function PlanEditModal({ plan, onClose, onSaved }: { plan: Plan; onClose: () => void; onSaved: () => Promise<void> }) {
  const { push } = useToast();
  const { run } = useStepUp();
  const [form, setForm] = useState({
    titleTr: plan.titleTr,
    titleEn: plan.titleEn,
    priceKurus: String(plan.priceKurus),
    currency: plan.currency,
    trialDays: String(plan.trialDays),
    gracePeriodDays: String(plan.gracePeriodDays),
    platformProductIdIos: plan.platformProductIdIos ?? "",
    platformProductIdAndroid: plan.platformProductIdAndroid ?? "",
    isActive: plan.isActive,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    const price = Number(form.priceKurus);
    if (!Number.isInteger(price) || price < 0) {
      setErrors({ priceKurus: "Fiyat kuruş cinsinden negatif olmayan tam sayıdır" });
      return;
    }
    setBusy(true);
    try {
      await run(() =>
        api.patch(`/admin/plans/${plan.id}`, {
          titleTr: form.titleTr.trim(),
          titleEn: form.titleEn.trim(),
          priceKurus: price,
          currency: form.currency.trim().toUpperCase(),
          trialDays: Number(form.trialDays) || 0,
          gracePeriodDays: Number(form.gracePeriodDays) || 0,
          platformProductIdIos: form.platformProductIdIos.trim() || null,
          platformProductIdAndroid: form.platformProductIdAndroid.trim() || null,
          isActive: form.isActive,
        }),
      );
      push("success", "Plan güncellendi (audit loglandı)");
      await onSaved();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length > 0) setErrors(fe);
      else push("error", err instanceof ApiError ? err.message : "Güncellenemedi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Planı Düzenle — ${plan.code}`}>
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Başlık (TR)" required error={errors.titleTr}>
            <Input value={form.titleTr} onChange={(e) => setForm((f) => ({ ...f, titleTr: e.target.value }))} />
          </Field>
          <Field label="Başlık (EN)" required error={errors.titleEn}>
            <Input value={form.titleEn} onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))} />
          </Field>
          <Field label="Fiyat (kuruş)" required error={errors.priceKurus} hint="4990 = ₺49,90">
            <Input type="number" min={0} value={form.priceKurus} onChange={(e) => setForm((f) => ({ ...f, priceKurus: e.target.value }))} />
          </Field>
          <Field label="Para Birimi" required error={errors.currency}>
            <Input value={form.currency} maxLength={3} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
          </Field>
          <Field label="iOS Ürün Kimliği" hint="App Store Connect ürün kimliği">
            <Input value={form.platformProductIdIos} onChange={(e) => setForm((f) => ({ ...f, platformProductIdIos: e.target.value }))} placeholder="perdego_monthly" />
          </Field>
          <Field label="Android Ürün Kimliği" hint="Google Play ürün kimliği">
            <Input value={form.platformProductIdAndroid} onChange={(e) => setForm((f) => ({ ...f, platformProductIdAndroid: e.target.value }))} placeholder="perdego_monthly" />
          </Field>
          <Field label="Deneme (gün)">
            <Input type="number" min={0} max={365} value={form.trialDays} onChange={(e) => setForm((f) => ({ ...f, trialDays: e.target.value }))} />
          </Field>
          <Field label="Ödeme Aralığı (gün)">
            <Input type="number" min={0} max={90} value={form.gracePeriodDays} onChange={(e) => setForm((f) => ({ ...f, gracePeriodDays: e.target.value }))} />
          </Field>
          <Field label="Durum">
            <Select value={form.isActive ? "1" : "0"} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.value === "1" }))}>
              <option value="1">Aktif (satışta)</option>
              <option value="0">Pasif</option>
            </Select>
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" loading={busy}>Step-up ile Kaydet</Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Kredi paketleri ---------------------------------------------------------------

function PacksTab() {
  const isAdmin = readSession()?.user.role === "ADMIN";
  const [packs, setPacks] = useState<CreditPack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CreditPack | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ items: CreditPack[] }>("/admin/credit-packs");
      setPacks(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Paketler yüklenemedi");
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

  if (error) return <Card className="border-l-4 border-l-[var(--pg-red)] p-4 text-sm text-[var(--pg-red)]">{error}</Card>;
  if (!packs) return <Loading label="Paketler yükleniyor…" />;

  return (
    <Card>
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--pg-text-dim)]">Kredi Paketleri</h2>
        <p className="mt-0.5 text-xs text-[var(--pg-text-faint)]">Krediler süresizdir; paketin temel kredisi değiştirilemez (ledger tutarlılığı), bonus kredi ayarlanabilir.</p>
      </div>
      <Table
        head={
          <>
            <Th>Paket</Th>
            <Th>Kredi (+bonus)</Th>
            <Th>Fiyat</Th>
            <Th>iOS Ürün ID</Th>
            <Th>Android Ürün ID</Th>
            <Th>Durum</Th>
            <Th className="text-right">İşlem</Th>
          </>
        }
      >
        {packs.map((pack) => (
          <tr key={pack.id} className="row-hover">
            <Td>
              <p className="font-medium">{pack.code}</p>
            </Td>
            <Td className="num">
              {pack.credits}
              {pack.bonusCredits > 0 && <span className="ml-1 text-xs text-[var(--pg-green)]">+{pack.bonusCredits}</span>}
            </Td>
            <Td className="num">{formatKurus(pack.priceKurus, pack.currency)}</Td>
            <Td className="font-mono text-xs">{pack.platformProductIdIos ?? <span className="text-[var(--pg-amber)]">atanmadı</span>}</Td>
            <Td className="font-mono text-xs">{pack.platformProductIdAndroid ?? <span className="text-[var(--pg-amber)]">atanmadı</span>}</Td>
            <Td><StatusBadge status={pack.isActive ? "ACTIVE" : "EXPIRED"} /></Td>
            <Td>
              <div className="flex justify-end">
                <Button small variant="subtle" disabled={!isAdmin} onClick={() => setEditing(pack)}>Düzenle</Button>
              </div>
            </Td>
          </tr>
        ))}
      </Table>
      {editing && (
        <PackEditModal
          pack={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </Card>
  );
}

function PackEditModal({ pack, onClose, onSaved }: { pack: CreditPack; onClose: () => void; onSaved: () => Promise<void> }) {
  const { push } = useToast();
  const { run } = useStepUp();
  const [form, setForm] = useState({
    priceKurus: String(pack.priceKurus),
    currency: pack.currency,
    bonusCredits: String(pack.bonusCredits),
    platformProductIdIos: pack.platformProductIdIos ?? "",
    platformProductIdAndroid: pack.platformProductIdAndroid ?? "",
    isActive: pack.isActive,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    const price = Number(form.priceKurus);
    const bonus = Number(form.bonusCredits);
    if (!Number.isInteger(price) || price < 0) {
      setErrors({ priceKurus: "Geçersiz fiyat" });
      return;
    }
    if (!Number.isInteger(bonus) || bonus < 0) {
      setErrors({ bonusCredits: "Geçersiz bonus" });
      return;
    }
    setBusy(true);
    try {
      await run(() =>
        api.patch(`/admin/credit-packs/${pack.id}`, {
          priceKurus: price,
          currency: form.currency.trim().toUpperCase(),
          bonusCredits: bonus,
          platformProductIdIos: form.platformProductIdIos.trim() || null,
          platformProductIdAndroid: form.platformProductIdAndroid.trim() || null,
          isActive: form.isActive,
        }),
      );
      push("success", "Paket güncellendi (audit loglandı)");
      await onSaved();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length > 0) setErrors(fe);
      else push("error", err instanceof ApiError ? err.message : "Güncellenemedi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Paketi Düzenle — ${pack.code}`}>
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fiyat (kuruş)" required error={errors.priceKurus}>
            <Input type="number" min={0} value={form.priceKurus} onChange={(e) => setForm((f) => ({ ...f, priceKurus: e.target.value }))} />
          </Field>
          <Field label="Para Birimi" required error={errors.currency}>
            <Input value={form.currency} maxLength={3} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
          </Field>
          <Field label="Bonus Kredi" error={errors.bonusCredits}>
            <Input type="number" min={0} max={100000} value={form.bonusCredits} onChange={(e) => setForm((f) => ({ ...f, bonusCredits: e.target.value }))} />
          </Field>
          <Field label="iOS Ürün Kimliği">
            <Input value={form.platformProductIdIos} onChange={(e) => setForm((f) => ({ ...f, platformProductIdIos: e.target.value }))} />
          </Field>
          <Field label="Android Ürün Kimliği">
            <Input value={form.platformProductIdAndroid} onChange={(e) => setForm((f) => ({ ...f, platformProductIdAndroid: e.target.value }))} />
          </Field>
          <Field label="Durum">
            <Select value={form.isActive ? "1" : "0"} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.value === "1" }))}>
              <option value="1">Aktif (satışta)</option>
              <option value="0">Pasif</option>
            </Select>
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" loading={busy}>Step-up ile Kaydet</Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Satın alma kayıtları --------------------------------------------------------------

function TransactionsTab() {
  const [data, setData] = useState<{ items: StoreTransaction[]; meta: { page: number; totalPages: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [state, setState] = useState("");
  const [productType, setProductType] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (state) params.set("state", state);
    if (productType) params.set("productType", productType);
    try {
      const res = await api.get<{ items: StoreTransaction[]; meta: { page: number; totalPages: number } }>(
        `/admin/store-transactions?${params.toString()}`,
      );
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "İşlemler yüklenemedi");
    }
  }, [page, state, productType]);

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
    <Card>
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <div className="w-44">
          <Field label="Durum">
            <Select value={state} onChange={(e) => { setPage(1); setState(e.target.value); }}>
              <option value="">Tümü</option>
              <option value="PURCHASED">Satın alındı</option>
              <option value="REFUNDED">İade edildi</option>
              <option value="REVOKED">Geçersiz</option>
              <option value="PENDING">Bekliyor</option>
            </Select>
          </Field>
        </div>
        <div className="w-44">
          <Field label="Ürün Tipi">
            <Select value={productType} onChange={(e) => { setPage(1); setProductType(e.target.value); }}>
              <option value="">Tümü</option>
              <option value="SUBSCRIPTION">Abonelik</option>
              <option value="CREDIT_PACK">Kredi paketi</option>
            </Select>
          </Field>
        </div>
      </div>
      {error && <div className="px-5 pb-4 text-sm text-[var(--pg-red)]">{error}</div>}
      {!data && !error && <Loading label="İşlemler yükleniyor…" />}
      {data && (
        <>
          {data.items.length === 0 ? (
            <EmptyState message="Filtreyle eşleşen satın alma yok." />
          ) : (
            <Table
              head={
                <>
                  <Th>Kullanıcı</Th>
                  <Th>Ürün</Th>
                  <Th>Platform</Th>
                  <Th>Tutar</Th>
                  <Th>Durum</Th>
                  <Th>Zaman</Th>
                </>
              }
            >
              {data.items.map((tx) => (
                <tr key={tx.id} className="row-hover">
                  <Td>
                    <p className="truncate">{tx.userEmail ?? "—"}</p>
                    {tx.userId && <p className="font-mono text-[10px] text-[var(--pg-text-faint)]">{tx.userId.slice(0, 12)}…</p>}
                  </Td>
                  <Td>
                    <Badge tone={tx.productType === "SUBSCRIPTION" ? "blue" : "accent"}>
                      {tx.productType === "SUBSCRIPTION" ? "Abonelik" : "Kredi paketi"}
                    </Badge>
                    <p className="mt-1 font-mono text-xs text-[var(--pg-text-dim)]">{tx.productId}</p>
                  </Td>
                  <Td className="text-[var(--pg-text-dim)]">{tx.platform === "IOS" ? "iOS" : "Android"}</Td>
                  <Td className="num">{tx.priceKurus != null ? formatKurus(tx.priceKurus, tx.currency ?? "TRY") : "—"}</Td>
                  <Td><StatusBadge status={tx.purchaseState} /></Td>
                  <Td className="text-[var(--pg-text-dim)]">
                    {formatDateTime(tx.createdAt)}
                    {tx.refundedAt && <p className="text-xs text-[var(--pg-red)]">İade: {formatDateTime(tx.refundedAt)}</p>}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

// --- Kredi ledger -----------------------------------------------------------------

function LedgerTab() {
  const [data, setData] = useState<{ items: LedgerEntry[]; meta: { page: number; totalPages: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (type) params.set("type", type);
    try {
      const res = await api.get<{ items: LedgerEntry[]; meta: { page: number; totalPages: number } }>(
        `/admin/credit-ledger?${params.toString()}`,
      );
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ledger yüklenemedi");
    }
  }, [page, type]);

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
    <Card>
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <p className="text-xs text-[var(--pg-text-faint)]">
          Ledger append-only döner; bakiyeler hareket sonrası kalan bakiye sütunlarıyla izlenebilir.
        </p>
        <div className="ml-auto w-44">
          <Field label="Hareket Tipi">
            <Select value={type} onChange={(e) => { setPage(1); setType(e.target.value); }}>
              <option value="">Tümü</option>
              <option value="PURCHASE">Satın alma</option>
              <option value="GRANT">Hediye</option>
              <option value="UNLOCK_SPEND">Bölüm açma</option>
              <option value="REFUND">İade</option>
              <option value="ADJUSTMENT">Düzeltme</option>
              <option value="EXPIRY">Geçersizlik</option>
            </Select>
          </Field>
        </div>
      </div>
      {error && <div className="px-5 pb-4 text-sm text-[var(--pg-red)]">{error}</div>}
      {!data && !error && <Loading label="Ledger yükleniyor…" />}
      {data && (
        <>
          {data.items.length === 0 ? (
            <EmptyState message="Hareket yok." />
          ) : (
            <Table
              head={
                <>
                  <Th>Kullanıcı</Th>
                  <Th>Tip</Th>
                  <Th className="text-right">Delta</Th>
                  <Th className="text-right">Kalan (P/G)</Th>
                  <Th>Not</Th>
                  <Th>Zaman</Th>
                </>
              }
            >
              {data.items.map((entry) => (
                <tr key={entry.id} className="row-hover">
                  <Td>
                    <p className="truncate">{entry.userEmail ?? "—"}</p>
                    {entry.displayName && <p className="text-xs text-[var(--pg-text-faint)]">{entry.displayName}</p>}
                  </Td>
                  <Td>
                    <Badge tone={entry.delta > 0 ? "green" : "red"}>{LEDGER_LABELS[entry.type] ?? entry.type}</Badge>
                  </Td>
                  <Td className={`num text-right font-medium ${entry.delta > 0 ? "text-[var(--pg-green)]" : "text-[var(--pg-red)]"}`}>
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                  </Td>
                  <Td className="num text-right text-[var(--pg-text-dim)]">
                    {entry.balanceAfterPurchased} / {entry.balanceAfterGranted}
                  </Td>
                  <Td className="max-w-[220px] truncate text-xs text-[var(--pg-text-dim)]" >{entry.note ?? "—"}</Td>
                  <Td className="text-[var(--pg-text-dim)]">{formatDateTime(entry.createdAt)}</Td>
                </tr>
              ))}
            </Table>
          )}
          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} onChange={setPage} />
        </>
      )}
    </Card>
  );
}
