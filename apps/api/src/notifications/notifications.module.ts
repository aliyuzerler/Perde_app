import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CampaignsService } from './campaigns.service';
import { NotificationsController } from './notifications.controller';

@Module({
  providers: [NotificationsService, CampaignsService],
  controllers: [NotificationsController],
  exports: [NotificationsService, CampaignsService],
})
export class NotificationsModule {}
