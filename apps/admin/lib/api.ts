"use client";

/**
 * PerdeGo Admin — API istemcisi (FAZ 8).
 *
 * Kurallar:
 *  - Yalnızca GÖRELİ yollar (/api/v1/...); Next.js rewrite ile API'ye köprü.
 *  - Zarf çözümü: başarılı → data; hatalı → ApiError (kod + mesaj + detay).
 *  - 401'de tek seferlik sessiz refresh; refresh başarısızsa oturum sıfırlanır.
 *  - Step-up: 401 STEP_UP_REQUIRED yanıtında arayüz katmanı StepUpModal açar;
 *    istemci token'ı bellekte TTL ile tutar ve isteği X-Step-Up-Token ile
 *    bir kez yeniden dener.
 */

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.status = status;
    this.code = shape.code;
    this.details = shape.details;
  }
}

export class StepUpRequiredError extends ApiError {
  constructor(status: number, shape: ApiErrorShape) {
    super(status, shape);
    this.name = "StepUpRequiredError";
  }
}

// --- Oturum deposu (localStorage; SSR'da yok) --------------------------------

export interface AdminUser {
  id: string;
  displayName: string;
  email: string;
  role: "USER" | "EDITOR" | "ADMIN";
  locale: string;
}

interface SessionStore {
  user: AdminUser;
  accessToken: string;
  refreshToken: string;
}

const SESSION_KEY = "perdego.admin.session";
const STEPUP_KEY = "perdego.admin.stepup";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSession(): SessionStore | null {
  const store = safeStorage();
  if (!store) return null;
  const raw = store.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionStore;
  } catch {
    return null;
  }
}

export function writeSession(session: SessionStore | null): void {
  const store = safeStorage();
  if (!store) return;
  if (session) store.setItem(SESSION_KEY, JSON.stringify(session));
  else store.removeItem(SESSION_KEY);
}

export function readStepUpToken(): string | null {
  const store = safeStorage();
  if (!store) return null;
  const raw = store.getItem(STEPUP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token: string; exp: number };
    if (parsed.exp < Date.now()) return null;
    return parsed.token;
  } catch {
    return null;
  }
}

export function writeStepUpToken(token: string, expiresIn: number): void {
  const store = safeStorage();
  if (!store) return;
  store.setItem(STEPUP_KEY, JSON.stringify({ token, exp: Date.now() + expiresIn * 1000 - 5000 }));
}

export function clearStepUpToken(): void {
  safeStorage()?.removeItem(STEPUP_KEY);
}

// --- Çekirdek istek fonksiyonu ------------------------------------------------

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const session = readSession();
    if (!session?.refreshToken) return false;
    try {
      const res = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (!res.ok) return false;
      const json = (await res.json()) as { ok: boolean; data?: { user: AdminUser; tokens: { accessToken: string; refreshToken: string } } };
      if (!json.ok || !json.data) return false;
      writeSession({ user: json.data.user, accessToken: json.data.tokens.accessToken, refreshToken: json.data.tokens.refreshToken });
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  /** 401'de refresh denemeden önce kaç kez beklenir (varsayılan 1). */
  retryOn401?: boolean;
}

function isStepUpShape(shape: ApiErrorShape): boolean {
  const reason = String(shape.details?.reason ?? "");
  return (
    reason.includes("STEP_UP") ||
    /step.?up/i.test(shape.message) ||
    shape.code === "STEP_UP_REQUIRED" ||
    shape.code === "STEP_UP_INVALID"
  );
}

/** Düşük seviye istek: zarf çözer, refresh + step-up yeniden denemesi yapar. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = readSession();
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  const stepUp = readStepUpToken();
  if (stepUp) headers["X-Step-Up-Token"] = stepUp;

  const res = await fetch(`/api/v1${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  type EnvelopePayload = { ok?: boolean; data?: T; error?: ApiErrorShape } | null;
  let json: EnvelopePayload = null;
  try {
    json = (await res.json()) as EnvelopePayload;
  } catch {
    throw new ApiError(res.status, { code: "INTERNAL", message: `Geçersiz yanıt (${res.status})` });
  }

  if (json && json.ok && json.data !== undefined) {
    return json.data;
  }

  const shape: ApiErrorShape =
    json?.error ?? { code: "INTERNAL", message: `İstek başarısız (${res.status})` };

  // Adım-yukarı gerekiyor: arayüzün modalını tetiklemek için özel hata.
  if (isStepUpShape(shape)) {
    clearStepUpToken();
    throw new StepUpRequiredError(res.status, shape);
  }

  // Oturum bitti: bir kez refresh dene; olmazsa istemciyi oturumdan çıkar.
  if (res.status === 401 && options.retryOn401 !== false) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request<T>(path, { ...options, retryOn401: false });
    }
    writeSession(null);
  }

  throw new ApiError(res.status, shape);
}

// --- Yüksek seviye yardımcılar ------------------------------------------------

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Step-up akışı: parola ile token alır, belleğe yazar. */
export async function performStepUp(password: string): Promise<void> {
  const data = await api.post<{ stepUpToken: string; expiresIn: number }>("/auth/step-up", { password });
  writeStepUpToken(data.stepUpToken, data.expiresIn);
}

/** Ham dosya yükleme (video PUT): progress takipli, zarfsız uç. */
export function uploadFile(
  url: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError(xhr.status, { code: "UPLOAD_FAILED", message: `Yükleme başarısız (${xhr.status})` }));
    };
    xhr.onerror = () => reject(new ApiError(0, { code: "UPLOAD_FAILED", message: "Ağ hatası — yükleme kesildi" }));
    xhr.send(file);
  });
}

// --- Biçim yardımcıları -------------------------------------------------------

export function formatKurus(value: number | null | undefined, currency = "TRY"): string {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(value / 100);
  } catch {
    return `${(value / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR", { dateStyle: "medium" });
}

/** Doğrulama hata listesini (Zod details.fields) alan etiketlerine çevirir. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError && err.details && Array.isArray(err.details.fields)) {
    const out: Record<string, string> = {};
    for (const f of err.details.fields as Array<{ path: string; message: string }>) {
      out[f.path] = f.message;
    }
    return out;
  }
  return {};
}
