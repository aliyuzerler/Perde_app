/**
 * PerdeGo API kök modülü.
 *
 * Faz 2a (temel altyapı): yalnızca Env + Prisma + Health modülleri.
 * Katalog/users/billing vb. modüller Faz 2b+'da eklenir (Genel Kural 2:
 * faz kapsamı dışında özellik yazılmaz).
 */
import { Module } from '@nestjs/common';
import { EnvModule } from './config/env.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [EnvModule, PrismaModule, HealthModule],
})
export class AppModule {}
