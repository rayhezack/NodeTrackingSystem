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

describe('archive enum dictionary synchronization', () => {
  beforeEach(() => resetFeishuTokenCache());
  it('promotes a draft row, appends only missing values, preserves definitions and safely repeats', async () => {
    const { records, writes, fetchMock } = fixture();
    const archive = () => updateTrackingRecord(credentials, 'web:design-event', { stageId: 'launch', targetStage: '稳定归档', fields: {} }, 'owner', fetchMock);
    await archive();
    expect(records[tables.params][0].fields).toMatchObject({ 参数定义: '当前页面', '枚举/取值范围': 'home_agent\npollo_motion\nnew_value' });
    expect(records[tables.enums]).toHaveLength(3);
    expect(records[tables.enums][1].fields).toMatchObject({ 枚举状态: '正式', 枚举定义: 'Motion 页面', 关联设计参数: ['design-param'], 关联正式参数: ['official-param'] });
    expect(records[tables.params][0].fields['枚举字典']).toEqual(['old-enum', 'draft-enum', expect.any(String)]);
    expect(writes.filter((write) => write.table).at(-1)?.table).toBe(tables.workbench);
    await archive();
    expect(records[tables.enums]).toHaveLength(3);
    expect(records[tables.workbench][0].fields['流程阶段']).toBe('稳定归档');
  });
  it('does not demote an official enum when another design reuses it', async () => {
    const { records, fetchMock } = fixture();
    records[tables.workbench][0].fields['流程阶段'] = '埋点设计';
    const { updateTrackingParam } = await import('../../worker/tracking-write');
    await updateTrackingParam(credentials, 'web:design-param', {
      fields: { enumRange: 'home_agent', definition: '本需求定义' },
    }, 'owner', fetchMock);
    expect(records[tables.enums][0].fields['枚举状态']).toBe('正式');
    expect(records[tables.enums][0].fields['关联设计参数']).toEqual(['design-param']);
  });
  it('keeps every sibling in launch when a later event fails, even after an earlier event synchronized', async () => {
    const { records, fetchMock } = fixture();
    records[tables.workbench].push({ record_id: 'later-event', fields: {
      ...records[tables.workbench][0].fields, evt_id: 'new_event', 事件中文名: '新事件',
    } });
    let fail = true;
    const transport: typeof fetch = async (input, init) => {
      if (fail && String(input).includes(`${tables.official}/records/batch_create`)) {
        return new Response(JSON.stringify({ code: 999, msg: 'later event failed' }));
      }
      return fetchMock(input, init);
    };
    const archive = () => updateTrackingRecord(credentials, 'web:design-event', { stageId: 'launch', targetStage: '稳定归档', fields: {} }, 'owner', transport);
    await expect(archive()).rejects.toThrow('later event failed');
    expect(records[tables.params][0].fields['枚举/取值范围']).toContain('pollo_motion');
    expect(records[tables.workbench].map((row) => row.fields['流程阶段'])).toEqual(['上线监控', '上线监控']);
    fail = false;
    await archive();
    expect(records[tables.workbench].map((row) => row.fields['流程阶段'])).toEqual(['稳定归档', '稳定归档']);
    expect(records[tables.enums]).toHaveLength(3);
  });
  it('does not mark the request archived when enum sync fails; retry recovers partially written values', async () => {
    const { records, setFail, fetchMock } = fixture();
    setFail(true);
    const archive = () => updateTrackingRecord(credentials, 'web:design-event', { stageId: 'launch', targetStage: '稳定归档', fields: {} }, 'owner', fetchMock);
    await expect(archive()).rejects.toThrow('enum write failed');
    expect(records[tables.workbench][0].fields['流程阶段']).toBe('上线监控');
    setFail(false);
    await archive();
    expect(records[tables.enums]).toHaveLength(3);
    expect(records[tables.workbench][0].fields['流程阶段']).toBe('稳定归档');
  });
});
