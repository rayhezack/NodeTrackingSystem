// 埋点工作台 API 类型定义

// 阶段统计
export interface StageStat {
  stage: string;
  count: number;
}

export interface GetStageStatsResponse {
  items: StageStat[];
}

// 我的待办
export interface TodoItem {
  recordId: string;
  evtId: string;
  eventName: string;
  stage: string;
  priority: string;
  platform: string;
}

export interface GetMyTodosResponse {
  items: TodoItem[];
}

// 需求列表
export interface TrackingRecord {
  recordId: string;
  evtId: string;
  eventName: string;
  stage: string;
  uiStage: string;
  priority: string;
  platform: string;
  dataOwner: string[];
  dataOwnerIds: string[];
  devOwner: string[];
  devOwnerIds: string[];
  updatedAt: number;
}

export interface GetTrackingRecordsParams {
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

export interface TrackingDetail {
  recordId: string;
  evtId: string;
  eventName: string;
  stage: string;
  uiStage: string;
  reviewStatus: string;
  devStatus: string;
  acceptanceStatus: string;
  dataOwner: string[];
  dataOwnerIds: string[];
  devOwner: string[];
  devOwnerIds: string[];
  dsAcceptor: string[];
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
  permissions: TrackingDetailPermissions;
  updatedAt: number;
}

export interface GetTrackingDetailResponse {
  data: TrackingDetail;
}

// 更新主表字段
export interface UpdateTrackingRecordRequest {
  fields: Record<string, unknown>;
  targetStage?: string;
}

export interface UpdateTrackingRecordResponse {
  success: boolean;
  recordId: string;
  currentStage: string;
}

// 参数明细
export interface ParamDetail {
  recordId: string;
  paramKey: string;
  evtId: string;
  paramName: string;
  paramType: string;
  required: boolean;
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
  paramKey: string;
  evtId: string;
  paramName: string;
  paramType: string;
  required: boolean;
  triggerCondition?: string;
  enumRange?: string;
  definition?: string;
  defaultValue?: string;
  example?: string;
  platform?: string;
  status: string;
  version?: string;
  changeType?: string;
}

export interface CreateParamResponse {
  success: boolean;
  recordId: string;
}

export interface UpdateParamRequest {
  fields: Record<string, unknown>;
}

export interface UpdateParamResponse {
  success: boolean;
  recordId: string;
}

export interface DeleteParamResponse {
  success: boolean;
}

// 正式查询库
export interface OfficialEvent {
  recordId: string;
  evtId: string;
  eventName: string;
  platform: string;
  version: string;
  status: string;
}

export interface GetOfficialEventsParams {
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
  definition: string;
  example: string;
}

export interface GetOfficialParamsResponse {
  items: OfficialParam[];
  total: number;
}
