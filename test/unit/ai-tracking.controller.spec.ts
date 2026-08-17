import type { Request } from 'express';

jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common');
  const noOpDecorator = () => () => undefined;
  return {
    ...actual,
    Body: noOpDecorator,
    Controller: noOpDecorator,
    Get: noOpDecorator,
    Param: noOpDecorator,
    Post: noOpDecorator,
    Query: noOpDecorator,
    Req: noOpDecorator,
    Res: noOpDecorator,
  };
});

import { AiTrackingController } from '../../server/modules/ai-tracking/ai-tracking.controller';

describe('AI 埋点控制器身份解析', () => {
  function createFixture() {
    const aiTracking = {
      getAuthStatus: jest.fn().mockResolvedValue({ authorized: true }),
      startAuth: jest.fn().mockReturnValue({ authorizationUrl: 'https://example.com/auth' }),
      generateDraft: jest.fn().mockResolvedValue({ draft: {} }),
    };
    const oauth = {
      getSessionActor: jest.fn().mockReturnValue(undefined),
    };
    const controller = new AiTrackingController(aiTracking as never, oauth as never);
    const request = {
      headers: {},
      userContext: { userId: 'platform_user_1' },
    } as unknown as Request;
    return { controller, aiTracking, request };
  }

  it('桌面轮询应使用妙搭注入的可信用户身份读取授权状态', async () => {
    const { controller, aiTracking, request } = createFixture();

    await (controller.getAuthStatus as unknown as (
      request: Request,
      actorId?: string,
      actorLarkId?: string,
    ) => Promise<unknown>)(request, 'client_actor', 'ou_client');

    expect(aiTracking.getAuthStatus).toHaveBeenCalledWith('platform_user_1');
  });

  it('发起授权应将 OAuth 会话绑定到妙搭用户', () => {
    const { controller, aiTracking, request } = createFixture();

    (controller.startAuth as unknown as (body: Record<string, unknown>, request: Request) => unknown)(
      { recordId: 'web:rec_1', actorId: 'client_actor', actorLarkId: 'ou_client' },
      request,
    );

    expect(aiTracking.startAuth).toHaveBeenCalledWith({
      recordId: 'web:rec_1',
      actorId: 'platform_user_1',
      actorLarkId: undefined,
    });
  });

  it('生成草稿应接受妙搭用户身份而不依赖扫码设备 Cookie', async () => {
    const { controller, aiTracking, request } = createFixture();
    const body = { actorId: 'client_actor', actorLarkId: 'ou_client' };

    await controller.generateDraft('web:rec_1', body, request);

    expect(aiTracking.generateDraft).toHaveBeenCalledWith(
      'web:rec_1',
      body,
      'platform_user_1',
    );
  });
});
