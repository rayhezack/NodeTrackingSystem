import {
  createTrackingParam,
  createTrackingRecord,
  getPermissionConfig,
  TrackingWriteError,
  updateTrackingRecord,
} from '../../worker/tracking-write';
import { resetFeishuTokenCache } from '../../worker/feishu-token';

describe('PolloCloud tracking write service', () => {
  beforeEach(() => {
    resetFeishuTokenCache();
  });

  it('maps verified legacy administrator ids and preserves unresolved ids', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: {
          items: [{
            record_id: 'permission-record',
            fields: {
              evt_id: '__system_permissions__',
              '需求背景': JSON.stringify({
                admins: ['1867390536304713', '1855461847682347', '1855462061090825', '1874638956515561'],
                updatedBy: '1867390536304713',
              }),
            },
          }],
          has_more: false,
        },
      }));

    await expect(getPermissionConfig(credentials, '24915dag', fetchMock as unknown as typeof fetch)).resolves.toEqual({
      config: expect.objectContaining({
        admins: ['sunwen-1663469', '24915dag', '1855462061090825', '2727dbe3'],
        updatedBy: 'sunwen-1663469',
      }),
      initialized: true,
      canManage: true,
    });
  });

  it('creates a Base workbench record and initial parameters with the trusted actor', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'rec-1', fields: {} }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'param-1', fields: {} }] } }));

    const result = await createTrackingRecord(credentials, {
      source: 'app',
      evtId: 'home_show',
      eventName: '首页曝光',
      requestName: '首页埋点',
      requirementLink: 'https://example.feishu.cn/wiki/abc123',
      initialParams: [{
        evtId: 'home_show',
        paramName: 'page_id',
        paramType: 'STRING',
        required: true,
        status: '草稿',
      }],
      actorId: 'forged-user',
    }, { user_id: 'trusted-user', name: '可信用户' }, fetchMock as unknown as typeof fetch);

    expect(result).toEqual(expect.objectContaining({ success: true, recordId: 'app:rec-1', createdParamCount: 1 }));
    const workbenchBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(workbenchBody.records[0].fields).toEqual(expect.objectContaining({
      evt_id: 'home_show',
      '需求名称': '首页埋点',
      '需求提出人': [{ id: 'trusted-user' }],
      '流程阶段': '需求录入',
    }));
    expect(JSON.parse(workbenchBody.records[0].fields['通知身份快照'])['需求提出人']).toEqual([
      { user_id: 'trusted-user', name: '可信用户' },
    ]);
    const paramsBody = JSON.parse(String(fetchMock.mock.calls[2][1]?.body));
    expect(paramsBody.records[0].fields).toEqual(expect.objectContaining({
      evt_id: 'home_show',
      '参数名': 'page_id',
      '来源设计记录ID': 'rec-1',
    }));
  });

  it('updates a field when the trusted actor owns the matching workflow role', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { record: workbenchRecord } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [workbenchRecord], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'rec-1', fields: {} }] } }));

    const result = await updateTrackingRecord(credentials, 'app:rec-1', {
      stageId: 'design',
      fields: { '事件中文名': '新版首页曝光' },
      actorId: 'forged-admin',
    }, 'data-owner', fetchMock as unknown as typeof fetch);

    expect(result).toEqual({ success: true, recordId: 'app:rec-1', currentStage: '埋点设计' });
    expect(JSON.parse(String(fetchMock.mock.calls[4][1]?.body))).toEqual({
      records: [{ record_id: 'rec-1', fields: { '事件中文名': '新版首页曝光' } }],
    });
  });

  it('rejects an update when only the request body claims an authorized actor', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { record: workbenchRecord } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }));

    await expect(updateTrackingRecord(credentials, 'app:rec-1', {
      stageId: 'design',
      fields: { '事件中文名': '越权修改' },
      actorId: 'data-owner',
    }, 'untrusted-user', fetchMock as unknown as typeof fetch)).rejects.toEqual(
      expect.objectContaining<Partial<TrackingWriteError>>({ status: 403, message: '当前用户无权限更新该节点' }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('syncs an archived design and its parameters into the official query library', async () => {
    const archivedRecord = {
      record_id: 'rec-1',
      fields: {
        ...workbenchRecord.fields,
        '流程阶段': '上线监控',
        '版本': '2.0.0',
        '上线监控状态': '通过',
      },
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { record: archivedRecord } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [archivedRecord], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'rec-1', fields: {} }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'official-1', fields: {} }] } }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { items: [{ record_id: 'param-1', fields: { evt_id: 'home_show', '参数名': 'page_id', '来源设计记录ID': 'rec-1' } }], has_more: false },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'official-param-1', fields: {} }] } }));

    await updateTrackingRecord(credentials, 'app:rec-1', {
      stageId: 'archive',
      fields: { '正式状态': '已上线' },
    }, 'data-owner', fetchMock as unknown as typeof fetch);

    expect(String(fetchMock.mock.calls[6][0])).toContain('/tables/tblAhScEFQYAJC2g/records/batch_create');
    expect(JSON.parse(String(fetchMock.mock.calls[6][1]?.body)).records[0].fields).toEqual(expect.objectContaining({
      evt_id: 'home_show',
      '状态': '已上线',
      '源事件记录ID': 'rec-1',
    }));
    expect(String(fetchMock.mock.calls[9][0])).toContain('/tables/tblEYv9lGZeenbT2/records/batch_create');
    expect(JSON.parse(String(fetchMock.mock.calls[9][1]?.body)).records[0].fields).toEqual(expect.objectContaining({
      '参数主键': 'home_show.page_id',
      '关联事件': ['official-1'],
    }));
  });

  it('keeps existing official parameter fields immutable and only appends enum values', async () => {
    const archivedRecord = {
      record_id: 'rec-1',
      fields: {
        ...workbenchRecord.fields,
        '流程阶段': '稳定归档',
        '正式状态': '已上线',
        '版本': '2.0.0',
        '上线监控状态': '通过',
      },
    };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { record: archivedRecord } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [archivedRecord], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'rec-1', fields: {} }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [{ record_id: 'official-1', fields: { evt_id: 'home_show', '事件中文名': '正式首页曝光', 状态: '已上线' } }], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [{ record_id: 'design-param-1', fields: { evt_id: 'home_show', 参数名: 'page_id', 数据类型: 'NUMBER', 必传规则: '非必传', 参数定义: '设计稿误改定义', '枚举/取值范围': 'old // 原枚举\nnew // 新枚举', '来源设计记录ID': 'rec-1' } }], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [{ record_id: 'official-param-1', fields: { 参数主键: 'home_show.page_id', evt_id: 'home_show', 事件中文名: '正式首页曝光', 参数名: 'page_id', 数据类型: 'STRING', 必传规则: '必传', 参数定义: '正式定义', '枚举/取值范围': 'old // 原枚举', 版本: '1.0.0', 参数状态: '正式', 关联事件: ['official-1'] } }], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'official-param-1', fields: {} }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [{ record_id: 'enum-old', fields: { 枚举主键: 'home_show.page_id.old', evt_id: 'home_show', 参数名: 'page_id', 枚举值: 'old', 枚举中文名: '原枚举', 枚举状态: '正式', 关联正式参数: [] } }], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'enum-old', fields: {} }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'enum-new', fields: {} }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'official-param-1', fields: {} }] } }));

    await updateTrackingRecord(credentials, 'app:rec-1', {
      stageId: 'archive',
      fields: { '正式状态': '已上线' },
    }, 'data-owner', fetchMock as unknown as typeof fetch);

    const officialParamUpdates = fetchMock.mock.calls
      .filter(([url]) => String(url).includes('/tables/tblEYv9lGZeenbT2/records/batch_update'))
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(officialParamUpdates).toEqual([
      { records: [{ record_id: 'official-param-1', fields: { '枚举/取值范围': 'old // 原枚举\nnew // 新枚举' } }] },
      { records: [{ record_id: 'official-param-1', fields: { 枚举字典: ['enum-old', 'enum-new'] } }] },
    ]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/tables/tblAhScEFQYAJC2g/records/batch_update'))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/tables/tblQ8Ph3N8GJHeVA/records/batch_create'))).toBe(true);
  });

  it('syncs parameter enum values and writes their links back to the design parameter', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { record: workbenchRecord } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'param-1', fields: {} }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { records: [{ record_id: 'enum-1', fields: {} }, { record_id: 'enum-2', fields: {} }] },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'param-1', fields: {} }] } }));

    await createTrackingParam(credentials, 'app:rec-1', {
      evtId: 'home_show',
      paramName: 'page_type',
      paramType: 'STRING',
      enumRange: 'home // 首页\ndetail：详情页',
    }, 'data-owner', fetchMock as unknown as typeof fetch);

    expect(String(fetchMock.mock.calls[5][0])).toContain('/tables/tblQ8Ph3N8GJHeVA/records/batch_create');
    expect(JSON.parse(String(fetchMock.mock.calls[5][1]?.body)).records).toEqual([
      { fields: expect.objectContaining({ 枚举主键: 'home_show.page_type.home', 枚举值: 'home', 枚举中文名: '首页', 枚举状态: '草稿', 关联设计参数: ['param-1'] }) },
      { fields: expect.objectContaining({ 枚举主键: 'home_show.page_type.detail', 枚举值: 'detail', 枚举中文名: '详情页', 枚举状态: '草稿', 关联设计参数: ['param-1'] }) },
    ]);
    expect(String(fetchMock.mock.calls[6][0])).toContain('/tables/tblesT69TDCUKzhs/records/batch_update');
    expect(JSON.parse(String(fetchMock.mock.calls[6][1]?.body))).toEqual({
      records: [{ record_id: 'param-1', fields: { 枚举字典: ['enum-1', 'enum-2'] } }],
    });
  });

  it('archives deprecated events and parameters before removing them from the official library', async () => {
    const deprecatedDesign = {
      record_id: 'rec-1',
      fields: {
        ...workbenchRecord.fields,
        '需求ID': 'APP_REQ_1',
        '需求名称': '首页埋点',
        '流程阶段': '稳定归档',
        '正式状态': '已上线',
        '版本': '2.0.0',
      },
    };
    const officialEvent = { record_id: 'official-1', fields: { evt_id: 'home_show', '事件中文名': '首页曝光', '状态': '已上线' } };
    const officialParam = { record_id: 'official-param-1', fields: { '参数主键': 'home_show.page_id', evt_id: 'home_show', '参数名': 'page_id', '数据类型': 'STRING', '参数状态': '正式', '关联事件': ['official-1'] } };
    const designParam = { record_id: 'param-1', fields: { '设计参数主键': 'home_show.page_id', evt_id: 'home_show', '参数名': 'page_id', '数据类型': 'STRING', '来源设计记录ID': 'rec-1' } };
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { record: deprecatedDesign } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [deprecatedDesign], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'rec-1', fields: {} }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [officialEvent], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [officialParam], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [designParam], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'deprecated-event-1', fields: {} }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [], has_more: false } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'deprecated-param-1', fields: {} }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }));

    await updateTrackingRecord(credentials, 'app:rec-1', {
      stageId: 'archive',
      fields: { '正式状态': '已废弃' },
    }, 'data-owner', fetchMock as unknown as typeof fetch);

    expect(String(fetchMock.mock.calls[9][0])).toContain('/tables/tblBioKXiaou302p/records/batch_create');
    expect(JSON.parse(String(fetchMock.mock.calls[9][1]?.body)).records[0].fields).toEqual(expect.objectContaining({
      废弃主键: 'home_show', 原工作台记录ID: 'rec-1', 原正式记录ID: 'official-1',
    }));
    expect(String(fetchMock.mock.calls[11][0])).toContain('/tables/tbl3HA2sLaHuxRD1/records/batch_create');
    expect(JSON.parse(String(fetchMock.mock.calls[11][1]?.body)).records[0].fields).toEqual(expect.objectContaining({
      废弃参数主键: 'home_show.page_id', 原设计参数ID: 'param-1', 原正式参数ID: 'official-param-1', 参数状态: '已废弃',
    }));
    expect(String(fetchMock.mock.calls[12][0])).toContain('/tables/tblEYv9lGZeenbT2/records/batch_delete');
    expect(String(fetchMock.mock.calls[13][0])).toContain('/tables/tblAhScEFQYAJC2g/records/batch_delete');
  });
});

const credentials = { FEISHU_APP_ID: 'cli_test', FEISHU_APP_SECRET: 'secret' };
const workbenchRecord = {
  record_id: 'rec-1',
  fields: {
    '需求ID': 'APP_REQ_1',
    evt_id: 'home_show',
    '事件中文名': '首页曝光',
    '流程阶段': '埋点设计',
    '数据负责人': [{ id: 'data-owner', name: '数据同学' }],
  },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
