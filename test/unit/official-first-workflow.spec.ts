import { webcrypto } from 'node:crypto';
import type { AiTrackingDraftEvent } from '../../shared/api.interface';
import { assertFreshGovernance, designPrompt, enforceGovernance, generateReusePlan, governanceReport, normalizeReusePlan, readGovernanceSnapshot, reusePlanningPrompt, type GovernanceTable } from '../../shared/official-first-workflow';
import { getOfficialGovernanceSnapshot } from '../../worker/query-library';
import { resetFeishuTokenCache } from '../../worker/feishu-token';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

function rows() {
  return {
    events: [
      ...Array.from({ length: 40 }, (_, index) => ({ id: `other${index}`, record: { evt_id: `other_${index}`, 状态: '已上线', 端: 'Web' } })),
      { id: 'template', record: { evt_id: 'creation_template_view', 事件中文名: '模板曝光', 状态: '已上线', 端: 'Web', 触发时机: '卡片有效曝光时' } },
      { id: 'deprecated', record: { evt_id: 'page_leave', 状态: '已上线', 生命周期状态: '已废弃', 端: 'Web' } },
    ],
    params: Array.from({ length: 35 }, (_, index) => ({ id: `p${index}`, record: {
      evt_id: 'creation_template_view', 参数名: `field_${index}`, 数据类型: 'STRING', 必传规则: '条件必传',
      条件说明: '卡片有标识时', 参数状态: '正式', 参数定义: '历史正式参数', '枚举/取值范围': 'show_case',
    } })),
    commonProps: [{ id: 'common', record: { 属性名: 'page_name', 格式: 'STRING', 定义: '页面', 上报范围: '所有事件' } }],
    enums: [{ id: 'enum', record: { evt_id: 'creation_template_view', 参数名: 'field_0', 枚举值: 'show_case', 枚举状态: '草稿' } }],
  };
}
async function snapshot() { const records = rows(); return readGovernanceSnapshot('web', async (table) => records[table]); }
const planFor = (evtId = 'creation_template_view', decision = 'reuse') => ({ primaryBoard: '模板使用', decisions: [{ evtId, decision, reason: '正式定义可以覆盖卡片曝光，复用正式事件', comparedEventIds: ['creation_template_view'] }] });
function draft(overrides: Partial<AiTrackingDraftEvent> = {}): AiTrackingDraftEvent {
  return { clientId: 'test', evtId: 'creation_template_view', eventName: '模板曝光', eventDefinition: '模板卡片曝光',
    triggerTiming: '卡片有效曝光时', metricScenario: '', priority: 'P1', platform: 'Web', handler: '前端',
    commonProps: '', version: '待确认', minVersion: '待确认', changeType: '修改', evidence: [], uncertainties: [], params: [], ...overrides };
}

