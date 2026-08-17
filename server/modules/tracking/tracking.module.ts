import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';
import { BitableModule } from '../bitable/bitable.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [BitableModule, NotificationModule],
  controllers: [TrackingController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
