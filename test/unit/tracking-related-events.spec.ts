import { BitableService } from '../../server/modules/bitable/bitable.service';
import { TrackingService } from '../../server/modules/tracking/tracking.service';

describe('同需求埋点事件', () => {
  it('需求详情应返回共享需求ID的埋点事件列表', async () => {
    const current = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_1',
        事件中文名: '主事件',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        优先级: 'P1',
        端: ['iOS', 'Android'],
        评审状态: '草稿',
        创建时间: 100,
      },
    };
    const sibling = {
      id: 'rec_2',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_2',
        事件中文名: '补充事件',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        优先级: 'P2',
        端: ['iOS'],
        评审状态: '草稿',
        创建时间: 200,
      },
    };
    const bitable = {
      getRecord: jest.fn().mockResolvedValue(current),
      searchRecords: jest
        .fn()
        .mockResolvedValueOnce({ records: [], hasMore: false })
        .mockResolvedValueOnce({ records: [current, sibling], hasMore: false }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.getDetail('app:rec_1', '1867390536304713');

    expect(bitable.searchRecords).toHaveBeenNthCalledWith(2, 'workbench', {
      fieldNames: expect.any(Array),
      filter: {
        conjunction: 'and',
        conditions: [{ fieldName: '需求ID', operator: 'is', value: ['APP_REQ_TEST'] }],
      },
      pageSize: 200,
    });
    expect(result.data.relatedEvents).toEqual([
      expect.objectContaining({
        recordId: 'app:rec_1',
        evtId: 'event_1',
        eventName: '主事件',
        isCurrent: true,
      }),
      expect.objectContaining({
        recordId: 'app:rec_2',
        evtId: 'event_2',
        eventName: '补充事件',
        isCurrent: false,
      }),
    ]);
  });
});
