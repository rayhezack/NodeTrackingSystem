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
        larkUserId: 'ou_dc88ea9baf066ba2f8b0b5fbcb59ca28',
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

  it('完成上线后应自动新增正式查询库事件，并将设计参数同步为正式参数', async () => {
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
              参数状态: '草稿',
              版本: '1.0.0',
              变更类型: '新增',
              来源设计记录ID: 'rec_1',
              关联设计: [{ id: 'rec_1' }],
            },
          },
          {
            id: 'rec_removed_param',
            record: {
              evt_id: 'test_event',
              参数名: 'removed_param',
              数据类型: 'STRING',
              参数状态: '废弃',
              变更类型: '新增',
              来源设计记录ID: 'rec_1',
              关联设计: [{ id: 'rec_1' }],
            },
          },
        ],
        hasMore: false,
      })
      .mockResolvedValueOnce({ records: [], hasMore: false })
      .mockResolvedValueOnce({ records: [], hasMore: false })
      .mockResolvedValueOnce({ records: [], hasMore: false });
    const batchAddRecords = jest.fn().mockImplementation(async (instanceKey: string, records: Record<string, unknown>[]) => {
      if (instanceKey === 'queryLibrary') return [{ id: 'rec_official' }];
      return records.map((_, index) => ({ id: `${instanceKey}_${index + 1}` }));
    });
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          evt_id: 'test_event',
          事件中文名: '测试事件',
          流程阶段: '上线监控',
          端: ['iOS', 'Android'],
          版本: '2.0.0',
          最低版本: '1.9.0',
          优先级: 'P1',
          处理方: '客户端',
          一级分类: '产品功能分析',
          公共属性要求: 'user_id、device_id',
          事件定义: '用户点击测试入口时上报',
          触发时机: '点击入口后触发',
          '指标/使用场景': '测试转化漏斗',
          正式状态: '待开发',
          需求提出人: [{ id: '1001', name: '提需同学' }],
          需求录入人: [{ id: '1002', name: '历史录入人' }],
          数据负责人: [{ id: '1867390536304713', name: '孙文' }],
          研发负责人: [{ id: '3002', name: '研发同学' }],
          DS验收人: [{ id: '1855461847682347', name: '刘桥' }],
          通知身份快照: JSON.stringify({
            需求提出人: [{ user_id: '1001', larkUserId: 'ou_requester', name: '提需同学' }],
            需求录入人: [{ user_id: '1002', larkUserId: 'ou_legacy_recorder', name: '历史录入人' }],
            数据负责人: [{ user_id: '1867390536304713', larkUserId: 'ou_dc88ea9baf066ba2f8b0b5fbcb59ca28', name: '孙文' }],
            研发负责人: [{ user_id: '3002', larkUserId: 'ou_developer', name: '研发同学' }],
            DS验收人: [{ user_id: '1855461847682347', larkUserId: 'ou_baee777128714311d1a0fdd2f8304c04', name: '刘桥' }],
          }),
        },
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
      searchRecords,
      batchAddRecords,
    };
    const notification = {
      sendWorkflowTransitionNotification: jest.fn().mockResolvedValue({
        planned: true,
        configured: true,
        recipientCount: 4,
        sentCount: 4,
        skippedCount: 0,
        failedCount: 0,
      }),
    };
    const service = new TrackingService(
      bitable as unknown as BitableService,
      undefined as never,
      notification as never,
    );

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
      fieldNames: expect.arrayContaining(['evt_id', '数据负责人', '研发负责人', 'DS验收人', '稳定归档时间']),
      pageSize: 200,
    });
    expect(batchAddRecords).toHaveBeenCalledWith('queryLibrary', [
      expect.objectContaining({
        evt_id: 'test_event',
        事件中文名: '测试事件',
        端: ['iOS', 'Android'],
        上线版本: '2.0.0',
        最低版本: '1.9.0',
        状态: '已上线',
        生命周期状态: '稳定归档',
        优先级: 'P1',
        数据负责人: [1867390536304713],
        研发负责人: [3002],
        DS验收人: [1855461847682347],
        处理方: '客户端',
        一级分类: '产品功能分析',
        公共属性要求: 'user_id、device_id',
        源事件记录ID: 'rec_1',
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
    expect(batchAddRecords).toHaveBeenCalledWith('deprecatedParamDetail', [
      expect.objectContaining({
        废弃参数主键: 'test_event.removed_param',
        evt_id: 'test_event',
        参数名: 'removed_param',
        参数状态: '已废弃',
        来源表: '设计参数明细',
      }),
    ]);
    expect(batchAddRecords).toHaveBeenCalledWith('enumDictionary', [
      expect.objectContaining({ 枚举主键: 'test_event.button_name.submit', 枚举值: 'submit', 枚举状态: '正式' }),
      expect.objectContaining({ 枚举主键: 'test_event.button_name.cancel', 枚举值: 'cancel', 枚举状态: '正式' }),
    ]);
    expect(notification.sendWorkflowTransitionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        toStage: '归档',
        recipients: expect.arrayContaining([
          expect.objectContaining({ larkUserId: 'ou_requester', role: '需求提出人' }),
          expect.objectContaining({ larkUserId: 'ou_dc88ea9baf066ba2f8b0b5fbcb59ca28', role: '数据负责人' }),
          expect.objectContaining({ larkUserId: 'ou_developer', role: '研发负责人' }),
          expect.objectContaining({ larkUserId: 'ou_baee777128714311d1a0fdd2f8304c04', role: '埋点校验人' }),
        ]),
      }),
    );
    const notificationPayload = notification.sendWorkflowTransitionNotification.mock.calls[0][0];
    expect(notificationPayload.recipients).toHaveLength(4);
    expect(notificationPayload.recipients).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ larkUserId: 'ou_legacy_recorder' })]),
    );
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
          最低版本: '2.0.0',
          正式状态: '已上线',
          优先级: 'P2',
          数据负责人: [{ id: '1867390536304713', name: '孙文' }],
          研发负责人: [{ id: '3002', name: '研发同学' }],
          DS验收人: [{ id: '1855461847682347', name: '刘桥' }],
          稳定归档时间: '2026-08-05 14:48:32',
        },
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
      searchRecords: jest.fn().mockResolvedValue({
        records: [{ id: 'rec_official', record: { evt_id: 'test_event' } }],
        hasMore: false,
      }),
      batchAddRecords: jest.fn().mockImplementation(async (_instanceKey: string, records: Record<string, unknown>[]) =>
        records.map((_, index) => ({ id: `rec_enum_${index + 1}` })),
      ),
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
          最低版本: '2.0.0',
          状态: '已上线',
          优先级: 'P2',
          数据负责人: [1867390536304713],
          研发负责人: [3002],
          DS验收人: [1855461847682347],
          稳定归档时间: new Date('2026-08-05T14:48:32').getTime(),
          源事件记录ID: 'rec_1',
        }),
      },
    ]);
    expect(bitable.batchAddRecords).not.toHaveBeenCalled();
  });

  it('归档已有正式参数时应在正式库枚举基础上追加新增枚举，而不是覆盖', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          evt_id: 'createflow_form_submit',
          事件中文名: '创建流程提交',
          流程阶段: '稳定归档',
          端: ['Web'],
          版本: '2.1.0',
          正式状态: '已上线',
        },
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
      searchRecords: jest
        .fn()
        .mockResolvedValueOnce({
          records: [
            {
              id: 'rec_official',
              record: {
                evt_id: 'createflow_form_submit',
                事件中文名: '创建流程提交',
              },
            },
          ],
          hasMore: false,
        })
        .mockResolvedValueOnce({
          records: [
            {
              id: 'rec_design_param',
              record: {
                evt_id: 'createflow_form_submit',
                参数名: 'form_type',
                数据类型: 'STRING',
                必传规则: '非必传',
                '枚举/取值范围': 'abc',
                参数定义: '',
                Web适用性: 'Web通用',
                参数状态: '草稿',
                变更类型: '修改',
                来源设计记录ID: 'rec_1',
                关联设计: ['rec_1'],
              },
            },
          ],
          hasMore: false,
        })
        .mockResolvedValueOnce({
          records: [
            {
              id: 'rec_official_param',
              record: {
                参数主键: 'createflow_form_submit.form_type',
                evt_id: 'createflow_form_submit',
                参数名: 'form_type',
                数据类型: 'STRING',
                '枚举/取值范围': 'old,qwe',
                参数定义: '正式库原有表单类型定义',
                参数状态: '正式',
                关联事件: ['rec_official'],
              },
            },
          ],
          hasMore: false,
        })
        .mockResolvedValueOnce({
          records: [],
          hasMore: false,
        }),
      batchAddRecords: jest.fn().mockImplementation(async (_instanceKey: string, records: Record<string, unknown>[]) =>
        records.map((_, index) => ({ id: `rec_enum_${index + 1}` })),
      ),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.updateRecord('app:rec_1', {
      actorId: '1867390536304713',
      stageId: 'archive',
      fields: {},
    });

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('officialParamDetail', [
      expect.objectContaining({
        id: 'rec_official_param',
        record: expect.objectContaining({
          参数主键: 'createflow_form_submit.form_type',
          '枚举/取值范围': 'old,qwe,abc',
          参数定义: '正式库原有表单类型定义',
        }),
      }),
    ]);
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

  it('被指定为研发负责人的同事应看到进行中的需求待办', async () => {
    const devUserId = 'dev_user_1';
    const bitable = {
      searchRecords: jest
        .fn()
        .mockResolvedValueOnce({
          records: [
            {
              id: 'rec_req',
              record: {
                需求ID: 'REQ_1',
                需求名称: '研发参与需求录入',
                evt_id: 'event_req',
                事件中文名: '需求录入事件',
                流程阶段: '需求录入',
                记录类型: '埋点设计',
                优先级: 'P1',
                研发负责人: [{ id: devUserId, name: '研发同事' }],
                创建时间: 200,
              },
            },
            {
              id: 'rec_design',
              record: {
                需求ID: 'REQ_2',
                需求名称: '研发参与埋点设计',
                evt_id: 'event_design',
                事件中文名: '埋点设计事件',
                流程阶段: '埋点设计',
                记录类型: '埋点设计',
                优先级: 'P2',
                研发负责人: [{ id: devUserId, name: '研发同事' }],
                创建时间: 100,
              },
            },
          ],
          hasMore: false,
        })
        .mockResolvedValueOnce({ records: [], hasMore: false }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.getMyTodos(10, {
      source: 'app',
      actorId: devUserId,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.requestId)).toEqual(['REQ_1', 'REQ_2']);
    expect(result.items.map((item) => item.targetStage)).toEqual(['requirement', 'design']);
    expect(result.items.every((item) => item.todoRole === '研发负责人')).toBe(true);
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

  it('工作台待办和需求列表应按需求ID聚合多个埋点事件', async () => {
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'rec_expose',
            record: {
              需求ID: 'APP_REQ_BG_REMOVE',
              需求名称: '图片背景移除埋点补齐',
              evt_id: 'bg_remove_entry_expose',
              事件中文名: '背景移除入口曝光',
              流程阶段: '埋点设计',
              记录类型: '埋点设计',
              优先级: 'P0',
              端: ['iOS', 'Android'],
              数据负责人: [{ id: '1867390536304713', name: '孙文' }],
              研发负责人: [{ id: '3001', name: '曾家其' }],
              创建时间: 200,
            },
          },
          {
            id: 'rec_click',
            record: {
              需求ID: 'APP_REQ_BG_REMOVE',
              需求名称: '图片背景移除埋点补齐',
              evt_id: 'bg_remove_entry_click',
              事件中文名: '背景移除入口点击',
              流程阶段: '埋点设计',
              记录类型: '埋点设计',
              优先级: 'P0',
              端: ['iOS', 'Android'],
              数据负责人: [{ id: '1867390536304713', name: '孙文' }],
              研发负责人: [{ id: '3001', name: '曾家其' }],
              创建时间: 300,
            },
          },
          {
            id: 'rec_other',
            record: {
              需求ID: 'APP_REQ_OTHER',
              evt_id: 'app_launch',
              事件中文名: 'App 激活',
              流程阶段: '埋点设计',
              记录类型: '埋点设计',
              优先级: 'P1',
              端: ['iOS', 'Android'],
              数据负责人: [{ id: '1867390536304713', name: '孙文' }],
              创建时间: 100,
            },
          },
        ],
        hasMore: false,
      }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const dashboard = await service.getWorkbenchDashboard({
      source: 'app',
      actorId: '1867390536304713',
      pageSize: 20,
      todoLimit: 10,
    });
    const groupedDemand = dashboard.items.find((item) => item.requestId === 'APP_REQ_BG_REMOVE');

    expect(dashboard.total).toBe(2);
    expect(dashboard.items).toHaveLength(2);
    expect(dashboard.todos).toHaveLength(2);
    expect(dashboard.stats.find((item) => item.stage === '埋点设计')?.count).toBe(2);
    expect(groupedDemand).toMatchObject({
      recordId: 'app:rec_click',
      requestName: '图片背景移除埋点补齐',
      eventCount: 2,
      eventIds: ['bg_remove_entry_click', 'bg_remove_entry_expose'],
      eventNames: ['背景移除入口点击', '背景移除入口曝光'],
    });
    expect(dashboard.todos.find((item) => item.requestId === 'APP_REQ_BG_REMOVE')).toMatchObject({
      requestName: '图片背景移除埋点补齐',
      eventCount: 2,
      eventIds: ['bg_remove_entry_click', 'bg_remove_entry_expose'],
    });

    const searchResult = await service.getRecords({
      source: 'app',
      keyword: 'expose',
      pageSize: 20,
    });
    expect(searchResult.items).toHaveLength(1);
    expect(searchResult.items[0].requestId).toBe('APP_REQ_BG_REMOVE');
  });

  it('工作台平台筛选应按 App/Web 库和 iOS/Android 端过滤', async () => {
    const bitable = {
      searchRecords: jest.fn((instanceKey: string) => Promise.resolve({
        records: instanceKey === 'webWorkbench'
          ? [
              {
                id: 'web_rec',
                record: {
                  需求ID: 'WEB_REQ_TEST',
                  evt_id: 'web_event',
                  事件中文名: 'Web 事件',
                  流程阶段: '埋点设计',
                  记录类型: '埋点设计',
                  优先级: 'P1',
                  端: ['Web'],
                  创建时间: 200,
                },
              },
            ]
          : [
              {
                id: 'app_rec',
                record: {
                  需求ID: 'APP_REQ_TEST',
                  evt_id: 'app_event',
                  事件中文名: 'App 事件',
                  流程阶段: '埋点设计',
                  记录类型: '埋点设计',
                  优先级: 'P0',
                  端: ['iOS', 'Android'],
                  创建时间: 100,
                },
              },
            ],
        hasMore: false,
      })),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const appResult = await service.getRecords({ source: 'all', platform: 'App', pageSize: 20 });
    const webResult = await service.getRecords({ source: 'all', platform: 'Web', pageSize: 20 });
    const iosResult = await service.getRecords({ source: 'all', platform: 'iOS', pageSize: 20 });

    expect(appResult.items.map((item) => item.source)).toEqual(['app']);
    expect(webResult.items.map((item) => item.source)).toEqual(['web']);
    expect(iosResult.items.map((item) => item.evtId)).toEqual(['app_event']);
  });

  it('仅校验事件归档时不应同步正式查询库和正式参数库', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_validation_only',
        record: {
          evt_id: 'createflow_form_submit',
          事件中文名: '创建流程提交',
          流程阶段: '上线监控',
          正式状态: '待开发',
          发布状态: '发布成功',
          上线监控状态: '通过',
          变更类型: '仅校验',
          数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        },
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_validation_only' }]),
      searchRecords: jest.fn(),
      batchAddRecords: jest.fn(),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.updateRecord('app:rec_validation_only', {
      actorId: '1867390536304713',
      stageId: 'archive',
      targetStage: '归档',
      fields: {},
    });

    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [
      {
        id: 'rec_validation_only',
        record: {
          流程阶段: '稳定归档',
          评审状态: '已通过',
          埋点开发状态: '已开发',
          DS验收状态: '通过',
        },
      },
    ]);
    expect(bitable.searchRecords).not.toHaveBeenCalled();
    expect(bitable.batchAddRecords).not.toHaveBeenCalled();
  });
});
