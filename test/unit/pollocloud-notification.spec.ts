import { sendWorkflowNotification, type WorkflowTransitionNotification } from '../../worker/feishu-notification';
import { resetFeishuTokenCache } from '../../worker/feishu-token';

describe('PolloCloud Feishu notification client', () => {
  beforeEach(() => {
    resetFeishuTokenCache();
  });

  it('sends an interactive card directly to a Base user_id', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { message_id: 'message-1' } }));

    const result = await sendWorkflowNotification(
      { ...credentials, TRACKING_APP_URL: 'https://tracking.pollocloud.com/' },
      { ...payload, recipients: [{ user_id: 'user-1', name: '张三', role: '数据负责人' }] },
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual(expect.objectContaining({ recipientCount: 1, sentCount: 1, failedCount: 0 }));
    expect(fetchMock.mock.calls[1][0]).toContain('/im/v1/messages?receive_id_type=user_id');
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body).toEqual(expect.objectContaining({ receive_id: 'user-1', msg_type: 'interactive' }));
    expect(body.content).toContain('https://tracking.pollocloud.com/tracking/app%3Arec-1');
  });

  it('resolves an email when only an app-specific open_id is available', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { user_list: [{ email: 'owner@example.com', user_id: 'user-2' }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { message_id: 'message-2' } }));

    const result = await sendWorkflowNotification(
      credentials,
      { ...payload, recipients: [{ user_id: 'ou_other_app', email: 'owner@example.com', name: '李四' }] },
      fetchMock as unknown as typeof fetch,
    );

    expect(result.sentCount).toBe(1);
    expect(fetchMock.mock.calls[1][0]).toContain('/contact/v3/users/batch_get_id');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual(expect.objectContaining({ receive_id: 'user-2' }));
  });

  it('maps a default project member legacy numeric id through email before sending', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { user_list: [{ email: 'ray@mail.pollo.ai', user_id: 'sunwen-1663469' }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { message_id: 'message-3' } }));

    const result = await sendWorkflowNotification(
      credentials,
      { ...payload, recipients: [{ user_id: '1867390536304713', name: '孙文', role: '数据负责人' }] },
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual(expect.objectContaining({ recipientCount: 1, sentCount: 1, failedCount: 0 }));
    expect(fetchMock.mock.calls[1][0]).toContain('/contact/v3/users/batch_get_id?user_id_type=user_id');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      emails: ['ray@mail.pollo.ai'],
      include_resigned: false,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual(expect.objectContaining({
      receive_id: 'sunwen-1663469',
    }));
  });

  it('does not send an unresolved legacy numeric id as a Feishu user_id', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }));

    const result = await sendWorkflowNotification(
      credentials,
      { ...payload, recipients: [{ user_id: '1860000000000000000', name: '未知人员' }] },
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual(expect.objectContaining({ recipientCount: 1, sentCount: 0, skippedCount: 1, failedCount: 0 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

const credentials = { FEISHU_APP_ID: 'cli_test', FEISHU_APP_SECRET: 'secret' };
const payload: WorkflowTransitionNotification = {
  source: 'app',
  recordId: 'app:rec-1',
  requestId: 'REQ-1',
  requestName: '首页埋点改造',
  fromStage: '需求录入',
  toStage: '埋点设计',
  actionText: '请完成埋点设计',
  targetStageId: 'design',
  priority: 'P1',
  platform: 'iOS、Android',
  eventIds: ['home_show'],
  eventNames: ['首页曝光'],
  recipients: [],
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
