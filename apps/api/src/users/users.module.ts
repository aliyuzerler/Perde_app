import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AvatarStorageService } from './avatar-storage.service';

@Module({
  providers: [UsersService, AvatarStorageService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
