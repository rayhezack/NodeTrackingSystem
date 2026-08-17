import { Module } from '@nestjs/common';
import { QueryLibraryModule } from '../query-library/query-library.module';
import { TrackingModule } from '../tracking/tracking.module';
import { BitableModule } from '../bitable/bitable.module';
import { AiTrackingController } from './ai-tracking.controller';
import { AiTrackingService } from './ai-tracking.service';
import { FeishuDocumentService } from './feishu-document.service';
import { FeishuOAuthService } from './feishu-oauth.service';
import { ModelGatewayService } from './model-gateway.service';

@Module({
  imports: [TrackingModule, QueryLibraryModule, BitableModule],
  controllers: [AiTrackingController],
  providers: [AiTrackingService, FeishuDocumentService, FeishuOAuthService, ModelGatewayService],
})
export class AiTrackingModule {}
