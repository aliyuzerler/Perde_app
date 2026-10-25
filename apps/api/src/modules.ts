import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CatalogModule } from './catalog/catalog.module';
import { CategoriesModule } from './categories/categories.module';
import { EpisodesModule } from './episodes/episodes.module';
import { WatchProgressModule } from './watch-progress/watch-progress.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { BillingModule } from './billing/billing.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { CreditsModule } from './credits/credits.module';
import { MediaModule } from './media/media.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';

export const API_MODULES = [
  AuthModule,
  UsersModule,
  CatalogModule,
  CategoriesModule,
  EpisodesModule,
  WatchProgressModule,
  WatchlistModule,
  BillingModule,
  SubscriptionsModule,
  CreditsModule,
  MediaModule,
  NotificationsModule,
  AdminModule,
];

// Dosyanın amacı: modül listesini tek yerde toplamak (app.module okunur kalır).
