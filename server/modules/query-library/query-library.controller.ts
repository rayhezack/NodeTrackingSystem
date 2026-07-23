import { Controller, Logger } from '@nestjs/common';

@Controller('api/query-library')
export class QueryLibraryController {
  private readonly logger = new Logger(QueryLibraryController.name);

  constructor() {
    this.logger.log('QueryLibraryController initialized');
  }
}
