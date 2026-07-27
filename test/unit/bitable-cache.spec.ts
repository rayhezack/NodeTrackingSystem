import { BitableService } from '../../server/modules/bitable/bitable.service';

describe('Bitable 读取缓存', () => {
  it('相同 searchRecords 应合并并复用短缓存', async () => {
    const call = jest.fn().mockResolvedValue({
      records: [{ id: 'rec_1', record: { evt_id: 'event_1' } }],
      hasMore: false,
    });
    const service = new BitableService({
      loadWithConfig: jest.fn().mockReturnValue({ call }),
    } as never);

    const params = { fieldNames: ['evt_id'], pageSize: 200 };
    const [first, second] = await Promise.all([
      service.searchRecords('workbench', params),
      service.searchRecords('workbench', params),
    ]);
    first.records[0].record.evt_id = 'mutated';
    const third = await service.searchRecords('workbench', params);

    expect(call).toHaveBeenCalledTimes(1);
    expect(second.records[0].record.evt_id).toBe('event_1');
    expect(third.records[0].record.evt_id).toBe('event_1');
  });

  it('写入后应清理对应 Base 表缓存', async () => {
    let searchCount = 0;
    const call = jest.fn().mockImplementation(async (action: string) => {
      if (action === 'searchRecords') {
        searchCount += 1;
        return {
          records: [{ id: 'rec_1', record: { evt_id: `event_${searchCount}` } }],
          hasMore: false,
        };
      }
      if (action === 'batchUpdateRecords') {
        return { records: [{ id: 'rec_1' }] };
      }
      return {};
    });
    const service = new BitableService({
      loadWithConfig: jest.fn().mockReturnValue({ call }),
    } as never);

    const params = { fieldNames: ['evt_id'], pageSize: 200 };
    const before = await service.searchRecords('workbench', params);
    await service.batchUpdateRecords('workbench', [{ id: 'rec_1', record: { 事件中文名: '更新后' } }]);
    const after = await service.searchRecords('workbench', params);

    expect(before.records[0].record.evt_id).toBe('event_1');
    expect(after.records[0].record.evt_id).toBe('event_2');
    expect(call.mock.calls.filter(([action]) => action === 'searchRecords')).toHaveLength(2);
  });
});
