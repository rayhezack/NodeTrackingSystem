import { reuseOfficialTrackingEvent } from '../../worker/tracking-write';
import { resetFeishuTokenCache } from '../../worker/feishu-token';

type Row = { record_id: string; fields: Record<string, unknown> };
const creds = { FEISHU_APP_ID: 'test', FEISHU_APP_SECRET: 'test' };
const tables = { workbench: 'tblsFFvYkTPkabFT', params: 'tblMaw89yVi68YY6', official: 'tbly7VI4kwFz5qwR', formalParams: 'tblNAMKr5S38iXJQ', enums: 'tbl2KEj2zyg8bOmk' };
function fixture() {
  const rows: Record<string, Row[]> = {
    [tables.workbench]: [{ record_id: 'draft', fields: { evt_id: '', 需求ID: 'REQ', 事件中文名: '需求', 流程阶段: '埋点设计', 数据负责人: [{ id: 'owner' }] } }],
    [tables.params]: [],
    [tables.official]: [{ record_id: 'official', fields: { evt_id: 'creation_template_view', 事件中文名: '模板曝光', 事件定义: '正式定义', 触发时机: '曝光时', 上线版本: '1.0.0' } }],
    [tables.formalParams]: [
      { record_id: 'position', fields: { evt_id: 'creation_template_view', 参数名: 'position', 参数主键: 'creation_template_view.position', 数据类型: 'STRING', '枚举/取值范围': '1\n2\n...', 参数定义: '1-based 列表位置' } },
      { record_id: 'page', fields: { evt_id: 'creation_template_view', 参数名: 'page_name', 参数主键: 'creation_template_view.page_name', 数据类型: 'STRING', '枚举/取值范围': 'home', 参数定义: '当前页面' } },
    ],
    [tables.enums]: [{ record_id: 'enum-home', fields: { evt_id: 'creation_template_view', 参数名: 'page_name', 枚举值: 'home', 枚举状态: '正式', 关联正式参数: ['page'] } }],
  };
  let failAfterWrite = '';
  const writes: string[] = [];
  const transport = jest.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input); const reply = (data: unknown) => new Response(JSON.stringify(data));
    if (url.includes('tenant_access_token')) return reply({ code: 0, tenant_access_token: 'token', expire: 7200 });
    const table = url.match(/tables\/([^/]+)/)?.[1] || '';
    const action = url.split('/records')[1]?.split('?')[0] || '';
    const body = JSON.parse(String(init?.body || '{}'));
    if (action === '/search') {
      const permissions = body.filter?.conditions?.some((item: { value: string[] }) => item.value.includes('__system_permissions__'));
      return reply({ code: 0, data: { items: permissions ? [] : rows[table], has_more: false } });
    }
    if (init?.method !== 'POST') return reply({ code: 0, data: { record: rows[table].find((row) => row.record_id === action.slice(1)) } });
    writes.push(table + action);
    if (action === '/batch_create') {
      const created = body.records.map((item: { fields: Record<string, unknown> }, index: number) => ({ record_id: `created-${rows[table].length + index}`, fields: item.fields }));
      rows[table].push(...created);
      if (failAfterWrite === table) { failAfterWrite = ''; throw new Error('response lost after write'); }
      return reply({ code: 0, data: { records: created } });
    }
    if (action === '/batch_update') {
      for (const item of body.records) Object.assign(rows[table].find((row) => row.record_id === item.record_id)!.fields, item.fields);
      if (failAfterWrite === table) { failAfterWrite = ''; throw new Error('response lost after write'); }
      return reply({ code: 0, data: { records: body.records } });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const reuse = (keys = ['creation_template_view.position', 'creation_template_view.page_name']) => reuseOfficialTrackingEvent(creds, 'web:draft', { officialRecordId: 'web:official', officialParamKeys: keys }, 'owner', transport);
  return { rows, writes, reuse, fail: (table: string) => { failAfterWrite = table; } };
}
describe('reusing existing events can resume safely', () => {
  beforeEach(() => resetFeishuTokenCache());
  it('copies a legacy numeric range verbatim and references existing dictionary rows instead of parsing placeholders', async () => {
    const { rows, writes, reuse } = fixture();
    await expect(reuse()).resolves.toMatchObject({ importedParamCount: 2, recordId: 'web:draft' });
    expect(rows[tables.params].find((row) => row.fields['参数名'] === 'position')!.fields['枚举/取值范围']).toBe('1\n2\n...');
    expect(rows[tables.params].find((row) => row.fields['参数名'] === 'page_name')!.fields['枚举字典']).toEqual(['enum-home']);
    expect(writes.some((write) => write.startsWith(tables.enums))).toBe(false);
  });
  it.each([tables.workbench, tables.params])('resumes after a lost response from %s without duplicating events or parameters', async (table) => {
    const { rows, reuse, fail } = fixture();
    fail(table);
    await expect(reuse()).rejects.toThrow('response lost');
    await expect(reuse()).resolves.toMatchObject({ success: true });
    expect(rows[tables.workbench]).toHaveLength(1);
    expect(rows[tables.params]).toHaveLength(2);
    await expect(reuse()).resolves.toMatchObject({ importedParamCount: 0, skippedParamCount: 2 });
    expect(rows[tables.params]).toHaveLength(2);
  });
  it('preserves existing edits and fills only missing selected parameters and dictionary references', async () => {
    const { rows, reuse } = fixture();
    await reuse(['creation_template_view.position']);
    rows[tables.workbench][0].fields['事件定义'] = '用户保留的设计内容';
    rows[tables.params][0].fields['本次需求说明'] = '用户编辑内容';
    await reuse();
    expect(rows[tables.workbench][0].fields['事件定义']).toBe('用户保留的设计内容');
    expect(rows[tables.params][0].fields['本次需求说明']).toBe('用户编辑内容');
    expect(rows[tables.params]).toHaveLength(2);
  });
});
