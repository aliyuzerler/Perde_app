"use client";

/**
 * PerdeGo Admin — uygulama kabuğu (FAZ 8).
 *
 * Notlar:
 *  - Oturum denetimi İSTEMCİDE yalnızca yönlendirme amaçlıdır; YETKİ
 *    denetimi her uçta sunucuda yapılır (rol + step-up). Panelde gizli
 *    buton güvenliği diye bir şey yoktur — sunucu her isteği yeniden
 *    doğrular.
 *  - Geçersiz oturumda ilk API çağrısı 401 → refresh → başarısızsa
 *    oturum temizlenir ve /login'e dönülür (api.ts içinde).
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, readSession, writeSession, type AdminUser } from "@/lib/api";
import { Badge, Button, Spinner } from "@/components/ui";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  adminOnly?: boolean;
}

function Icon({ path }: { path: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}

const NAV: NavItem[] = [
  { href: "/", label: "Panel Özeti", icon: <Icon path="M3 12h4l3-8 4 16 3-8h4" /> },
  { href: "/titles", label: "Yapımlar", icon: <Icon path="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /> },
  { href: "/home-layout", label: "Ana Sayfa Düzeni", icon: <Icon path="M3 5h18v6H3zM3 15h8v4H3zM15 15h6v4h-6z" /> },
  { href: "/revenue", label: "Gelir Modeli", icon: <Icon path="M12 2v20M17 6H9.5a3 3 0 000 6h5a3 3 0 010 6H6" /> },
  { href: "/users", label: "Kullanıcılar", icon: <Icon path="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /> },
  { href: "/notifications", label: "Bildirimler", icon: <Icon path="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /> },
  { href: "/audit", label: "Denetim Günlüğü", icon: <Icon path="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" /> },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [apiDown, setApiDown] = useState(false);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    let alive = true;
    void (async () => {
      // Oturum geçerliliğini sunucudan sessizce doğrula (dürüst panel).
      try {
        await api.get("/auth/sessions");
        if (!alive) return;
        setUser(session.user);
        setApiDown(false);
      } catch {
        if (!alive) return;
        // request() refresh denedi; hâlâ hata ise oturum ölmüş demektir.
        if (!readSession()) router.replace("/login");
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  // API ayakta mı? (health köprüsü — DÜRÜST gösterge)
  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch("/health", { cache: "no-store" })
        .then((r) => alive && setApiDown(!r.ok))
        .catch(() => alive && setApiDown(true));
    void check();
    const timer = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const logout = useCallback(() => {
    api.post("/auth/logout").catch(() => undefined).finally(() => {
      writeSession(null);
      router.replace("/login");
    });
  }, [router]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--pg-bg)]">
        <Spinner size={26} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--pg-bg)]">
      {/* Kenar çubuğu — masaüstü sabit, tablet/mobil çekmece */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 border-r border-[var(--pg-border)] bg-[var(--pg-surface)] transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-[var(--pg-border)] px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-[3px] bg-[var(--pg-accent)] text-sm font-black text-white">
            P
          </div>
          <div>
            <p className="text-sm font-bold leading-none tracking-wide">PerdeGo</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--pg-text-faint)]">Admin</p>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 p-3" aria-label="Yönetim menüsü">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-[3px] px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[var(--pg-accent-soft)] font-medium text-[var(--pg-text)]"
                    : "text-[var(--pg-text-dim)] hover:bg-[var(--pg-surface-2)] hover:text-[var(--pg-text)]"
                }`}
              >
                <span className={active ? "text-[var(--pg-accent-hover)]" : "text-[var(--pg-text-faint)]"}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-[var(--pg-border)] p-4">
          {user && (
            <div className="mb-3">
              <p className="truncate text-sm font-medium">{user.displayName}</p>
              <p className="truncate text-xs text-[var(--pg-text-faint)]">{user.email}</p>
              <div className="mt-1.5">
                <Badge tone={user.role === "ADMIN" ? "accent" : "blue"}>{user.role}</Badge>
              </div>
            </div>
          )}
          <Button variant="ghost" small className="w-full" onClick={logout}>
            Oturumu Kapat
          </Button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
      )}

      {/* İçerik */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--pg-border)] bg-[var(--pg-bg)]/95 px-4 backdrop-blur sm:px-6">
          <button
            className="rounded p-1.5 text-[var(--pg-text-dim)] hover:bg-[var(--pg-surface-2)] lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menüyü aç"
          >
            <Icon path="M4 6h16M4 12h16M4 18h16" />
          </button>
          <p className="text-sm font-medium text-[var(--pg-text-dim)]">
            {NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)))?.label ?? "Yönetim"}
          </p>
          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${apiDown ? "bg-[var(--pg-red)]" : "bg-[var(--pg-green)]"}`}
                aria-hidden
              />
              <span className="text-[var(--pg-text-faint)]">{apiDown ? "API erişilemiyor" : "API bağlı"}</span>
            </span>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
