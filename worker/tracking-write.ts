import type {
  BatchDeleteParamsRequest,
  BatchDeleteParamsResponse,
  AiTrackingDraftEvent,
  CreateParamRequest,
  CreateParamResponse,
  CreateSiblingTrackingEventRequest,
  CreateSiblingTrackingEventResponse,
  CreateTrackingRecordRequest,
  CreateTrackingRecordResponse,
  DeleteParamResponse,
  DeleteTrackingEventResponse,
  DeleteTrackingRequestResponse,
  GetPermissionConfigResponse,
  ParamDetail,
  PermissionConfig,
  ReuseOfficialEventRequest,
  ReuseOfficialEventResponse,
  TrackingDetailPermissions,
  TrackingSource,
  TrackingUserInput,
  TrackingUserRef,
  UpdateParamRequest,
  UpdateParamResponse,
  UpdatePermissionConfigRequest,
  UpdatePermissionConfigResponse,
  UpdateTrackingRecordRequest,
  UpdateTrackingRecordResponse,
} from '../shared/api.interface';
import { DEFAULT_DATA_OWNER, DEFAULT_TRACKING_VALIDATORS } from '../shared/tracking-defaults';
import {
  createBitableRecords,
  deleteBitableRecords,
  getBitableRecord,
  searchBitableRecordPage,
  updateBitableRecords,
  type BitableInstanceKey,
  type BitableRecord,
} from './feishu-bitable';
import { getDirectoryUserByEmail, resolveDirectoryUserByName } from './feishu-directory';
import { sendWorkflowNotification, type WorkflowNotificationRecipient } from './feishu-notification';
import type { FeishuCredentials } from './feishu-token';

type FetchLike = typeof fetch;
type WorkerCredentials = FeishuCredentials & { TRACKING_APP_URL?: string };
type PermissionKey = keyof TrackingDetailPermissions;

const BOOTSTRAP_ADMINS = new Set(['1867390536304713', '7648831973842095079', 'sunwen-1663469']);
const LEGACY_ADMIN_ID_MAP: Record<string, string> = {
  '1867390536304713': 'sunwen-1663469',
  '1855461847682347': '24915dag',
  '1874638956515561': '2727dbe3',
};
const LEGACY_FEISHU_USER_ID_MAP: Record<string, string> = {
  '1867390536304713': 'sunwen-1663469',
  '1855461847682347': '24915dag',
};
const PERMISSION_RECORD_EVT_ID = '__system_permissions__';
const USER_FIELDS = ['需求提出人', '需求录入人', '数据负责人', '研发负责人', 'DS验收人'] as const;
const SHARED_FIELDS = ['需求名称', '期望完成日期', ...USER_FIELDS, '通知身份快照'];
const STAGES = ['需求录入', '埋点设计', '评审通过', '埋点开发', '数据验收', '上线监控', '稳定归档', '已废弃'];
const UI_TO_BASE_STAGE: Record<string, string> = {
  埋点提需: '需求录入', 埋点设计: '埋点设计', 埋点评审: '埋点设计', 埋点开发: '评审通过',
  埋点验收: '数据验收', 埋点校验: '数据验收', 埋点上线: '上线监控', 归档: '稳定归档',
};
const STAGE_PERMISSION: Record<string, PermissionKey> = {
  requirement: 'canEditRequirement', design: 'canEditDesign', review: 'canEditReview', dev: 'canEditDev',
  acceptance: 'canEditAcceptance', launch: 'canEditLaunch', archive: 'canEditArchive',
};
const TARGET_PERMISSION: Record<string, PermissionKey> = {
  埋点设计: 'canEditRequirement', 评审通过: 'canEditReview', 数据验收: 'canEditDev',
  上线监控: 'canEditAcceptance', 稳定归档: 'canEditLaunch', 已废弃: 'canEditArchive',
};
const FIELD_PERMISSION: Record<string, PermissionKey> = {
  需求名称: 'canEditRequirement', 需求提出人: 'canEditRequirement', 需求录入人: 'canEditRequirement',
  需求背景: 'canEditRequirement', 需求链接: 'canEditRequirement', '指标/使用场景': 'canEditRequirement',
  期望完成日期: 'canEditRequirement', 数据负责人: 'canEditRequirement', DS验收人: 'canEditRequirement',
  evt_id: 'canEditDesign', 事件中文名: 'canEditDesign', 事件定义: 'canEditDesign', 触发时机: 'canEditDesign',
  UI图: 'canEditDesign', 'UI图对应网页链接': 'canEditDesign', 处理方: 'canEditDesign', 公共属性要求: 'canEditDesign',
  版本: 'canEditDesign', 最低版本: 'canEditDesign', 变更类型: 'canEditDesign', 优先级: 'canEditDesign', 端: 'canEditDesign',
  评审状态: 'canEditReview', 评审意见: 'canEditReview', 研发负责人: 'canEditDev', 埋点开发状态: 'canEditDev',
  DS验收状态: 'canEditAcceptance', DS验收证据: 'canEditAcceptance', DS验收时间: 'canEditAcceptance',
  发布门禁状态: 'canEditLaunch', 发布门禁失败原因: 'canEditLaunch', 发布状态: 'canEditLaunch', 发布错误: 'canEditLaunch',
  上线监控状态: 'canEditLaunch', 上线监控结论: 'canEditLaunch', 发布时间: 'canEditLaunch',
  正式状态: 'canEditArchive', 稳定归档时间: 'canEditArchive', 流程阶段: 'canEditDesign',
};

export class TrackingWriteError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function applyAiDraftEvents(
  credentials: WorkerCredentials,
  recordId: string,
  events: AiTrackingDraftEvent[],
  actorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ appliedRecordIds: string[]; createdEventCount: number; createdParamCount: number }> {
  if (!events.length) throw new TrackingWriteError('至少选择一个埋点事件', 400);
  const ref = parseScopedId(recordId);
  const current = await getBitableRecord(credentials, workbenchKey(ref.source), ref.rawId, fetchImpl);
  if (!current) throw new TrackingWriteError('埋点需求不存在', 404);
  const permissions = recordPermissions(current.record, actorId, (await loadPermissionConfig(credentials, fetchImpl)).admins);
  if (!permissions.canEditDesign || !permissions.canEditParams) throw new TrackingWriteError('当前用户无权限录入 AI 埋点草稿', 403);
  const related = await listRelatedRecords(credentials, ref.source, current, fetchImpl);
  const existingEvtIds = new Set(related.map((item) => text(item.record.evt_id).toLocaleLowerCase()).filter(Boolean));
  const nextEvtIds = events.map((event) => text(event.evtId).toLocaleLowerCase());
  if (nextEvtIds.some((id) => !id) || new Set(nextEvtIds).size !== nextEvtIds.length) throw new TrackingWriteError('AI 草稿内 evt_id 为空或重复', 400);
  const currentBlank = !text(current.record.evt_id) && !related.some((item) => item.id !== current.id && text(item.record.evt_id));
  for (const [index, evtId] of nextEvtIds.entries()) if (existingEvtIds.has(evtId) && !(currentBlank && index === 0)) throw new TrackingWriteError(`当前需求内已存在 evt_id：${events[index].evtId}`, 400);
  let requestId = text(current.record['需求ID']);
  if (!requestId) {
    requestId = createRequestId(ref.source);
    await updateBitableRecords(credentials, workbenchKey(ref.source), related.map((item) => ({ id: item.id, record: { 需求ID: requestId } })), fetchImpl);
  }
  const eventPatch = (event: AiTrackingDraftEvent): Record<string, unknown> => ({
    evt_id: text(event.evtId), 事件中文名: text(event.eventName), 事件定义: text(event.eventDefinition), 触发时机: text(event.triggerTiming),
    优先级: text(event.priority) || 'P1', 端: platformCell(event.platform, ref.source), 处理方: normalizeHandler(event.handler, ref.source),
    公共属性要求: text(event.commonProps), 版本: text(event.version) || '待人工确认', 最低版本: text(event.minVersion) || text(event.version) || '待人工确认',
    变更类型: normalizeChangeType(event.changeType), 流程阶段: '埋点设计', 评审状态: '草稿', 参数拆行状态: event.params.length ? '已拆行' : '未拆行',
  });
  const targets: Array<{ event: AiTrackingDraftEvent; id: string }> = [];
  let start = 0;
  if (currentBlank) {
    await updateBitableRecords(credentials, workbenchKey(ref.source), [{ id: current.id, record: eventPatch(events[0]) }], fetchImpl);
    targets.push({ event: events[0], id: current.id });
    start = 1;
  }
  const siblings = events.slice(start).map((event) => ({
    需求ID: requestId, 需求名称: text(current.record['需求名称']) || text(current.record['事件中文名']),
    需求背景: text(current.record['需求背景']), ...(text(current.record['需求链接']) ? { 需求链接: text(current.record['需求链接']) } : {}),
    '指标/使用场景': text(current.record['指标/使用场景']), ...(current.record['期望完成日期'] ? { 期望完成日期: current.record['期望完成日期'] } : {}),
    记录类型: '埋点设计', ...Object.fromEntries(USER_FIELDS.map((field) => [field, current.record[field] || []])),
    ...(current.record['通知身份快照'] ? { 通知身份快照: current.record['通知身份快照'] } : {}),
    埋点开发状态: '未开始', DS验收状态: '未开始', 上线监控状态: '未开始', 发布门禁状态: '未检查', 发布状态: '未发布', 正式状态: '待开发',
    ...eventPatch(event),
  }));
  const createdSiblings = siblings.length ? await createBitableRecords(credentials, workbenchKey(ref.source), siblings, fetchImpl) : [];
  for (let index = 0; index < createdSiblings.length; index += 1) targets.push({ event: events[start + index], id: createdSiblings[index].id });
  if (createdSiblings.length !== siblings.length) throw new Error('批量新增埋点事件返回数量异常');
  const paramRecords = targets.flatMap(({ event, id }) => event.params.map((param) => toParamRecord(ref.source, id, event.evtId, event.version, {
    evtId: event.evtId, paramName: param.paramName, paramType: param.paramType, required: ['必传', '条件必传'].includes(param.requiredRule),
    requiredRule: param.requiredRule, triggerCondition: param.triggerCondition, enumRange: param.enumRange, definition: param.definition,
    defaultValue: param.defaultValue, example: param.example, platform: param.platform, status: '草稿', version: event.version, changeType: event.changeType,
  })));
  if (paramRecords.length) {
    const createdParams = await createBitableRecords(credentials, paramKey(ref.source), paramRecords, fetchImpl);
    assertCreatedCount(createdParams, paramRecords, 'AI 埋点参数');
    await syncEnumDictionary(credentials, ref.source, 'design', createdParams.map((item, index) => ({ id: item.id, record: paramRecords[index] })), fetchImpl);
  }
  return { appliedRecordIds: targets.map((target) => scopedId(ref.source, target.id)), createdEventCount: targets.length, createdParamCount: paramRecords.length };
}

