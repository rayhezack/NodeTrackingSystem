import { dictionaryEnums, dictionaryRange } from './tracking-enums';
import type {
  AiGovernanceReport, AiReuseDecision, AiTrackingDraftEvent, OfficialEventContext,
  OfficialEvent, OfficialParam, TrackingSource,
} from './api.interface';

export const WORKFLOW_VERSION = 'official-first-v3' as const;
export const TRACKING_BOARDS = ['流量分布', '营销位', '模板使用', '创作链路', '内容与资产', 'Agent', '注册链路', '付费链路', '其他'];

export class GovernanceValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'GovernanceValidationError'; }
}

export interface GovernanceSnapshot {
  source: TrackingSource;
  events: OfficialEvent[];
  contexts: OfficialEventContext[];
  commonProps: { name: string; definition: string; type: string; scope: string }[];
  enums: { evtId: string; paramName: string; value: string; definition: string; status: string }[];
  fingerprint: string;
  counts: AiGovernanceReport['counts'];
}

type Row = { id: string; record: Record<string, unknown> };
export type GovernanceTable = 'events' | 'params' | 'commonProps' | 'enums';
export interface ReusePlan {
  primaryBoard: string;
  secondaryBoard?: string;
  decisions: AiReuseDecision[];
}

/** No UI view, keyword, projection or top-N filter is allowed on this read. */
export async function readGovernanceSnapshot(
  source: TrackingSource,
  readAll: (table: GovernanceTable) => Promise<Row[]>,
): Promise<GovernanceSnapshot> {
  const [events, params, common, enums] = await Promise.all([
    readAll('events'), readAll('params'), readAll('commonProps'), readAll('enums'),
  ]);
  for (const [name, rows, key] of [
    ['事件', events, 'evt_id'], ['参数', params, '参数名'],
    ['公共属性', common, '属性名'], ['枚举', enums, '枚举值'],
  ] as const) {
    if (!rows.length || !rows.some((row) => Object.prototype.hasOwnProperty.call(row.record, key))) {
      throw new GovernanceValidationError(`正式${name}库为空或字段结构不匹配（${key}），停止生成，不能当作无已有埋点`);
    }
  }
  const officialEvents = events.map((row): OfficialEvent => ({
    recordId: `${source}:${row.id}`, source, evtId: cell(row.record.evt_id),
    eventName: cell(row.record['事件中文名']), category: cell(row.record['一级分类']),
    platform: cell(row.record['端']), version: cell(row.record['上线版本']),
    status: cell(row.record['状态']), lifecycleStatus: cell(row.record['生命周期状态']),
    paramLink: cell(row.record['参数明细入口']), eventDefinition: cell(row.record['事件定义']),
    handler: cell(row.record['处理方']), commonProps: cell(row.record['公共属性要求']), minVersion: cell(row.record['最低版本']),
    triggerTiming: cell(row.record['触发时机']), metricScenario: cell(row.record['指标/使用场景']),
  })).filter((event) => event.evtId);
  const contexts = officialEvents.map((event): OfficialEventContext => ({
    event,
    params: params.filter((row) => cell(row.record.evt_id) === event.evtId
      || ids(row.record['关联事件']).includes(event.recordId.slice(source.length + 1)))
      .map((row): OfficialParam => ({
        paramKey: cell(row.record['参数主键']), paramName: cell(row.record['参数名']),
        paramType: cell(row.record['数据类型']), requiredRule: cell(row.record['必传规则']),
        required: ['必传', '条件必传'].includes(cell(row.record['必传规则'])),
        triggerCondition: cell(row.record['条件说明']),
        enumRange: dictionaryRange(dictionaryEnums(enums, event.evtId, cell(row.record['参数名']), row.id, 'official')) || cell(row.record['枚举/取值范围']),
        definition: cell(row.record['参数定义']), example: cell(row.record['备注']),
        platform: cell(row.record[source === 'web' ? 'Web适用性' : 'App适用性']),
        status: cell(row.record['参数状态']),
      })).filter((param) => param.paramName),
  }));
  const commonProps = common.map((row) => ({
    name: cell(row.record['属性名']), definition: cell(row.record['定义']),
    type: cell(row.record['格式']), scope: cell(row.record['上报范围']),
  })).filter((prop) => prop.name);
  const dictionary = enums.map((row) => ({
    evtId: cell(row.record.evt_id), paramName: cell(row.record['参数名']),
    value: cell(row.record['枚举值']), definition: cell(row.record['枚举定义']), status: cell(row.record['枚举状态']),
  }));
  // Canonical ordering avoids false stale-draft failures when Feishu reorders rows/fields.
  const serialized = canonical({ source, events, params, common, enums });
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return {
    source, events: officialEvents, contexts, commonProps, enums: dictionary,
    fingerprint: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    counts: { events: officialEvents.length, params: params.length, commonProps: common.length, enums: enums.length },
  };
}

