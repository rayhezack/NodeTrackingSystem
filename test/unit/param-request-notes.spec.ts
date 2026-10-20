import * as base from '../../worker/feishu-bitable';
import { createTrackingParam, updateTrackingParam, reuseOfficialTrackingEvent } from '../../worker/tracking-write';
import { buildParamClipboardText } from '../../client/src/pages/tracking-detail/param-designer/param-display.utils';

const note = '本需求新增 remix，点击后未提交也记录';
describe('需求级参数说明', () => {
  afterEach(() => jest.restoreAllMocks());
  it('复用正式参数时不继承历史需求说明', async () => {
    const design = { id: 'design', record: { evt_id: '', 需求ID: 'request', 流程阶段: '埋点设计', 数据负责人: [{ id: 'owner' }] } };
    const formal = { id: 'official', record: { evt_id: 'click', 事件中文名: '点击' } };
    jest.spyOn(base, 'getBitableRecord').mockImplementation(async (_env, _table, id) => id === 'design' ? design : formal);
    jest.spyOn(base, 'searchBitableRecordPage').mockImplementation(async (_env, table) => ({ hasMore: false, records:
      table === 'officialParamDetail' ? [{ id: 'old-param', record: { evt_id: 'click', 参数主键: 'click.button_name', 参数名: 'button_name', 参数定义: '按钮标识', 本次需求说明: '旧需求说明', 备注: '默认值/示例：remix' } }]
      : table === 'workbench' ? [design] : [],
    }));
    jest.spyOn(base, 'updateBitableRecords').mockResolvedValue([]);
    const create = jest.spyOn(base, 'createBitableRecords').mockResolvedValue([{ id: 'new-param', record: {} }]);
    await reuseOfficialTrackingEvent({}, 'app:design', { officialRecordId: 'app:official', officialParamKeys: ['click.button_name'] }, 'owner');
    expect(create.mock.calls[0][2][0]).toMatchObject({ 参数定义: '按钮标识', '默认值/示例': 'remix' });
    expect(create.mock.calls[0][2][0]).not.toHaveProperty('本次需求说明');
  });
  it.each(['app', 'web'] as const)('在 %s 设计参数中独立保存、回显和清空，研发复制保留说明', async (source) => {
    const design = { id: 'design', record: { evt_id: 'click', 流程阶段: '埋点设计', 数据负责人: [{ id: 'owner' }] } };
    const get = jest.spyOn(base, 'getBitableRecord').mockResolvedValue(design);
    jest.spyOn(base, 'searchBitableRecordPage').mockResolvedValue({ records: [], hasMore: false });
    const create = jest.spyOn(base, 'createBitableRecords').mockResolvedValue([{ id: 'param', record: {} }]);
    const update = jest.spyOn(base, 'updateBitableRecords').mockResolvedValue([]);
    const created = await createTrackingParam({}, `${source}:design`, {
      evtId: 'click', paramName: 'button_name', paramType: 'STRING', required: true,
      definition: '用户点击的按钮标识', example: 'remix', requestNotes: note, status: '草稿',
    }, 'owner');
    expect(create.mock.calls[0][2][0]).toMatchObject({ 参数定义: '用户点击的按钮标识', '默认值/示例': 'remix', 本次需求说明: note });
    expect(created.item.requestNotes).toBe(note);
    expect(buildParamClipboardText([created.item], source)).toContain(`- 本次需求说明：${note}`);
    const stored = { id: 'param', record: create.mock.calls[0][2][0] };
    get.mockImplementation(async (_env, _table, id) => id === 'param' ? stored : design);
    const changed = await updateTrackingParam({}, `${source}:param`, { fields: { requestNotes: '' } }, 'owner');
    expect(update.mock.calls[0][2]).toEqual([{ id: 'param', record: { 本次需求说明: '' } }]);
    expect(changed.item).toMatchObject({ requestNotes: '', definition: '用户点击的按钮标识', example: 'remix' });
  });
});
