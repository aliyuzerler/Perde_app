/**
 * Hesap uçları (API_CONTRACT §2 — hesap yaşam döngüsü):
 *   POST /api/v1/account/delete-request → parola teyidi + tüm oturum kapanır
 *   POST /api/v1/account/restore        → nefallet süresi içinde geri alma
 */
import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  restoreAccountRequestSchema,
  type AccountDeletionResponse,
  type AuthSessionResponse,
  type RestoreAccountRequest,
} from '@perdego/contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type RequestUser } from '../common/request-context';
import { Public } from '../auth/guards';
import { AccountService } from './account.service';

const deleteRequestSchema = z.object({
  password: z.string().min(1, 'Onay için parola zorunludur'),
});

@ApiTags('account')
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Post('delete-request')
  @ApiOperation({ summary: 'Hesap silme talebi (parola teyitli; 30 gün nefallet)' })
  async deleteRequest(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(deleteRequestSchema)) dto: { password: string },
  ): Promise<AccountDeletionResponse> {
    return this.account.requestDeletion(user.id, dto.password);
  }

  @Public()
  @Post('restore')
  @ApiOperation({ summary: 'Silme talebini geri alır ve yeni oturum açar' })
  async restore(
    @Req() req: Request,
    @Body(new ZodValidationPipe(restoreAccountRequestSchema)) dto: RestoreAccountRequest,
  ): Promise<AuthSessionResponse> {
    const ipHash = req.ip
      ? createHash('sha256').update(req.ip).digest('hex').slice(0, 32)
      : undefined;
    return this.account.restore(dto, {
      ipHash,
      userAgent: req.headers['user-agent'],
    });
  }
}
