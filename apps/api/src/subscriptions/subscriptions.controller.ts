/**
 * Abonelik ve kredi paketleri görüntüleme ucu (anonim): paywall/mağaza
 * ekranları için products listesi ayrı uçta da sunulur (geriye uyum).
 */
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/guards';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Public()
  @Get('products')
  @ApiOperation({ summary: 'Aktif abonelik planları' })
  async products() {
    return this.subscriptions.listPlans();
  }
}
