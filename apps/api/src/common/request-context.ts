/**
 * İstek bağlamı dekoratörleri ve dil yardımcıları.
 *
 * Not: @Public() / @Roles() tanımları auth/guards.ts'tedir (guard ile aynı
 * dosyada yaşar); burada yalnızca dil/kullanıcı yardımcıları vardır.
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Locale, User } from '@prisma/client';

export interface RequestUser {
  id: string;
  email: string;
  role: 'USER' | 'EDITOR' | 'ADMIN';
  locale: 'tr' | 'en';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  birthYear: number | null;
  sessionId: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | null => {
    const request = ctx.switchToHttp().getRequest();
    return (request.user as RequestUser | undefined) ?? null;
  },
);

/** İsteğin kendi kökeni (protokol+host) — mutlak oynatma URL'i üretimi için.
 * Uçlar bunu MediaService'e geçer; böylece URL, yanıtı veren sunucuyu işaret
 * eder (rastgele port/test ortamı dahil). Üretimde proxy Host başlığını
 * genel adresi verecek şekilde ayarlamalıdır (ya da trust proxy açılmalı).
 *
 * FAZ 8: ters proxy arkasında (Next.js rewrite, nginx vb.) Host hedefe
 * çevrilir; istemcinin GERÇEK kökeni X-Forwarded-Host/Proto'da taşınır.
 * Bu başlıklar varsa önceliklenir — böylece yönetim paneli üzerinden
 * üretilen yükleme/oynatma URL'leri tarayıcıdan erişilebilir kalır.
 * Başlık yoksa davranış birebir korunur (mobil doğrudan erişim). */
export function requestOrigin(
  req: {
    protocol?: string;
    get?: (name: string) => string | undefined;
    headers?: Record<string, string | string[] | undefined>;
  },
): string {
  const headers = req.headers ?? {};
  const fwdHostRaw = headers['x-forwarded-host'];
  const fwdHost = Array.isArray(fwdHostRaw) ? fwdHostRaw[0] : fwdHostRaw;
  const fwdProtoRaw = headers['x-forwarded-proto'];
  const fwdProto = Array.isArray(fwdProtoRaw) ? fwdProtoRaw[0] : fwdProtoRaw;

  if (fwdHost) {
    const proto = (fwdProto ?? req.protocol ?? 'http').split(',')[0]!.trim();
    return `${proto}://${fwdHost.split(',')[0]!.trim()}`;
  }

  const proto = req.protocol ?? 'http';
  const host = req.get?.('host') ?? 'localhost';
  return `${proto}://${host}`;
}

export type Lang = 'tr' | 'en';

/** Accept-Language başlığından desteklenen dil seçer (varsayılan tr). */
export function langFromHeaders(acceptLanguage: string | undefined): Lang {
  const value = (acceptLanguage ?? '').toLowerCase();
  if (value.startsWith('en')) return 'en';
  return 'tr';
}

export const CurrentLang = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Lang => {
    const request = ctx.switchToHttp().getRequest();
    return langFromHeaders(request.headers?.['accept-language']);
  },
);

/** DB Locale enum'undan dil seçimi (kullanıcı tercihli uçlar için). */
export function localeToLang(locale: Locale | undefined | null): Lang {
  return locale === 'en' ? 'en' : 'tr';
}

/** İki dilli alan seçimi. */
export function pickLang<T>(lang: Lang, tr: T, en: T): T {
  return lang === 'en' ? en : tr;
}

/** Kullanıcı satırından istemciye taşınan güvenli görünüm. */
export function toRequestUser(
  user: Pick<User, 'id' | 'email' | 'role' | 'locale' | 'status' | 'birthYear'>,
  sessionId: string,
): RequestUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    locale: user.locale,
    status: user.status,
    birthYear: user.birthYear,
    sessionId,
  };
}
