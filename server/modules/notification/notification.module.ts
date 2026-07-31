import { Module } from '@nestjs/common';
import { FeishuNotificationService } from './notification.service';

@Module({
  providers: [FeishuNotificationService],
  exports: [FeishuNotificationService],
})
export class NotificationModule {}
