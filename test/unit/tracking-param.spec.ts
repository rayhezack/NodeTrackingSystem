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

    await service.createParam('app:rec_design', {
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
      }),
    ]);
  });
});
