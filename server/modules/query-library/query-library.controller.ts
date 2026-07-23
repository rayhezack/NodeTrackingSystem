import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { QueryLibraryService } from './query-library.service';
import type {
  GetOfficialEventsParams,
  GetOfficialEventsResponse,
  GetOfficialParamsResponse,
} from '@shared/api.interface';

@Controller('api/query-library')
export class QueryLibraryController {
  private readonly logger = new Logger(QueryLibraryController.name);

  constructor(private readonly queryLibraryService: QueryLibraryService) {}

  @Get('events')
  async getEvents(
    @Query() query: GetOfficialEventsParams,
  ): Promise<GetOfficialEventsResponse> {
    const params: GetOfficialEventsParams = {
      keyword: query.keyword,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      pageToken: query.pageToken,
    };
    return this.queryLibraryService.getEvents(params);
  }

  @Get('events/:recordId/params')
  async getEventParams(
    @Param('recordId') recordId: string,
  ): Promise<GetOfficialParamsResponse> {
    return this.queryLibraryService.getEventParams(recordId);
  }
}
