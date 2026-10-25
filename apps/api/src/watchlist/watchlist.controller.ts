/**
 * Favoriler (watchlist) uçları (API_CONTRACT §4):
 *   GET    /watchlist            → favori listesi
 *   POST   /watchlist/:contentId → ekle (idempotent)
 *   DELETE /watchlist/:contentId → kaldır (idempotent)
 */
import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import {
  type FavoritesListResponse,
  type FavoriteMutationResponse,
} from '@perdego/contracts';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentLang, CurrentUser, type Lang, type RequestUser } from '../common/request-context';
import { WatchlistService } from './watchlist.service';

@ApiTags('watchlist')
@Controller('watchlist')
export class WatchlistController {
  constructor(private readonly watchlist: WatchlistService) {}

  @Get()
  @ApiOperation({ summary: 'Favorilerim' })
  async list(
    @CurrentUser() user: RequestUser,
    @CurrentLang() lang: Lang,
  ): Promise<FavoritesListResponse> {
    return this.watchlist.list(user.id, lang);
  }

  @Post(':contentId')
  @ApiOperation({ summary: 'Favoriye ekle (idempotent)' })
  async add(
    @CurrentUser() user: RequestUser,
    @Param('contentId') contentId: string,
    @CurrentLang() lang: Lang,
  ): Promise<FavoriteMutationResponse> {
    return this.watchlist.add(user.id, contentId, lang);
  }

  @Delete(':contentId')
  @ApiOperation({ summary: 'Favoriden çıkar (idempotent)' })
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('contentId') contentId: string,
    @CurrentLang() lang: Lang,
  ): Promise<FavoriteMutationResponse> {
    return this.watchlist.remove(user.id, contentId, lang);
  }
}
