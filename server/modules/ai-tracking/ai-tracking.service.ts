import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  AiTrackingDraft,
  AiTrackingContextFile,
  AiTrackingDraftEvent,
  AiTrackingDraftParam,
  ApplyAiTrackingDraftRequest,
  ApplyAiTrackingDraftResponse,
  GenerateAiTrackingDraftRequest,
  GenerateAiTrackingDraftResponse,
  GetAiTrackingDraftResponse,
  GetLatestAiTrackingDraftResponse,
  ParamDetail,
  TrackingDetail,
} from '@shared/api.interface';
import { QueryLibraryService } from '../query-library/query-library.service';
import { TrackingService } from '../tracking/tracking.service';
import { FeishuDocumentService } from './feishu-document.service';
import { FeishuOAuthService } from './feishu-oauth.service';
import { ModelGatewayService } from './model-gateway.service';
import { loadTrackingDesignSkill } from './tracking-design-guidelines';
import { assertFreshGovernance, enforceGovernance, generateReusePlan, governanceReport } from '../../../shared/official-first-workflow';
import { generateDesignBatches } from '../../../shared/ai-design-batches';

const modelParamSchema = z.object({
  paramName: z.string().default(''),
  paramType: z.string().default('UNKNOWN'),
  requiredRule: z.string().default('非必传'),
  triggerCondition: z.string().default(''),
  enumRange: z.string().default(''),
  definition: z.string().default(''),
  defaultValue: z.string().default(''),
  example: z.string().default(''),
  requestNotes: z.string().default(''),
  platform: z.string().default(''),
  uncertainties: z.array(z.string()).default([]),
});

const modelEventSchema = z.object({
  requestNotes: z.string().default(''),
  evtId: z.string().default(''),
  eventName: z.string().default(''),
  eventDefinition: z.string().default(''),
  triggerTiming: z.string().default(''),
  priority: z.string().default('P1'),
  platform: z.string().default(''),
  handler: z.string().default(''),
  commonProps: z.string().default(''),
  version: z.string().default('待人工确认'),
  minVersion: z.string().default('待人工确认'),
  changeType: z.string().default('新增'),
  metricScenario: z.string().default(''),
  evidence: z.array(z.string()).default([]),
  uncertainties: z.array(z.string()).default([]),
  reuseSource: z.object({ recordId: z.string(), evtId: z.string(), eventName: z.string(), modificationSummary: z.string() }).optional(),
  params: z.array(modelParamSchema).max(100, '单个事件最多生成 100 个参数').default([]),
});

const modelResponseSchema = z.object({
  events: z.array(modelEventSchema).min(1).max(20, '单次最多生成 20 个埋点事件'),
});

const GENERATION_HANDOFF_TIMEOUT_MS = 8_000;
const MAX_CONTEXT_FILE_CHARS = 24_000;

@Injectable()
export class AiTrackingService {
  private readonly logger = new Logger(AiTrackingService.name);
  private readonly drafts = new Map<string, AiTrackingDraft>();
  private readonly versions = new Map<string, number>();
  private readonly latestDraftIds = new Map<string, string>();
  private readonly draftOwners = new Map<string, string>();

  constructor(
    private readonly tracking: TrackingService,
    private readonly queryLibrary: QueryLibraryService,
    private readonly oauth: FeishuOAuthService,
    private readonly documents: FeishuDocumentService,
    private readonly model: ModelGatewayService,
  ) {}

  getConfigStatus() {
    const modelStatus = this.model.status;
    const missingKeys = uniqueStrings([
      ...modelStatus.missingKeys,
      ...this.oauth.missingConfigKeys,
    ]);
    return {
      ...modelStatus,
      missingKeys,
      feishuOAuthConfigured: this.oauth.configured,
      tokenStorage: 'encrypted_base' as const,
    };
  }

  getAuthStatus(actorId?: string, actorLarkId?: string) {
    return this.oauth.getStatus(actorId, actorLarkId);
  }

  startAuth(input: { recordId: string; actorId?: string; actorLarkId?: string }) {
    return this.oauth.startAuthorization(input);
  }

