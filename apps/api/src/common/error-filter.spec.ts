import { describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from './error-filter';
import { DomainError } from './errors';

function run(exception: unknown): { status: number; body: unknown } {
  const filter = new AllExceptionsFilter();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const body = (filter as any).toEnvelope(exception, 'trace-1');
  const status = (filter as any).statusOf(exception);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { status, body };
}

describe('AllExceptionsFilter zarf çevirisi', () => {
  it('DomainError → durum + code + reason', () => {
    const { status, body } = run(
      DomainError.paymentRequired('NEEDS_CREDITS', 'errors.needsCredits', { balance: 3 }),
    );
    expect(status).toBe(402);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = body as any;
    expect(b.ok).toBe(false);
    expect(b.error.code).toBe('PAYMENT_REQUIRED');
    expect(b.error.details.reason).toBe('NEEDS_CREDITS');
    expect(b.error.details.balance).toBe(3);
  });

  it('ZodError → 400 VALIDATION_FAILED + fields', () => {
    const zod = new ZodError([
      {
        code: 'too_small',
        minimum: 2,
        origin: 'string',
        inclusive: true,
        path: ['displayName'],
        message: 'Ad en az 2 karakter olmalıdır',
      },
    ]);
    const { status, body } = run(zod);
    expect(status).toBe(400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = body as any;
    expect(b.error.code).toBe('BAD_REQUEST');
    expect(b.error.details.reason).toBe('VALIDATION_FAILED');
    expect(b.error.details.fields[0].path).toBe('displayName');
  });

  it('NotFoundException → 404 NOT_FOUND', () => {
    const { status, body } = run(new NotFoundException());
    expect(status).toBe(404);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((body as any).error.code).toBe('NOT_FOUND');
  });

  it('BadRequestException → 400 BAD_REQUEST', () => {
    const { status, body } = run(new BadRequestException());
    expect(status).toBe(400);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((body as any).error.code).toBe('BAD_REQUEST');
  });

  it('bilinmeyen hata → 500 INTERNAL + traceId (ham hata sızmaz)', () => {
    const { status, body } = run(new Error('gizli db detayı'));
    expect(status).toBe(500);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = body as any;
    expect(b.error.code).toBe('INTERNAL');
    expect(b.error.details.reason).toBe('UNEXPECTED');
    expect(b.error.details.traceId).toBe('trace-1');
    expect(JSON.stringify(b)).not.toContain('gizli db detayı');
  });

  it('DomainError mesajı i18n anahtarıdır (ham mesaj değil)', () => {
    const { body } = run(DomainError.notFound('CONTENT_NOT_FOUND', 'errors.contentNotFound'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((body as any).error.message).toBe('errors.contentNotFound');
  });
});

describe('AllExceptionsFilter Prisma durum eşlemesi (F7-04)', () => {
  it('P2002 → HTTP 409 + CONFLICT zarfı (eşzamanlı unlock kaybedeni 500 görmez)', () => {
    const err = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const { status, body } = run(err);
    expect(status).toBe(409);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = body as any;
    expect(b.error.code).toBe('CONFLICT');
    expect(b.error.details.reason).toBe('UNIQUE_CONSTRAINT');
  });

  it('P2025 → HTTP 404 + NOT_FOUND zarfı', () => {
    const err = new Prisma.PrismaClientKnownRequestError('yok', {
      code: 'P2025',
      clientVersion: 'test',
    });
    const { status, body } = run(err);
    expect(status).toBe(404);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((body as any).error.code).toBe('NOT_FOUND');
  });
});
