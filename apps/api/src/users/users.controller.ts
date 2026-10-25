/**
 * Kullanıcı modülü: profil okuma/güncelleme, avatar yükleme (API_CONTRACT §2:
 * GET/PATCH /me, POST/DELETE /me/avatar).
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  updateProfileRequestSchema,
  type PublicUserProfile,
  type UpdateProfileRequest,
} from '@perdego/contracts';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type RequestUser } from '../common/request-context';
import { UsersService } from './users.service';
import { AvatarStorageService } from './avatar-storage.service';

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly avatars: AvatarStorageService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Profil görünümü' })
  async me(@CurrentUser() user: RequestUser): Promise<PublicUserProfile> {
    return this.users.profile(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Profil güncelleme' })
  async updateMe(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateProfileRequestSchema)) dto: UpdateProfileRequest,
  ): Promise<PublicUserProfile> {
    return this.users.update(user.id, dto);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Profil fotoğrafı yükleme (jpeg/png/webp, ≤ 2 MB)' })
  async uploadAvatar(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file?: { buffer: Buffer; mimetype?: string; originalname?: string },
  ): Promise<PublicUserProfile> {
    if (!file || !file.buffer) {
      throw new BadRequestException({ reason: 'AVATAR_MISSING' });
    }
    return this.users.setAvatar(user.id, file.buffer, file.mimetype);
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Profil fotoğrafını kaldırır' })
  async removeAvatar(@CurrentUser() user: RequestUser): Promise<PublicUserProfile> {
    return this.users.removeAvatar(user.id);
  }
}