  async generateDraft(
    recordId: string,
    body: GenerateAiTrackingDraftRequest,
    authenticatedActor?: string,
  ): Promise<GenerateAiTrackingDraftResponse> {
    const actorLarkId = authenticatedActor || body.actorLarkId;
    const actorId = authenticatedActor ? undefined : body.actorId;
    const detail = await this.authorizedDetail(recordId, actorId, actorLarkId);
    const requirementUrl = extractRequirementUrl(detail.requirementFields['需求链接']);
    if (!requirementUrl) {
      throw new BadRequestException('请先提供 PRD 文档链接，再生成 AI 埋点初稿');
    }

    const accessToken = await this.oauth.getAccessToken(actorId, actorLarkId);
    const contextFiles = normalizeContextFiles(body.contextFiles);
    const draftKey = draftOwnerKey(recordId, actorId, actorLarkId);
    const currentDraftId = this.latestDraftIds.get(draftKey);
    const currentDraft = currentDraftId ? this.drafts.get(currentDraftId) : undefined;
    if (currentDraft?.status === 'generating') {
      return { draft: currentDraft };
    }

    const version = (this.versions.get(draftKey) || 0) + 1;
    this.versions.set(draftKey, version);
    const draft: AiTrackingDraft = {
      id: randomUUID(),
      recordId,
      requestId: detail.requestId,
      version,
      status: 'generating',
      createdAt: Date.now(),
      provider: this.model.status.provider,
      model: this.model.status.model,
      prd: {
        url: requirementUrl,
        title: '正在读取 PRD',
        truncated: false,
      },
      summary: '正在读取 PRD、正式查询库并生成埋点初稿',
      analystQuestions: [],
      events: [],
      diffs: [],
    };
    this.drafts.set(draft.id, draft);
    this.draftOwners.set(draft.id, draftKey);
    this.latestDraftIds.set(draftKey, draft.id);
    this.pruneDrafts();

    // 妙搭网关约 30 秒会切断同步请求；模型和文档链路可能更久，交给后台任务继续执行。
    const generation = this.populateDraft(draft, detail, requirementUrl, accessToken, contextFiles);
    void generation.catch(() => undefined);
    let handoffTimer: ReturnType<typeof setTimeout> | undefined;
    const handoffTimeout = new Promise<void>((resolve) => {
      handoffTimer = setTimeout(resolve, GENERATION_HANDOFF_TIMEOUT_MS);
    });
    try {
      await Promise.race([generation, handoffTimeout]);
    } finally {
      if (handoffTimer) clearTimeout(handoffTimer);
    }
    return { draft };
  }

