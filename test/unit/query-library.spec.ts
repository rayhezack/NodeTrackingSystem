import { BitableService } from '../../server/modules/bitable/bitable.service';
import { QueryLibraryService } from '../../server/modules/query-library/query-library.service';

describe('正式查询库参数读取', () => {
  it('AI 候选上下文应一次扫描正式参数表并按事件归组', async () => {
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'rec_param_1',
            record: {
              参数主键: 'event_one.entry_source',
              evt_id: 'event_one',
              参数名: 'entry_source',
              数据类型: 'STRING',
              必传规则: '必传',
              参数定义: '入口来源',
              参数状态: '正式',
              App适用性: 'App通用',
              关联事件: [{ id: 'rec_event_1' }],
            },
          },
          {
            id: 'rec_param_2',
            record: {
              参数主键: 'event_two.result',
              evt_id: 'event_two',
              参数名: 'result',
              数据类型: 'STRING',
              必传规则: '必传',
              参数定义: '结果',
              参数状态: '正式',
              App适用性: 'App通用',
              关联事件: [{ id: 'rec_event_2' }],
            },
          },
        ],
        hasMore: false,
      }),
    };
    const service = new QueryLibraryService(bitable as unknown as BitableService);
    const events = [
      {
        recordId: 'app:rec_event_1',
        source: 'app' as const,
        evtId: 'event_one',
        eventName: '事件一',
        platform: 'iOS、Android',
        version: '1.0.0',
        status: '已上线',
        paramLink: '',
      },
      {
        recordId: 'app:rec_event_2',
        source: 'app' as const,
        evtId: 'event_two',
        eventName: '事件二',
        platform: 'iOS、Android',
        version: '1.0.0',
        status: '已上线',
        paramLink: '',
      },
    ];

    const result = await (service as QueryLibraryService & {
      getEventContexts: (items: typeof events) => Promise<Array<{ event: typeof events[number]; params: Array<{ paramName: string }> }>>;
    }).getEventContexts(events);

    expect(bitable.searchRecords).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { event: events[0], params: [expect.objectContaining({ paramName: 'entry_source' })] },
      { event: events[1], params: [expect.objectContaining({ paramName: 'result' })] },
    ]);
  });

  it('应从正式参数表读取参数，而不是回读设计参数表', async () => {
    const bitable = {
      getRecord: jest.fn().mockResolvedValue({
        id: 'rec_official',
        record: {
          evt_id: 'test_event',
          参数明细入口: 'https://bcn0tgplxp2e.feishu.cn/base/Kgy0b4bvmaJSK8sjQDscUrNJnOf?table=tblEYv9lGZeenbT2',
        },
      }),
      searchRecords: jest.fn().mockResolvedValue({
        records: [
          {
            id: 'rec_official_param_1',
            record: {
              参数主键: 'test_event.button_name',
              evt_id: 'test_event',
              参数名: 'button_name',
              数据类型: 'STRING',
              必传规则: '必传',
              '枚举/取值范围': 'submit/cancel',
              参数定义: '按钮名称',
              备注: '默认值/示例：submit',
              App适用性: 'App通用',
              参数状态: '正式',
              关联事件: [{ id: 'rec_official' }],
            },
          },
          {
            id: 'rec_official_param_deprecated',
            record: {
              参数主键: 'test_event.old_param',
              evt_id: 'test_event',
              参数名: 'old_param',
              数据类型: 'STRING',
              必传规则: '非必传',
              参数定义: '旧参数',
              参数状态: '已废弃',
              关联事件: [{ id: 'rec_official' }],
            },
          },
        ],
        hasMore: false,
      }),
    };
    const service = new QueryLibraryService(bitable as unknown as BitableService);

    const result = await service.getParams('app:rec_official');

    expect(bitable.searchRecords).toHaveBeenCalledWith('officialParamDetail', {
      fieldNames: [
        '参数主键',
        'evt_id',
        '事件中文名',
        '参数名',
        '数据类型',
        '必传规则',
        '条件说明',
        '枚举/取值范围',
        '参数定义',
        '版本',
        '参数状态',
        '事件状态',
        '来源表',
        'App适用性',
        '关联事件',
        '备注',
      ],
      pageSize: 200,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        paramKey: 'test_event.button_name',
        paramName: 'button_name',
        required: true,
        status: '正式',
      }),
    ]);
    expect(result.total).toBe(1);
  });
});
