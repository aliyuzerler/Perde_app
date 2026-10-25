/**
 * PerdeGo API kök modülü.
 *
 * Faz 2b: tam alan modeli — 13 iş modülü + Faz 3b: Account, Legal,
 * Mail altyapısı (Env, Prisma, Health).
 */
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EnvModule } from './config/env.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard, RolesGuard } from './auth';
import { API_MODULES } from './modules';

@Module({
  imports: [EnvModule, PrismaModule, HealthModule, ...API_MODULES],
  providers: [
    // Global guard sırası: önce kimlik, sonra rol.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
