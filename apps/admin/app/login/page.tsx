"use client";

/**
 * PerdeGo Admin — giriş ekranı (FAZ 8).
 *
 * POST /auth/login → JWT çifti localStorage'a yazılır (yalnızca panelin
 * kendi menşesinde); rol doğrulaması sunucudadır. EDITOR/ADMIN olmayan
 * hesap giriş YAPAR ama her admin ucunda 403 alır — panel ilk istekte
 * bunu dürüstçe gösterir.
 */

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api, readSession, writeSession, type AdminUser } from "@/lib/api";
import { Button, Field, Input } from "@/components/ui";

interface LoginResponse {
  user: AdminUser;
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (readSession()) router.replace("/");
  }, [router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErr({});
    let invalid = false;
    if (!email.trim()) {
      setFieldErr((p) => ({ ...p, email: "E-posta zorunludur" }));
      invalid = true;
    }
    if (!password) {
      setFieldErr((p) => ({ ...p, password: "Parola zorunludur" }));
      invalid = true;
    }
    if (invalid) return;

    setBusy(true);
    try {
      const data = await api.post<LoginResponse>("/auth/login", { email: email.trim(), password });
      writeSession({ user: data.user, accessToken: data.tokens.accessToken, refreshToken: data.tokens.refreshToken });
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "BAD_CREDENTIALS") setError("E-posta veya parola hatalı.");
        else if (err.code === "EMAIL_NOT_VERIFIED") setError("E-posta doğrulanmamış. Mobil uygulamadan hesabını doğrula.");
        else if (err.code === "ACCOUNT_SUSPENDED") setError("Hesap askıya alınmış. Yöneticiyle iletişime geç.");
        else setError(err.message || "Giriş başarısız.");
      } else {
        setError("Ağ hatası — API erişilemiyor.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--pg-bg)] p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[4px] bg-[var(--pg-accent)] text-xl font-black text-white">
            P
          </div>
          <h1 className="text-xl font-bold tracking-wide">PerdeGo Admin</h1>
          <p className="mt-1 text-sm text-[var(--pg-text-dim)]">İçerik ve işletme yönetim paneli</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-[4px] border border-[var(--pg-border)] bg-[var(--pg-surface)] p-6"
          noValidate
        >
          <div className="space-y-4">
            <Field label="E-posta" required error={fieldErr.email}>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@perdego.dev"
                autoFocus
              />
            </Field>
            <Field label="Parola" required error={fieldErr.password}>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
          </div>

          {error && (
            <p className="mt-4 rounded-[3px] border border-[var(--pg-border)] bg-[var(--pg-red-soft)] px-3 py-2 text-sm text-[var(--pg-red)]" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="mt-5 w-full" loading={busy}>
            {busy ? "Giriş yapılıyor…" : "Giriş Yap"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-[var(--pg-text-faint)]">
          Yetkisiz erişim denemeleri sunucuda günlüğe kaydedilir.
        </p>
      </div>
    </div>
  );
}
