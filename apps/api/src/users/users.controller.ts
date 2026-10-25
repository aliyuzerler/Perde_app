/**
 * Kullanıcı modülü: profil okuma/güncelleme (API_CONTRACT §2: GET/PATCH /me).
 */
import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  updateProfileRequestSchema,
  type PublicUserProfile,
  type UpdateProfileRequest,
} from '@perdego/contracts';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUser, type RequestUser } from '../common/request-context';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

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
}