  private async populateDraft(
    draft: AiTrackingDraft,
    detail: TrackingDetail,
    requirementUrl: string,
    accessToken: string,
    contextFiles: AiTrackingContextFile[],
  ): Promise<void> {
    try {
      const generationStartedAt = Date.now();
      const prd = await this.documents.fetchPrd(requirementUrl, accessToken);
      draft.prd = {
        url: prd.url,
        title: prd.title,
        revision: prd.revision,
        truncated: prd.truncated,
      };
      draft.summary = '正在读取正式埋点查询和正式参数查询';
      this.logger.log(JSON.stringify({
        message: 'AI tracking draft PRD loaded',
        recordId: detail.recordId,
        draftId: draft.id,
        durationMs: Date.now() - generationStartedAt,
        prdChars: prd.content.length,
      }));

      const [currentParams, snapshot] = await Promise.all([
        this.tracking.getParams(detail.recordId), this.queryLibrary.getGovernanceSnapshot(detail.source),
      ]);
      const requirement = { source: detail.source, requestName: detail.requestName, requirementFields: detail.requirementFields,
        currentEvents: detail.relatedEvents, currentParams: currentParams.items, prd, contextFiles };
      draft.summary = "正在对照完整正式库判断复用";
      const plan = await generateReusePlan(snapshot, requirement, (prompt) => this.model.generateJson([
        { role: "system", content: loadTrackingDesignSkill('planning') },
        { role: "user", content: prompt },
      ]));
      draft.summary = "正在读取完整参数、公共属性及枚举生成设计";
      const raw = await generateDesignBatches(snapshot, plan, requirement, (prompt) => this.model.generateJson([
        { role: "system", content: loadTrackingDesignSkill('design') },
        { role: "user", content: prompt },
      ]), undefined, (value, batchPlan) => {
        const batch = modelResponseSchema.safeParse(value);
        if (!batch.success) throw new BadRequestException("AI 草稿结构校验失败：" + batch.error.issues[0]?.message);
        enforceGovernance(batch.data.events.map((event, index) => this.normalizeEvent(event, index, detail.source, detail.platform)), snapshot, batchPlan);
      });
      const parsed = modelResponseSchema.safeParse(raw);
      if (!parsed.success) throw new BadRequestException("AI 草稿结构校验失败：" + parsed.error.issues[0]?.message);
      if (parsed.data.events.reduce((sum, event) => sum + event.params.length, 0) > 400) throw new BadRequestException("单次最多400个参数，不能截断");
      const events = enforceGovernance(parsed.data.events.map((event, index) => this.normalizeEvent(event, index, detail.source, detail.platform)), snapshot, plan);
      draft.governance = governanceReport(snapshot, plan, events);
      draft.summary = "正式库校验完成：复用 " + events.filter(event => event.reuseSource).length + " 个，新增建议 " + events.filter(event => !event.reuseSource).length + " 个";
      draft.analystQuestions = uniqueStrings([...(prd.truncated ? ["PRD已截断，指标覆盖需核对原文"] : []), ...events.flatMap(event => [...event.uncertainties, ...event.params.flatMap(param => param.uncertainties)])]);
      draft.events = events;
      draft.diffs = buildDraftDiffs(detail, currentParams.items, events);
      draft.status = 'draft';
    } catch (error) {
      draft.status = 'failed';
      draft.summary = 'AI 埋点初稿生成失败';
      draft.failureMessage = error instanceof Error ? error.message : 'AI 埋点初稿生成失败，请稍后重试';
      this.logger.error(JSON.stringify({
        message: 'AI tracking draft generation failed',
        recordId: detail.recordId,
        draftId: draft.id,
        failureMessage: draft.failureMessage,
      }));
      throw error;
    }
  }

  async getLatestDraft(
    recordId: string,
    actorId?: string,
    actorLarkId?: string,
    authenticatedActor?: string,
  ): Promise<GetLatestAiTrackingDraftResponse> {
    const resolvedActorLarkId = authenticatedActor || actorLarkId;
    const resolvedActorId = authenticatedActor ? undefined : actorId;
    await this.authorizedDetail(recordId, resolvedActorId, resolvedActorLarkId);
    this.pruneDrafts();
    const ownerKey = draftOwnerKey(recordId, resolvedActorId, resolvedActorLarkId);
    const draftId = this.latestDraftIds.get(ownerKey);
    const draft = draftId ? this.drafts.get(draftId) : undefined;
    return { draft: draft?.status === 'applied' ? null : draft || null };
  }

  async getDraft(
    recordId: string,
    draftId: string,
    actorId?: string,
    actorLarkId?: string,
    authenticatedActor?: string,
  ): Promise<GetAiTrackingDraftResponse> {
    const resolvedActorLarkId = authenticatedActor || actorLarkId;
    const resolvedActorId = authenticatedActor ? undefined : actorId;
    await this.authorizedDetail(recordId, resolvedActorId, resolvedActorLarkId);
    this.pruneDrafts();
    const ownerKey = draftOwnerKey(recordId, resolvedActorId, resolvedActorLarkId);
    const draft = this.drafts.get(draftId);
    if (
      !draft ||
      draft.recordId !== recordId ||
      this.draftOwners.get(draftId) !== ownerKey
    ) {
      return { draft: null };
    }
    return { draft };
  }

