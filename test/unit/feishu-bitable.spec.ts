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
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ page_size: 20 });
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
});

const credentials = { FEISHU_APP_ID: 'cli_test', FEISHU_APP_SECRET: 'secret' };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
