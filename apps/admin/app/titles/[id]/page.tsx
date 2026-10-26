"use client";

/**
 * PerdeGo Admin — Yapım Detayı (modül 2-4, FAZ 8).
 *
 * Sekmeler: Bilgiler (PATCH /admin/titles/:id) · Sezonlar & Bölümler
 * (CRUD + yayın geçişleri) · Erişim modeli (bölüm başına erişim + kredi
 * fiyatı) · Medya (upload-url → sağlayıcıya doğrudan PUT → transkod takibi
 * → yayın öncesi önizleme).
 *
 * Güvenlik: video dosyası tarayıcıdan SADECE süreli imzalı uploadUrl ile
 * sağlayıcıya gider; sağlayıcı anahtarları tarayıcıya hiç dönülmez.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, api, fieldErrors, formatDateTime, readSession, uploadFile } from "@/lib/api";
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
  Modal,
  Select,
  Spinner,
  StatusBadge,
  Tabs,
  Textarea,
  useToast,
} from "@/components/ui";

// --- Türler -------------------------------------------------------------------

interface TitleDetail {
  id: string;
  slug: string;
  kind: "FILM" | "SERIES" | "SHORT_FILM";
  seriesFormat: "STANDARD" | "MINI" | null;
  titleTr: string;
  titleEn: string;
  originalTitle: string | null;
  synopsisTr: string;
  synopsisEn: string;
  taglineTr: string | null;
  taglineEn: string | null;
  releaseYear: number;
  ageRating: string | null;
  durationSeconds: number | null;
  posterUrl: string | null;
  heroImageUrl: string | null;
  verticalPreviewUrl: string | null;
  accessType: "FREE" | "SUBSCRIPTION" | "CREDIT";
  status: "DRAFT" | "PROCESSING" | "PUBLISHED" | "ARCHIVED";
  publishedAt: string | null;
  categories: Array<{ id: string; slug: string; nameTr: string; nameEn: string }>;
  seasons: Array<{
    id: string;
    seasonNumber: number;
    titleTr: string | null;
    titleEn: string | null;
    episodes: EpisodeRow[];
  }>;
}

interface EpisodeMediaRow {
  id: string;
  provider: string;
  providerAssetId: string;
  state: "AWAITING_UPLOAD" | "PROCESSING" | "READY" | "ERROR";
  originalName: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  errorMessage: string | null;
  readyAt: string | null;
  createdAt: string;
}

interface EpisodeRow {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  titleTr: string;
  titleEn: string;
  synopsisTr: string | null;
  synopsisEn: string | null;
  durationSeconds: number;
  accessType: "FREE" | "SUBSCRIPTION" | "CREDIT";
  creditCost: number | null;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
  publishedAt: string | null;
  media: EpisodeMediaRow[];
}

interface UploadTicket {
  mediaId: string;
  uploadUrl: string;
  method: string;
  maxSizeBytes: number;
  expiresAt: string;
}

const EPISODE_TRANSITIONS: Record<string, Array<"DRAFT" | "PUBLISHED" | "ARCHIVED">> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  SCHEDULED: ["PUBLISHED", "DRAFT", "ARCHIVED"],
  PUBLISHED: ["ARCHIVED", "DRAFT"],
  ARCHIVED: ["PUBLISHED", "DRAFT"],
};

const EPISODE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Taslağa çek",
  PUBLISHED: "Yayınla",
  ARCHIVED: "Yayından kaldır (arşiv)",
};

export default function TitleDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { push } = useToast();
  const isAdmin = readSession()?.user.role === "ADMIN";

  const [detail, setDetail] = useState<TitleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("info");

  // Form state'leri load'dan ÖNCE bildirilir (kural: bildirim sırası).
  const [form, setForm] = useState({
    titleTr: "",
    titleEn: "",
    originalTitle: "",
    taglineTr: "",
    synopsisTr: "",
    synopsisEn: "",
    releaseYear: "",
    ageRating: "",
    durationSeconds: "",
    posterUrl: "",
    heroImageUrl: "",
    verticalPreviewUrl: "",
    accessType: "FREE",
  });
  const [formCats, setFormCats] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api.get<TitleDetail>(`/admin/titles/${id}`);
      setDetail(data);
      setForm({
        titleTr: data.titleTr,
        titleEn: data.titleEn,
        originalTitle: data.originalTitle ?? "",
        taglineTr: data.taglineTr ?? "",
        synopsisTr: data.synopsisTr,
        synopsisEn: data.synopsisEn,
        releaseYear: String(data.releaseYear),
        ageRating: data.ageRating ?? "",
        durationSeconds: data.durationSeconds ? String(data.durationSeconds) : "",
        posterUrl: data.posterUrl ?? "",
        heroImageUrl: data.heroImageUrl ?? "",
        verticalPreviewUrl: data.verticalPreviewUrl ?? "",
        accessType: data.accessType,
      });
      setFormCats(data.categories.map((c) => c.slug));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Yapım yüklenemedi.");
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

  // --- Bilgiler formu ---------------------------------------------------------

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Array<{ slug: string; nameTr: string }>>([]);

  useEffect(() => {
    api
      .get<{ items: Array<{ slug: string; nameTr: string }> }>("/categories")
      .then((r) => setCategories(r.items))
      .catch(() => setCategories([]));
  }, []);

  const saveInfo = async (e: FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        titleTr: form.titleTr.trim(),
        titleEn: form.titleEn.trim(),
        synopsisTr: form.synopsisTr.trim(),
        synopsisEn: form.synopsisEn.trim(),
        accessType: form.accessType,
        categorySlugs: formCats,
      };
      if (form.originalTitle.trim()) body.originalTitle = form.originalTitle.trim();
      else body.originalTitle = null;
      if (form.taglineTr.trim()) body.taglineTr = form.taglineTr.trim();
      if (form.ageRating.trim()) body.ageRating = form.ageRating.trim();
      else body.ageRating = null;
      if (form.releaseYear) body.releaseYear = Number(form.releaseYear);
      if (form.durationSeconds) body.durationSeconds = Number(form.durationSeconds);
      for (const key of ["posterUrl", "heroImageUrl", "verticalPreviewUrl"] as const) {
        const value = form[key].trim();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (body as any)[key] = value.length > 0 ? value : null;
      }
      await api.patch(`/admin/titles/${id}`, body);
      push("success", "Yapım bilgileri kaydedildi");
      await load();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length > 0) setFormErrors(fe);
      else push("error", err instanceof ApiError ? err.message : "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  // --- Sezon & bölüm yönetimi ---------------------------------------------------

  const [episodeModal, setEpisodeModal] = useState<{ mode: "create" | "edit"; episode?: EpisodeRow; seasonNumber: number } | null>(null);
  const [seasonModalOpen, setSeasonModalOpen] = useState(false);
  const [seasonForm, setSeasonForm] = useState({ seasonNumber: "1", titleTr: "" });
  const [seasonError, setSeasonError] = useState<string | null>(null);
  const [creatingSeason, setCreatingSeason] = useState(false);
  const [busyEp, setBusyEp] = useState<string | null>(null);
  const [deleteEp, setDeleteEp] = useState<EpisodeRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const submitSeason = async (e: FormEvent) => {
    e.preventDefault();
    setSeasonError(null);
    const seasonNumber = Number(seasonForm.seasonNumber);
    if (!Number.isInteger(seasonNumber) || seasonNumber < 1) {
      setSeasonError("Sezon numarası 1 veya daha büyük bir tam sayı olmalı");
      return;
    }
    setCreatingSeason(true);
    try {
      await api.post(`/admin/titles/${id}/seasons`, {
        seasonNumber,
        titleTr: seasonForm.titleTr.trim() || undefined,
      });
      push("success", `Sezon ${seasonNumber} oluşturuldu`);
      setSeasonModalOpen(false);
      setSeasonForm({ seasonNumber: String(seasonNumber + 1), titleTr: "" });
      await load();
    } catch (err) {
      setSeasonError(err instanceof ApiError ? (err.code === "CONFLICT" ? "Bu sezon numarası zaten var" : err.message) : "Sezon oluşturulamadı");
    } finally {
      setCreatingSeason(false);
    }
  };

  const changeEpisodeStatus = async (episode: EpisodeRow, next: string) => {
    setBusyEp(episode.id);
    try {
      await api.patch(`/admin/episodes/${episode.id}/status`, { status: next });
      push("success", next === "PUBLISHED" ? "Bölüm yayına alındı" : next === "ARCHIVED" ? "Bölüm yayından kaldırıldı" : "Bölüm taslağa çekildi");
      await load();
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Durum değiştirilemedi");
    } finally {
      setBusyEp(null);
    }
  };

  const confirmDeleteEpisode = async () => {
    if (!deleteEp) return;
    setDeleting(true);
    try {
      await api.del(`/admin/episodes/${deleteEp.id}`);
      push("success", "Bölüm silindi");
      setDeleteEp(null);
      await load();
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Silinemedi");
    } finally {
      setDeleting(false);
    }
  };

  // --- Medya: yükleme + transkod takibi -----------------------------------------

  const [uploadState, setUploadState] = useState<{ episodeId: string; pct: number; stage: string } | null>(null);
  const [preview, setPreview] = useState<{ url: string; title: string; expiresAt: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Transkod durumu POLLING'i: PROCESSING iken 3 sn'de bir medya çekilir. */
  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      const processing = document.querySelectorAll("[data-media-state='PROCESSING']").length;
      if (processing === 0 && !uploadState) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        return;
      }
      void load();
    }, 3000);
  }, [load, uploadState]);

  useEffect(() => {
    const processing = detail?.seasons.some((s) => s.episodes.some((e) => e.media.some((m) => m.state === "PROCESSING")));
    if (processing || uploadState) startPolling();
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, uploadState]);

  const onFileSelected = async (episode: EpisodeRow, file: File) => {
    setUploadState({ episodeId: episode.id, pct: 0, stage: "Yükleme anahtarı alınıyor…" });
    try {
      const ticket = await api.post<UploadTicket>(`/admin/episodes/${episode.id}/media/upload-url`, {
        originalName: file.name,
        contentType: file.type || "application/octet-stream",
      });
      if (file.size > ticket.maxSizeBytes) {
        push("error", `Dosya sınırı aşıyor (maks. ${Math.round(ticket.maxSizeBytes / 1024 / 1024)} MB)`);
        setUploadState(null);
        return;
      }
      setUploadState({ episodeId: episode.id, pct: 0, stage: "Yükleniyor…" });
      await uploadFile(ticket.uploadUrl, file, (pct) => setUploadState({ episodeId: episode.id, pct, stage: "Yükleniyor…" }));
      setUploadState({ episodeId: episode.id, pct: 100, stage: "Transkod sürüyor…" });
      push("success", "Dosya sağlayıcıya yüklendi; transkod izleniyor");
      await load();
      setUploadState(null);
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Yükleme başarısız");
      setUploadState(null);
    }
  };

  const syncMedia = async (mediaId: string) => {
    try {
      await api.post(`/admin/media/${mediaId}/sync`);
      await load();
      push("info", "Sağlayıcı durumu yenilendi");
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Eşitleme başarısız");
    }
  };

  const openPreview = async (episode: EpisodeRow) => {
    setPreviewLoading(true);
    try {
      const data = await api.post<{ playbackUrl: string; episodeTitle: string; expiresAt: string; sources: { mp4?: string; hls?: string } }>(
        `/admin/episodes/${episode.id}/preview`,
      );
      setPreview({ url: data.playbackUrl, title: data.episodeTitle, expiresAt: data.expiresAt });
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Önizleme oturumu açılamadı");
    } finally {
      setPreviewLoading(false);
    }
  };

  if (error && !detail) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl border-l-4 border-l-[var(--pg-red)] p-5 text-sm">
          {error}
          <div className="mt-3">
            <Link href="/titles" className="text-[var(--pg-accent-hover)] hover:underline">← Yapımlara dön</Link>
          </div>
        </Card>
      </AppShell>
    );
  }

  if (!detail) {
    return (
      <AppShell>
        <Loading label="Yapım detayı yükleniyor…" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl">
        {/* Başlık */}
        <div className="mb-5">
          <Link href="/titles" className="text-xs text-[var(--pg-text-faint)] hover:text-[var(--pg-text)]">
            ← Yapımlar
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="h-16 w-11 shrink-0 overflow-hidden rounded-[2px] bg-[var(--pg-surface-2)]">
              {detail.posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detail.posterUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div>
              <h1 className="text-lg font-semibold">{detail.titleTr}</h1>
              <p className="mt-0.5 flex items-center gap-2 text-sm text-[var(--pg-text-dim)]">
                <span className="font-mono text-xs">{detail.slug}</span>·<span>{detail.releaseYear}</span>·
                <StatusBadge status={detail.status} />
                <Badge tone={detail.accessType === "FREE" ? "green" : detail.accessType === "SUBSCRIPTION" ? "blue" : "accent"}>
                  {detail.accessType === "FREE" ? "Ücretsiz" : detail.accessType === "SUBSCRIPTION" ? "Abonelik" : "Kredi"}
                </Badge>
              </p>
            </div>
          </div>
        </div>

        <Tabs
          tabs={[
            { key: "info", label: "Bilgiler" },
            { key: "episodes", label: `Sezonlar & Bölümler (${detail.seasons.reduce((n, s) => n + s.episodes.length, 0)})` },
          ]}
          active={tab}
          onChange={setTab}
        />

        {/* --- Bilgiler sekmesi --- */}
        {tab === "info" && (
          <Card className="mt-5 p-5">
            <form onSubmit={saveInfo} noValidate>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Başlık (TR)" required error={formErrors.titleTr}>
                  <Input value={form.titleTr} onChange={(e) => setForm((f) => ({ ...f, titleTr: e.target.value }))} />
                </Field>
                <Field label="Başlık (EN)" required error={formErrors.titleEn}>
                  <Input value={form.titleEn} onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))} />
                </Field>
                <Field label="Orijinal Başlık">
                  <Input value={form.originalTitle} onChange={(e) => setForm((f) => ({ ...f, originalTitle: e.target.value }))} />
                </Field>
                <Field label="Slogan (TR)">
                  <Input value={form.taglineTr} onChange={(e) => setForm((f) => ({ ...f, taglineTr: e.target.value }))} />
                </Field>
                <Field label="Sinopsis (TR)" required error={formErrors.synopsisTr}>
                  <Textarea value={form.synopsisTr} onChange={(e) => setForm((f) => ({ ...f, synopsisTr: e.target.value }))} />
                </Field>
                <Field label="Sinopsis (EN)" required error={formErrors.synopsisEn}>
                  <Textarea value={form.synopsisEn} onChange={(e) => setForm((f) => ({ ...f, synopsisEn: e.target.value }))} />
                </Field>
                <Field label="Yayın Yılı" required error={formErrors.releaseYear}>
                  <Input type="number" min={1890} max={2100} value={form.releaseYear} onChange={(e) => setForm((f) => ({ ...f, releaseYear: e.target.value }))} />
                </Field>
                <Field label="Yaş Sınırı">
                  <Input value={form.ageRating} onChange={(e) => setForm((f) => ({ ...f, ageRating: e.target.value }))} placeholder="13+" />
                </Field>
                <Field label="Süre (sn)" hint="Film/kısa film toplam süre">
                  <Input type="number" min={1} value={form.durationSeconds} onChange={(e) => setForm((f) => ({ ...f, durationSeconds: e.target.value }))} />
                </Field>
                <Field label="Erişim Modeli" required hint="Bölüm bazlı erişim buradaki varsayılanı izler">
                  <Select value={form.accessType} onChange={(e) => setForm((f) => ({ ...f, accessType: e.target.value }))}>
                    <option value="FREE">Ücretsiz</option>
                    <option value="SUBSCRIPTION">Abonelik gerekir</option>
                    <option value="CREDIT">Krediyle açılır</option>
                  </Select>
                </Field>
                <Field label="Afiş URL (2:3)" error={formErrors.posterUrl}>
                  <Input value={form.posterUrl} onChange={(e) => setForm((f) => ({ ...f, posterUrl: e.target.value }))} placeholder="https://…" />
                </Field>
                <Field label="Hero Görsel (16:9)" error={formErrors.heroImageUrl}>
                  <Input value={form.heroImageUrl} onChange={(e) => setForm((f) => ({ ...f, heroImageUrl: e.target.value }))} placeholder="https://…" />
                </Field>
                <Field label="Dikey Önizleme (9:16)" error={formErrors.verticalPreviewUrl}>
                  <Input value={form.verticalPreviewUrl} onChange={(e) => setForm((f) => ({ ...f, verticalPreviewUrl: e.target.value }))} placeholder="https://…" />
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
                        onClick={() => setFormCats((prev) => (selected ? prev.filter((s) => s !== c.slug) : [...prev, c.slug]))}
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
              <div className="mt-6 flex justify-end">
                <Button type="submit" loading={saving}>Kaydet</Button>
              </div>
            </form>
          </Card>
        )}

        {/* --- Bölümler sekmesi --- */}
        {tab === "episodes" && (
          <div className="mt-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[var(--pg-text-dim)]">
                {detail.kind === "SERIES"
                  ? "Sezon ve bölümleri yönet; bölümü yayınla ya da yayından kaldır."
                  : "Bu yapımda bölümler sezon 1 altında tutulur."}
              </p>
              <div className="flex gap-2">
                <Button small variant="subtle" onClick={() => { setSeasonForm({ seasonNumber: String(detail.seasons.length + 1), titleTr: "" }); setSeasonModalOpen(true); }}>
                  + Sezon
                </Button>
                <Button small onClick={() => setEpisodeModal({ mode: "create", seasonNumber: detail.seasons[0]?.seasonNumber ?? 1 })}>
                  + Bölüm
                </Button>
              </div>
            </div>

            {detail.seasons.length === 0 && (
              <Card><EmptyState message="Henüz sezon yok. Bir sezon oluşturup bölüm ekleyin." /></Card>
            )}

            {detail.seasons.map((season) => (
              <Card key={season.id} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--pg-border)] px-4 py-3">
                  <h3 className="text-sm font-semibold">
                    Sezon {season.seasonNumber}
                    {season.titleTr ? ` — ${season.titleTr}` : ""}
                    <span className="ml-2 text-xs font-normal text-[var(--pg-text-faint)]">{season.episodes.length} bölüm</span>
                  </h3>
                </div>
                {season.episodes.length === 0 ? (
                  <EmptyState message="Bu sezonda bölüm yok." />
                ) : (
                  <div className="divide-y divide-[var(--pg-border)]">
                    {season.episodes.map((episode) => (
                      <div key={episode.id} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              <span className="num rounded-[2px] bg-[var(--pg-surface-2)] px-1.5 py-0.5 text-xs">{episode.episodeNumber}</span>
                              {episode.titleTr}
                              <StatusBadge status={episode.status} />
                              <Badge tone={episode.accessType === "FREE" ? "green" : episode.accessType === "SUBSCRIPTION" ? "blue" : "accent"}>
                                {episode.accessType === "FREE" ? "Ücretsiz" : episode.accessType === "SUBSCRIPTION" ? "Abonelik" : `${episode.creditCost ?? "?"} kredi`}
                              </Badge>
                            </p>
                            <p className="mt-1 text-xs text-[var(--pg-text-faint)]">
                              {Math.floor(episode.durationSeconds / 60)} dk {episode.durationSeconds % 60} sn
                              {episode.publishedAt ? ` · yayın: ${formatDateTime(episode.publishedAt)}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Button small variant="subtle" onClick={() => setEpisodeModal({ mode: "edit", episode, seasonNumber: episode.seasonNumber })}>
                              Düzenle
                            </Button>
                            {(EPISODE_TRANSITIONS[episode.status] ?? []).map((next) => (
                              <Button
                                key={next}
                                small
                                variant={next === "PUBLISHED" ? "success" : next === "ARCHIVED" ? "ghost" : "subtle"}
                                disabled={busyEp === episode.id}
                                onClick={() => void changeEpisodeStatus(episode, next)}
                              >
                                {EPISODE_STATUS_LABEL[next]}
                              </Button>
                            ))}
                            {episode.status !== "PUBLISHED" && (
                              <Button small variant="danger" onClick={() => setDeleteEp(episode)}>
                                Sil
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Medya durumu */}
                        <div className="mt-3 rounded-[3px] border border-[var(--pg-border)] bg-[var(--pg-surface-2)] p-3" data-media-state={episode.media[0]?.state ?? "NONE"}>
                          {episode.media.length === 0 ? (
                            <div className="flex flex-wrap items-center gap-3">
                              <p className="text-xs text-[var(--pg-text-dim)]">Video yüklenmemiş.</p>
                              <label className="cursor-pointer rounded-[3px] border border-[var(--pg-border)] px-2.5 py-1.5 text-xs hover:border-[var(--pg-border-strong)]">
                                Video seç…
                                <input
                                  type="file"
                                  className="hidden"
                                  accept="video/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) void onFileSelected(episode, file);
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {episode.media.slice(0, 2).map((media) => (
                                <div key={media.id} className="flex flex-wrap items-center gap-3 text-xs">
                                  <StatusBadge status={media.state} />
                                  <span className="truncate text-[var(--pg-text-dim)]">{media.originalName ?? media.providerAssetId}</span>
                                  {media.sizeBytes != null && <span className="num text-[var(--pg-text-faint)]">{(media.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>}
                                  {media.durationSeconds != null && <span className="num text-[var(--pg-text-faint)]">{Math.round(media.durationSeconds)} sn</span>}
                                  {media.errorMessage && <span className="text-[var(--pg-red)]">{media.errorMessage}</span>}
                                  {media.state === "PROCESSING" && <Spinner size={12} />}
                                  <div className="ml-auto flex gap-1.5">
                                    {media.state === "PROCESSING" && (
                                      <Button small variant="subtle" onClick={() => void syncMedia(media.id)}>Eşitle</Button>
                                    )}
                                    {media.state === "READY" && (
                                      <Button small variant="success" loading={previewLoading} onClick={() => void openPreview(episode)}>
                                        Önizle
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {uploadState?.episodeId === episode.id && (
                            <div className="mt-2">
                              <div className="mb-1 flex justify-between text-xs text-[var(--pg-text-dim)]">
                                <span>{uploadState.stage}</span>
                                <span className="num">{uploadState.pct}%</span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded bg-[var(--pg-border)]">
                                <div className="h-full bg-[var(--pg-accent)] transition-all" style={{ width: `${uploadState.pct}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Sezon modalı */}
        <Modal open={seasonModalOpen} onClose={() => setSeasonModalOpen(false)} title="Yeni Sezon">
          <form onSubmit={submitSeason} noValidate>
            <div className="grid grid-cols-3 gap-3">
              <Field label="No" required error={seasonError ?? undefined}>
                <Input type="number" min={1} max={100} value={seasonForm.seasonNumber} onChange={(e) => setSeasonForm((f) => ({ ...f, seasonNumber: e.target.value }))} />
              </Field>
              <div className="col-span-2 self-end">
                <Field label="Sezon Başlığı (TR)">
                  <Input value={seasonForm.titleTr} onChange={(e) => setSeasonForm((f) => ({ ...f, titleTr: e.target.value }))} placeholder="Sezon 1" />
                </Field>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSeasonModalOpen(false)}>Vazgeç</Button>
              <Button type="submit" loading={creatingSeason}>Oluştur</Button>
            </div>
          </form>
        </Modal>

        {/* Bölüm ekle/düzenle modalı */}
        {episodeModal && (
          <EpisodeModal
            key={episodeModal.mode + (episodeModal.episode?.id ?? "new")}
            titleId={id}
            mode={episodeModal.mode}
            episode={episodeModal.episode}
            defaultSeason={episodeModal.seasonNumber}
            seasons={detail.seasons.map((s) => ({ number: s.seasonNumber, id: s.id }))}
            onClose={() => setEpisodeModal(null)}
            onSaved={async () => {
              setEpisodeModal(null);
              await load();
            }}
          />
        )}

        {/* Silme onayı */}
        <ConfirmDialog
          open={deleteEp !== null}
          title="Bölümü sil"
          message={
            <>
              <strong>{deleteEp?.titleTr}</strong> bölümü kalıcı olarak silinecek. İzleme veya açma kaydı olan
              bölümler sunucu tarafından reddedilir.
            </>
          }
          confirmLabel="Sil"
          danger
          loading={deleting}
          onConfirm={() => void confirmDeleteEpisode()}
          onCancel={() => setDeleteEp(null)}
        />

        {/* Önizleme */}
        <Modal open={preview !== null} onClose={() => setPreview(null)} title={`Önizleme — ${preview?.title ?? ""}`} wide>
          {preview && (
            <div>
              <video src={preview.url} controls autoPlay className="max-h-[60vh] w-full rounded-[3px] bg-black" />
              <p className="mt-3 text-xs text-[var(--pg-text-faint)]">
                İmzalı önizleme oturumu {formatDateTime(preview.expiresAt)} tarihine kadar geçerlidir. Taslak
                bölümler yalnızca yönetim önizlemesinde oynar; herkese açık oynatma yayına alma sonrası açılır.
              </p>
            </div>
          )}
        </Modal>

        {isAdmin && tab === "info" && (
          <p className="mt-3 text-xs text-[var(--pg-text-faint)]">
            Not: kritik finansal işlemler (plan/paket fiyatı, kullanıcı rolü) Gelir Modeli ve Kullanıcılar
            sayfalarında adım-yukarı doğrulamasıyla yapılır.
          </p>
        )}
      </div>
    </AppShell>
  );
}

// --- Bölüm modalı -------------------------------------------------------------

function EpisodeModal({
  titleId,
  mode,
  episode,
  defaultSeason,
  seasons,
  onClose,
  onSaved,
}: {
  titleId: string;
  mode: "create" | "edit";
  episode?: EpisodeRow;
  defaultSeason: number;
  seasons: Array<{ number: number; id: string }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { push } = useToast();
  const [form, setForm] = useState({
    seasonNumber: String(episode?.seasonNumber ?? defaultSeason),
    episodeNumber: String(episode?.episodeNumber ?? (defaultSeason > 0 ? 1 : 1)),
    titleTr: episode?.titleTr ?? "",
    titleEn: episode?.titleEn ?? "",
    synopsisTr: episode?.synopsisTr ?? "",
    synopsisEn: episode?.synopsisEn ?? "",
    durationSeconds: String(episode?.durationSeconds ?? ""),
    accessType: episode?.accessType ?? "FREE",
    creditCost: String(episode?.creditCost ?? ""),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    const seasonNumber = Number(form.seasonNumber);
    const episodeNumber = Number(form.episodeNumber);
    const duration = Number(form.durationSeconds);
    const creditCost = form.creditCost ? Number(form.creditCost) : null;

    // İstemci validasyonu (sunucu Zod ile yeniden denetler — tek doğruluk
    // kaynağı sunucudur; burası kullanıcı deneyimi içindir).
    const local: Record<string, string> = {};
    if (!Number.isInteger(seasonNumber) || seasonNumber < 1) local.seasonNumber = "Geçerli sezon no girin";
    if (!Number.isInteger(episodeNumber) || episodeNumber < 1) local.episodeNumber = "Geçerli bölüm no girin";
    if (!form.titleTr.trim()) local.titleTr = "Başlık zorunludur";
    if (!form.titleEn.trim()) local.titleEn = "Başlık zorunludur";
    if (!Number.isInteger(duration) || duration < 1) local.durationSeconds = "Süre (sn) zorunludur";
    if (form.accessType === "CREDIT" && (!creditCost || creditCost < 1)) {
      local.creditCost = "Kredi erişiminde kredi fiyatı > 0 olmalıdır";
    }
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }

    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        seasonNumber,
        episodeNumber,
        titleTr: form.titleTr.trim(),
        titleEn: form.titleEn.trim(),
        durationSeconds: duration,
        accessType: form.accessType,
      };
      // creditCost yalnızca CREDIT'te gönderilir (sözleşme: optional, null değil).
      if (form.accessType === "CREDIT") body.creditCost = creditCost;
      if (form.synopsisTr.trim()) body.synopsisTr = form.synopsisTr.trim();
      if (form.synopsisEn.trim()) body.synopsisEn = form.synopsisEn.trim();

      if (mode === "create") {
        await api.post(`/admin/titles/${titleId}/episodes`, body);
        push("success", "Bölüm oluşturuldu (taslak)");
      } else if (episode) {
        await api.patch(`/admin/episodes/${episode.id}`, body);
        push("success", "Bölüm güncellendi");
      }
      await onSaved();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length > 0) setErrors(fe);
      else push("error", err instanceof ApiError ? err.message : "Kaydedilemedi");
    } finally {
      setBusy(false);
    }
  };

  const hasSeasons = seasons.length > 0;

  return (
    <Modal open onClose={onClose} title={mode === "create" ? "Yeni Bölüm" : "Bölümü Düzenle"} wide>
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Sezon" required error={errors.seasonNumber} hint={hasSeasons ? undefined : "Önce bir sezon oluşturmalısınız"}>
            <Select value={form.seasonNumber} onChange={(e) => setForm((f) => ({ ...f, seasonNumber: e.target.value }))} disabled={!hasSeasons}>
              {hasSeasons ? (
                seasons.map((s) => (
                  <option key={s.id} value={s.number}>Sezon {s.number}</option>
                ))
              ) : (
                <option value="">— sezon yok —</option>
              )}
            </Select>
          </Field>
          <Field label="Bölüm No" required error={errors.episodeNumber}>
            <Input type="number" min={1} max={2000} value={form.episodeNumber} onChange={(e) => setForm((f) => ({ ...f, episodeNumber: e.target.value }))} />
          </Field>
          <Field label="Başlık (TR)" required error={errors.titleTr}>
            <Input value={form.titleTr} onChange={(e) => setForm((f) => ({ ...f, titleTr: e.target.value }))} />
          </Field>
          <Field label="Başlık (EN)" required error={errors.titleEn}>
            <Input value={form.titleEn} onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))} />
          </Field>
          <Field label="Açıklama (TR)">
            <Textarea value={form.synopsisTr} onChange={(e) => setForm((f) => ({ ...f, synopsisTr: e.target.value }))} />
          </Field>
          <Field label="Açıklama (EN)">
            <Textarea value={form.synopsisEn} onChange={(e) => setForm((f) => ({ ...f, synopsisEn: e.target.value }))} />
          </Field>
          <Field label="Süre (sn)" required error={errors.durationSeconds}>
            <Input type="number" min={1} max={36000} value={form.durationSeconds} onChange={(e) => setForm((f) => ({ ...f, durationSeconds: e.target.value }))} />
          </Field>
          <Field label="Erişim Modeli" required>
            <Select value={form.accessType} onChange={(e) => setForm((f) => ({ ...f, accessType: e.target.value as "FREE" | "SUBSCRIPTION" | "CREDIT" }))}>
              <option value="FREE">Ücretsiz</option>
              <option value="SUBSCRIPTION">Abonelik gerekir</option>
              <option value="CREDIT">Krediyle açılır</option>
            </Select>
          </Field>
          {form.accessType === "CREDIT" && (
            <Field label="Kredi Fiyatı" required error={errors.creditCost}>
              <Input type="number" min={1} max={10000} value={form.creditCost} onChange={(e) => setForm((f) => ({ ...f, creditCost: e.target.value }))} placeholder="25" />
            </Field>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" loading={busy} disabled={!hasSeasons}>
            {mode === "create" ? "Oluştur" : "Kaydet"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
