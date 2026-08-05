import { BitableService } from '../../server/modules/bitable/bitable.service';
import { TrackingService } from '../../server/modules/tracking/tracking.service';

describe('提需创建记录', () => {
  it('不应写入提需阶段尚未产生的验收和归档字段', async () => {
    const bitable = {
      searchRecords: jest
        .fn()
        .mockResolvedValue({ records: [], hasMore: false }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.createRecord({
      source: 'app',
      requestName: '测试需求',
      eventName: '测试需求',
      requirementLink: '   ',
      actorId: '1867390536304713',
      requesterIds: ['1867390536304713'],
      recorderIds: ['1867390536304713'],
      dataOwnerIds: ['1867390536304713'],
      devOwnerIds: ['1867390536304713'],
      dsAcceptorIds: ['1867390536304713'],
    });

    const createCall = bitable.batchAddRecords.mock.calls[0];
    const record = createCall[1][0] as Record<string, unknown>;
    expect(record).not.toHaveProperty('需求链接');
    expect(record).not.toHaveProperty('DS验收证据');
    expect(record).not.toHaveProperty('DS验收时间');
    expect(record).not.toHaveProperty('稳定归档时间');
    expect(record['需求ID']).toMatch(/^APP_REQ_/);
    expect(record['需求名称']).toBe('测试需求');
    expect(record['事件中文名']).toBe('测试需求');
    expect(record['需求提出人']).toEqual([1867390536304713]);
    expect(record['需求录入人']).toEqual([1867390536304713]);
    expect(record['数据负责人']).toEqual([1867390536304713]);
    expect(record['研发负责人']).toEqual([1867390536304713]);
    expect(record['DS验收人']).toEqual([1867390536304713]);
  });

  it('已初始化权限配置时，普通内部用户也应允许创建需求', async () => {
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'rec_permission',
            record: {
              evt_id: '__system_permissions__',
              记录类型: '权限配置',
              需求背景: JSON.stringify({
                admins: ['9001'],
                dataScientists: ['9002'],
                developers: [],
                acceptors: [],
                viewers: ['1001'],
              }),
            },
          },
        ],
        hasMore: false,
      }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.createRecord({
      source: 'app',
      requestName: '产品自助提需',
      eventName: '产品自助提需',
      actorId: '1001',
      requesterIds: ['1001'],
      recorderIds: ['1001'],
      dataOwnerIds: ['2001'],
      devOwnerIds: ['3001'],
      dsAcceptorIds: ['4001'],
    });

    expect(bitable.batchAddRecords).toHaveBeenCalledTimes(1);
    const record = bitable.batchAddRecords.mock.calls[0][1][0] as Record<string, unknown>;
    expect(record['需求名称']).toBe('产品自助提需');
    expect(record['需求提出人']).toEqual([1001]);
    expect(record['数据负责人']).toEqual([2001]);
    expect(record['研发负责人']).toEqual([3001]);
    expect(record['DS验收人']).toEqual([4001]);
    expect(record['需求ID']).toMatch(/^APP_REQ_/);
  });

  it('人员选择器返回 raw 信息时，应在通知身份快照中保留 open_id 和邮箱', async () => {
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.createRecord({
      source: 'app',
      requestName: '通知身份测试',
      eventName: '通知身份测试',
      actorId: '1867390536304713',
      requesterIds: [
        {
          user_id: '1867390536304713',
          name: '孙文',
        },
      ],
      dataOwnerIds: [
        {
          user_id: '3008',
          name: 'Joe Liu',
          raw: {
            open_id: 'ou_joe_owner',
            email: 'joe@mail.pollo.ai',
            name: { zh_cn: '刘桥' },
          },
        } as never,
      ],
    });

    const record = bitable.batchAddRecords.mock.calls[0][1][0] as Record<string, unknown>;
    const snapshot = JSON.parse(String(record['通知身份快照'])) as Record<string, Array<Record<string, string>>>;
    expect(snapshot['数据负责人']).toEqual([
      expect.objectContaining({
        user_id: '3008',
        larkUserId: 'ou_joe_owner',
        email: 'joe@mail.pollo.ai',
        name: 'Joe Liu',
      }),
    ]);
  });

  it('未显式传需求提出人时，应默认使用当前用户作为提需人', async () => {
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.createRecord({
      source: 'app',
      requestName: '默认提需人',
      eventName: '默认提需人',
      actorId: '1001',
      actorLarkId: 'ou_requester',
      actorName: '提需同学',
      recorderIds: ['9999'],
      devOwnerIds: ['3001'],
    });

    const record = bitable.batchAddRecords.mock.calls[0][1][0] as Record<string, unknown>;
    expect(record['需求名称']).toBe('默认提需人');
    expect(record['需求提出人']).toEqual([1001]);
    expect(record['需求录入人']).toEqual([1001]);
    expect(record['数据负责人']).toEqual([1867390536304713]);
    expect(record['DS验收人']).toEqual([1867390536304713, 1855461847682347]);
    const snapshot = JSON.parse(String(record['通知身份快照'])) as Record<string, Array<Record<string, string>>>;
    expect(snapshot['需求提出人'][0]).toEqual(expect.objectContaining({
      user_id: '1001',
      larkUserId: 'ou_requester',
      name: '提需同学',
    }));
    expect(snapshot['数据负责人'][0]).toEqual(expect.objectContaining({
      larkUserId: 'ou_dc88ea9baf066ba2f8b0b5fbcb59ca28',
      email: 'ray@mail.pollo.ai',
    }));
    expect(snapshot['DS验收人']).toEqual([
      expect.objectContaining({
        larkUserId: 'ou_dc88ea9baf066ba2f8b0b5fbcb59ca28',
        email: 'ray@mail.pollo.ai',
      }),
      expect.objectContaining({
        larkUserId: 'ou_baee777128714311d1a0fdd2f8304c04',
        email: 'joe@mail.pollo.ai',
      }),
    ]);
    expect(record['需求ID']).toMatch(/^APP_REQ_/);
  });

  it('无法识别当前用户时仍不允许创建需求', async () => {
    const bitable = {
      searchRecords: jest.fn(),
      batchAddRecords: jest.fn(),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await expect(
      service.createRecord({
        source: 'app',
        eventName: '匿名提需',
        requesterIds: ['1001'],
        recorderIds: ['1001'],
        dataOwnerIds: ['2001'],
        devOwnerIds: ['3001'],
        dsAcceptorIds: ['4001'],
      }),
    ).rejects.toThrow('无法识别当前用户');
    expect(bitable.batchAddRecords).not.toHaveBeenCalled();
  });

  it('新增同需求埋点事件时，应补齐当前需求ID并继承需求上下文', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_1',
        record: {
          evt_id: 'event_1',
          需求名称: '核心漏斗补齐',
          事件中文名: '主事件',
          需求背景: '业务需要补齐核心漏斗',
          需求链接: 'https://example.com/prd',
          '指标/使用场景': '转化率分析',
          流程阶段: '埋点设计',
          记录类型: '埋点设计',
          优先级: 'P1',
          端: ['iOS', 'Android'],
          需求提出人: [{ id: '1001', name: '产品同学' }],
          需求录入人: [{ id: '1002', name: '录入同学' }],
          数据负责人: [{ id: '1867390536304713', name: '孙文' }],
          研发负责人: [{ id: '3001', name: '研发同学' }],
          DS验收人: [{ id: '4001', name: '验收同学' }],
          版本: '2.0.0',
          最低版本: '2.0.0',
          变更类型: '新增',
          处理方: '客户端',
          公共属性要求: 'user_id',
        },
      }),
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_new' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.createSiblingEvent('app:rec_1', {
      eventName: '补充事件',
      evtId: 'event_2',
      actorId: '1867390536304713',
    });

    const demandId = bitable.batchUpdateRecords.mock.calls[0][1][0].record['需求ID'];
    const created = bitable.batchAddRecords.mock.calls[0][1][0] as Record<string, unknown>;
    expect(result).toEqual({
      success: true,
      recordId: 'app:rec_new',
      currentStage: '埋点设计',
    });
    expect(demandId).toMatch(/^APP_REQ_/);
    expect(created['需求ID']).toBe(demandId);
    expect(created['需求名称']).toBe('核心漏斗补齐');
    expect(created['evt_id']).toBe('event_2');
    expect(created['事件中文名']).toBe('补充事件');
    expect(created['需求背景']).toBe('业务需要补齐核心漏斗');
    expect(created['需求链接']).toBe('https://example.com/prd');
    expect(created['指标/使用场景']).toBe('转化率分析');
    expect(created['流程阶段']).toBe('埋点设计');
    expect(created['评审状态']).toBe('草稿');
    expect(created['埋点开发状态']).toBe('未开始');
    expect(created['正式状态']).toBe('待开发');
    expect(created['需求提出人']).toEqual([1001]);
    expect(created['需求录入人']).toEqual([1002]);
    expect(created['数据负责人']).toEqual([1867390536304713]);
    expect(created['研发负责人']).toEqual([3001]);
    expect(created['DS验收人']).toEqual([4001]);
  });

  it('保存需求名称时，应同步填充同一需求ID下的所有事件记录', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_main',
        record: {
          需求ID: 'APP_REQ_TEST',
          需求名称: '',
          evt_id: 'event_1',
          事件中文名: '主事件',
          流程阶段: '需求录入',
          记录类型: '埋点设计',
          需求提出人: [{ id: '1001', name: '产品同学' }],
          需求录入人: [{ id: '1001', name: '产品同学' }],
        },
      }),
      searchRecords: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'rec_main',
            record: {
              需求ID: 'APP_REQ_TEST',
              需求名称: '',
              evt_id: 'event_1',
              事件中文名: '主事件',
              记录类型: '埋点设计',
            },
          },
          {
            id: 'rec_child',
            record: {
              需求ID: 'APP_REQ_TEST',
              需求名称: '',
              evt_id: 'event_2',
              事件中文名: '补充事件',
              记录类型: '埋点设计',
            },
          },
        ],
        hasMore: false,
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_main' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.updateRecord('app:rec_main', {
      actorId: '1001',
      stageId: 'requirement',
      fields: {
        需求名称: '核心漏斗埋点补齐',
      },
    });

    expect(bitable.batchUpdateRecords).toHaveBeenNthCalledWith(1, 'workbench', [
      {
        id: 'rec_main',
        record: {
          需求名称: '核心漏斗埋点补齐',
        },
      },
      {
        id: 'rec_child',
        record: {
          需求名称: '核心漏斗埋点补齐',
        },
      },
    ]);
  });

  it('应在调用 Base 前拒绝会被 JavaScript 舍入的人员 ID', async () => {
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
      batchAddRecords: jest.fn(),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await expect(
      service.createRecord({
        source: 'app',
        eventName: '人员 ID 校验',
        actorId: '1867390536304713',
        requesterIds: ['7648831973842095079'],
      }),
    ).rejects.toThrow('人员 ID 超出安全范围');
    expect(bitable.batchAddRecords).not.toHaveBeenCalled();
  });
});
