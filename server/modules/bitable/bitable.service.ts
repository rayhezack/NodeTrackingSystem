import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class BitableService {
  private readonly logger = new Logger(BitableService.name);

  constructor() {
    this.logger.log('BitableService initialized');
  }
}
