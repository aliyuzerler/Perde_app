/**
 * Minimal .env yükleyici (bağımlılıksız).
 *
 * Node 24'ün yerleşik `util.parseEnv` işlevini kullanır. Süreci başlatan
 * komutun çalışma dizininde (.env mevcutsa) yükler; zaten tanımlı ortam
 * değişkenlerinin ÜZERİNE YAZMAZ (process.env önceliklidir — CI/üretimde
 * ortam değişkenleri .env dosyasını ezer).
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export function loadDotenvFile(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  const content = readFileSync(filePath, 'utf8');
  const parsed = parseEnv(content);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}
