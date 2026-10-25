import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminMediaController } from './admin-media.controller';
import { CreditsService } from '../credits/credits.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [MediaModule],
  providers: [AdminService, CreditsService],
  controllers: [AdminController, AdminMediaController],
  exports: [AdminService],
})
export class AdminModule {}
