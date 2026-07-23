import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { BitableModule } from '../bitable/bitable.module';

@Module({
  imports: [BitableModule],
  controllers: [TrackingController],
  providers: [TrackingService],
})
export class TrackingModule {}
