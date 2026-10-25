/**
 * Global istisna filtresi: TÜM hataları ApiEnvelope biçimine çevirir.
 *
 * - DomainError → kendi durum/kod/reason'u ile.
 * - NestJS HttpException (guard/pipe kaynaklı) → eşlenen kod + reason.
 * - Zod hataları → 400 VALIDATION_FAILED + fields[].
 * - Prisma bilinen hataları → P2002 çakışma 409, P2025 bulunamadı 404.
 * - Bilinmeyen → 500 INTERNAL + traceId (ham hata yalnızca loglanır).
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { DomainError } from './errors';

interface ErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const traceId = randomUUID();
    const body = this.toEnvelope(exception, traceId);
    const status = this.statusOf(exception);

    if (status >= 500) {
      this.logger.error(
        `${request?.method} ${request?.url} → ${status} trace=${traceId}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(body);
  }

  private statusOf(exception: unknown): number {
    if (exception instanceof DomainError) return exception.status;
    if (isZodError(exception)) return HttpStatus.BAD_REQUEST;
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private toEnvelope(exception: unknown, traceId: string): ErrorBody {
    if (exception instanceof DomainError) {
      return {
        ok: false,
        error: {
          code: exception.code,
          message: exception.message,
          details: {
            ...(exception.reason ? { reason: exception.reason } : {}),
            ...(exception.details ?? {}),
          },
        },
      };
    }

    // Zod tespiti: duck-typing (çoklu modül örneklerinde instanceof kırılabilir;
    // ZodError imzası issues[] dizisidir).
    if (isZodError(exception)) {
      const issues = exception.issues as Array<{ path: PropertyKey[]; message: string }>;
      return {
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'errors.validationFailed',
          details: {
            reason: 'VALIDATION_FAILED',
            fields: issues.map((i) => ({
              path: i.path.join('.'),
              message: i.message,
            })),
          },
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse() as
        | { code?: string; message?: string; reason?: string; details?: Record<string, unknown> }
        | string;
      const code = this.nestStatusToCode(status);
      const reason =
        typeof payload === 'object' ? (payload.reason ?? undefined) : undefined;
      const message =
        typeof payload === 'object' && payload.message
          ? String(payload.message)
          : 'errors.requestFailed';
      const details =
        typeof payload === 'object' && payload.details
          ? { reason, ...payload.details }
          : reason
            ? { reason }
            : undefined;
      return { ok: false, error: { code, message, details } };
    }

    // Prisma bilinen hataları: eşsiz kısıt → 409, kayıt yok → 404.
    const prismaKnown = exception as
      | (Prisma.PrismaClientKnownRequestError & { code?: string })
      | undefined;
    if (
      prismaKnown &&
      typeof prismaKnown === 'object' &&
      typeof prismaKnown.code === 'string' &&
      prismaKnown.code.startsWith('P')
    ) {
      if (prismaKnown.code === 'P2002') {
        return {
          ok: false,
          error: {
            code: 'CONFLICT',
            message: 'errors.conflict',
            details: { reason: 'UNIQUE_CONSTRAINT', target: prismaKnown.meta?.target },
          },
        };
      }
      if (prismaKnown.code === 'P2025') {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'errors.notFound', details: { reason: 'RECORD_NOT_FOUND' } },
        };
      }
    }

    return {
      ok: false,
      error: {
        code: 'INTERNAL',
        message: 'errors.internal',
        details: { reason: 'UNEXPECTED', traceId },
      },
    };
  }

  private nestStatusToCode(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 402:
        return 'PAYMENT_REQUIRED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 429:
        return 'RATE_LIMITED';
      case 503:
        return 'SERVICE_UNAVAILABLE';
      default:
        return status >= 500 ? 'INTERNAL' : 'BAD_REQUEST';
    }
  }
}

/** İstek gövdesinin kararlı hash'i (idempotensi için). */
export function stableBodyHash(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

/** ZodError tespiti: duck-typing (çoklu zod örneklerinde instanceof kırılır;
 * zod v4 ESM altında ZodError her zaman Error'dan türemeyebilir). */
export function isZodError(
  exception: unknown,
): exception is { issues: Array<{ path: PropertyKey[]; message: string }> } {
  const candidate = exception as { name?: string; issues?: unknown } | null;
  return (
    !!candidate &&
    typeof candidate === 'object' &&
    candidate.name === 'ZodError' &&
    Array.isArray(candidate.issues)
  );
}
