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
      }),
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
