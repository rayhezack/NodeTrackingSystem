import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type {
  AiTrackingDraft,
  AiTrackingDraftEvent,
  AiTrackingDraftParam,
  ApplyAiTrackingDraftRequest,
  ApplyAiTrackingDraftResponse,
  GenerateAiTrackingDraftRequest,
  GenerateAiTrackingDraftResponse,
  OfficialEvent,
  OfficialParam,
  ParamDetail,
  TrackingDetail,
} from '@shared/api.interface';
import { QueryLibraryService } from '../query-library/query-library.service';
import { TrackingService } from '../tracking/tracking.service';
import { FeishuDocumentService } from './feishu-document.service';
import { FeishuOAuthService } from './feishu-oauth.service';
import { ModelGatewayService } from './model-gateway.service';
import { TRACKING_DESIGN_GUIDELINES } from './tracking-design-guidelines';

const modelParamSchema = z.object({
  paramName: z.string().default(''),
  paramType: z.string().default('UNKNOWN'),
  requiredRule: z.string().default('非必传'),
  triggerCondition: z.string().default(''),
  enumRange: z.string().default(''),
  definition: z.string().default(''),
  defaultValue: z.string().default(''),
  platform: z.string().default('App通用'),
  uncertainties: z.array(z.string()).default([]),
});

const modelEventSchema = z.object({
  evtId: z.string().default(''),
  eventName: z.string().default(''),
  eventDefinition: z.string().default(''),
  triggerTiming: z.string().default(''),
  metricScenario: z.string().default(''),
  priority: z.string().default('P1'),
  platform: z.string().default('iOS、Android'),
  handler: z.string().default('客户端'),
  commonProps: z.string().default(''),
  version: z.string().default('待人工确认'),
  minVersion: z.string().default('待人工确认'),
  changeType: z.string().default('新增'),
  evidence: z.array(z.string()).default([]),
  uncertainties: z.array(z.string()).default([]),
  reuseSourceEvtId: z.string().optional(),
  reuseModificationSummary: z.string().default(''),
  params: z.array(modelParamSchema).default([]),
});

const modelResponseSchema = z.object({
  summary: z.string().default(''),
  analystQuestions: z.array(z.string()).default([]),
  events: z.array(modelEventSchema).min(1),
});

@Injectable()
export class AiTrackingService {
  private readonly drafts = new Map<string, AiTrackingDraft>();
  private readonly versions = new Map<string, number>();

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
    const requirementUrl = textValue(detail.requirementFields['需求链接']);
    if (!requirementUrl) throw new BadRequestException('当前需求单没有 PRD 链接');

