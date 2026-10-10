import {
  getTrackingDetail,
  getTrackingParams,
  getTrackingRecords,
  getWorkbenchDashboard,
} from '../../worker/tracking-read';
import { resetFeishuTokenCache } from '../../worker/feishu-token';

describe('PolloCloud tracking read service', () => {
  beforeEach(() => {
    resetFeishuTokenCache();
  });

  it('groups workbench events by request and builds stats and trusted-user todos', async () => {
    const fetchMock = workbenchFetch([
      {
        record_id: 'rec-1',
        fields: {
          '需求ID': 'REQ-1',
          '需求名称': '首页埋点改造',
          evt_id: 'home_show',
          '事件中文名': '首页曝光',
          '流程阶段': '埋点设计',
          '评审状态': '评审中',
          '优先级': 'P1',
          '端': ['iOS'],
          '数据负责人': [{ id: 'user-1', name: '张三', avatar_url: 'https://avatar/user-1' }],
          '创建时间': 100,
          '更新时间': 200,
        },
      },
      {
        record_id: 'rec-2',
        fields: {
          '需求ID': 'REQ-1',
          '需求名称': '首页埋点改造',
          evt_id: 'home_click',
          '事件中文名': '首页点击',
          '流程阶段': '埋点设计',
          '评审状态': '草稿',
          '优先级': 'P2',
          '端': ['Android'],
          '数据负责人': [{ id: 'user-1', name: '张三' }],
          '创建时间': 110,
          '更新时间': 190,
        },
      },
    ]);

    const result = await getWorkbenchDashboard(
      credentials,
      { source: 'app', pageSize: 10, todoLimit: 10 },
      'user-1',
      fetchMock as unknown as typeof fetch,
    );

    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual(expect.objectContaining({
      requestId: 'REQ-1',
      eventCount: 2,
      eventIds: expect.arrayContaining(['home_show', 'home_click']),
      platform: 'Android、iOS',
      uiStage: '埋点评审',
      dataOwnerAvatars: ['https://avatar/user-1'],
    }));
    expect(result.stats.find((item) => item.stage === '埋点评审')?.count).toBe(1);
    expect(result.todos).toEqual([
      expect.objectContaining({ requestId: 'REQ-1', targetStage: 'design', todoRole: '数据负责人' }),
    ]);
  });

  it('applies keyword and platform filters after grouping', async () => {
    const fetchMock = workbenchFetch([
      { record_id: 'app-1', fields: { evt_id: 'search_click', '事件中文名': '搜索点击', '流程阶段': '需求录入', '端': ['iOS'] } },
      { record_id: 'app-2', fields: { evt_id: 'home_show', '事件中文名': '首页曝光', '流程阶段': '需求录入', '端': ['Android'] } },
    ]);

    const result = await getTrackingRecords(
      credentials,
      { source: 'app', keyword: 'search', platform: 'iOS' },
      fetchMock as unknown as typeof fetch,
    );

    expect(result.items.map((item) => item.evtId)).toEqual(['search_click']);
  });

  it('returns a detail with permissions derived from the trusted actor', async () => {
    const current = {
      record_id: 'rec-1',
      fields: {
        '需求ID': 'REQ-1',
        '需求名称': '首页埋点',
        evt_id: 'home_show',
        '事件中文名': '首页曝光',
        '流程阶段': '埋点设计',
        '数据负责人': [{ id: 'user-1', name: '张三' }],
      },
    };
    const sibling = {
      record_id: 'rec-2',
      fields: { ...current.fields, evt_id: 'home_click', '事件中文名': '首页点击' },
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { record: current } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [current, sibling], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }));

    const result = await getTrackingDetail(credentials, 'app:rec-1', 'user-1', fetchMock as unknown as typeof fetch);

    expect(result.data).toEqual(expect.objectContaining({
      recordId: 'app:rec-1',
      evtId: 'home_show',
      dataOwner: [{ user_id: 'user-1', name: '张三' }],
      permissions: expect.objectContaining({ canEditDesign: true, canEditParams: true }),
    }));
    expect(result.data.relatedEvents).toHaveLength(2);
    expect(result.data.relatedEvents.find((item) => item.isCurrent)?.recordId).toBe('app:rec-1');
  });

  it('loads design parameters linked to the selected event', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { record: { record_id: 'rec-1', fields: { evt_id: 'home_show' } } },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          items: [{
            record_id: 'param-1',
            fields: {
              evt_id: 'home_show',
              '参数名': 'page_id',
              '数据类型': 'STRING',
              '必传规则': '必传',
              '来源设计记录ID': 'rec-1',
            },
          }],
          has_more: false,
        },
      }));

    const result = await getTrackingParams(credentials, 'app:rec-1', fetchMock as unknown as typeof fetch);

    expect(result).toEqual({
      total: 1,
      items: [expect.objectContaining({ recordId: 'app:param-1', paramKey: 'home_show.page_id', required: true })],
    });
  });
});

const credentials = { FEISHU_APP_ID: 'cli_test', FEISHU_APP_SECRET: 'secret' };

function workbenchFetch(items: Array<{ record_id: string; fields: Record<string, unknown> }>) {
  return jest.fn()
    .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
    .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items, has_more: false } }));
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
