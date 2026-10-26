"use client";

/**
 * PerdeGo Admin — Yapım Yönetimi listesi (modül 2, FAZ 8).
 *
 * GET /admin/titles (tüm durumlar, filtreli) · POST /admin/titles (taslak) ·
 * POST /admin/titles/:id/publish · PATCH /admin/titles/:id/status (matris).
 * Düzenleme ve sezon/bölüm yönetimi detay sayfasındadır.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, api, formatDate, fieldErrors } from "@/lib/api";
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
  Td,
  Textarea,
  Th,
  useToast,
} from "@/components/ui";

interface TitleRow {
  contentId: string;
  slug: string;
  kind: "FILM" | "SERIES" | "SHORT_FILM";
  title: string;
  releaseYear: number;
  posterUrl: string | null;
  accessType: "FREE" | "SUBSCRIPTION" | "CREDIT";
  status: "DRAFT" | "PROCESSING" | "PUBLISHED" | "ARCHIVED";
  publishedAt: string | null;
}

interface ListResponse {
  items: TitleRow[];
  meta: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

const KIND_LABELS: Record<string, string> = {
  FILM: "Film",
  SERIES: "Dizi",
  SHORT_FILM: "Kısa Film",
};

const ACCESS_LABELS: Record<string, string> = {
  FREE: "Ücretsiz",
  SUBSCRIPTION: "Abonelik",
  CREDIT: "Kredi",
};

/** Durum geçiş matrisi (sunucuyla birebir; görünür butonları belirler). */
const TRANSITIONS: Record<string, Array<"DRAFT" | "PROCESSING" | "PUBLISHED" | "ARCHIVED">> = {
  DRAFT: ["PROCESSING", "PUBLISHED", "ARCHIVED"],
  PROCESSING: ["DRAFT", "PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["DRAFT", "ARCHIVED"],
  ARCHIVED: ["DRAFT", "PUBLISHED"],
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Taslağa çek",
  PROCESSING: "İşleniyor işaretle",
  PUBLISHED: "Yayına al",
  ARCHIVED: "Arşivle",
};

interface Category {
  slug: string;
  nameTr: string;
}

export default function TitlesPage() {
  const router = useRouter();
  const { push } = useToast();
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Oluşturma modalı
  const [createOpen, setCreateOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    slug: "",
    kind: "FILM",
    seriesFormat: "STANDARD",
    titleTr: "",
    titleEn: "",
    synopsisTr: "",
    synopsisEn: "",
    // Not: `new Date()` prerender'da değerlendirildiği için başlangıç boş;
    // güncel yıl, modal açıldığında (kullanıcı etkileşimi) doldurulur.
    releaseYear: "",
    ageRating: "",
    accessType: "FREE",
  });
  const [formCats, setFormCats] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status) params.set("status", status);
    if (kind) params.set("kind", kind);
    if (search) params.set("search", search);
    try {
      const data = await api.get<ListResponse>(`/admin/titles?${params.toString()}`);
      setData(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Yapım listesi alınamadı.");
    }
  }, [page, status, kind, search]);

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

  useEffect(() => {
    api
      .get<{ items: Array<{ slug: string; nameTr: string }> }>("/categories")
      .then((r) => setCategories(r.items))
      .catch(() => setCategories([]));
  }, []);

  const onSearchInput = (value: string) => {
    setSearchInput(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setPage(1);
      setSearch(value.trim());
    }, 350);
  };

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        slug: form.slug.trim(),
        kind: form.kind,
        titleTr: form.titleTr.trim(),
        titleEn: form.titleEn.trim(),
        synopsisTr: form.synopsisTr.trim(),
        synopsisEn: form.synopsisEn.trim(),
        releaseYear: Number(form.releaseYear),
      };
      if (form.kind === "SERIES") body.seriesFormat = form.seriesFormat;
      if (form.ageRating.trim()) body.ageRating = form.ageRating.trim();
      body.accessType = form.accessType;
      if (formCats.length > 0) body.categorySlugs = formCats;
      const created = await api.post<{ id: string }>("/admin/titles", body);
      push("success", "Taslak oluşturuldu");
      setCreateOpen(false);
      setForm((f) => ({ ...f, slug: "", titleTr: "", titleEn: "", synopsisTr: "", synopsisEn: "" }));
      setFormCats([]);
      router.push(`/titles/${created.id}`);
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length > 0) setFormErrors(fe);
      else if (err instanceof ApiError) {
        if (err.code === "CONFLICT") setFormErrors({ slug: "Bu slug zaten kullanılıyor" });
        else push("error", err.message);
      }
    } finally {
      setCreating(false);
    }
  };

  const changeStatus = async (id: string, next: string) => {
    setBusyId(id);
    try {
      await api.patch(`/admin/titles/${id}/status`, { status: next });
      push("success", next === "PUBLISHED" ? "Yayına alındı" : `Durum: ${next}`);
      await load();
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Durum değiştirilemedi");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Yapımlar</h1>
            <p className="mt-0.5 text-sm text-[var(--pg-text-dim)]">
              {data ? `${data.meta.totalItems} kayıt` : "…"} · taslak/işleniyor kayıtları herkese açık uçlarda görünmez
            </p>
          </div>
          <Button
            onClick={() => {
              setForm((f) => (f.releaseYear === "" ? { ...f, releaseYear: String(new Date().getFullYear()) } : f));
              setCreateOpen(true);
            }}
          >
            + Yeni Yapım
          </Button>
        </div>

        <Card className="mb-5 flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <Field label="Ara (başlık/slug)">
              <Input value={searchInput} onChange={(e) => onSearchInput(e.target.value)} placeholder="Başlık veya slug…" />
            </Field>
          </div>
          <div className="w-40">
            <Field label="Durum">
              <Select
                value={status}
                onChange={(e) => {
                  setPage(1);
                  setStatus(e.target.value);
                }}
              >
                <option value="">Tümü</option>
                <option value="DRAFT">Taslak</option>
                <option value="PROCESSING">İşleniyor</option>
                <option value="PUBLISHED">Yayında</option>
                <option value="ARCHIVED">Arşivde</option>
              </Select>
            </Field>
          </div>
          <div className="w-40">
            <Field label="Tür">
              <Select
                value={kind}
                onChange={(e) => {
                  setPage(1);
                  setKind(e.target.value);
                }}
              >
                <option value="">Tümü</option>
                <option value="FILM">Film</option>
                <option value="SERIES">Dizi</option>
                <option value="SHORT_FILM">Kısa Film</option>
              </Select>
            </Field>
          </div>
        </Card>

        {error && (
          <Card className="mb-5 border-l-4 border-l-[var(--pg-red)] p-4 text-sm text-[var(--pg-red)]">{error}</Card>
        )}

        {!data && !error && <Loading label="Yapımlar yükleniyor…" />}

        {data && (
          <Card>
            {data.items.length === 0 ? (
              <EmptyState message="Filtreyle eşleşen yapım yok." />
            ) : (
              <Table
                head={
                  <>
                    <Th>Yapım</Th>
                    <Th>Tür</Th>
                    <Th>Erişim</Th>
                    <Th>Durum</Th>
                    <Th>Yayın</Th>
                    <Th className="text-right">İşlemler</Th>
                  </>
                }
              >
                {data.items.map((row) => (
                  <tr key={row.contentId} className="row-hover">
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-8 shrink-0 overflow-hidden rounded-[2px] bg-[var(--pg-surface-2)]">
                          {row.posterUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.posterUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--pg-text-faint)]">
                              afiş
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link href={`/titles/${row.contentId}`} className="block truncate font-medium hover:text-[var(--pg-accent-hover)]">
                            {row.title}
                          </Link>
                          <span className="font-mono text-xs text-[var(--pg-text-faint)]">
                            {row.slug} · {row.releaseYear}
                          </span>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-[var(--pg-text-dim)]">{KIND_LABELS[row.kind]}</Td>
                    <Td>
                      <Badge tone={row.accessType === "FREE" ? "green" : row.accessType === "SUBSCRIPTION" ? "blue" : "accent"}>
                        {ACCESS_LABELS[row.accessType]}
                      </Badge>
                    </Td>
                    <Td>
                      <StatusBadge status={row.status} />
                    </Td>
                    <Td className="text-[var(--pg-text-dim)]">{formatDate(row.publishedAt)}</Td>
                    <Td>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {(TRANSITIONS[row.status] ?? []).map((next) => (
                          <Button
                            key={next}
                            small
                            variant={next === "PUBLISHED" ? "success" : next === "ARCHIVED" ? "ghost" : "subtle"}
                            disabled={busyId === row.contentId}
                            onClick={() => void changeStatus(row.contentId, next)}
                          >
                            {STATUS_LABELS[next]}
                          </Button>
                        ))}
                        <Link href={`/titles/${row.contentId}`}>
                          <Button small variant="subtle">Yönet</Button>
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

        {/* Yeni yapım modalı */}
        <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Yeni Yapım (taslak)" wide>
          <form onSubmit={submitCreate} noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Slug" required error={formErrors.slug} hint="kebab-case: ornek-yapim">
                <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="karanlik-sehir" />
              </Field>
              <Field label="Tür" required>
                <Select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                  <option value="FILM">Film</option>
                  <option value="SERIES">Dizi</option>
                  <option value="SHORT_FILM">Kısa Film</option>
                </Select>
              </Field>
              {form.kind === "SERIES" && (
                <Field label="Dizi Biçimi" required>
                  <Select value={form.seriesFormat} onChange={(e) => setForm((f) => ({ ...f, seriesFormat: e.target.value }))}>
                    <option value="STANDARD">Standart</option>
                    <option value="MINI">Mini dizi</option>
                  </Select>
                </Field>
              )}
              <Field label="Yayın Yılı" required error={formErrors.releaseYear}>
                <Input
                  type="number"
                  min={1890}
                  max={2100}
                  value={form.releaseYear}
                  onChange={(e) => setForm((f) => ({ ...f, releaseYear: e.target.value }))}
                />
              </Field>
              <Field label="Başlık (TR)" required error={formErrors.titleTr}>
                <Input value={form.titleTr} onChange={(e) => setForm((f) => ({ ...f, titleTr: e.target.value }))} />
              </Field>
              <Field label="Başlık (EN)" required error={formErrors.titleEn}>
                <Input value={form.titleEn} onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))} />
              </Field>
              <Field label="Sinopsis (TR)" required error={formErrors.synopsisTr}>
                <Textarea value={form.synopsisTr} onChange={(e) => setForm((f) => ({ ...f, synopsisTr: e.target.value }))} />
              </Field>
              <Field label="Sinopsis (EN)" required error={formErrors.synopsisEn}>
                <Textarea value={form.synopsisEn} onChange={(e) => setForm((f) => ({ ...f, synopsisEn: e.target.value }))} />
              </Field>
              <Field label="Yaş Sınırı" hint="7+ | 13+ | 16+ | 18+">
                <Input value={form.ageRating} onChange={(e) => setForm((f) => ({ ...f, ageRating: e.target.value }))} placeholder="13+" />
              </Field>
              <Field label="Erişim Modeli" required>
                <Select value={form.accessType} onChange={(e) => setForm((f) => ({ ...f, accessType: e.target.value }))}>
                  <option value="FREE">Ücretsiz</option>
                  <option value="SUBSCRIPTION">Abonelik</option>
                  <option value="CREDIT">Kredi</option>
                </Select>
              </Field>
            </div>
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--pg-text-dim)]">Kategoriler</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const selected = formCats.includes(c.slug);
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() =>
                        setFormCats((prev) => (selected ? prev.filter((s) => s !== c.slug) : [...prev, c.slug]))
                      }
                      className={`rounded-[3px] border px-2.5 py-1 text-xs transition-colors ${
                        selected
                          ? "border-[var(--pg-accent)] bg-[var(--pg-accent-soft)] text-[var(--pg-text)]"
                          : "border-[var(--pg-border)] text-[var(--pg-text-dim)] hover:border-[var(--pg-border-strong)]"
                      }`}
                      aria-pressed={selected}
                    >
                      {c.nameTr}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                Vazgeç
              </Button>
              <Button type="submit" loading={creating}>
                Taslak Oluştur
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}


