/**
 * Prisma istemcisi modülü — global: tüm iş modülleri PrismaService'i
 * doğrudan enjekte eder (tek DB erişim kaynağı; ERD.md ilkeleri).
 */
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
