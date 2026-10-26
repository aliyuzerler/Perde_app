/**
 * Komşu bölüm hesaplaması (FAZ 4) — önceki/sonraki bölüm navigasyonu.
 *
 * Kaynak: içerik detayındaki accessSeasons (sunucu erişim kararlı liste).
 * Sıralama (sezon, bölüm) ile düzleştirilir; yalnızca sunucu tarafında
 * canPlay=true olan bölümler navigasyona dahil edilir (kilitli bölüme
 * atlayıp 402 yanıtı toplamak anlamsızdır).
 *
 * SAF fonksiyonlar — jest testi expo-video olmadan koşar.
 */
import type { CatalogEpisode, CatalogSeason } from '@perdego/contracts';

export interface EpisodeNeighbor {
  episodeId: string;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
}

/** accessSeasons → (sezon, bölüm) sıralı düz liste (yalnız canPlay). */
export function flattenPlayableEpisodes(seasons: readonly CatalogSeason[]): EpisodeNeighbor[] {
  return seasons
    .flatMap((season) =>
      (season.episodes ?? [])
        .filter((episode) => episode.access?.canPlay ?? episode.accessType === 'FREE')
        .map((episode: CatalogEpisode) => ({
          episodeId: episode.id,
          title: episode.title,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
        }))
    )
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
}

export interface EpisodeNeighbors {
  previous: EpisodeNeighbor | null;
  next: EpisodeNeighbor | null;
  index: number;
  total: number;
}

/** Verilen bölümün komşuları — yoksa (null, null). */
export function findEpisodeNeighbors(
  seasons: readonly CatalogSeason[],
  episodeId: string,
): EpisodeNeighbors {
  const list = flattenPlayableEpisodes(seasons);
  const index = list.findIndex((entry) => entry.episodeId === episodeId);
  if (index < 0) {
    return { previous: null, next: null, index: -1, total: list.length };
  }
  return {
    previous: index > 0 ? list[index - 1]! : null,
    next: index < list.length - 1 ? list[index + 1]! : null,
    index,
    total: list.length,
  };
}
