import { BitableService } from '../../server/modules/bitable/bitable.service';
import { TrackingService } from '../../server/modules/tracking/tracking.service';

describe('埋点参数 Base 回写', () => {
  it('新增参数时关联设计应使用记录 ID 字符串数组', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_design',
        record: {
          evt_id: 'test_event',
          版本: '1.0.0',
        },
      }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_param' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.createParam('app:rec_design', {
      actorId: '1867390536304713',
      evtId: 'test_event',
      paramName: 'button_name',
      paramType: 'STRING',
      required: true,
      platform: 'App',
    });

    expect(bitable.batchAddRecords).toHaveBeenCalledWith('paramDetail', [
      expect.objectContaining({
        evt_id: 'test_event',
        参数名: 'button_name',
        来源设计记录ID: 'rec_design',
        关联设计: ['rec_design'],
        App适用性: 'App通用',
        版本: '1.0.0',
      }),
    ]);
    expect(result.item).toMatchObject({
      recordId: 'app:rec_param',
      paramKey: 'test_event.button_name',
      evtId: 'test_event',
      paramName: 'button_name',
      platform: 'App通用',
    });
  });

  it('新增参数应继承埋点事件版本，忽略参数级版本输入', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_design',
        record: {
          evt_id: 'test_event',
          版本: '2.0.0',
        },
      }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_param' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.createParam('app:rec_design', {
      actorId: '1867390536304713',
      evtId: 'test_event',
      paramName: 'button_name',
      paramType: 'STRING',
      required: true,
      status: '草稿',
      version: '9.9.9',
    });

    expect(bitable.batchAddRecords).toHaveBeenCalledWith('paramDetail', [
      expect.objectContaining({
        参数名: 'button_name',
        版本: '2.0.0',
      }),
    ]);
  });

  it('编辑参数时应忽略参数级版本更新', async () => {
    const bitable = {
      getRecord: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'rec_param',
          record: {
            evt_id: 'test_event',
            参数名: 'button_name',
            数据类型: 'STRING',
            版本: '1.0.0',
            来源设计记录ID: 'rec_design',
            关联设计: ['rec_design'],
          },
        })
        .mockResolvedValueOnce({
          id: 'rec_design',
          record: {
            evt_id: 'test_event',
            流程阶段: '埋点设计',
          },
        }),
      batchUpdateRecords: jest.fn(),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.updateParam('app:rec_param', {
      actorId: '1867390536304713',
      fields: { version: '9.9.9' },
    });

    expect(bitable.batchUpdateRecords).not.toHaveBeenCalled();
    expect(result.item.version).toBe('1.0.0');
  });

  it('加载参数列表应优先按设计记录和 evt_id 下推过滤，减少全表扫描', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_design',
        record: { evt_id: 'test_event' },
      }),
      searchRecords: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'rec_active_param',
            record: {
              evt_id: 'test_event',
              参数名: 'active_param',
              数据类型: 'STRING',
              参数状态: '草稿',
              来源设计记录ID: 'rec_design',
              关联设计: ['rec_design'],
            },
          },
        ],
        hasMore: false,
      }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.getParams('app:rec_design');

    expect(result.items).toHaveLength(1);
    expect(bitable.searchRecords).toHaveBeenCalledTimes(1);
    expect(bitable.searchRecords).toHaveBeenCalledWith('paramDetail', expect.objectContaining({
      filter: {
        conjunction: 'or',
        conditions: [
          { fieldName: '来源设计记录ID', operator: 'is', value: ['rec_design'] },
          { fieldName: 'evt_id', operator: 'is', value: ['test_event'] },
        ],
      },
    }));
  });

  it('同 evt_id 并行修订时，参数列表不应串到其他需求的设计参数', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_design',
        record: { evt_id: 'shared_event' },
      }),
      searchRecords: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'rec_current_param',
            record: {
              evt_id: 'shared_event',
              参数名: 'current_param',
              数据类型: 'STRING',
              参数状态: '草稿',
              来源设计记录ID: 'rec_design',
              关联设计: ['rec_design'],
            },
          },
          {
            id: 'rec_other_param',
            record: {
              evt_id: 'shared_event',
              参数名: 'other_param',
              数据类型: 'STRING',
              参数状态: '草稿',
              来源设计记录ID: 'rec_other_design',
              关联设计: ['rec_other_design'],
            },
          },
          {
            id: 'rec_legacy_param',
            record: {
              evt_id: 'shared_event',
              参数名: 'legacy_param_without_owner',
              数据类型: 'STRING',
              参数状态: '草稿',
            },
          },
        ],
        hasMore: false,
      }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.getParams('app:rec_design');

    expect(result.items.map((item) => item.paramName).sort()).toEqual([
      'current_param',
      'legacy_param_without_owner',
    ]);
  });

  it('App 参数适用端不应继续写入与 App通用 重复的仅App', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_design',
        record: { evt_id: 'test_event', 版本: '1.0.0' },
      }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_param' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.createParam('app:rec_design', {
      actorId: '1867390536304713',
      evtId: 'test_event',
      paramName: 'button_name',
      paramType: 'STRING',
      required: true,
      platform: '仅App',
      status: '草稿',
    });

    expect(bitable.batchAddRecords).toHaveBeenCalledWith('paramDetail', [
      expect.objectContaining({
        App适用性: 'App通用',
      }),
    ]);
  });

  it('Web 参数应使用线上 Web 适用性枚举', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_design',
        record: { evt_id: 'web_event', 版本: '1.0.0' },
      }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_param' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.createParam('web:rec_design', {
      actorId: '1867390536304713',
      evtId: 'web_event',
      paramName: 'button_name',
      paramType: 'STRING',
      required: false,
      platform: 'Web通用',
      status: '草稿',
    });

    expect(bitable.batchAddRecords).toHaveBeenCalledWith('webParamDetail', [
      expect.objectContaining({
        Web适用性: 'Web通用',
        关联设计: ['rec_design'],
      }),
    ]);
  });

  it('Web 参数适用端不应继续写入与 Web通用 重复的仅Web', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_design',
        record: { evt_id: 'web_event', 版本: '1.0.0' },
      }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_param' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.createParam('web:rec_design', {
      actorId: '1867390536304713',
      evtId: 'web_event',
      paramName: 'button_name',
      paramType: 'STRING',
      required: false,
      platform: '仅Web',
      status: '草稿',
    });

    expect(bitable.batchAddRecords).toHaveBeenCalledWith('webParamDetail', [
      expect.objectContaining({
        Web适用性: 'Web通用',
      }),
    ]);
  });

  it('应保留条件必传三态规则，不降级为非必传', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_design',
        record: { evt_id: 'test_event', 版本: '1.0.0' },
      }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_param' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.createParam('app:rec_design', {
      actorId: '1867390536304713',
      evtId: 'test_event',
      paramName: 'entry_source',
      paramType: 'STRING',
      required: true,
      requiredRule: '条件必传',
      status: '草稿',
    });

    expect(bitable.batchAddRecords).toHaveBeenCalledWith('paramDetail', [
      expect.objectContaining({ 必传规则: '条件必传' }),
    ]);
  });

  it('参数列表应隐藏旧逻辑写入的废弃设计参数', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_design',
        record: { evt_id: 'test_event' },
      }),
      searchRecords: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'rec_active_param',
            record: {
              evt_id: 'test_event',
              参数名: 'active_param',
              数据类型: 'STRING',
              参数状态: '草稿',
              来源设计记录ID: 'rec_design',
              关联设计: ['rec_design'],
            },
          },
          {
            id: 'rec_removed_param',
            record: {
              evt_id: 'test_event',
              参数名: 'removed_param',
              数据类型: 'STRING',
              参数状态: '废弃',
              来源设计记录ID: 'rec_design',
              关联设计: ['rec_design'],
            },
          },
        ],
        hasMore: false,
      }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.getParams('app:rec_design');

    expect(result.items).toHaveLength(1);
    expect(result.items[0].paramName).toBe('active_param');
  });

  it('删除参数时应真正删除设计参数记录，而不是写入废弃状态', async () => {
    const bitable = {
      getRecord: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'rec_param',
          record: {
            evt_id: 'test_event',
            参数名: 'button_name',
            来源设计记录ID: 'rec_design',
            关联设计: ['rec_design'],
          },
        })
        .mockResolvedValueOnce({
          id: 'rec_design',
          record: {
            evt_id: 'test_event',
            流程阶段: '埋点设计',
          },
        }),
      deleteRecords: jest.fn().mockResolvedValue(true),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.deleteParam('app:rec_param', '1867390536304713');

    expect(bitable.deleteRecords).toHaveBeenCalledWith('paramDetail', ['rec_param']);
  });

  it('批量删除参数时应一次性删除当前设计下的所选参数', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_design',
        record: {
          evt_id: 'test_event',
          流程阶段: '埋点设计',
        },
      }),
      searchRecords: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'rec_param_1',
            record: {
              evt_id: 'test_event',
              参数名: 'button_name',
              来源设计记录ID: 'rec_design',
              关联设计: ['rec_design'],
              参数状态: '草稿',
            },
          },
          {
            id: 'rec_param_2',
            record: {
              evt_id: 'test_event',
              参数名: 'entry_source',
              来源设计记录ID: 'rec_design',
              关联设计: ['rec_design'],
              参数状态: '草稿',
            },
          },
        ],
        hasMore: false,
      }),
      deleteRecords: jest.fn().mockResolvedValue(true),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.batchDeleteParams('app:rec_design', {
      actorId: '1867390536304713',
      paramRecordIds: ['app:rec_param_1', 'app:rec_param_2'],
    });

    expect(result).toEqual({ success: true, deletedCount: 2 });
    expect(bitable.deleteRecords).toHaveBeenCalledWith('paramDetail', ['rec_param_1', 'rec_param_2']);
  });

  it('批量删除参数时不允许删除其他设计记录下的参数', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_design',
        record: {
          evt_id: 'test_event',
          流程阶段: '埋点设计',
        },
      }),
      searchRecords: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'rec_param_1',
            record: {
              evt_id: 'test_event',
              参数名: 'button_name',
              来源设计记录ID: 'rec_design',
              关联设计: ['rec_design'],
              参数状态: '草稿',
            },
          },
        ],
        hasMore: false,
      }),
      deleteRecords: jest.fn(),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await expect(
      service.batchDeleteParams('app:rec_design', {
        actorId: '1867390536304713',
        paramRecordIds: ['app:rec_param_1', 'app:rec_other_param'],
      }),
    ).rejects.toThrow('部分参数不属于当前埋点设计');
    expect(bitable.deleteRecords).not.toHaveBeenCalled();
  });

  it('普通提需人不能越权新增设计参数', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_design',
        record: {
          evt_id: 'test_event',
          流程阶段: '埋点设计',
          需求提出人: [{ id: '1001', name: '产品同学' }],
          数据负责人: [{ id: '2001', name: '数据负责人' }],
        },
      }),
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
      batchAddRecords: jest.fn(),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await expect(
      service.createParam('app:rec_design', {
        actorId: '1001',
        evtId: 'test_event',
        paramName: 'button_name',
        paramType: 'STRING',
        required: true,
        status: '草稿',
      }),
    ).rejects.toThrow('无权限维护参数');
    expect(bitable.batchAddRecords).not.toHaveBeenCalled();
  });
});
