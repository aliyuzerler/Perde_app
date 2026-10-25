/**
 * Katalog satırı → sözleşme şeması eşleyici.
 *
 * Dil seçimi Accept-Language'a göre; görsel URL'leri mutlak; isNew
 * publishedAt ≤ 30 gün kuralıdır. Tüm liste/detay yanıtları bu eşleyiciyi
 * kullanır (tek kaynak: sürüklenme/yorumsuz alan farkı olmaz).
 */
import type { Content, Episode, Season } from '@prisma/client';
import type {
  CatalogEpisode,
  CatalogSeason,
  ContentSummary,
  TitleDetailResponse,
} from '@perdego/contracts';
import type { Lang } from '../common/request-context';
import { absoluteUrl } from '../common/absolute-url';

const NEW_CONTENT_DAYS = 30;

export interface CatalogContentRow extends Content {
  categories?: Array<{ category: { slug: string; sortOrder: number } }>;
  castMembers?: Array<{
    sortOrder: number;
    castMember: {
      id: string;
      fullName: string;
      role: 'ACTOR' | 'DIRECTOR' | 'WRITER';
      characterName: string | null;
    };
  }>;
}

export function isNewContent(publishedAt: Date | null): boolean {
  if (!publishedAt) return false;
  return Date.now() - publishedAt.getTime() < NEW_CONTENT_DAYS * 24 * 60 * 60 * 1000;
}

/** İki dilli alan: seçilen dil boşsa (null/boş metin) diğer dile düşer. */
function localized(lang: Lang, tr: string | null, en: string | null): string | undefined {
  const preferred = lang === 'en' ? (en || tr) : (tr || en);
  return preferred ?? undefined;
}

export function toContentSummary(
  row: CatalogContentRow,
  lang: Lang,
  baseUrl: string,
): ContentSummary {
  return {
    contentId: row.id,
    slug: row.slug,
    kind: row.kind,
    title: localized(lang, row.titleTr, row.titleEn) ?? row.slug,
    releaseYear: row.releaseYear,
    ageRating: row.ageRating ?? undefined,
    genres: (row.categories ?? [])
      .slice()
      .sort((a, b) => a.category.sortOrder - b.category.sortOrder)
      .map((c) => c.category.slug),
    posterUrl: absoluteUrl(baseUrl, row.posterUrl),
    verticalPreviewUrl: absoluteUrl(baseUrl, row.verticalPreviewUrl),
    accessType: row.accessType,
    isNew: isNewContent(row.publishedAt),
  };
}

export function toCatalogEpisode(
  row: Episode & { content: { ageRating: string | null } },
  lang: Lang,
  baseUrl: string,
  access?: CatalogEpisode['access'],
): CatalogEpisode {
  return {
    id: row.id,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    title: localized(lang, row.titleTr, row.titleEn) ?? `S${row.seasonNumber}B${row.episodeNumber}`,
    synopsis: localized(lang, row.synopsisTr, row.synopsisEn),
    durationSeconds: row.durationSeconds,
    verticalPreviewUrl: absoluteUrl(baseUrl, row.verticalPreviewUrl),
    accessType: row.accessType,
    creditCost: row.creditCost,
    access,
  };
}

/** Sezonları gruplar (catalogSeasonSchema biçiminde). */
export function groupSeasons(
  seasons: Season[],
  episodesBySeason: Map<number, CatalogEpisode[]>,
  lang: Lang,
): CatalogSeason[] {
  return seasons
    .slice()
    .sort((a, b) => a.seasonNumber - b.seasonNumber)
    .map((season) => ({
      id: season.id,
      seasonNumber: season.seasonNumber,
      title: localized(lang, season.titleTr, season.titleEn),
      episodes: episodesBySeason.get(season.seasonNumber) ?? [],
    }));
}

/** Detay yanıtı (contentSchema + accessSeasons). */
export function toTitleDetail(
  row: CatalogContentRow,
  lang: Lang,
  baseUrl: string,
  seasons: Season[],
  accessSeasons: CatalogSeason[],
): TitleDetailResponse {
  const summary = toContentSummary(row, lang, baseUrl);
  return {
    id: row.id,
    ...summary,
    synopsis: localized(lang, row.synopsisTr, row.synopsisEn) ?? '',
    tagline: localized(lang, row.taglineTr, row.taglineEn),
    originalTitle: row.originalTitle ?? undefined,
    durationSeconds: row.durationSeconds ?? undefined,
    heroImageUrl: absoluteUrl(baseUrl, row.heroImageUrl),
    posterUrl: absoluteUrl(baseUrl, row.posterUrl),
    verticalPreviewUrl: absoluteUrl(baseUrl, row.verticalPreviewUrl),
    cast: (row.castMembers ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((cc) => ({
        id: cc.castMember.id,
        fullName: cc.castMember.fullName,
        role: cc.castMember.role,
        characterName: cc.castMember.characterName ?? undefined,
      })),
    seasons: groupSeasons(seasons, new Map(), lang),
    accessSeasons,
  };
}
