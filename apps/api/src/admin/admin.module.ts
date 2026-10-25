import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { CreditsService } from '../credits/credits.service';

@Module({
  providers: [AdminService, CreditsService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}
