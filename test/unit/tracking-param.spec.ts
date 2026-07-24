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
});
