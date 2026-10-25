/**
 * Yasal metinler (Kullanım Koşulları + Gizlilik Politikası).
 *
 * Faz 3b: metinler kaynak içinde sürümlü tutulur (Türkçe Markdown). Ürün
 * büyüdüğünde CMS/admin yönetimine taşınacak; istemci sözleşmesi değişmez.
 * Uçlar anonimdir — misafir kullanıcı da kayıt öncesi okuyabilmelidir.
 */
import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/guards';
import { DomainError } from '../common/errors';
import type { LegalDocument } from '@perdego/contracts';
import { TERMS_TEXT, PRIVACY_TEXT } from './legal-texts';

const DOCS: Record<'terms' | 'privacy', LegalDocument> = {
  terms: {
    slug: 'terms',
    title: 'PerdeGo Kullanım Koşulları',
    version: '1.0',
    updatedAt: '2026-10-26',
    content: TERMS_TEXT,
  },
  privacy: {
    slug: 'privacy',
    title: 'PerdeGo Gizlilik Politikası',
    version: '1.0',
    updatedAt: '2026-10-26',
    content: PRIVACY_TEXT,
  },
};

@ApiTags('legal')
@Controller('legal')
export class LegalController {
  @Public()
  @Get('terms')
  @ApiOperation({ summary: 'Kullanım Koşulları (Türkçe, sürümlü)' })
  terms(): LegalDocument {
    return DOCS.terms;
  }

  @Public()
  @Get('privacy')
  @ApiOperation({ summary: 'Gizlilik Politikası (Türkçe, sürümlü)' })
  privacy(): LegalDocument {
    return DOCS.privacy;
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Sürüme göre yasal metin (terms | privacy)' })
  bySlug(@Param('slug') slug: string): LegalDocument {
    if (slug === 'terms' || slug === 'privacy') {
      return DOCS[slug];
    }
    throw DomainError.notFound('RECORD_NOT_FOUND', 'errors.notFound');
  }
}