  async applyDraft(
    recordId: string,
    draftId: string,
    body: ApplyAiTrackingDraftRequest,
    authenticatedActor?: string,
  ): Promise<ApplyAiTrackingDraftResponse> {
    const actorLarkId = authenticatedActor || body.actorLarkId;
    const actorId = authenticatedActor ? undefined : body.actorId;
    const detail = await this.authorizedDetail(recordId, actorId, actorLarkId);
    const draft = this.drafts.get(draftId);
    const ownerKey = draftOwnerKey(recordId, actorId, actorLarkId);
    if (
      !draft ||
      draft.recordId !== recordId ||
      this.draftOwners.get(draftId) !== ownerKey
    ) {
      throw new NotFoundException('AI 草稿不存在或已过期');
    }
    if (draft.status === 'applied') {
      return {
        success: true,
        draftId,
        appliedRecordIds: draft.appliedRecordIds || [],
        createdEventCount: draft.appliedRecordIds?.length || 0,
        createdParamCount: draft.appliedParamCount || 0,
      };
    }
    if (draft.status === 'generating') throw new BadRequestException('AI 草稿仍在生成，请稍候');
    if (draft.status === 'applying') throw new BadRequestException('该草稿正在应用，请勿重复提交');
    if (draft.status === 'failed') throw new BadRequestException('该草稿曾部分应用失败，请重新生成新版草稿后再操作');

    const selectedIds = new Set(body.selectedEventClientIds || draft.events.map((event) => event.clientId));
    let events = draft.events.filter((event) => selectedIds.has(event.clientId));
    if (!events.length) throw new BadRequestException('至少选择一个埋点事件');
    assertNoRequestDuplicates(detail, events);
    const snapshot = await this.queryLibrary.getGovernanceSnapshot(detail.source);
    try {
      const plan = assertFreshGovernance(draft.governance, snapshot);
      events = enforceGovernance(events, snapshot, { ...plan, decisions: plan.decisions.filter(item => events.some(event => event.evtId === item.evtId)) });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '正式库校验失败');
    }

