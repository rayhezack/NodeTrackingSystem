import { BitableService } from '../../server/modules/bitable/bitable.service';
import { TrackingService } from '../../server/modules/tracking/tracking.service';

describe('复用正式埋点事件', () => {
  it('当前设计记录为空白 evt_id 时，应复用正式事件到当前记录并导入正式参数', async () => {
    const currentDesignRecord = {
      id: 'rec_design',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: '',
        事件中文名: '补齐已有事件参数',
        需求背景: '补齐老事件枚举',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        优先级: 'P1',
        端: ['iOS', 'Android'],
        需求提出人: [{ id: '1867390536304713', name: '孙文' }],
        需求录入人: [{ id: '1867390536304713', name: '孙文' }],
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        研发负责人: [],
        DS验收人: [{ id: '1867390536304713', name: '孙文' }],
        版本: '1.0.0',
        最低版本: '1.0.0',
      },
    };
    const officialEventRecord = {
      id: 'rec_official',
      record: {
        evt_id: 'app_launch',
        事件中文名: 'App 激活',
        端: ['iOS', 'Android'],
        上线版本: '3.12.0',
        状态: '已上线',
        事件定义: '用户完成 App 初始化后上报',
        触发时机: '首个页面可交互后触发',
        '指标/使用场景': 'DAU、启动漏斗',
      },
    };
    const officialParamRecord = {
      id: 'rec_official_param',
      record: {
        参数主键: 'app_launch.launch_type',
        evt_id: 'app_launch',
        事件中文名: 'App 激活',
        参数名: 'launch_type',
        数据类型: 'STRING',
        必传规则: '必传',
        条件说明: '',
        '枚举/取值范围': 'cold_start,warm_start',
        参数定义: '启动类型',
        版本: '3.0.0',
        参数状态: '正式',
        事件状态: '已上线',
        来源表: '埋点设计库',
        App适用性: 'App通用',
        关联事件: [{ id: 'rec_official' }],
        备注: '默认值/示例：cold_start',
      },
    };
    const bitable = {
      getRecord: jest.fn().mockImplementation(async (instanceKey: string, recordId: string) => {
        if (instanceKey === 'workbench' && recordId === 'rec_design') return currentDesignRecord;
        if (instanceKey === 'queryLibrary' && recordId === 'rec_official') return officialEventRecord;
        return null;
      }),
      searchRecords: jest.fn().mockImplementation(async (instanceKey: string) => {
        if (instanceKey === 'workbench') {
          return { records: [currentDesignRecord], hasMore: false };
        }
        if (instanceKey === 'officialParamDetail') {
          return { records: [officialParamRecord], hasMore: false };
        }
        if (instanceKey === 'paramDetail') {
          return { records: [], hasMore: false };
        }
        return { records: [], hasMore: false };
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_design' }]),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'rec_design_param' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.reuseOfficialEvent('app:rec_design', {
      officialRecordId: 'app:rec_official',
      officialParamKeys: ['app_launch.launch_type'],
      actorId: '1867390536304713',
    });

    expect(result).toEqual({
      success: true,
      recordId: 'app:rec_design',
      currentStage: '埋点设计',
      importedParamCount: 1,
      skippedParamCount: 0,
    });
    expect(bitable.batchUpdateRecords).toHaveBeenCalledWith('workbench', [
      {
        id: 'rec_design',
        record: expect.objectContaining({
          evt_id: 'app_launch',
          事件中文名: 'App 激活',
          事件定义: '用户完成 App 初始化后上报',
          触发时机: '首个页面可交互后触发',
          '指标/使用场景': 'DAU、启动漏斗',
          流程阶段: '埋点设计',
          变更类型: '修改',
          版本: '3.12.0',
          参数拆行状态: '已拆行',
        }),
      },
    ]);
    expect(bitable.batchAddRecords).toHaveBeenCalledWith('paramDetail', [
      expect.objectContaining({
        设计参数主键: 'app_launch.launch_type',
        evt_id: 'app_launch',
        参数名: 'launch_type',
        '枚举/取值范围': 'cold_start,warm_start',
        参数定义: '启动类型',
        '默认值/示例': 'cold_start',
        参数状态: '草稿',
        版本: '3.12.0',
        变更类型: '修改',
        来源设计记录ID: 'rec_design',
        关联设计: ['rec_design'],
      }),
    ]);
  });

  it('当前设计记录已有 evt_id 且未选择参数时，应仅复用事件不复制正式参数', async () => {
    const currentDesignRecord = {
      id: 'rec_design',
      record: {
        需求ID: 'APP_REQ_TEST',
        evt_id: 'new_event',
        事件中文名: '新事件',
        需求背景: '同需求补充老事件',
        流程阶段: '埋点设计',
        记录类型: '埋点设计',
        优先级: 'P2',
        端: ['iOS', 'Android'],
        需求提出人: [{ id: '1867390536304713', name: '孙文' }],
        需求录入人: [{ id: '1867390536304713', name: '孙文' }],
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        研发负责人: [],
        DS验收人: [{ id: '1867390536304713', name: '孙文' }],
        版本: '1.0.0',
      },
    };
    const officialEventRecord = {
      id: 'rec_official',
      record: {
        evt_id: 'app_launch',
        事件中文名: 'App 激活',
        端: ['iOS', 'Android'],
        上线版本: '3.12.0',
        事件定义: '用户完成 App 初始化后上报',
        触发时机: '首个页面可交互后触发',
      },
    };
    const bitable = {
      getRecord: jest.fn().mockImplementation(async (instanceKey: string, recordId: string) => {
        if (instanceKey === 'workbench' && recordId === 'rec_design') return currentDesignRecord;
        if (instanceKey === 'queryLibrary' && recordId === 'rec_official') return officialEventRecord;
        return null;
      }),
      searchRecords: jest.fn().mockImplementation(async (instanceKey: string) => {
        if (instanceKey === 'workbench') {
          return { records: [currentDesignRecord], hasMore: false };
        }
        return { records: [], hasMore: false };
      }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_design' }]),
      batchAddRecords: jest.fn().mockResolvedValueOnce([{ id: 'rec_reused' }]),
    };
    const service = new TrackingService(bitable as unknown as BitableService);

    const result = await service.reuseOfficialEvent('app:rec_design', {
      officialRecordId: 'app:rec_official',
      actorId: '1867390536304713',
    });

    expect(result.recordId).toBe('app:rec_reused');
    expect(result.importedParamCount).toBe(0);
    expect(result.skippedParamCount).toBe(0);
    expect(bitable.batchAddRecords).toHaveBeenCalledTimes(1);
    expect(bitable.batchAddRecords).toHaveBeenCalledWith('workbench', [
      expect.objectContaining({
        需求ID: 'APP_REQ_TEST',
        evt_id: 'app_launch',
        事件中文名: 'App 激活',
        需求背景: '同需求补充老事件',
        变更类型: '修改',
      }),
    ]);
  });
});
