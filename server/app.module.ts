import { APP_FILTER } from '@nestjs/core';
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { CsrfMiddleware, PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { QueryLibraryModule } from './modules/query-library/query-library.module';
import { AiTrackingModule } from './modules/ai-tracking/ai-tracking.module';

@Module({
  imports: [
    // 平台 Module，提供平台能力
    PlatformModule.forRoot({ enableCsrf: false }),
    // ====== @route-section: business-modules START ======
    // Place all business modules here.Do NOT add fallback modules here.
    TrackingModule,
    QueryLibraryModule,
    AiTrackingModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CsrfMiddleware)
      .exclude({
        path: 'api/tracking/ai/feishu-auth/callback',
        method: RequestMethod.GET,
      })
      .forRoutes('/api/*');
  }
}