    draft.status = 'applying';
    try {
      const result = await this.tracking.applyAiDraftEvents(recordId, events, actorId, actorLarkId);
      draft.status = 'applied';
      draft.appliedRecordIds = result.appliedRecordIds;
      draft.appliedParamCount = result.createdParamCount;
      if (this.latestDraftIds.get(ownerKey) === draftId) {
        this.latestDraftIds.delete(ownerKey);
      }
      return {
        success: true,
        draftId,
        ...result,
      };
    } catch (error) {
      draft.status = 'failed';
      draft.failureMessage = error instanceof Error ? error.message : '未知错误';
      throw new InternalServerErrorException(draft.failureMessage);
    }
  }

  private async authorizedDetail(recordId: string, actorId?: string, actorLarkId?: string) {
    const result = await this.tracking.getDetail(recordId, actorId, actorLarkId);
    if (!result.data.permissions.canEditDesign) {
      throw new ForbiddenException('当前用户无埋点设计权限，不能使用 AI 生成或应用草稿');
    }
    return result.data;
  }

  private normalizeEvent(
    input: z.infer<typeof modelEventSchema>,
    index: number,
    source: TrackingDetail['source'],
    requestPlatform: string,
  ): AiTrackingDraftEvent {
    const normalizedEvtId = input.evtId.trim();
    const evtId = normalizedEvtId || `pending_event_${index + 1}`;
    const uncertainties = uniqueStrings([
      ...input.uncertainties,
      ...(!normalizedEvtId ? ['evt_id 待人工确认'] : []),
      ...(!input.eventName.trim() ? ['事件中文名待人工确认'] : []),
      ...(!input.eventDefinition.trim() ? ['事件定义待人工确认'] : []),
      ...(!input.triggerTiming.trim() ? ['触发时机待人工确认'] : []),
      ...(!input.version.trim() || input.version.includes('待人工确认') ? ['版本号待人工确认'] : []),
    ]);
    const generatedParams: AiTrackingDraftParam[] = input.params
      .filter((param) => param.paramName.trim())
      .map((param) => ({
        paramName: param.paramName.trim(),
        paramType: normalizeParamType(param.paramType),
        requiredRule: normalizeRequiredRule(param.requiredRule),
        triggerCondition: param.triggerCondition.trim(),
        enumRange: param.enumRange.trim(),
        definition: param.definition.trim() || '待人工确认',
        defaultValue: param.defaultValue.trim(),
        example: param.example.trim(),
        requestNotes: param.requestNotes.trim(),
        platform: normalizeParamPlatform(param.platform, source),
        source: 'ai' as const,
        uncertainties: param.uncertainties,
      }));
    return {
      clientId: randomUUID(),
      evtId,
      eventName: input.eventName.trim() || '待人工确认',
      eventDefinition: input.eventDefinition.trim() || '待人工确认',
      triggerTiming: input.triggerTiming.trim() || '待人工确认',
      metricScenario: input.metricScenario,
      requestNotes: input.requestNotes,
      priority: ['P0', 'P1', 'P2'].includes(input.priority) ? input.priority : 'P1',
      platform: normalizeEventPlatform(input.platform, source, requestPlatform),
      handler: normalizeEventHandler(input.handler, source),
      commonProps: input.commonProps.trim(),
      version: input.version.trim() || '待人工确认',
      minVersion: input.minVersion.trim() || '待人工确认',
      changeType: ['新增', '修改', '废弃', '口径调整'].includes(input.changeType) ? input.changeType : '新增',
      evidence: input.evidence,
      reuseSource: input.reuseSource ? { recordId: input.reuseSource.recordId || '', evtId: input.reuseSource.evtId || '', eventName: input.reuseSource.eventName || '', modificationSummary: input.reuseSource.modificationSummary || '' } : undefined,
      uncertainties,
      params: generatedParams,
    };
  }

  private pruneDrafts() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, draft] of this.drafts.entries()) {
      if (draft.createdAt >= cutoff) continue;
      this.drafts.delete(id);
      const ownerKey = this.draftOwners.get(id);
      this.draftOwners.delete(id);
      if (ownerKey && this.latestDraftIds.get(ownerKey) === id) {
        this.latestDraftIds.delete(ownerKey);
      }
    }
  }
}


function normalizeContextFiles(files?: AiTrackingContextFile[]): AiTrackingContextFile[] {
  if (!Array.isArray(files)) return [];
  const normalized = files
    .filter((file): file is AiTrackingContextFile => Boolean(
      file && typeof file.name === 'string' && typeof file.content === 'string',
    ))
    .slice(0, 5)
    .map((file) => ({
      name: file.name.trim().slice(0, 160) || '未命名文件',
      content: file.content.trim().slice(0, 8_000),
    }))
    .filter((file) => file.content.length > 0);
  let remaining = MAX_CONTEXT_FILE_CHARS;
  return normalized.flatMap((file) => {
    if (remaining <= 0) return [];
    const content = file.content.slice(0, remaining);
    remaining -= content.length;
    return [{ ...file, content }];
  });
}


function buildDraftDiffs(
  detail: TrackingDetail,
  currentParams: ParamDetail[],
  events: AiTrackingDraftEvent[],
) {
  const current = {
    evtId: detail.evtId,
    eventName: detail.eventName,
    eventDefinition: textValue(detail.designFields['事件定义']),
    triggerTiming: textValue(detail.designFields['触发时机']),
    platform: detail.platform,
    handler: textValue(detail.designFields['处理方']),
    commonProps: textValue(detail.designFields['公共属性要求']),
    version: textValue(detail.designFields['版本']),
    minVersion: textValue(detail.designFields['最低版本']),
    changeType: textValue(detail.designFields['变更类型']),
  };
  return events.map((event, index) => {
    const changedFields = index === 0
      ? Object.keys(current).filter((key) => textValue(current[key as keyof typeof current]) !== textValue(event[key as keyof AiTrackingDraftEvent]))
      : Object.keys(current);
    const currentByName = new Map(currentParams.map((param) => [param.paramName, param]));
    return {
      scope: index === 0 && !detail.evtId ? 'current_event' as const : 'new_event' as const,
      eventClientId: event.clientId,
      changedFields,
      addedParamNames: event.params.filter((param) => !currentByName.has(param.paramName)).map((param) => param.paramName),
      changedParamNames: event.params.filter((param) => {
        const existing = currentByName.get(param.paramName);
        return existing && (existing.paramType !== param.paramType || existing.requiredRule !== param.requiredRule || existing.definition !== param.definition || existing.enumRange !== param.enumRange);
      }).map((param) => param.paramName),
    };
  });
}

