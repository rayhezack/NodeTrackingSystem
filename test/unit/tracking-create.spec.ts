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
    expect(record['需求提出人']).toEqual([1001]);
    expect(record['数据负责人']).toEqual([2001]);
    expect(record['研发负责人']).toEqual([3001]);
    expect(record['DS验收人']).toEqual([4001]);
  });

  it('未显式传需求提出人时，应默认使用当前用户作为提需人', async () => {
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_1' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.createRecord({
      source: 'app',
      eventName: '默认提需人',
      actorId: '1001',
      recorderIds: ['1001'],
      dataOwnerIds: ['2001'],
      devOwnerIds: ['3001'],
      dsAcceptorIds: ['4001'],
    });

    const record = bitable.batchAddRecords.mock.calls[0][1][0] as Record<string, unknown>;
    expect(record['需求提出人']).toEqual([1001]);
    expect(record['需求录入人']).toEqual([1001]);
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
