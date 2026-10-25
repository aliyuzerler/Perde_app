/**
 * JWT servisi — RS256 access token üretimi/doğrulaması (SECURITY.md).
 *
 * Anahtar stratejisi:
 *  - Ortamda JWT_ACCESS_PRIVATE_KEY/PUBLIC_KEY (base64 PEM) tanımlıysa onlar
 *    kullanılır (üretim yapılandırması).
 *  - development/test'te tanımlı değilse RSA-2048 çifti süreç ömrü boyunca
 *    üretilir ve uyarı loglanır (yeniden başlatmada tokenlar geçersizleşir —
 *    kabul edilebilir dev davranışı; production'da env zorunludur).
 */
import { Injectable, Logger } from '@nestjs/common';
import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { DomainError } from '../common/errors';

export interface AccessTokenPayload {
  sub: string;
  role: 'USER' | 'EDITOR' | 'ADMIN';
  sid: string;
  locale: 'tr' | 'en';
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtService {
  private readonly logger = new Logger(JwtService.name);
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor(
    private readonly options: {
      envPrivateKeyPem?: string;
      envPublicKeyPem?: string;
      ttlSeconds: number;
    },
  ) {
    if (options.envPrivateKeyPem && options.envPublicKeyPem) {
      this.privateKey = createPrivateKey(options.envPrivateKeyPem);
      this.publicKey = createPublicKey(options.envPublicKeyPem);
      this.logger.log('JWT RS256 anahtarları ortam değişkenlerinden yüklendi');
    } else {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      this.privateKey = privateKey;
      this.publicKey = publicKey;
      this.logger.warn(
        'JWT anahtarları ortamda tanımlı değil — geçici RSA-2048 çifti üretildi. ' +
          'Yeniden başlatmada access tokenlar geçersizleşir; production için JWT_ACCESS_*_KEY tanımlayın.',
      );
    }
  }

  get ttlSeconds(): number {
    return this.options.ttlSeconds;
  }

  signAccessToken(payload: Omit<AccessTokenPayload, 'iat' | 'exp'>): { token: string; expiresIn: number } {
    const token = jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      expiresIn: this.options.ttlSeconds,
    });
    return { token, expiresIn: this.options.ttlSeconds };
  }

  /** Token doğrulama: geçersiz/süresi dolmuş tokena DomainError fırlatır. */
  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
      });
      if (typeof decoded === 'string') {
        throw new Error('beklenmeyen token biçimi');
      }
      return decoded as AccessTokenPayload;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('expired')) {
        throw DomainError.unauthorized('TOKEN_EXPIRED', 'errors.tokenExpired');
      }
      throw DomainError.unauthorized('TOKEN_INVALID', 'errors.tokenInvalid');
    }
  }
}