    const accessToken = await this.oauth.getAccessToken(actorId, actorLarkId);
    const [prd, currentParams, library] = await Promise.all([
      this.documents.fetchPrd(requirementUrl, accessToken),
      this.tracking.getParams(recordId),
      this.queryLibrary.getEvents({ source: detail.source, pageSize: 500 }),
    ]);
    const candidates = selectOfficialCandidates(detail, prd.content, library.items, 24);
    const raw = await this.model.generateJson([
      { role: 'system', content: TRACKING_DESIGN_GUIDELINES },
      {
        role: 'user',
        content: buildPrompt(detail, currentParams.items, prd, candidates),
      },
    ]);
    const parsed = modelResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BadRequestException(`AI 草稿结构校验失败：${parsed.error.issues[0]?.message || '未知错误'}`);
    }

    const events = await Promise.all(
      parsed.data.events.map((event, index) => this.normalizeEvent(event, index, candidates)),
    );
    assertUniqueEvents(events);
    const draftKey = draftOwnerKey(recordId, actorId, actorLarkId);
    const version = (this.versions.get(draftKey) || 0) + 1;
    this.versions.set(draftKey, version);
    const draft: AiTrackingDraft = {
      id: randomUUID(),
      recordId,
      requestId: detail.requestId,
      version,
      status: 'draft',
      createdAt: Date.now(),
      provider: this.model.status.provider,
      model: this.model.status.model,
      prd: {
        url: prd.url,
        title: prd.title,
        revision: prd.revision,
        truncated: prd.truncated,
      },
      summary: parsed.data.summary || `共生成 ${events.length} 个埋点事件初稿`,
      analystQuestions: uniqueStrings([
        ...parsed.data.analystQuestions,
        ...events.flatMap((event) => event.uncertainties),
      ]),
      events,
      diffs: buildDraftDiffs(detail, currentParams.items, events),
    };
    this.drafts.set(draft.id, draft);
    this.pruneDrafts();
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
    if (!draft || draft.recordId !== recordId) throw new NotFoundException('AI 草稿不存在或已过期');
    if (draft.status === 'applied') {
      return {
        success: true,
        draftId,
        appliedRecordIds: draft.appliedRecordIds || [],
        createdEventCount: draft.appliedRecordIds?.length || 0,
        createdParamCount: 0,
      };
    }
    if (draft.status === 'applying') throw new BadRequestException('该草稿正在应用，请勿重复提交');
    if (draft.status === 'failed') throw new BadRequestException('该草稿曾部分应用失败，请重新生成新版草稿后再操作');

    const selectedIds = new Set(body.selectedEventClientIds || draft.events.map((event) => event.clientId));
    const events = draft.events.filter((event) => selectedIds.has(event.clientId));
    if (!events.length) throw new BadRequestException('至少选择一个埋点事件');
    assertNoRequestDuplicates(detail, events);

    draft.status = 'applying';
    const appliedRecordIds: string[] = [];
    let createdParamCount = 0;
    try {
      const currentIsBlank = !detail.evtId.trim() &&
        !detail.relatedEvents.some((event) => event.recordId !== recordId && event.evtId.trim());
      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];
        let targetRecordId: string;
        if (index === 0 && currentIsBlank) {
          await this.tracking.updateRecord(recordId, {
            fields: toDesignFields(event),
            stageId: 'design',
            targetStage: '埋点设计',
            actorId,
            actorLarkId,
          });
          targetRecordId = recordId;
        } else {
          const created = await this.tracking.createSiblingEvent(recordId, {
            evtId: event.evtId,
            eventName: event.eventName,
            priority: event.priority,
            platform: event.platform,
            eventDefinition: event.eventDefinition,
            triggerTiming: event.triggerTiming,
            handler: event.handler,
            commonProps: event.commonProps,
            version: event.version,
            minVersion: event.minVersion,
            changeType: event.changeType,
            actorId,
            actorLarkId,
          });
          targetRecordId = created.recordId;
        }
        appliedRecordIds.push(targetRecordId);
        for (const param of event.params) {
          await this.tracking.createParam(targetRecordId, {
            evtId: event.evtId,
            paramName: param.paramName,
            paramType: param.paramType,
            required: param.requiredRule === '必传' || param.requiredRule === '条件必传',
            requiredRule: param.requiredRule,
            triggerCondition: param.triggerCondition,
            enumRange: param.enumRange,
            definition: param.definition,
            defaultValue: param.defaultValue,
            example: param.defaultValue,
            platform: param.platform,
            status: '草稿',
            version: event.version,
            changeType: event.changeType,
            actorId,
            actorLarkId,
          });
          createdParamCount += 1;
        }
      }
      draft.status = 'applied';
      draft.appliedRecordIds = appliedRecordIds;
      return {
        success: true,
        draftId,
        appliedRecordIds,
        createdEventCount: appliedRecordIds.length,
        createdParamCount,
      };
    } catch (error) {
      draft.status = 'failed';
      draft.appliedRecordIds = appliedRecordIds;
      draft.failureMessage = error instanceof Error ? error.message : '未知错误';
      throw new InternalServerErrorException(
        appliedRecordIds.length
          ? `AI 草稿部分写入失败，已写入 ${appliedRecordIds.length} 个事件；请勿重复应用，需人工检查后重新生成`
          : draft.failureMessage,
      );
    }
  }

  private async authorizedDetail(recordId: string, actorId?: string, actorLarkId?: string) {
    const result = await this.tracking.getDetail(recordId, actorId, actorLarkId);
    if (!result.data.permissions.canEditDesign) {
      throw new ForbiddenException('当前用户无埋点设计权限，不能使用 AI 生成或应用草稿');
    }
    return result.data;
  }

  private async normalizeEvent(
    input: z.infer<typeof modelEventSchema>,
    index: number,
    candidates: OfficialEvent[],
  ): Promise<AiTrackingDraftEvent> {
    const normalizedEvtId = snakeCase(input.evtId);
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
        paramName: snakeCase(param.paramName),
        paramType: normalizeParamType(param.paramType),
        requiredRule: normalizeRequiredRule(param.requiredRule),
        triggerCondition: param.triggerCondition.trim(),
        enumRange: param.enumRange.trim(),
        definition: param.definition.trim() || '待人工确认',
        defaultValue: param.defaultValue.trim(),
        platform: normalizeParamPlatform(param.platform),
        source: 'ai' as const,
        uncertainties: uniqueStrings(param.uncertainties),
      }));
    const candidate = candidates.find((item) => item.evtId === input.reuseSourceEvtId);
    let params = generatedParams;
    let reuseSource: AiTrackingDraftEvent['reuseSource'];
    if (candidate) {
      const official = await this.queryLibrary.getParams(candidate.recordId);
      params = mergeOfficialParams(official.items, generatedParams);
      reuseSource = {
        recordId: candidate.recordId,
        evtId: candidate.evtId,
        eventName: candidate.eventName,
        modificationSummary: input.reuseModificationSummary || '待人工确认复用范围',
      };
    }
    return {
      clientId: randomUUID(),
      evtId,
      eventName: input.eventName.trim() || '待人工确认',
      eventDefinition: input.eventDefinition.trim() || '待人工确认',
      triggerTiming: input.triggerTiming.trim() || '待人工确认',
      metricScenario: input.metricScenario.trim() || '待人工确认',
      priority: ['P0', 'P1', 'P2'].includes(input.priority) ? input.priority : 'P1',
      platform: input.platform.trim() || 'iOS、Android',
      handler: ['客户端', '客户端/服务端'].includes(input.handler) ? input.handler : '客户端',
      commonProps: input.commonProps.trim(),
      version: input.version.trim() || '待人工确认',
      minVersion: input.minVersion.trim() || '待人工确认',
      changeType: ['新增', '修改', '废弃', '口径调整'].includes(input.changeType) ? input.changeType : '新增',
      evidence: uniqueStrings(input.evidence),
      uncertainties,
      ...(reuseSource ? { reuseSource } : {}),
      params,
    };
  }

  private pruneDrafts() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, draft] of this.drafts.entries()) {
      if (draft.createdAt < cutoff) this.drafts.delete(id);
    }
  }
}

