"use client";

/**
 * PerdeGo Admin — hafif UI kit'i (FAZ 8).
 *
 * Mobil tasarım dilinin web karşılığı: dikdörtgen formlar (0–6 px), koyu
 * yüzeyler, kırmızı vurgu. shadcn yerine monorepo-içi sade bileşen seti —
 * bağımlılık maliyeti yok, sinematik kimlik tam kontrol.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { ApiError, StepUpRequiredError, performStepUp } from "@/lib/api";

// --- Spinner ------------------------------------------------------------------

export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`spin inline-block rounded-full border-2 border-[var(--pg-text-faint)] border-t-[var(--pg-text)] ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function Loading({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 text-sm text-[var(--pg-text-dim)]" role="status">
      <Spinner size={20} />
      <span>{label}</span>
    </div>
  );
}

// --- Buton --------------------------------------------------------------------

type ButtonVariant = "primary" | "ghost" | "danger" | "subtle" | "success";

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  loading,
  className = "",
  title,
  small,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  title?: string;
  small?: boolean;
}) {
  const styles: Record<ButtonVariant, string> = {
    primary: "bg-[var(--pg-accent)] text-white hover:bg-[var(--pg-accent-hover)] disabled:opacity-40",
    success: "bg-[var(--pg-green)] text-white hover:brightness-110 disabled:opacity-40",
    danger: "bg-[var(--pg-red)] text-white hover:brightness-110 disabled:opacity-40",
    ghost: "bg-transparent text-[var(--pg-text-dim)] hover:text-[var(--pg-text)] hover:bg-[var(--pg-surface-2)] border border-[var(--pg-border)]",
    subtle: "bg-[var(--pg-surface-2)] text-[var(--pg-text)] hover:bg-[var(--pg-border)] border border-[var(--pg-border)]",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:cursor-not-allowed ${
        small ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm"
      } rounded-[3px] ${styles[variant]} ${className}`}
    >
      {loading && <Spinner size={small ? 12 : 14} className="border-white/40 border-t-white" />}
      {children}
    </button>
  );
}

// --- Form alanları -------------------------------------------------------------

export function Field({
  label,
  children,
  hint,
  error,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-[var(--pg-text-dim)]">
        {label}
        {required && <span className="text-[var(--pg-accent-hover)]">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-[var(--pg-text-faint)]">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-[var(--pg-red)]">{error}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-[3px] border border-[var(--pg-border)] bg-[var(--pg-surface-2)] px-3 py-2 text-sm text-[var(--pg-text)] placeholder:text-[var(--pg-text-faint)] focus:border-[var(--pg-border-strong)] focus:outline-none disabled:opacity-50";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} min-h-[80px] ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputClass} appearance-none ${props.className ?? ""}`}>
      {props.children}
    </select>
  );
}

// --- Rozetler ------------------------------------------------------------------

type BadgeTone = "neutral" | "green" | "amber" | "red" | "blue" | "accent";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "bg-[var(--pg-surface-2)] text-[var(--pg-text-dim)]",
    green: "bg-[var(--pg-green-soft)] text-[var(--pg-green)]",
    amber: "bg-[var(--pg-amber-soft)] text-[var(--pg-amber)]",
    red: "bg-[var(--pg-red-soft)] text-[var(--pg-red)]",
    blue: "bg-[var(--pg-blue-soft)] text-[var(--pg-blue)]",
    accent: "bg-[var(--pg-accent-soft)] text-[var(--pg-accent-hover)]",
  };
  return (
    <span className={`inline-flex items-center rounded-[2px] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Durum → rozet tonu eşlemesi (katalog/bölüm/abonelik/işlem durumları). */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeTone> = {
    PUBLISHED: "green",
    ACTIVE: "green",
    SENT: "green",
    READY: "green",
    PURCHASED: "green",
    DRAFT: "neutral",
    PENDING: "neutral",
    AWAITING_UPLOAD: "neutral",
    PROCESSING: "amber",
    TRIALING: "amber",
    SCHEDULED: "amber",
    GRACE_PERIOD: "amber",
    SENDING: "amber",
    SUSPENDED: "red",
    ARCHIVED: "red",
    EXPIRED: "red",
    CANCELED: "red",
    CANCELLED: "red",
    REFUNDED: "red",
    REVOKED: "red",
    FAILED: "red",
    ERROR: "red",
    ON_HOLD: "red",
    DELETED: "red",
  };
  const labels: Record<string, string> = {
    PUBLISHED: "Yayında",
    DRAFT: "Taslak",
    PROCESSING: "İşleniyor",
    ARCHIVED: "Arşivde",
    SCHEDULED: "Planlandı",
    AWAITING_UPLOAD: "Yükleme bekliyor",
    READY: "Hazır",
    ERROR: "Hata",
    ACTIVE: "Aktif",
    SUSPENDED: "Askıda",
    DELETED: "Silinmiş",
    TRIALING: "Deneme",
    GRACE_PERIOD: "Ödeme aralığı",
    ON_HOLD: "Beklemede",
    CANCELED: "İptal",
    CANCELLED: "İptal",
    EXPIRED: "Süresi doldu",
    PURCHASED: "Satın alındı",
    REFUNDED: "İade edildi",
    REVOKED: "Geçersiz",
    PENDING: "Bekliyor",
    SENT: "Gönderildi",
    SENDING: "Gönderiliyor",
    FAILED: "Başarısız",
  };
  return <Badge tone={map[status] ?? "neutral"}>{labels[status] ?? status}</Badge>;
}

