import type { Request } from 'express';

jest.mock('@nestjs/common', () => {
  const actual = jest.requireActual('@nestjs/common');
  const noOpDecorator = () => () => undefined;
  return {
    ...actual,
    Body: noOpDecorator,
    Controller: noOpDecorator,
    Delete: noOpDecorator,
    Get: noOpDecorator,
    Param: noOpDecorator,
    Patch: noOpDecorator,
    Post: noOpDecorator,
    Put: noOpDecorator,
    Query: noOpDecorator,
    Req: noOpDecorator,
  };
});

import { TrackingController } from '../../server/modules/tracking/tracking.controller';

describe('埋点控制器可信身份', () => {
  function createFixture() {
    const tracking = {
      createRecord: jest.fn().mockResolvedValue({ success: true }),
      updateRecord: jest.fn().mockResolvedValue({ success: true }),
      getDetail: jest.fn().mockResolvedValue({ data: {} }),
      deleteParam: jest.fn().mockResolvedValue({ success: true }),
    };
    const request = {
      userContext: { userId: 'platform_user_1' },
    } as unknown as Request;
    return {
      controller: new TrackingController(tracking as never),
      tracking,
      request,
    };
  }

  it('创建需求时应覆盖前端伪造的用户身份', async () => {
    const { controller, tracking, request } = createFixture();

    await (controller.createRecord as unknown as (
      body: Record<string, unknown>,
      request: Request,
    ) => Promise<unknown>)({
      source: 'app',
      eventName: '测试需求',
      actorId: 'spoofed_user',
      actorLarkId: 'ou_spoofed_user',
    }, request);

    expect(tracking.createRecord).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'platform_user_1',
      actorLarkId: undefined,
    }));
  });

  it('更新需求时应覆盖前端伪造的用户身份', async () => {
    const { controller, tracking, request } = createFixture();

    await (controller.updateRecord as unknown as (
      recordId: string,
      body: Record<string, unknown>,
      request: Request,
    ) => Promise<unknown>)('app:rec_1', {
      fields: { 事件定义: '伪造修改' },
      actorId: 'spoofed_user',
    }, request);

    expect(tracking.updateRecord).toHaveBeenCalledWith('app:rec_1', expect.objectContaining({
      actorId: 'platform_user_1',
      actorLarkId: undefined,
    }));
  });

  it('读取详情和删除参数时都应使用妙搭可信身份', async () => {
    const { controller, tracking, request } = createFixture();

    await (controller.getDetail as unknown as (
      recordId: string,
      actorId: string,
      actorLarkId: string,
      request: Request,
    ) => Promise<unknown>)('app:rec_1', 'spoofed_user', 'ou_spoofed_user', request);
    await (controller.deleteParam as unknown as (
      paramRecordId: string,
      actorId: string,
      actorLarkId: string,
      request: Request,
    ) => Promise<unknown>)('app:param_1', 'spoofed_user', 'ou_spoofed_user', request);

    expect(tracking.getDetail).toHaveBeenCalledWith('app:rec_1', 'platform_user_1', undefined);
    expect(tracking.deleteParam).toHaveBeenCalledWith('app:param_1', 'platform_user_1', undefined);
  });
});