function buildPrompt(
  detail: TrackingDetail,
  currentParams: ParamDetail[],
  prd: { title: string; content: string; truncated: boolean },
  candidates: OfficialEvent[],
): string {
  const currentEvents = detail.relatedEvents.map((event) => ({
    evtId: event.evtId,
    eventName: event.eventName,
    design: event.detail?.designFields,
  }));
  return `
请为下面这笔 App 埋点需求生成初稿。只输出 JSON，不要 Markdown。

需求上下文：
${JSON.stringify({
  requestId: detail.requestId,
  requestName: detail.requestName,
  background: detail.requirementFields['需求背景'],
  metricScenario: detail.requirementFields['指标/使用场景'],
  platform: detail.platform,
  currentEvents,
  currentParams,
}, null, 2)}

正式事件候选（只有这些可以作为 reuseSourceEvtId；没有合适候选就留空）：
${JSON.stringify(candidates, null, 2)}

PRD 标题：${prd.title}
PRD 是否截断：${prd.truncated ? '是，必须标记信息风险' : '否'}
PRD 正文：
<prd>
${prd.content}
</prd>

返回 JSON 结构：
{
  "summary": "设计摘要",
  "analystQuestions": ["需要分析师确认的问题"],
  "events": [{
    "evtId": "snake_case",
    "eventName": "中文事件名",
    "eventDefinition": "可判定定义",
    "triggerTiming": "明确触发条件与边界",
    "metricScenario": "指标/分析用途",
    "priority": "P0|P1|P2",
    "platform": "iOS、Android",
    "handler": "客户端|客户端/服务端",
    "commonProps": "公共属性要求",
    "version": "PRD未给则待人工确认",
    "minVersion": "PRD未给则待人工确认",
    "changeType": "新增|修改|废弃|口径调整",
    "evidence": ["PRD 中支持该设计的章节或事实摘要"],
    "uncertainties": ["待确认项"],
    "reuseSourceEvtId": "正式候选 evt_id 或空",
    "reuseModificationSummary": "相对正式事件的修改内容",
    "params": [{
      "paramName": "snake_case",
      "paramType": "STRING|INTEGER|NUMBER|BOOLEAN|ARRAY|OBJECT|UNKNOWN",
      "requiredRule": "必传|非必传|条件必传",
      "triggerCondition": "条件必传时写清条件",
      "enumRange": "value // 含义；PRD未给不得补造",
      "definition": "参数定义",
      "defaultValue": "默认值或示例",
      "platform": "App通用|仅iOS|仅Android|待确认",
      "uncertainties": ["待确认项"]
    }]
  }]
}`.trim();
}

