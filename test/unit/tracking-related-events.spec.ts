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
        事件定义: '主事件定义',
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
        事件定义: '补充事件定义',
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
        detail: expect.objectContaining({
          recordId: 'app:rec_1',
          designFields: expect.objectContaining({ 事件定义: '主事件定义' }),
        }),
      }),
      expect.objectContaining({
        recordId: 'app:rec_2',
        evtId: 'event_2',
        eventName: '补充事件',
        isCurrent: false,
        detail: expect.objectContaining({
          recordId: 'app:rec_2',
          designFields: expect.objectContaining({ 事件定义: '补充事件定义' }),
        }),
      }),
    ]);
    expect(result.data.relatedEvents[0].detail).not.toHaveProperty('relatedEvents');
    expect(result.data.relatedEvents[1].detail).not.toHaveProperty('relatedEvents');
  });

  it('旧状态污染时，详情页应按需求级最新状态展示并避免重复评审', async () => {
    const staleCurrent = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_1',
        事件中文名: '旧状态事件',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        评审状态: '评审中',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        创建时间: 100,
      },
    };
    const reviewedSibling = {
      id: 'rec_2',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_2',
        事件中文名: '已评审事件',
        流程阶段: '评审通过',
        记录类型: '埋点设计',
        评审状态: '已通过',
        评审意见: '评审通过，可以开发',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        创建时间: 200,
      },
    };
    const bitable = {
      getRecord: jest.fn().mockResolvedValue(staleCurrent),
      searchRecords: jest.fn().mockImplementation(async (instanceKey: string) => {
        if (instanceKey === 'workbench') {
          return { records: [staleCurrent, reviewedSibling], hasMore: false };
        }
        return { records: [], hasMore: false };
      }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.getDetail('app:rec_1', '1867390536304713');

    expect(result.data.stage).toBe('评审通过');
    expect(result.data.uiStage).toBe('埋点开发');
    expect(result.data.reviewStatus).toBe('已通过');
    expect(result.data.reviewFields).toEqual(expect.objectContaining({
      评审状态: '已通过',
      评审意见: '评审通过，可以开发',
    }));
    expect(result.data.relatedEvents).toEqual([
      expect.objectContaining({
        recordId: 'app:rec_1',
        stage: '评审通过',
        uiStage: '埋点开发',
      }),
      expect.objectContaining({
        recordId: 'app:rec_2',
        stage: '评审通过',
        uiStage: '埋点开发',
      }),
    ]);
  });

  it('旧状态污染时，待办应按需求级最新状态展示为开发待办', async () => {
    const staleDesignEvent = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        需求名称: '图片背景移除功能',
        evt_id: 'event_1',
        事件中文名: '旧状态事件',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        评审状态: '评审中',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        研发负责人: [{ id: 'dev_1', name: '研发' }],
        创建时间: 100,
      },
    };
    const reviewedEvent = {
      id: 'rec_2',
      record: {
        需求ID: 'APP_REQ_TEST',
        需求名称: '图片背景移除功能',
        evt_id: 'event_2',
        事件中文名: '已评审事件',
        流程阶段: '评审通过',
        记录类型: '埋点设计',
        评审状态: '已通过',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        研发负责人: [{ id: 'dev_1', name: '研发' }],
        创建时间: 200,
      },
    };
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({ records: [staleDesignEvent, reviewedEvent], hasMore: false }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.getMyTodos(10, {
      source: 'app',
      actorId: 'dev_1',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        requestId: 'APP_REQ_TEST',
        requestName: '图片背景移除功能',
        stage: '埋点开发',
        targetStage: 'dev',
        todoRole: '研发负责人',
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

  it('设计阶段提交评审应按需求粒度把所有同需求事件推进到埋点评审', async () => {
    const current = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_1',
        事件中文名: '主事件',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        评审状态: '草稿',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
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
        评审状态: '草稿',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        创建时间: 200,
      },
    };
    const bitable = {
      getRecord: jest.fn().mockResolvedValue(current),
      searchRecords: jest.fn().mockImplementation(async (instanceKey: string) => {
        if (instanceKey === 'workbench') {
          return { records: [current, sibling], hasMore: false };
        }
        return { records: [], hasMore: false };
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }, { id: 'rec_2' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.updateRecord('app:rec_1', {
      actorId: '1867390536304713',
      stageId: 'design',
      fields: {
        事件定义: '主事件定义补充',
        评审状态: '评审中',
      },
    });

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [
      {
        id: 'rec_1',
        record: {
          事件定义: '主事件定义补充',
          评审状态: '评审中',
        },
      },
      {
        id: 'rec_2',
        record: {
          评审状态: '评审中',
        },
      },
    ]);
  });

  it('评审通过应按需求粒度把所有同需求事件推进到埋点开发', async () => {
    const current = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_1',
        事件中文名: '主事件',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        评审状态: '评审中',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
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
        评审状态: '评审中',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        创建时间: 200,
      },
    };
    const bitable = {
      getRecord: jest.fn().mockResolvedValue(current),
      searchRecords: jest.fn().mockImplementation(async (instanceKey: string) => {
        if (instanceKey === 'workbench') {
          return { records: [current, sibling], hasMore: false };
        }
        return { records: [], hasMore: false };
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }, { id: 'rec_2' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.updateRecord('app:rec_1', {
      actorId: '1867390536304713',
      stageId: 'review',
      fields: {
        评审状态: '已通过',
        评审意见: '评审通过，可以开发',
      },
      targetStage: '评审通过',
    });

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [
      {
        id: 'rec_1',
        record: {
          评审状态: '已通过',
          评审意见: '评审通过，可以开发',
          流程阶段: '评审通过',
        },
      },
      {
        id: 'rec_2',
        record: {
          流程阶段: '评审通过',
          评审状态: '已通过',
          评审意见: '评审通过，可以开发',
        },
      },
    ]);
  });

  it('开发完成应按需求粒度把所有同需求事件推进到数据验收', async () => {
    const current = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_1',
        事件中文名: '主事件',
        流程阶段: '评审通过',
        记录类型: '埋点设计',
        埋点开发状态: '开发中',
        研发负责人: [{ id: 'dev_1', name: '研发' }],
        创建时间: 100,
      },
    };
    const sibling = {
      id: 'rec_2',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_2',
        事件中文名: '补充事件',
        流程阶段: '评审通过',
        记录类型: '埋点设计',
        埋点开发状态: '开发中',
        研发负责人: [{ id: 'dev_1', name: '研发' }],
        创建时间: 200,
      },
    };
    const bitable = {
      getRecord: jest.fn().mockResolvedValue(current),
      searchRecords: jest.fn().mockImplementation(async (instanceKey: string) => {
        if (instanceKey === 'workbench') {
          return { records: [current, sibling], hasMore: false };
        }
        return { records: [], hasMore: false };
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }, { id: 'rec_2' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.updateRecord('app:rec_1', {
      actorId: 'dev_1',
      stageId: 'dev',
      fields: {
        埋点开发状态: '已开发',
      },
      targetStage: '数据验收',
    });

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [
      {
        id: 'rec_1',
        record: {
          埋点开发状态: '已开发',
          流程阶段: '数据验收',
        },
      },
      {
        id: 'rec_2',
        record: {
          流程阶段: '数据验收',
          埋点开发状态: '已开发',
        },
      },
    ]);
  });
});
