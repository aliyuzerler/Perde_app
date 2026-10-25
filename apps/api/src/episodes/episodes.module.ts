import { Global, Module } from '@nestjs/common';
import { AccessService } from './access.service';

/** Erişim kararı servisi birden çok modülde (katalog, media) kullanılır. */
@Global()
@Module({
  providers: [AccessService],
  exports: [AccessService],
})
export class EpisodesModule {}
