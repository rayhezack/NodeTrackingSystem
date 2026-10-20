import type {
  GetMyTodosResponse,
  GetParamsResponse,
  GetStageStatsResponse,
  GetTrackingDetailResponse,
  GetTrackingRecordsParams,
  GetTrackingRecordsResponse,
  GetWorkbenchDashboardParams,
  GetWorkbenchDashboardResponse,
  TodoItem,
  ParamDetail,
  RelatedTrackingEvent,
  TrackingDetail,
  TrackingRecord,
  TrackingSource,
  TrackingSourceFilter,
} from '../shared/api.interface';
import { getBitableRecord, searchBitableRecordPage, type BitableRecord } from './feishu-bitable';
import type { FeishuCredentials } from './feishu-token';
import { loadPermissionConfig, recordPermissions } from './tracking-write';

type FetchLike = typeof fetch;
type SourcedRecord = { source: TrackingSource; record: BitableRecord };
type RecordGroup = { source: TrackingSource; requestId: string; records: BitableRecord[] };

const SOURCES: TrackingSource[] = ['app', 'web'];
const UI_STAGES = ['埋点提需', '埋点设计', '埋点评审', '埋点开发', '埋点验收', '埋点上线', '归档'];
const STAGE_ORDER = ['需求录入', '埋点设计', '评审通过', '埋点开发', '数据验收', '上线监控', '稳定归档', '已废弃'];
const PRIORITY_WEIGHT: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const BOOTSTRAP_ADMINS = new Set(['1867390536304713', '7648831973842095079', 'sunwen-1663469']);

