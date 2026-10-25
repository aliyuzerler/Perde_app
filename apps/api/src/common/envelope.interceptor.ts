/**
 * Yanıt zarfı interceptor'ı: başarılı controller dönüşünü ApiEnvelope'a
 * sarar ({ ok: true, data }). İstisnalar hata filtresine düşer.
 *
 * Muafiyetler: /health*, /placeholders/* (ham gövde; altyapı/görsel uçları),
 * /media/hls (m3u8 manifest).
 */
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export const RAW_RESPONSE_KEY = 'rawResponse';
/** Bu dekoratörle işaretlenen uçlar zarfa girmez (görsel/manifest vb.). */
export const RawResponse = (): MethodDecorator => Reflect.metadata(RAW_RESPONSE_KEY, true);

@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const isRaw =
      (this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false) ||
      request.path.startsWith('/health') ||
      request.path.startsWith('/placeholders') ||
      request.path.includes('.m3u8') ||
      request.path.startsWith('/api/docs');

    if (isRaw) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        // 204 vb. boş yanıtlar sarılmaz.
        if (response.statusCode === 204 || data === undefined) {
          return data;
        }
        return { ok: true, data };
      }),
    );
  }
}
