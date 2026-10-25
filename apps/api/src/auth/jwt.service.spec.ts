import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { JwtService } from './jwt.service';
import { DomainError } from '../common/errors';

function makeService(ttl = 900): JwtService {
  return new JwtService({ ttlSeconds: ttl });
}

describe('JwtService (RS256)', () => {
  it('token üretir ve doğrular', () => {
    const svc = makeService();
    const { token, expiresIn } = svc.signAccessToken({
      sub: 'usr_1',
      role: 'USER',
      sid: 'sess_1',
      locale: 'tr',
    });
    expect(expiresIn).toBe(900);
    const payload = svc.verifyAccessToken(token);
    expect(payload.sub).toBe('usr_1');
    expect(payload.role).toBe('USER');
    expect(payload.sid).toBe('sess_1');
    expect(payload.locale).toBe('tr');
  });

  it('env anahtarları verildiğinde onları kullanır (iki örnek aynı çifti paylaşır)', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pemPriv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const pemPub = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    const svcA = new JwtService({ envPrivateKeyPem: pemPriv, envPublicKeyPem: pemPub, ttlSeconds: 900 });
    const svcB = new JwtService({ envPrivateKeyPem: pemPriv, envPublicKeyPem: pemPub, ttlSeconds: 900 });
    const { token } = svcA.signAccessToken({ sub: 'u', role: 'ADMIN', sid: 's', locale: 'en' });
    expect(svcB.verifyAccessToken(token).role).toBe('ADMIN');
  });

  it('bozulmuş tokenı reddeder (401 TOKEN_INVALID)', () => {
    const svc = makeService();
    const { token } = svc.signAccessToken({ sub: 'u', role: 'USER', sid: 's', locale: 'tr' });
    const tampered = `${token.slice(0, -4)}aaaa`;
    try {
      svc.verifyAccessToken(tampered);
      expect.fail('hata beklenmişti');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((error as any).reason).toBe('TOKEN_INVALID');
    }
  });

  it('süresi dolan tokenı reddeder (401 TOKEN_EXPIRED)', async () => {
    const svc = makeService(1); // 1 saniye
    const { token } = svc.signAccessToken({ sub: 'u', role: 'USER', sid: 's', locale: 'tr' });
    await new Promise((r) => setTimeout(r, 1500));
    try {
      svc.verifyAccessToken(token);
      expect.fail('hata beklenmişti');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((error as any).reason).toBe('TOKEN_EXPIRED');
    }
  });
});
