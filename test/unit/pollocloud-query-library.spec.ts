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
      }));

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
        platform: 'App通用',
      }),
    ]);
    expect(result.baseLink).toContain('tblEYv9lGZeenbT2');
  });
});

const credentials = { FEISHU_APP_ID: 'cli_test', FEISHU_APP_SECRET: 'secret' };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
