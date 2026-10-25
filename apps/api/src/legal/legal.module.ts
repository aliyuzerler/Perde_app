/**
 * Yasal metin modülü — anonim uçlar: /legal/terms, /legal/privacy, /legal/:slug.
 */
import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';

@Module({
  controllers: [LegalController],
})
export class LegalModule {}
