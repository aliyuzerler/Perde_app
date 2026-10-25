import { describe, expect, it } from 'vitest';
import { buildPageMeta, paginate, prismaSkipTake } from './pagination';

describe('buildPageMeta', () => {
  it('toplam sayfa ve hasNextPage hesaplar', () => {
    const meta = buildPageMeta(2, 20, 45);
    expect(meta).toEqual({
      page: 2,
      pageSize: 20,
      totalItems: 45,
      totalPages: 3,
      hasNextPage: true,
    });
  });

  it('son sayfada hasNextPage false olur', () => {
    expect(buildPageMeta(3, 20, 45).hasNextPage).toBe(false);
  });

  it('boş listede totalPages 0 olur', () => {
    const meta = buildPageMeta(1, 20, 0);
    expect(meta.totalPages).toBe(0);
    expect(meta.hasNextPage).toBe(false);
  });

  it('tam bölünmede fazladan sayfa üretilmez', () => {
    expect(buildPageMeta(2, 20, 40).totalPages).toBe(2);
  });
});

describe('paginate + prismaSkipTake', () => {
  it('3. sayfa için skip/take üretir', () => {
    expect(prismaSkipTake(3, 10)).toEqual({ skip: 20, take: 10 });
  });

  it('paginate meta ile birlikte döner', () => {
    const result = paginate([1, 2, 3], 1, 10, 3);
    expect(result.items).toEqual([1, 2, 3]);
    expect(result.meta.totalItems).toBe(3);
  });
});