export async function getWorkbenchDashboard(
  credentials: FeishuCredentials,
  params: GetWorkbenchDashboardParams,
  trustedActorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<GetWorkbenchDashboardResponse> {
  const records = await listWorkbenchRecords(credentials, params.source, fetchImpl);
  return {
    ...buildRecordList(records, params),
    stats: buildStageStats(records).items,
    todos: buildTodos(records, Number(params.todoLimit || 10), trustedActorId),
  };
}

export async function getTrackingRecords(
  credentials: FeishuCredentials,
  params: GetTrackingRecordsParams,
  fetchImpl: FetchLike = fetch,
): Promise<GetTrackingRecordsResponse> {
  return buildRecordList(await listWorkbenchRecords(credentials, params.source, fetchImpl), params);
}

export async function getTrackingStageStats(
  credentials: FeishuCredentials,
  source: TrackingSourceFilter | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<GetStageStatsResponse> {
  return buildStageStats(await listWorkbenchRecords(credentials, source, fetchImpl));
}

export async function getTrackingTodos(
  credentials: FeishuCredentials,
  source: TrackingSourceFilter | undefined,
  limit: number,
  trustedActorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<GetMyTodosResponse> {
  const records = await listWorkbenchRecords(credentials, source, fetchImpl);
  return { items: buildTodos(records, limit, trustedActorId) };
}

export async function getTrackingDetail(
  credentials: FeishuCredentials,
  recordId: string,
  trustedActorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<GetTrackingDetailResponse> {
  const ref = parseScopedRecordId(recordId);
  const current = await getBitableRecord(credentials, ref.source === 'web' ? 'webWorkbench' : 'workbench', ref.rawId, fetchImpl);
  if (!current) throw new Error('埋点需求不存在');
  const sourced = await listWorkbenchRecords(credentials, ref.source, fetchImpl);
  const group = groupRecords(sourced).find((item) => item.records.some((record) => record.id === current.id)) || {
    source: ref.source,
    requestId: cellText(current.record['需求ID']),
    records: [current],
  };
  const workflowRecord = selectWorkflowRecord(group.records);
  const sharedFields = sharedRequestFields(group.records);
  const permissionConfig = await loadPermissionConfig(credentials, fetchImpl);
  const effectiveCurrent = { ...current, record: { ...current.record, ...sharedFields } };
  const detail = toTrackingDetail(effectiveCurrent, ref.source, trustedActorId, permissionConfig.admins);
  detail.stage = cellText(workflowRecord.record['流程阶段']) || detail.stage;
  detail.uiStage = getUiStage(detail.stage, cellText(workflowRecord.record['评审状态']));
  detail.relatedEvents = [...group.records]
    .sort((left, right) => cellTimestamp(left.record['创建时间']) - cellTimestamp(right.record['创建时间']))
    .map((record): RelatedTrackingEvent => {
      const effective = { ...record, record: { ...record.record, ...sharedFields } };
      const snapshot = toTrackingDetail(effective, ref.source, trustedActorId, permissionConfig.admins);
      const { relatedEvents: _relatedEvents, ...detailSnapshot } = snapshot;
      return {
        recordId: `${ref.source}:${record.id}`,
        source: ref.source,
        evtId: cellText(record.record.evt_id),
        eventName: cellText(record.record['事件中文名']) || '未命名事件',
        stage: cellText(record.record['流程阶段']) || '需求录入',
        uiStage: getUiStage(cellText(record.record['流程阶段']) || '需求录入', cellText(record.record['评审状态'])),
        priority: cellText(record.record['优先级']) || 'P2',
        platform: cellText(record.record['端']) || '-',
        isCurrent: record.id === current.id,
        detail: detailSnapshot,
      };
    });
  return { data: detail };
}

export async function getTrackingParams(
  credentials: FeishuCredentials,
  recordId: string,
  fetchImpl: FetchLike = fetch,
): Promise<GetParamsResponse> {
  const ref = parseScopedRecordId(recordId);
  const workbench = await getBitableRecord(credentials, ref.source === 'web' ? 'webWorkbench' : 'workbench', ref.rawId, fetchImpl);
  if (!workbench) throw new Error('埋点需求不存在');
  const evtId = cellText(workbench.record.evt_id);
  const records: BitableRecord[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await searchBitableRecordPage(credentials, ref.source === 'web' ? 'webParamDetail' : 'paramDetail', {
      pageSize: 500,
      pageToken,
    }, fetchImpl);
    records.push(...result.records);
    if (!result.hasMore || !result.pageToken) break;
    pageToken = result.pageToken;
    if (page === 19) throw new Error('Feishu parameter pagination exceeded 20 pages');
  }
  const items = records
    .filter((record) => isParamForDesign(record, ref.rawId, evtId))
    .filter((record) => !['废弃', '已废弃'].includes(cellText(record.record['参数状态'])) && !['删除', '废弃'].includes(cellText(record.record['变更类型'])))
    .map((record) => toParamDetail(record, ref.source))
    .sort((left, right) => left.paramKey.localeCompare(right.paramKey));
  return { items, total: items.length };
}

async function listWorkbenchRecords(
  credentials: FeishuCredentials,
  sourceFilter: TrackingSourceFilter | undefined,
  fetchImpl: FetchLike,
): Promise<SourcedRecord[]> {
  const sources = sourceFilter === 'app' || sourceFilter === 'web' ? [sourceFilter] : SOURCES;
  const batches = await Promise.all(sources.map(async (source) => {
    const records: BitableRecord[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const result = await searchBitableRecordPage(credentials, source === 'web' ? 'webWorkbench' : 'workbench', {
        pageSize: 500,
        pageToken,
      }, fetchImpl);
      records.push(...result.records);
      if (!result.hasMore || !result.pageToken) break;
      pageToken = result.pageToken;
      if (page === 19) throw new Error('Feishu workbench pagination exceeded 20 pages');
    }
    return records.filter(isBusinessRecord).map((record) => ({ source, record }));
  }));
  return batches.flat();
}

function buildRecordList(records: SourcedRecord[], params: GetTrackingRecordsParams): GetTrackingRecordsResponse {
  const pageSize = Math.min(Math.max(Math.trunc(Number(params.pageSize) || 50), 1), 100);
  const offset = Math.max(Math.trunc(Number(params.pageToken) || 0), 0);
  const keyword = (params.keyword || '').trim().toLocaleLowerCase();
  const items = groupRecords(records)
    .map((group) => toTrackingRecord(group))
    .filter((record) => {
      const haystack = `${record.requestId || ''} ${record.requestName || ''} ${record.evtId} ${record.eventName} ${record.eventIds.join(' ')} ${record.eventNames.join(' ')}`.toLocaleLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (params.stage && record.uiStage !== params.stage && record.stage !== params.stage) return false;
      if (params.priority && record.priority !== params.priority) return false;
      if (params.platform && !matchesPlatform(record, params.platform)) return false;
      if (params.owner && ![...record.dataOwner, ...record.devOwner].join(' ').includes(params.owner)) return false;
      return true;
    })
    .sort(compareByUpdatedAt);
  const nextOffset = offset + pageSize;
  return {
    items: items.slice(offset, nextOffset),
    hasMore: nextOffset < items.length,
    pageToken: nextOffset < items.length ? String(nextOffset) : undefined,
    total: items.length,
  };
}

function buildStageStats(records: SourcedRecord[]): GetStageStatsResponse {
  const counts = new Map(UI_STAGES.map((stage) => [stage, 0]));
  for (const group of groupRecords(records)) {
    const stage = toTrackingRecord(group).uiStage;
    if (counts.has(stage)) counts.set(stage, (counts.get(stage) || 0) + 1);
  }
  return { items: UI_STAGES.map((stage) => ({ stage, count: counts.get(stage) || 0 })) };
}

function buildTodos(records: SourcedRecord[], limit: number, actorId: string): TodoItem[] {
  if (!actorId) return [];
  const safeLimit = Math.min(Math.max(Math.trunc(limit || 10), 1), 100);
  return groupRecords(records)
    .map((group) => {
      const workflowRecord = selectWorkflowRecord(group.records);
      const action = getTodoAction(group.records, workflowRecord, actorId, BOOTSTRAP_ADMINS.has(actorId));
      if (!action) return null;
      const record = toTrackingRecord(group, workflowRecord);
      return { ...record, stage: action.stage, targetStage: action.targetStage, todoRole: action.todoRole };
    })
    .filter((item): item is TrackingRecord & { targetStage: string; todoRole: string } => Boolean(item))
    .sort((left, right) => (PRIORITY_WEIGHT[left.priority] ?? 9) - (PRIORITY_WEIGHT[right.priority] ?? 9) || compareByUpdatedAt(left, right))
    .slice(0, safeLimit)
    .map(({ recordId, source, requestId, requestName, evtId, eventIds, eventName, eventNames, eventCount, stage, targetStage, todoRole, priority, platform }) => ({
      recordId, source, requestId, requestName, evtId, eventIds, eventName, eventNames, eventCount, stage, targetStage, todoRole, priority, platform,
    }));
}

function toTrackingDetail(record: BitableRecord, source: TrackingSource, trustedActorId: string, configuredAdmins: string[]): TrackingDetail {
  const requester = detailUsers(record, '需求提出人');
  const recorder = detailUsers(record, '需求录入人');
  const dataOwner = detailUsers(record, '数据负责人');
  const devOwner = detailUsers(record, '研发负责人');
  const dsAcceptor = detailUsers(record, 'DS验收人');
  const stage = cellText(record.record['流程阶段']) || '需求录入';
  const base = singleTrackingRecord(record, source);
  const requirementFields = {
    ...pickFields(record.record, ['需求名称', '需求背景', '需求链接', '指标/使用场景', '期望完成日期', '优先级', '端']),
    '需求提出人': requester,
    '需求录入人': recorder,
    '数据负责人': dataOwner,
    '研发负责人': devOwner,
    'DS验收人': dsAcceptor,
  };
  return {
    ...base,
    reviewStatus: cellText(record.record['评审状态']) || '草稿',
    devStatus: cellText(record.record['埋点开发状态']) || '未开始',
    acceptanceStatus: cellText(record.record['DS验收状态']) || '未开始',
    requester,
    requesterIds: requester.map((user) => user.user_id),
    recorder,
    recorderIds: recorder.map((user) => user.user_id),
    dataOwner,
    dataOwnerIds: dataOwner.map((user) => user.user_id),
    devOwner,
    devOwnerIds: devOwner.map((user) => user.user_id),
    dsAcceptor,
    dsAcceptorIds: dsAcceptor.map((user) => user.user_id),
    requirementFields,
    designFields: pickFields(record.record, ['evt_id', '事件中文名', '优先级', '端', '事件定义', '触发时机', 'UI图', 'UI图对应网页链接', '处理方', '公共属性要求', '版本', '最低版本', '变更类型', '参数拆行状态']),
    reviewFields: pickFields(record.record, ['评审状态', '评审意见']),
    devFields: { ...pickFields(record.record, ['埋点开发状态']), '研发负责人': devOwner },
    acceptanceFields: { ...pickFields(record.record, ['DS验收状态', 'DS验收证据', 'DS验收时间']), 'DS验收人': dsAcceptor },
    launchFields: pickFields(record.record, ['发布门禁状态', '发布门禁失败原因', '发布状态', '发布错误', '上线监控状态', '上线监控结论', '发布时间']),
    archiveFields: pickFields(record.record, ['正式状态', '稳定归档时间']),
    relatedEvents: [],
    permissions: recordPermissions(record.record, trustedActorId, configuredAdmins),
  };
}

function singleTrackingRecord(record: BitableRecord, source: TrackingSource): TrackingRecord {
  const stage = cellText(record.record['流程阶段']) || '需求录入';
  const evtId = cellText(record.record.evt_id);
  const eventName = cellText(record.record['事件中文名']) || '未命名需求';
  const requester = mergeUsers([record], '需求提出人');
  const dataOwner = mergeUsers([record], '数据负责人');
  const devOwner = mergeUsers([record], '研发负责人');
  const expectedCompletionDate = cellText(record.record['期望完成日期']).trim();
  return {
    recordId: `${source}:${record.id}`,
    source,
    requestId: cellText(record.record['需求ID']) || undefined,
    requestName: cellText(record.record['需求名称']) || eventName,
    evtId,
    eventIds: unique([evtId]),
    eventName,
    eventNames: [eventName],
    eventCount: 1,
    stage,
    uiStage: getUiStage(stage, cellText(record.record['评审状态'])),
    priority: cellText(record.record['优先级']) || 'P2',
    platform: cellText(record.record['端']) || '-',
    requester: requester.names,
    requesterIds: requester.ids,
    requesterAvatars: requester.avatars,
    dataOwner: dataOwner.names,
    dataOwnerIds: dataOwner.ids,
    dataOwnerAvatars: dataOwner.avatars,
    devOwner: devOwner.names,
    devOwnerIds: devOwner.ids,
    devOwnerAvatars: devOwner.avatars,
    ...(expectedCompletionDate ? { expectedCompletionDate } : {}),
    updatedAt: updatedTimestamp(record),
  };
}

function sharedRequestFields(records: BitableRecord[]): Record<string, unknown> {
  const fields = ['需求名称', '期望完成日期', '需求提出人', '需求录入人', '数据负责人', '研发负责人', 'DS验收人'];
  return Object.fromEntries(fields.flatMap((field) => {
    const value = records.map((record) => record.record[field]).find((item) => cellText(item).trim());
    return value === undefined ? [] : [[field, value]];
  }));
}

function pickFields(record: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [
    field,
    field === 'UI图' ? (Array.isArray(record[field]) ? record[field] : record[field] ? [record[field]] : []) : cellText(record[field]),
  ]));
}

function userRefs(value: unknown): Array<{ user_id: string; larkUserId?: string; name?: string; avatar?: string }> {
  return cellUsers(value).map((user) => ({
    user_id: user.id,
    ...(user.larkUserId || user.id.startsWith('ou_') ? { larkUserId: user.larkUserId || user.id } : {}),
    ...(user.name ? { name: user.name } : {}),
    ...(user.avatar ? { avatar: user.avatar } : {}),
  }));
}

function detailUsers(record: BitableRecord, field: string): Array<{ user_id: string; larkUserId?: string; name?: string; avatar?: string }> {
  const base = userRefs(record.record[field]);
  const snapshot = parseSnapshotUsers(record.record['通知身份快照'], field);
  const byId = new Map<string, { user_id: string; larkUserId?: string; name?: string; avatar?: string }>();
  for (const user of [...base, ...snapshot]) {
    const existing = byId.get(user.user_id);
    byId.set(user.user_id, {
      ...(existing || user),
      user_id: user.user_id,
      ...(user.larkUserId || existing?.larkUserId ? { larkUserId: user.larkUserId || existing?.larkUserId } : {}),
      ...(user.name || existing?.name ? { name: user.name || existing?.name } : {}),
      ...(user.avatar || existing?.avatar ? { avatar: user.avatar || existing?.avatar } : {}),
    });
  }
  return [...byId.values()];
}

function parseSnapshotUsers(value: unknown, field: string): ReturnType<typeof userRefs> {
  try {
    const snapshot = JSON.parse(cellText(value)) as Record<string, unknown>;
    return userRefs(snapshot?.[field]);
  } catch {
    return [];
  }
}

function isParamForDesign(record: BitableRecord, recordId: string, evtId: string): boolean {
  const sourceRecordId = cellText(record.record['来源设计记录ID']);
  const links = cellIds(record.record['关联设计']);
  if (sourceRecordId || links.length) return sourceRecordId === recordId || links.includes(recordId);
  return Boolean(evtId) && cellText(record.record.evt_id) === evtId;
}

function toParamDetail(record: BitableRecord, source: TrackingSource): ParamDetail {
  const requiredRule = cellText(record.record['必传规则']);
  const evtId = cellText(record.record.evt_id);
  const paramName = cellText(record.record['参数名']);
  return {
    recordId: `${source}:${record.id}`,
    paramKey: evtId && paramName ? `${evtId}.${paramName}` : cellText(record.record['设计参数主键']),
    evtId,
    paramName,
    paramType: cellText(record.record['数据类型']) || 'STRING',
    required: requiredRule === '必传' || requiredRule === '条件必传',
    requiredRule: ['必传', '非必传', '条件必传'].includes(requiredRule) ? requiredRule : '非必传',
    triggerCondition: cellText(record.record['条件说明']),
    enumRange: cellText(record.record['枚举/取值范围']),
    definition: cellText(record.record['参数定义']),
      requestNotes: cellText(record.record['本次需求说明']),
    defaultValue: cellText(record.record['默认值/示例']),
    example: cellText(record.record['默认值/示例']),
    platform: normalizeParamApplicability(cellText(record.record[source === 'web' ? 'Web适用性' : 'App适用性']), source),
    status: cellText(record.record['参数状态']) || '草稿',
    version: cellText(record.record['版本']),
    changeType: cellText(record.record['变更类型']) || '新增',
  };
}

function normalizeParamApplicability(value: string, source: TrackingSource): string {
  const raw = value.trim();
  if (source === 'web') return ({ Web: 'Web通用', '仅Web': 'Web通用' } as Record<string, string>)[raw] || raw || 'Web通用';
  return ({ App: 'App通用', '仅App': 'App通用', iOS: '仅iOS', Android: '仅Android', 'iOS、Android': 'App通用', 'iOS,Android': 'App通用', 'iOS, Android': 'App通用' } as Record<string, string>)[raw] || raw || 'App通用';
}

function cellIds(value: unknown): string[] {
  return (Array.isArray(value) ? value : value ? [value] : []).flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string') return [String((item as Record<string, unknown>).id)];
    return [];
  });
}

