import { Controller, Logger } from '@nestjs/common';

@Controller('api/tracking')
export class TrackingController {
  private readonly logger = new Logger(TrackingController.name);

  constructor() {
    this.logger.log('TrackingController initialized');
  }
}
