/**
 * Sayfalama yardımcıları: contracts pageMetaSchema ile birebir meta üretimi.
 */
import type { PageMeta } from '@perdego/contracts';

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export function buildPageMeta(
  page: number,
  pageSize: number,
  totalItems: number,
): PageMeta {
  const totalPages = Math.ceil(totalItems / pageSize);
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
  };
}

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
  totalItems: number,
): Paginated<T> {
  return { items, meta: buildPageMeta(page, pageSize, totalItems) };
}

export const prismaSkipTake = (page: number, pageSize: number) => ({
  skip: (page - 1) * pageSize,
  take: pageSize,
});
