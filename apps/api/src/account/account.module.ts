/**
 * Hesap yaşam döngüsü modülü: silme talebi, geri alma, anonimleştirme purge'u.
 * AuthModule global olduğundan AuthService/JwtAuthGuard buraya görünürdür.
 */
import { Module } from '@nestjs/common';
import { AccountService } from './account.service';
import { AccountController } from './account.controller';

@Module({
  providers: [AccountService],
  controllers: [AccountController],
  exports: [AccountService],
})
export class AccountModule {}
