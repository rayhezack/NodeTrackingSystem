import { BitableService } from '../../server/modules/bitable/bitable.service';
import { TrackingService } from '../../server/modules/tracking/tracking.service';

describe('工作流 Base 回写', () => {
  it('详情接口应把 Base 人员 open_id 映射为可回显的飞书用户', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          事件中文名: '测试需求',
          流程阶段: '需求录入',
          需求提出人: [{ id: 'ou_sunwen', name: '孙文' }],
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
          事件中文名: '测试需求',
          流程阶段: '需求录入',
          需求提出人: [
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
          evt_id: '',
          流程阶段: '需求录入',
          需求提出人: [{ id: 'ou_sunwen', name: '孙文' }],
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
        需求提出人: [],
        需求背景: '保留负责人',
      },
      targetStage: '埋点设计',
    });

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [
      {
        id: 'rec_1',
        record: {
          需求背景: '保留负责人',
          流程阶段: '埋点设计',
        },
      },
    ]);
  });

  it('应在同一次 Base 更新中写入设计字段和目标阶段', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          evt_id: '',
          流程阶段: '需求录入',
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
        evt_id: 'test_event',
        事件定义: '点击测试按钮时上报',
      },
      targetStage: '埋点设计',
    });

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [
      {
        id: 'rec_1',
        record: {
          evt_id: 'test_event',
          事件定义: '点击测试按钮时上报',
          流程阶段: '埋点设计',
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

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [{ id: 'rec_1', record: { 评审状态: '已拒绝' } }]);
  });

  it('完成上线后应自动新增正式查询库事件并同步正式参数', async () => {
    const searchRecords = jest
      .fn()
      .mockResolvedValueOnce({ records: [], hasMore: false })
      .mockResolvedValueOnce({
        records: [
          {
            id: 'rec_param_1',
            record: {
              evt_id: 'test_event',
              参数名: 'button_name',
              数据类型: 'STRING',
              必传规则: '必传',
              条件说明: '点击入口时必传',
              '枚举/取值范围': 'submit/cancel',
              参数定义: '按钮名称',
              '默认值/示例': 'submit',
              App适用性: 'App通用',
              参数状态: '已发布',
              版本: '2.0.0',
              变更类型: '新增',
              来源设计记录ID: 'rec_1',
              关联设计: [{ id: 'rec_1' }],
            },
          },
        ],
        hasMore: false,
      })
      .mockResolvedValueOnce({ records: [], hasMore: false });
    const batchAddRecords = jest.fn().mockImplementation(async (instanceKey: string) => (instanceKey === 'queryLibrary' ? [{ id: 'rec_official' }] : [{ id: 'rec_official_param_1' }]));
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
      searchRecords,
      batchAddRecords,
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
      fieldNames: ['evt_id', '事件中文名', '端', '上线版本', '状态', '生命周期状态', '参数明细入口', '事件定义', '触发时机', '指标/使用场景'],
      pageSize: 200,
    });
    expect(batchAddRecords).toHaveBeenCalledWith('queryLibrary', [
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
        参数明细入口: 'https://bcn0tgplxp2e.feishu.cn/base/Kgy0b4bvmaJSK8sjQDscUrNJnOf?table=tblEYv9lGZeenbT2',
      }),
    ]);
    expect(batchAddRecords).toHaveBeenCalledWith('officialParamDetail', [
      expect.objectContaining({
        参数主键: 'test_event.button_name',
        evt_id: 'test_event',
        事件中文名: '测试事件',
        参数名: 'button_name',
        数据类型: 'STRING',
        必传规则: '必传',
        条件说明: '点击入口时必传',
        '枚举/取值范围': 'submit/cancel',
        参数定义: '按钮名称',
        版本: '2.0.0',
        参数状态: '正式',
        事件状态: '已上线',
        来源表: '埋点设计库',
        关联事件: ['rec_official'],
        App适用性: 'App通用',
        备注: '默认值/示例：submit',
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

  it('工作台首屏聚合接口应复用同一轮 App/Web 工作台读取', async () => {
    const searchRecords = jest.fn().mockImplementation(async (instanceKey: string) => {
      if (instanceKey === 'workbench') {
        return {
          records: [
            {
              id: 'rec_app_1',
              record: {
                evt_id: 'app_event',
                事件中文名: 'App 事件',
                流程阶段: '需求录入',
                记录类型: '埋点设计',
                优先级: 'P1',
                端: ['iOS'],
                数据负责人: [{ id: '1867390536304713', name: '孙文' }],
                创建时间: 200,
              },
            },
          ],
          hasMore: false,
        };
      }
      return {
        records: [
          {
            id: 'rec_web_1',
            record: {
              evt_id: 'web_event',
              事件中文名: 'Web 事件',
              流程阶段: '埋点设计',
              记录类型: '埋点设计',
              优先级: 'P2',
              端: ['Web'],
              数据负责人: [{ id: '1867390536304713', name: '孙文' }],
              创建时间: 100,
            },
          },
        ],
        hasMore: false,
      };
    });
    const service = new TrackingService({ searchRecords } as unknown as BitableService);

    const result = await service.getWorkbenchDashboard({
      source: 'all',
      actorId: '1867390536304713',
      pageSize: 1,
      todoLimit: 10,
    });

    expect(searchRecords).toHaveBeenCalledTimes(2);
    expect(searchRecords).toHaveBeenNthCalledWith(1, 'workbench', {
      fieldNames: expect.any(Array),
      pageSize: 200,
    });
    expect(searchRecords).toHaveBeenNthCalledWith(2, 'webWorkbench', {
      fieldNames: expect.any(Array),
      pageSize: 200,
    });
    expect(result.stats.find((item) => item.stage === '埋点提需')?.count).toBe(1);
    expect(result.stats.find((item) => item.stage === '埋点设计')?.count).toBe(1);
    expect(result.todos).toHaveLength(2);
    expect(result.items).toHaveLength(1);
    expect(result.hasMore).toBe(true);
    expect(result.pageToken).toBe('1');
    expect(result.total).toBe(2);
  });

  it('获取我的待办缺少当前用户时不应读取 Base', async () => {
    const bitable = {
      searchRecords: jest.fn(),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.getMyTodos(10, { source: 'all' });

    expect(result.items).toEqual([]);
    expect(bitable.searchRecords).not.toHaveBeenCalled();
  });

  it('需求列表应按 pageToken 返回下一页而不是重复第一页', async () => {
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'rec_1',
            record: {
              evt_id: 'event_1',
              事件中文名: '事件 1',
              流程阶段: '需求录入',
              记录类型: '埋点设计',
              优先级: 'P1',
              创建时间: 300,
            },
          },
          {
            id: 'rec_2',
            record: {
              evt_id: 'event_2',
              事件中文名: '事件 2',
              流程阶段: '需求录入',
              记录类型: '埋点设计',
              优先级: 'P2',
              创建时间: 200,
            },
          },
          {
            id: 'rec_3',
            record: {
              evt_id: 'event_3',
              事件中文名: '事件 3',
              流程阶段: '需求录入',
              记录类型: '埋点设计',
              优先级: 'P3',
              创建时间: 100,
            },
          },
        ],
        hasMore: false,
      }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const firstPage = await service.getRecords({ source: 'app', pageSize: 2 });
    const secondPage = await service.getRecords({
      source: 'app',
      pageSize: 2,
      pageToken: firstPage.pageToken,
    });

    expect(firstPage.items.map((item) => item.evtId)).toEqual(['event_1', 'event_2']);
    expect(firstPage.pageToken).toBe('2');
    expect(secondPage.items.map((item) => item.evtId)).toEqual(['event_3']);
    expect(secondPage.hasMore).toBe(false);
  });
});
