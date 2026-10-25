/**
 * Swagger şema kaydı: packages/contracts içindeki Zod şemaları zod v4'ün
 * yerleşik `z.toJSONSchema()` ile JSON Schema'ya çevrilir ve OpenAPI
 * belgesinin components.schemas bölümüne adıyla eklenir.
 * Böylece dokümantasyon, çalışma anında kullanılan sözleşmelerle birebir
 * kalır (çifte tanım/yorum sapması olmaz).
 */
import type { OpenAPIObject } from '@nestjs/swagger';
import { z } from 'zod';
import {
  apiErrorSchema,
  bannerSchema,
  catalogEpisodeSchema,
  catalogSeasonSchema,
  categorySchema,
  categoryDetailResponseSchema,
  categoryListResponseSchema,
  contentSchema,
  contentSummarySchema,
  creditBalanceSchema,
  creditPackSchema,
  episodeAccessSchema,
  episodeDetailResponseSchema,
  episodeSchema,
  favoritesListResponseSchema,
  favoriteMutationResponseSchema,
  homeResponseSchema,
  loginRequestSchema,
  notificationPreferencesSchema,
  pageMetaSchema,
  plansResponseSchema,
  purchaseValidateSchema,
  purchaseValidateResponseSchema,
  registerRequestSchema,
  searchResponseSchema,
  storeTransactionViewSchema,
  titleDetailResponseSchema,
  titleListResponseSchema,
  unlockRequestSchema,
  unlockResponseSchema,
  walletSchema,
  walletTransactionSchema,
  watchProgressItemSchema,
  watchProgressPutSchema,
  webhookIngestSchema,
} from '@perdego/contracts';

/** Belgeye kaydedilecek sözleşme şemaları (ad → zod). */
const contractSchemas: Record<string, z.ZodType> = {
  ApiError: apiErrorSchema,
  PageMeta: pageMetaSchema,
  Banner: bannerSchema,
  HomeResponse: homeResponseSchema,
  ContentSummary: contentSummarySchema,
  Content: contentSchema,
  Episode: episodeSchema,
  CatalogEpisode: catalogEpisodeSchema,
  CatalogSeason: catalogSeasonSchema,
  EpisodeAccess: episodeAccessSchema,
  TitleListResponse: titleListResponseSchema,
  TitleDetailResponse: titleDetailResponseSchema,
  EpisodeDetailResponse: episodeDetailResponseSchema,
  Category: categorySchema,
  CategoryListResponse: categoryListResponseSchema,
  CategoryDetailResponse: categoryDetailResponseSchema,
  RegisterRequest: registerRequestSchema,
  LoginRequest: loginRequestSchema,
  SubscriptionPlan: plansResponseSchema,
  Wallet: walletSchema,
  WalletTransaction: walletTransactionSchema,
  CreditPack: creditPackSchema,
  CreditBalance: creditBalanceSchema,
  UnlockRequest: unlockRequestSchema,
  UnlockResponse: unlockResponseSchema,
  PurchaseValidate: purchaseValidateSchema,
  PurchaseValidateResponse: purchaseValidateResponseSchema,
  StoreTransactionView: storeTransactionViewSchema,
  WebhookIngest: webhookIngestSchema,
  WatchProgressPut: watchProgressPutSchema,
  WatchProgressItem: watchProgressItemSchema,
  FavoritesListResponse: favoritesListResponseSchema,
  FavoriteMutationResponse: favoriteMutationResponseSchema,
  NotificationPreferences: notificationPreferencesSchema,
  SearchResponse: searchResponseSchema,
};

export function registerContractSchemas(document: OpenAPIObject): void {
  document.components ??= {};
  document.components.schemas ??= {};
  for (const [name, schema] of Object.entries(contractSchemas)) {
    try {
      const jsonSchema = z.toJSONSchema(schema, {
        target: 'draft-7',
        io: 'output',
        unrepresentable: 'any',
      }) as Record<string, unknown>;
      jsonSchema.description = `${name} (packages/contracts)`;
      document.components.schemas[name] = jsonSchema;
    } catch {
      // Çevrilemeyen şema dokümanı bozmasın; çalışma anı doğrulamadan bağımsızdır.
      document.components.schemas[name] = { type: 'object', description: `${name} (şema dönüştürülemedi)` };
    }
  }
}
