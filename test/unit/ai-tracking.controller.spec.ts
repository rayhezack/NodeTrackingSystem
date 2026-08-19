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
      getLatestDraft: jest.fn().mockResolvedValue({ draft: {} }),
      getDraft: jest.fn().mockResolvedValue({ draft: {} }),
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

    expect(aiTracking.getAuthStatus).toHaveBeenCalledWith('ou_client');
  });

  it('即使存在旧的授权 Cookie，也不应覆盖当前请求中的妙搭用户', async () => {
    const oauth = {
      getSessionActor: jest.fn().mockReturnValue('stale_cookie_actor'),
    };
    const aiTracking = {
      getAuthStatus: jest.fn().mockResolvedValue({ authorized: true }),
      startAuth: jest.fn().mockReturnValue({ authorizationUrl: 'https://example.com/auth' }),
      generateDraft: jest.fn().mockResolvedValue({ draft: {} }),
      getLatestDraft: jest.fn().mockResolvedValue({ draft: {} }),
      getDraft: jest.fn().mockResolvedValue({ draft: {} }),
    };
    const staleController = new AiTrackingController(aiTracking as never, oauth as never);
    const request = {
      headers: {},
      userContext: { userId: 'platform_user_1' },
    } as unknown as Request;

    await (staleController.getAuthStatus as unknown as (
      request: Request,
      actorId?: string,
      actorLarkId?: string,
    ) => Promise<unknown>)(request);

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
      actorLarkId: 'ou_client',
    });
  });

  it('生成草稿应接受妙搭用户身份而不依赖扫码设备 Cookie', async () => {
    const { controller, aiTracking, request } = createFixture();
    const body = { actorId: 'client_actor', actorLarkId: 'ou_client' };

    await controller.generateDraft('web:rec_1', body, request);

    expect(aiTracking.generateDraft).toHaveBeenCalledWith(
      'web:rec_1',
      body,
      'ou_client',
    );
  });

  it('读取最近草稿应使用妙搭可信用户身份', async () => {
    const { controller, aiTracking, request } = createFixture();
    const latestGetter = (controller as unknown as {
      getLatestDraft?: (
        recordId: string,
        actorId: string | undefined,
        actorLarkId: string | undefined,
        request: Request,
      ) => Promise<unknown>;
    }).getLatestDraft;

    expect(latestGetter).toEqual(expect.any(Function));
    await latestGetter?.call(controller, 'web:rec_1', 'client_actor', 'ou_client', request);

    expect(aiTracking.getLatestDraft).toHaveBeenCalledWith(
      'web:rec_1',
      'client_actor',
      'ou_client',
      'ou_client',
    );
  });

  it('查询草稿最终状态应使用妙搭可信用户身份', async () => {
    const { controller, aiTracking, request } = createFixture();
    const draftGetter = (controller as unknown as {
      getDraft?: (
        recordId: string,
        draftId: string,
        actorId: string | undefined,
        actorLarkId: string | undefined,
        request: Request,
      ) => Promise<unknown>;
    }).getDraft;

    expect(draftGetter).toEqual(expect.any(Function));
    await draftGetter?.call(
      controller,
      'web:rec_1',
      'draft_1',
      'client_actor',
      'ou_client',
      request,
    );

    expect(aiTracking.getDraft).toHaveBeenCalledWith(
      'web:rec_1',
      'draft_1',
      'client_actor',
      'ou_client',
      'ou_client',
    );
  });
});
