import { FeishuNotificationService, type WorkflowTransitionNotification } from '../../server/modules/notification/notification.service';

const BASE_PAYLOAD: WorkflowTransitionNotification = {
  idempotencyKey: 'app:APP_REQ_TEST:埋点设计',
  source: 'app',
  recordId: 'app:rec_test',
  requestId: 'APP_REQ_TEST',
  requestName: '通知测试需求',
  fromStage: '需求录入',
  toStage: '埋点设计',
  actionText: '请处理埋点设计',
  targetStageId: 'design',
  priority: 'P1',
  platform: 'iOS、Android',
  eventIds: ['evt_test'],
  eventNames: ['测试事件'],
  recipients: [],
};

describe('FeishuNotificationService', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.FEISHU_APP_ID = 'cli_test';
    process.env.FEISHU_APP_SECRET = 'test_secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('人员只有数字 user_id 时，应直接按 user_id 投递而不是报 cannot resolve openid', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { user: { open_id: 'ou_from_contact' } } }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { message_id: 'om_user_id' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FeishuNotificationService();
    const result = await service.sendWorkflowTransitionNotification({
      ...BASE_PAYLOAD,
      recipients: [{ user_id: '1867390536304713', name: 'Joe', role: '数据负责人' }],
    });

    expect(result).toEqual(expect.objectContaining({ sentCount: 1, failedCount: 0, skippedCount: 0 }));
    expect(fetchMock.mock.calls[2][0]).toContain('receive_id_type=user_id');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual(
      expect.objectContaining({
        receive_id: '1867390536304713',
        msg_type: 'interactive',
      }),
    );
  });

  it('人员有邮箱时，应直接按 email 投递，不再强制解析 open_id', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { user_list: [{ user_id: 'ou_from_email' }] } }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { message_id: 'om_email' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FeishuNotificationService();
    const result = await service.sendWorkflowTransitionNotification({
      ...BASE_PAYLOAD,
      recipients: [{ user_id: '3008', email: 'joe@mail.pollo.ai', name: 'Joe Liu', role: '数据负责人' }],
    });

    expect(result).toEqual(expect.objectContaining({ sentCount: 1, failedCount: 0, skippedCount: 0 }));
    expect(fetchMock.mock.calls[2][0]).toContain('receive_id_type=email');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual(
      expect.objectContaining({
        receive_id: 'joe@mail.pollo.ai',
        msg_type: 'interactive',
      }),
    );
  });

  it('直接 user_id 投递失败时，应回退到联系人接口解析出的 open_id', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { user: { open_id: 'ou_from_contact' } } }))
      .mockResolvedValueOnce(okJson({ code: 99991663, msg: 'invalid receive id' }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { message_id: 'om_open_id' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FeishuNotificationService();
    const result = await service.sendWorkflowTransitionNotification({
      ...BASE_PAYLOAD,
      recipients: [{ user_id: '1867390536304713', name: 'Joe', role: '数据负责人' }],
    });

    expect(result).toEqual(expect.objectContaining({ sentCount: 1, failedCount: 0, skippedCount: 0 }));
    expect(fetchMock.mock.calls[2][0]).toContain('receive_id_type=user_id');
    expect(fetchMock.mock.calls[3][0]).toContain('receive_id_type=open_id');
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual(
      expect.objectContaining({
        receive_id: 'ou_from_contact',
        msg_type: 'interactive',
      }),
    );
  });

  it('多个负责人时，应逐个独立投递并全部计入成功', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { message_id: 'om_owner_a' } }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { message_id: 'om_owner_b' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FeishuNotificationService();
    const result = await service.sendWorkflowTransitionNotification({
      ...BASE_PAYLOAD,
      recipients: [
        { user_id: 'ou_owner_a', larkUserId: 'ou_owner_a', name: '负责人A', role: '研发负责人' },
        { user_id: 'ou_owner_b', larkUserId: 'ou_owner_b', name: '负责人B', role: '研发负责人' },
      ],
    });

    expect(result).toEqual(expect.objectContaining({ recipientCount: 2, sentCount: 2, failedCount: 0, skippedCount: 0 }));
    expect(fetchMock.mock.calls[1][0]).toContain('receive_id_type=open_id');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual(expect.objectContaining({ receive_id: 'ou_owner_a' }));
    expect(fetchMock.mock.calls[2][0]).toContain('receive_id_type=open_id');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual(expect.objectContaining({ receive_id: 'ou_owner_b' }));
  });

  it('多个负责人中单人失败时，不应阻断其他负责人通知', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }))
      .mockResolvedValueOnce(okJson({ code: 99991663, msg: 'invalid receive id' }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { message_id: 'om_owner_b' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FeishuNotificationService();
    const result = await service.sendWorkflowTransitionNotification({
      ...BASE_PAYLOAD,
      recipients: [
        { user_id: 'ou_owner_a', larkUserId: 'ou_owner_a', name: '负责人A', role: '研发负责人' },
        { user_id: 'ou_owner_b', larkUserId: 'ou_owner_b', name: '负责人B', role: '研发负责人' },
      ],
    });

    expect(result).toEqual(expect.objectContaining({ recipientCount: 2, sentCount: 1, failedCount: 1, skippedCount: 0 }));
    expect(result.errors?.[0]).toContain('负责人A');
    expect(fetchMock.mock.calls[2][0]).toContain('receive_id_type=open_id');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual(expect.objectContaining({ receive_id: 'ou_owner_b' }));
  });

  it('机器人对邮箱用户不可用时，应给出可用范围提示且不继续尝试 user_id', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { user_list: [] } }))
      .mockResolvedValueOnce(okJson({ code: 230013, msg: 'Bot has NO availability to this user.' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FeishuNotificationService();
    const result = await service.sendWorkflowTransitionNotification({
      ...BASE_PAYLOAD,
      recipients: [{ user_id: '3008-F05', email: 'joe@mail.pollo.ai', name: '刘桥', role: '数据负责人' }],
    });

    expect(result).toEqual(expect.objectContaining({ recipientCount: 1, sentCount: 0, failedCount: 1, skippedCount: 0 }));
    expect(result.errors?.[0]).toContain('刘桥');
    expect(result.errors?.[0]).toContain('机器人对该用户不可用');
    expect(fetchMock.mock.calls).toHaveLength(3);
    expect(fetchMock.mock.calls[2][0]).toContain('receive_id_type=email');
  });
});

function okJson(body: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