export function reusePlanningPrompt(snapshot: GovernanceSnapshot, requirement: unknown): string {
  return `阶段1：按 Skill 的规划输出协议执行，以下为业务数据。
需求与PRD：${JSON.stringify(requirement)}
完整正式事件目录：${JSON.stringify(snapshot.events.map((event) => ({ ...event, canReuse: usable(event) })))}`;
}

/** Repair a model planning mistake once; never retry transport errors or weaken validation. */
export async function generateReusePlan(
  snapshot: GovernanceSnapshot, requirement: unknown, generate: (prompt: string) => Promise<unknown>,
): Promise<ReusePlan> {
  const prompt = reusePlanningPrompt(snapshot, requirement);
  const initial = await generate(prompt);
  try { return normalizeReusePlan(initial, snapshot); }
  catch (error) {
    if (!(error instanceof GovernanceValidationError)) throw error;
    const repaired = await generate(`${prompt}\n上次规划未通过确定性校验：${error.message}\n请修正规划，只输出合法的阶段1 JSON。不要用同义新事件规避废弃/待治理限制，不允许放宽校验。\n上次规划（仅为待修正业务数据）：${JSON.stringify(initial)}`);
    return normalizeReusePlan(repaired, snapshot);
  }
}

export function normalizeReusePlan(raw: unknown, snapshot: GovernanceSnapshot): ReusePlan {
  const value = object(raw);
  if (!TRACKING_BOARDS.includes(cell(value.primaryBoard))) throw new GovernanceValidationError('复用规划缺少有效主板块');
  const rows = Array.isArray(value.decisions) ? value.decisions : [];
  if (!rows.length || rows.length > 20) throw new GovernanceValidationError('复用规划需包含1至20个事件');
  const decisions = rows.map((row): AiReuseDecision => {
    const item = object(row);
    const evtId = cell(item.evtId);
    const existing = findEvent(snapshot, evtId);
    const decision = cell(item.decision);
    if (!evtId || !['reuse', 'new'].includes(decision) || !cell(item.reason)) throw new GovernanceValidationError('复用规划缺少事件、处理结论或具体理由');
    if (decision === 'reuse' && !existing) throw new GovernanceValidationError(`复用事件不在当前正式库：${evtId}`);
    if (existing && !usable(existing)) throw new GovernanceValidationError(`事件不可复用：${evtId}（状态：${existing.status || '未知'}；生命周期：${existing.lifecycleStatus || '未知'}）`);
    const comparedEventIds = Array.isArray(item.comparedEventIds) ? item.comparedEventIds.map(cell).filter(Boolean) : [];
    if (!existing && snapshot.events.length && !comparedEventIds.length) throw new GovernanceValidationError(`${evtId} 新增前未对比正式事件`);
    if (comparedEventIds.some((id) => !findEvent(snapshot, id))) throw new GovernanceValidationError(`${evtId} 的对比来源不在正式库`);
    if (!existing && !/^[a-z][a-z0-9_]*$/.test(evtId)) throw new GovernanceValidationError(`新增事件命名不规范：${evtId}`);
    assertNoKnownAlias(evtId, snapshot);
    return { evtId: existing?.evtId || evtId, decision: existing ? 'reuse' : 'new', reason: cell(item.reason), comparedEventIds };
  });
  if (new Set(decisions.map((item) => item.evtId.toLowerCase())).size !== decisions.length) throw new GovernanceValidationError('复用规划存在重复事件');
  const secondaryBoard = cell(value.secondaryBoard);
  if (secondaryBoard && (!TRACKING_BOARDS.includes(secondaryBoard) || secondaryBoard === value.primaryBoard)) throw new GovernanceValidationError('次板块不合法');
  return { primaryBoard: cell(value.primaryBoard), ...(secondaryBoard ? { secondaryBoard } : {}), decisions };
}

