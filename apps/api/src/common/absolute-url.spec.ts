import { describe, expect, it } from 'vitest';
import { absoluteUrl } from './absolute-url';

describe('absoluteUrl', () => {
  const base = 'http://localhost:3000';

  it('göreli yolu mutlak URL yapar', () => {
    expect(absoluteUrl(base, '/placeholders/poster/x.svg')).toBe(
      'http://localhost:3000/placeholders/poster/x.svg',
    );
  });

  it('kesme işareti olmadan gelen yolu slash ile birleştirir', () => {
    expect(absoluteUrl(base, 'img/a.svg')).toBe('http://localhost:3000/img/a.svg');
  });

  it('mutlak URL\u2019i olduğu gibi bırakır', () => {
    expect(absoluteUrl(base, 'https://cdn.example.com/a.m3u8')).toBe(
      'https://cdn.example.com/a.m3u8',
    );
  });

  it('null değeri null olarak korur', () => {
    expect(absoluteUrl(base, null)).toBeNull();
  });

  it('undefined değeri undefined olarak korur', () => {
    expect(absoluteUrl(base, undefined)).toBeUndefined();
  });
});