function selectOfficialCandidates(
  detail: TrackingDetail,
  prdContent: string,
  items: OfficialEvent[],
  limit: number,
): OfficialEvent[] {
  const query = `${detail.requestName || ''} ${detail.requirementFields['需求背景'] || ''} ${prdContent.slice(0, 8_000)}`.toLowerCase();
  const tokens = textTokens(query);
  return items
    .map((item) => {
      const target = `${item.evtId} ${item.eventName}`.toLowerCase();
      const score = tokens.reduce((total, token) => total + (target.includes(token) ? token.length : 0), 0);
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.item.evtId.localeCompare(right.item.evtId))
    .slice(0, limit)
    .map(({ item }) => item);
}

function textTokens(value: string): string[] {
  const ascii = value.match(/[a-z0-9_]{3,}/g) || [];
  const chineseRuns = value.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const chinese = chineseRuns.flatMap((run) =>
    Array.from({ length: Math.max(0, run.length - 1) }, (_, index) => run.slice(index, index + 2)),
  );
  return uniqueStrings([...ascii, ...chinese]).slice(0, 300);
}

function mergeOfficialParams(
  officialParams: OfficialParam[],
  generatedParams: AiTrackingDraftParam[],
): AiTrackingDraftParam[] {
  const generated = new Map(generatedParams.map((param) => [param.paramName, param]));
  const merged = officialParams.map((official) => {
    const next = generated.get(official.paramName);
    generated.delete(official.paramName);
    if (!next) {
      return {
        paramName: official.paramName,
        paramType: normalizeParamType(official.paramType),
        requiredRule: normalizeRequiredRule(official.requiredRule),
        triggerCondition: '',
        enumRange: official.enumRange || '',
        definition: official.definition || '待人工确认',
        defaultValue: official.example || '',
        platform: official.platform || 'App通用',
        source: 'official' as const,
        uncertainties: [],
      };
    }
    const changed = [
      next.paramType !== normalizeParamType(official.paramType) ? '数据类型' : '',
      next.requiredRule !== normalizeRequiredRule(official.requiredRule) ? '必传规则' : '',
      next.enumRange !== (official.enumRange || '') ? '枚举范围' : '',
      next.definition !== (official.definition || '') ? '参数定义' : '',
    ].filter(Boolean);
    return {
      ...next,
      source: changed.length ? 'official_modified' as const : 'official' as const,
      changeSummary: changed.length ? `修改：${changed.join('、')}` : '沿用正式参数',
    };
  });
  return [...merged, ...generated.values()];
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

function toDesignFields(event: AiTrackingDraftEvent): Record<string, unknown> {
  return {
    evt_id: event.evtId,
    事件中文名: event.eventName,
    优先级: event.priority,
    端: event.platform,
    事件定义: event.eventDefinition,
    触发时机: event.triggerTiming,
    处理方: event.handler,
    公共属性要求: event.commonProps,
    版本: event.version,
    最低版本: event.minVersion,
    变更类型: event.changeType,
  };
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

function snakeCase(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
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

function normalizeParamPlatform(value: string): string {
  return ['App通用', '仅App', '仅iOS', '仅Android', 'Web&App历史兼容', 'App/Web差异待拆', '待确认', '无特殊参数'].includes(value)
    ? value
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}