function parseScopedRecordId(recordId: string): { source: TrackingSource; rawId: string } {
  if (recordId.startsWith('web:')) return { source: 'web', rawId: recordId.slice(4) };
  if (recordId.startsWith('app:')) return { source: 'app', rawId: recordId.slice(4) };
  return { source: 'app', rawId: recordId };
}

function toTrackingRecord(group: RecordGroup, preferredRecord?: BitableRecord): TrackingRecord {
  const representative = preferredRecord || selectRepresentative(group.records);
  const requestRecord = selectRequestRecord(group.records);
  const workflowRecord = selectWorkflowRecord(group.records);
  const stage = cellText(workflowRecord.record['流程阶段']) || '需求录入';
  const eventIds = unique(group.records.map((record) => cellText(record.record.evt_id)));
  const eventNames = unique(group.records.map((record) => cellText(record.record['事件中文名']) || '未命名事件'));
  const requester = mergeUsers(group.records, '需求提出人');
  const dataOwner = mergeUsers(group.records, '数据负责人');
  const devOwner = mergeUsers(group.records, '研发负责人');
  const expectedCompletionDate = group.records.map((record) => cellText(record.record['期望完成日期']).trim()).find(Boolean);
  return {
    recordId: `${group.source}:${representative.id}`,
    source: group.source,
    requestId: group.requestId || undefined,
    requestName: group.records.map((record) => cellText(record.record['需求名称']).trim()).find(Boolean) || cellText(requestRecord.record['事件中文名']) || '未命名需求',
    evtId: cellText(representative.record.evt_id),
    eventIds,
    eventName: cellText(representative.record['事件中文名']) || eventNames[0] || '未命名需求',
    eventNames,
    eventCount: eventIds.length || group.records.length,
    stage,
    uiStage: getUiStage(stage, cellText(workflowRecord.record['评审状态'])),
    priority: highestPriority(group.records),
    platform: mergePlatforms(group.records),
    requester: requester.names,
    requesterIds: requester.ids,
    requesterAvatars: requester.avatars,
    dataOwner: dataOwner.names,
    dataOwnerIds: dataOwner.ids,
    dataOwnerAvatars: dataOwner.avatars,
    devOwner: devOwner.names,
    devOwnerIds: devOwner.ids,
    devOwnerAvatars: devOwner.avatars,
    ...(expectedCompletionDate ? { expectedCompletionDate } : {}),
    updatedAt: Math.max(0, ...group.records.map(updatedTimestamp)),
  };
}