// --- Kartlar --------------------------------------------------------------------

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[4px] border border-[var(--pg-border)] bg-[var(--pg-surface)] ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "accent" | "green" | "amber";
}) {
  const bar: Record<string, string> = {
    neutral: "bg-[var(--pg-border-strong)]",
    accent: "bg-[var(--pg-accent)]",
    green: "bg-[var(--pg-green)]",
    amber: "bg-[var(--pg-amber)]",
  };
  return (
    <Card className="relative overflow-hidden p-4">
      <span className={`absolute inset-y-0 left-0 w-[3px] ${bar[tone]}`} aria-hidden />
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--pg-text-faint)]">{label}</p>
      <p className="num mt-2 text-2xl font-semibold text-[var(--pg-text)]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--pg-text-dim)]">{sub}</p>}
    </Card>
  );
}

// --- Tablo ----------------------------------------------------------------------

export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--pg-border)] text-[11px] uppercase tracking-wider text-[var(--pg-text-faint)]">
            {head}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--pg-border)]">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-medium ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-middle ${className}`}>{children}</td>;
}

// --- Modal ------------------------------------------------------------------------

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`fade-up w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-[4px] border border-[var(--pg-border-strong)] bg-[var(--pg-surface)] shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-[var(--pg-border)] px-5 py-3.5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--pg-text)]">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="rounded p-1 text-[var(--pg-text-faint)] hover:bg-[var(--pg-surface-2)] hover:text-[var(--pg-text)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// --- Onay diyaloğu ----------------------------------------------------------------

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Onayla",
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="text-sm text-[var(--pg-text-dim)]">{message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Vazgeç
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// --- Step-up (yeniden kimlik doğrulama) modalı ---------------------------------------

interface StepUpContextValue {
  /** Kritik işlemi sarar: gerekirse step-up ister, sonra isteği tekrar dener. */
  run: <T>(action: () => Promise<T>) => Promise<T>;
}

const StepUpContext = createContext<StepUpContextValue | null>(null);

export function useStepUp(): StepUpContextValue {
  const ctx = useContext(StepUpContext);
  if (!ctx) throw new Error("useStepUp, StepUpProvider içinde kullanılmalıdır");
  return ctx;
}

export function StepUpProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(() => Promise<void>) | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (err) {
      if (err instanceof StepUpRequiredError) {
        // Modal aç; parola doğruysa isteği yeniden dene.
        return await new Promise<T>((resolve, reject) => {
          setPending(() => async () => {
            try {
              resolve(await action());
            } catch (retryErr) {
              reject(retryErr);
            }
          });
        });
      }
      throw err;
    }
  }, []);

  const submit = async () => {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await performStepUp(password);
      setPassword("");
      const action = pending;
      setPending(null);
      await action?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Doğrulama başarısız");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setPending(null);
    setPassword("");
    setError(null);
  };

  return (
    <StepUpContext.Provider value={{ run }}>
      {children}
      <Modal open={pending !== null} onClose={close} title="Yeniden kimlik doğrulama">
        <p className="text-sm text-[var(--pg-text-dim)]">
          Bu işlem kritik bir yönetim işlemidir. Devam etmek için parolanızı yeniden girin
          (doğrulama 5 dakika geçerlidir).
        </p>
        <div className="mt-4">
          <Field label="Parola" required error={error ?? undefined}>
            <Input
              type="password"
              value={password}
              autoFocus
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="••••••••"
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Vazgeç
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            Doğrula ve devam et
          </Button>
        </div>
      </Modal>
    </StepUpContext.Provider>
  );
}

// --- Toast ------------------------------------------------------------------------

interface ToastItem {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

const ToastContext = createContext<{ push: (kind: ToastItem["kind"], message: string) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast, ToastProvider içinde kullanılmalıdır");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((kind: ToastItem["kind"], message: string) => {
    idRef.current += 1;
    const id = idRef.current;
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const tones: Record<ToastItem["kind"], string> = {
    success: "border-l-[var(--pg-green)]",
    error: "border-l-[var(--pg-red)]",
    info: "border-l-[var(--pg-blue)]",
  };

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
        {items.map((item) => (
          <div
            key={item.id}
            className={`fade-up pointer-events-auto rounded-[3px] border border-[var(--pg-border)] border-l-4 bg-[var(--pg-surface)] px-4 py-3 text-sm shadow-xl ${tones[item.kind]}`}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// --- Sayfalama ---------------------------------------------------------------------

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-[var(--pg-border)] px-3 py-2.5 text-sm">
      <span className="text-xs text-[var(--pg-text-faint)]">
        Sayfa {page} / {totalPages}
      </span>
      <Button small variant="subtle" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Önceki
      </Button>
      <Button small variant="subtle" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Sonraki
      </Button>
    </div>
  );
}

// --- Sekmeler ------------------------------------------------------------------------

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: string; label: string }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-[var(--pg-border)]" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors ${
            active === tab.key
              ? "border-[var(--pg-accent)] font-medium text-[var(--pg-text)]"
              : "border-transparent text-[var(--pg-text-dim)] hover:text-[var(--pg-text)]"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// --- Boş durum ------------------------------------------------------------------------

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-14 text-center text-sm text-[var(--pg-text-faint)]" role="status">
      {message}
    </div>
  );
}

/** Modal içi form başlıkları için stabil id. */
export function useFieldId(): string {
  return useId();
}
