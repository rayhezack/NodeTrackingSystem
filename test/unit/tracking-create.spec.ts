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