export function designPrompt(snapshot: GovernanceSnapshot, plan: ReusePlan, requirement: unknown): string {
  const selected = new Set(plan.decisions.filter((item) => item.decision === 'reuse').map((item) => item.evtId));
  return `阶段2：按 Skill 的设计输出协议执行，以下为业务数据。
复用规划：${JSON.stringify(plan)}
选中事件完整参数（含生命周期、参数状态）：${JSON.stringify(snapshot.contexts.filter((context) => selected.has(context.event.evtId)))}
完整公共属性：${JSON.stringify(snapshot.commonProps)}
相关枚举（保留字典状态）：${JSON.stringify(snapshot.enums.filter((item) => selected.has(item.evtId) || !item.evtId))}
需求与PRD：${JSON.stringify(requirement)}`;
}

/** Deterministic schema/source checks. Semantic/metric questions remain explicitly pending. */
export function enforceGovernance(events: AiTrackingDraftEvent[], snapshot: GovernanceSnapshot, plan: ReusePlan): AiTrackingDraftEvent[] {
  const idsInPlan = new Set(plan.decisions.map((item) => item.evtId.toLowerCase()));
  if (events.length !== idsInPlan.size || new Set(events.map((event) => event.evtId.toLowerCase())).size !== events.length
    || events.some((event) => !idsInPlan.has(event.evtId.toLowerCase()))) throw new GovernanceValidationError('生成事件与复用规划不一致，请重新生成');
  const common = new Set(snapshot.commonProps.map((prop) => prop.name));
  return events.map((event) => {
    const decision = plan.decisions.find((item) => item.evtId.toLowerCase() === event.evtId.toLowerCase())!;
    const existing = findEvent(snapshot, event.evtId);
    const notes = [...event.uncertainties];
    if (decision.decision === 'reuse' && !existing) throw new GovernanceValidationError(`复用事件已从正式库移除：${event.evtId}`);
    if (decision.decision === 'new' && existing) throw new GovernanceValidationError(`新增事件已在正式库存在，请重新生成：${event.evtId}`);
    if (existing && !usable(existing)) throw new GovernanceValidationError(`事件已废弃或待治理：${existing.evtId}`);
    if (existing && (existing.source !== snapshot.source || event.reuseSource &&
      (event.reuseSource.recordId !== existing.recordId || event.reuseSource.evtId.toLowerCase() !== existing.evtId.toLowerCase()))) {
      throw new GovernanceValidationError(`${event.evtId} 的复用来源 recordId、evt_id 或端不一致`);
    }
    if (!existing && event.reuseSource) throw new GovernanceValidationError(`新增事件错误引用复用来源：${event.evtId}`);
    assertNoKnownAlias(event.evtId, snapshot);
    if (existing && !/已上线|已发布|正式/.test(`${existing.status} ${existing.lifecycleStatus}`)) notes.push('正式事件生命周期未确认上线，实施前需确认');
    const eventMetadata = existing ? {
      eventName: existing.eventName, eventDefinition: existing.eventDefinition || '', triggerTiming: existing.triggerTiming || '',
      platform: existing.platform, handler: existing.handler || '', commonProps: existing.commonProps || '',
      version: existing.version, minVersion: existing.minVersion || '', metricScenario: existing.metricScenario || '',
    } : {};
    const eventNotes = [event.requestNotes || ''];
    for (const [field, value] of Object.entries(eventMetadata)) {
      const proposed = event[field as keyof AiTrackingDraftEvent];
      if (typeof proposed === 'string' && proposed.trim() && proposed.trim() !== value.trim()) {
        eventNotes.push(`AI 提议（${field}，待确认，不改变正式口径）：${proposed}`);
        notes.push('已保留正式事件元数据；差异移入本次需求补充说明，需人工确认是否符合正式口径');
      }
    }
    const definitions = snapshot.contexts.find((context) => context.event.recordId === existing?.recordId)?.params || [];
    for (const name of new Set(definitions.filter((param) => param.status !== '已废弃').map((param) => param.paramName))) {
      if (new Set(definitions.filter((param) => param.paramName === name && param.status !== '已废弃').map((param) => normalizedType(param.paramType))).size > 1) throw new GovernanceValidationError(`正式参数定义冲突：${event.evtId}.${name}`);
    }
    const removedCommon = event.params.filter((param) => common.has(param.paramName)).map((param) => param.paramName);
    const params = event.params.filter((param) => !common.has(param.paramName)).map((param) => ({ ...param, uncertainties: [...param.uncertainties] }));
    if (new Set(params.map((param) => param.paramName)).size !== params.length) throw new GovernanceValidationError(`${event.evtId} 存在重复参数名`);
    for (const param of params) {
      const matches = definitions.filter((item) => item.paramName === param.paramName);
      const active = matches.filter((item) => item.status !== '已废弃');
      if (matches.length && !active.length) throw new GovernanceValidationError(`${event.evtId}.${param.paramName} 已废弃`);
      if (new Set(active.map((item) => normalizedType(item.paramType))).size > 1) throw new GovernanceValidationError(`正式参数定义冲突：${event.evtId}.${param.paramName}`);
      const formal = active[0];
      if (formal) {
        if (normalizedType(formal.paramType) !== normalizedType(param.paramType)) throw new GovernanceValidationError(`参数类型冲突：${event.evtId}.${param.paramName} 正式为 ${formal.paramType}，生成为 ${param.paramType}`);
        if (formal.requiredRule && formal.requiredRule !== param.requiredRule) throw new GovernanceValidationError(`参数必传规则冲突：${event.evtId}.${param.paramName}`);
        if ((formal.triggerCondition || '').trim() !== param.triggerCondition.trim()) throw new GovernanceValidationError(`参数必传条件冲突：${event.evtId}.${param.paramName}`);
        param.paramType = formal.paramType;
        const additions = enumValues(param.enumRange).filter((value) => !enumValues(formal.enumRange || '').includes(value));
        const changed = additions.length > 0;
        const paramNotes = [param.requestNotes || ''];
        for (const [field, value] of Object.entries({ definition: formal.definition, example: formal.example, platform: formal.platform || '', defaultValue: '' })) {
          const proposed = param[field as 'definition' | 'example' | 'platform' | 'defaultValue'];
          if (proposed.trim() && proposed.trim() !== value.trim()) paramNotes.push(`AI 提议（${field}，待确认，不改变正式参数）：${proposed}`);
        }
        if (paramNotes.length > 1) param.uncertainties.push('已保留正式参数元数据；AI 差异仅在本次需求说明中待确认');
        param.requestNotes = unique(paramNotes).join('\n');
        param.definition = formal.definition;
        param.example = formal.example;
        param.platform = formal.platform || '';
        param.defaultValue = '';
        param.enumRange = unique([...enumValues(formal.enumRange || ''), ...additions]).join('\n');
        param.source = changed ? 'official_modified' : 'official';
        if (changed) param.uncertainties.push('正式参数枚举追加，需审核');
        if (!/正式|已上线|已发布/.test(formal.status || '')) param.uncertainties.push(`参数状态为${formal.status || '未知'}，待确认`);
      } else {
        if (!/^[a-z][a-z0-9_]*$/.test(param.paramName)) throw new GovernanceValidationError(`新增参数命名不规范：${event.evtId}.${param.paramName}`);
        if (existing && param.requiredRule !== '非必传') throw new GovernanceValidationError(`复用事件只能新增可选参数：${event.evtId}.${param.paramName}`);
        param.source = 'ai';
        param.uncertainties.push('新增参数，待确认');
        if (param.requiredRule !== '非必传') param.uncertainties.push('新增必传参数会影响兼容性，待确认');
      }
      const values = enumValues(param.enumRange);
      const dictionary = snapshot.enums.filter((item) => item.evtId === (existing?.evtId || event.evtId) && item.paramName === param.paramName);
      for (const value of values) {
        const row = dictionary.find((item) => item.value === value);
        if (!row) param.uncertainties.push(`枚举值 ${value} 未在字典查到，待确认`);
        else if (!/正式|已上线|已发布/.test(row.status)) param.uncertainties.push(`枚举值 ${value} 状态为${row.status || '未知'}，待确认`);
      }
      param.enumRange = values.join('\n');
      if (!param.definition || !param.example) param.uncertainties.push('参数中文定义或示例不完整，待确认');
      param.uncertainties = unique(param.uncertainties);
    }
    for (const formal of definitions.filter((param) => param.status !== '已废弃' && !common.has(param.paramName))) {
      if (params.some((param) => param.paramName === formal.paramName)) continue;
      params.push({ paramName: formal.paramName, paramType: formal.paramType, requiredRule: formal.requiredRule || '非必传',
        triggerCondition: formal.triggerCondition || '', enumRange: enumValues(formal.enumRange || '').join('\n'), definition: formal.definition,
        defaultValue: '', example: formal.example, platform: formal.platform || '', source: 'official',
        uncertainties: ['保留正式参数；本需求适用性、参数与枚举状态需审核'] });
    }
    if (!existing) notes.push(`新增事件理由：${decision.reason}`);
    return { ...event, ...eventMetadata, requestNotes: unique(eventNotes).join('\n'), evtId: existing?.evtId || event.evtId,
      changeType: existing ? '修改' : '新增',
      commonProps: existing ? existing.commonProps || '' : [event.commonProps, removedCommon.length ? `复用现有公共属性：${removedCommon.join('、')}` : ''].filter(Boolean).join('\n'),
      ...(existing ? { reuseSource: { recordId: existing.recordId, evtId: existing.evtId, eventName: existing.eventName, modificationSummary: decision.reason } } : {}),
      uncertainties: unique(notes), params };
  });
}

