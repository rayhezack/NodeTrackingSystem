import { BitableService } from '../../server/modules/bitable/bitable.service';
import { TrackingService } from '../../server/modules/tracking/tracking.service';

describe('工作流 Base 回写', () => {
  it('详情接口应把 Base 人员 open_id 映射为可回显的飞书用户', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          '事件中文名': '测试需求',
          '流程阶段': '需求录入',
          '需求提出人': [{ id: 'ou_sunwen', name: '孙文' }],
        },
      }),
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.getDetail('app:rec_1');

    expect(result.data.requester).toEqual([
      {
        user_id: 'ou_sunwen',
        larkUserId: 'ou_sunwen',
        name: '孙文',
      },
    ]);
    expect(result.data.requirementFields['需求提出人']).toEqual(result.data.requester);
  });

  it('详情接口应保留 Base 人员字段的多语言姓名', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          '事件中文名': '测试需求',
          '流程阶段': '需求录入',
          '需求提出人': [
            {
              id: '1867390536304713',
              name: { zh_cn: '孙文', en_us: 'Sun Wen' },
            },
          ],
        },
      }),
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.getDetail('app:rec_1');

    expect(result.data.requester).toEqual([
      {
        user_id: '1867390536304713',
        name: '孙文',
      },
    ]);
  });

  it('不应使用空人员数组覆盖 Base 中已有的必填负责人', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          'evt_id': '',
          '流程阶段': '需求录入',
          '需求提出人': [{ id: 'ou_sunwen', name: '孙文' }],
        },
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.updateRecord('app:rec_1', {
      actorLarkId: 'ou_sunwen',
      stageId: 'requirement',
      fields: {
        '需求提出人': [],
        '需求背景': '保留负责人',
      },
      targetStage: '埋点设计',
    });

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [
      {
        id: 'rec_1',
        record: {
          '需求背景': '保留负责人',
          '流程阶段': '埋点设计',
        },
      },
    ]);
  });

  it('应在同一次 Base 更新中写入设计字段和目标阶段', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          'evt_id': '',
          '流程阶段': '需求录入',
        },
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.updateRecord('app:rec_1', {
      actorId: '1867390536304713',
      stageId: 'design',
      fields: {
        'evt_id': 'test_event',
        '事件定义': '点击测试按钮时上报',
      },
      targetStage: '埋点设计',
    });

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [
      {
        id: 'rec_1',
        record: {
          'evt_id': 'test_event',
          '事件定义': '点击测试按钮时上报',
          '流程阶段': '埋点设计',
        },
      },
    ]);
    expect(result.currentStage).toBe('埋点设计');
  });

  it('评审通过时应规范化枚举并推进到开发节点', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: { evt_id: 'test_event', 流程阶段: '埋点设计' },
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.updateRecord('app:rec_1', {
      actorId: '1867390536304713',
      stageId: 'review',
      fields: { 评审状态: '已通过' },
      targetStage: '评审通过',
    });

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [
      {
        id: 'rec_1',
        record: { 评审状态: '已通过', 流程阶段: '评审通过' },
      },
    ]);
    expect(result.currentStage).toBe('评审通过');
  });

  it('应把旧客户端的需修改兼容映射为 Base 已拒绝', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: { evt_id: 'test_event', 流程阶段: '埋点设计' },
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.updateRecord('app:rec_1', {
      actorId: '1867390536304713',
      stageId: 'review',
      fields: { 评审状态: '需修改' },
    });

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [
      { id: 'rec_1', record: { 评审状态: '已拒绝' } },
    ]);
  });

  it('完成上线后应自动新增正式查询库事件', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          evt_id: 'test_event',
          事件中文名: '测试事件',
          流程阶段: '上线监控',
          端: ['iOS', 'Android'],
          版本: '2.0.0',
          事件定义: '用户点击测试入口时上报',
          触发时机: '点击入口后触发',
          '指标/使用场景': '测试转化漏斗',
          正式状态: '待开发',
        },
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_official' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.updateRecord('app:rec_1', {
      actorId: '1867390536304713',
      stageId: 'launch',
      fields: {
        发布状态: '发布成功',
        上线监控状态: '通过',
      },
      targetStage: '稳定归档',
    });

    expect(bitable.searchRecords).toHaveBeenCalledWith('queryLibrary', {
      fieldNames: [
        'evt_id',
        '事件中文名',
        '端',
        '上线版本',
        '状态',
        '生命周期状态',
        '参数明细入口',
        '事件定义',
        '触发时机',
        '指标/使用场景',
      ],
      pageSize: 200,
    });
    expect(bitable.batchAddRecords).toHaveBeenCalledWith('queryLibrary', [
      expect.objectContaining({
        evt_id: 'test_event',
        事件中文名: '测试事件',
        端: ['iOS', 'Android'],
        上线版本: '2.0.0',
        状态: '已上线',
        生命周期状态: '稳定归档',
        事件定义: '用户点击测试入口时上报',
        触发时机: '点击入口后触发',
        '指标/使用场景': '测试转化漏斗',
      }),
    ]);
  });

  it('正式查询库已有同 evt_id 时应更新而不是重复新增', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          evt_id: 'test_event',
          事件中文名: '测试事件',
          流程阶段: '稳定归档',
          端: ['iOS'],
          版本: '2.1.0',
          正式状态: '已上线',
        },
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
      searchRecords: jest.fn().mockResolvedValue({
        records: [{ id: 'rec_official', record: { evt_id: 'test_event' } }],
        hasMore: false,
      }),
      batchAddRecords: jest.fn(),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.updateRecord('app:rec_1', {
      actorId: '1867390536304713',
      stageId: 'archive',
      fields: { 事件中文名: '测试事件 v2' },
    });

    expect(bitable.batchUpdateRecords).toHaveBeenNthCalledWith(2, 'queryLibrary', [
      {
        id: 'rec_official',
        record: expect.objectContaining({
          evt_id: 'test_event',
          事件中文名: '测试事件 v2',
          上线版本: '2.1.0',
          状态: '已上线',
        }),
      },
    ]);
    expect(bitable.batchAddRecords).not.toHaveBeenCalled();
  });

  it('提需人只应能维护需求录入节点，不能越权修改埋点设计', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          evt_id: 'test_event',
          流程阶段: '埋点设计',
          需求提出人: [{ id: '1001', name: '产品同学' }],
          需求录入人: [{ id: '1001', name: '产品同学' }],
          数据负责人: [{ id: '2001', name: '数据负责人' }],
        },
      }),
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
      batchUpdateRecords: jest.fn(),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await expect(
      service.updateRecord('app:rec_1', {
        actorId: '1001',
        stageId: 'design',
        fields: { 事件定义: '产品同学不能直接改设计定义' },
      }),
    ).rejects.toThrow('无权限更新该节点');
    expect(bitable.batchUpdateRecords).not.toHaveBeenCalled();
  });

  it('提需人不能通过接口跳过设计和评审直接推进阶段', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          evt_id: '',
          流程阶段: '需求录入',
          需求提出人: [{ id: '1001', name: '产品同学' }],
        },
      }),
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
      batchUpdateRecords: jest.fn(),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await expect(
      service.updateRecord('app:rec_1', {
        actorId: '1001',
        stageId: 'requirement',
        fields: {},
        targetStage: '评审通过',
      }),
    ).rejects.toThrow('无权限更新该节点');
    expect(bitable.batchUpdateRecords).not.toHaveBeenCalled();
  });

  it('历史全局 DS 配置不应再授予跨项目编辑权限', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          evt_id: 'test_event',
          流程阶段: '埋点设计',
          数据负责人: [{ id: '2001', name: '数据负责人' }],
        },
      }),
      searchRecords: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'rec_permission',
            record: {
              evt_id: '__system_permissions__',
              记录类型: '权限配置',
              需求背景: JSON.stringify({
                admins: [],
                dataScientists: ['1001'],
                developers: [],
                acceptors: [],
                viewers: [],
              }),
            },
          },
        ],
        hasMore: false,
      }),
      batchUpdateRecords: jest.fn(),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await expect(
      service.updateRecord('app:rec_1', {
        actorId: '1001',
        stageId: 'design',
        fields: { 事件定义: '旧全局 DS 不再生效' },
      }),
    ).rejects.toThrow('无权限更新该节点');
    expect(bitable.batchUpdateRecords).not.toHaveBeenCalled();
  });
});
