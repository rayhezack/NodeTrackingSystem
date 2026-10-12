import { getOfficialEvents, getOfficialParams } from '../../worker/query-library';
import { resetFeishuTokenCache } from '../../worker/feishu-token';

describe('PolloCloud query library', () => {
  beforeEach(() => {
    resetFeishuTokenCache();
  });

  it('reads, filters and deduplicates official events from Feishu Base', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          items: [
            { record_id: 'rec-1', fields: { evt_id: 'home_show', '事件中文名': '首页曝光', '端': ['iOS'], '状态': '已上线' } },
            { record_id: 'rec-2', fields: { evt_id: 'home_show', '事件中文名': '首页曝光', '端': ['Android'], '状态': '已上线' } },
            { record_id: 'rec-3', fields: { evt_id: 'old_event', '事件中文名': '旧事件', '状态': '已废弃' } },
          ],
          has_more: false,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }));

    const result = await getOfficialEvents(
      credentials,
      { source: 'app', keyword: '首页', pageSize: 20 },
      fetchMock as unknown as typeof fetch,
    );

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(expect.objectContaining({
      recordId: 'app:rec-1',
      evtId: 'home_show',
      platform: 'iOS、Android',
    }));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(expect.objectContaining({ view_id: 'vewO0PlLph' }));
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual(expect.objectContaining({ view_id: 'vewiUagCFI' }));
  });

  it('reads official parameters linked to an event', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { record: { record_id: 'event-1', fields: { evt_id: 'home_show' } } },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          items: [
            {
              record_id: 'param-1',
              fields: {
                evt_id: 'home_show',
                '参数名': 'page_id',
                '数据类型': 'string',
                '必传规则': '必传',
                '条件说明': '仅登录用户',
                '枚举/取值范围': 'home, search',
                '版本': '8.2.0',
                '备注': '默认值/示例：home',
                'App适用性': 'iOS、Android',
                '关联事件': [{ id: 'event-1' }],
              },
            },
          ],
          has_more: false,
        },
      }));

    const result = await getOfficialParams(
      credentials,
      'app:event-1',
      fetchMock as unknown as typeof fetch,
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        paramKey: 'home_show.page_id',
        paramName: 'page_id',
        required: true,
        triggerCondition: '仅登录用户',
        enumRange: 'home, search',
        version: '8.2.0',
        notes: '默认值/示例：home',
        example: 'home',
        platform: 'App通用',
      }),
    ]);
    expect(result.baseLink).toContain('tblEYv9lGZeenbT2');
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual(expect.objectContaining({ view_id: 'vewiUagCFI' }));
  });

  it('finds events through parameter enum values and excludes retired parameters', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [
        { record_id: 'event-1', fields: { evt_id: 'purchase_submit', '事件中文名': '提交订单', '状态': '已上线' } },
        { record_id: 'event-2', fields: { evt_id: 'old_purchase', '事件中文名': '旧订单', '状态': '已废弃' } },
      ], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [
        { record_id: 'param-1', fields: { evt_id: 'purchase_submit', '参数名': 'channel', '枚举/取值范围': 'organic, referral', '参数状态': '已上线' } },
        { record_id: 'param-2', fields: { evt_id: 'old_purchase', '参数名': 'channel', '枚举/取值范围': 'referral', '参数状态': '已上线' } },
        { record_id: 'param-3', fields: { evt_id: 'another', '参数名': 'channel', '枚举/取值范围': 'referral', '参数状态': '已废弃' } },
      ], has_more: false } }));

    const result = await getOfficialEvents(credentials, { source: 'app', keyword: 'referral' }, fetchMock as unknown as typeof fetch);
    expect(result.items.map((item) => item.evtId)).toEqual(['purchase_submit']);
  });

  it('matches the primary category and combines category selection with search', async () => {
    const events = [
      { record_id: 'event-1', fields: { evt_id: 'sub_start', '事件中文名': '订阅弹窗曝光', '一级分类': '支付链路', '状态': '已上线' } },
      { record_id: 'event-2', fields: { evt_id: 'sub_result', '事件中文名': '订阅流程结果', '一级分类': '支付链路', '状态': '已上线' } },
      { record_id: 'event-3', fields: { evt_id: 'signup_result', '事件中文名': '注册结果', '一级分类': '注册', '状态': '已上线' } },
      { record_id: 'event-4', fields: { evt_id: 'old_payment', '事件中文名': '旧支付', '一级分类': '支付链路', '状态': '已废弃' } },
    ];
    const fetchMock = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/auth/')) return Promise.resolve(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }));
      const viewId = JSON.parse(String(init?.body)).view_id;
      return Promise.resolve(jsonResponse({ code: 0, data: { items: viewId === 'vewO0PlLph' ? events : [], has_more: false } }));
    });

    const byKeyword = await getOfficialEvents(credentials, { source: 'web', keyword: '支付' }, fetchMock as unknown as typeof fetch);
    const byCategory = await getOfficialEvents(credentials, { source: 'web', category: '支付链路' }, fetchMock as unknown as typeof fetch);
    const combined = await getOfficialEvents(credentials, { source: 'web', category: '支付链路', keyword: '结果' }, fetchMock as unknown as typeof fetch);

    expect(byKeyword.items.map((item) => item.evtId)).toEqual(['sub_start', 'sub_result']);
    expect(byKeyword.categories).toEqual(['支付链路', '注册']);
    expect(byCategory.items.map((item) => item.evtId)).toEqual(['sub_start', 'sub_result']);
    expect(combined.items.map((item) => item.evtId)).toEqual(['sub_result']);
    expect(combined.categories).toEqual(['支付链路', '注册']);
    expect(combined.items[0].category).toBe('支付链路');
  });

  it('reads Web events from the official view across cursor pages', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }));
    for (let page = 0; page < 2; page += 1) {
      fetchMock.mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          items: page === 0 ? [] : [{ record_id: 'event-1', fields: { evt_id: 'web_purchase', '事件中文名': 'Web 下单', '状态': '已上线' } }],
          has_more: page === 0,
          ...(page === 0 ? { page_token: 'cursor-1' } : {}),
        },
      }));
    }

    const result = await getOfficialEvents(credentials, { source: 'web' }, fetchMock as unknown as typeof fetch);

    expect(result.items.map((item) => item.evtId)).toEqual(['web_purchase']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(expect.objectContaining({ view_id: 'vewO0PlLph' }));
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual(expect.objectContaining({ view_id: 'vewO0PlLph' }));
    expect(new URL(fetchMock.mock.calls[2][0]).searchParams.get('page_token')).toBe('cursor-1');
  });
});

const credentials = { FEISHU_APP_ID: 'cli_test', FEISHU_APP_SECRET: 'secret' };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
