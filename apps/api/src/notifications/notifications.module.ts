import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CampaignsService } from './campaigns.service';
import { PushDispatchService } from './push-dispatch.service';
import { NotificationsController } from './notifications.controller';

@Module({
  providers: [NotificationsService, CampaignsService, PushDispatchService],
  controllers: [NotificationsController],
  exports: [NotificationsService, CampaignsService, PushDispatchService],
})
export class NotificationsModule {}
