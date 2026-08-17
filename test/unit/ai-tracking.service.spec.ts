import { AiTrackingService } from '../../server/modules/ai-tracking/ai-tracking.service';
import type { TrackingDetail } from '../../shared/api.interface';

describe('AI 埋点草稿', () => {
  function createFixture(detailOverrides: Partial<TrackingDetail> = {}) {
    const detail = {
      recordId: 'app:rec_1',
      source: 'app',
      requestId: 'APP_REQ_TEST',
      requestName: '首页 Agent 入口',
      evtId: '',
      eventName: '首页 Agent 入口',
      stage: '需求录入',
      uiStage: '需求录入',
      reviewStatus: '草稿',
      devStatus: '未开始',
      acceptanceStatus: '未开始',
      requester: [],
      requesterIds: [],
      recorder: [],
      recorderIds: [],
      dataOwner: [],
      dataOwnerIds: ['actor_1'],
      devOwner: [],
      devOwnerIds: [],
      dsAcceptor: [],
      dsAcceptorIds: [],
      priority: 'P1',
      platform: 'iOS、Android',
      requirementFields: {
        需求链接: 'https://example.feishu.cn/wiki/wiki_test',
        需求背景: '首页增加 Agent 入口',
        '指标/使用场景': '入口曝光和任务发起转化',
      },
      designFields: {},
      reviewFields: {},
      devFields: {},
      acceptanceFields: {},
      launchFields: {},
      archiveFields: {},
      relatedEvents: [],
      permissions: {
        canEditRequirement: true,
        canEditDesign: true,
        canEditReview: false,
        canEditDev: false,
        canEditAcceptance: false,
        canEditLaunch: false,
        canEditArchive: false,
        canEditParams: true,
      },
      updatedAt: 0,
      ...detailOverrides,
    } as TrackingDetail;
    const tracking = {
      getDetail: jest.fn().mockResolvedValue({ data: detail }),
      getParams: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      updateRecord: jest.fn().mockResolvedValue({ success: true, recordId: detail.recordId, currentStage: '埋点设计' }),
      createSiblingEvent: jest.fn().mockResolvedValue({ success: true, recordId: 'app:rec_2', currentStage: '埋点设计' }),
      createParam: jest.fn().mockResolvedValue({ success: true, recordId: 'app:param_1' }),
    };
    const queryLibrary = {
      getEvents: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
      getParams: jest.fn(),
    };
    const oauth = {
      configured: true,
      getAccessToken: jest.fn().mockResolvedValue('user-token'),
    };
    const documents = {
      fetchPrd: jest.fn().mockResolvedValue({
        url: 'https://example.feishu.cn/wiki/wiki_test',
        title: '首页新增 Agent 入口',
        revision: '1',
        content: '首页新增 Agent 输入框；用户发起任务后进入 Agent 会话。',
        truncated: false,
      }),
    };
    const model = {
      status: {
        configured: true,
        provider: 'kimi',
        model: 'kimi-test',
        reasoningEffort: 'medium',
      },
      generateJson: jest.fn().mockResolvedValue({
        summary: '生成一个任务发起事件',
        analystQuestions: ['版本号待确认'],
        events: [
          {
            evtId: 'home_agent_task_submit',
            eventName: '首页 Agent 任务发起',
            eventDefinition: '用户从首页 Agent 输入框发起任务',
            triggerTiming: '任务请求成功提交时上报',
            metricScenario: 'Agent 入口任务发起转化率',
            priority: 'P0',
            platform: 'iOS、Android',
            handler: '客户端/服务端',
            version: '待人工确认',
            minVersion: '待人工确认',
            changeType: '新增',
            evidence: ['PRD 明确用户发起任务后进入会话'],
            uncertainties: ['版本号待人工确认'],
            params: [
              {
                paramName: 'entry_source',
                paramType: 'STRING',
                requiredRule: '必传',
                definition: '任务发起入口',
                enumRange: 'home // 首页',
                platform: 'App通用',
              },
            ],
          },
        ],
      }),
    };
    const service = new AiTrackingService(
      tracking as never,
      queryLibrary as never,
      oauth as never,
      documents as never,
      model as never,
    );
    return { service, tracking, model };
  }

  it('生成新版草稿不应写 Base，并应递增版本', async () => {
    const { service, tracking } = createFixture();

    const first = await service.generateDraft('app:rec_1', { actorId: 'actor_1' });
    const second = await service.generateDraft('app:rec_1', { actorId: 'actor_1' });

    expect(first.draft.version).toBe(1);
    expect(second.draft.version).toBe(2);
    expect(first.draft.status).toBe('draft');
    expect(tracking.updateRecord).not.toHaveBeenCalled();
    expect(tracking.createSiblingEvent).not.toHaveBeenCalled();
    expect(tracking.createParam).not.toHaveBeenCalled();
  });

  it('空白占位事件只在人工应用后写入，重复应用不应重复写入', async () => {
    const { service, tracking } = createFixture();
    const { draft } = await service.generateDraft('app:rec_1', { actorId: 'actor_1' });

    const first = await service.applyDraft('app:rec_1', draft.id, { actorId: 'actor_1' });
    const second = await service.applyDraft('app:rec_1', draft.id, { actorId: 'actor_1' });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(tracking.updateRecord).toHaveBeenCalledTimes(1);
    expect(tracking.updateRecord).toHaveBeenCalledWith('app:rec_1', expect.objectContaining({
      fields: expect.objectContaining({ evt_id: 'home_agent_task_submit' }),
      targetStage: '埋点设计',
    }));
    expect(tracking.createSiblingEvent).not.toHaveBeenCalled();
    expect(tracking.createParam).toHaveBeenCalledTimes(1);
  });

  it('已有事件时必须新增同需求事件，不能覆盖当前事件', async () => {
    const existing = {
      recordId: 'app:rec_1',
      source: 'app' as const,
      evtId: 'existing_event',
      eventName: '已有事件',
      stage: '埋点设计',
      uiStage: '埋点设计',
      priority: 'P1',
      platform: 'iOS、Android',
      isCurrent: true,
    };
    const { service, tracking } = createFixture({
      evtId: 'existing_event',
      eventName: '已有事件',
      relatedEvents: [existing],
    });
    const { draft } = await service.generateDraft('app:rec_1', { actorId: 'actor_1' });

    await service.applyDraft('app:rec_1', draft.id, { actorId: 'actor_1' });

    expect(tracking.updateRecord).not.toHaveBeenCalled();
    expect(tracking.createSiblingEvent).toHaveBeenCalledTimes(1);
    expect(tracking.createSiblingEvent).toHaveBeenCalledWith('app:rec_1', expect.objectContaining({
      evtId: 'home_agent_task_submit',
    }));
  });
});
