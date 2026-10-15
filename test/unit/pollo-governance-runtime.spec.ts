import { getOfficialLibraryEvents, getOfficialEventContexts } from '../../worker/query-library';
import { resetFeishuTokenCache } from '../../worker/feishu-token';
import type { OfficialEvent } from '../../shared/api.interface';

const official = (evtId: string, source: 'web' | 'app' = 'web'): OfficialEvent => ({
  recordId: `${source}:${evtId}`, source, evtId, eventName: evtId,
  platform: source === 'web' ? 'Web' : 'iOS、Android', version: '1', status: '已上线', paramLink: '',
});
const credentials = { FEISHU_APP_ID: 'test', FEISHU_APP_SECRET: 'test-secret' };
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });

describe('Pollo governance production runtime', () => {
  beforeEach(() => resetFeishuTokenCache());

  it('reads every official page before choosing reuse candidates', async () => {
    const mock = jest.fn()
      .mockResolvedValueOnce(json({ code: 0, tenant_access_token: 'test-token', expire: 7200 }))
      .mockResolvedValueOnce(json({ code: 0, data: { items: [{ record_id: 'first', fields: { evt_id: 'page_view' } }], has_more: true, page_token: 'next' } }))
      .mockResolvedValueOnce(json({ code: 0, data: { items: [
        { record_id: 'second', fields: { evt_id: 'createflow_form_submit', 事件定义: '提交创作表单' } },
        { record_id: 'old', fields: { evt_id: 'old', 状态: '已废弃' } },
      ], has_more: false } }));
    const events = await getOfficialLibraryEvents(credentials, 'web', mock as typeof fetch);
    expect(events.map((event) => event.evtId)).toEqual(['page_view', 'createflow_form_submit']);
    expect(mock.mock.calls[2][0]).toContain('page_token=next');
  });

  it('groups Web and App parameters independently and excludes deprecated ones', async () => {
    const mock = jest.fn(async (url: string | URL | Request) => {
      if (String(url).includes('tenant_access_token')) return json({ code: 0, tenant_access_token: 'test-token', expire: 7200 });
      const source = String(url).includes('EX4RbTvp9agYNws6PIHcKD20nqf') ? 'web' : 'app';
      return json({ code: 0, data: { items: [
        { record_id: 'param', fields: { evt_id: 'same_event', 参数名: `${source}_source`, 数据类型: 'STRING', 关联事件: [{ id: 'same_event' }] } },
        { record_id: 'old', fields: { evt_id: 'same_event', 参数名: 'old', 参数状态: '已废弃' } },
      ], has_more: false } });
    });
    const result = await getOfficialEventContexts(credentials, [official('same_event', 'web'), official('same_event', 'app')], mock as typeof fetch);
    expect(result.map((context) => context.params.map((param) => param.paramName))).toEqual([['web_source'], ['app_source']]);
    expect(mock.mock.calls.filter(([url]) => String(url).includes('/records/search'))).toHaveLength(2);
  });

});
