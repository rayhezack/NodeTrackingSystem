import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class QueryLibraryService {
  private readonly logger = new Logger(QueryLibraryService.name);

  constructor() {
    this.logger.log('QueryLibraryService initialized');
  }
}
