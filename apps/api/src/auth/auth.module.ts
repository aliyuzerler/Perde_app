/**
 * Kimlik doğrulama modülü: JwtService RS256 anahtarlarını env'den alır;
 * AuthService refresh TTL'i env'den okur. JwtAuthGuard/RolesGuard global
 * olarak AppModule'da sağlanır (kaynak: bu modülün ihracı).
 */
import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/env.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtService } from './jwt.service';
import { EmailTokenService } from './email-token.service';
import { RateLimiterService } from './rate-limit.service';
import { JwtAuthGuard, RolesGuard } from './guards';

@Global()
@Module({
  providers: [
    {
      provide: JwtService,
      useFactory: (env: {
        JWT_ACCESS_PRIVATE_KEY?: string;
        JWT_ACCESS_PUBLIC_KEY?: string;
        ACCESS_TOKEN_TTL_SECONDS: number;
        REFRESH_TOKEN_TTL_DAYS: number;
      }) =>
        new JwtService({
          envPrivateKeyPem: env.JWT_ACCESS_PRIVATE_KEY
            ? Buffer.from(env.JWT_ACCESS_PRIVATE_KEY, 'base64').toString('utf8')
            : undefined,
          envPublicKeyPem: env.JWT_ACCESS_PUBLIC_KEY
            ? Buffer.from(env.JWT_ACCESS_PUBLIC_KEY, 'base64').toString('utf8')
            : undefined,
          ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
        }),
      inject: [ENV],
    },
    AuthService,
    EmailTokenService,
    RateLimiterService,
    JwtAuthGuard,
    RolesGuard,
  ],
  controllers: [AuthController],
  exports: [JwtService, AuthService, EmailTokenService, RateLimiterService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
