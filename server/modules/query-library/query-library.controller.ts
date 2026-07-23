import { Controller, Get, Param, Query } from '@nestjs/common';
import { QueryLibraryService } from './query-library.service';

@Controller('api/query-library')
export class QueryLibraryController {
  constructor(private readonly queryLibraryService: QueryLibraryService) {}

  @Get('events')
  getEvents(@Query() query: Record<string, string>) {
    return this.queryLibraryService.getEvents(query);
  }

  @Get('events/:recordId/params')
  getParams(@Param('recordId') recordId: string) {
    return this.queryLibraryService.getParams(recordId);
  }
}
