import {
  createBitableRecords,
  deleteBitableRecords,
  resetFeishuTokenCache,
  searchBitableRecords,
  updateBitableRecords,
} from '../../worker/feishu-bitable';

describe('PolloCloud Feishu bitable read client', () => {
  beforeEach(() => {
    resetFeishuTokenCache();
  });

  it('gets a tenant token and searches records using a configured instance', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { items: [{ record_id: 'rec-1' }], has_more: false } }));

    const data = await searchBitableRecords(
      { FEISHU_APP_ID: 'cli_test', FEISHU_APP_SECRET: 'secret' },
      'workbench',
      { pageSize: 20 },
      fetchMock as unknown as typeof fetch,
    );

    expect(data).toEqual({ items: [{ record_id: 'rec-1' }], has_more: false });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('/apps/Kgy0b4bvmaJSK8sjQDscUrNJnOf/tables/tblqHhr5aZwr4QOZ/records/search');
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('page_size')).toBe('20');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({});
  });

  it('creates, updates and deletes records through the configured Base table', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { records: [{ record_id: 'rec-1', fields: { evt_id: 'home_show' } }] },
      }))
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        data: { records: [{ record_id: 'rec-1', fields: { '事件中文名': '首页曝光' } }] },
      }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: {} }));

    await createBitableRecords(credentials, 'workbench', [{ evt_id: 'home_show' }], fetchMock as unknown as typeof fetch);
    await updateBitableRecords(credentials, 'workbench', [{ id: 'rec-1', record: { '事件中文名': '首页曝光' } }], fetchMock as unknown as typeof fetch);
    await deleteBitableRecords(credentials, 'workbench', ['rec-1'], fetchMock as unknown as typeof fetch);

    expect(String(fetchMock.mock.calls[1][0])).toContain('/records/batch_create?user_id_type=user_id');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      records: [{ fields: { evt_id: 'home_show' } }],
    });
    expect(String(fetchMock.mock.calls[2][0])).toContain('/records/batch_update?user_id_type=user_id');
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      records: [{ record_id: 'rec-1', fields: { '事件中文名': '首页曝光' } }],
    });
    expect(String(fetchMock.mock.calls[3][0])).toContain('/records/batch_delete');
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({ records: ['rec-1'] });
  });

  it('normalizes URL fields before every direct Worker write', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'rec-1', fields: {} }] } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { records: [{ record_id: 'rec-1', fields: {} }] } }));

    await createBitableRecords(credentials, 'workbench', [{
      需求链接: 'https://example.feishu.cn/wiki/prd_1',
      'UI图对应网页链接': [{ Link: 'https://example.com/design' }],
      参数明细入口: 'https://example.feishu.cn/base/app?table=tbl_params',
    }], fetchMock as unknown as typeof fetch);
    await updateBitableRecords(credentials, 'workbench', [{
      id: 'rec-1',
      record: { 需求链接: { url: 'https://example.feishu.cn/wiki/prd_2', name: 'PRD 2' } },
    }], fetchMock as unknown as typeof fetch);

    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      records: [{ fields: {
        需求链接: { link: 'https://example.feishu.cn/wiki/prd_1', text: 'https://example.feishu.cn/wiki/prd_1' },
        'UI图对应网页链接': { link: 'https://example.com/design', text: 'https://example.com/design' },
        参数明细入口: { link: 'https://example.feishu.cn/base/app?table=tbl_params', text: 'https://example.feishu.cn/base/app?table=tbl_params' },
      } }],
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      records: [{ record_id: 'rec-1', fields: {
        需求链接: { link: 'https://example.feishu.cn/wiki/prd_2', text: 'PRD 2' },
      } }],
    });
  });

  it('marks a lost external update response as uncertain, but not a local URL validation failure', async () => {
    const state = { pending: 0, uncertain: 0 };
    const guarded = { ...credentials, BASE_WRITE_STATE: state };
    const transport = jest.fn().mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 })).mockRejectedValueOnce(new Error('response lost'));
    await expect(updateBitableRecords(guarded, 'workbench', [{ id: 'record', record: { 事件中文名: '事件' } }], transport)).rejects.toThrow('response lost');
    expect(state).toEqual({ pending: 0, uncertain: 1 });
    const local = { pending: 0, uncertain: 0 };
    await expect(createBitableRecords({ ...credentials, BASE_WRITE_STATE: local }, 'workbench', [{ 需求链接: 'not-a-url' }], transport)).rejects.toThrow('http(s)');
    expect(local).toEqual({ pending: 0, uncertain: 0 });
  });
  it('rejects invalid URL fields before calling Feishu', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 0, tenant_access_token: 'tenant-token', expire: 7200 }));

    await expect(createBitableRecords(credentials, 'workbench', [{ 需求链接: 'not-a-url' }], fetchMock as unknown as typeof fetch))
      .rejects.toThrow('Feishu Base URL field requires an http(s) URL');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

const credentials = { FEISHU_APP_ID: 'cli_test', FEISHU_APP_SECRET: 'secret' };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
