// 埋点工作台 API 类型定义

export type TrackingSource = 'app' | 'web';
export type TrackingSourceFilter = TrackingSource | 'all';

export interface TrackingUserRef {
  user_id: string;
  larkUserId?: string;
  email?: string;
  name?: string;
}

export type TrackingUserInput = string | TrackingUserRef;

export interface TrackingAttachment {
  bucket_id?: string;
  bucketId?: string;
  file_path?: string;
  filePath?: string;
  url?: string;
  download_url?: string;
  downloadUrl?: string;
  file_token?: string;
  fileToken?: string;
  token?: string;
  tmp_url?: string;
  thumbnail_url?: string;
  link?: string;
  name?: string;
  fileName?: string;
  size?: number;
  [key: string]: unknown;
}

export interface ResolveUiImagePreviewRequest {
  attachment: TrackingAttachment;
}

export interface ResolveUiImagePreviewResponse {
  url: string;
  filePath?: string;
  source?: 'direct' | 'storage_path' | 'storage_name';
  reason?: 'NO_PREVIEW_SOURCE' | 'STORAGE_LOOKUP_FAILED';
}

// 阶段统计
export interface StageStat {
  stage: string;
  count: number;
}

export interface GetStageStatsParams {
  source?: TrackingSourceFilter;
}

export interface GetStageStatsResponse {
  items: StageStat[];
}

// 我的待办
export interface TodoItem {
  recordId: string;
  source: TrackingSource;
  requestId?: string;
  requestName?: string;
  evtId: string;
  eventIds: string[];
  eventName: string;
  eventNames: string[];
  eventCount: number;
  stage: string;
  targetStage?: string;
  todoRole?: string;
  priority: string;
  platform: string;
}

export interface GetMyTodosParams {
  source?: TrackingSourceFilter;
  actorId?: string;
  actorLarkId?: string;
}

export interface GetMyTodosResponse {
  items: TodoItem[];
}

// 需求列表
export interface TrackingRecord {
  recordId: string;
  source: TrackingSource;
  requestId?: string;
  requestName?: string;
  evtId: string;
  eventIds: string[];
  eventName: string;
  eventNames: string[];
  eventCount: number;
  stage: string;
  uiStage: string;
  priority: string;
  platform: string;
  requester: string[];
  requesterIds: string[];
  dataOwner: string[];
  dataOwnerIds: string[];
  devOwner: string[];
  devOwnerIds: string[];
  expectedCompletionDate?: string;
  updatedAt: number;
}

export interface RelatedTrackingEvent {
  recordId: string;
  source: TrackingSource;
  evtId: string;
  eventName: string;
  stage: string;
  uiStage: string;
  priority: string;
  platform: string;
  isCurrent: boolean;
  detail?: TrackingDetailSnapshot;
}

