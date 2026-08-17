import { BitableService } from '../../server/modules/bitable/bitable.service';
import { TrackingService } from '../../server/modules/tracking/tracking.service';
import type { AiTrackingDraftEvent } from '../../shared/api.interface';

describe('AI 埋点草稿批量录入', () => {
  it('多事件多参数应批量写入，不能退化为逐事件逐参数请求', async () => {
    const current = {
      id: 'rec_current',
      record: {
        需求ID: 'WEB_REQ_TEST',
        需求名称: '首页新增 Agent 入口',
        evt_id: '',
        事件中文名: '首页新增 Agent 入口',
        需求背景: '新增 Agent 入口',
        需求链接: 'https://example.feishu.cn/wiki/test',
        流程阶段: '需求录入',
        记录类型: '埋点设计',
        优先级: 'P1',
        端: ['Web'],
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
        版本: '1.0.0',
      },
    };
    const bitable = {
      getRecord: jest.fn().mockResolvedValue(current),
      searchRecords: jest.fn().mockResolvedValue({ records: [current], hasMore: false }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_current' }]),
      batchAddRecords: jest.fn().mockImplementation(async (instanceKey: string, records: unknown[]) => {
        if (instanceKey === 'webWorkbench') {
          return records.map((_, index) => ({ id: `rec_sibling_${index + 1}` }));
        }
        if (instanceKey === 'webParamDetail') {
          return records.map((_, index) => ({ id: `rec_param_${index + 1}` }));
        }
        throw new Error(`unexpected instance: ${instanceKey}`);
      }),
    };
    const service = new TrackingService(bitable as unknown as BitableService);
    const events = Array.from({ length: 4 }, (_, eventIndex): AiTrackingDraftEvent => ({
      clientId: `event_${eventIndex + 1}`,
      evtId: `agent_event_${eventIndex + 1}`,
      eventName: `Agent 事件 ${eventIndex + 1}`,
      eventDefinition: '事件定义',
      triggerTiming: '触发时机',
      metricScenario: '',
      priority: 'P0',
      platform: 'Web',
      handler: '客户端/服务端',
      commonProps: 'user_id',
      version: '待人工确认',
      minVersion: '待人工确认',
      changeType: '新增',
      evidence: [],
      uncertainties: [],
      params: Array.from({ length: 5 }, (_, paramIndex) => ({
        paramName: `param_${paramIndex + 1}`,
        paramType: 'STRING',
        requiredRule: '必传',
        triggerCondition: '',
        enumRange: 'value_a // 枚举 A',
        definition: '参数定义',
        defaultValue: '',
        example: 'value_a',
        platform: 'Web通用',
        source: 'ai',
        uncertainties: [],
      })),
    }));
    const applyBatch = (service as unknown as {
      applyAiDraftEvents?: (
        recordId: string,
        draftEvents: AiTrackingDraftEvent[],
        actorId?: string,
        actorLarkId?: string,
      ) => Promise<{
        appliedRecordIds: string[];
        createdEventCount: number;
        createdParamCount: number;
      }>;
    }).applyAiDraftEvents;

    expect(applyBatch).toEqual(expect.any(Function));
    const result = await applyBatch?.call(
      service,
      'web:rec_current',
      events,
      '1867390536304713',
    );

    expect(result).toEqual({
      appliedRecordIds: [
        'web:rec_current',
        'web:rec_sibling_1',
        'web:rec_sibling_2',
        'web:rec_sibling_3',
      ],
      createdEventCount: 4,
      createdParamCount: 20,
    });
    expect(bitable.batchAddRecords).toHaveBeenCalledTimes(2);
    expect(bitable.batchAddRecords).toHaveBeenCalledWith(
      'webWorkbench',
      expect.arrayContaining([
        expect.objectContaining({ evt_id: 'agent_event_2' }),
        expect.objectContaining({ evt_id: 'agent_event_4' }),
      ]),
    );
    expect(bitable.batchAddRecords).toHaveBeenCalledWith(
      'webParamDetail',
      expect.arrayContaining([
        expect.objectContaining({ evt_id: 'agent_event_1', 参数名: 'param_1' }),
        expect.objectContaining({ evt_id: 'agent_event_4', 参数名: 'param_5' }),
      ]),
    );
  });

  it('参数批量写入失败时应回滚本轮新增事件，且不能提前覆盖空白需求', async () => {
    const current = {
      id: 'rec_current',
      record: {
        需求ID: 'WEB_REQ_ROLLBACK',
        需求名称: '回滚测试',
        evt_id: '',
        事件中文名: '回滚测试',
        需求链接: 'https://example.feishu.cn/wiki/test',
        流程阶段: '需求录入',
        端: ['Web'],
        数据负责人: [{ id: '1867390536304713', name: '孙文' }],
      },
    };
    const bitable = {
      getRecord: jest.fn().mockResolvedValue(current),
      searchRecords: jest.fn().mockResolvedValue({ records: [current], hasMore: false }),
      batchUpdateRecords: jest.fn().mockResolvedValue([{ id: 'rec_current' }]),
      batchAddRecords: jest.fn().mockImplementation(async (instanceKey: string) => {
        if (instanceKey === 'webWorkbench') return [{ id: 'rec_sibling_1' }];
        if (instanceKey === 'webParamDetail') throw new Error('参数写入失败');
        throw new Error(`unexpected instance: ${instanceKey}`);
      }),
      deleteRecords: jest.fn().mockResolvedValue(true),
    };
    const service = new TrackingService(bitable as unknown as BitableService);
    const events: AiTrackingDraftEvent[] = [1, 2].map((index) => ({
      clientId: `event_${index}`,
      evtId: `rollback_event_${index}`,
      eventName: `回滚事件 ${index}`,
      eventDefinition: '回滚事件定义',
      triggerTiming: '点击后上报',
      metricScenario: '',
      priority: 'P1',
      platform: 'Web',
      handler: '前端',
      commonProps: '',
      version: '待人工确认',
      minVersion: '待人工确认',
      changeType: '新增',
      evidence: [],
      uncertainties: [],
      params: [{
        paramName: 'page_name',
        paramType: 'STRING',
        requiredRule: '必传',
        triggerCondition: '',
        enumRange: 'home // 首页',
        definition: '页面名称',
        defaultValue: '',
        example: 'home',
        platform: 'Web通用',
        source: 'ai',
        uncertainties: [],
      }],
    }));

    await expect(
      service.applyAiDraftEvents('web:rec_current', events, '1867390536304713'),
    ).rejects.toThrow('参数写入失败');

    expect(bitable.batchUpdateRecords).not.toHaveBeenCalled();
    expect(bitable.deleteRecords).toHaveBeenCalledWith('webWorkbench', ['rec_sibling_1']);
  });
});