describe('official-first workflow', () => {
  it('repairs a plan containing a deprecated archived event once, while preserving the gate', async () => {
    const records = rows();
    records.events[41].record = { evt_id: 'page_leave', 状态: '已废弃', 生命周期状态: '稳定归档', 端: 'Web' };
    const library = await readGovernanceSnapshot('web', async (table) => records[table]);
    const generate = jest.fn().mockResolvedValueOnce(planFor('page_leave')).mockResolvedValueOnce(planFor());
    const plan = await generateReusePlan(library, { currentEvents: ['page_leave'] }, generate);
    expect(plan.decisions[0].evtId).toBe('creation_template_view');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][0]).toContain('"canReuse":false');
    expect(generate.mock.calls[1][0]).toContain('状态：已废弃；生命周期：稳定归档');
  });

  it('stops after one unsuccessful repair and never retries model transport failures', async () => {
    const library = await snapshot();
    const invalid = jest.fn().mockResolvedValue(planFor('page_leave'));
    await expect(generateReusePlan(library, {}, invalid)).rejects.toThrow('不可复用');
    expect(invalid).toHaveBeenCalledTimes(2);
    const offline = jest.fn().mockRejectedValue(new Error('model unavailable'));
    await expect(generateReusePlan(library, {}, offline)).rejects.toThrow('model unavailable');
    expect(offline).toHaveBeenCalledTimes(1);
  });

  it('includes late catalog entries, all 35 parameters, common properties and enum status in the two stages', async () => {
    const library = await snapshot();
    const plan = normalizeReusePlan(planFor(), library);
    expect(reusePlanningPrompt(library, {})).toContain('creation_template_view');
    const prompt = designPrompt(library, plan, {});
    expect(prompt).toContain('field_34');
    expect(prompt).toContain('page_name');
    expect(prompt).toContain('草稿');
    const result = enforceGovernance([draft()], library, plan)[0];
    expect(result.params).toHaveLength(35);
    expect(result.reuseSource?.recordId).toBe('web:template');
    expect(result.params[34].triggerCondition).toBe('卡片有标识时');
  });

  it('preserves history IDs and converts an exact existing event proposed as new into reuse', async () => {
    const library = await snapshot();
    const plan = normalizeReusePlan(planFor('creation_template_view', 'new'), library);
    expect(plan.decisions[0].decision).toBe('reuse');
    expect(enforceGovernance([draft({ changeType: '新增' })], library, plan)[0].changeType).toBe('修改');
  });

  it('blocks known duplicate aliases, deprecated lifecycle, and unproven reuse references', async () => {
    const library = await snapshot();
    expect(() => normalizeReusePlan(planFor('template_card_expose', 'new'), library)).toThrow('重复');
    expect(() => normalizeReusePlan(planFor('page_leave'), library)).toThrow('不可复用');
    const plan = normalizeReusePlan(planFor(), library);
    expect(() => enforceGovernance([draft({ reuseSource: { recordId: 'app:template', evtId: 'creation_template_view', eventName: '', modificationSummary: '' } })], library, plan)).toThrow('不一致');
    expect(() => enforceGovernance([draft({ evtId: 'template_card_click' })], library, plan)).toThrow('不一致');
  });

  it('removes common properties and flags draft enums rather than calling them verified', async () => {
    const library = await snapshot();
    const plan = normalizeReusePlan(planFor(), library);
    const param = { paramName: 'field_0', paramType: 'STRING', requiredRule: '条件必传', triggerCondition: '卡片有标识时', enumRange: 'show_case\nnew_value // 待确认', definition: '历史正式参数', defaultValue: '', example: 'show_case', platform: 'Web通用', source: 'ai' as const, uncertainties: [] };
    const events = enforceGovernance([draft({ params: [param, { ...param, paramName: 'page_name' }] })], library, plan);
    expect(events[0].params.some((item) => item.paramName === 'page_name')).toBe(false);
    expect(events[0].commonProps).toBe(library.events.find((event) => event.evtId === 'creation_template_view')!.commonProps);
    expect(events[0].params[0].enumRange).toBe('show_case\nnew_value');
    expect(events[0].params[0].uncertainties.join(' ')).toMatch(/草稿.*new_value/);
    expect(governanceReport(library, plan, events).checks.find((check) => check.name === '枚举和新增参数')?.status).toBe('pending');
  });

  it('blocks parameter type/required-condition conflicts and duplicate parameter names', async () => {
    const library = await snapshot();
    const plan = normalizeReusePlan(planFor(), library);
    const base = enforceGovernance([draft()], library, plan)[0];
    expect(() => enforceGovernance([{ ...base, params: [{ ...base.params[0], paramType: 'INTEGER' }] }], library, plan)).toThrow('类型冲突');
    expect(() => enforceGovernance([{ ...base, params: [{ ...base.params[0], triggerCondition: '' }] }], library, plan)).toThrow('条件冲突');
    expect(() => enforceGovernance([{ ...base, params: [base.params[0], base.params[0]] }], library, plan)).toThrow('重复参数');
  });

  it('preserves reused metadata and parameter definitions while retaining proposals only in request notes', async () => {
    const library = await snapshot();
    const formal = library.events.find((event) => event.evtId === 'creation_template_view')!;
    formal.eventDefinition = '通用模板曝光';
    formal.commonProps = 'page_name';
    formal.handler = '前端';
    formal.version = '1.0';
    const plan = normalizeReusePlan(planFor(), library);
    const base = enforceGovernance([draft()], library, plan)[0];
    const result = enforceGovernance([{ ...base, eventName: 'Motion 新模板曝光', eventDefinition: '仅 Motion 页面',
      triggerTiming: '悬停 Remix 时', commonProps: 'new_prop', version: '2.0', requestNotes: '本需求位置：右侧瀑布流',
      params: [{ ...base.params[0], definition: '仅本项目按钮名称', example: '本需求新增 remix', defaultValue: 'remix',
        enumRange: 'remix', requestNotes: '点击后未提交也记录' }],
    }], library, plan)[0];
    expect(result).toMatchObject({ eventName: formal.eventName, eventDefinition: formal.eventDefinition,
      triggerTiming: formal.triggerTiming, commonProps: formal.commonProps, version: formal.version });
    expect(result.requestNotes).toContain('本需求位置：右侧瀑布流');
    expect(result.requestNotes).toContain('悬停 Remix 时');
    expect(result.params[0]).toMatchObject({ definition: '历史正式参数', example: '', defaultValue: '',
      enumRange: 'show_case\nremix', source: 'official_modified' });
    expect(result.params[0].requestNotes).toContain('点击后未提交也记录');
    expect(result.params[0].requestNotes).toContain('仅本项目按钮名称');
    const applied = enforceGovernance([result], library, plan)[0];
    expect(applied.requestNotes).toBe(result.requestNotes);
    expect(applied.params[0]).toEqual(result.params[0]);
    expect(applied.eventDefinition).toBe(formal.eventDefinition);
    expect(() => assertFreshGovernance({ ...governanceReport(library, plan, [result]), workflowVersion: 'official-first-v2' } as never, library)).toThrow('旧版');
  });

  it('treats BOOL and BOOLEAN as compatible while preserving the formal type', async () => {
    const library = await snapshot();
    library.contexts.find((context) => context.event.evtId === 'creation_template_view')!.params[0].paramType = 'BOOL';
    const plan = normalizeReusePlan(planFor(), library);
    const base = enforceGovernance([draft()], library, plan)[0];
    expect(enforceGovernance([{ ...base, params: [{ ...base.params[0], paramType: 'BOOLEAN' }] }], library, plan)[0].params[0].paramType).toBe('BOOL');
  });

  it('requires comparisons for new events and rejects missing tables and schema mismatch', async () => {
    const library = await snapshot();
    expect(() => normalizeReusePlan({ primaryBoard: '模板使用', decisions: [{ evtId: 'new_event', decision: 'new', reason: '新需求' }] }, library)).toThrow('未对比');
    const records = rows();
    await expect(readGovernanceSnapshot('web', async (table) => table === 'commonProps' ? [] : records[table])).rejects.toThrow('公共属性');
    await expect(readGovernanceSnapshot('web', async (table) => table === 'enums' ? [{ id: 'bad', record: { wrong_field: 'x' } }] : records[table])).rejects.toThrow('结构不匹配');
  });

  it('fingerprints are stable across row order but detect drift; old drafts cannot apply', async () => {
    const library = await snapshot();
    const records = rows();
    const reordered = await readGovernanceSnapshot('web', async (table) => [...records[table]].reverse());
    expect(reordered.fingerprint).toBe(library.fingerprint);
    const plan = normalizeReusePlan(planFor(), library);
    const report = governanceReport(library, plan, enforceGovernance([draft()], library, plan));
    expect(() => assertFreshGovernance(report, reordered)).not.toThrow();
    expect(() => assertFreshGovernance(undefined, library)).toThrow('旧版');
    expect(() => assertFreshGovernance(report, { ...library, fingerprint: 'changed' })).toThrow('已变化');
  });

  it('production adapter scans four tables without UI views/projections and follows every page', async () => {
    resetFeishuTokenCache();
    const records = rows();
    const mapping: Record<string, GovernanceTable> = { tbly7VI4kwFz5qwR: 'events', tblNAMKr5S38iXJQ: 'params', tblb783YDTiBNts0: 'commonProps', tbl2KEj2zyg8bOmk: 'enums' };
    const json = (value: unknown) => new Response(JSON.stringify(value));
    const mock = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('tenant_access_token')) return json({ code: 0, tenant_access_token: 'token', expire: 7200 });
      const key = mapping[url.match(/tables\/([^/]+)/)![1]];
      const body = JSON.parse(String(init?.body));
      expect(body.view_id).toBeUndefined();
      expect(body.field_names).toBeUndefined();
      const data = records[key].map((row) => ({ record_id: row.id, fields: row.record }));
      if (key === 'events' && !url.includes('page_token=')) return json({ code: 0, data: { items: data.slice(0, 40), has_more: true, page_token: 'second' } });
      return json({ code: 0, data: { items: key === 'events' ? data.slice(40) : data, has_more: false } });
    });
    const library = await getOfficialGovernanceSnapshot({ FEISHU_APP_ID: 'test', FEISHU_APP_SECRET: 'secret' }, 'web', mock as typeof fetch);
    expect(library.counts).toEqual({ events: 42, params: 35, commonProps: 1, enums: 1 });
    expect(library.events.some((event) => event.evtId === 'creation_template_view')).toBe(true);
    expect(mock.mock.calls.filter(([url]) => String(url).includes('/records/search'))).toHaveLength(5);
  });
});