export function governanceReport(snapshot: GovernanceSnapshot, plan: ReusePlan, events: AiTrackingDraftEvent[]): AiGovernanceReport {
  return { workflowVersion: WORKFLOW_VERSION, source: snapshot.source, ...plan,
    snapshotFingerprint: snapshot.fingerprint, counts: snapshot.counts,
    checks: [
      { name: '正式库完整读取', status: 'passed', detail: '事件、参数、公共属性、枚举均完整分页；不依赖归档工作台或UI视图' },
      { name: '复用来源、端与废弃状态', status: 'passed', detail: '来源ID与事件ID匹配，已废弃/待治理事件已拦截；未上线状态另列确认项' },
      { name: '复用元数据不可变', status: 'passed', detail: '事件与参数正式元数据原样保留；需求差异独立说明；枚举只追加；应用前重新执行' },
      { name: '参数类型、必传条件与公共属性去重', status: 'passed', detail: '保留正式参数；公共属性不重复写入参数表' },
      { name: '枚举和新增参数', status: events.some((event) => event.params.some((param) => param.uncertainties.length)) ? 'pending' : 'passed', detail: '逐项查询枚举状态；扩展、草稿及未查到的值列入确认项' },
      { name: '指标覆盖与归因口径', status: 'pending', detail: '请核对PRD指标分母、去重单位、稳定关联ID和归因窗口；不以结构校验冒充业务验收' },
    ] };
}