export interface GetTrackingRecordsParams {
  source?: TrackingSourceFilter;
  keyword?: string;
  stage?: string;
  priority?: string;
  platform?: string;
  owner?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface GetTrackingRecordsResponse {
  items: TrackingRecord[];
  hasMore: boolean;
  pageToken?: string;
  total: number;
}

export interface GetWorkbenchDashboardParams extends GetTrackingRecordsParams {
  actorId?: string;
  actorLarkId?: string;
  todoLimit?: number;
}

export interface GetWorkbenchDashboardResponse extends GetTrackingRecordsResponse {
  stats: StageStat[];
  todos: TodoItem[];
}

export interface CreateTrackingRecordRequest {
  source: TrackingSource;
  evtId?: string;
  requestName?: string;
  eventName: string;
  requirementBackground?: string;
  requirementLink?: string;
  metricScenario?: string;
  expectedCompletionDate?: string;
  priority?: string;
  platform?: string;
  eventDefinition?: string;
  triggerTiming?: string;
  handler?: string;
  commonProps?: string;
  version?: string;
  minVersion?: string;
  changeType?: string;
  actorId?: string;
  actorLarkId?: string;
  actorEmail?: string;
  actorName?: string;
  requesterIds?: TrackingUserInput[];
  recorderIds?: TrackingUserInput[];
  dataOwnerIds?: TrackingUserInput[];
  devOwnerIds?: TrackingUserInput[];
  dsAcceptorIds?: TrackingUserInput[];
  initialParams?: CreateParamRequest[];
}

export interface CreateTrackingRecordResponse {
  success: boolean;
  recordId: string;
  currentStage: string;
  createdParamCount: number;
}

export interface CreateSiblingTrackingEventRequest {
  evtId?: string;
  eventName: string;
  priority?: string;
  platform?: string;
  eventDefinition?: string;
  triggerTiming?: string;
  handler?: string;
  commonProps?: string;
  version?: string;
  minVersion?: string;
  changeType?: string;
  actorId?: string;
  actorLarkId?: string;
}

export interface CreateSiblingTrackingEventResponse {
  success: boolean;
  recordId: string;
  currentStage: string;
}

export interface DeleteTrackingEventRequest {
  actorId?: string;
  actorLarkId?: string;
}

export interface DeleteTrackingEventResponse {
  success: boolean;
  deletedRecordId: string;
  deletedParamCount: number;
  redirectRecordId?: string;
}

export interface DeleteTrackingRequestRequest {
  actorId?: string;
  actorLarkId?: string;
}

export interface DeleteTrackingRequestResponse {
  success: boolean;
  deletedRequestId?: string;
  deletedRecordCount: number;
  deletedParamCount: number;
}

export interface ReuseOfficialEventRequest {
  officialRecordId: string;
  officialParamKeys?: string[];
  actorId?: string;
  actorLarkId?: string;
}

export interface ReuseOfficialEventResponse {
  success: boolean;
  recordId: string;
  currentStage: string;
  importedParamCount: number;
  skippedParamCount: number;
}

export interface PermissionConfig {
  admins: string[];
  dataScientists: string[];
  developers: string[];
  acceptors: string[];
  viewers: string[];
  updatedAt?: number;
  updatedBy?: string;
}

export interface GetPermissionConfigResponse {
  config: PermissionConfig;
  canManage: boolean;
  initialized: boolean;
}

export interface UpdatePermissionConfigRequest {
  actorId?: string;
  actorLarkId?: string;
  actorName?: string;
  config: PermissionConfig;
}

export interface UpdatePermissionConfigResponse {
  success: boolean;
  config: PermissionConfig;
}

// 需求详情
export interface TrackingDetailPermissions {
  canEditRequirement: boolean;
  canEditDesign: boolean;
  canEditReview: boolean;
  canEditDev: boolean;
  canEditAcceptance: boolean;
  canEditLaunch: boolean;
  canEditArchive: boolean;
  canEditParams: boolean;
}

export type TrackingDetailSnapshot = Omit<TrackingDetail, 'relatedEvents'>;

export interface TrackingDetail {
  recordId: string;
  source: TrackingSource;
  requestId?: string;
  requestName?: string;
  evtId: string;
  eventName: string;
  stage: string;
  uiStage: string;
  reviewStatus: string;
  devStatus: string;
  acceptanceStatus: string;
  requester: TrackingUserRef[];
  requesterIds: string[];
  recorder: TrackingUserRef[];
  recorderIds: string[];
  dataOwner: TrackingUserRef[];
  dataOwnerIds: string[];
  devOwner: TrackingUserRef[];
  devOwnerIds: string[];
  dsAcceptor: TrackingUserRef[];
  dsAcceptorIds: string[];
  priority: string;
  platform: string;
  requirementFields: Record<string, unknown>;
  designFields: Record<string, unknown>;
  reviewFields: Record<string, unknown>;
  devFields: Record<string, unknown>;
  acceptanceFields: Record<string, unknown>;
  launchFields: Record<string, unknown>;
  archiveFields: Record<string, unknown>;
  relatedEvents: RelatedTrackingEvent[];
  permissions: TrackingDetailPermissions;
  updatedAt: number;
}

export interface GetTrackingDetailResponse {
  data: TrackingDetail;
}

// 更新主表字段
export interface UpdateTrackingRecordRequest {
  fields: Record<string, unknown>;
  stageId?: string;
  targetStage?: string;
  actorId?: string;
  actorLarkId?: string;
}

export interface UpdateTrackingRecordResponse {
  success: boolean;
  recordId: string;
  currentStage: string;
  notification?: WorkflowNotificationResult;
}

export interface WorkflowNotificationResult {
  planned: boolean;
  configured: boolean;
  recipientCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
  skippedReasons?: string[];
  errors?: string[];
}

export interface NotificationRuntimeStatus {
  configured: boolean;
  hasAppId: boolean;
  hasAppSecret: boolean;
  usingDefaultAppId: boolean;
}

// 参数明细
export interface ParamDetail {
  recordId: string;
  paramKey: string;
  evtId: string;
  paramName: string;
  paramType: string;
  required: boolean;
  requiredRule: string;
  triggerCondition: string;
  enumRange: string;
  definition: string;
  defaultValue: string;
  example: string;
  platform: string;
  status: string;
  version: string;
  changeType: string;
}

export interface GetParamsResponse {
  items: ParamDetail[];
  total: number;
}

export interface CreateParamRequest {
  paramKey?: string;
  evtId: string;
  paramName: string;
  paramType: string;
  required: boolean;
  requiredRule?: string;
  triggerCondition?: string;
  enumRange?: string;
  definition?: string;
  defaultValue?: string;
  example?: string;
  platform?: string;
  status: string;
  version?: string;
  changeType?: string;
  actorId?: string;
  actorLarkId?: string;
}

export interface CreateParamResponse {
  success: boolean;
  recordId: string;
  item: ParamDetail;
}

export interface UpdateParamRequest {
  fields: Record<string, unknown>;
  actorId?: string;
  actorLarkId?: string;
}

export interface UpdateParamResponse {
  success: boolean;
  recordId: string;
  item: ParamDetail;
}

export interface DeleteParamResponse {
  success: boolean;
}

export interface BatchDeleteParamsRequest {
  paramRecordIds: string[];
  actorId?: string;
  actorLarkId?: string;
}

export interface BatchDeleteParamsResponse {
  success: boolean;
  deletedCount: number;
}

// AI 埋点设计草稿
export type AiDraftParamSource = 'ai' | 'official' | 'official_modified';

export interface AiTrackingConfigStatus {
  configured: boolean;
  missingKeys: string[];
  provider: 'kimi' | 'openai';
  model: string;
  reasoningEffort: string;
  feishuOAuthConfigured: boolean;
  tokenStorage: 'encrypted_base';
}

export interface AiFeishuAuthStatus {
  authorized: boolean;
  expiresAt?: number;
  scope?: string;
  tokenStorage: 'encrypted_base';
}

export interface StartAiFeishuAuthRequest {
  recordId: string;
  actorId?: string;
  actorLarkId?: string;
}

export interface StartAiFeishuAuthResponse {
  authorizationUrl: string;
  expiresAt: number;
}

export interface GenerateAiTrackingDraftRequest {
  actorId?: string;
  actorLarkId?: string;
}

export interface AiTrackingDraftParam {
  paramName: string;
  paramType: string;
  requiredRule: string;
  triggerCondition: string;
  enumRange: string;
  definition: string;
  defaultValue: string;
  platform: string;
  source: AiDraftParamSource;
  changeSummary?: string;
  uncertainties: string[];
}

export interface AiTrackingDraftEvent {
  clientId: string;
  evtId: string;
  eventName: string;
  eventDefinition: string;
  triggerTiming: string;
  metricScenario: string;
  priority: string;
  platform: string;
  handler: string;
  commonProps: string;
  version: string;
  minVersion: string;
  changeType: string;
  evidence: string[];
  uncertainties: string[];
  reuseSource?: {
    recordId: string;
    evtId: string;
    eventName: string;
    modificationSummary: string;
  };
  params: AiTrackingDraftParam[];
}

export interface AiTrackingDraftDiff {
  scope: 'current_event' | 'new_event';
  eventClientId: string;
  changedFields: string[];
  addedParamNames: string[];
  changedParamNames: string[];
}

export interface AiTrackingDraft {
  id: string;
  recordId: string;
  requestId?: string;
  version: number;
  status: 'draft' | 'applying' | 'applied' | 'failed';
  createdAt: number;
  provider: string;
  model: string;
  prd: {
    url: string;
    title: string;
    revision?: string;
    truncated: boolean;
  };
  summary: string;
  analystQuestions: string[];
  events: AiTrackingDraftEvent[];
  diffs: AiTrackingDraftDiff[];
  appliedRecordIds?: string[];
  failureMessage?: string;
}

export interface GenerateAiTrackingDraftResponse {
  draft: AiTrackingDraft;
}

export interface ApplyAiTrackingDraftRequest {
  actorId?: string;
  actorLarkId?: string;
  selectedEventClientIds?: string[];
}

export interface ApplyAiTrackingDraftResponse {
  success: boolean;
  draftId: string;
  appliedRecordIds: string[];
  createdEventCount: number;
  createdParamCount: number;
}

// 正式查询库
export interface OfficialEvent {
  recordId: string;
  source: TrackingSource;
  evtId: string;
  eventName: string;
  platform: string;
  version: string;
  status: string;
  paramLink: string;
}

export interface GetOfficialEventsParams {
  source?: TrackingSource;
  keyword?: string;
  pageSize?: number;
  pageToken?: string;
}

export interface GetOfficialEventsResponse {
  items: OfficialEvent[];
  hasMore: boolean;
  pageToken?: string;
  total: number;
}

export interface OfficialParam {
  paramKey: string;
  paramName: string;
  paramType: string;
  required: boolean;
  requiredRule: string;
  enumRange?: string;
  definition: string;
  example: string;
  platform?: string;
  status?: string;
}

export interface GetOfficialParamsResponse {
  items: OfficialParam[];
  total: number;
  baseLink?: string;
}
