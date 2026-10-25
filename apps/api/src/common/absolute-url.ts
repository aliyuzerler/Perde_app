/**
 * URL yardımcıları: placeholder görselleri göreli yol olarak saklanır
 * (örn. "/placeholders/poster/gizli-bahce.svg"); yanıtlarda mutlak URL'ye
 * çevrilir (contracts url() doğrulaması ve istemci gösterimi için).
 */
export function absoluteUrl(baseUrl: string, value: string | null | undefined): string | undefined | null {
  if (!value) return value === null ? null : undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return `${baseUrl.replace(/\/+$/, '')}${value.startsWith('/') ? '' : '/'}${value}`;
}
