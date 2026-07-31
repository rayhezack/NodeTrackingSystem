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

  it('详情页应按需求粒度合并项目角色，而不是只取当前埋点事件', async () => {
    const current = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_1',
        事件中文名: '主事件',
        流程阶段: '评审通过',
        记录类型: '埋点设计',
        评审状态: '已通过',
        数据负责人: [{ id: '1001', name: '孙文' }],
        研发负责人: [{ id: '3001', name: '曾家其' }],
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
        评审状态: '已通过',
        数据负责人: [{ id: '1001', name: '孙文' }],
        研发负责人: [{ id: '3002', name: '刘桥' }],
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
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.getDetail('app:rec_1', '1001');

    expect(result.data.devOwnerIds).toEqual(['3001', '3002']);
    expect(result.data.devOwner.map((user) => user.name)).toEqual(['曾家其', '刘桥']);
    expect(result.data.devFields['研发负责人']).toEqual([
      { user_id: '3001', name: '曾家其' },
      { user_id: '3002', name: '刘桥' },
    ]);
    expect(result.data.relatedEvents).toEqual([
      expect.objectContaining({
        recordId: 'app:rec_1',
        detail: expect.objectContaining({
          devOwnerIds: ['3001', '3002'],
        }),
      }),
      expect.objectContaining({
        recordId: 'app:rec_2',
        detail: expect.objectContaining({
          devOwnerIds: ['3001', '3002'],
        }),
      }),
    ]);
  });

  it('更新项目角色时应同步写回同需求全部埋点事件', async () => {
    const current = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_1',
        事件中文名: '主事件',
        流程阶段: '需求录入',
        记录类型: '埋点设计',
        数据负责人: [{ id: '1001', name: '孙文' }],
        研发负责人: [{ id: '3001', name: '曾家其' }],
        创建时间: 100,
      },
    };
    const sibling = {
      id: 'rec_2',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_2',
        事件中文名: '补充事件',
        流程阶段: '需求录入',
        记录类型: '埋点设计',
        数据负责人: [{ id: '1001', name: '孙文' }],
        研发负责人: [{ id: '3001', name: '曾家其' }],
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
      actorId: '1001',
      stageId: 'requirement',
      fields: {
        研发负责人: ['3001', '3002'],
      },
    });

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [
      {
        id: 'rec_1',
        record: expect.objectContaining({
          研发负责人: [3001, 3002],
        }),
      },
      {
        id: 'rec_2',
        record: expect.objectContaining({
          研发负责人: [3001, 3002],
        }),
      },
    ]);
  });

  it('同需求任一事件中的研发负责人，都应有当前事件的开发权限', async () => {
    const current = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_1',
        事件中文名: '主事件',
        流程阶段: '评审通过',
        记录类型: '埋点设计',
        埋点开发状态: '未开始',
        研发负责人: [{ id: '3001', name: '曾家其' }],
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
        埋点开发状态: '未开始',
        研发负责人: [{ id: '3002', name: '刘桥' }],
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

    await expect(service.updateRecord('app:rec_1', {
      actorId: '3002',
      stageId: 'dev',
      fields: {
        埋点开发状态: '开发中',
      },
    })).resolves.toEqual({
      success: true,
      recordId: 'app:rec_1',
      currentStage: '评审通过',
    });
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

  it('应支持按需求单删除所有同需求事件和设计参数', async () => {
    const current = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_1',
        事件中文名: '测试事件 1',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        评审状态: '草稿',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        正式状态: '待开发',
      },
    };
    const sibling = {
      id: 'rec_2',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_2',
        事件中文名: '测试事件 2',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        评审状态: '草稿',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        正式状态: '待开发',
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
                id: 'param_1',
                record: {
                  evt_id: 'event_1',
                  参数名: 'p1',
                  来源设计记录ID: 'rec_1',
                  关联设计: ['rec_1'],
                },
              },
              {
                id: 'param_2',
                record: {
                  evt_id: 'event_2',
                  参数名: 'p2',
                  来源设计记录ID: 'rec_2',
                  关联设计: ['rec_2'],
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

    const result = await service.deleteRequest('app:rec_1', {
      actorId: '1867390536304713',
    });

    expect(result).toEqual({
      success: true,
      deletedRequestId: 'APP_REQ_TEST',
      deletedRecordCount: 2,
      deletedParamCount: 2,
    });
    expect(bitable.deleteRecords).toHaveBeenCalledWith('paramDetail', ['param_1', 'param_2']);
    expect(bitable.deleteRecords).toHaveBeenCalledWith('workbench', ['rec_1', 'rec_2']);
  });

  it('已进入正式链路的需求单不应被物理删除', async () => {
    const current = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_1',
        事件中文名: '正式事件',
        流程阶段: '稳定归档',
        记录类型: '埋点设计',
        评审状态: '已通过',
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        正式状态: '已上线',
        发布状态: '发布成功',
      },
    };
    const bitable = {
      getRecord: jest.fn().mockResolvedValue(current),
      searchRecords: jest.fn().mockResolvedValue({ records: [current], hasMore: false }),
      deleteRecords: jest.fn(),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await expect(service.deleteRequest('app:rec_1', {
      actorId: '1867390536304713',
    })).rejects.toThrow('不支持直接删除');

    expect(bitable.deleteRecords).not.toHaveBeenCalled();
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

  it('提交评审时应按需求粒度通知数据和研发负责人', async () => {
    const current = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        需求名称: '图片背景移除功能',
        evt_id: 'event_1',
        事件中文名: '主事件',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        评审状态: '草稿',
        优先级: 'P0',
        端: ['iOS', 'Android'],
        数据负责人: [{ id: 'ou_data_owner', name: '数据同学' }],
        研发负责人: [{ id: 'ou_dev_owner', name: '研发同学' }],
        创建时间: 100,
      },
    };
    const sibling = {
      id: 'rec_2',
      record: {
        需求ID: 'APP_REQ_TEST',
        需求名称: '图片背景移除功能',
        evt_id: 'event_2',
        事件中文名: '补充事件',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        评审状态: '草稿',
        数据负责人: [{ id: 'ou_data_owner', name: '数据同学' }],
        研发负责人: [{ id: 'ou_dev_owner', name: '研发同学' }],
        创建时间: 200,
      },
    };
    const notification = {
      getRuntimeStatus: jest.fn().mockReturnValue({
        configured: true,
        hasAppId: true,
        hasAppSecret: true,
        usingDefaultAppId: false,
      }),
      sendWorkflowTransitionNotification: jest.fn().mockResolvedValue({
        planned: true,
        configured: true,
        recipientCount: 2,
        sentCount: 2,
        skippedCount: 0,
        failedCount: 0,
      }),
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
    const service = new TrackingService(
      bitable as unknown as BitableService,
      undefined as never,
      notification as never,
    );

    const result = await service.updateRecord('app:rec_1', {
      actorId: '1867390536304713',
      stageId: 'design',
      fields: {
        评审状态: '评审中',
      },
    });

    expect(result.notification).toEqual(expect.objectContaining({
      recipientCount: 2,
      sentCount: 2,
    }));
    expect(notification.sendWorkflowTransitionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'APP_REQ_TEST',
        requestName: '图片背景移除功能',
        toStage: '埋点评审',
        eventIds: ['event_1', 'event_2'],
        recipients: expect.arrayContaining([
          expect.objectContaining({ larkUserId: 'ou_data_owner', role: '数据负责人' }),
          expect.objectContaining({ larkUserId: 'ou_dev_owner', role: '研发负责人' }),
        ]),
      }),
    );
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

  it('开发完成应按需求粒度把所有同需求事件推进到数据验收，并追平旧污染状态', async () => {
    const current = {
      id: 'rec_1',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'event_1',
        事件中文名: '主事件',
        流程阶段: '埋点设计',
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
          评审状态: '已通过',
        },
      },
      {
        id: 'rec_2',
        record: {
          流程阶段: '数据验收',
          埋点开发状态: '已开发',
          评审状态: '已通过',
        },
      },
    ]);
  });
});
