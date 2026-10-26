"use client";

/**
 * PerdeGo Admin — Kullanıcı Yönetimi listesi (modül 6, FAZ 8).
 * Arama + sayfalama; detay aksiyonları kullanıcı detay sayfasındadır.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, formatDate } from "@/lib/api";
import { AppShell } from "@/components/shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  Pagination,
  Table,
  Td,
  Th,
} from "@/components/ui";

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: "USER" | "EDITOR" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  locale: string;
  createdAt: string;
}

export default function UsersPage() {
  const [data, setData] = useState<{ items: UserRow[]; meta: { page: number; totalPages: number; totalItems: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search) params.set("search", search);
    try {
      const res = await api.get<{ items: UserRow[]; meta: { page: number; totalPages: number; totalItems: number } }>(
        `/admin/users?${params.toString()}`,
      );
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Kullanıcılar yüklenemedi");
    }
  }, [page, search]);

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

  const onSearch = (value: string) => {
    setSearchInput(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setPage(1);
      setSearch(value.trim());
    }, 350);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div className="mb-5">
          <h1 className="text-lg font-semibold">Kullanıcılar</h1>
          <p className="mt-0.5 text-sm text-[var(--pg-text-dim)]">
            {data ? `${data.meta.totalItems} kayıt` : "…"} · e-posta veya görünen adla ara
          </p>
        </div>

        <Card className="mb-5 p-4">
          <Field label="Ara">
            <Input value={searchInput} onChange={(e) => onSearch(e.target.value)} placeholder="e-posta veya ad…" />
          </Field>
        </Card>

        {error && <Card className="mb-5 border-l-4 border-l-[var(--pg-red)] p-4 text-sm text-[var(--pg-red)]">{error}</Card>}

        {!data && !error && <Loading label="Kullanıcılar yükleniyor…" />}

        {data && (
          <Card>
            {data.items.length === 0 ? (
              <EmptyState message="Eşleşen kullanıcı yok." />
            ) : (
              <Table
                head={
                  <>
                    <Th>Kullanıcı</Th>
                    <Th>Rol</Th>
                    <Th>Durum</Th>
                    <Th>Kayıt</Th>
                    <Th className="text-right">İşlem</Th>
                  </>
                }
              >
                {data.items.map((user) => (
                  <tr key={user.id} className="row-hover">
                    <Td>
                      <p className="font-medium">{user.displayName}</p>
                      <p className="text-xs text-[var(--pg-text-dim)]">{user.email}</p>
                    </Td>
                    <Td>
                      <Badge tone={user.role === "ADMIN" ? "accent" : user.role === "EDITOR" ? "blue" : "neutral"}>{user.role}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={user.status === "ACTIVE" ? "green" : user.status === "SUSPENDED" ? "red" : "neutral"}>
                        {user.status === "ACTIVE" ? "Aktif" : user.status === "SUSPENDED" ? "Askıda" : "Silinmiş"}
                      </Badge>
                    </Td>
                    <Td className="text-[var(--pg-text-dim)]">{formatDate(user.createdAt)}</Td>
                    <Td>
                      <div className="flex justify-end">
                        <Link href={`/users/${user.id}`}>
                          <Button small variant="subtle">İncele</Button>
                        </Link>
                      </div>
                    </Td>
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
