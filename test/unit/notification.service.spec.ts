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

  it('默认项目人员只有历史数字 ID 时，应补全邮箱、解析 user_id 后投递', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { user_list: [{ email: 'joe@mail.pollo.ai', user_id: 'u_joe' }] } }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { message_id: 'om_open_id' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FeishuNotificationService();
    const result = await service.sendWorkflowTransitionNotification({
      ...BASE_PAYLOAD,
      recipients: [{ user_id: '1855461847682347', name: '刘桥', role: '埋点校验人' }],
    });

    expect(result).toEqual(expect.objectContaining({ sentCount: 1, failedCount: 0, skippedCount: 0 }));
    expect(fetchMock.mock.calls[1][0]).toContain('/contact/v3/users/batch_get_id?user_id_type=user_id');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      emails: ['joe@mail.pollo.ai'],
      include_resigned: false,
    });
    expect(fetchMock.mock.calls[2][0]).toContain('receive_id_type=user_id');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual(
      expect.objectContaining({
        receive_id: 'u_joe',
        msg_type: 'interactive',
      }),
    );
  });

  it('人员有邮箱时，应通过机器人通讯录查询 user_id 且不使用跨应用 open_id', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { user_list: [{ email: 'joe@mail.pollo.ai', user_id: 'u_joe' }] } }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { message_id: 'om_email' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FeishuNotificationService();
    const result = await service.sendWorkflowTransitionNotification({
      ...BASE_PAYLOAD,
      recipients: [{
        user_id: '3008',
        larkUserId: 'ou_from_another_app',
        email: 'joe@mail.pollo.ai',
        name: 'Joe Liu',
        role: '数据负责人',
      }],
    });

    expect(result).toEqual(expect.objectContaining({ sentCount: 1, failedCount: 0, skippedCount: 0 }));
    expect(fetchMock.mock.calls[1][0]).toContain('/contact/v3/users/batch_get_id');
    expect(fetchMock.mock.calls[2][0]).toContain('receive_id_type=user_id');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual(
      expect.objectContaining({
        receive_id: 'u_joe',
        msg_type: 'interactive',
      }),
    );
    expect(fetchMock.mock.calls).toHaveLength(3);
  });

  it('邮箱解析 user_id 失败时，不应回退到跨应用 open_id', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }))
      .mockResolvedValueOnce(okJson({ code: 99991672, msg: 'no permission: contact:user.id:readonly' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FeishuNotificationService();
    const result = await service.sendWorkflowTransitionNotification({
      ...BASE_PAYLOAD,
      recipients: [{
        user_id: '3008',
        larkUserId: 'ou_from_another_app',
        email: 'invalid@example.com',
        name: '测试人员',
        role: '数据负责人',
      }],
    });

    expect(result).toEqual(expect.objectContaining({ sentCount: 0, failedCount: 1 }));
    expect(fetchMock.mock.calls[1][0]).toContain('/contact/v3/users/batch_get_id');
    expect(result.errors?.[0]).toContain('contact:user.id:readonly');
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it('缺少邮箱时即使存在 open_id 也应安全跳过，避免跨应用投递', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FeishuNotificationService();
    const result = await service.sendWorkflowTransitionNotification({
      ...BASE_PAYLOAD,
      recipients: [{ user_id: 'ou_cross_app', larkUserId: 'ou_cross_app', name: '未知人员', role: '研发负责人' }],
    });

    expect(result).toEqual(expect.objectContaining({ recipientCount: 1, sentCount: 0, failedCount: 0, skippedCount: 1 }));
    expect(result.skippedReasons).toContain('cannot resolve recipient delivery target');
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it('多个负责人时，应逐个独立投递并全部计入成功', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { user_list: [{ email: 'owner-a@pollo.ai', user_id: 'u_owner_a' }] } }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { message_id: 'om_owner_a' } }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { user_list: [{ email: 'owner-b@pollo.ai', user_id: 'u_owner_b' }] } }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { message_id: 'om_owner_b' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FeishuNotificationService();
    const result = await service.sendWorkflowTransitionNotification({
      ...BASE_PAYLOAD,
      recipients: [
        { user_id: '1001', email: 'owner-a@pollo.ai', name: '负责人A', role: '研发负责人' },
        { user_id: '1002', email: 'owner-b@pollo.ai', name: '负责人B', role: '研发负责人' },
      ],
    });

    expect(result).toEqual(expect.objectContaining({ recipientCount: 2, sentCount: 2, failedCount: 0, skippedCount: 0 }));
    expect(fetchMock.mock.calls[2][0]).toContain('receive_id_type=user_id');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual(expect.objectContaining({ receive_id: 'u_owner_a' }));
    expect(fetchMock.mock.calls[4][0]).toContain('receive_id_type=user_id');
    expect(JSON.parse(String(fetchMock.mock.calls[4][1]?.body))).toEqual(expect.objectContaining({ receive_id: 'u_owner_b' }));
  });

  it('多个负责人中单人失败时，不应阻断其他负责人通知', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { user_list: [{ email: 'owner-a@pollo.ai', user_id: 'u_owner_a' }] } }))
      .mockResolvedValueOnce(okJson({ code: 99991663, msg: 'invalid receive id' }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { user_list: [{ email: 'owner-b@pollo.ai', user_id: 'u_owner_b' }] } }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { message_id: 'om_owner_b' } }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const service = new FeishuNotificationService();
    const result = await service.sendWorkflowTransitionNotification({
      ...BASE_PAYLOAD,
      recipients: [
        { user_id: '1001', email: 'owner-a@pollo.ai', name: '负责人A', role: '研发负责人' },
        { user_id: '1002', email: 'owner-b@pollo.ai', name: '负责人B', role: '研发负责人' },
      ],
    });

    expect(result).toEqual(expect.objectContaining({ recipientCount: 2, sentCount: 1, failedCount: 1, skippedCount: 0 }));
    expect(result.errors?.[0]).toContain('负责人A');
    expect(fetchMock.mock.calls[4][0]).toContain('receive_id_type=user_id');
    expect(JSON.parse(String(fetchMock.mock.calls[4][1]?.body))).toEqual(expect.objectContaining({ receive_id: 'u_owner_b' }));
  });

  it('机器人对邮箱用户不可用时，应给出可用范围提示', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(okJson({ code: 0, tenant_access_token: 'tenant_token', expire: 7200 }))
      .mockResolvedValueOnce(okJson({ code: 0, data: { user_list: [{ email: 'joe@mail.pollo.ai', user_id: 'u_joe' }] } }))
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
    expect(fetchMock.mock.calls[2][0]).toContain('receive_id_type=user_id');
  });
});

function okJson(body: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
