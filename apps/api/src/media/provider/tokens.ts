/**
 * Medya modülü enjeksiyon simgeleri — döngüsel importu önlemek için
 * modül dosyasından ayrı tutulur (media.service ↔ media.module çemberi).
 */
export const MEDIA_PROVIDER_PORT = Symbol('MEDIA_PROVIDER_PORT');
