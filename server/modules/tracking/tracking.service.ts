import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor() {
    this.logger.log('TrackingService initialized');
  }
}
