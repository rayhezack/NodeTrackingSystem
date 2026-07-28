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

  it('设计阶段删除同需求事件时，应同步删除该事件下的设计参数并返回跳转事件', async () => {
    const current = {
      id: 'rec_2',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_2',
        事件中文名: '待删除事件',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        评审状态: '草稿',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        创建时间: 200,
      },
    };
    const sibling = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_1',
        事件中文名: '保留事件',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        评审状态: '草稿',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        创建时间: 100,
      },
    };
    const bitable = {
      getRecord: jest.fn().mockResolvedValue(current),
      searchRecords: jest.fn().mockImplementation(async (instanceKey: string) => {
        if (instanceKey === 'workbench') {
          return { records: [current, sibling], hasMore: false };
        }
        if (instanceKey === 'paramDetail') {
          return {
            records: [
              {
                id: 'rec_param_1',
                record: {
                  evt_id: 'event_2',
                  参数名: 'button_name',
                  来源设计记录ID: 'rec_2',
                  关联设计: ['rec_2'],
                  参数状态: '草稿',
                },
              },
              {
                id: 'rec_param_other',
                record: {
                  evt_id: 'event_1',
                  参数名: 'other_param',
                  来源设计记录ID: 'rec_1',
                  关联设计: ['rec_1'],
                  参数状态: '草稿',
                },
              },
            ],
            hasMore: false,
          };
        }
        return { records: [], hasMore: false };
      }),
      deleteRecords: jest.fn().mockResolvedValue(true),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.deleteEvent('app:rec_2', {
      actorId: '1867390536304713',
    });

    expect(result).toEqual({
      success: true,
      deletedRecordId: 'app:rec_2',
      deletedParamCount: 1,
      redirectRecordId: 'app:rec_1',
    });
    expect(bitable.deleteRecords).toHaveBeenCalledWith('paramDetail', ['rec_param_1']);
    expect(bitable.deleteRecords).toHaveBeenCalledWith('workbench', ['rec_2']);
  });
});