export async function getPermissionConfig(
  credentials: WorkerCredentials,
  actorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<GetPermissionConfigResponse> {
  const stored = await findPermissionRecord(credentials, fetchImpl);
  const config = stored ? parsePermissionConfig(stored.record['需求背景']) : emptyPermissionConfig();
  const initialized = Boolean(stored);
  const shouldIncludeActor = Boolean(actorId)
    && (!initialized || BOOTSTRAP_ADMINS.has(actorId))
    && !config.admins.includes(actorId);
  const effectiveConfig = shouldIncludeActor
    ? { ...config, admins: unique([...config.admins, actorId]) }
    : config;
  return {
    config: effectiveConfig,
    initialized,
    canManage: Boolean(actorId) && (!initialized || !effectiveConfig.admins.length || effectiveConfig.admins.includes(actorId) || BOOTSTRAP_ADMINS.has(actorId)),
  };
}

export async function updatePermissionConfig(
  credentials: WorkerCredentials,
  body: UpdatePermissionConfigRequest,
  actorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<UpdatePermissionConfigResponse> {
  if (!actorId) throw new TrackingWriteError('无法识别当前用户，不能更新权限配置', 400);
  const existing = await findPermissionRecord(credentials, fetchImpl);
  const current = existing ? parsePermissionConfig(existing.record['需求背景']) : emptyPermissionConfig();
  if (existing && current.admins.length && !current.admins.includes(actorId) && !BOOTSTRAP_ADMINS.has(actorId)) {
    throw new TrackingWriteError('只有管理员可以更新权限配置', 403);
  }
  const config: PermissionConfig = {
    admins: unique([...(body.config?.admins || []), actorId]),
    dataScientists: [], developers: [], acceptors: [], viewers: [],
    updatedAt: Date.now(), updatedBy: actorId,
  };
  const record = {
    evt_id: PERMISSION_RECORD_EVT_ID,
    事件中文名: '系统权限配置',
    需求背景: JSON.stringify(config),
    流程阶段: '稳定归档',
    记录类型: '模板',
    优先级: 'P2',
    版本: 'system',
  };
  if (existing) await updateBitableRecords(credentials, 'workbench', [{ id: existing.id, record }], fetchImpl);
  else await createBitableRecords(credentials, 'workbench', [record], fetchImpl);
  return { success: true, config };
}

export async function loadPermissionConfig(credentials: WorkerCredentials, fetchImpl: FetchLike = fetch): Promise<PermissionConfig> {
  const record = await findPermissionRecord(credentials, fetchImpl);
  return record ? parsePermissionConfig(record.record['需求背景']) : emptyPermissionConfig();
}

export async function createTrackingRecord(
  credentials: WorkerCredentials,
  body: CreateTrackingRecordRequest,
  actor: TrackingUserRef,
  fetchImpl: FetchLike = fetch,
): Promise<CreateTrackingRecordResponse> {
  const source: TrackingSource = body.source === 'web' ? 'web' : 'app';
  const requestName = text(body.requestName || body.eventName);
  const eventName = text(body.eventName || requestName);
  const requirementLink = text(body.requirementLink);
  if (!requestName) throw new TrackingWriteError('需求名称不能为空', 400);
  if (!requirementLink) throw new TrackingWriteError('PRD 文档链接不能为空；没有 PRD 文档无法进行埋点设计', 400);
  if (!isFeishuPrdUrl(requirementLink)) throw new TrackingWriteError('MVP 目前仅支持飞书 wiki 或 docx 文档链接', 400);

  const userResolutionCache = new Map<string, Promise<TrackingUserRef>>();
  const requester = await resolveBaseUsers(credentials, normalizeUsers(body.requesterIds?.length ? body.requesterIds : [actor]), fetchImpl, userResolutionCache);
  const recorder = await resolveBaseUsers(credentials, normalizeUsers(body.recorderIds?.length ? body.recorderIds : requester), fetchImpl, userResolutionCache);
  const dataOwner = await resolveBaseUsers(credentials, normalizeUsers(body.dataOwnerIds?.length ? body.dataOwnerIds : [DEFAULT_DATA_OWNER]), fetchImpl, userResolutionCache);
  const devOwner = await resolveBaseUsers(credentials, normalizeUsers(body.devOwnerIds || []), fetchImpl, userResolutionCache);
  const dsAcceptor = await resolveBaseUsers(credentials, normalizeUsers(body.dsAcceptorIds?.length ? body.dsAcceptorIds : DEFAULT_TRACKING_VALIDATORS), fetchImpl, userResolutionCache);
  const requestId = createRequestId(source);
  const evtId = text(body.evtId);
  const version = text(body.version) || '1.0.0';
  const fields: Record<string, unknown> = {
    需求ID: requestId,
    需求名称: requestName,
    evt_id: evtId,
    事件中文名: eventName,
    事件定义: text(body.eventDefinition),
    触发时机: text(body.triggerTiming),
    需求背景: text(body.requirementBackground),
    需求链接: requirementLink,
    '指标/使用场景': text(body.metricScenario),
    ...(body.expectedCompletionDate ? { 期望完成日期: toDateCell(body.expectedCompletionDate) } : {}),
    流程阶段: '需求录入',
    记录类型: '埋点设计',
    优先级: text(body.priority) || 'P2',
    端: platformCell(body.platform, source),
    需求提出人: userCells(requester),
    需求录入人: userCells(recorder),
    数据负责人: userCells(dataOwner),
    研发负责人: userCells(devOwner),
    DS验收人: userCells(dsAcceptor),
    通知身份快照: JSON.stringify({ 需求提出人: requester, 需求录入人: recorder, 数据负责人: dataOwner, 研发负责人: devOwner, DS验收人: dsAcceptor }),
    评审状态: '草稿',
    评审意见: '',
    埋点开发状态: '未开始',
    DS验收状态: '未开始',
    上线监控状态: '未开始',
    上线监控结论: '',
    发布门禁状态: '未检查',
    发布门禁失败原因: '',
    发布状态: '未发布',
    发布错误: '',
    正式状态: '待开发',
    版本: version,
    最低版本: text(body.minVersion) || version,
    变更类型: normalizeChangeType(body.changeType),
    处理方: normalizeHandler(body.handler, source),
    公共属性要求: text(body.commonProps),
    参数拆行状态: body.initialParams?.length ? '已拆行' : '未拆行',
  };
  const [created] = await createBitableRecords(credentials, workbenchKey(source), [fields], fetchImpl);
  if (!created) throw new Error('Feishu Base did not return the created record');
  const paramRecords = (body.initialParams || [])
    .map((param) => toParamRecord(source, created.id, evtId, version, param))
    .filter((record) => text(record.evt_id) && text(record['参数名']));
  if (paramRecords.length) {
    const createdParams = await createBitableRecords(credentials, paramKey(source), paramRecords, fetchImpl);
    assertCreatedCount(createdParams, paramRecords, '初始埋点参数');
    await syncEnumDictionary(credentials, source, 'design', createdParams.map((item, index) => ({ id: item.id, record: paramRecords[index] })), fetchImpl);
  }
  return { success: true, recordId: scopedId(source, created.id), currentStage: '需求录入', createdParamCount: paramRecords.length };
}

export async function updateTrackingRecord(
  credentials: WorkerCredentials,
  recordId: string,
  body: UpdateTrackingRecordRequest,
  actorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<UpdateTrackingRecordResponse> {
  const ref = parseScopedId(recordId);
  const current = await getBitableRecord(credentials, workbenchKey(ref.source), ref.rawId, fetchImpl);
  if (!current) throw new TrackingWriteError('埋点需求不存在', 404);
  assertRecordUpdatePermission(current, body, actorId, (await loadPermissionConfig(credentials, fetchImpl)).admins);

  const patch = normalizeWorkbenchPatch({ ...(body.fields || {}) }, ref.source);
  const previousStage = text(current.record['流程阶段']) || '需求录入';
  let currentStage = previousStage;
  if (body.targetStage) {
    const targetStage = UI_TO_BASE_STAGE[body.targetStage] || body.targetStage;
    if (!isValidTransition(previousStage, targetStage)) throw new TrackingWriteError(`非法状态跳转：${previousStage} -> ${targetStage}`, 400);
    if (targetStage === '稳定归档' && normalizeMonitorStatus(text(patch['上线监控状态'] ?? current.record['上线监控状态'])) !== '通过') {
      throw new TrackingWriteError('上线监控状态必须为“通过”才能完成上线', 400);
    }
    patch['流程阶段'] = targetStage;
    currentStage = targetStage;
  }
  if ('需求名称' in patch && !text(patch['需求名称'])) throw new TrackingWriteError('需求名称不能为空', 400);
  if ('需求链接' in patch && !isFeishuPrdUrl(text(patch['需求链接']))) throw new TrackingWriteError('MVP 目前仅支持飞书 wiki 或 docx 文档链接', 400);
  const userResolutionCache = new Map<string, Promise<TrackingUserRef>>();
  for (const field of USER_FIELDS) {
    if (field in patch) {
      patch[field] = userCells(await resolveBaseUsers(credentials, normalizeUsers(patch[field] as TrackingUserInput[]), fetchImpl, userResolutionCache));
    }
  }
  normalizeProgress(patch, current.record);

  const nextRecord = { ...current.record, ...patch };
  const related = await listRelatedRecords(credentials, ref.source, current, fetchImpl);
  const updates = new Map<string, Record<string, unknown>>([[ref.rawId, patch]]);
  const sharedPatch = pick(patch, SHARED_FIELDS);
  if (Object.keys(sharedPatch).length) for (const item of related) if (item.id !== ref.rawId) updates.set(item.id, { ...(updates.get(item.id) || {}), ...sharedPatch });
  if (body.targetStage || (body.stageId === 'design' && text(patch['评审状态']) === '评审中')) {
    const workflowPatch = pick(patch, workflowFields(body.stageId));
    for (const item of related) if (item.id !== ref.rawId) updates.set(item.id, { ...(updates.get(item.id) || {}), ...workflowPatch });
  }
  await updateBitableRecords(credentials, workbenchKey(ref.source), [...updates].map(([id, record]) => ({ id, record })), fetchImpl);

  if ('evt_id' in patch && text(patch.evt_id) !== text(current.record.evt_id)) {
    const params = await listParams(credentials, ref.source, ref.rawId, text(current.record.evt_id), fetchImpl);
    if (params.length) await updateBitableRecords(credentials, paramKey(ref.source), params.map((item) => ({ id: item.id, record: { evt_id: text(patch.evt_id) } })), fetchImpl);
  }
  const officialSyncCache: OfficialSyncCache = {};
  for (const [id, itemPatch] of updates) {
    const original = related.find((item) => item.id === id)?.record || (id === current.id ? current.record : {});
    await syncOfficialLibrary(credentials, ref.source, id, { ...original, ...itemPatch }, fetchImpl, officialSyncCache);
  }
  const notification = await notifyTransition(credentials, ref.source, recordId, current.record, nextRecord, body, related, fetchImpl);
  return { success: true, recordId, currentStage, ...(notification ? { notification } : {}) };
}

export async function createSiblingTrackingEvent(
  credentials: WorkerCredentials,
  recordId: string,
  body: CreateSiblingTrackingEventRequest,
  actorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<CreateSiblingTrackingEventResponse> {
  const ref = parseScopedId(recordId);
  const current = await getBitableRecord(credentials, workbenchKey(ref.source), ref.rawId, fetchImpl);
  if (!current) throw new TrackingWriteError('埋点需求不存在', 404);
  const admins = (await loadPermissionConfig(credentials, fetchImpl)).admins;
  if (!recordPermissions(current.record, actorId, admins).canEditDesign) throw new TrackingWriteError('当前用户无权限新增同需求埋点事件', 403);
  const eventName = text(body.eventName);
  if (!eventName) throw new TrackingWriteError('事件名不能为空', 400);
  const related = await listRelatedRecords(credentials, ref.source, current, fetchImpl);
  const evtId = text(body.evtId);
  if (evtId && related.some((item) => text(item.record.evt_id).toLocaleLowerCase() === evtId.toLocaleLowerCase())) {
    throw new TrackingWriteError(`当前需求内已存在 evt_id：${evtId}`, 400);
  }
  let requestId = text(current.record['需求ID']);
  if (!requestId) {
    requestId = createRequestId(ref.source);
    await updateBitableRecords(credentials, workbenchKey(ref.source), related.map((item) => ({ id: item.id, record: { 需求ID: requestId } })), fetchImpl);
  }
  const version = text(body.version || current.record['版本']) || '1.0.0';
  const fields: Record<string, unknown> = {
    需求ID: requestId,
    需求名称: text(current.record['需求名称']) || text(current.record['事件中文名']),
    evt_id: evtId,
    事件中文名: eventName,
    事件定义: text(body.eventDefinition),
    触发时机: text(body.triggerTiming),
    需求背景: text(current.record['需求背景']),
    ...(text(current.record['需求链接']) ? { 需求链接: text(current.record['需求链接']) } : {}),
    '指标/使用场景': text(current.record['指标/使用场景']),
    ...(current.record['期望完成日期'] ? { 期望完成日期: current.record['期望完成日期'] } : {}),
    流程阶段: '埋点设计', 记录类型: '埋点设计', 优先级: text(body.priority || current.record['优先级']) || 'P2',
    端: platformCell(body.platform || current.record['端'], ref.source),
    ...Object.fromEntries(USER_FIELDS.map((field) => [field, current.record[field] || []])),
    ...(current.record['通知身份快照'] ? { 通知身份快照: current.record['通知身份快照'] } : {}),
    评审状态: '草稿', 评审意见: '', 埋点开发状态: '未开始', DS验收状态: '未开始',
    上线监控状态: '未开始', 上线监控结论: '', 发布门禁状态: '未检查', 发布门禁失败原因: '',
    发布状态: '未发布', 发布错误: '', 正式状态: '待开发', 版本: version,
    最低版本: text(body.minVersion || current.record['最低版本']) || version,
    变更类型: normalizeChangeType(body.changeType || current.record['变更类型']),
    处理方: normalizeHandler(body.handler || current.record['处理方'], ref.source),
    公共属性要求: text(body.commonProps || current.record['公共属性要求']), 参数拆行状态: '未拆行',
  };
  const [created] = await createBitableRecords(credentials, workbenchKey(ref.source), [fields], fetchImpl);
  if (!created) throw new Error('Feishu Base did not return the created event');
  return { success: true, recordId: scopedId(ref.source, created.id), currentStage: '埋点设计' };
}

export async function deleteTrackingEvent(
  credentials: WorkerCredentials,
  recordId: string,
  actorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<DeleteTrackingEventResponse> {
  const ref = parseScopedId(recordId);
  const current = await getBitableRecord(credentials, workbenchKey(ref.source), ref.rawId, fetchImpl);
  if (!current) throw new TrackingWriteError('埋点事件不存在', 404);
  const admins = (await loadPermissionConfig(credentials, fetchImpl)).admins;
  if (!recordPermissions(current.record, actorId, admins).canEditDesign) throw new TrackingWriteError('当前用户无权限删除设计事件', 403);
  const currentUiStage = uiStage(text(current.record['流程阶段']) || '需求录入', text(current.record['评审状态']));
  if (!['埋点提需', '埋点设计'].includes(currentUiStage)) throw new TrackingWriteError('仅支持删除需求录入或埋点设计阶段的事件', 400);
  const related = await listRelatedRecords(credentials, ref.source, current, fetchImpl);
  if (related.length <= 1) throw new TrackingWriteError('一个需求至少需要保留一个埋点事件，不能删除最后一个事件', 400);
  const params = await listParams(credentials, ref.source, ref.rawId, text(current.record.evt_id), fetchImpl);
  if (params.length) await deleteBitableRecords(credentials, paramKey(ref.source), params.map((item) => item.id), fetchImpl);
  await deleteBitableRecords(credentials, workbenchKey(ref.source), [ref.rawId], fetchImpl);
  const redirect = related.filter((item) => item.id !== ref.rawId).sort((left, right) => timestamp(left.record['创建时间']) - timestamp(right.record['创建时间']))[0];
  return { success: true, deletedRecordId: recordId, deletedParamCount: params.length, redirectRecordId: redirect ? scopedId(ref.source, redirect.id) : undefined };
}

export async function deleteTrackingRequest(
  credentials: WorkerCredentials,
  recordId: string,
  actorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<DeleteTrackingRequestResponse> {
  const ref = parseScopedId(recordId);
  const current = await getBitableRecord(credentials, workbenchKey(ref.source), ref.rawId, fetchImpl);
  if (!current) throw new TrackingWriteError('埋点需求不存在', 404);
  const permissions = recordPermissions(current.record, actorId, (await loadPermissionConfig(credentials, fetchImpl)).admins);
  if (!permissions.canEditRequirement && !permissions.canEditDesign && !permissions.canEditArchive) throw new TrackingWriteError('当前用户无权限删除需求单', 403);
  const related = await listRelatedRecords(credentials, ref.source, current, fetchImpl);
  if (related.some((item) => hasOfficialFootprint(item.record))) {
    throw new TrackingWriteError('需求已进入正式上线或归档链路，不支持直接删除；如需下线请走废弃/归档流程以保留审计', 400);
  }
  const params = (await Promise.all(related.map((item) => listParams(credentials, ref.source, item.id, text(item.record.evt_id), fetchImpl)))).flat();
  const paramIds = unique(params.map((item) => item.id));
  if (paramIds.length) await deleteBitableRecords(credentials, paramKey(ref.source), paramIds, fetchImpl);
  await deleteBitableRecords(credentials, workbenchKey(ref.source), related.map((item) => item.id), fetchImpl);
  return { success: true, deletedRequestId: text(current.record['需求ID']) || undefined, deletedRecordCount: related.length, deletedParamCount: paramIds.length };
}

export async function reuseOfficialTrackingEvent(
  credentials: WorkerCredentials,
  recordId: string,
  body: ReuseOfficialEventRequest,
  actorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<ReuseOfficialEventResponse> {
  const ref = parseScopedId(recordId);
  const current = await getBitableRecord(credentials, workbenchKey(ref.source), ref.rawId, fetchImpl);
  if (!current) throw new TrackingWriteError('埋点需求不存在', 404);
  if (!recordPermissions(current.record, actorId, (await loadPermissionConfig(credentials, fetchImpl)).admins).canEditDesign) {
    throw new TrackingWriteError('当前用户无权限复用已有事件', 403);
  }
  const officialRef = parseScopedId(text(body.officialRecordId));
  if (!officialRef.rawId) throw new TrackingWriteError('请选择要复用的正式事件', 400);
  if (officialRef.source !== ref.source) throw new TrackingWriteError('正式事件分库与当前需求分库不一致', 400);
  const official = await getBitableRecord(credentials, queryLibraryKey(ref.source), officialRef.rawId, fetchImpl);
  if (!official) throw new TrackingWriteError('正式事件不存在', 404);
  const evtId = text(official.record.evt_id);
  const eventName = text(official.record['事件中文名']);
  if (!evtId || !eventName) throw new TrackingWriteError('正式事件缺少 evt_id 或事件名，无法复用', 400);

  const related = await listRelatedRecords(credentials, ref.source, current, fetchImpl);
  const reuseCurrent = !text(current.record.evt_id) && !related.some((item) => item.id !== current.id && text(item.record.evt_id));
  if (related.some((item) => item.id !== (reuseCurrent ? current.id : '') && text(item.record.evt_id).toLocaleLowerCase() === evtId.toLocaleLowerCase())) {
    throw new TrackingWriteError(`当前需求内已存在 evt_id：${evtId}`, 400);
  }
  let requestId = text(current.record['需求ID']);
  if (!requestId) {
    requestId = createRequestId(ref.source);
    await updateBitableRecords(credentials, workbenchKey(ref.source), related.map((item) => ({ id: item.id, record: { 需求ID: requestId } })), fetchImpl);
  }
  const version = text(official.record['上线版本'] || current.record['版本']) || '1.0.0';
  const selectedKeys = new Set(unique(body.officialParamKeys || []).map((item) => item.toLocaleLowerCase()));
  const officialParams = selectedKeys.size
    ? (await listAll(credentials, officialParamKey(ref.source), fetchImpl)).filter((item) => {
        const linked = cellIds(item.record['关联事件']);
        if (!(linked.includes(officialRef.rawId) || text(item.record.evt_id) === evtId)) return false;
        const key = text(item.record['参数主键']) || `${evtId}.${text(item.record['参数名'])}`;
        return selectedKeys.has(key.toLocaleLowerCase()) && !['废弃', '已废弃'].includes(text(item.record['参数状态']));
      })
    : [];
  const designPatch: Record<string, unknown> = {
    evt_id: evtId, 事件中文名: eventName, 事件定义: text(official.record['事件定义']), 触发时机: text(official.record['触发时机']),
    ...(text(official.record['指标/使用场景']) ? { '指标/使用场景': text(official.record['指标/使用场景']) } : {}),
    流程阶段: '埋点设计', 记录类型: '埋点设计', 优先级: text(current.record['优先级']) || 'P2',
    端: platformCell(official.record['端'] || current.record['端'], ref.source), 评审状态: '草稿', 评审意见: '',
    埋点开发状态: '未开始', DS验收状态: '未开始', 上线监控状态: '未开始', 上线监控结论: '',
    发布门禁状态: '未检查', 发布门禁失败原因: '', 发布状态: '未发布', 发布错误: '', 正式状态: '待开发',
    版本: version, 最低版本: text(current.record['最低版本']) || version, 变更类型: '修改',
    处理方: normalizeHandler(current.record['处理方'], ref.source), 公共属性要求: text(current.record['公共属性要求']),
    参数拆行状态: officialParams.length ? '已拆行' : '未拆行',
  };
  let targetId = ref.rawId;
  if (reuseCurrent) {
    await updateBitableRecords(credentials, workbenchKey(ref.source), [{ id: targetId, record: designPatch }], fetchImpl);
  } else {
    const [created] = await createBitableRecords(credentials, workbenchKey(ref.source), [{
      需求ID: requestId, 需求名称: text(current.record['需求名称']) || eventName, ...designPatch,
      需求背景: text(current.record['需求背景']), ...(text(current.record['需求链接']) ? { 需求链接: text(current.record['需求链接']) } : {}),
      ...(current.record['期望完成日期'] ? { 期望完成日期: current.record['期望完成日期'] } : {}),
      ...Object.fromEntries(USER_FIELDS.map((field) => [field, current.record[field] || []])),
      ...(current.record['通知身份快照'] ? { 通知身份快照: current.record['通知身份快照'] } : {}),
    }], fetchImpl);
    if (!created) throw new Error('Feishu Base did not return the reused event');
    targetId = created.id;
  }
  const designParams = officialParams.map((item) => ({
    evt_id: evtId, 参数名: text(item.record['参数名']), 数据类型: normalizeParamType(item.record['数据类型']),
    必传规则: normalizeRequiredRule(item.record['必传规则']), 条件说明: text(item.record['条件说明']),
    '枚举/取值范围': text(item.record['枚举/取值范围']), 参数定义: text(item.record['参数定义']),
    '默认值/示例': text(item.record['备注']).replace(/^默认值\/示例[:：]\s*/, ''),
    [ref.source === 'web' ? 'Web适用性' : 'App适用性']: normalizeApplicability(item.record[ref.source === 'web' ? 'Web适用性' : 'App适用性'], ref.source),
    参数状态: '草稿', 版本: version, 变更类型: '修改', 来源设计记录ID: targetId, 关联设计: [targetId],
  })).filter((item) => text(item['参数名']));
  if (designParams.length) {
    const createdParams = await createBitableRecords(credentials, paramKey(ref.source), designParams, fetchImpl);
    assertCreatedCount(createdParams, designParams, '复用埋点参数');
    await syncEnumDictionary(credentials, ref.source, 'design', createdParams.map((item, index) => ({ id: item.id, record: designParams[index] })), fetchImpl);
  }
  return { success: true, recordId: scopedId(ref.source, targetId), currentStage: '埋点设计', importedParamCount: designParams.length, skippedParamCount: officialParams.length - designParams.length };
}

export async function createTrackingParam(
  credentials: WorkerCredentials,
  recordId: string,
  body: CreateParamRequest,
  actorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<CreateParamResponse> {
  const ref = parseScopedId(recordId);
  const design = await getBitableRecord(credentials, workbenchKey(ref.source), ref.rawId, fetchImpl);
  if (!design) throw new TrackingWriteError('埋点需求不存在', 404);
  assertParamPermission(design, actorId, (await loadPermissionConfig(credentials, fetchImpl)).admins);
  const evtId = text(body.evtId) || text(design.record.evt_id);
  if (!evtId || !text(body.paramName)) throw new TrackingWriteError('evt_id 和参数名不能为空', 400);
  const fields = toParamRecord(ref.source, ref.rawId, evtId, text(design.record['版本']) || '1.0.0', body);
  const [created] = await createBitableRecords(credentials, paramKey(ref.source), [fields], fetchImpl);
  if (!created) throw new Error('Feishu Base did not return the created parameter');
  await syncEnumDictionary(credentials, ref.source, 'design', [{ id: created.id, record: fields }], fetchImpl);
  return { success: true, recordId: scopedId(ref.source, created.id), item: toParamDetail(ref.source, created.id, fields) };
}

export async function updateTrackingParam(
  credentials: WorkerCredentials,
  paramRecordId: string,
  body: UpdateParamRequest,
  actorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<UpdateParamResponse> {
  const ref = parseScopedId(paramRecordId);
  const param = await getBitableRecord(credentials, paramKey(ref.source), ref.rawId, fetchImpl);
  if (!param) throw new TrackingWriteError('埋点参数不存在', 404);
  const design = await findDesignForParam(credentials, ref.source, param, fetchImpl);
  assertParamPermission(design, actorId, (await loadPermissionConfig(credentials, fetchImpl)).admins);
  const patch = toParamPatch(ref.source, body.fields || {});
  if (Object.keys(patch).length) await updateBitableRecords(credentials, paramKey(ref.source), [{ id: ref.rawId, record: patch }], fetchImpl);
  const next = { ...param.record, ...patch };
  if (Object.keys(patch).length) await syncEnumDictionary(credentials, ref.source, 'design', [{ id: ref.rawId, record: next }], fetchImpl);
  return { success: true, recordId: paramRecordId, item: toParamDetail(ref.source, ref.rawId, next) };
}

export async function deleteTrackingParam(
  credentials: WorkerCredentials,
  paramRecordId: string,
  actorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<DeleteParamResponse> {
  const ref = parseScopedId(paramRecordId);
  const param = await getBitableRecord(credentials, paramKey(ref.source), ref.rawId, fetchImpl);
  if (!param) throw new TrackingWriteError('埋点参数不存在', 404);
  assertParamPermission(await findDesignForParam(credentials, ref.source, param, fetchImpl), actorId, (await loadPermissionConfig(credentials, fetchImpl)).admins);
  await deleteBitableRecords(credentials, paramKey(ref.source), [ref.rawId], fetchImpl);
  return { success: true };
}

export async function batchDeleteTrackingParams(
  credentials: WorkerCredentials,
  recordId: string,
  body: BatchDeleteParamsRequest,
  actorId: string,
  fetchImpl: FetchLike = fetch,
): Promise<BatchDeleteParamsResponse> {
  const ref = parseScopedId(recordId);
  const design = await getBitableRecord(credentials, workbenchKey(ref.source), ref.rawId, fetchImpl);
  if (!design) throw new TrackingWriteError('埋点需求不存在', 404);
  assertParamPermission(design, actorId, (await loadPermissionConfig(credentials, fetchImpl)).admins);
  const ids = unique((body.paramRecordIds || []).map((id) => {
    const paramRef = parseScopedId(id);
    if (paramRef.source !== ref.source) throw new TrackingWriteError('参数分库与当前埋点分库不一致', 400);
    return paramRef.rawId;
  }));
  if (!ids.length) return { success: true, deletedCount: 0 };
  const allowed = new Set((await listParams(credentials, ref.source, ref.rawId, text(design.record.evt_id), fetchImpl)).map((item) => item.id));
  if (ids.some((id) => !allowed.has(id))) throw new TrackingWriteError('部分参数不属于当前埋点设计，已取消删除', 400);
  await deleteBitableRecords(credentials, paramKey(ref.source), ids, fetchImpl);
  return { success: true, deletedCount: ids.length };
}

export function recordPermissions(record: Record<string, unknown>, actorId: string, configuredAdmins: string[] = []): TrackingDetailPermissions {
  const full = (): TrackingDetailPermissions => ({ canEditRequirement: true, canEditDesign: true, canEditReview: true, canEditDev: true, canEditAcceptance: true, canEditLaunch: true, canEditArchive: true, canEditParams: true });
  if (BOOTSTRAP_ADMINS.has(actorId) || configuredAdmins.includes(actorId)) return full();
  const requester = userIds(record['需求提出人']);
  const dataOwner = userIds(record['数据负责人']);
  const devOwner = userIds(record['研发负责人']);
  const acceptor = userIds(record['DS验收人']);
  const isDs = dataOwner.includes(actorId) || acceptor.includes(actorId);
  const isDev = devOwner.includes(actorId);
  return {
    canEditRequirement: isDs || isDev || (requester.includes(actorId) && (text(record['流程阶段']) || '需求录入') === '需求录入'),
    canEditDesign: isDs || isDev,
    canEditReview: isDs || isDev,
    canEditDev: isDev,
    canEditAcceptance: isDs,
    canEditLaunch: isDs,
    canEditArchive: isDs,
    canEditParams: isDs || isDev,
  };
}

function assertRecordUpdatePermission(record: BitableRecord, body: UpdateTrackingRecordRequest, actorId: string, configuredAdmins: string[]): void {
  const permissions = recordPermissions(record.record, actorId, configuredAdmins);
  const required = new Set<PermissionKey>();
  for (const field of Object.keys(body.fields || {})) required.add(field === '流程阶段' ? (STAGE_PERMISSION[body.stageId || ''] || 'canEditDesign') : (FIELD_PERMISSION[field] || STAGE_PERMISSION[body.stageId || ''] || 'canEditDesign'));
  if (body.targetStage) required.add(TARGET_PERMISSION[UI_TO_BASE_STAGE[body.targetStage] || body.targetStage] || STAGE_PERMISSION[body.stageId || ''] || 'canEditDesign');
  if (!actorId || [...required].some((permission) => !permissions[permission])) throw new TrackingWriteError('当前用户无权限更新该节点', 403);
}

function assertParamPermission(record: BitableRecord, actorId: string, configuredAdmins: string[]): void {
  if (!actorId || !recordPermissions(record.record, actorId, configuredAdmins).canEditParams) throw new TrackingWriteError('当前用户无权限维护参数', 403);
}

async function findPermissionRecord(credentials: WorkerCredentials, fetchImpl: FetchLike): Promise<BitableRecord | undefined> {
  return (await listAll(credentials, 'workbench', fetchImpl)).find((item) => text(item.record.evt_id) === PERMISSION_RECORD_EVT_ID);
}

function emptyPermissionConfig(): PermissionConfig {
  return { admins: [], dataScientists: [], developers: [], acceptors: [], viewers: [] };
}

function parsePermissionConfig(value: unknown): PermissionConfig {
  try {
    const parsed = JSON.parse(text(value)) as Partial<PermissionConfig>;
    return {
      admins: unique((parsed.admins || []).map((id) => LEGACY_ADMIN_ID_MAP[text(id)] || text(id))),
      dataScientists: [], developers: [], acceptors: [], viewers: [],
      ...(typeof parsed.updatedAt === 'number' ? { updatedAt: parsed.updatedAt } : {}),
      ...(typeof parsed.updatedBy === 'string' ? { updatedBy: LEGACY_ADMIN_ID_MAP[parsed.updatedBy] || parsed.updatedBy } : {}),
    };
  } catch {
    return emptyPermissionConfig();
  }
}

async function listRelatedRecords(credentials: WorkerCredentials, source: TrackingSource, current: BitableRecord, fetchImpl: FetchLike): Promise<BitableRecord[]> {
  const all = await listAll(credentials, workbenchKey(source), fetchImpl);
  const requestId = text(current.record['需求ID']);
  return all.filter((item) => item.id === current.id || (requestId && text(item.record['需求ID']) === requestId));
}

async function listParams(credentials: WorkerCredentials, source: TrackingSource, designId: string, evtId: string, fetchImpl: FetchLike): Promise<BitableRecord[]> {
  return (await listAll(credentials, paramKey(source), fetchImpl)).filter((item) => {
    const designIds = unique([text(item.record['来源设计记录ID']), ...cellIds(item.record['关联设计'])]);
    return designIds.length ? designIds.includes(designId) : Boolean(evtId) && text(item.record.evt_id) === evtId;
  });
}

async function listAll(credentials: WorkerCredentials, instance: BitableInstanceKey, fetchImpl: FetchLike): Promise<BitableRecord[]> {
  const records: BitableRecord[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await searchBitableRecordPage(credentials, instance, { pageSize: 500, pageToken }, fetchImpl);
    records.push(...result.records);
    if (!result.hasMore || !result.pageToken) return records;
    pageToken = result.pageToken;
  }
  throw new Error('Feishu Base pagination exceeded 20 pages');
}

async function findDesignForParam(credentials: WorkerCredentials, source: TrackingSource, param: BitableRecord, fetchImpl: FetchLike): Promise<BitableRecord> {
  for (const id of unique([text(param.record['来源设计记录ID']), ...cellIds(param.record['关联设计'])])) {
    const record = await getBitableRecord(credentials, workbenchKey(source), id, fetchImpl);
    if (record) return record;
  }
  const evtId = text(param.record.evt_id);
  const record = (await listAll(credentials, workbenchKey(source), fetchImpl)).find((item) => text(item.record.evt_id) === evtId);
  if (!record) throw new TrackingWriteError('找不到参数对应的埋点设计', 404);
  return record;
}

async function notifyTransition(credentials: WorkerCredentials, source: TrackingSource, recordId: string, previous: Record<string, unknown>, next: Record<string, unknown>, body: UpdateTrackingRecordRequest, related: BitableRecord[], fetchImpl: FetchLike) {
  const targetBase = body.targetStage ? (UI_TO_BASE_STAGE[body.targetStage] || body.targetStage) : '';
  const plans: Record<string, { toStage: string; targetStageId: string; actionText: string; fields: string[] }> = {
    埋点设计: { toStage: '埋点设计', targetStageId: 'design', actionText: '需求录入已完成，请开始埋点设计。', fields: ['数据负责人'] },
    评审通过: { toStage: '埋点开发', targetStageId: 'dev', actionText: '埋点评审已通过，请开始埋点开发。', fields: ['研发负责人'] },
    数据验收: { toStage: '埋点验收', targetStageId: 'acceptance', actionText: '埋点开发已完成，请进行埋点验收。', fields: ['数据负责人', 'DS验收人'] },
    上线监控: { toStage: '埋点上线', targetStageId: 'launch', actionText: '埋点验收已通过，请关注上线监控。', fields: ['需求提出人', '数据负责人', '研发负责人', 'DS验收人'] },
    稳定归档: { toStage: '归档', targetStageId: 'archive', actionText: '埋点已上线，上线监控已完成，请关注上线结果与归档状态。', fields: ['需求提出人', '数据负责人', '研发负责人', 'DS验收人'] },
  };
  const designReview = body.stageId === 'design' && text(next['评审状态']) === '评审中' && text(previous['评审状态']) !== '评审中';
  const plan = designReview ? { toStage: '埋点评审', targetStageId: 'review', actionText: '埋点设计已提交评审，请完成评审确认。', fields: ['数据负责人', '研发负责人'] } : plans[targetBase];
  if (!plan) return undefined;
  const snapshot = parseSnapshot(next['通知身份快照']);
  const recipients: WorkflowNotificationRecipient[] = plan.fields.flatMap((field) => {
    const users = snapshot[field]?.length ? snapshot[field] : userRefs(next[field]);
    return users.map((user) => ({ ...user, role: field }));
  });
  return sendWorkflowNotification(credentials, {
    source, recordId, requestId: text(next['需求ID']) || undefined, requestName: text(next['需求名称']) || text(next['事件中文名']),
    fromStage: uiStage(text(previous['流程阶段']), text(previous['评审状态'])), toStage: plan.toStage,
    actionText: plan.actionText, targetStageId: plan.targetStageId, priority: text(next['优先级']), platform: text(next['端']),
    eventIds: unique(related.map((item) => text(item.record.evt_id))), eventNames: unique(related.map((item) => text(item.record['事件中文名']))), recipients,
  }, fetchImpl);
}

interface OfficialSyncCache {
  events?: BitableRecord[];
  params?: BitableRecord[];
  enums?: BitableRecord[];
}

async function syncOfficialLibrary(
  credentials: WorkerCredentials,
  source: TrackingSource,
  designId: string,
  record: Record<string, unknown>,
  fetchImpl: FetchLike,
  cache: OfficialSyncCache = {},
): Promise<void> {
  const stage = text(record['流程阶段']);
  const officialStatus = text(record['正式状态']);
  const publishStatus = text(record['发布状态']);
  const monitorStatus = text(record['上线监控状态']);
  const evtId = text(record.evt_id);
  if (!evtId) return;
  const shouldDeprecate = stage === '已废弃' || (stage === '稳定归档' && (officialStatus === '已废弃' || normalizeChangeType(record['变更类型']) === '废弃'));
  const shouldPublish = officialStatus === '已上线' || stage === '稳定归档' || (stage === '上线监控' && publishStatus === '发布成功' && ['通过', '豁免'].includes(monitorStatus));
  if (!shouldDeprecate && !shouldPublish) return;

  const officialEvents = cache.events || (cache.events = await listAll(credentials, queryLibraryKey(source), fetchImpl));
  const existingEvent = officialEvents.find((item) => text(item.record.evt_id).toLocaleLowerCase() === evtId.toLocaleLowerCase());
  if (shouldDeprecate) {
    await syncDeprecatedLibrary(credentials, source, designId, record, existingEvent, fetchImpl);
    return;
  }
  const eventFields: Record<string, unknown> = {
    evt_id: evtId,
    事件中文名: text(record['事件中文名']),
    端: platformCell(record['端'], source),
    上线版本: text(record['版本'] || record['最低版本']) || '1.0.0',
    ...(text(record['最低版本'] || record['版本']) ? { 最低版本: text(record['最低版本'] || record['版本']) } : {}),
    状态: officialStatus && officialStatus !== '待开发' ? officialStatus : '已上线',
    生命周期状态: stage || '上线监控',
    参数明细入口: source === 'web'
      ? 'https://bcn0tgplxp2e.feishu.cn/base/EX4RbTvp9agYNws6PIHcKD20nqf?table=tblNAMKr5S38iXJQ'
      : 'https://bcn0tgplxp2e.feishu.cn/base/Kgy0b4bvmaJSK8sjQDscUrNJnOf?table=tblEYv9lGZeenbT2',
    事件定义: text(record['事件定义']), 触发时机: text(record['触发时机']), '指标/使用场景': text(record['指标/使用场景']),
    ...(text(record['优先级']) ? { 优先级: text(record['优先级']) } : {}),
    ...(record['数据负责人'] ? { 数据负责人: record['数据负责人'] } : {}),
    ...(record['研发负责人'] ? { 研发负责人: record['研发负责人'] } : {}),
    ...(record['DS验收人'] ? { DS验收人: record['DS验收人'] } : {}),
    ...(record['稳定归档时间'] ? { 稳定归档时间: record['稳定归档时间'] } : {}),
    ...(text(record['处理方']) ? { 处理方: text(record['处理方']) } : {}),
    ...(text(record['公共属性要求']) ? { 公共属性要求: text(record['公共属性要求']) } : {}),
    源事件记录ID: designId,
  };
  let officialEventId = existingEvent?.id;
  if (!existingEvent) {
    const [created] = await createBitableRecords(credentials, queryLibraryKey(source), [eventFields], fetchImpl);
    officialEventId = created?.id;
    if (created?.id) cache.events.push({ id: created.id, record: { ...eventFields, ...created.record } });
  }
  if (!officialEventId) return;

  const designParams = (await listParams(credentials, source, designId, evtId, fetchImpl)).filter((item) => !['废弃', '已废弃'].includes(text(item.record['参数状态'])) && !['废弃', '删除'].includes(text(item.record['变更类型'])));
  const officialEventName = text(existingEvent?.record['事件中文名']) || text(eventFields['事件中文名']);
  const officialParams = cache.params || (cache.params = await listAll(credentials, officialParamKey(source), fetchImpl));
  const existingByKey = new Map(officialParams.map((item) => [text(item.record['参数主键']).toLocaleLowerCase(), item]));
  const updates: Array<{ id: string; record: Record<string, unknown> }> = [];
  const creates: Array<Record<string, unknown>> = [];
  const enumSyncTargets: BitableRecord[] = [];
  for (const designParam of designParams) {
    const paramName = text(designParam.record['参数名']);
    if (!paramName) continue;
    const paramKeyValue = `${evtId}.${paramName}`;
    const fields = {
      参数主键: paramKeyValue, evt_id: evtId, 事件中文名: officialEventName, 参数名: paramName,
      数据类型: normalizeParamType(designParam.record['数据类型']), 必传规则: normalizeRequiredRule(designParam.record['必传规则']),
      条件说明: text(designParam.record['条件说明']), '枚举/取值范围': text(designParam.record['枚举/取值范围']), 参数定义: text(designParam.record['参数定义']),
      版本: text(record['版本'] || record['最低版本'] || designParam.record['版本']) || '1.0.0', 参数状态: '正式',
      事件状态: text(eventFields['状态']), 来源表: '埋点设计库', 关联事件: [officialEventId],
      [source === 'web' ? 'Web适用性' : 'App适用性']: normalizeApplicability(designParam.record[source === 'web' ? 'Web适用性' : 'App适用性'], source),
      备注: text(designParam.record['备注']) || (text(designParam.record['默认值/示例']) ? `默认值/示例：${text(designParam.record['默认值/示例'])}` : ''),
    };
    const existing = existingByKey.get(paramKeyValue.toLocaleLowerCase());
    if (existing) {
      const appendOnly = mergeOfficialParamRecord(existing.record, fields);
      if (Object.keys(appendOnly.patch).length) updates.push({ id: existing.id, record: appendOnly.patch });
      existing.record = appendOnly.effectiveRecord;
      enumSyncTargets.push({ id: existing.id, record: appendOnly.effectiveRecord });
    }
    else creates.push(fields);
  }
  if (updates.length) await updateBitableRecords(credentials, officialParamKey(source), updates, fetchImpl);
  if (creates.length) {
    const createdParams = await createBitableRecords(credentials, officialParamKey(source), creates, fetchImpl);
    assertCreatedCount(createdParams, creates, '正式埋点参数');
    const createdTargets = createdParams.map((item, index) => ({ id: item.id, record: { ...creates[index], ...item.record } }));
    cache.params.push(...createdTargets);
    enumSyncTargets.push(...createdTargets);
  }
  await syncEnumDictionary(credentials, source, 'official', enumSyncTargets, fetchImpl, cache);
}

async function syncDeprecatedLibrary(
  credentials: WorkerCredentials,
  source: TrackingSource,
  designId: string,
  designRecord: Record<string, unknown>,
  officialEvent: BitableRecord | undefined,
  fetchImpl: FetchLike,
): Promise<void> {
  const evtId = text(designRecord.evt_id);
  const officialParams = (await listAll(credentials, officialParamKey(source), fetchImpl)).filter((item) => {
    const linked = cellIds(item.record['关联事件']);
    return (officialEvent && linked.includes(officialEvent.id)) || text(item.record.evt_id).toLocaleLowerCase() === evtId.toLocaleLowerCase();
  });
  const designParams = await listParams(credentials, source, designId, evtId, fetchImpl);
  const deprecatedEvent = toDeprecatedEventRecord(source, designId, designRecord, officialEvent);
  await upsertByKey(credentials, deprecatedEventKey(source), '废弃主键', [deprecatedEvent], fetchImpl);

  const officialByKey = new Map(officialParams.map((item) => [officialParamIdentity(item.record).toLocaleLowerCase(), item]));
  const deprecatedParams = new Map<string, Record<string, unknown>>();
  for (const item of officialParams) {
    const record = toDeprecatedParamRecord(designRecord, item, '正式参数明细', undefined, item.id);
    if (record) deprecatedParams.set(text(record['废弃参数主键']).toLocaleLowerCase(), record);
  }
  for (const item of designParams) {
    const official = officialByKey.get(designParamIdentity(item.record).toLocaleLowerCase());
    const record = toDeprecatedParamRecord(designRecord, item, '设计参数明细', item.id, official?.id);
    if (record) deprecatedParams.set(text(record['废弃参数主键']).toLocaleLowerCase(), record);
  }
  await upsertByKey(credentials, deprecatedParamKey(source), '废弃参数主键', [...deprecatedParams.values()], fetchImpl);

  for (let index = 0; index < officialParams.length; index += 500) {
    await deleteBitableRecords(credentials, officialParamKey(source), officialParams.slice(index, index + 500).map((item) => item.id), fetchImpl);
  }
  if (officialEvent) await deleteBitableRecords(credentials, queryLibraryKey(source), [officialEvent.id], fetchImpl);
}

async function upsertByKey(
  credentials: WorkerCredentials,
  instance: BitableInstanceKey,
  keyField: string,
  records: Record<string, unknown>[],
  fetchImpl: FetchLike,
): Promise<void> {
  if (!records.length) return;
  const existing = await listAll(credentials, instance, fetchImpl);
  const existingByKey = new Map<string, BitableRecord>(
    existing
      .map((item): [string, BitableRecord] => [text(item.record[keyField]).toLocaleLowerCase(), item])
      .filter(([key]) => Boolean(key)),
  );
  const updates: Array<{ id: string; record: Record<string, unknown> }> = [];
  const creates: Record<string, unknown>[] = [];
  for (const record of records) {
    const matched = existingByKey.get(text(record[keyField]).toLocaleLowerCase());
    if (matched) updates.push({ id: matched.id, record });
    else creates.push(record);
  }
  for (let index = 0; index < updates.length; index += 500) await updateBitableRecords(credentials, instance, updates.slice(index, index + 500), fetchImpl);
  for (let index = 0; index < creates.length; index += 500) await createBitableRecords(credentials, instance, creates.slice(index, index + 500), fetchImpl);
}

function toDeprecatedEventRecord(
  source: TrackingSource,
  designId: string,
  record: Record<string, unknown>,
  officialEvent?: BitableRecord,
): Record<string, unknown> {
  const evtId = text(record.evt_id);
  return {
    废弃主键: evtId, evt_id: evtId, 事件中文名: text(record['事件中文名']), 需求ID: text(record['需求ID']),
    需求名称: text(record['需求名称']), 端: platformCell(record['端'], source), 版本: text(record['版本'] || record['最低版本']) || '1.0.0',
    废弃原因: deprecatedReason(record, '事件标记为废弃'), 废弃时间: timestamp(record['稳定归档时间']) || Date.now(),
    原流程阶段: text(record['流程阶段']), 原正式状态: text(officialEvent?.record['状态'] || record['正式状态']) || '已废弃',
    原工作台记录ID: designId, 原正式记录ID: officialEvent?.id || '', 事件定义: text(record['事件定义']),
    触发时机: text(record['触发时机']), '指标/使用场景': text(record['指标/使用场景']),
  };
}

function toDeprecatedParamRecord(
  designRecord: Record<string, unknown>,
  param: BitableRecord,
  sourceTable: '设计参数明细' | '正式参数明细',
  designParamId?: string,
  officialParamId?: string,
): Record<string, unknown> | null {
  const evtId = text(param.record.evt_id || designRecord.evt_id);
  const paramName = text(param.record['参数名']);
  const identity = officialParamIdentity(param.record) || `${evtId}.${paramName}`;
  if (!identity || !evtId || !paramName) return null;
  const example = text(param.record['默认值/示例']);
  return {
    废弃参数主键: identity, evt_id: evtId, 事件中文名: text(param.record['事件中文名'] || designRecord['事件中文名']), 参数名: paramName,
    数据类型: normalizeParamType(param.record['数据类型']), 必传规则: normalizeRequiredRule(param.record['必传规则']),
    条件说明: text(param.record['条件说明']), '枚举/取值范围': text(param.record['枚举/取值范围']), 参数定义: text(param.record['参数定义']),
    版本: text(param.record['版本'] || designRecord['版本'] || designRecord['最低版本']) || '1.0.0', 参数状态: '已废弃', 事件状态: '已废弃',
    废弃原因: deprecatedReason(designRecord, sourceTable === '正式参数明细' ? '事件标记为废弃' : '参数标记为废弃'),
    废弃时间: timestamp(designRecord['稳定归档时间']) || Date.now(), 原设计参数ID: designParamId || '', 原正式参数ID: officialParamId || '',
    来源表: sourceTable, 备注: text(param.record['备注']) || (example ? `默认值/示例：${example}` : ''),
  };
}

function deprecatedReason(record: Record<string, unknown>, fallback: string): string {
  return text(record['废弃原因'] || record['发布错误'] || record['发布门禁失败原因'] || record['上线监控结论'] || record['评审意见']) || fallback;
}

function officialParamIdentity(record: Record<string, unknown>): string {
  return text(record['参数主键'] || record['设计参数主键']) || `${text(record.evt_id)}.${text(record['参数名'])}`;
}

function designParamIdentity(record: Record<string, unknown>): string {
  return text(record['设计参数主键']) || `${text(record.evt_id)}.${text(record['参数名'])}`;
}

type EnumLinkMode = 'design' | 'official';

function mergeOfficialParamRecord(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): { patch: Record<string, unknown>; effectiveRecord: Record<string, unknown> } {
  const existingEnumRange = text(existing['枚举/取值范围']);
  const mergedEnumRange = mergeEnumRangeText(existingEnumRange, text(incoming['枚举/取值范围']));
  const patch: Record<string, unknown> = {};
  if (mergedEnumRange !== existingEnumRange) patch['枚举/取值范围'] = mergedEnumRange;
  return { patch, effectiveRecord: { ...existing, ...patch } };
}

function mergeEnumRangeText(existingText: string, incomingText: string): string {
  const items = [...splitEnumRange(existingText), ...splitEnumRange(incomingText)];
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = enumRangeItemKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  if (!merged.length) return incomingText || existingText || '';
  return merged.join(enumRangeDelimiter(existingText || incomingText));
}

function splitEnumRange(value: string): string[] {
  const normalized = value.replace(/\r/g, '\n').trim();
  if (!normalized) return [];
  return normalized.includes('\n')
    ? normalized.split('\n')
    : normalized.includes('//')
      ? [normalized]
      : normalized.split(/[,，、/|]+/);
}

function enumRangeItemKey(item: string): string {
  const match = item.trim().match(/^(.+?)\s*(?:\/\/|#|：|:)\s*(.+)$/);
  return text(match?.[1] || item).toLocaleLowerCase();
}

function enumRangeDelimiter(value: string): string {
  if (value.includes('\n') || value.includes('//')) return '\n';
  if (value.includes('，')) return '，';
  if (value.includes(',')) return ', ';
  return '\n';
}

async function syncEnumDictionary(
  credentials: WorkerCredentials,
  source: TrackingSource,
  mode: EnumLinkMode,
  targets: BitableRecord[],
  fetchImpl: FetchLike,
  cache: OfficialSyncCache = {},
): Promise<void> {
  const prepared = targets.map((target) => ({
    ...target,
    evtId: text(target.record.evt_id),
    paramName: text(target.record['参数名']),
    enumText: text(target.record['枚举/取值范围']),
    previousLinkedIds: cellIds(target.record['枚举字典']),
  })).filter((target) => target.evtId && target.paramName && (target.enumText || target.previousLinkedIds.length));
  if (!prepared.length) return;

  const instance = enumDictionaryKey(source);
  const paramInstance = mode === 'design' ? paramKey(source) : officialParamKey(source);
  const linkedField = mode === 'design' ? '关联设计参数' : '关联正式参数';
  const existingRecords = cache.enums || (cache.enums = await listAll(credentials, instance, fetchImpl));
  const existingByKey = new Map<string, BitableRecord>(
    existingRecords
      .map((record): [string, BitableRecord] => [text(record.record['枚举主键']).toLocaleLowerCase(), record])
      .filter(([key]) => Boolean(key)),
  );
  const updates = new Map<string, Record<string, unknown>>();
  const creates = new Map<string, Record<string, unknown>>();
  const pendingParamIds = new Map<string, string[]>();
  const linkedByParam = new Map<string, string[]>();

  for (const target of prepared) {
    const removed = isRemovedParam(mode, target.record);
    const status = removed ? '已废弃' : mode === 'official' ? '正式' : '草稿';
    const version = text(target.record['版本']) || '1.0.0';
    const entries = parseEnumDictionaryEntries(target.evtId, target.paramName, target.enumText);
    const linkedIds: string[] = entries.length ? [] : [...target.previousLinkedIds];

    for (const entry of entries) {
      const key = entry.key.toLocaleLowerCase();
      const existing = existingByKey.get(key);
      if (existing) {
        const previousLinks = cellIds(existing.record[linkedField]);
        const nextLinks = unique([...previousLinks, target.id]);
        const patch = mode === 'official' && !removed
          ? { [linkedField]: nextLinks }
          : {
              evt_id: target.evtId, 参数名: target.paramName, 枚举值: entry.value,
              枚举中文名: entry.label, 枚举定义: entry.definition, 枚举状态: status,
              首次版本: text(existing.record['首次版本']) || version,
              ...(removed ? { 下线版本: version } : {}), [linkedField]: nextLinks,
            };
        updates.set(existing.id, { ...(updates.get(existing.id) || {}), ...patch });
        existing.record = { ...existing.record, ...patch };
        linkedIds.push(existing.id);
      } else {
        const planned = creates.get(key);
        creates.set(key, {
          ...(planned || {}), 枚举主键: entry.key, evt_id: target.evtId, 参数名: target.paramName,
          枚举值: entry.value, 枚举中文名: entry.label, 枚举定义: entry.definition,
          枚举状态: status, 首次版本: version, ...(removed ? { 下线版本: version } : {}),
          [linkedField]: unique([...cellIds(planned?.[linkedField]), target.id]),
        });
        pendingParamIds.set(key, unique([...(pendingParamIds.get(key) || []), target.id]));
      }
    }

    if (removed) {
      for (const staleId of target.previousLinkedIds.filter((id) => !linkedIds.includes(id))) {
        updates.set(staleId, { ...(updates.get(staleId) || {}), 枚举状态: '已废弃', 下线版本: version });
      }
    }
    linkedByParam.set(target.id, linkedIds);
  }

  const updateEntries = [...updates].map(([id, record]) => ({ id, record }));
  for (let index = 0; index < updateEntries.length; index += 500) {
    await updateBitableRecords(credentials, instance, updateEntries.slice(index, index + 500), fetchImpl);
  }
  const createEntries = [...creates.entries()];
  for (let index = 0; index < createEntries.length; index += 500) {
    const chunk = createEntries.slice(index, index + 500);
    const created = await createBitableRecords(credentials, instance, chunk.map(([, record]) => record), fetchImpl);
    assertCreatedCount(created, chunk, '枚举字典');
    created.forEach((record, offset) => {
      for (const paramId of pendingParamIds.get(chunk[offset][0]) || []) {
        linkedByParam.set(paramId, [...(linkedByParam.get(paramId) || []), record.id]);
      }
      cache.enums?.push({ id: record.id, record: { ...chunk[offset][1], ...record.record } });
    });
  }

  const paramUpdates = prepared.flatMap((target) => {
    const previousIds = unique(target.previousLinkedIds);
    const nextIds = unique(linkedByParam.get(target.id) || []);
    return previousIds.length === nextIds.length && previousIds.every((id, index) => id === nextIds[index])
      ? []
      : [{ id: target.id, record: { 枚举字典: nextIds } }];
  });
  for (let index = 0; index < paramUpdates.length; index += 500) {
    await updateBitableRecords(credentials, paramInstance, paramUpdates.slice(index, index + 500), fetchImpl);
  }
}

function parseEnumDictionaryEntries(evtId: string, paramName: string, enumRange: string): Array<{ key: string; value: string; label: string; definition: string }> {
  const normalized = enumRange.replace(/\r/g, '\n').trim();
  if (!normalized) return [];
  const rawItems = normalized.includes('\n') ? normalized.split('\n') : normalized.includes('//') ? [normalized] : normalized.split(/[,，、/|]+/);
  return unique(rawItems.map((item) => item.trim())).flatMap((item) => {
    const match = item.match(/^(.+?)\s*(?:\/\/|#|：|:)\s*(.+)$/);
    const value = text(match?.[1] || item);
    const label = text(match?.[2]);
    if (!value || ['-', '—', '无', '暂无', '待确认', '无特殊参数'].includes(value) || /^\.{2,}$/.test(value) || /^…+$/.test(value)) return [];
    return [{ key: `${evtId}.${paramName}.${value}`, value, label, definition: label }];
  });
}

function isRemovedParam(mode: EnumLinkMode, record: Record<string, unknown>): boolean {
  return ['废弃', '已废弃'].includes(text(record['参数状态'])) || (mode === 'design' && ['删除', '废弃'].includes(text(record['变更类型'])));
}

function assertCreatedCount<T, U>(created: T[], expected: U[], label: string): void {
  if (created.length !== expected.length) throw new Error(`${label}批量新增返回数量异常`);
}

function toParamRecord(source: TrackingSource, designId: string, fallbackEvtId: string, version: string, body: CreateParamRequest): Record<string, unknown> {
  const evtId = text(body.evtId) || fallbackEvtId;
  return {
    evt_id: evtId, 参数名: text(body.paramName), 数据类型: normalizeParamType(body.paramType),
    必传规则: normalizeRequiredRule(body.requiredRule, body.required), 条件说明: text(body.triggerCondition),
    '枚举/取值范围': text(body.enumRange), 参数定义: text(body.definition), '默认值/示例': text(body.example || body.defaultValue),
    [source === 'web' ? 'Web适用性' : 'App适用性']: normalizeApplicability(body.platform, source), 参数状态: normalizeParamStatus(body.status),
    版本: version || '1.0.0', 变更类型: normalizeChangeType(body.changeType), 来源设计记录ID: designId, 关联设计: [designId],
  };
}

function toParamPatch(source: TrackingSource, fields: Record<string, unknown>): Record<string, unknown> {
  const apiNames = ['evtId', 'paramName', 'paramType', 'required', 'requiredRule', 'triggerCondition', 'enumRange', 'definition', 'defaultValue', 'example', 'platform', 'status', 'changeType'];
  if (!apiNames.some((name) => name in fields)) return { ...fields };
  const value = fields as Partial<CreateParamRequest>;
  const patch: Record<string, unknown> = {};
  if (value.evtId !== undefined) patch.evt_id = text(value.evtId);
  if (value.paramName !== undefined) patch['参数名'] = text(value.paramName);
  if (value.paramType !== undefined) patch['数据类型'] = normalizeParamType(value.paramType);
  if (value.required !== undefined || value.requiredRule !== undefined) patch['必传规则'] = normalizeRequiredRule(value.requiredRule, value.required);
  if (value.triggerCondition !== undefined) patch['条件说明'] = value.triggerCondition;
  if (value.enumRange !== undefined) patch['枚举/取值范围'] = value.enumRange;
  if (value.definition !== undefined) patch['参数定义'] = value.definition;
  if (value.example !== undefined || value.defaultValue !== undefined) patch['默认值/示例'] = value.example || value.defaultValue || '';
  if (value.platform !== undefined) patch[source === 'web' ? 'Web适用性' : 'App适用性'] = normalizeApplicability(value.platform, source);
  if (value.status !== undefined) patch['参数状态'] = normalizeParamStatus(value.status);
  if (value.changeType !== undefined) patch['变更类型'] = normalizeChangeType(value.changeType);
  return patch;
}

function toParamDetail(source: TrackingSource, id: string, record: Record<string, unknown>): ParamDetail {
  const rule = text(record['必传规则']);
  const evtId = text(record.evt_id);
  const paramName = text(record['参数名']);
  return { recordId: scopedId(source, id), paramKey: text(record['设计参数主键']) || `${evtId}.${paramName}`, evtId, paramName,
    paramType: text(record['数据类型']) || 'STRING', required: rule === '必传' || rule === '条件必传', requiredRule: normalizeRequiredRule(rule),
    triggerCondition: text(record['条件说明']), enumRange: text(record['枚举/取值范围']), definition: text(record['参数定义']),
    defaultValue: text(record['默认值/示例']), example: text(record['默认值/示例']),
    platform: normalizeApplicability(record[source === 'web' ? 'Web适用性' : 'App适用性'], source), status: text(record['参数状态']) || '草稿',
    version: text(record['版本']), changeType: text(record['变更类型']) || '新增' };
}

function normalizeWorkbenchPatch(patch: Record<string, unknown>, source: TrackingSource): Record<string, unknown> {
  if ('端' in patch) patch['端'] = platformCell(text(patch['端']), source);
  if ('处理方' in patch) patch['处理方'] = normalizeHandler(patch['处理方'], source);
  if ('变更类型' in patch) patch['变更类型'] = normalizeChangeType(text(patch['变更类型']));
  for (const field of ['期望完成日期', 'DS验收时间', '发布时间', '稳定归档时间']) if (field in patch && patch[field]) patch[field] = toDateCell(patch[field]);
  if ('上线监控状态' in patch) patch['上线监控状态'] = normalizeMonitorStatus(text(patch['上线监控状态']));
  return patch;
}

function normalizeProgress(patch: Record<string, unknown>, current: Record<string, unknown>): void {
  const stage = text(patch['流程阶段'] ?? current['流程阶段']) || '需求录入';
  if (stage === '已废弃') return;
  const index = STAGES.indexOf(stage);
  if (index >= STAGES.indexOf('评审通过')) patch['评审状态'] = '已通过';
  if (index >= STAGES.indexOf('数据验收')) patch['埋点开发状态'] = '已开发';
  if (index >= STAGES.indexOf('上线监控') && !['通过', '豁免'].includes(text(patch['DS验收状态'] ?? current['DS验收状态']))) patch['DS验收状态'] = '通过';
  if (index >= STAGES.indexOf('稳定归档')) patch['发布状态'] = '发布成功';
}

function normalizeUsers(value: TrackingUserInput[] | TrackingUserInput | undefined): TrackingUserRef[] {
  return (Array.isArray(value) ? value : value ? [value] : []).flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [{ user_id: item.trim() }] : [];
    const id = text(item.user_id || item.larkUserId);
    return id ? [{ ...item, user_id: id }] : [];
  });
}

async function resolveBaseUsers(
  credentials: WorkerCredentials,
  users: TrackingUserRef[],
  fetchImpl: FetchLike,
  cache: Map<string, Promise<TrackingUserRef>>,
): Promise<TrackingUserRef[]> {
  const resolved = await Promise.all(users.map((user) => {
    const key = [user.user_id, user.larkUserId, user.email, user.name].map(text).join('|').toLocaleLowerCase();
    const pending = cache.get(key);
    if (pending) return pending;
    const next = resolveBaseUser(credentials, user, fetchImpl);
    cache.set(key, next);
    return next;
  }));
  return uniqueUserRefs(resolved);
}

async function resolveBaseUser(
  credentials: WorkerCredentials,
  user: TrackingUserRef,
  fetchImpl: FetchLike,
): Promise<TrackingUserRef> {
  const currentId = text(user.user_id);
  const mappedId = LEGACY_FEISHU_USER_ID_MAP[currentId];
  const email = text(user.email);
  if (!email && mappedId) return { ...user, user_id: mappedId };
  if (currentId && !/^\d+$/.test(currentId) && !currentId.startsWith('ou_') && !email) return user;
  if (email) {
    const matchedByEmail = await getDirectoryUserByEmail(credentials, email, fetchImpl);
    if (matchedByEmail?.user_id) {
      return {
        ...user,
        user_id: matchedByEmail.user_id,
        ...(matchedByEmail.open_id ? { larkUserId: matchedByEmail.open_id } : {}),
        ...(matchedByEmail.email ? { email: matchedByEmail.email } : {}),
        ...(matchedByEmail.name ? { name: matchedByEmail.name } : {}),
      };
    }
  }


  const name = text(user.name);
  if (name) {
    const matchedByName = await resolveDirectoryUserByName(credentials, name, fetchImpl);
    if (matchedByName?.user_id) {
      return {
        ...user,
        user_id: matchedByName.user_id,
        ...(matchedByName.open_id ? { larkUserId: matchedByName.open_id } : {}),
        ...(matchedByName.email ? { email: matchedByName.email } : {}),
        ...(matchedByName.name ? { name: matchedByName.name } : {}),
      };
    }
  }

  throw new TrackingWriteError(`参与人“${name || currentId || '未知用户'}”无法转换为飞书用户，请重新选择`, 400);
}

function uniqueUserRefs(users: TrackingUserRef[]): TrackingUserRef[] {
  const seen = new Set<string>();
  return users.filter((user) => {
    const id = text(user.user_id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function userCells(users: TrackingUserRef[]): Array<{ id: string }> { return unique(users.map((user) => user.user_id)).map((id) => ({ id })); }
function userIds(value: unknown): string[] { return (Array.isArray(value) ? value : value ? [value] : []).flatMap((item) => typeof item === 'string' || typeof item === 'number' ? [String(item)] : item && typeof item === 'object' ? [text((item as Record<string, unknown>).id || (item as Record<string, unknown>).user_id)] : []).filter(Boolean); }
function userRefs(value: unknown): TrackingUserRef[] { return userIds(value).map((user_id) => ({ user_id })); }
function parseSnapshot(value: unknown): Record<string, TrackingUserRef[]> { try { const parsed = JSON.parse(text(value)); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } }
function cellIds(value: unknown): string[] { return (Array.isArray(value) ? value : value ? [value] : []).map((item) => typeof item === 'string' ? item : item && typeof item === 'object' ? text((item as Record<string, unknown>).id) : '').filter(Boolean); }
function parseScopedId(id: string): { source: TrackingSource; rawId: string } { return id.startsWith('web:') ? { source: 'web', rawId: id.slice(4) } : { source: 'app', rawId: id.startsWith('app:') ? id.slice(4) : id }; }
function scopedId(source: TrackingSource, id: string): string { return `${source}:${id}`; }
function workbenchKey(source: TrackingSource): BitableInstanceKey { return source === 'web' ? 'webWorkbench' : 'workbench'; }
function paramKey(source: TrackingSource): BitableInstanceKey { return source === 'web' ? 'webParamDetail' : 'paramDetail'; }
function queryLibraryKey(source: TrackingSource): BitableInstanceKey { return source === 'web' ? 'webQueryLibrary' : 'queryLibrary'; }
function officialParamKey(source: TrackingSource): BitableInstanceKey { return source === 'web' ? 'webOfficialParamDetail' : 'officialParamDetail'; }
function enumDictionaryKey(source: TrackingSource): BitableInstanceKey { return source === 'web' ? 'webEnumDictionary' : 'enumDictionary'; }
function deprecatedEventKey(source: TrackingSource): BitableInstanceKey { return source === 'web' ? 'webDeprecatedEvent' : 'deprecatedEvent'; }
function deprecatedParamKey(source: TrackingSource): BitableInstanceKey { return source === 'web' ? 'webDeprecatedParamDetail' : 'deprecatedParamDetail'; }
function pick(record: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> { return Object.fromEntries(fields.filter((field) => field in record).map((field) => [field, record[field]])); }
function unique(values: string[]): string[] { return [...new Set(values.map((value) => text(value)).filter(Boolean))]; }
function text(value: unknown): string { if (value == null) return ''; if (['string', 'number', 'boolean'].includes(typeof value)) return String(value).trim(); if (Array.isArray(value)) return value.map(text).filter(Boolean).join('、'); if (typeof value === 'object') { const item = value as Record<string, unknown>; return text(item.name || item.text || item.url || item.link || item.id); } return ''; }
function createRequestId(source: TrackingSource): string { return `${source === 'web' ? 'WEB' : 'APP'}_REQ_${Date.now().toString(36).toUpperCase()}_${crypto.randomUUID().slice(0, 8).toUpperCase()}`; }
function isValidTransition(current: string, target: string): boolean { const from = STAGES.indexOf(current); const to = STAGES.indexOf(target); return from >= 0 && to >= from; }
function isFeishuPrdUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'feishu.cn' || url.hostname.endsWith('.feishu.cn')) && /^\/(wiki|docx)\/[A-Za-z0-9_-]+/.test(url.pathname); } catch { return false; } }
function toDateCell(value: unknown): number | unknown { if (typeof value === 'number') return value; const raw = text(value); if (!raw) return value; const timestamp = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00+08:00` : raw); return Number.isFinite(timestamp) ? timestamp : value; }
function platformCell(value: unknown, source: TrackingSource): string[] { if (source === 'web') return ['Web']; const raw = text(value); if (!raw) return ['iOS', 'Android']; return unique(raw.split(/[、,，/]/)); }
function normalizeHandler(value: unknown, source: TrackingSource): string { const raw = text(value); const allowed = source === 'web' ? ['前端', '服务端', '前端/服务端'] : ['客户端', '客户端/服务端']; return allowed.includes(raw) ? raw : allowed[0]; }
function normalizeChangeType(value: unknown): string { const raw = ({ 删除: '废弃', 不变: '修改', 仅开发校验: '仅校验' } as Record<string, string>)[text(value)] || text(value); return ['新增', '修改', '废弃', '口径调整', '仅校验'].includes(raw) ? raw : '新增'; }
function normalizeParamType(value: unknown): string { const raw = text(value).toUpperCase(); return ({ TEXT: 'STRING', FLOAT: 'NUMBER', DOUBLE: 'NUMBER', INT: 'INTEGER', BOOLEAN: 'BOOL' } as Record<string, string>)[raw] || (['STRING', 'NUMBER', 'INTEGER', 'BOOL', 'ARRAY', 'OBJECT', 'UNKNOWN'].includes(raw) ? raw : 'STRING'); }
function normalizeRequiredRule(value: unknown, required = false): string { const raw = text(value); return ['必传', '非必传', '条件必传'].includes(raw) ? raw : required ? '必传' : '非必传'; }
function normalizeParamStatus(value: unknown): string { const raw = text(value); return ['草稿', '评审中', '已通过', '已发布', '待补定义', '废弃'].includes(raw) ? raw : '草稿'; }
function normalizeApplicability(value: unknown, source: TrackingSource): string { const raw = text(value); if (source === 'web') return raw === '仅Web' || raw === 'Web' || !raw ? 'Web通用' : raw; return ({ App: 'App通用', 仅App: 'App通用', iOS: '仅iOS', Android: '仅Android', 'iOS、Android': 'App通用' } as Record<string, string>)[raw] || raw || 'App通用'; }
function normalizeMonitorStatus(value: string): string { if (value === '豁免') return '通过'; if (value === '异常') return '不通过'; return ['未开始', '通过', '不通过'].includes(value) ? value : '未开始'; }
function workflowFields(stageId?: string): string[] { return ({ requirement: ['流程阶段'], design: ['评审状态'], review: ['流程阶段', '评审状态', '评审意见'], dev: ['流程阶段', '评审状态', '埋点开发状态'], acceptance: ['流程阶段', '评审状态', '埋点开发状态', 'DS验收状态', 'DS验收证据', 'DS验收时间'], launch: ['流程阶段', '发布门禁状态', '发布门禁失败原因', '发布状态', '发布错误', '上线监控状态', '上线监控结论', '发布时间'], archive: ['流程阶段', '正式状态', '稳定归档时间'] } as Record<string, string[]>)[stageId || ''] || []; }
function uiStage(stage: string, review: string): string { if (stage === '埋点设计' && review && review !== '草稿') return '埋点评审'; return ({ 需求录入: '埋点提需', 埋点设计: '埋点设计', 评审通过: '埋点开发', 埋点开发: '埋点开发', 数据验收: '埋点验收', 上线监控: '埋点上线', 稳定归档: '归档', 已废弃: '归档' } as Record<string, string>)[stage] || stage; }
function timestamp(value: unknown): number { if (typeof value === 'number') return value; const parsed = Date.parse(text(value)); return Number.isFinite(parsed) ? parsed : 0; }
function hasOfficialFootprint(record: Record<string, unknown>): boolean { return ['稳定归档', '已废弃'].includes(text(record['流程阶段'])) || ['已上线', '已废弃'].includes(text(record['正式状态'])) || text(record['发布状态']) === '发布成功'; }
