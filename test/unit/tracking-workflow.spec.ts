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
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    await service.updateRecord('app:rec_1', {
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
});