function groupRecords(records: SourcedRecord[]): RecordGroup[] {
  const requestIdsByLegacyKey = new Map<string, Set<string>>();
  for (const { source, record } of records) {
    const requestId = cellText(record.record['需求ID']).trim();
    const legacyKey = legacyGroupKey(record);
    if (!requestId || !legacyKey) continue;
    const key = `${source}:${legacyKey}`;
    const ids = requestIdsByLegacyKey.get(key) || new Set<string>();
    ids.add(requestId);
    requestIdsByLegacyKey.set(key, ids);
  }

  const groups = new Map<string, RecordGroup>();
  for (const { source, record } of records) {
    const requestId = cellText(record.record['需求ID']).trim();
    const legacyKey = legacyGroupKey(record);
    const mappedIds = legacyKey ? requestIdsByLegacyKey.get(`${source}:${legacyKey}`) : undefined;
    const effectiveRequestId = requestId || (mappedIds?.size === 1 ? [...mappedIds][0] : '');
    const key = effectiveRequestId ? `${source}:request:${effectiveRequestId}` : legacyKey ? `${source}:legacy:${legacyKey}` : `${source}:record:${record.id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.records.push(record);
      if (!existing.requestId) existing.requestId = effectiveRequestId;
    } else {
      groups.set(key, { source, requestId: effectiveRequestId, records: [record] });
    }
  }
  return [...groups.values()].map((group) => ({ ...group, records: group.records.sort(compareForGroup) }));
}

function getTodoAction(records: BitableRecord[], workflowRecord: BitableRecord, actorId: string, isAdmin: boolean) {
  const baseStage = cellText(workflowRecord.record['流程阶段']);
  const stageAction: Record<string, [string, string]> = {
    '需求录入': ['埋点提需', 'requirement'],
    '埋点设计': ['埋点设计', 'design'],
    '评审通过': ['埋点开发', 'dev'],
    '埋点开发': ['埋点开发', 'dev'],
    '数据验收': ['埋点验收', 'acceptance'],
    '上线监控': ['埋点上线', 'launch'],
  };
  const action = stageAction[baseStage];
  if (!action) return null;
  if (isAdmin) return { stage: action[0], targetStage: action[1], todoRole: '管理员' };

  const roles: Array<[string, string]> = [
    ['需求提出人', '提需人'],
    ['数据负责人', '数据负责人'],
    ['研发负责人', '研发负责人'],
    ['DS验收人', '埋点校验人'],
  ];
  const role = roles.find(([field]) => identityIds(records, field).includes(actorId));
  return role ? { stage: action[0], targetStage: action[1], todoRole: role[1] } : null;
}

function mergeUsers(records: BitableRecord[], field: string): { ids: string[]; names: string[]; avatars: string[] } {
  const users = records.flatMap((record) => cellUsers(record.record[field]));
  const byId = new Map<string, { id: string; name: string; avatar: string }>();
  for (const user of users) {
    const existing = byId.get(user.id);
    byId.set(user.id, {
      id: user.id,
      name: user.name || existing?.name || '',
      avatar: user.avatar || existing?.avatar || '',
    });
  }
  const values = [...byId.values()];
  return {
    ids: values.map((user) => user.id),
    names: values.map((user) => user.name),
    avatars: values.map((user) => user.avatar),
  };
}

function identityIds(records: BitableRecord[], field: string): string[] {
  const ids = records.flatMap((record) => cellUsers(record.record[field]).map((user) => user.id));
  for (const record of records) {
    const snapshot = cellText(record.record['通知身份快照']);
    if (!snapshot) continue;
    try {
      const users = (JSON.parse(snapshot) as Record<string, unknown>)[field];
      ids.push(...cellUsers(users).map((user) => user.id));
    } catch {
      // Ignore malformed historical snapshots.
    }
  }
  return unique(ids);
}

function cellUsers(value: unknown): Array<{ id: string; name: string; avatar: string; larkUserId?: string }> {
  return (Array.isArray(value) ? value : value ? [value] : []).flatMap((item) => {
    if (typeof item === 'string' || typeof item === 'number') return [{ id: String(item), name: '', avatar: '' }];
    if (!item || typeof item !== 'object') return [];
    const user = item as Record<string, unknown>;
    const larkUserId = firstText(user.larkUserId, user.larkUserID, user.open_id, user.openId);
    const id = firstText(user.user_id, user.userId, user.userID, user.employee_id, user.employeeID, user.id, larkUserId);
    const avatar = typeof user.avatar === 'string'
      ? user.avatar
      : user.avatar && typeof user.avatar === 'object'
        ? firstText((user.avatar as Record<string, unknown>).avatar_origin, (user.avatar as Record<string, unknown>).avatar_240)
        : '';
    return id ? [{
      id,
      name: localizedText(user.name) || localizedText(user.en_name),
      avatar: firstText(user.avatar_url, user.avatarUrl, avatar),
      ...(larkUserId ? { larkUserId } : {}),
    }] : [];
  });
}

function selectWorkflowRecord(records: BitableRecord[]): BitableRecord {
  return [...records].sort((left, right) => workflowProgress(left) - workflowProgress(right) || updatedTimestamp(left) - updatedTimestamp(right)).at(-1) || records[0];
}

function selectRepresentative(records: BitableRecord[]): BitableRecord {
  return [...records].sort(compareForGroup)[0];
}

function selectRequestRecord(records: BitableRecord[]): BitableRecord {
  return [...records].sort((left, right) => cellTimestamp(left.record['创建时间']) - cellTimestamp(right.record['创建时间']) || compareForGroup(left, right))[0];
}

function compareForGroup(left: BitableRecord, right: BitableRecord): number {
  return UI_STAGES.indexOf(getUiStage(cellText(left.record['流程阶段']), cellText(left.record['评审状态']))) - UI_STAGES.indexOf(getUiStage(cellText(right.record['流程阶段']), cellText(right.record['评审状态'])))
    || (PRIORITY_WEIGHT[cellText(left.record['优先级'])] ?? 9) - (PRIORITY_WEIGHT[cellText(right.record['优先级'])] ?? 9)
    || cellTimestamp(right.record['创建时间']) - cellTimestamp(left.record['创建时间']);
}

function workflowProgress(record: BitableRecord): number {
  const stage = cellText(record.record['流程阶段']);
  const uiIndex = UI_STAGES.indexOf(getUiStage(stage, cellText(record.record['评审状态'])));
  const reviewWeight: Record<string, number> = { '草稿': 0, '已拒绝': 1, '评审中': 2, '已通过': 3 };
  return uiIndex * 100 + STAGE_ORDER.indexOf(stage) * 10 + (reviewWeight[cellText(record.record['评审状态'])] || 0);
}

function getUiStage(stage: string, reviewStatus = ''): string {
  if (stage === '埋点设计' && reviewStatus && reviewStatus !== '草稿') return '埋点评审';
  return ({ '需求录入': '埋点提需', '埋点设计': '埋点设计', '评审通过': '埋点开发', '埋点开发': '埋点开发', '数据验收': '埋点验收', '上线监控': '埋点上线', '稳定归档': '归档', '已废弃': '归档' } as Record<string, string>)[stage] || stage;
}

function isBusinessRecord(record: BitableRecord): boolean {
  const evtId = cellText(record.record.evt_id);
  const type = cellText(record.record['记录类型']);
  return evtId !== '__system_permissions__' && type !== '模板' && type !== '权限配置' && (type === '埋点设计' || Boolean(evtId) || Boolean(cellText(record.record['事件中文名'])));
}

function legacyGroupKey(record: BitableRecord): string {
  const link = cellText(record.record['需求链接']).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const name = cellText(record.record['需求名称']).trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return link ? `link:${link}` : name ? `name:${name}` : '';
}

function highestPriority(records: BitableRecord[]): string {
  return records.map((record) => cellText(record.record['优先级']) || 'P2').sort((left, right) => (PRIORITY_WEIGHT[left] ?? 9) - (PRIORITY_WEIGHT[right] ?? 9))[0] || 'P2';
}

function mergePlatforms(records: BitableRecord[]): string {
  const values = records.flatMap((record) => cellText(record.record['端']).split(/[、,，/]/).map((item) => item.trim()).filter(Boolean));
  return unique(values).join('、') || '-';
}

function matchesPlatform(record: TrackingRecord, platform: string): boolean {
  if (platform === 'App') return record.source === 'app';
  if (platform === 'Web') return record.source === 'web' || record.platform.includes('Web');
  return record.platform.split(/[、,，/]/).map((item) => item.trim()).includes(platform.trim());
}

function compareByUpdatedAt(left: TrackingRecord, right: TrackingRecord): number {
  return right.updatedAt - left.updatedAt || (PRIORITY_WEIGHT[left.priority] ?? 9) - (PRIORITY_WEIGHT[right.priority] ?? 9) || (left.requestName || left.eventName).localeCompare(right.requestName || right.eventName);
}

function updatedTimestamp(record: BitableRecord): number {
  return cellTimestamp(record.record['更新时间']) || cellTimestamp(record.record['创建时间']);
}

function cellTimestamp(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = cellText(value);
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);
  const timestamp = Date.parse(text.replace(' ', 'T'));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value);
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join('、');
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return firstText(item.name, item.link, item.url, item.text, item.id);
  }
  return '';
}

function localizedText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const item = value as Record<string, unknown>;
  return firstText(item.zh_cn, item.en_us, item.ja_jp);
}

function firstText(...values: unknown[]): string {
  return values.find((value) => (typeof value === 'string' && value.trim()) || typeof value === 'number')?.toString().trim() || '';
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}
