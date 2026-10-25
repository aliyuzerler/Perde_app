/**
 * Medya modülü (FAZ 4): MediaProvider portu + yerel örnek sağlayıcı.
 *
 * Sağlayıcı seçimi MEDIA_PROVIDER ortam değişkeniyle yapılır (Kural D5):
 *  - local        → LocalSampleMediaProvider (geliştirme; telifsiz örnek akışlar)
 *  - bunny/mux/cf → docs/MEDIA_SETUP.md'deki adımlarla uygulanır; bu yapıda
 *    bilinçli olarak UYGULANMAMIŞTIR — başlangıçta anlaşılır hata verilir
 *    (sessiz "local'e düşme" yok: üretimde yanlış sağlayıcı sürprizi olmaz).
 */
import { FactoryProvider, Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { LocalSampleMediaProvider } from './provider/local-sample.provider';
import { MEDIA_PROVIDER_PORT } from './provider/tokens';
import type { MediaProviderPort } from './provider/media-provider.port';
import { ENV } from '../config/env.module';
import type { Env } from '../config/env.schema';

const mediaProviderFactory: FactoryProvider<MediaProviderPort> = {
  provide: MEDIA_PROVIDER_PORT,
  useFactory: (env: Env): MediaProviderPort => {
    switch (env.MEDIA_PROVIDER) {
      case 'local':
        return new LocalSampleMediaProvider(env);
      default:
        throw new Error(
          `[PerdeGo API] MEDIA_PROVIDER=${env.MEDIA_PROVIDER} bu yapıda uygulanmadı. ` +
            'Geliştirme için MEDIA_PROVIDER=local kullanın; canlı sağlayıcı kurulumu için docs/MEDIA_SETUP.md belgesine bakın.',
        );
    }
  },
  inject: [ENV],
};

@Module({
  providers: [LocalSampleMediaProvider, mediaProviderFactory, MediaService],
  controllers: [MediaController],
  exports: [MEDIA_PROVIDER_PORT, LocalSampleMediaProvider, MediaService],
})
export class MediaModule {}
