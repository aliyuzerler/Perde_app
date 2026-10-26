"use client";

/**
 * PerdeGo Admin — Ana Sayfa Düzeni (modül 2, FAZ 8).
 *
 * Banner yönetimi (öne çıkan yapım / hero) + küratörlü raylar ve kategori
 * ızgaraları; sıra (sortOrder) ve aktiflik ana sayfada anında etkilidir.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api, fieldErrors } from "@/lib/api";
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
  Table,
  Td,
  Th,
  useToast,
} from "@/components/ui";

interface Banner {
  id: string;
  slug: string;
  titleTr: string;
  titleEn: string;
  subtitleTr: string | null;
  subtitleEn: string | null;
  imageUrl: string;
  targetContentId: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface SectionItem {
  itemId: string;
  contentId: string;
  slug: string;
  title: string;
  status?: string;
}

interface Section {
  id: string;
  key: string;
  sectionType: "HERO" | "RAIL" | "CATEGORY_GRID";
  titleTr: string;
  titleEn: string;
  categorySlug: string | null;
  contentLimit: number;
  sortOrder: number;
  isActive: boolean;
  items: SectionItem[];
}

interface TitleOption {
  contentId: string;
  slug: string;
  title: string;
}

export default function HomeLayoutPage() {
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [titles, setTitles] = useState<TitleOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, s, t] = await Promise.all([
        api.get<{ items: Banner[] }>("/admin/banners"),
        api.get<{ items: Section[] }>("/admin/home-sections"),
        api.get<{ items: TitleOption[] }>("/admin/titles?page=1&pageSize=50"),
      ]);
      setBanners(b.items);
      setSections(s.items);
      setTitles(t.items);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Yüklenemedi");
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

  if (loadError) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-2xl border-l-4 border-l-[var(--pg-red)] p-4 text-sm text-[var(--pg-red)]">{loadError}</Card>
      </AppShell>
    );
  }
  if (!banners || !sections) {
    return (
      <AppShell>
        <Loading label="Ana sayfa düzeni yükleniyor…" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-8">
        <div>
          <h1 className="text-lg font-semibold">Ana Sayfa Düzeni</h1>
          <p className="mt-0.5 text-sm text-[var(--pg-text-dim)]">
            Öne çıkan yapım bannerları, küratörlü raylar ve kategori ızgaraları; sıra numarası mobil ana sayfada
            görünürlüğü belirler.
          </p>
        </div>

        <BannerSection banners={banners} titles={titles} onChanged={load} />
        <SectionSections sections={sections} titles={titles} onChanged={load} />
      </div>
    </AppShell>
  );
}

// --- Bannerlar -----------------------------------------------------------------

function BannerSection({ banners, titles, onChanged }: { banners: Banner[]; titles: TitleOption[]; onChanged: () => Promise<void> }) {
  const { push } = useToast();
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; banner: Banner } | null>(null);

  const toggleActive = async (banner: Banner) => {
    try {
      await api.patch(`/admin/banners/${banner.id}`, { isActive: !banner.isActive });
      await onChanged();
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Güncellenemedi");
    }
  };

  const remove = async (banner: Banner) => {
    if (!window.confirm(`"${banner.titleTr}" bannerı silinecek. Onaylıyor musunuz?`)) return;
    try {
      await api.del(`/admin/banners/${banner.id}`);
      push("success", "Banner silindi");
      await onChanged();
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Silinemedi");
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--pg-text-dim)]">Bannerlar (öne çıkan)</h2>
          <p className="mt-0.5 text-xs text-[var(--pg-text-faint)]">Mobil ana sayfa hero alanı; sıra ve aktiflik buradan yönetilir.</p>
        </div>
        <Button small onClick={() => setModal({ mode: "create" })}>+ Banner</Button>
      </div>
      {banners.length === 0 ? (
        <EmptyState message="Banner yok." />
      ) : (
        <Table
          head={
            <>
              <Th>Sıra</Th>
              <Th>Banner</Th>
              <Th>Hedef</Th>
              <Th>Durum</Th>
              <Th className="text-right">İşlemler</Th>
            </>
          }
        >
          {banners.map((banner) => (
            <tr key={banner.id} className="row-hover">
              <Td className="num">{banner.sortOrder}</Td>
              <Td>
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={banner.imageUrl} alt="" className="h-10 w-16 rounded-[2px] bg-[var(--pg-surface-2)] object-cover" loading="lazy" />
                  <div>
                    <p className="font-medium">{banner.titleTr}</p>
                    <p className="font-mono text-xs text-[var(--pg-text-faint)]">{banner.slug}</p>
                  </div>
                </div>
              </Td>
              <Td className="font-mono text-xs text-[var(--pg-text-dim)]">
                {titles.find((t) => t.contentId === banner.targetContentId)?.title ?? banner.targetContentId ?? "—"}
              </Td>
              <Td>
                <button onClick={() => void toggleActive(banner)} title="Aktifliği değiştir">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${banner.isActive ? "bg-[var(--pg-green)]" : "bg-[var(--pg-text-faint)]"}`} aria-hidden />
                  <span className="ml-2 text-xs text-[var(--pg-text-dim)]">{banner.isActive ? "Aktif" : "Pasif"}</span>
                </button>
              </Td>
              <Td>
                <div className="flex justify-end gap-1.5">
                  <Button small variant="subtle" onClick={() => setModal({ mode: "edit", banner })}>Düzenle</Button>
                  <Button small variant="danger" onClick={() => void remove(banner)}>Sil</Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {modal && (
        <BannerModal
          mode={modal.mode}
          banner={modal.mode === "edit" ? modal.banner : undefined}
          titles={titles}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await onChanged();
          }}
        />
      )}
    </Card>
  );
}

function BannerModal({
  mode,
  banner,
  titles,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  banner?: Banner;
  titles: TitleOption[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { push } = useToast();
  const [form, setForm] = useState({
    slug: banner?.slug ?? "",
    titleTr: banner?.titleTr ?? "",
    titleEn: banner?.titleEn ?? "",
    subtitleTr: banner?.subtitleTr ?? "",
    imageUrl: banner?.imageUrl ?? "",
    targetContentId: banner?.targetContentId ?? "",
    sortOrder: String(banner?.sortOrder ?? 0),
    isActive: banner?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        titleTr: form.titleTr.trim(),
        titleEn: form.titleEn.trim(),
        imageUrl: form.imageUrl.trim(),
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      if (form.subtitleTr.trim()) body.subtitleTr = form.subtitleTr.trim();
      if (form.targetContentId) body.targetContentId = form.targetContentId;
      if (mode === "create") {
        body.slug = form.slug.trim();
        await api.post("/admin/banners", body);
        push("success", "Banner oluşturuldu");
      } else if (banner) {
        await api.patch(`/admin/banners/${banner.id}`, body);
        push("success", "Banner güncellendi");
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

  return (
    <Modal open onClose={onClose} title={mode === "create" ? "Yeni Banner" : "Bannerı Düzenle"} wide>
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {mode === "create" && (
            <Field label="Slug" required error={errors.slug}>
              <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="hero-yeni-sezon" />
            </Field>
          )}
          <Field label="Başlık (TR)" required error={errors.titleTr}>
            <Input value={form.titleTr} onChange={(e) => setForm((f) => ({ ...f, titleTr: e.target.value }))} />
          </Field>
          <Field label="Başlık (EN)" required error={errors.titleEn}>
            <Input value={form.titleEn} onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))} />
          </Field>
          <Field label="Alt Başlık (TR)">
            <Input value={form.subtitleTr} onChange={(e) => setForm((f) => ({ ...f, subtitleTr: e.target.value }))} />
          </Field>
          <Field label="Görsel URL" required error={errors.imageUrl}>
            <Input value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" />
          </Field>
          <Field label="Hedef Yapım">
            <Select value={form.targetContentId} onChange={(e) => setForm((f) => ({ ...f, targetContentId: e.target.value }))}>
              <option value="">— yok —</option>
              {titles.map((t) => (
                <option key={t.contentId} value={t.contentId}>{t.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Sıra" required hint="Küçük değer önce gösterilir">
            <Input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
          </Field>
          <Field label="Durum">
            <Select value={form.isActive ? "1" : "0"} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.value === "1" }))}>
              <option value="1">Aktif</option>
              <option value="0">Pasif</option>
            </Select>
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" loading={busy}>Kaydet</Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Ana sayfa bölümleri ---------------------------------------------------------

function SectionSections({ sections, titles, onChanged }: { sections: Section[]; titles: TitleOption[]; onChanged: () => Promise<void> }) {
  const { push } = useToast();
  const [editSection, setEditSection] = useState<Section | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [addItemTo, setAddItemTo] = useState<Section | null>(null);

  const setOrder = async (section: Section, sortOrder: number) => {
    try {
      await api.patch(`/admin/home-sections/${section.id}`, { sortOrder });
      await onChanged();
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Sıra güncellenemedi");
    }
  };

  const toggleActive = async (section: Section) => {
    try {
      await api.patch(`/admin/home-sections/${section.id}`, { isActive: !section.isActive });
      await onChanged();
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Güncellenemedi");
    }
  };

  const removeItem = async (section: Section, item: SectionItem) => {
    if (!window.confirm(`"${item.title}" bölümden çıkarılacak. Onaylıyor musunuz?`)) return;
    try {
      await api.del(`/admin/home-sections/${section.id}/items/${item.itemId}`);
      push("success", "İçerik bölümden çıkarıldı");
      await onChanged();
    } catch (err) {
      push("error", err instanceof ApiError ? err.message : "Çıkarılamadı");
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--pg-text-dim)]">Ana Sayfa Bölümleri</h2>
          <p className="mt-0.5 text-xs text-[var(--pg-text-faint)]">HERO / RAIL / CATEGORY_GRID — mobil Keşfet akışını oluşturur.</p>
        </div>
        <Button small onClick={() => setCreateOpen(true)}>+ Bölüm</Button>
      </div>
      {sections.length === 0 ? (
        <EmptyState message="Bölüm yok." />
      ) : (
        <div className="divide-y divide-[var(--pg-border)]">
          {sections.map((section) => (
            <div key={section.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="num rounded-[2px] bg-[var(--pg-surface-2)] px-1.5 py-0.5 text-xs">{section.sortOrder}</span>
                    {section.titleTr}
                    <span className="rounded-[2px] bg-[var(--pg-accent-soft)] px-2 py-0.5 text-[11px] font-semibold uppercase text-[var(--pg-accent-hover)]">
                      {section.sectionType}
                    </span>
                    <button onClick={() => void toggleActive(section)} className="text-xs" title="Aktifliği değiştir">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${section.isActive ? "bg-[var(--pg-green)]" : "bg-[var(--pg-text-faint)]"}`} aria-hidden />
                      <span className="ml-1 text-[var(--pg-text-dim)]">{section.isActive ? "Aktif" : "Pasif"}</span>
                    </button>
                  </p>
                  <p className="mt-1 font-mono text-xs text-[var(--pg-text-faint)]">
                    {section.key}
                    {section.categorySlug ? ` · kategori: ${section.categorySlug}` : ""} · limit {section.contentLimit}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <label className="flex items-center gap-1 text-xs text-[var(--pg-text-faint)]">
                    Sıra
                    <input
                      type="number"
                      min={0}
                      defaultValue={section.sortOrder}
                      onBlur={(e) => {
                        const next = Number(e.target.value);
                        if (next !== section.sortOrder) void setOrder(section, next);
                      }}
                      className="num w-16 rounded-[2px] border border-[var(--pg-border)] bg-[var(--pg-surface-2)] px-1.5 py-1 text-xs"
                      aria-label={`${section.titleTr} sırası`}
                    />
                  </label>
                  {section.sectionType !== "CATEGORY_GRID" && (
                    <Button small variant="subtle" onClick={() => setAddItemTo(section)}>+ İçerik</Button>
                  )}
                  <Button small variant="subtle" onClick={() => setEditSection(section)}>Düzenle</Button>
                </div>
              </div>
              {section.sectionType !== "CATEGORY_GRID" && section.items.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {section.items.map((item) => (
                    <div key={item.contentId} className="flex items-center gap-2 rounded-[3px] border border-[var(--pg-border)] bg-[var(--pg-surface-2)] px-2.5 py-1.5 text-xs">
                      <span>{item.title}</span>
                      <button
                        onClick={() => void removeItem(section, item)}
                        className="text-[var(--pg-text-faint)] hover:text-[var(--pg-red)]"
                        title="Listeden çıkar"
                        aria-label={`${item.title} çıkar`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {section.sectionType === "CATEGORY_GRID" && (
                <p className="mt-2 text-xs text-[var(--pg-text-faint)]">Kategori ızgarası: içerikler kategoriden otomatik gelir (manuel item eklenmez).</p>
              )}
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <SectionModal
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={async () => {
            setCreateOpen(false);
            await onChanged();
          }}
        />
      )}
      {editSection && (
        <SectionModal
          mode="edit"
          section={editSection}
          onClose={() => setEditSection(null)}
          onSaved={async () => {
            setEditSection(null);
            await onChanged();
          }}
        />
      )}
      {addItemTo && (
        <AddItemModal
          section={addItemTo}
          titles={titles}
          onClose={() => setAddItemTo(null)}
          onSaved={async () => {
            setAddItemTo(null);
            await onChanged();
          }}
        />
      )}
    </Card>
  );
}

function SectionModal({
  mode,
  section,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  section?: Section;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { push } = useToast();
  const [form, setForm] = useState({
    key: section?.key ?? "",
    sectionType: section?.sectionType ?? "RAIL",
    titleTr: section?.titleTr ?? "",
    titleEn: section?.titleEn ?? "",
    contentLimit: String(section?.contentLimit ?? 10),
    sortOrder: String(section?.sortOrder ?? 0),
    isActive: section?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        sectionType: form.sectionType,
        titleTr: form.titleTr.trim(),
        titleEn: form.titleEn.trim(),
        contentLimit: Number(form.contentLimit) || 10,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      if (mode === "create") {
        body.key = form.key.trim();
        await api.post("/admin/home-sections", body);
        push("success", "Bölüm oluşturuldu");
      } else if (section) {
        await api.patch(`/admin/home-sections/${section.id}`, body);
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

  return (
    <Modal open onClose={onClose} title={mode === "create" ? "Yeni Ana Sayfa Bölümü" : "Bölümü Düzenle"}>
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {mode === "create" && (
            <Field label="Anahtar" required error={errors.key} hint="benzersiz: örn. yerli-diziler">
              <Input value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
            </Field>
          )}
          <Field label="Tip" required>
            <Select value={form.sectionType} onChange={(e) => setForm((f) => ({ ...f, sectionType: e.target.value as "HERO" | "RAIL" | "CATEGORY_GRID" }))}>
              <option value="HERO">HERO</option>
              <option value="RAIL">RAIL (yatay ray)</option>
              <option value="CATEGORY_GRID">CATEGORY_GRID</option>
            </Select>
          </Field>
          <Field label="Başlık (TR)" required error={errors.titleTr}>
            <Input value={form.titleTr} onChange={(e) => setForm((f) => ({ ...f, titleTr: e.target.value }))} />
          </Field>
          <Field label="Başlık (EN)" required error={errors.titleEn}>
            <Input value={form.titleEn} onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))} />
          </Field>
          <Field label="İçerik Limiti" hint="1–20">
            <Input type="number" min={1} max={20} value={form.contentLimit} onChange={(e) => setForm((f) => ({ ...f, contentLimit: e.target.value }))} />
          </Field>
          <Field label="Sıra">
            <Input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" loading={busy}>Kaydet</Button>
        </div>
      </form>
    </Modal>
  );
}

function AddItemModal({
  section,
  titles,
  onClose,
  onSaved,
}: {
  section: Section;
  titles: TitleOption[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { push } = useToast();
  const [contentId, setContentId] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!contentId) return;
    setBusy(true);
    try {
      await api.post(`/admin/home-sections/${section.id}/items`, { contentId });
      push("success", "İçerik bölüme eklendi");
      await onSaved();
    } catch (err) {
      push("error", err instanceof ApiError ? (err.code === "CONFLICT" ? "Bu içerik zaten bölümdе" : err.message) : "Eklenemedi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`İçerik ekle — ${section.titleTr}`}>
      <Field label="Yapım" required>
        <Select value={contentId} onChange={(e) => setContentId(e.target.value)}>
          <option value="">— seçin —</option>
          {titles.map((t) => (
            <option key={t.contentId} value={t.contentId}>{t.title}</option>
          ))}
        </Select>
      </Field>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
        <Button onClick={() => void submit()} loading={busy} disabled={!contentId}>Ekle</Button>
      </div>
    </Modal>
  );
}
