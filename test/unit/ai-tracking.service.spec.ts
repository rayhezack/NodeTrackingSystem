import { AiTrackingService } from '../../server/modules/ai-tracking/ai-tracking.service';
import type { TrackingDetail } from '../../shared/api.interface';
import type { GovernanceSnapshot } from '../../shared/official-first-workflow';

const plan = { primaryBoard: 'Agent', decisions: [{ evtId: 'home_agent_task_submit', decision: 'new', reason: '当前正式目录没有首页Agent发起任务事件', comparedEventIds: [] }] };

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
      applyAiDraftEvents: jest.fn().mockResolvedValue({
        appliedRecordIds: [detail.recordId],
        createdEventCount: 1,
        createdParamCount: 1,
      }),
    };
    const queryLibrary = {
      getGovernanceSnapshot: jest.fn().mockResolvedValue({ source: detail.source, events: [], contexts: [], commonProps: [{ name: 'page_name' }], enums: [], fingerprint: 'snapshot-1', counts: { events: 1, params: 1, commonProps: 1, enums: 1 } } as GovernanceSnapshot),
      getEvents: jest.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
      getParams: jest.fn(),
      getEventContexts: jest.fn().mockResolvedValue([]),
    };
    const oauth = {
      configured: true,
      documentAccessConfigured: true,
      getAccessToken: jest.fn().mockResolvedValue('user-token'),
      getDocumentAccessToken: jest.fn().mockResolvedValue('user-token'),
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
        model: 'kimi-k3',
        reasoningEffort: 'low',
      },
      generateJson: jest.fn().mockImplementation(async (messages: { content: string }[]) => messages[1].content.startsWith('阶段1') ? plan : ({
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
                example: 'home',
                platform: 'App通用',
              },
            ],
          },
        ],
      })),
    };
    const service = new AiTrackingService(
      tracking as never,
      queryLibrary as never,
      oauth as never,
      documents as never,
      model as never,
    );
    return { service, tracking, queryLibrary, documents, model };
  }

  it("Web/App仅读取当前端完整治理快照，第二阶段包含公共属性和完整参数", async () => {
    for (const source of ["web", "app"] as const) {
      const { service, queryLibrary, model } = createFixture({ source });
      const { draft } = await service.generateDraft(source + ":rec_1", { actorId: "actor_1" });
      expect(queryLibrary.getGovernanceSnapshot).toHaveBeenCalledWith(source);
      expect(model.generateJson).toHaveBeenCalledTimes(2);
      expect(model.generateJson.mock.calls[0][0][1].content).toContain("完整正式事件目录");
      expect(model.generateJson.mock.calls[1][0][1].content).toContain("完整公共属性");
      expect(draft.governance?.workflowVersion).toBe("official-first-v3");
      expect(draft.events[0].params[0].enumRange).toBe("home");
    }
  });

  it("正式库读取失败时不调用模型，不写入Base", async () => {
    const { service, queryLibrary, model, tracking } = createFixture();
    queryLibrary.getGovernanceSnapshot.mockRejectedValue(new Error("正式库无权限"));
    await expect(service.generateDraft("app:rec_1", { actorId: "actor_1" })).rejects.toThrow("正式库无权限");
    expect(model.generateJson).not.toHaveBeenCalled();
    expect(tracking.applyAiDraftEvents).not.toHaveBeenCalled();
  });

  it('应拒绝超过单次上限的模型草稿，避免拖垮 Base 批量写入', async () => {
    const { service, model } = createFixture();
    model.generateJson.mockResolvedValueOnce(plan);
    model.generateJson.mockResolvedValue({
      events: Array.from({ length: 21 }, (_, index) => ({
        evtId: `event_${index + 1}`,
        eventName: `事件 ${index + 1}`,
        params: [],
      })),
    });

    await expect(
      service.generateDraft('app:rec_1', { actorId: 'actor_1' }),
    ).rejects.toThrow('单次最多生成 20 个埋点事件');
  });

  it('需求单没有 PRD 链接时应在读取文档和调用模型前阻断', async () => {
    const { service, documents, model } = createFixture({
      requirementFields: {
        需求链接: '',
        需求背景: '缺少 PRD',
      },
    });

    await expect(
      service.generateDraft('app:rec_1', { actorId: 'actor_1' }),
    ).rejects.toThrow('请先提供 PRD 文档链接，再生成 AI 埋点初稿');
    expect(documents.fetchPrd).not.toHaveBeenCalled();
    expect(model.generateJson).not.toHaveBeenCalled();
  });

  it('PRD 无读取权限时应直接失败，不继续读取历史库或调用模型', async () => {
    const { service, tracking, documents, queryLibrary, model } = createFixture();
    documents.fetchPrd.mockRejectedValue(new Error('当前飞书账号无权读取这份 PRD，请确认该账号可在飞书中打开文档后重试'));

    await expect(
      service.generateDraft('app:rec_1', { actorId: 'actor_1' }),
    ).rejects.toThrow('当前飞书账号无权读取这份 PRD');
    expect(tracking.getParams).not.toHaveBeenCalled();
    expect(queryLibrary.getEvents).not.toHaveBeenCalled();
    expect(queryLibrary.getEventContexts).not.toHaveBeenCalled();
    expect(model.generateJson).not.toHaveBeenCalled();
  });

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

  it('生成超过网关安全时间时应转为后台任务，并复用同一生成中的草稿', async () => {
    jest.useFakeTimers();
    try {
      const { service, model } = createFixture();
      let resolveModel: ((value: unknown) => void) | undefined;
      model.generateJson.mockResolvedValueOnce(plan).mockReturnValueOnce(new Promise((resolve) => {
        resolveModel = resolve;
      }));

      const pending = service.generateDraft('app:rec_1', { actorId: 'actor_1' });
      await jest.advanceTimersByTimeAsync(8_000);
      const first = await pending;

      expect(first.draft.status).toBe('generating');
      const duplicate = await service.generateDraft('app:rec_1', { actorId: 'actor_1' });
      expect(duplicate.draft.id).toBe(first.draft.id);
      expect(model.generateJson).toHaveBeenCalledTimes(2);

      resolveModel?.({
        events: [{
          evtId: 'home_agent_task_submit',
          eventName: '首页 Agent 任务发起',
          eventDefinition: '用户发起任务',
          triggerTiming: '提交成功时',
          params: [],
        }],
      });
      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(0);

      const completed = await service.getDraft('app:rec_1', first.draft.id, 'actor_1');
      expect(completed.draft?.status).toBe('draft');
    } finally {
      jest.useRealTimers();
    }
  });

  it('同一分析师关闭弹窗或返回页面后仍应能读取最近草稿', async () => {
    const { service } = createFixture();
    const generated = await service.generateDraft('app:rec_1', { actorId: 'actor_1' });
    const latestGetter = (service as unknown as {
      getLatestDraft?: (
        recordId: string,
        actorId?: string,
        actorLarkId?: string,
      ) => Promise<{ draft: { id: string } | null }>;
    }).getLatestDraft;

    expect(latestGetter).toEqual(expect.any(Function));
    const latest = await latestGetter?.call(service, 'app:rec_1', 'actor_1');
    const otherActor = await latestGetter?.call(service, 'app:rec_1', 'actor_2');

    expect(latest?.draft?.id).toBe(generated.draft.id);
    expect(otherActor?.draft).toBeNull();
  });

  it("结构化设计包含复用来源、触发条件、证据与待确认项", async () => {
    const { service, model } = createFixture();
    await service.generateDraft("app:rec_1", { actorId: "actor_1" });
    const prompt = model.generateJson.mock.calls[1][0][1].content;
    for (const field of ["evtId", "eventDefinition", "reuseSource", "triggerCondition", "uncertainties"]) expect(prompt).toContain(field);
  });

  it('补充上下文文件只进入本次提示词，并限制文件数量和内容长度', async () => {
    const { service, model } = createFixture();
    await service.generateDraft('app:rec_1', {
      actorId: 'actor_1',
      contextFiles: [
        { name: 'context.md', content: '补充业务上下文' },
        ...Array.from({ length: 6 }, (_, index) => ({ name: `extra-${index}.txt`, content: 'x' })),
      ],
    });

    const messages = model.generateJson.mock.calls[0][0] as Array<{ role: string; content: string }>;
    const userPrompt = messages.find((message) => message.role === 'user')?.content || '';
    expect(userPrompt).toContain('context.md');
    expect(userPrompt).toContain('补充业务上下文');
    expect(userPrompt).toContain('extra-3.txt');
    expect(userPrompt).not.toContain('extra-4.txt');
  });

  it('补充上下文文件应受总字符预算限制', async () => {
    const { service, model } = createFixture();
    await service.generateDraft('app:rec_1', {
      actorId: 'actor_1',
      contextFiles: Array.from({ length: 5 }, (_, index) => ({
        name: `context-${index}.txt`,
        content: String(index).repeat(20_000),
      })),
    });

    const messages = model.generateJson.mock.calls[0][0] as Array<{ role: string; content: string }>;
    const userPrompt = messages.find((message) => message.role === 'user')?.content || '';
    const contextSection = userPrompt.split('"contextFiles":')[1]?.split('完整正式事件目录')[0] || '';
    expect(contextSection.length).toBeLessThan(26_000);
  });

  it('空白占位事件只在人工应用后写入，重复应用不应重复写入', async () => {
    const { service, tracking } = createFixture();
    const { draft } = await service.generateDraft('app:rec_1', { actorId: 'actor_1' });

    const first = await service.applyDraft('app:rec_1', draft.id, { actorId: 'actor_1' });
    const second = await service.applyDraft('app:rec_1', draft.id, { actorId: 'actor_1' });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(tracking.applyAiDraftEvents).toHaveBeenCalledTimes(1);
    expect(tracking.applyAiDraftEvents).toHaveBeenCalledWith(
      'app:rec_1',
      [expect.objectContaining({ evtId: 'home_agent_task_submit' })],
      'actor_1',
      undefined,
    );
    expect(tracking.updateRecord).not.toHaveBeenCalled();
    expect(tracking.createSiblingEvent).not.toHaveBeenCalled();
    expect(tracking.createParam).not.toHaveBeenCalled();
    await expect(service.getLatestDraft('app:rec_1', 'actor_1')).resolves.toEqual({ draft: null });
    const draftGetter = (service as unknown as {
      getDraft?: (
        recordId: string,
        draftId: string,
        actorId?: string,
        actorLarkId?: string,
      ) => Promise<{ draft: { status: string; appliedParamCount?: number } | null }>;
    }).getDraft;
    expect(draftGetter).toEqual(expect.any(Function));
    await expect(draftGetter?.call(service, 'app:rec_1', draft.id, 'actor_1')).resolves.toEqual({
      draft: expect.objectContaining({
        status: 'applied',
        appliedParamCount: 1,
      }),
    });
    await expect(draftGetter?.call(service, 'app:rec_1', draft.id, 'actor_2')).resolves.toEqual({ draft: null });
  });

  it('分析师不能读取或应用其他人的 AI 草稿', async () => {
    const { service, tracking } = createFixture();
    const { draft } = await service.generateDraft('app:rec_1', { actorId: 'actor_1' });

    await expect(service.getLatestDraft('app:rec_1', 'actor_2')).resolves.toEqual({ draft: null });
    await expect(
      service.applyDraft('app:rec_1', draft.id, { actorId: 'actor_2' }),
    ).rejects.toThrow('AI 草稿不存在或已过期');
    expect(tracking.updateRecord).not.toHaveBeenCalled();
    expect(tracking.createParam).not.toHaveBeenCalled();
  });

  it('应用前重新读取正式库，漂移或旧版草稿必须在任何写入前拦截', async () => {
    const { service, tracking, queryLibrary } = createFixture();
    const { draft } = await service.generateDraft('app:rec_1', { actorId: 'actor_1' });
    queryLibrary.getGovernanceSnapshot.mockResolvedValueOnce({ ...await queryLibrary.getGovernanceSnapshot(), fingerprint: 'changed' });
    await expect(service.applyDraft('app:rec_1', draft.id, { actorId: 'actor_1' })).rejects.toThrow('已变化');
    expect(tracking.applyAiDraftEvents).not.toHaveBeenCalled();
    draft.governance = undefined;
    await expect(service.applyDraft('app:rec_1', draft.id, { actorId: 'actor_1' })).rejects.toThrow('旧版');
    expect(tracking.applyAiDraftEvents).not.toHaveBeenCalled();
  });

  it('applies the governed result rather than an untrusted stored draft', async () => {
    const { service, queryLibrary, tracking } = createFixture();
    const { draft } = await service.generateDraft('app:rec_1', { actorId: 'actor_1' });
    const formal = { recordId: 'app:formal', source: 'app' as const, evtId: draft.events[0].evtId,
      eventName: '正式任务提交', eventDefinition: '通用任务提交', triggerTiming: '点击提交',
      platform: 'iOS、Android', version: '1.0', status: '已上线', paramLink: '' };
    const snapshot = await queryLibrary.getGovernanceSnapshot();
    snapshot.events = [formal]; snapshot.contexts = [{ event: formal, params: [] }];
    draft.governance!.decisions[0].decision = 'reuse';
    draft.events[0].params = [];
    draft.events[0].eventDefinition = '本需求 Motion 特定定义';
    await service.applyDraft('app:rec_1', draft.id, { actorId: 'actor_1' });
    expect(tracking.applyAiDraftEvents).toHaveBeenCalledWith('app:rec_1', [expect.objectContaining({
      eventDefinition: '通用任务提交', triggerTiming: '点击提交', requestNotes: expect.stringContaining('本需求 Motion 特定定义'),
    })], 'actor_1', undefined);
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

    expect(tracking.applyAiDraftEvents).toHaveBeenCalledWith(
      'app:rec_1',
      [expect.objectContaining({ evtId: 'home_agent_task_submit' })],
      'actor_1',
      undefined,
    );
    expect(tracking.updateRecord).not.toHaveBeenCalled();
    expect(tracking.createSiblingEvent).not.toHaveBeenCalled();
  });
});
