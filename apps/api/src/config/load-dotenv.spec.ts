import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDotenvFile } from './load-dotenv';

describe('loadDotenvFile', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it('olmayan dosya için false döner ve süreç değişkenine dokunmaz', () => {
    const before = process.env.PERDEGO_TEST_VAR;
    expect(loadDotenvFile('/olmayan/yol/.env')).toBe(false);
    expect(process.env.PERDEGO_TEST_VAR).toBe(before);
  });

  it('.env değerlerini yükler; mevcut ortam değişkenini EZMEZ', () => {
    dir = mkdtempSync(join(tmpdir(), 'perdego-env-'));
    const file = join(dir, '.env');
    writeFileSync(
      file,
      ['PERDEGO_TEST_VAR=dosyadan', 'PERDEGO_TEST_VAR2=ikinci'].join('\n'),
    );

    process.env.PERDEGO_TEST_VAR = 'ortamdan';

    expect(loadDotenvFile(file)).toBe(true);
    expect(process.env.PERDEGO_TEST_VAR).toBe('ortamdan');
    expect(process.env.PERDEGO_TEST_VAR2).toBe('ikinci');

    delete process.env.PERDEGO_TEST_VAR;
    delete process.env.PERDEGO_TEST_VAR2;
  });
});
