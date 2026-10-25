import { Module } from '@nestjs/common';
import { WatchProgressService } from './watch-progress.service';
import { WatchProgressController } from './watch-progress.controller';

@Module({
  providers: [WatchProgressService],
  controllers: [WatchProgressController],
  exports: [WatchProgressService],
})
export class WatchProgressModule {}
