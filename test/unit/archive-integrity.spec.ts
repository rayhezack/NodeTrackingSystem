import { updateTrackingRecord } from '../../worker/tracking-write';
import { resetFeishuTokenCache } from '../../worker/feishu-token';

const credentials = { FEISHU_APP_ID: 'test', FEISHU_APP_SECRET: 'test' };
const tables = { workbench: 'tblsFFvYkTPkabFT', design: 'tblMaw89yVi68YY6', official: 'tbly7VI4kwFz5qwR', params: 'tblNAMKr5S38iXJQ', enums: 'tbl2KEj2zyg8bOmk' };
type Row = { record_id: string; fields: Record<string, unknown> };
function fixture() {
  const records: Record<string, Row[]> = {
    [tables.workbench]: [{ record_id: 'design-event', fields: { evt_id: 'scene_capsule_click', 事件中文名: '气泡点击', 需求ID: 'WEB_REQ_MOTION', 流程阶段: '上线监控', 上线监控状态: '通过', 数据负责人: [{ id: 'owner' }], 端: ['Web'], 版本: '2.0' } }],
    [tables.official]: [{ record_id: 'official-event', fields: { evt_id: 'scene_capsule_click', 事件中文名: '正式气泡点击' } }],
    [tables.design]: [{ record_id: 'design-param', fields: { evt_id: 'scene_capsule_click', 参数名: 'page_name', 来源设计记录ID: 'design-event', '枚举/取值范围': 'home_agent\npollo_motion\npollo_motion\nnew_value', 枚举字典: ['draft-enum'], 参数状态: '草稿', 参数定义: '需求不应覆盖正式定义' } }],
    [tables.params]: [{ record_id: 'official-param', fields: { 参数主键: 'scene_capsule_click.page_name', evt_id: 'scene_capsule_click', 参数名: 'page_name', '枚举/取值范围': 'home_agent', 枚举字典: ['old-enum'], 参数定义: '当前页面', 参数状态: '正式' } }],
    [tables.enums]: [
      { record_id: 'old-enum', fields: { 枚举主键: 'scene_capsule_click.page_name.home_agent', 枚举值: 'home_agent', evt_id: 'scene_capsule_click', 参数名: 'page_name', 枚举状态: '正式', 关联正式参数: ['official-param'] } },
      { record_id: 'draft-enum', fields: { 枚举主键: 'scene_capsule_click.page_name.pollo_motion', 枚举值: 'pollo_motion', evt_id: 'scene_capsule_click', 参数名: 'page_name', 枚举状态: '草稿', 枚举定义: 'Motion 页面', 关联设计参数: ['design-param'] } },
    ],
  };
  const writes: Array<{ table: string; action: string }> = [];
  let failEnums = false;
  const fetchMock = jest.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const reply = (data: unknown) => new Response(JSON.stringify(data));
    if (url.includes('tenant_access_token')) return reply({ code: 0, tenant_access_token: 'token', expire: 7200 });
    const table = url.match(/tables\/([^/]+)/)?.[1] || '';
    const action = url.split('/records')[1]?.split('?')[0] || '';
    const body = JSON.parse(String(init?.body || '{}'));
    if (action === '/search') {
      const isPermissions = body.filter?.conditions?.some((condition: { field_name: string }) => condition.field_name === 'evt_id');
      return reply({ code: 0, data: { items: isPermissions ? [] : records[table] || [], has_more: false } });
    }
    if (init?.method !== 'POST') {
      return reply({ code: 0, data: { record: records[table]?.find((row) => row.record_id === action.slice(1)) } });
    }
    writes.push({ table, action });
    if (table === tables.enums && failEnums) return reply({ code: 999, msg: 'enum write failed' });
    if (action === '/batch_update') {
      for (const row of body.records) {
        const previous = records[table]?.find((item) => item.record_id === row.record_id);
        if (previous) Object.assign(previous.fields, row.fields);
      }
      return reply({ code: 0, data: { records: body.records } });
    }
    if (action === '/batch_create') {
      const created = body.records.map((row: { fields: Record<string, unknown> }, index: number) => ({ record_id: `created-${records[table].length + index}`, fields: row.fields }));
      records[table].push(...created);
      return reply({ code: 0, data: { records: created } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  return { records, writes, fetchMock, setFail: (value: boolean) => { failEnums = value; } };
}

describe('archive integrity safeguards', () => {
  beforeEach(() => resetFeishuTokenCache());
  const body = { stageId: 'launch', targetStage: '稳定归档', fields: {} };
  it('does not approve enums attached to a pending-governance parameter', async () => {
    const { records, fetchMock } = fixture();
    records[tables.params][0].fields['参数状态'] = '待治理';
    await expect(updateTrackingRecord(credentials, 'web:design-event', body, 'owner', fetchMock)).rejects.toThrow('尚待治理');
    expect(records[tables.workbench][0].fields['流程阶段']).toBe('上线监控');
    expect(records[tables.params][0].fields['枚举/取值范围']).toBe('home_agent');
  });

  it('rejects repeated design parameters before inserting formal parameters', async () => {
    const { records, fetchMock } = fixture();
    records[tables.params] = [];
    records[tables.design].push({ record_id: 'duplicate-design-param', fields: { ...records[tables.design][0].fields } });
    await expect(updateTrackingRecord(credentials, 'web:design-event', body, 'owner', fetchMock)).rejects.toThrow('重复参数');
    expect(records[tables.params]).toHaveLength(0);
  });

  it('retains existing dictionary-only values and their links', async () => {
    const { records, fetchMock } = fixture();
    records[tables.params][0].fields['枚举字典'] = ['old-enum', 'dictionary-only'];
    records[tables.enums].push({ record_id: 'dictionary-only', fields: {
      枚举主键: 'scene_capsule_click.page_name.dictionary_only', 枚举值: 'dictionary_only', 枚举状态: '正式', 关联正式参数: ['official-param'],
    } });
    await updateTrackingRecord(credentials, 'web:design-event', body, 'owner', fetchMock);
    expect(records[tables.params][0].fields['枚举字典']).toContain('dictionary-only');
  });

  it('preserves case-sensitive enum values', async () => {
    const { records, fetchMock } = fixture();
    records[tables.design][0].fields['枚举/取值范围'] = 'Agent\nagent';
    await updateTrackingRecord(credentials, 'web:design-event', body, 'owner', fetchMock);
    expect(records[tables.params][0].fields['枚举/取值范围']).toBe('home_agent\nAgent\nagent\npollo_motion');
  });

  it('refuses to select an arbitrary duplicate formal parameter', async () => {
    const { records, fetchMock } = fixture();
    records[tables.params].push({ record_id: 'pending-duplicate', fields: {
      ...records[tables.params][0].fields, 参数状态: '待治理',
    } });
    await expect(updateTrackingRecord(credentials, 'web:design-event', body, 'owner', fetchMock)).rejects.toThrow('重复参数');
    expect(records[tables.params][0].fields['枚举/取值范围']).toBe('home_agent');
  });

  it('normalizes unambiguous legacy mixed separators', async () => {
    const { records, fetchMock } = fixture();
    records[tables.params][0].fields['枚举/取值范围'] = 'director_create,TextToImage // 文本生图；AIPhotoEditor // 图片编辑';
    records[tables.design][0].fields['枚举/取值范围'] = 'new_value';
    await updateTrackingRecord(credentials, 'web:design-event', body, 'owner', fetchMock);
    expect(records[tables.enums].some((row) => row.fields['枚举值'] === 'director_create,TextToImage')).toBe(false);
    expect(records[tables.enums].some((row) => row.fields['枚举值'] === 'director_create')).toBe(true);
  });
  it('rejects incomplete pagination before archiving', async () => {
    const { records, fetchMock } = fixture();
    const transport: typeof fetch = async (input, init) => {
      if (String(input).includes(`${tables.design}/records/search`)) {
        return new Response(JSON.stringify({ code: 0, data: { items: [], has_more: true } }));
      }
      return fetchMock(input, init);
    };
    await expect(updateTrackingRecord(credentials, 'web:design-event', body, 'owner', transport)).rejects.toThrow();
    expect(records[tables.workbench][0].fields['流程阶段']).toBe('上线监控');
    expect(records[tables.params][0].fields['枚举/取值范围']).toBe('home_agent');
  });

  it('rejects missing event IDs before archiving', async () => {
    const { records, fetchMock } = fixture();
    records[tables.official] = [];
    const transport: typeof fetch = async (input, init) => {
      if (String(input).includes(`${tables.official}/records/batch_create`)) {
        return new Response(JSON.stringify({ code: 0, data: { records: [] } }));
      }
      return fetchMock(input, init);
    };
    await expect(updateTrackingRecord(credentials, 'web:design-event', body, 'owner', transport)).rejects.toThrow();
    expect(records[tables.workbench][0].fields['流程阶段']).toBe('上线监控');
    expect(records[tables.official]).toHaveLength(0);
  });
});
