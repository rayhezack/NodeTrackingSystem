import { RequestMethod, type MiddlewareConsumer } from '@nestjs/common';
import { CsrfMiddleware, PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

jest.mock('../../server/modules/view/view.module', () => ({ ViewModule: class ViewModule {} }));
jest.mock('../../server/modules/tracking/tracking.module', () => ({ TrackingModule: class TrackingModule {} }));
jest.mock('../../server/modules/query-library/query-library.module', () => ({ QueryLibraryModule: class QueryLibraryModule {} }));
jest.mock('../../server/modules/ai-tracking/ai-tracking.module', () => ({ AiTrackingModule: class AiTrackingModule {} }));

import { AppModule } from '../../server/app.module';

describe('应用 CSRF 路由', () => {
  it('仅允许飞书 OAuth GET 回调绕过 CSRF 校验', () => {
    const platformOptions = (PlatformModule as unknown as {
      moduleOptions?: { enableCsrf?: boolean };
    }).moduleOptions;
    expect(platformOptions?.enableCsrf).toBe(false);

    const forRoutes = jest.fn();
    const exclude = jest.fn().mockReturnValue({ forRoutes });
    const apply = jest.fn().mockReturnValue({ exclude, forRoutes });
    const configure = (new AppModule() as AppModule & {
      configure?: (consumer: MiddlewareConsumer) => void;
    }).configure;

    expect(configure).toBeDefined();
    configure?.({ apply } as unknown as MiddlewareConsumer);

    expect(apply).toHaveBeenCalledWith(CsrfMiddleware);
    expect(exclude).toHaveBeenCalledWith({
      path: 'api/tracking/ai/feishu-auth/callback',
      method: RequestMethod.GET,
    });
    expect(forRoutes).toHaveBeenCalledWith('/api/*');
  });
});