export function assertFreshGovernance(report: AiGovernanceReport | undefined, snapshot: GovernanceSnapshot): ReusePlan {
  if (report?.workflowVersion !== WORKFLOW_VERSION) throw new GovernanceValidationError('旧版草稿未执行正式库校验，请重新生成');
  if (report.source !== snapshot.source || report.snapshotFingerprint !== snapshot.fingerprint) throw new GovernanceValidationError('正式库已变化，请重新生成并审核草稿后应用');
  return { primaryBoard: report.primaryBoard, secondaryBoard: report.secondaryBoard, decisions: report.decisions };
}

function findEvent(snapshot: GovernanceSnapshot, id: string): OfficialEvent | undefined {
  const matches = snapshot.events.filter((event) => event.evtId.toLowerCase() === id.toLowerCase());
  if (matches.length > 1) throw new GovernanceValidationError(`正式库同端事件ID重复，需先治理：${id}`);
  return matches[0];
}
function usable(event: OfficialEvent): boolean { return !/已废弃|待治理/.test(`${event.status} ${event.lifecycleStatus}`); }
function assertNoKnownAlias(id: string, snapshot: GovernanceSnapshot): void {
  const aliases: Record<string, string> = { template_card_expose: 'creation_template_view', template_card_click: 'creation_template_click', template_modal_view: 'creation_template_detail_view' };
  const canonicalId = aliases[id];
  if (canonicalId && snapshot.events.some((event) => event.evtId === canonicalId && usable(event))) throw new GovernanceValidationError(`${id} 与正式事件 ${canonicalId} 重复，请按正式事件重新规划`);
}
function normalizedType(value: string): string { return value.toUpperCase() === 'BOOL' ? 'BOOLEAN' : value.toUpperCase(); }
function enumValues(value: string): string[] { return unique(value.split(/\r?\n/).map((line) => line.replace(/^\s*\/\/\s*/, '').split(/\s*\/\/\s*/)[0].trim())); }
function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function ids(value: unknown): string[] { return (Array.isArray(value) ? value : []).map((item) => cell(object(item).id || item)); }
function cell(value: unknown): string {
  if (value == null) return '';
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value).trim();
  if (Array.isArray(value)) return value.map(cell).filter(Boolean).join('、');
  const item = object(value);
  return cell(item.text || item.name || item.link || item.url || item.id);
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).sort().join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