function assertUniqueEvents(events: AiTrackingDraftEvent[]) {
  const ids = events.map((event) => event.evtId.toLowerCase());
  if (new Set(ids).size !== ids.length) throw new BadRequestException('AI 草稿内存在重复 evt_id，请重新生成');
}

function assertNoRequestDuplicates(detail: TrackingDetail, events: AiTrackingDraftEvent[]) {
  const existing = new Set(detail.relatedEvents.map((event) => event.evtId.trim().toLowerCase()).filter(Boolean));
  for (const event of events) {
    if (existing.has(event.evtId.toLowerCase())) {
      throw new BadRequestException(`当前需求内已存在 evt_id：${event.evtId}`);
    }
  }
}

function draftOwnerKey(recordId: string, actorId?: string, actorLarkId?: string): string {
  return `${actorLarkId || actorId || 'anonymous'}:${recordId}`;
}


function normalizeParamType(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'BOOL') return 'BOOLEAN';
  return ['STRING', 'INTEGER', 'NUMBER', 'BOOLEAN', 'ARRAY', 'OBJECT', 'UNKNOWN'].includes(normalized)
    ? normalized
    : 'UNKNOWN';
}

function normalizeRequiredRule(value: string): string {
  return ['必传', '非必传', '条件必传'].includes(value) ? value : '非必传';
}

function normalizeEventPlatform(value: string, source: TrackingDetail['source'], requestPlatform: string): string {
  if (source === 'web') return 'Web';
  const normalized = value.trim();
  return ['iOS', 'Android', 'iOS、Android'].includes(normalized)
    ? normalized
    : (['iOS', 'Android', 'iOS、Android'].includes(requestPlatform) ? requestPlatform : 'iOS、Android');
}

function normalizeEventHandler(value: string, source: TrackingDetail['source']): string {
  const normalized = value.trim();
  if (source === 'web') {
    const aliases: Record<string, string> = {
      客户端: '前端',
      '客户端/服务端': '前端/服务端',
    };
    const handler = aliases[normalized] || normalized;
    return ['前端', '服务端', '前端/服务端'].includes(handler) ? handler : '前端';
  }
  return ['客户端', '客户端/服务端'].includes(normalized) ? normalized : '客户端';
}

function normalizeParamPlatform(value: string, source: TrackingDetail['source']): string {
  const normalized = value.trim();
  if (source === 'web') {
    const aliases: Record<string, string> = {
      App通用: 'Web通用',
      'App/Web差异待拆': 'Web/App差异待拆',
    };
    const platform = aliases[normalized] || normalized;
    return ['Web通用', 'Web&App历史兼容', 'Web/App差异待拆', '待确认', '无特殊参数'].includes(platform)
      ? platform
      : '待确认';
  }
  return ['App通用', '仅App', '仅iOS', '仅Android', 'Web&App历史兼容', 'App/Web差异待拆', '待确认', '无特殊参数'].includes(normalized)
    ? normalized
    : '待确认';
}

function textValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join('、');
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return textValue(objectValue.text || objectValue.name || objectValue.link || objectValue.url || objectValue.id);
  }
  return '';
}

function extractRequirementUrl(value: unknown): string {
  const raw = textValue(value).trim();
  const markdownUrl = raw.match(/\]\((https?:\/\/[^)\s]+)\)/)?.[1];
  return markdownUrl || raw.match(/https?:\/\/[^\s)\]]+/)?.[0] || '';
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}
