import { buildDevelopmentContext, loadDevelopmentContext } from '../../client/src/pages/tracking-detail/development-context';
import type { ParamDetail, TrackingDetail } from '../../shared/api.interface';

function record(id: number): TrackingDetail {
  return { recordId: `web:rec${id}`, source: 'web', requestId: 'req1', requestName: 'Motion', evtId: `event_${id}`,
    eventName: `事件${id}`, requirementFields: { 需求背景: '背景\n第二行', 需求链接: 'https://example.test/prd' },
    designFields: { 事件定义: '通用定义', 触发时机: '点击即记录，未提交也记录', 处理方: '前端', 公共属性要求: '复用公共属性' },
    reviewFields: { 评审意见: '不能重复上报' }, acceptanceFields: { DS验收证据: '证据' },
    relatedEvents: [], permissions: { canEditDev: true },
  } as unknown as TrackingDetail;
}
const parameter = { recordId: 'p1', paramKey: 'event_0.button_name', evtId: 'event_0', paramName: 'button_name', paramType: 'STRING',
  definition: '点击位置', defaultValue: 'default', example: 'example', requestNotes: '本需求新增 remix', required: true,
  requiredRule: '条件必传', triggerCondition: '按钮点击时', enumRange: 'remix\nrecreate', platform: 'Web', status: '草稿', version: '1', changeType: '修改',
} satisfies ParamDetail;

describe('complete development context', () => {
  it('loads all 13 events, bounds concurrency, fetches missing snapshots and keeps deterministic order', async () => {
    const root = record(0);
    root.relatedEvents = Array.from({ length: 13 }, (_, id) => ({ ...record(id), detail: id === 2 ? undefined : record(id), isCurrent: id === 0 }));
    let active = 0, maximum = 0;
    const detail = jest.fn(async (id: string) => id === root.recordId ? root : record(2));
    const params = jest.fn(async () => {
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return { items: [parameter], total: 1 };
    });
    const result = await loadDevelopmentContext(root.recordId, { detail, params, preview: jest.fn() });
    expect(result.events.map(e => e.detail.evtId)).toEqual(Array.from({ length: 13 }, (_, i) => `event_${i}`));
    expect(params).toHaveBeenCalledTimes(13);
    expect(detail).toHaveBeenCalledWith('web:rec2');
    expect(maximum).toBeLessThanOrEqual(3);
  });

  it('rejects an incomplete parameter list instead of silently exporting it', async () => {
    await expect(loadDevelopmentContext('web:rec0', {
      detail: async () => record(0), params: async () => ({ items: [], total: 1 }), preview: jest.fn(),
    })).rejects.toThrow('参数数据未完整加载');
  });

  it('rejects a sibling read failure', async () => {
    await expect(loadDevelopmentContext('web:rec0', {
      detail: async () => record(0), params: async () => { throw new Error('permission denied'); }, preview: jest.fn(),
    })).rejects.toThrow('未复制不完整内容');
  });

  it('preserves image references when a temporary preview cannot be fetched', async () => {
    const root = record(0);
    root.designFields.UI图 = [{ file_token: 'token', name: '入口.png' }];
    const context = await loadDevelopmentContext(root.recordId, {
      detail: async () => root, params: async () => ({ items: [], total: 0 }), preview: async () => { throw Error('expired'); },
    });
    expect(context.events[0].images[0]).toEqual({ attachment: expect.objectContaining({ file_token: 'token' }), previewUrl: null });
    expect(buildDevelopmentContext(root, context.events)).toContain('请通过 Base 查看');
  });

  it('preserves multiline content, every parameter field, review and deleted parameters inside valid JSON', () => {
    const root = record(0);
    root.designFields.事件定义 = '```json\n原文 | 保留\n```';
    const text = buildDevelopmentContext(root, [{ detail: root, params: [parameter, { ...parameter, status: '废弃', changeType: '删除' }], images: [] }], '2026-10-20T00:00:00Z');
    const match = text.match(/\n(`{4,})json\n([\s\S]*)\n\1$/)!;
    const payload = JSON.parse(match[2]);
    expect(payload.eventCount).toBe(1);
    expect(payload.parameterCount).toBe(2);
    expect(payload.events[0].parameters[0]).toEqual(parameter);
    expect(payload.events[0].parameters[1].changeType).toBe('删除');
    expect(payload.events[0].reviewFields.评审意见).toBe('不能重复上报');
    expect(payload.events[0].designFields.事件定义).toBe(root.designFields.事件定义);
    expect(payload.events[0]).not.toHaveProperty('permissions');
    expect(payload.events[0].baseLinks.params).toContain('tblMaw89yVi68YY6');
    expect(text).toContain('没有抓取 PRD 全文');
  });
});
