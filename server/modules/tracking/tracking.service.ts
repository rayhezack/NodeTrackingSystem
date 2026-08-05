import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FileService, type FileMeta } from '@lark-apaas/fullstack-nestjs-core';
import type {
  BatchDeleteParamsRequest,
  BatchDeleteParamsResponse,
  CreateParamRequest,
  CreateParamResponse,
  CreateSiblingTrackingEventRequest,
  CreateSiblingTrackingEventResponse,
  CreateTrackingRecordRequest,
  CreateTrackingRecordResponse,
  DeleteTrackingRequestRequest,
  DeleteTrackingRequestResponse,
  DeleteParamResponse,
  DeleteTrackingEventRequest,
  DeleteTrackingEventResponse,
  GetMyTodosParams,
  GetMyTodosResponse,
  GetParamsResponse,
  GetPermissionConfigResponse,
  GetStageStatsParams,
  GetStageStatsResponse,
  GetWorkbenchDashboardParams,
  GetWorkbenchDashboardResponse,
  GetTrackingDetailResponse,
  GetTrackingRecordsParams,
  GetTrackingRecordsResponse,
  PermissionConfig,
  ParamDetail,
  RelatedTrackingEvent,
  ResolveUiImagePreviewRequest,
  ResolveUiImagePreviewResponse,
  ReuseOfficialEventRequest,
  ReuseOfficialEventResponse,
  TrackingAttachment,
  TrackingSource,
  TrackingSourceFilter,
  TrackingDetail,
  TrackingRecord,
  TrackingUserRef,
  UpdatePermissionConfigRequest,
  UpdatePermissionConfigResponse,
  UpdateParamRequest,
  UpdateParamResponse,
  UpdateTrackingRecordRequest,
  UpdateTrackingRecordResponse,
  NotificationRuntimeStatus,
  WorkflowNotificationResult,
} from '@shared/api.interface';
import {
  DEFAULT_DATA_OWNER,
  DEFAULT_TRACKING_VALIDATOR,
  enrichDefaultProjectUser,
} from '../../../shared/tracking-defaults';
import { BITABLE_FIELDS, UI_STAGE_NODES, PRIORITY_WEIGHT, type BitableInstanceKey } from '../bitable/bitable.constants';
import { BitableRecord, BitableService } from '../bitable/bitable.service';
import { calculatePermissions, getBaseStageFromUi, getStageIndex, getUiStageFromBase, isStageTransitionValid, type StagePermissions } from '../bitable/bitable.utils';
import { FeishuNotificationService, type WorkflowNotificationRecipient, type WorkflowTransitionNotification } from '../notification/notification.service';

const WORKBENCH_FIELDS = [
  '需求ID',
  '需求名称',
  'evt_id',
  '事件中文名',
  '事件定义',
  '触发时机',
  'UI图',
  '需求背景',
  '需求链接',
  '指标/使用场景',
  '流程阶段',
  '记录类型',
  '优先级',
  '端',
  '需求提出人',
  '需求录入人',
  '数据负责人',
  '研发负责人',
  'DS验收人',
  '通知身份快照',
  '评审状态',
  '评审意见',
  '埋点开发状态',
  'DS验收状态',
  'DS验收证据',
  'DS验收时间',
  '上线监控状态',
  '上线监控结论',
  '发布门禁状态',
  '发布门禁失败原因',
  '发布状态',
  '发布错误',
  '发布时间',
  '正式状态',
  '版本',
  '最低版本',
  '变更类型',
  '处理方',
  '公共属性要求',
  '参数拆行状态',
  '稳定归档时间',
  '创建时间',
] as const;

const OFFICIAL_QUERY_FIELDS = [
  'evt_id',
  '事件中文名',
  '端',
  '上线版本',
  '最低版本',
  '状态',
  '生命周期状态',
  '参数明细入口',
  '事件定义',
  '触发时机',
  '指标/使用场景',
  '优先级',
  '数据负责人',
  '研发负责人',
  'DS验收人',
  '稳定归档时间',
  '处理方',
  '一级分类',
  '公共属性要求',
  '源事件记录ID',
] as const;

const PARAM_BASE_FIELDS = [
  '设计参数主键',
  'evt_id',
  '参数名',
  '数据类型',
  '必传规则',
  '条件说明',
  '枚举/取值范围',
  '枚举字典',
  '参数定义',
  '默认值/示例',
  '参数状态',
  '版本',
  '变更类型',
  '来源设计记录ID',
  '关联设计',
] as const;

const APP_PARAM_FIELDS = [...PARAM_BASE_FIELDS.slice(0, 9), 'App适用性', ...PARAM_BASE_FIELDS.slice(9)] as const;

const WEB_PARAM_FIELDS = [...PARAM_BASE_FIELDS.slice(0, 9), 'Web适用性', ...PARAM_BASE_FIELDS.slice(9)] as const;

const OFFICIAL_PARAM_BASE_FIELDS = [
  '参数主键',
  'evt_id',
  '事件中文名',
  '参数名',
  '数据类型',
  '必传规则',
  '条件说明',
  '枚举/取值范围',
  '枚举字典',
  '参数定义',
  '版本',
  '参数状态',
  '事件状态',
  '来源表',
  '关联事件',
  '备注',
] as const;

const APP_OFFICIAL_PARAM_FIELDS = [...OFFICIAL_PARAM_BASE_FIELDS.slice(0, 14), 'App适用性', ...OFFICIAL_PARAM_BASE_FIELDS.slice(14)] as const;

const WEB_OFFICIAL_PARAM_FIELDS = [...OFFICIAL_PARAM_BASE_FIELDS.slice(0, 14), 'Web适用性', ...OFFICIAL_PARAM_BASE_FIELDS.slice(14)] as const;

const PERMISSION_RECORD_TYPE = '权限配置';
const PERMISSION_RECORD_NAME = '系统权限配置';
const PERMISSION_RECORD_EVT_ID = '__system_permissions__';
const BOOTSTRAP_ADMIN_USER_IDS = new Set([
  // 当前 App 创建/开发账号在妙搭运行时与本地开发态可能拿到不同 user_id，均作为兜底管理员。
  '1867390536304713',
  '7648831973842095079',
]);
const APP_DESIGN_PARAM_LINK = 'https://bcn0tgplxp2e.feishu.cn/base/Kgy0b4bvmaJSK8sjQDscUrNJnOf?table=tblesT69TDCUKzhs';
const WEB_DESIGN_PARAM_LINK = 'https://bcn0tgplxp2e.feishu.cn/base/EX4RbTvp9agYNws6PIHcKD20nqf?table=tblMaw89yVi68YY6';
const APP_OFFICIAL_PARAM_LINK = 'https://bcn0tgplxp2e.feishu.cn/base/Kgy0b4bvmaJSK8sjQDscUrNJnOf?table=tblEYv9lGZeenbT2';
const WEB_OFFICIAL_PARAM_LINK = 'https://bcn0tgplxp2e.feishu.cn/base/EX4RbTvp9agYNws6PIHcKD20nqf?table=tblNAMKr5S38iXJQ';
const TRACKING_SOURCES: TrackingSource[] = ['app', 'web'];

type Cell = unknown;
type ScopedRecordRef = { source: TrackingSource; rawId: string };
type PermissionKey = keyof StagePermissions;
type SourcedWorkbenchRecord = { source: TrackingSource; record: BitableRecord };
type WorkbenchRecordGroup = { source: TrackingSource; requestId: string; records: BitableRecord[] };
type TodoCandidate = TrackingRecord & { targetStage: string; todoRole: string };
type BitableRecordUpdate = { id: string; record: Record<string, unknown>; nextRecord: Record<string, unknown> };
type EnumDictionaryLinkMode = 'design' | 'official';
type WorkflowNotificationPlan = {
  fromStage: string;
  toStage: string;
  targetStageId: string;
  actionText: string;
  recipientFields: string[];
};
type NotificationIdentitySnapshot = Record<string, TrackingUserRef[]>;

const USER_FIELD_NAME_LIST = ['需求提出人', '需求录入人', '数据负责人', '研发负责人', 'DS验收人'];
const USER_FIELD_NAMES = new Set(USER_FIELD_NAME_LIST);
const NOTIFICATION_IDENTITY_FIELD = '通知身份快照';
const REQUEST_SHARED_FIELD_NAMES = ['需求名称', ...USER_FIELD_NAME_LIST, NOTIFICATION_IDENTITY_FIELD];
const PROJECT_PARTICIPANT_NOTIFICATION_FIELDS = ['需求提出人', '数据负责人', '研发负责人', 'DS验收人'];
const ATTACHMENT_FIELD_NAMES = new Set(['UI图']);
const STAGE_PERMISSION_BY_STAGE_ID: Record<string, PermissionKey> = {
  requirement: 'canEditRequirement',
  design: 'canEditDesign',
  review: 'canEditReview',
  dev: 'canEditDev',
  acceptance: 'canEditAcceptance',
  launch: 'canEditLaunch',
  archive: 'canEditArchive',
};
const FIELD_PERMISSION_BY_STAGE_ID: Record<string, Record<string, PermissionKey>> = {
  requirement: {
    需求名称: 'canEditRequirement',
    需求提出人: 'canEditRequirement',
    需求录入人: 'canEditRequirement',
    需求背景: 'canEditRequirement',
    需求链接: 'canEditRequirement',
    '指标/使用场景': 'canEditRequirement',
    优先级: 'canEditRequirement',
    端: 'canEditRequirement',
    数据负责人: 'canEditRequirement',
    研发负责人: 'canEditRequirement',
    DS验收人: 'canEditRequirement',
  },
  design: {
    evt_id: 'canEditDesign',
    事件中文名: 'canEditDesign',
    优先级: 'canEditDesign',
    端: 'canEditDesign',
    事件定义: 'canEditDesign',
    触发时机: 'canEditDesign',
    UI图: 'canEditDesign',
    处理方: 'canEditDesign',
    公共属性要求: 'canEditDesign',
    版本: 'canEditDesign',
    最低版本: 'canEditDesign',
    变更类型: 'canEditDesign',
    评审状态: 'canEditDesign',
  },
  review: {
    评审状态: 'canEditReview',
    评审意见: 'canEditReview',
  },
  dev: {
    研发负责人: 'canEditDev',
    埋点开发状态: 'canEditDev',
  },
  acceptance: {
    DS验收人: 'canEditAcceptance',
    DS验收状态: 'canEditAcceptance',
    DS验收证据: 'canEditAcceptance',
    DS验收时间: 'canEditAcceptance',
  },
  launch: {
    发布门禁状态: 'canEditLaunch',
    发布门禁失败原因: 'canEditLaunch',
    发布状态: 'canEditLaunch',
    发布错误: 'canEditLaunch',
    上线监控状态: 'canEditLaunch',
    上线监控结论: 'canEditLaunch',
    发布时间: 'canEditLaunch',
  },
  archive: {
    正式状态: 'canEditArchive',
    稳定归档时间: 'canEditArchive',
  },
};
const FIELD_PERMISSION_BY_NAME: Record<string, PermissionKey> = {
  ...FIELD_PERMISSION_BY_STAGE_ID.requirement,
  ...FIELD_PERMISSION_BY_STAGE_ID.design,
  ...FIELD_PERMISSION_BY_STAGE_ID.review,
  ...FIELD_PERMISSION_BY_STAGE_ID.dev,
  ...FIELD_PERMISSION_BY_STAGE_ID.acceptance,
  ...FIELD_PERMISSION_BY_STAGE_ID.launch,
  ...FIELD_PERMISSION_BY_STAGE_ID.archive,
};
const TARGET_STAGE_PERMISSION_BY_BASE_STAGE: Record<string, PermissionKey> = {
  埋点设计: 'canEditRequirement',
  评审通过: 'canEditReview',
  数据验收: 'canEditDev',
  上线监控: 'canEditAcceptance',
  稳定归档: 'canEditLaunch',
  已废弃: 'canEditArchive',
};

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  private readonly uiImagePreviewCacheTtlMs = 8 * 60 * 1000;
  private readonly uiImagePreviewCache = new Map<string, { expiresAt: number; result: ResolveUiImagePreviewResponse }>();

  constructor(
    private readonly bitable: BitableService,
    private readonly fileService: FileService,
    private readonly notification?: FeishuNotificationService,
  ) {}

  getNotificationStatus(): NotificationRuntimeStatus {
    return this.notification?.getRuntimeStatus?.() || {
      configured: false,
      hasAppId: false,
      hasAppSecret: false,
      usingDefaultAppId: true,
    };
  }

  async getStageStats(params: GetStageStatsParams = {}): Promise<GetStageStatsResponse> {
    const records = await this.listWorkbenchRecordsBySource(params.source);
    return this.buildStageStats(records);
  }

  async getWorkbenchDashboard(params: GetWorkbenchDashboardParams = {}): Promise<GetWorkbenchDashboardResponse> {
    const records = await this.listWorkbenchRecordsBySource(params.source);
    const actorCandidates = uniqueStrings([params.actorId || '', params.actorLarkId || '']);
    const permissionConfig = actorCandidates.length && !actorCandidates.some((candidate) => isBootstrapAdmin(candidate)) ? await this.getStoredPermissionConfig() : null;
    const recordList = this.buildTrackingRecordList(records, params);

    return {
      ...recordList,
      stats: this.buildStageStats(records).items,
      todos: actorCandidates.length ? this.buildTodoItems(records, Number(params.todoLimit || 10), actorCandidates, permissionConfig).items : [],
    };
  }

  private buildStageStats(records: SourcedWorkbenchRecord[]): GetStageStatsResponse {
    const countMap = new Map(UI_STAGE_NODES.map((stage) => [stage, 0]));
    for (const group of groupWorkbenchRecords(records)) {
      const trackingRecord = this.toTrackingRecordGroup(group);
      const uiStage = trackingRecord.uiStage;
      if (countMap.has(uiStage)) {
        countMap.set(uiStage, (countMap.get(uiStage) || 0) + 1);
      }
    }
    return {
      items: UI_STAGE_NODES.map((stage) => ({
        stage,
        count: countMap.get(stage) || 0,
      })),
    };
  }

  async getMyTodos(limit = 10, params: GetMyTodosParams = {}): Promise<GetMyTodosResponse> {
    const actorCandidates = uniqueStrings([params.actorId || '', params.actorLarkId || '']);
    if (!actorCandidates.length) {
      return { items: [] };
    }
    const records = await this.listWorkbenchRecordsBySource(params.source);
    const permissionConfig = actorCandidates.some((candidate) => isBootstrapAdmin(candidate)) ? null : await this.getStoredPermissionConfig();
    return this.buildTodoItems(records, limit, actorCandidates, permissionConfig);
  }

  private buildTodoItems(records: SourcedWorkbenchRecord[], limit: number, actorCandidates: string[], permissionConfig?: PermissionConfig | null): GetMyTodosResponse {
    const isAdmin = isAdminActor(actorCandidates, permissionConfig);

    const items = groupWorkbenchRecords(records)
      .map((group) => this.toTodoCandidate(group, isAdmin, actorCandidates))
      .filter((record): record is TodoCandidate => Boolean(record))
      .sort(compareTrackingRecord)
      .slice(0, limit)
      .map((record) => ({
        recordId: record.recordId,
        source: record.source,
        requestId: record.requestId,
        requestName: record.requestName,
        evtId: record.evtId,
        eventIds: record.eventIds,
        eventName: record.eventName,
        eventNames: record.eventNames,
        eventCount: record.eventCount,
        stage: record.stage,
        targetStage: record.targetStage,
        todoRole: record.todoRole,
        priority: record.priority,
        platform: record.platform,
      }));

    return { items };
  }

  async getRecords(params: GetTrackingRecordsParams): Promise<GetTrackingRecordsResponse> {
    const records = await this.listWorkbenchRecordsBySource(params.source);
    return this.buildTrackingRecordList(records, params);
  }

  private buildTrackingRecordList(records: SourcedWorkbenchRecord[], params: GetTrackingRecordsParams): GetTrackingRecordsResponse {
    const pageSize = Number(params.pageSize || 50);
    const offset = Number(params.pageToken || 0);
    const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
    const keyword = (params.keyword || '').trim().toLowerCase();
    const filtered = groupWorkbenchRecords(records)
      .map((group) => this.toTrackingRecordGroup(group))
      .filter((record) => {
        if (keyword) {
          const haystack = `${record.requestId || ''} ${record.requestName || ''} ${record.evtId} ${record.eventName} ${record.eventIds.join(' ')} ${record.eventNames.join(' ')}`.toLowerCase();
          if (!haystack.includes(keyword)) return false;
        }
        if (params.stage && record.uiStage !== params.stage && record.stage !== params.stage) {
          return false;
        }
        if (params.priority && record.priority !== params.priority) return false;
        if (params.platform && !matchesPlatformFilter(record, params.platform)) return false;
        if (params.owner) {
          const owners = [...record.dataOwner, ...record.devOwner].join(' ');
          if (!owners.includes(params.owner)) return false;
        }
        return true;
      })
      .sort(compareTrackingRecord);
    const nextOffset = safeOffset + pageSize;

    return {
      items: filtered.slice(safeOffset, nextOffset),
      hasMore: nextOffset < filtered.length,
      pageToken: nextOffset < filtered.length ? String(nextOffset) : undefined,
      total: filtered.length,
    };
  }

  async getDetail(recordId: string, actorId?: string, actorLarkId?: string): Promise<GetTrackingDetailResponse> {
    const ref = parseScopedRecordId(recordId);
    const record = await this.bitable.getRecord(workbenchKey(ref.source), ref.rawId);
    if (!record) {
      throw new NotFoundException('埋点需求不存在');
    }
    const permissionConfig = await this.getStoredPermissionConfig();
    const relatedRecords = await this.listRelatedWorkbenchRecords(ref.source, record);
    const workflowRecord = selectGroupWorkflowRecord(relatedRecords);
    const requestSharedFields = mergeRequestSharedFields(relatedRecords);
    const detail = this.toTrackingDetail(applyRequestDisplayState(record, workflowRecord, requestSharedFields), ref.source, actorId, actorLarkId, permissionConfig);
    detail.relatedEvents = this.toRelatedEvents(ref.source, record, relatedRecords, actorId, actorLarkId, permissionConfig);
    return {
      data: detail,
    };
  }

  async resolveUiImagePreview(body: ResolveUiImagePreviewRequest): Promise<ResolveUiImagePreviewResponse> {
    const attachment = body?.attachment || {};
    const directUrl = attachmentDirectUrl(attachment);
    if (directUrl) {
      return {
        url: directUrl,
        source: 'direct',
      };
    }

    const cacheKey = attachmentPreviewCacheKey(attachment);
    const cached = this.uiImagePreviewCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const result = await this.resolveUiImagePreviewUncached(attachment);
    this.uiImagePreviewCache.set(cacheKey, {
      expiresAt: Date.now() + this.uiImagePreviewCacheTtlMs,
      result,
    });
    return result;
  }

  private async resolveUiImagePreviewUncached(attachment: TrackingAttachment): Promise<ResolveUiImagePreviewResponse> {
    const paths = attachmentStoragePathCandidates(attachment);
    for (const path of paths) {
      const signed = await this.createUiImageSignedUrl(path);
      if (signed) {
        return {
          url: signed,
          filePath: path,
          source: 'storage_path',
        };
      }
    }

    const fileName = attachmentFileName(attachment);
    if (fileName) {
      const matched = await this.findUiImageByName(fileName);
      if (matched?.filePath) {
        const signed = await this.createUiImageSignedUrl(matched.filePath);
        if (signed) {
          return {
            url: signed,
            filePath: matched.filePath,
            source: 'storage_name',
          };
        }
      }
    }

    return {
      url: '',
      reason: fileName || paths.length ? 'STORAGE_LOOKUP_FAILED' : 'NO_PREVIEW_SOURCE',
    };
  }

  private async createUiImageSignedUrl(filePath: string): Promise<string> {
    try {
      const normalizedPath = normalizeFilePath(filePath);
      if (!normalizedPath) return '';
      const metadata = await this.fileService.getFileMetadata(normalizedPath);
      if (!metadata) return '';
      const signedUrl = await this.fileService.createSignedUrl(normalizedPath, 10 * 60);
      return signedUrl || metadata.downloadURL || '';
    } catch (error) {
      return '';
    }
  }

  private async findUiImageByName(fileName: string): Promise<FileMeta | null> {
    try {
      const listed = await this.fileService.list('', { maxKeys: 200 });
      const normalizedName = normalizeAttachmentName(fileName);
      return (
        listed.attachments.find((file) => normalizeAttachmentName(file.name) === normalizedName) ||
        listed.attachments.find((file) => normalizeAttachmentName(file.filePath.split('/').pop() || '') === normalizedName) ||
        null
      );
    } catch (error) {
      return null;
    }
  }

  async getPermissionConfig(actorId?: string): Promise<GetPermissionConfigResponse> {
    const stored = await this.getPermissionRecord();
    const config = stored ? parsePermissionConfig(stored.record['需求背景']) : emptyPermissionConfig();
    const initialized = Boolean(stored);
    const effectiveConfig = initialized
      ? config
      : {
          ...config,
          admins: actorId ? [actorId] : [],
        };

    return {
      config: effectiveConfig,
      initialized,
      canManage: initialized ? Boolean(actorId && (effectiveConfig.admins.length === 0 || effectiveConfig.admins.includes(actorId) || isBootstrapAdmin(actorId))) : Boolean(actorId),
    };
  }

  async updatePermissionConfig(body: UpdatePermissionConfigRequest): Promise<UpdatePermissionConfigResponse> {
    const actorId = (body.actorId || '').trim();
    if (!actorId) {
      throw new BadRequestException('无法识别当前用户，不能更新权限配置');
    }

    const existing = await this.getPermissionRecord();
    const currentConfig = existing ? parsePermissionConfig(existing.record['需求背景']) : emptyPermissionConfig();
    if (existing && currentConfig.admins.length > 0 && !currentConfig.admins.includes(actorId) && !isBootstrapAdmin(actorId)) {
      throw new ForbiddenException('只有管理员可以更新权限配置');
    }

    const nextConfig = normalizePermissionConfig({
      ...body.config,
      admins: uniqueStrings([...(body.config?.admins || []), actorId]),
      dataScientists: [],
      developers: [],
      acceptors: [],
      viewers: [],
      updatedAt: Date.now(),
      updatedBy: actorId,
    });

    // 权限配置是应用自身状态，不是业务埋点需求。写成 Base「模板」记录并只写稳定字段，
    // 避免因为业务枚举、人员字段或系统只读字段导致初始化 400。
    const record = {
      evt_id: PERMISSION_RECORD_EVT_ID,
      事件中文名: PERMISSION_RECORD_NAME,
      需求背景: JSON.stringify(nextConfig),
      流程阶段: '稳定归档',
      记录类型: '模板',
      优先级: 'P2',
      版本: 'system',
    };

    if (existing) {
      await this.bitable.batchUpdateRecords('workbench', [{ id: existing.id, record }]);
    } else {
      await this.bitable.batchAddRecords('workbench', [record]);
    }

    return { success: true, config: nextConfig };
  }

  async createRecord(body: CreateTrackingRecordRequest): Promise<CreateTrackingRecordResponse> {
    const source = normalizeSource(body.source);
    const evtId = (body.evtId || '').trim();
    const requestName = (body.requestName || body.eventName || '').trim();
    const eventName = (body.eventName || requestName).trim();
    if (!requestName) {
      throw new BadRequestException('需求名称不能为空');
    }

    await this.assertCanCreateRecord(body.actorId, body.actorLarkId);

    const records = await this.listWorkbenchRecords(source);
    const hasRequestIdField = hasWorkbenchField(source, '需求ID');
    const requestId = hasRequestIdField
      ? createUniqueRequestId(source, records.map((record) => cellText(record.record['需求ID'])))
      : '';

    const actorCellId = body.actorId;
    const actorUsers = actorCellId
      ? [{
          user_id: actorCellId,
          ...(body.actorLarkId ? { larkUserId: body.actorLarkId } : {}),
          ...(body.actorName ? { name: body.actorName } : {}),
        }]
      : [];
    const requesterUsers = body.requesterIds?.length ? body.requesterIds : actorUsers;
    const dataOwnerUsers = body.dataOwnerIds?.length ? body.dataOwnerIds : [{ ...DEFAULT_DATA_OWNER }];
    const dsAcceptorUsers = body.dsAcceptorIds?.length ? body.dsAcceptorIds : [{ ...DEFAULT_TRACKING_VALIDATOR }];
    const requesterCells = createUserCells(requesterUsers);
    const recorderCells = requesterCells;
    const dataOwnerCells = createUserCells(dataOwnerUsers);
    const devOwnerCells = createUserCells(body.devOwnerIds);
    const dsAcceptorCells = createUserCells(dsAcceptorUsers);
    const notificationSnapshot = buildNotificationIdentitySnapshot({
      需求提出人: requesterUsers,
      需求录入人: requesterUsers,
      数据负责人: dataOwnerUsers,
      研发负责人: body.devOwnerIds || [],
      DS验收人: dsAcceptorUsers,
    });
    const workbench = workbenchKey(source);
    const paramDetail = paramDetailKey(source);
    const requirementLink = (body.requirementLink || '').trim();
    const [created] = await this.bitable.batchAddRecords(workbench, [
      {
        ...(requestId ? { 需求ID: requestId } : {}),
        需求名称: requestName,
        evt_id: evtId,
        事件中文名: eventName,
        事件定义: body.eventDefinition || '',
        触发时机: body.triggerTiming || '',
        需求背景: body.requirementBackground || '',
        ...(requirementLink ? { 需求链接: requirementLink } : {}),
        '指标/使用场景': body.metricScenario || '',
        流程阶段: '需求录入',
        记录类型: '埋点设计',
        优先级: body.priority || 'P2',
        端: toPlatformCell(body.platform, source),
        需求提出人: requesterCells,
        需求录入人: recorderCells,
        数据负责人: dataOwnerCells,
        研发负责人: devOwnerCells,
        DS验收人: dsAcceptorCells,
        ...(hasWorkbenchField(source, NOTIFICATION_IDENTITY_FIELD) && notificationSnapshot ? { [NOTIFICATION_IDENTITY_FIELD]: notificationSnapshot } : {}),
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
        版本: body.version || '1.0.0',
        最低版本: body.minVersion || body.version || '1.0.0',
        变更类型: normalizeChangeType(body.changeType),
        处理方: normalizeHandler(body.handler, source),
        公共属性要求: body.commonProps || '',
        参数明细入口: source === 'web' ? WEB_DESIGN_PARAM_LINK : APP_DESIGN_PARAM_LINK,
        参数拆行状态: body.initialParams?.length ? '已拆行' : '未拆行',
      },
    ]);

    const paramRecords = (body.initialParams || [])
      .map((param) => this.toParamRecord(source, created.id, evtId, body.version || '1.0.0', param))
      .filter((record) => cellText(record.evt_id) && cellText(record['参数名']));

    if (paramRecords.length) {
      await this.bitable.batchAddRecords(paramDetail, paramRecords);
    }

    return {
      success: true,
      recordId: encodeScopedRecordId(source, created.id),
      currentStage: '需求录入',
      createdParamCount: paramRecords.length,
    };
  }

  async createSiblingEvent(recordId: string, body: CreateSiblingTrackingEventRequest): Promise<CreateSiblingTrackingEventResponse> {
    const ref = parseScopedRecordId(recordId);
    const source = ref.source;
    const workbench = workbenchKey(source);
    const current = await this.bitable.getRecord(workbench, ref.rawId);
    if (!current) {
      throw new NotFoundException('埋点需求不存在');
    }

    const eventName = (body.eventName || '').trim();
    if (!eventName) {
      throw new BadRequestException('事件名不能为空');
    }

    const permissions = await this.getActorPermissionsForRecord(source, current, body.actorId, body.actorLarkId, '新增同需求埋点事件');
    if (!permissions.canEditDesign) {
      throw new ForbiddenException('当前用户无权限新增同需求埋点事件');
    }

    const evtId = (body.evtId || '').trim();
    const records = await this.listWorkbenchRecords(source);
    const requestId = await this.ensureRequestId(source, current, records);
    const currentRecord = {
      ...current.record,
      ...mergeRequestSharedFields(await this.listRelatedWorkbenchRecords(source, current)),
    };
    if (evtId) {
      const duplicate = this.findDuplicateEvtIdInRequest(current, records, evtId);
      if (duplicate) {
        throw new BadRequestException(`当前需求内已存在 evt_id：${evtId}`);
      }
    }
    const requirementLink = firstText(currentRecord['需求链接']).trim();
    const requestName = getRequestNameFromRecords(records, currentRecord);
    const version = body.version || cellText(currentRecord['版本']) || '1.0.0';
    const platform = body.platform || cellText(currentRecord['端']);
    const record: Record<string, unknown> = {
      ...(requestId ? { 需求ID: requestId } : {}),
      需求名称: requestName,
      evt_id: evtId,
      事件中文名: eventName,
      事件定义: body.eventDefinition || '',
      触发时机: body.triggerTiming || '',
      需求背景: cellText(currentRecord['需求背景']),
      ...(requirementLink ? { 需求链接: requirementLink } : {}),
      '指标/使用场景': cellText(currentRecord['指标/使用场景']),
      流程阶段: '埋点设计',
      记录类型: '埋点设计',
      优先级: body.priority || cellText(currentRecord['优先级']) || 'P2',
      端: toPlatformCell(platform, source),
      需求提出人: createUserCells(cellUsers(currentRecord['需求提出人']).ids),
      需求录入人: createUserCells(cellUsers(currentRecord['需求录入人']).ids),
      数据负责人: createUserCells(cellUsers(currentRecord['数据负责人']).ids),
      研发负责人: createUserCells(cellUsers(currentRecord['研发负责人']).ids),
      DS验收人: createUserCells(cellUsers(currentRecord['DS验收人']).ids),
      ...(hasWorkbenchField(source, NOTIFICATION_IDENTITY_FIELD) && cellText(currentRecord[NOTIFICATION_IDENTITY_FIELD]) ? { [NOTIFICATION_IDENTITY_FIELD]: cellText(currentRecord[NOTIFICATION_IDENTITY_FIELD]) } : {}),
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
      最低版本: body.minVersion || cellText(currentRecord['最低版本']) || version,
      变更类型: normalizeChangeType(body.changeType || cellText(currentRecord['变更类型'])),
      处理方: normalizeHandler(body.handler || cellText(currentRecord['处理方']), source),
      公共属性要求: body.commonProps || cellText(currentRecord['公共属性要求']),
      参数明细入口: source === 'web' ? WEB_DESIGN_PARAM_LINK : APP_DESIGN_PARAM_LINK,
      参数拆行状态: '未拆行',
    };

    const [created] = await this.bitable.batchAddRecords(workbench, [record]);
    return {
      success: true,
      recordId: encodeScopedRecordId(source, created.id),
      currentStage: '埋点设计',
    };
  }

  async deleteEvent(recordId: string, body: DeleteTrackingEventRequest = {}): Promise<DeleteTrackingEventResponse> {
    const ref = parseScopedRecordId(recordId);
    const source = ref.source;
    const workbench = workbenchKey(source);
    const current = await this.bitable.getRecord(workbench, ref.rawId);
    if (!current) {
      throw new NotFoundException('埋点事件不存在');
    }
    const permissions = await this.getActorPermissionsForRecord(source, current, body.actorId, body.actorLarkId, '删除设计事件');
    if (!permissions.canEditDesign) {
      throw new ForbiddenException('当前用户无权限删除设计事件');
    }

    const uiStage = getUiStageFromBase(
      cellText(current.record['流程阶段']) || '需求录入',
      cellText(current.record['评审状态']),
    );
    if (!['埋点提需', '埋点设计'].includes(uiStage)) {
      throw new BadRequestException('仅支持删除需求录入或埋点设计阶段的事件');
    }

    const relatedRecords = await this.listRelatedWorkbenchRecords(source, current);
    if (relatedRecords.length <= 1) {
      throw new BadRequestException('一个需求至少需要保留一个埋点事件，不能删除最后一个事件');
    }

    const params = await this.listParamsForDesign(source, ref.rawId, cellText(current.record['evt_id']));
    const paramIds = params.map((record) => record.id);
    for (let index = 0; index < paramIds.length; index += 200) {
      await this.bitable.deleteRecords(paramDetailKey(source), paramIds.slice(index, index + 200));
    }
    await this.bitable.deleteRecords(workbench, [ref.rawId]);

    const redirectRecord = relatedRecords
      .filter((record) => record.id !== ref.rawId)
      .sort((a, b) => cellTimestamp(a.record['创建时间']) - cellTimestamp(b.record['创建时间']))[0];

    return {
      success: true,
      deletedRecordId: recordId,
      deletedParamCount: paramIds.length,
      redirectRecordId: redirectRecord ? encodeScopedRecordId(source, redirectRecord.id) : undefined,
    };
  }

  async deleteRequest(recordId: string, body: DeleteTrackingRequestRequest = {}): Promise<DeleteTrackingRequestResponse> {
    const ref = parseScopedRecordId(recordId);
    const source = ref.source;
    const workbench = workbenchKey(source);
    const current = await this.bitable.getRecord(workbench, ref.rawId);
    if (!current) {
      throw new NotFoundException('埋点需求不存在');
    }

    const permissions = await this.getActorPermissionsForRecord(source, current, body.actorId, body.actorLarkId, '删除需求单');
    if (!permissions.canEditRequirement && !permissions.canEditDesign && !permissions.canEditArchive) {
      throw new ForbiddenException('当前用户无权限删除需求单');
    }

    const relatedRecords = await this.listRelatedWorkbenchRecords(source, current);
    const blockedRecord = relatedRecords.find((record) => hasOfficialSyncFootprint(record.record));
    if (blockedRecord) {
      throw new BadRequestException('需求已进入正式上线或归档链路，不支持直接删除；如需下线请走废弃/归档流程以保留审计');
    }

    const paramIds: string[] = [];
    for (const record of relatedRecords) {
      const params = await this.listParamsForDesign(source, record.id, cellText(record.record['evt_id']));
      paramIds.push(...params.map((param) => param.id));
    }

    const uniqueParamIds = uniqueStrings(paramIds);
    for (let index = 0; index < uniqueParamIds.length; index += 200) {
      await this.bitable.deleteRecords(paramDetailKey(source), uniqueParamIds.slice(index, index + 200));
    }

    const recordIds = relatedRecords.map((record) => record.id);
    for (let index = 0; index < recordIds.length; index += 200) {
      await this.bitable.deleteRecords(workbench, recordIds.slice(index, index + 200));
    }

    return {
      success: true,
      deletedRequestId: cellText(current.record['需求ID']) || undefined,
      deletedRecordCount: recordIds.length,
      deletedParamCount: uniqueParamIds.length,
    };
  }

  async reuseOfficialEvent(recordId: string, body: ReuseOfficialEventRequest): Promise<ReuseOfficialEventResponse> {
    const ref = parseScopedRecordId(recordId);
    const source = ref.source;
    const workbench = workbenchKey(source);
    const current = await this.bitable.getRecord(workbench, ref.rawId);
    if (!current) {
      throw new NotFoundException('埋点需求不存在');
    }

    const officialRecordId = (body.officialRecordId || '').trim();
    if (!officialRecordId) {
      throw new BadRequestException('请选择要复用的正式事件');
    }
    const officialRef = parseScopedRecordId(officialRecordId);
    if (officialRef.source !== source) {
      throw new BadRequestException('正式事件分库与当前需求分库不一致');
    }

    const permissions = await this.getActorPermissionsForRecord(source, current, body.actorId, body.actorLarkId, '复用已有事件');
    if (!permissions.canEditDesign) {
      throw new ForbiddenException('当前用户无权限复用已有事件');
    }

    const officialEvent = await this.bitable.getRecord(queryLibraryKey(source), officialRef.rawId);
    if (!officialEvent) {
      throw new NotFoundException('正式事件不存在');
    }
    const evtId = cellText(officialEvent.record['evt_id']).trim();
    const eventName = cellText(officialEvent.record['事件中文名']).trim();
    if (!evtId || !eventName) {
      throw new BadRequestException('正式事件缺少 evt_id 或事件名，无法复用');
    }

    const records = await this.listWorkbenchRecords(source);
    const currentEvtId = cellText(current.record['evt_id']).trim();
    const shouldReuseCurrent = !currentEvtId || currentEvtId.toLowerCase() === evtId.toLowerCase();
    if (!shouldReuseCurrent) {
      await this.ensureRequestId(source, current, records);
    }
    const duplicate = this.findDuplicateEvtIdInRequest(
      current,
      records,
      evtId,
      shouldReuseCurrent ? [ref.rawId] : [],
    );
    if (duplicate) {
      throw new BadRequestException(`当前需求内已存在 evt_id：${evtId}`);
    }

    const selectedParamKeys = new Set(
      uniqueStrings(body.officialParamKeys || [])
        .map((key) => key.trim().toLowerCase())
        .filter(Boolean),
    );
    const officialParams = selectedParamKeys.size
      ? (await this.listOfficialParamsForEvent(source, officialRef.rawId, evtId))
          .filter((record) => selectedParamKeys.has(getOfficialParamKey(record.record).toLowerCase()))
      : [];
    const currentRecord = {
      ...current.record,
      ...mergeRequestSharedFields(await this.listRelatedWorkbenchRecords(source, current)),
    };
    const requestName = getRequestNameFromRecords(records, currentRecord);
    const version = firstText(officialEvent.record['上线版本'], currentRecord['版本']) || '1.0.0';
    const minVersion = firstText(currentRecord['最低版本'], version) || version;
    const officialMetricScenario = cellText(officialEvent.record['指标/使用场景']).trim();
    const designPatch: Record<string, unknown> = {
      evt_id: evtId,
      事件中文名: eventName,
      事件定义: cellText(officialEvent.record['事件定义']),
      触发时机: cellText(officialEvent.record['触发时机']),
      ...(officialMetricScenario ? { '指标/使用场景': officialMetricScenario } : {}),
      流程阶段: '埋点设计',
      记录类型: '埋点设计',
      优先级: cellText(currentRecord['优先级']) || 'P2',
      端: toPlatformCell(firstText(officialEvent.record['端'], currentRecord['端']), source),
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
      最低版本: minVersion,
      变更类型: '修改',
      处理方: normalizeHandler(cellText(currentRecord['处理方']), source),
      公共属性要求: cellText(currentRecord['公共属性要求']),
      参数明细入口: source === 'web' ? WEB_DESIGN_PARAM_LINK : APP_DESIGN_PARAM_LINK,
      参数拆行状态: officialParams.length ? '已拆行' : '未拆行',
    };

    let targetRawId = ref.rawId;
    if (shouldReuseCurrent) {
      await this.bitable.batchUpdateRecords(workbench, [{ id: ref.rawId, record: designPatch }]);
    } else {
      const existingRequestId = cellText(currentRecord['需求ID']).trim();
      const requestId = existingRequestId || await this.ensureRequestId(source, current, records);
      const requirementLink = firstText(currentRecord['需求链接']).trim();
      const [created] = await this.bitable.batchAddRecords(workbench, [{
        ...(requestId ? { 需求ID: requestId } : {}),
        需求名称: requestName,
        ...designPatch,
        需求背景: cellText(currentRecord['需求背景']),
        ...(requirementLink ? { 需求链接: requirementLink } : {}),
        需求提出人: createUserCells(cellUsers(currentRecord['需求提出人']).ids),
        需求录入人: createUserCells(cellUsers(currentRecord['需求录入人']).ids),
        数据负责人: createUserCells(cellUsers(currentRecord['数据负责人']).ids),
        研发负责人: createUserCells(cellUsers(currentRecord['研发负责人']).ids),
        DS验收人: createUserCells(cellUsers(currentRecord['DS验收人']).ids),
        ...(hasWorkbenchField(source, NOTIFICATION_IDENTITY_FIELD) && cellText(currentRecord[NOTIFICATION_IDENTITY_FIELD]) ? { [NOTIFICATION_IDENTITY_FIELD]: cellText(currentRecord[NOTIFICATION_IDENTITY_FIELD]) } : {}),
      }]);
      targetRawId = created.id;
    }

    const imported = await this.importOfficialParamsToDesign(source, targetRawId, evtId, version, officialParams);
    return {
      success: true,
      recordId: encodeScopedRecordId(source, targetRawId),
      currentStage: '埋点设计',
      importedParamCount: imported.importedParamCount,
      skippedParamCount: imported.skippedParamCount,
    };
  }

  async updateRecord(recordId: string, body: UpdateTrackingRecordRequest): Promise<UpdateTrackingRecordResponse> {
    const ref = parseScopedRecordId(recordId);
    const workbench = workbenchKey(ref.source);
    const current = await this.bitable.getRecord(workbench, ref.rawId);
    if (!current) {
      throw new NotFoundException('埋点需求不存在');
    }
    await this.assertCanUpdateRecord(ref.source, current, body);

    const patch = { ...(body.fields || {}) };
    let currentStage = cellText(current.record['流程阶段']);

    if (body.targetStage) {
      const targetStage = getBaseStageFromUi(body.targetStage);
      if (!isStageTransitionValid(currentStage, targetStage)) {
        throw new BadRequestException(`非法状态跳转：${currentStage} -> ${targetStage}`);
      }
      patch['流程阶段'] = targetStage;
      currentStage = targetStage;
    }
    if (Object.prototype.hasOwnProperty.call(patch, '端')) {
      patch['端'] = Array.isArray(patch['端']) ? patch['端'] : toPlatformCell(cellText(patch['端']), ref.source);
    }
    if (Object.prototype.hasOwnProperty.call(patch, '需求名称')) {
      const requestName = cellText(patch['需求名称']).trim();
      if (!requestName) {
        throw new BadRequestException('需求名称不能为空');
      }
      patch['需求名称'] = requestName;
    }
    normalizeWorkflowProgressPatch(patch, current.record);
    const notificationSnapshotPatch = buildMergedNotificationIdentitySnapshot(ref.source, current.record, body.fields || {});
    for (const fieldName of USER_FIELD_NAMES) {
      if (Object.prototype.hasOwnProperty.call(patch, fieldName)) {
        const userCells = createUserCells(patch[fieldName]);
        if (!userCells.length && cellUsers(current.record[fieldName]).ids.length) {
          delete patch[fieldName];
        } else {
          patch[fieldName] = userCells;
        }
      }
    }
    if (notificationSnapshotPatch) {
      patch[NOTIFICATION_IDENTITY_FIELD] = notificationSnapshotPatch;
    }
    normalizeWorkbenchPatch(patch, ref.source);
    const nextRecord = { ...current.record, ...patch };

    const currentEvtId = cellText(current.record['evt_id']);
    const hasEvtIdPatch = Object.prototype.hasOwnProperty.call(patch, 'evt_id');
    const nextEvtId = hasEvtIdPatch ? cellText(patch.evt_id) : currentEvtId;

    if (hasEvtIdPatch && nextEvtId && nextEvtId !== currentEvtId) {
      const records = await this.listWorkbenchRecords(ref.source);
      const duplicate = this.findDuplicateEvtIdInRequest(current, records, nextEvtId, [ref.rawId]);
      if (duplicate) {
        throw new BadRequestException(`当前需求内已存在 evt_id：${nextEvtId}`);
      }
    }

    const updates = [{
      id: ref.rawId,
      record: patch,
      nextRecord,
    }];
    const requestWorkflowPatch = toRequestWorkflowPatch(body.stageId, body.targetStage, patch);
    if (requestWorkflowPatch) {
      updates.push(...await this.buildRequestWorkflowUpdates(ref.source, {
        id: ref.rawId,
        record: nextRecord,
      }, body.stageId, requestWorkflowPatch));
    }
    const requestSharedPatch = toRequestSharedPatch(patch);
    if (requestSharedPatch) {
      updates.push(...await this.buildRequestSharedFieldUpdates(ref.source, {
        id: ref.rawId,
        record: nextRecord,
      }, requestSharedPatch));
    }
    const mergedUpdates = mergeBitableRecordUpdates(updates);

    await this.bitable.batchUpdateRecords(
      workbench,
      mergedUpdates.map((update) => ({ id: update.id, record: update.record })),
    );
    if (hasEvtIdPatch && nextEvtId && nextEvtId !== currentEvtId) {
      await this.syncParamEvtId(ref.source, ref.rawId, currentEvtId, nextEvtId);
    }
    for (const update of mergedUpdates) {
      await this.syncOfficialQueryLibrary(ref.source, update.id, update.nextRecord);
    }
    const notification = await this.notifyWorkflowTransition(ref.source, recordId, current.record, nextRecord, body, mergedUpdates);
    return {
      success: true,
      recordId,
      currentStage,
      ...(notification ? { notification } : {}),
    };
  }

  async getParams(recordId: string): Promise<GetParamsResponse> {
    const ref = parseScopedRecordId(recordId);
    const detail = await this.bitable.getRecord(workbenchKey(ref.source), ref.rawId);
    if (!detail) {
      throw new NotFoundException('埋点需求不存在');
    }

    const evtId = cellText(detail.record['evt_id']);
    const paramRecords = await this.listParamsForDesign(ref.source, ref.rawId, evtId);
    const items = paramRecords
      .filter((record) => !isRemovedDesignParam(record.record))
      .map((record) => this.toParamDetail(record, ref.source))
      .sort((a, b) => a.paramKey.localeCompare(b.paramKey));

    return { items, total: items.length };
  }

  async createParam(recordId: string, body: CreateParamRequest): Promise<CreateParamResponse> {
    const ref = parseScopedRecordId(recordId);
    const detail = await this.bitable.getRecord(workbenchKey(ref.source), ref.rawId);
    if (!detail) {
      throw new NotFoundException('埋点需求不存在');
    }
    await this.assertCanEditParams(ref.source, detail, body.actorId, body.actorLarkId);
    const evtId = body.evtId || cellText(detail.record['evt_id']);
    const paramName = body.paramName.trim();
    if (!evtId || !paramName) {
      throw new BadRequestException('evt_id 和参数名不能为空');
    }

    const paramRecord = this.toParamRecord(ref.source, ref.rawId, evtId, cellText(detail.record['版本']), body);
    const [created] = await this.bitable.batchAddRecords(paramDetailKey(ref.source), [paramRecord]);
    const enumRecordIds = await this.syncEnumDictionaryForParam(ref.source, 'design', created.id, paramRecord);

    return {
      success: true,
      recordId: encodeScopedRecordId(ref.source, created.id),
      item: this.toParamDetail({
        id: created.id,
        record: {
          ...paramRecord,
          ...(enumRecordIds.length ? { 枚举字典: enumRecordIds } : {}),
        },
      }, ref.source),
    };
  }

  async updateParam(paramRecordId: string, body: UpdateParamRequest): Promise<UpdateParamResponse> {
    const ref = parseScopedRecordId(paramRecordId);
    const paramRecord = await this.bitable.getRecord(paramDetailKey(ref.source), ref.rawId);
    if (!paramRecord) {
      throw new NotFoundException('埋点参数不存在');
    }
    const designRecord = await this.findDesignRecordForParam(ref.source, paramRecord);
    await this.assertCanEditParams(ref.source, designRecord, body.actorId, body.actorLarkId);

    const fields = body.fields || {};
    const patch = hasApiParamFields(fields) ? toParamPatch(fields as Partial<CreateParamRequest>, ref.source) : fields;
    const nextParamRecord = { ...paramRecord.record, ...patch };
    if (Object.keys(patch).length) {
      await this.bitable.batchUpdateRecords(paramDetailKey(ref.source), [{ id: ref.rawId, record: patch }]);
      const enumRecordIds = await this.syncEnumDictionaryForParam(ref.source, 'design', ref.rawId, nextParamRecord);
      if (enumRecordIds.length) {
        nextParamRecord['枚举字典'] = enumRecordIds;
      }
    }
    return {
      success: true,
      recordId: paramRecordId,
      item: this.toParamDetail({
        id: ref.rawId,
        record: nextParamRecord,
      }, ref.source),
    };
  }

  private async listParamsForDesign(source: TrackingSource, designRecordId: string, evtId: string): Promise<BitableRecord[]> {
    const instanceKey = paramDetailKey(source);
    const fields = [...paramFields(source)];
    const eventId = evtId.trim();
    const conditions = [
      { fieldName: '来源设计记录ID', operator: 'is', value: [designRecordId] },
      ...(eventId ? [{ fieldName: 'evt_id', operator: 'is', value: [eventId] }] : []),
    ];

    try {
      const result = await this.bitable.searchRecords(instanceKey, {
        fieldNames: fields,
        filter: {
          conjunction: 'or',
          conditions,
        },
        pageSize: 200,
      });
      const matched = result.records.filter((record) =>
        this.isParamForDesign(record, designRecordId, eventId),
      );
      if (matched.length || !eventId) return matched;
    } catch {
      // 兼容历史表结构或 Base 过滤能力异常：回退到旧的宽表扫描逻辑，避免线上数据不可见。
    }

    const fallback = await this.bitable.searchRecords(instanceKey, {
      fieldNames: fields,
      pageSize: 200,
    });
    return fallback.records.filter((record) =>
      this.isParamForDesign(record, designRecordId, eventId),
    );
  }

  private async listOfficialParamsForEvent(source: TrackingSource, officialEventRecordId: string, evtId: string): Promise<BitableRecord[]> {
    const records = await this.searchAllRecords(officialParamDetailKey(source), officialParamFields(source));
    return records
      .filter((record) => isOfficialParamForEvent(record, officialEventRecordId, evtId))
      .filter((record) => !isRemovedOfficialParam(record.record));
  }

  private async importOfficialParamsToDesign(
    source: TrackingSource,
    designRecordId: string,
    evtId: string,
    version: string,
    officialParams: BitableRecord[],
  ): Promise<{ importedParamCount: number; skippedParamCount: number }> {
    if (!officialParams.length) {
      return { importedParamCount: 0, skippedParamCount: 0 };
    }

    const existingParams = await this.listParamsForDesign(source, designRecordId, evtId);
    const existingKeys = new Set(
      existingParams
        .map((record) => getDesignParamKey(record.record))
        .map((key) => key.toLowerCase())
        .filter(Boolean),
    );
    const recordsToCreate: Record<string, unknown>[] = [];
    let skippedParamCount = 0;

    for (const officialParam of officialParams) {
      const paramName = cellText(officialParam.record['参数名']).trim();
      const paramKey = getOfficialParamKey(officialParam.record) || buildParamKey(evtId, paramName);
      if (!paramName || !paramKey) continue;
      const normalizedKey = paramKey.toLowerCase();
      if (existingKeys.has(normalizedKey)) {
        skippedParamCount += 1;
        continue;
      }
      existingKeys.add(normalizedKey);
      recordsToCreate.push(toDesignParamRecordFromOfficial(source, designRecordId, evtId, version, officialParam.record));
    }

    for (let index = 0; index < recordsToCreate.length; index += 200) {
      const chunk = recordsToCreate.slice(index, index + 200);
      const createdRecords = await this.bitable.batchAddRecords(paramDetailKey(source), chunk);
      for (let offset = 0; offset < createdRecords.length; offset += 1) {
        const createdId = createdRecords[offset]?.id;
        if (createdId) {
          await this.syncEnumDictionaryForParam(source, 'design', createdId, chunk[offset]);
        }
      }
    }

    return {
      importedParamCount: recordsToCreate.length,
      skippedParamCount,
    };
  }

  private async searchAllRecords(instanceKey: BitableInstanceKey, fieldNames: readonly string[]): Promise<BitableRecord[]> {
    const records: BitableRecord[] = [];
    let pageToken: string | undefined;

    do {
      const result = await this.bitable.searchRecords(instanceKey, {
        fieldNames: [...fieldNames],
        pageSize: 200,
        ...(pageToken ? { pageToken } : {}),
      });
      records.push(...result.records);
      pageToken = result.hasMore ? result.pageToken : undefined;
    } while (pageToken);

    return records;
  }

  private async listEnumRecordsForParam(source: TrackingSource, evtId: string, paramName: string): Promise<BitableRecord[]> {
    const instanceKey = enumDictionaryKey(source);
    const fields = enumDictionaryFields();
    const records: BitableRecord[] = [];
    let pageToken: string | undefined;

    try {
      do {
        const result = await this.bitable.searchRecords(instanceKey, {
          fieldNames: [...fields],
          filter: {
            conjunction: 'and',
            conditions: [
              { fieldName: 'evt_id', operator: 'is', value: [evtId] },
              { fieldName: '参数名', operator: 'is', value: [paramName] },
            ],
          },
          pageSize: 200,
          ...(pageToken ? { pageToken } : {}),
        });
        records.push(...result.records);
        pageToken = result.hasMore ? result.pageToken : undefined;
      } while (pageToken);
      return records;
    } catch {
      return (await this.searchAllRecords(instanceKey, fields)).filter((record) =>
        cellText(record.record['evt_id']).trim() === evtId && cellText(record.record['参数名']).trim() === paramName,
      );
    }
  }

  private async syncEnumDictionaryForParam(
    source: TrackingSource,
    mode: EnumDictionaryLinkMode,
    paramRecordId: string,
    paramRecord: Record<string, unknown>,
  ): Promise<string[]> {
    const evtId = cellText(paramRecord['evt_id']).trim();
    const paramName = cellText(paramRecord['参数名']).trim();
    const enumText = cellText(paramRecord['枚举/取值范围']).trim();
    const previousLinkedIds = cellIds(paramRecord['枚举字典']);
    if (!evtId || !paramName || (!enumText && !previousLinkedIds.length)) return [];

    const instanceKey = enumDictionaryKey(source);
    const paramInstanceKey = mode === 'design' ? paramDetailKey(source) : officialParamDetailKey(source);
    const linkedField = mode === 'design' ? '关联设计参数' : '关联正式参数';
    const entries = parseEnumDictionaryEntries(evtId, paramName, enumText);
    const existingRecords = await this.listEnumRecordsForParam(source, evtId, paramName);
    const existingByKey = new Map(
      existingRecords
        .map((record) => [cellText(record.record['枚举主键']).trim().toLowerCase(), record] as const)
        .filter(([key]) => Boolean(key)),
    );
    const isRemoved = mode === 'design' ? isRemovedDesignParam(paramRecord) : isRemovedOfficialParam(paramRecord);
    const enumStatus = isRemoved ? '已废弃' : mode === 'official' ? '正式' : '草稿';
    const version = firstText(paramRecord['版本']) || '1.0.0';
    const updates: { id: string; record: Record<string, unknown> }[] = [];
    const inserts: Record<string, unknown>[] = [];
    const insertKeys: string[] = [];

    for (const entry of entries) {
      const normalizedKey = entry.key.toLowerCase();
      const existing = existingByKey.get(normalizedKey);
      const recordPatch = {
        evt_id: evtId,
        参数名: paramName,
        枚举值: entry.value,
        枚举中文名: entry.label,
        枚举定义: entry.definition,
        枚举状态: enumStatus,
        首次版本: firstText(existing?.record['首次版本'], version),
        ...(isRemoved ? { 下线版本: version } : {}),
        [linkedField]: uniqueStrings([
          ...cellIds(existing?.record[linkedField]),
          paramRecordId,
        ]),
      };

      if (existing) {
        updates.push({ id: existing.id, record: recordPatch });
      } else {
        inserts.push({
          枚举主键: entry.key,
          ...recordPatch,
        });
        insertKeys.push(normalizedKey);
      }
    }

    const linkedEnumRecordIds: string[] = entries
      .map((entry) => existingByKey.get(entry.key.toLowerCase())?.id || '')
      .filter(Boolean);

    for (let index = 0; index < updates.length; index += 200) {
      await this.bitable.batchUpdateRecords(instanceKey, updates.slice(index, index + 200));
    }
    for (let index = 0; index < inserts.length; index += 200) {
      const chunk = inserts.slice(index, index + 200);
      const createdRecords = await this.bitable.batchAddRecords(instanceKey, chunk);
      for (let offset = 0; offset < createdRecords.length; offset += 1) {
        const createdId = createdRecords[offset]?.id;
        const key = insertKeys[index + offset];
        if (createdId) {
          linkedEnumRecordIds.push(createdId);
          if (key) existingByKey.set(key, { id: createdId, record: chunk[offset] });
        }
      }
    }

    const staleLinkedIds = previousLinkedIds.filter((id) => !linkedEnumRecordIds.includes(id));
    if (isRemoved && staleLinkedIds.length) {
      await this.bitable.batchUpdateRecords(
        instanceKey,
        staleLinkedIds.map((id) => ({
          id,
          record: {
            枚举状态: '已废弃',
            下线版本: version,
          },
        })),
      );
    }

    await this.bitable.batchUpdateRecords(paramInstanceKey, [{
      id: paramRecordId,
      record: { 枚举字典: linkedEnumRecordIds },
    }]);
    return uniqueStrings(linkedEnumRecordIds);
  }

  private async syncParamEvtId(source: TrackingSource, designRecordId: string, previousEvtId: string, nextEvtId: string): Promise<void> {
    const records = await this.listParamsForDesign(source, designRecordId, previousEvtId);
    const updates = records
      .map((record) => ({
        id: record.id,
        record: { evt_id: nextEvtId },
      }));
    if (!updates.length) return;

    for (let index = 0; index < updates.length; index += 200) {
      await this.bitable.batchUpdateRecords(paramDetailKey(source), updates.slice(index, index + 200));
    }
  }

  private async syncOfficialQueryLibrary(source: TrackingSource, designRecordId: string, record: Record<string, unknown>): Promise<void> {
    if (shouldSyncDeprecatedQueryRecord(record)) {
      await this.syncDeprecatedQueryLibrary(source, designRecordId, record);
      return;
    }

    const officialRecord = toOfficialQueryRecord(source, designRecordId, record);
    if (!officialRecord) return;

    const evtId = cellText(officialRecord.evt_id).trim().toLowerCase();
    const instanceKey = queryLibraryKey(source);
    const records = await this.searchAllRecords(instanceKey, OFFICIAL_QUERY_FIELDS);
    const existing = records.find((item) => cellText(item.record['evt_id']).trim().toLowerCase() === evtId);

    let officialEventRecordId = existing?.id;
    if (existing) {
      await this.bitable.batchUpdateRecords(instanceKey, [{ id: existing.id, record: officialRecord }]);
    } else {
      const [created] = await this.bitable.batchAddRecords(instanceKey, [officialRecord]);
      officialEventRecordId = created?.id;
    }

    if (officialEventRecordId) {
      await this.syncOfficialParams(source, designRecordId, record, officialEventRecordId);
    }
  }

  private async syncDeprecatedQueryLibrary(source: TrackingSource, designRecordId: string, record: Record<string, unknown>): Promise<void> {
    const evtId = cellText(record['evt_id']).trim();
    if (!evtId) return;

    const officialEventKey = queryLibraryKey(source);
    const officialRecords = await this.searchAllRecords(officialEventKey, OFFICIAL_QUERY_FIELDS);
    const existingOfficialEvent = officialRecords.find((item) => cellText(item.record['evt_id']).trim().toLowerCase() === evtId.toLowerCase());
    const officialParamKey = officialParamDetailKey(source);
    const officialParams = await this.searchAllRecords(officialParamKey, officialParamFields(source));
    const relatedOfficialParams = officialParams.filter((param) =>
      isOfficialParamForEvent(param, existingOfficialEvent?.id || '', evtId),
    );
    const designParams = (await this.searchAllRecords(paramDetailKey(source), paramFields(source)))
      .filter((paramRecord) => this.isParamForDesign(paramRecord, designRecordId, evtId));

    await this.upsertDeprecatedEvent(source, designRecordId, record, existingOfficialEvent);
    await this.upsertDeprecatedParams(source, record, designParams, relatedOfficialParams);

    if (relatedOfficialParams.length) {
      await this.bitable.deleteRecords(officialParamKey, relatedOfficialParams.map((param) => param.id));
    }
    if (existingOfficialEvent) {
      await this.bitable.deleteRecords(officialEventKey, [existingOfficialEvent.id]);
    }
  }

  private async syncOfficialParams(source: TrackingSource, designRecordId: string, designRecord: Record<string, unknown>, officialEventRecordId: string): Promise<void> {
    const evtId = cellText(designRecord['evt_id']).trim();
    if (!evtId) return;

    const designParamRecords = (await this.searchAllRecords(paramDetailKey(source), paramFields(source)))
      .filter((paramRecord) => this.isParamForDesign(paramRecord, designRecordId, evtId));
    const removedDesignParams = designParamRecords.filter((paramRecord) => isRemovedDesignParam(paramRecord.record));
    const designParams = designParamRecords.filter((paramRecord) => !isRemovedDesignParam(paramRecord.record));
    const officialParamKey = officialParamDetailKey(source);
    const officialParams = await this.searchAllRecords(officialParamKey, officialParamFields(source));
    const existingByParamKey = new Map<string, BitableRecord>();

    for (const item of officialParams) {
      const paramKey = getOfficialParamKey(item.record).toLowerCase();
      if (paramKey) {
        existingByParamKey.set(paramKey, item);
      }
    }

    const updates: { id: string; record: Record<string, unknown> }[] = [];
    const inserts: Record<string, unknown>[] = [];
    const enumSyncTargets: Array<{ id: string; record: Record<string, unknown> }> = [];

    const officialParamsToDelete = removedDesignParams
      .map((paramRecord) => {
        const paramKey = getDesignParamKey(paramRecord.record).toLowerCase();
        return paramKey ? existingByParamKey.get(paramKey) : undefined;
      })
      .filter((record): record is BitableRecord => Boolean(record));
    if (removedDesignParams.length || officialParamsToDelete.length) {
      await this.upsertDeprecatedParams(source, designRecord, removedDesignParams, officialParamsToDelete);
    }
    if (officialParamsToDelete.length) {
      await this.bitable.deleteRecords(officialParamKey, officialParamsToDelete.map((record) => record.id));
    }

    for (const designParam of designParams) {
      const officialParam = toOfficialParamRecord(source, designRecord, designParam.record, officialEventRecordId);
      if (!officialParam) continue;

      const paramKey = cellText(officialParam['参数主键']).trim().toLowerCase();
      const existing = existingByParamKey.get(paramKey);
      if (existing) {
        const mergedRecord = mergeOfficialParamRecord(existing.record, officialParam);
        updates.push({ id: existing.id, record: mergedRecord });
        enumSyncTargets.push({ id: existing.id, record: mergedRecord });
      } else {
        inserts.push(officialParam);
      }
    }

    for (let index = 0; index < updates.length; index += 200) {
      await this.bitable.batchUpdateRecords(officialParamKey, updates.slice(index, index + 200));
    }
    for (let index = 0; index < inserts.length; index += 200) {
      const chunk = inserts.slice(index, index + 200);
      const createdRecords = await this.bitable.batchAddRecords(officialParamKey, chunk);
      for (let offset = 0; offset < createdRecords.length; offset += 1) {
        const createdId = createdRecords[offset]?.id;
        if (createdId) {
          enumSyncTargets.push({ id: createdId, record: chunk[offset] });
        }
      }
    }
    for (const target of enumSyncTargets) {
      await this.syncEnumDictionaryForParam(source, 'official', target.id, target.record);
    }
  }

  private async upsertDeprecatedEvent(source: TrackingSource, designRecordId: string, record: Record<string, unknown>, officialEvent?: BitableRecord): Promise<void> {
    const deprecatedRecord = toDeprecatedEventRecord(source, designRecordId, record, officialEvent);
    if (!deprecatedRecord) return;

    const instanceKey = deprecatedEventKey(source);
    const records = await this.searchAllRecords(instanceKey, deprecatedEventFields());
    const key = cellText(deprecatedRecord['废弃主键']).trim().toLowerCase();
    const existing = records.find((item) => cellText(item.record['废弃主键']).trim().toLowerCase() === key);
    if (existing) {
      await this.bitable.batchUpdateRecords(instanceKey, [{ id: existing.id, record: deprecatedRecord }]);
    } else {
      await this.bitable.batchAddRecords(instanceKey, [deprecatedRecord]);
    }
  }

  private async upsertDeprecatedParams(
    source: TrackingSource,
    designRecord: Record<string, unknown>,
    designParams: BitableRecord[],
    officialParams: BitableRecord[],
  ): Promise<void> {
    const recordsByKey = new Map<string, Record<string, unknown>>();

    for (const officialParam of officialParams) {
      const deprecatedParam = toDeprecatedParamRecord(designRecord, officialParam, '正式参数明细', {
        officialParamId: officialParam.id,
      });
      if (!deprecatedParam) continue;
      recordsByKey.set(cellText(deprecatedParam['废弃参数主键']).trim().toLowerCase(), deprecatedParam);
    }
    for (const designParam of designParams) {
      const officialParam = officialParams.find((item) =>
        getOfficialParamKey(item.record).toLowerCase() === getDesignParamKey(designParam.record).toLowerCase(),
      );
      const deprecatedParam = toDeprecatedParamRecord(designRecord, designParam, '设计参数明细', {
        designParamId: designParam.id,
        officialParamId: officialParam?.id,
      });
      if (!deprecatedParam) continue;
      recordsByKey.set(cellText(deprecatedParam['废弃参数主键']).trim().toLowerCase(), deprecatedParam);
    }

    const records = Array.from(recordsByKey.values());
    if (!records.length) return;

    const instanceKey = deprecatedParamDetailKey(source);
    const existingRecords = await this.searchAllRecords(instanceKey, deprecatedParamFields());
    const existingByKey = new Map(
      existingRecords
        .map((record) => [cellText(record.record['废弃参数主键']).trim().toLowerCase(), record] as const)
        .filter(([key]) => Boolean(key)),
    );
    const updates: { id: string; record: Record<string, unknown> }[] = [];
    const inserts: Record<string, unknown>[] = [];

    for (const deprecatedParam of records) {
      const key = cellText(deprecatedParam['废弃参数主键']).trim().toLowerCase();
      const existing = existingByKey.get(key);
      if (existing) {
        updates.push({ id: existing.id, record: deprecatedParam });
      } else {
        inserts.push(deprecatedParam);
      }
    }

    for (let index = 0; index < updates.length; index += 200) {
      await this.bitable.batchUpdateRecords(instanceKey, updates.slice(index, index + 200));
    }
    for (let index = 0; index < inserts.length; index += 200) {
      await this.bitable.batchAddRecords(instanceKey, inserts.slice(index, index + 200));
    }
  }

  async batchDeleteParams(recordId: string, body: BatchDeleteParamsRequest): Promise<BatchDeleteParamsResponse> {
    const ref = parseScopedRecordId(recordId);
    const designRecord = await this.bitable.getRecord(workbenchKey(ref.source), ref.rawId);
    if (!designRecord) {
      throw new NotFoundException('埋点需求不存在');
    }
    await this.assertCanEditParams(ref.source, designRecord, body.actorId, body.actorLarkId);

    const selectedRawIds = uniqueStrings(body.paramRecordIds || [])
      .map((id) => parseScopedRecordId(id))
      .map((paramRef) => {
        if (paramRef.source !== ref.source) {
          throw new BadRequestException('参数分库与当前埋点分库不一致');
        }
        return paramRef.rawId;
      });
    if (!selectedRawIds.length) {
      return { success: true, deletedCount: 0 };
    }

    const params = await this.listParamsForDesign(ref.source, ref.rawId, cellText(designRecord.record['evt_id']));
    const allowedIds = new Set(
      params
        .filter((record) => !isRemovedDesignParam(record.record))
        .map((record) => record.id),
    );
    const invalidIds = selectedRawIds.filter((id) => !allowedIds.has(id));
    if (invalidIds.length) {
      throw new BadRequestException('部分参数不属于当前埋点设计，已取消删除');
    }

    for (let index = 0; index < selectedRawIds.length; index += 200) {
      await this.bitable.deleteRecords(paramDetailKey(ref.source), selectedRawIds.slice(index, index + 200));
    }
    return {
      success: true,
      deletedCount: selectedRawIds.length,
    };
  }

  async deleteParam(paramRecordId: string, actorId?: string, actorLarkId?: string): Promise<DeleteParamResponse> {
    const ref = parseScopedRecordId(paramRecordId);
    const paramRecord = await this.bitable.getRecord(paramDetailKey(ref.source), ref.rawId);
    if (!paramRecord) {
      throw new NotFoundException('埋点参数不存在');
    }
    const designRecord = await this.findDesignRecordForParam(ref.source, paramRecord);
    await this.assertCanEditParams(ref.source, designRecord, actorId, actorLarkId);

    await this.bitable.deleteRecords(paramDetailKey(ref.source), [ref.rawId]);
    return { success: true };
  }

  private async assertCanCreateRecord(actorId?: string, actorLarkId?: string): Promise<void> {
    const actors = uniqueStrings([actorId || '', actorLarkId || '']);
    if (!actors.length) {
      throw new ForbiddenException('无法识别当前用户，不能新增需求');
    }
  }

  private async assertCanUpdateRecord(source: TrackingSource, record: BitableRecord, body: UpdateTrackingRecordRequest): Promise<void> {
    const permissions = await this.getActorPermissionsForRecord(source, record, body.actorId, body.actorLarkId, '更新需求');
    const requiredPermissions = getRequiredPermissionsForUpdate(body);
    const denied = requiredPermissions.filter((permission) => !permissions[permission]);
    if (denied.length) {
      throw new ForbiddenException('当前用户无权限更新该节点');
    }
  }

  private async assertCanEditParams(source: TrackingSource, record: BitableRecord, actorId?: string, actorLarkId?: string): Promise<void> {
    const permissions = await this.getActorPermissionsForRecord(source, record, actorId, actorLarkId, '维护参数');
    if (!permissions.canEditParams) {
      throw new ForbiddenException('当前用户无权限维护参数');
    }
  }

  private async getActorPermissionsForRecord(source: TrackingSource, record: BitableRecord, actorId: string | undefined, actorLarkId: string | undefined, actionLabel: string): Promise<StagePermissions> {
    const actorCandidates = uniqueStrings([actorId || '', actorLarkId || '']);
    if (!actorCandidates.length) {
      throw new ForbiddenException(`无法识别当前用户，不能${actionLabel}`);
    }
    if (actorCandidates.some((candidate) => isBootstrapAdmin(candidate))) {
      return fullStagePermissions();
    }

    const permissionConfig = await this.getStoredPermissionConfig();
    const permissionRecord = await this.toRequestScopedRecord(source, record);
    return calculateRawRecordPermissions(permissionRecord.record, actorId, actorLarkId, permissionConfig);
  }

  private async findDesignRecordForParam(source: TrackingSource, paramRecord: BitableRecord): Promise<BitableRecord> {
    const sourceRecordId = cellText(paramRecord.record['来源设计记录ID']);
    const linkedRecordIds = cellIds(paramRecord.record['关联设计']);
    const candidateIds = uniqueStrings([sourceRecordId, ...linkedRecordIds]).map((id) => normalizeScopedRawId(id, source));

    for (const candidateId of candidateIds) {
      const designRecord = await this.bitable.getRecord(workbenchKey(source), candidateId);
      if (designRecord) return designRecord;
    }

    const evtId = cellText(paramRecord.record['evt_id']).trim().toLowerCase();
    if (evtId) {
      const result = await this.bitable.searchRecords(workbenchKey(source), {
        fieldNames: [...WORKBENCH_FIELDS],
        pageSize: 200,
      });
      const designRecord = result.records.find((item) => cellText(item.record['evt_id']).trim().toLowerCase() === evtId);
      if (designRecord) return designRecord;
    }

    throw new NotFoundException('参数关联的埋点需求不存在');
  }

  private async getStoredPermissionConfig(): Promise<PermissionConfig | null> {
    const record = await this.getPermissionRecord();
    return record ? parsePermissionConfig(record.record['需求背景']) : null;
  }

  private async getPermissionRecord(): Promise<BitableRecord | null> {
    const result = await this.bitable.searchRecords('workbench', {
      fieldNames: [...WORKBENCH_FIELDS],
      pageSize: 200,
    });
    return result.records.find((record) => cellText(record.record['evt_id']) === PERMISSION_RECORD_EVT_ID || cellText(record.record['记录类型']) === PERMISSION_RECORD_TYPE) || null;
  }

  private async listWorkbenchRecordsBySource(sourceFilter?: TrackingSourceFilter): Promise<Array<{ source: TrackingSource; record: BitableRecord }>> {
    const filter = normalizeSourceFilter(sourceFilter);
    const sources = filter === 'all' ? TRACKING_SOURCES : [filter];
    const results = await Promise.all(
      sources.map(async (source) => {
        const records = await this.listWorkbenchRecords(source);
        return records.map((record) => ({ source, record }));
      }),
    );
    return results.flat();
  }

  private async listWorkbenchRecords(source: TrackingSource): Promise<BitableRecord[]> {
    const result = await this.bitable.searchRecords(workbenchKey(source), {
      fieldNames: [...WORKBENCH_FIELDS],
      pageSize: 200,
    });
    return result.records.filter((record) => isBusinessWorkbenchRecord(record));
  }

  private async ensureRequestId(source: TrackingSource, current: BitableRecord, records: BitableRecord[]): Promise<string> {
    if (!hasWorkbenchField(source, '需求ID')) return '';
    const existingRequestId = cellText(current.record['需求ID']).trim();
    if (existingRequestId) return existingRequestId;

    const requestId = createUniqueRequestId(source, records.map((record) => cellText(record.record['需求ID'])));
    await this.bitable.batchUpdateRecords(workbenchKey(source), [{ id: current.id, record: { 需求ID: requestId } }]);
    current.record['需求ID'] = requestId;
    return requestId;
  }

  private findDuplicateEvtIdInRequest(
    current: BitableRecord,
    records: BitableRecord[],
    evtId: string,
    excludedRecordIds: string[] = [],
  ): BitableRecord | undefined {
    const normalizedEvtId = evtId.trim().toLowerCase();
    if (!normalizedEvtId) return undefined;
    const excluded = new Set(excludedRecordIds);
    const currentRequestId = cellText(current.record['需求ID']).trim();

    return records.find((record) => {
      if (excluded.has(record.id)) return false;
      if (!isBusinessWorkbenchRecord(record)) return false;
      if (cellText(record.record['evt_id']).trim().toLowerCase() !== normalizedEvtId) return false;
      if (!currentRequestId) return record.id === current.id;
      return record.id === current.id || cellText(record.record['需求ID']).trim() === currentRequestId;
    });
  }

  private async listRelatedWorkbenchRecords(source: TrackingSource, current: BitableRecord): Promise<BitableRecord[]> {
    const requestId = cellText(current.record['需求ID']).trim();
    let records = [current];
    if (requestId) {
      if (hasWorkbenchField(source, '需求ID')) {
        const result = await this.bitable.searchRecords(workbenchKey(source), {
          fieldNames: [...WORKBENCH_FIELDS],
          filter: {
            conjunction: 'and',
            conditions: [{ fieldName: '需求ID', operator: 'is', value: [requestId] }],
          },
          pageSize: 200,
        });
        records = result.records.filter((record) => isBusinessWorkbenchRecord(record));
      } else {
        records = (await this.listWorkbenchRecords(source)).filter((record) => cellText(record.record['需求ID']).trim() === requestId);
      }
    }
    const uniqueByRecordId = new Map<string, BitableRecord>();
    uniqueByRecordId.set(current.id, current);
    for (const record of records) {
      uniqueByRecordId.set(record.id, record);
    }
    return Array.from(uniqueByRecordId.values());
  }

  private async toRequestScopedRecord(source: TrackingSource, current: BitableRecord): Promise<BitableRecord> {
    const relatedRecords = await this.listRelatedWorkbenchRecords(source, current);
    return applyRequestDisplayState(
      current,
      selectGroupWorkflowRecord(relatedRecords),
      mergeRequestSharedFields(relatedRecords),
    );
  }

  private async buildRequestSharedFieldUpdates(
    source: TrackingSource,
    current: BitableRecord,
    sharedPatch: Record<string, unknown>,
  ): Promise<Array<{ id: string; record: Record<string, unknown>; nextRecord: Record<string, unknown> }>> {
    const requestId = cellText(current.record['需求ID']).trim();
    if (!requestId || !Object.keys(sharedPatch).length) return [];

    return (await this.listRelatedWorkbenchRecords(source, current))
      .filter((record) => record.id !== current.id)
      .filter((record) => !isPatchNoop(record.record, sharedPatch))
      .map((record) => ({
        id: record.id,
        record: sharedPatch,
        nextRecord: { ...record.record, ...sharedPatch },
      }));
  }

  private async buildRequestWorkflowUpdates(
    source: TrackingSource,
    current: BitableRecord,
    stageId: string | undefined,
    workflowPatch: Record<string, unknown>,
  ): Promise<Array<{ id: string; record: Record<string, unknown>; nextRecord: Record<string, unknown> }>> {
    const relatedRecords = await this.listRelatedWorkbenchRecords(source, current);
    return relatedRecords
      .filter((record) => record.id !== current.id)
      .filter((record) => shouldApplyRequestWorkflowPatch(record, stageId, workflowPatch))
      .filter((record) => !isPatchNoop(record.record, workflowPatch))
      .map((record) => ({
        id: record.id,
        record: workflowPatch,
        nextRecord: { ...record.record, ...workflowPatch },
      }));
  }

  private async notifyWorkflowTransition(
    source: TrackingSource,
    recordId: string,
    previousRecord: Record<string, unknown>,
    nextRecord: Record<string, unknown>,
    body: UpdateTrackingRecordRequest,
    updates: BitableRecordUpdate[],
  ): Promise<WorkflowNotificationResult | undefined> {
    const plan = getWorkflowNotificationPlan(body.stageId, body.targetStage, previousRecord, nextRecord);
    if (!plan) return undefined;

    if (!this.notification) {
      return {
        planned: true,
        configured: false,
        recipientCount: 0,
        sentCount: 0,
        skippedCount: 1,
        failedCount: 0,
        skippedReasons: ['notification service is unavailable'],
      };
    }

    try {
      const records = await this.getNotificationScopedRecords(source, updates, { id: parseScopedRecordId(recordId).rawId, record: nextRecord });
      const requestRecord = selectGroupRequestRecord(records);
      const recipients = buildWorkflowNotificationRecipients(records, plan.recipientFields);
      const eventIds = uniqueStrings(records.map((record) => cellText(record.record['evt_id'])));
      const eventNames = records.map((record) => cellText(record.record['事件中文名']) || cellText(record.record['evt_id'])).filter(Boolean);
      const requestId = cellText(requestRecord.record['需求ID']) || undefined;
      const notificationPayload: WorkflowTransitionNotification = {
        idempotencyKey: [
          source,
          requestId || requestRecord.id,
          plan.toStage,
          cellText(nextRecord['评审状态']),
          cellText(nextRecord['流程阶段']),
        ].filter(Boolean).join(':'),
        source,
        recordId: encodeScopedRecordId(source, requestRecord.id),
        requestId,
        requestName: getGroupRequestName(records, requestRecord),
        fromStage: plan.fromStage,
        toStage: plan.toStage,
        actionText: plan.actionText,
        targetStageId: plan.targetStageId,
        priority: getHighestPriority(records),
        platform: mergePlatforms(records),
        eventIds,
        eventNames,
        recipients,
      };
      return await this.notification.sendWorkflowTransitionNotification(notificationPayload);
    } catch (error) {
      const runtimeStatus = this.getNotificationStatus();
      this.logger.warn(
        JSON.stringify({
          message: 'Workflow transition succeeded but notification failed',
          recordId,
          source,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        planned: true,
        configured: runtimeStatus.configured,
        recipientCount: 0,
        sentCount: 0,
        skippedCount: 0,
        failedCount: 1,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  private async getNotificationScopedRecords(
    source: TrackingSource,
    updates: BitableRecordUpdate[],
    current: BitableRecord,
  ): Promise<BitableRecord[]> {
    const updateMap = new Map(updates.map((update) => [update.id, update.nextRecord]));
    const relatedRecords = await this.listRelatedWorkbenchRecords(source, current);
    const scopedRecords = relatedRecords.map((record) => ({
      id: record.id,
      record: updateMap.get(record.id) || record.record,
    }));
    if (!scopedRecords.some((record) => record.id === current.id)) {
      scopedRecords.push(current);
    }
    return scopedRecords.filter((record) => isBusinessWorkbenchRecord(record));
  }

  private toRelatedEvents(
    source: TrackingSource,
    current: BitableRecord,
    records: BitableRecord[],
    actorId?: string,
    actorLarkId?: string,
    permissionConfig?: PermissionConfig | null,
  ): RelatedTrackingEvent[] {
    const workflowRecord = selectGroupWorkflowRecord(records);
    const requestSharedFields = mergeRequestSharedFields(records);
    return records
      .sort((a, b) => cellTimestamp(a.record['创建时间']) - cellTimestamp(b.record['创建时间']))
      .map((record) =>
        this.toRelatedEvent(
          applyRequestDisplayState(record, workflowRecord, requestSharedFields),
          source,
          record.id === current.id,
          actorId,
          actorLarkId,
          permissionConfig,
        ),
      );
  }

  private toRelatedEvent(
    record: BitableRecord,
    source: TrackingSource,
    isCurrent: boolean,
    actorId?: string,
    actorLarkId?: string,
    permissionConfig?: PermissionConfig | null,
  ): RelatedTrackingEvent {
    const stage = cellText(record.record['流程阶段']) || '需求录入';
    const detail = this.toTrackingDetail(record, source, actorId, actorLarkId, permissionConfig);
    const { relatedEvents: _relatedEvents, ...snapshot } = detail;
    return {
      recordId: encodeScopedRecordId(source, record.id),
      source,
      evtId: cellText(record.record['evt_id']),
      eventName: cellText(record.record['事件中文名']) || '未命名事件',
      stage,
      uiStage: getUiStageFromBase(stage, cellText(record.record['评审状态'])),
      priority: cellText(record.record['优先级']) || 'P2',
      platform: cellText(record.record['端']) || '-',
      isCurrent,
      detail: snapshot,
    };
  }

  private toTodoCandidate(group: WorkbenchRecordGroup, isAdmin: boolean, actorCandidates: string[]): TodoCandidate | null {
    const workflowRecord = selectGroupWorkflowRecord(group.records);
    const action = isAdmin ? getAdminTodoAction(workflowRecord) : getGroupTodoAction(group.records, workflowRecord, actorCandidates);
    if (!action) return null;

    return {
      ...this.toTrackingRecordGroup(group, workflowRecord),
      stage: action.stage,
      uiStage: action.stage,
      targetStage: action.targetStage,
      todoRole: action.todoRole,
    };
  }

  private toTrackingRecordGroup(group: WorkbenchRecordGroup, preferredRecord?: BitableRecord): TrackingRecord {
    const records = group.records;
    const representative = preferredRecord || selectGroupRepresentative(records);
    const requestRecord = selectGroupRequestRecord(records);
    const stageRecord = selectGroupWorkflowRecord(records);
    const stage = cellText(stageRecord.record['流程阶段']) || '需求录入';
    const eventIds = uniqueStrings(records.map((record) => cellText(record.record['evt_id'])));
    const eventNames = uniqueStrings(records.map((record) => cellText(record.record['事件中文名']) || '未命名事件'));
    const requestName = getGroupRequestName(records, requestRecord);
    const dataUsers = mergeRecordUsers(records, '数据负责人');
    const devUsers = mergeRecordUsers(records, '研发负责人');

    return {
      recordId: encodeScopedRecordId(group.source, representative.id),
      source: group.source,
      requestId: group.requestId || undefined,
      requestName,
      evtId: cellText(representative.record['evt_id']),
      eventIds,
      eventName: cellText(representative.record['事件中文名']) || eventNames[0] || '未命名需求',
      eventNames,
      eventCount: records.length,
      stage,
      uiStage: getUiStageFromBase(stage, cellText(stageRecord.record['评审状态'])),
      priority: getHighestPriority(records),
      platform: mergePlatforms(records),
      dataOwner: dataUsers.names,
      dataOwnerIds: dataUsers.ids,
      devOwner: devUsers.names,
      devOwnerIds: devUsers.ids,
      updatedAt: Math.max(...records.map((record) => cellTimestamp(record.record['创建时间']))),
    };
  }

  private toTrackingRecord(record: BitableRecord, source: TrackingSource): TrackingRecord {
    const users = {
      data: recordUsers(record, '数据负责人'),
      dev: recordUsers(record, '研发负责人'),
    };
    const stage = cellText(record.record['流程阶段']) || '需求录入';
    return {
      recordId: encodeScopedRecordId(source, record.id),
      source,
      requestId: cellText(record.record['需求ID']) || undefined,
      requestName: firstText(record.record['需求名称'], record.record['事件中文名']) || '未命名需求',
      evtId: cellText(record.record['evt_id']),
      eventIds: uniqueStrings([cellText(record.record['evt_id'])]),
      eventName: cellText(record.record['事件中文名']) || '未命名需求',
      eventNames: uniqueStrings([cellText(record.record['事件中文名']) || '未命名需求']),
      eventCount: 1,
      stage,
      uiStage: getUiStageFromBase(stage, cellText(record.record['评审状态'])),
      priority: cellText(record.record['优先级']) || 'P2',
      platform: cellText(record.record['端']) || '-',
      dataOwner: users.data.names,
      dataOwnerIds: users.data.ids,
      devOwner: users.dev.names,
      devOwnerIds: users.dev.ids,
      updatedAt: cellTimestamp(record.record['创建时间']),
    };
  }

  private toTrackingDetail(record: BitableRecord, source: TrackingSource, actorId?: string, actorLarkId?: string, permissionConfig?: PermissionConfig | null): TrackingDetail {
    const requester = recordUsers(record, '需求提出人');
    const recorder = recordUsers(record, '需求录入人');
    const dataOwner = recordUsers(record, '数据负责人');
    const devOwner = recordUsers(record, '研发负责人');
    const dsAcceptor = recordUsers(record, 'DS验收人');
    const actor = actorId || actorLarkId || '';
    const actorCandidates = uniqueStrings([actorId || '', actorLarkId || '']);
    const stage = cellText(record.record['流程阶段']) || '需求录入';
    const requirementFields = {
      ...pickFields(record.record, ['需求名称', '需求提出人', '需求录入人', '需求背景', '需求链接', '指标/使用场景', '优先级', '端', '数据负责人', '研发负责人', 'DS验收人']),
      需求提出人: requester.items,
      需求录入人: recorder.items,
      数据负责人: dataOwner.items,
      研发负责人: devOwner.items,
      DS验收人: dsAcceptor.items,
    };
    const devFields = {
      ...pickFields(record.record, ['研发负责人', '埋点开发状态']),
      研发负责人: devOwner.items,
    };
    const acceptanceFields = {
      ...pickFields(record.record, ['DS验收人', 'DS验收状态', 'DS验收证据', 'DS验收时间']),
      DS验收人: dsAcceptor.items,
    };

    return {
      ...this.toTrackingRecord(record, source),
      reviewStatus: cellText(record.record['评审状态']) || '草稿',
      devStatus: cellText(record.record['埋点开发状态']) || '未开始',
      acceptanceStatus: cellText(record.record['DS验收状态']) || '未开始',
      requester: requester.items,
      requesterIds: requester.ids,
      recorder: recorder.items,
      recorderIds: recorder.ids,
      dataOwner: dataOwner.items,
      dataOwnerIds: dataOwner.ids,
      devOwner: devOwner.items,
      devOwnerIds: devOwner.ids,
      dsAcceptor: dsAcceptor.items,
      dsAcceptorIds: dsAcceptor.ids,
      requirementFields,
      designFields: pickFields(record.record, ['evt_id', '事件中文名', '优先级', '端', '事件定义', '触发时机', 'UI图', '处理方', '公共属性要求', '版本', '最低版本', '变更类型', '参数拆行状态']),
      reviewFields: pickFields(record.record, ['评审状态', '评审意见']),
      devFields,
      acceptanceFields,
      launchFields: pickFields(record.record, ['发布门禁状态', '发布门禁失败原因', '发布状态', '发布错误', '上线监控状态', '上线监控结论', '发布时间']),
      archiveFields: pickFields(record.record, ['正式状态', '稳定归档时间']),
      relatedEvents: [],
      permissions: actor
        ? calculateRecordPermissions(actor, actorCandidates, requester.ids, dataOwner.ids, devOwner.ids, dsAcceptor.ids, permissionConfig, stage)
        : calculatePermissions('', [], [], []),
    };
  }

  private isParamForDesign(record: BitableRecord, recordId: string, evtId: string): boolean {
    const sourceRecordId = cellText(record.record['来源设计记录ID']);
    const links = cellIds(record.record['关联设计']);
    if (sourceRecordId || links.length) {
      return sourceRecordId === recordId || links.includes(recordId);
    }
    return Boolean(evtId) && cellText(record.record['evt_id']) === evtId;
  }

  private toParamDetail(record: BitableRecord, source: TrackingSource): ParamDetail {
    const requiredRule = cellText(record.record['必传规则']);
    const evtId = cellText(record.record['evt_id']);
    const paramName = cellText(record.record['参数名']);
    return {
      recordId: encodeScopedRecordId(source, record.id),
      paramKey: buildParamKey(evtId, paramName) || cellText(record.record['设计参数主键']),
      evtId,
      paramName,
      paramType: cellText(record.record['数据类型']) || 'STRING',
      required: requiredRule === '必传' || requiredRule === '条件必传',
      requiredRule: normalizeRequiredRule(requiredRule),
      triggerCondition: cellText(record.record['条件说明']),
      enumRange: cellText(record.record['枚举/取值范围']),
      definition: cellText(record.record['参数定义']),
      defaultValue: cellText(record.record['默认值/示例']),
      example: cellText(record.record['默认值/示例']),
      platform: normalizeParamApplicability(cellText(record.record[source === 'web' ? 'Web适用性' : 'App适用性']), source),
      status: cellText(record.record['参数状态']) || '草稿',
      version: cellText(record.record['版本']),
      changeType: cellText(record.record['变更类型']) || '新增',
    };
  }

  private toParamRecord(source: TrackingSource, recordId: string, evtId: string, version: string, body: CreateParamRequest): Record<string, unknown> {
    const paramName = (body.paramName || '').trim();
    const eventId = (body.evtId || evtId).trim();
    const platformField = source === 'web' ? 'Web适用性' : 'App适用性';
    return {
      evt_id: eventId,
      参数名: paramName,
      数据类型: normalizeParamType(body.paramType),
      必传规则: normalizeRequiredRule(body.requiredRule, body.required),
      条件说明: body.triggerCondition || '',
      '枚举/取值范围': body.enumRange || '',
      参数定义: body.definition || '',
      '默认值/示例': body.example || body.defaultValue || '',
      [platformField]: normalizeParamApplicability(body.platform, source),
      参数状态: normalizeParamStatus(body.status),
      版本: version || '1.0.0',
      变更类型: normalizeChangeType(body.changeType),
      来源设计记录ID: recordId,
      关联设计: [recordId],
    };
  }
}

function compareTrackingRecord(a: TrackingRecord, b: TrackingRecord): number {
  const priorityDiff = (PRIORITY_WEIGHT[a.priority] ?? 9) - (PRIORITY_WEIGHT[b.priority] ?? 9);
  if (priorityDiff !== 0) return priorityDiff;
  return b.updatedAt - a.updatedAt;
}

function groupWorkbenchRecords(records: SourcedWorkbenchRecord[]): WorkbenchRecordGroup[] {
  const groups = new Map<string, WorkbenchRecordGroup>();

  for (const { source, record } of records) {
    const requestId = cellText(record.record['需求ID']).trim();
    const groupKey = `${source}:${requestId || record.id}`;
    const group = groups.get(groupKey);
    if (group) {
      group.records.push(record);
    } else {
      groups.set(groupKey, {
        source,
        requestId,
        records: [record],
      });
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    records: [...group.records].sort(compareRecordForGroup),
  }));
}

function selectGroupRepresentative(records: BitableRecord[]): BitableRecord {
  return [...records].sort(compareRecordForGroup)[0];
}

function selectGroupRequestRecord(records: BitableRecord[]): BitableRecord {
  return [...records].sort((a, b) => {
    const timeDiff = cellTimestamp(a.record['创建时间']) - cellTimestamp(b.record['创建时间']);
    if (timeDiff !== 0) return timeDiff;
    return compareRecordForGroup(a, b);
  })[0];
}

function getGroupRequestName(records: BitableRecord[], fallbackRecord: BitableRecord): string {
  const requestName = [...records]
    .sort((a, b) => {
      const timeDiff = cellTimestamp(a.record['创建时间']) - cellTimestamp(b.record['创建时间']);
      if (timeDiff !== 0) return timeDiff;
      return compareRecordForGroup(a, b);
    })
    .map((record) => cellText(record.record['需求名称']).trim())
    .find(Boolean);
  return requestName || cellText(fallbackRecord.record['事件中文名']) || '未命名需求';
}

function getRequestNameFromRecords(records: BitableRecord[], currentRecord: Record<string, unknown>): string {
  const requestId = cellText(currentRecord['需求ID']).trim();
  const candidates = requestId
    ? records.filter((record) => cellText(record.record['需求ID']).trim() === requestId)
    : [];
  const requestName = candidates
    .map((record) => cellText(record.record['需求名称']).trim())
    .find(Boolean);
  return requestName || firstText(currentRecord['需求名称'], currentRecord['事件中文名']) || '未命名需求';
}

function selectGroupWorkflowRecord(records: BitableRecord[]): BitableRecord {
  return [...records].sort(compareRecordForWorkflowProgress).at(-1) || records[0];
}

function compareRecordForWorkflowProgress(a: BitableRecord, b: BitableRecord): number {
  const uiStageDiff = getRecordUiStageProgressIndex(a) - getRecordUiStageProgressIndex(b);
  if (uiStageDiff !== 0) return uiStageDiff;
  const baseStageDiff = getRecordBaseStageIndex(a) - getRecordBaseStageIndex(b);
  if (baseStageDiff !== 0) return baseStageDiff;
  const reviewStatusDiff = getReviewStatusWeight(a) - getReviewStatusWeight(b);
  if (reviewStatusDiff !== 0) return reviewStatusDiff;
  const timeDiff = cellTimestamp(a.record['创建时间']) - cellTimestamp(b.record['创建时间']);
  if (timeDiff !== 0) return timeDiff;
  return a.id.localeCompare(b.id);
}

function compareRecordForGroup(a: BitableRecord, b: BitableRecord): number {
  const stageDiff = getRecordUiStageIndex(a) - getRecordUiStageIndex(b);
  if (stageDiff !== 0) return stageDiff;
  const priorityDiff = (PRIORITY_WEIGHT[cellText(a.record['优先级'])] ?? 9) - (PRIORITY_WEIGHT[cellText(b.record['优先级'])] ?? 9);
  if (priorityDiff !== 0) return priorityDiff;
  return cellTimestamp(b.record['创建时间']) - cellTimestamp(a.record['创建时间']);
}

function getRecordUiStageIndex(record: BitableRecord): number {
  const uiStage = getUiStageFromBase(cellText(record.record['流程阶段']), cellText(record.record['评审状态']));
  const index = UI_STAGE_NODES.indexOf(uiStage);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function getRecordUiStageProgressIndex(record: BitableRecord): number {
  const uiStage = getUiStageFromBase(cellText(record.record['流程阶段']), cellText(record.record['评审状态']));
  return UI_STAGE_NODES.indexOf(uiStage);
}

function getRecordBaseStageIndex(record: BitableRecord): number {
  return getStageIndex(cellText(record.record['流程阶段']) || '需求录入');
}

function getReviewStatusWeight(record: BitableRecord): number {
  const weights: Record<string, number> = {
    草稿: 0,
    已拒绝: 1,
    评审中: 2,
    已通过: 3,
  };
  return weights[cellText(record.record['评审状态'])] ?? 0;
}

function getHighestPriority(records: BitableRecord[]): string {
  return records
    .map((record) => cellText(record.record['优先级']) || 'P2')
    .sort((a, b) => (PRIORITY_WEIGHT[a] ?? 9) - (PRIORITY_WEIGHT[b] ?? 9))[0] || 'P2';
}

function mergePlatforms(records: BitableRecord[]): string {
  const values = records.flatMap((record) =>
    cellText(record.record['端'])
      .split(/[、,，/]/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const unique = uniqueStrings(values);
  return unique.length ? unique.join('、') : '-';
}

function matchesPlatformFilter(record: TrackingRecord, platform: string): boolean {
  const normalized = platform.trim();
  if (!normalized) return true;
  if (normalized === 'App') return record.source === 'app';
  if (normalized === 'Web') return record.source === 'web' || record.platform.includes('Web');
  return record.platform
    .split(/[、,，/]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .includes(normalized);
}

function mergeRequestSharedFields(records: BitableRecord[]): Record<string, unknown> {
  const sharedFields: Record<string, unknown> = {};
  const requestName = records
    .map((record) => cellText(record.record['需求名称']).trim())
    .find(Boolean);
  if (requestName) {
    sharedFields['需求名称'] = requestName;
  }

  for (const fieldName of USER_FIELD_NAME_LIST) {
    const users = mergeRecordUserRefs(records, fieldName);
    if (users.length) {
      sharedFields[fieldName] = users;
    }
  }
  const notificationSnapshot = buildRequestNotificationIdentitySnapshot(records);
  if (Object.keys(notificationSnapshot).length) {
    sharedFields[NOTIFICATION_IDENTITY_FIELD] = serializeNotificationIdentitySnapshot(notificationSnapshot);
  }

  return sharedFields;
}

function mergeRecordUsers(records: BitableRecord[], fieldName: string): { ids: string[]; names: string[] } {
  const users = mergeRecordUserRefs(records, fieldName);
  return toUserCollection(users);
}

function recordUsers(record: BitableRecord, fieldName: string): { ids: string[]; names: string[]; items: TrackingUserRef[] } {
  return toUserCollection(mergeRecordUserRefs([record], fieldName));
}

function toUserCollection(users: TrackingUserRef[]): { ids: string[]; names: string[]; items: TrackingUserRef[] } {
  return {
    ids: uniqueStrings(users.flatMap((user) => [user.user_id, user.larkUserId || '', user.email || ''])),
    names: users.map((user) => user.name || '').filter(Boolean),
    items: users,
  };
}

function mergeRecordUserRefs(records: BitableRecord[], fieldName: string): TrackingUserRef[] {
  const idToUser = new Map<string, TrackingUserRef>();
  for (const record of records) {
    const baseUsers = cellUsers(record.record[fieldName]).items.map(enrichDefaultProjectUser);
    mergeUserRefsIntoMap(idToUser, baseUsers);
    const snapshotUsers = parseNotificationIdentitySnapshot(record.record[NOTIFICATION_IDENTITY_FIELD])[fieldName] || [];
    mergeUserRefsIntoMap(idToUser, filterSnapshotUsersForBaseUsers(snapshotUsers, baseUsers));
  }
  return Array.from(idToUser.values());
}

function mergeUserRefsIntoMap(idToUser: Map<string, TrackingUserRef>, users: TrackingUserRef[]): void {
  for (const user of users) {
    const userKeys = userIdentityKeys(user);
    const key = findExistingUserRefKey(idToUser, userKeys) || userKeys[0] || '';
    if (!key) continue;
    const current = idToUser.get(key);
    const larkUserId = current?.larkUserId || user.larkUserId;
    const email = current?.email || user.email;
    const name = current?.name || user.name;
    idToUser.set(key, {
      user_id: current?.user_id || user.user_id || key,
      ...(larkUserId ? { larkUserId } : {}),
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
    });
  }
}

function findExistingUserRefKey(idToUser: Map<string, TrackingUserRef>, keys: string[]): string | undefined {
  if (!keys.length) return undefined;
  for (const [existingKey, existingUser] of idToUser.entries()) {
    const existingKeys = userIdentityKeys(existingUser);
    if (keys.some((key) => existingKeys.includes(key) || key === existingKey)) {
      return existingKey;
    }
  }
  return undefined;
}

function userIdentityKeys(user: TrackingUserRef): string[] {
  return uniqueStrings([
    user.user_id || '',
    user.larkUserId || '',
    normalizeSnapshotEmail(user.email),
  ]);
}

function normalizeSnapshotEmail(value?: string): string {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}

function buildWorkflowNotificationRecipients(records: BitableRecord[], fieldNames: string[]): WorkflowNotificationRecipient[] {
  return fieldNames.flatMap((fieldName) =>
    mergeRecordUserRefs(records, fieldName).map((user) => ({
      ...user,
      role: getNotificationRoleLabel(fieldName),
    })),
  );
}

function buildMergedNotificationIdentitySnapshot(
  source: TrackingSource,
  currentRecord: Record<string, unknown>,
  fields: Record<string, unknown>,
): string | null {
  if (!hasWorkbenchField(source, NOTIFICATION_IDENTITY_FIELD)) return null;
  const touchedUserFields = USER_FIELD_NAME_LIST.filter((fieldName) => Object.prototype.hasOwnProperty.call(fields, fieldName));
  if (!touchedUserFields.length) return null;

  const snapshot = parseNotificationIdentitySnapshot(currentRecord[NOTIFICATION_IDENTITY_FIELD]);
  for (const fieldName of touchedUserFields) {
    const users = toNotificationSnapshotUsers(fields[fieldName]);
    if (users.length) {
      snapshot[fieldName] = users;
    }
  }
  return serializeNotificationIdentitySnapshot(snapshot);
}

function buildNotificationIdentitySnapshot(valueByFieldName: Record<string, unknown>): string {
  const snapshot: NotificationIdentitySnapshot = {};
  for (const fieldName of USER_FIELD_NAME_LIST) {
    const users = toNotificationSnapshotUsers(valueByFieldName[fieldName]);
    if (users.length) {
      snapshot[fieldName] = users;
    }
  }
  return serializeNotificationIdentitySnapshot(snapshot);
}

function buildRequestNotificationIdentitySnapshot(records: BitableRecord[]): NotificationIdentitySnapshot {
  const snapshot: NotificationIdentitySnapshot = {};
  for (const fieldName of USER_FIELD_NAME_LIST) {
    const users = mergeRecordUserRefs(records, fieldName);
    if (users.length) snapshot[fieldName] = users;
  }
  return snapshot;
}

function filterSnapshotUsersForBaseUsers(snapshotUsers: TrackingUserRef[], baseUsers: TrackingUserRef[]): TrackingUserRef[] {
  if (!baseUsers.length) return snapshotUsers;
  const baseHasDeliverableIdentity = baseUsers.some(hasDeliverableUserIdentity);
  if (!baseHasDeliverableIdentity) return snapshotUsers;
  return snapshotUsers.filter((user) => hasDeliverableUserIdentity(user));
}

function hasDeliverableUserIdentity(user: TrackingUserRef): boolean {
  return Boolean(user.larkUserId || normalizeSnapshotEmail(user.email) || user.user_id?.startsWith('ou_'));
}

function parseNotificationIdentitySnapshot(value: unknown): NotificationIdentitySnapshot {
  const text = cellText(value).trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const snapshot: NotificationIdentitySnapshot = {};
    for (const fieldName of USER_FIELD_NAME_LIST) {
      const users = toNotificationSnapshotUsers(parsed[fieldName]);
      if (users.length) snapshot[fieldName] = users;
    }
    return snapshot;
  } catch {
    return {};
  }
}

function serializeNotificationIdentitySnapshot(snapshot: NotificationIdentitySnapshot): string {
  const normalized: NotificationIdentitySnapshot = {};
  for (const fieldName of USER_FIELD_NAME_LIST) {
    const users = toNotificationSnapshotUsers(snapshot[fieldName]);
    if (users.length) normalized[fieldName] = users;
  }
  return Object.keys(normalized).length ? JSON.stringify(normalized) : '';
}

function toNotificationSnapshotUsers(value: unknown): TrackingUserRef[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const userMap = new Map<string, TrackingUserRef>();
  for (const item of values) {
    const parsedUser = toNotificationSnapshotUser(item);
    const user = parsedUser ? enrichDefaultProjectUser(parsedUser) : null;
    if (!user) continue;
    const key = primaryUserRefKey(user);
    if (!key) continue;
    const current = userMap.get(key);
    userMap.set(key, {
      user_id: current?.user_id || user.user_id || key,
      larkUserId: current?.larkUserId || user.larkUserId,
      email: current?.email || user.email,
      name: current?.name || user.name,
    });
  }
  return Array.from(userMap.values());
}

function toNotificationSnapshotUser(item: unknown): TrackingUserRef | null {
  if (typeof item === 'string' || typeof item === 'number') {
    const id = String(item).trim();
    if (!id) return null;
    return {
      user_id: id,
      ...(id.startsWith('ou_') ? { larkUserId: id } : {}),
    };
  }
  if (!item || typeof item !== 'object') return null;

  const user = item as Record<string, unknown>;
  const candidates = userObjectCandidates(user);
  const id = firstUserCandidateValue(candidates, [
    'user_id',
    'userId',
    'userID',
    'miaoda_user_id',
    'miaodaUserID',
    'employee_id',
    'employeeID',
    'id',
    'larkUserId',
    'larkUserID',
    'larkID',
    'open_id',
    'openId',
  ], isNonEmptyIdCandidate);
  const larkUserId = firstUserCandidateValue(candidates, [
    'larkUserId',
    'larkUserID',
    'lark_user_id',
    'larkID',
    'lark_id',
    'open_id',
    'openId',
    'id',
    'user_id',
  ], (candidate) => typeof candidate === 'string' && candidate.trim().startsWith('ou_'));
  const email = firstUserCandidateValue(candidates, [
    'email',
    'mail',
    'emailAddress',
    'email_address',
  ], (candidate) => typeof candidate === 'string' && candidate.includes('@'));
  const name = firstLocalizedUserCandidateValue(candidates, ['name', 'en_name', 'display_name', 'displayName']);
  const normalizedId = id ? String(id) : larkUserId || email || '';
  if (!normalizedId) return null;
  return {
    user_id: normalizedId,
    ...(larkUserId || normalizedId.startsWith('ou_') ? { larkUserId: larkUserId || normalizedId } : {}),
    ...(email ? { email } : {}),
    ...(name && name !== normalizedId ? { name } : {}),
  };
}

function primaryUserRefKey(user: TrackingUserRef): string {
  return user.larkUserId || normalizeSnapshotEmail(user.email) || user.user_id || '';
}

function userObjectCandidates(user: Record<string, unknown>): Record<string, unknown>[] {
  const raw = user.raw;
  const candidates = [user];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    candidates.push(raw as Record<string, unknown>);
  }
  return candidates;
}

function firstUserCandidateValue(
  candidates: Record<string, unknown>[],
  keys: string[],
  predicate: (value: unknown) => boolean,
): string {
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = candidate[key];
      if (predicate(value)) return String(value).trim();
    }
  }
  return '';
}

function firstLocalizedUserCandidateValue(candidates: Record<string, unknown>[], keys: string[]): string {
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = localizedText(candidate[key]);
      if (value) return value;
    }
  }
  return '';
}

function isNonEmptyIdCandidate(candidate: unknown): boolean {
  return (typeof candidate === 'string' && candidate.trim().length > 0) || typeof candidate === 'number';
}

function getNotificationRoleLabel(fieldName: string): string {
  const labels: Record<string, string> = {
    需求提出人: '需求提出人',
    数据负责人: '数据负责人',
    研发负责人: '研发负责人',
    DS验收人: '埋点校验人',
  };
  return labels[fieldName] || fieldName;
}

function pickFields(record: Record<string, Cell>, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [field, USER_FIELD_NAMES.has(field) ? cellUsers(record[field]).items : ATTACHMENT_FIELD_NAMES.has(field) ? cellFiles(record[field]) : cellText(record[field])]),
  );
}

function cellFiles(value: Cell): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function attachmentDirectUrl(file: TrackingAttachment): string {
  const direct = [
    file.url,
    file.download_url,
    file.downloadUrl,
    file.tmp_url,
    file.thumbnail_url,
    file.link,
  ]
    .map((value) => cellText(value).trim())
    .find(isPreviewableDirectUrl);
  if (direct) return direct;

  const path = cellText(file.file_path || file.filePath).trim();
  return isPreviewableDirectUrl(path) ? path : '';
}

function attachmentStoragePathCandidates(file: TrackingAttachment): string[] {
  return uniqueStrings([
    cellText(file.file_path || file.filePath),
    attachmentFileName(file),
  ])
    .map(normalizeFilePath)
    .filter(Boolean);
}

function attachmentFileName(file: TrackingAttachment): string {
  const explicitName = cellText(file.name || file.fileName).trim();
  if (explicitName) return explicitName;
  const path = cellText(file.file_path || file.filePath).trim();
  if (!path) return '';
  return path.split('/').pop() || path;
}

function attachmentPreviewCacheKey(file: TrackingAttachment): string {
  return [
    file.file_token,
    file.fileToken,
    file.token,
    file.url,
    file.download_url,
    file.downloadUrl,
    file.file_path,
    file.filePath,
    file.name,
    file.fileName,
  ]
    .map((value) => cellText(value).trim())
    .filter(Boolean)
    .join('|') || 'empty';
}

function normalizeFilePath(value: string): string {
  const text = String(value || '').trim();
  if (!text || isPreviewableHttpUrl(text)) return '';

  const marker = '/runtime/api/v1/storage/object/';
  const markerIndex = text.indexOf(marker);
  if (markerIndex >= 0) {
    const rest = text.slice(markerIndex + marker.length);
    const pathStart = rest.indexOf('/');
    return safeDecodeURIComponent(pathStart >= 0 ? rest.slice(pathStart + 1) : '');
  }

  return safeDecodeURIComponent(text.replace(/^\/+/, ''));
}

function normalizeAttachmentName(value: string): string {
  return safeDecodeURIComponent(String(value || '').trim()).toLowerCase();
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isPreviewableDirectUrl(value?: string): value is string {
  const text = String(value || '').trim();
  return (
    isPreviewableHttpUrl(text) ||
    text.startsWith('/app/') ||
    text.startsWith('/spark/app/') ||
    text.startsWith('/runtime/api/v1/storage/object/') ||
    text.startsWith('/aily/api/v1/files/static/')
  );
}

function isPreviewableHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function cellText(value: Cell): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => cellText(item))
      .filter(Boolean)
      .join('、');
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    if (typeof objectValue.name === 'string') return objectValue.name;
    if (typeof objectValue.link === 'string') return objectValue.link;
    if (typeof objectValue.url === 'string') return objectValue.url;
    if (typeof objectValue.text === 'string') return objectValue.text;
    if (typeof objectValue.id === 'string') return objectValue.id;
    if (typeof objectValue.link === 'string') return objectValue.link;
    return '';
  }
  return '';
}

function firstText(...values: Cell[]): string {
  return values.map(cellText).find(Boolean) || '';
}

function cellUsers(value: Cell): {
  ids: string[];
  names: string[];
  items: TrackingUserRef[];
} {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.reduce(
    (acc, item) => {
      if (typeof item === 'string' || typeof item === 'number') {
        const id = String(item);
        acc.ids.push(id);
        acc.items.push({ user_id: id });
        return acc;
      }
      if (item && typeof item === 'object') {
        const user = item as Record<string, unknown>;
        const id =
          [user.user_id, user.userId, user.userID, user.miaoda_user_id, user.miaodaUserID, user.employee_id, user.employeeID, user.id, user.open_id, user.openId, user.larkUserId, user.larkUserID, user.larkID, user.lark_user_id].find(
            (candidate): candidate is string | number => (typeof candidate === 'string' && candidate.length > 0) || typeof candidate === 'number',
          ) || '';
        const name = localizedText(user.name) || localizedText(user.en_name);
        const email = [user.email, user.mail, user.emailAddress, user.email_address].find(
          (candidate): candidate is string => typeof candidate === 'string' && candidate.includes('@'),
        );
        const normalizedId = id ? String(id) : '';
        const larkUserId = [user.larkUserId, user.larkUserID, user.lark_user_id, user.open_id, user.openId, user.larkID, user.lark_id].find(
          (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0,
        );
        const resolvedLarkUserId = larkUserId || (normalizedId.startsWith('ou_') ? normalizedId : undefined);
        if (normalizedId) acc.ids.push(normalizedId);
        if (name && name !== normalizedId) acc.names.push(name);
        if (normalizedId) {
          acc.items.push({
            user_id: normalizedId,
            ...(resolvedLarkUserId ? { larkUserId: resolvedLarkUserId } : {}),
            ...(email ? { email } : {}),
            ...(name && name !== normalizedId ? { name } : {}),
          });
        }
      }
      return acc;
    },
    {
      ids: [] as string[],
      names: [] as string[],
      items: [] as TrackingUserRef[],
    },
  );
}

function localizedText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';

  const text = value as Record<string, unknown>;
  for (const key of ['zh_cn', 'en_us', 'ja_jp']) {
    if (typeof text[key] === 'string' && text[key].trim()) {
      return text[key].trim();
    }
  }
  return '';
}

function cellIds(value: Cell): string[] {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const id = (item as Record<string, unknown>).id;
        return typeof id === 'string' ? id : '';
      }
      return '';
    })
    .filter(Boolean);
}

function cellTimestamp(value: Cell): number {
  if (typeof value === 'number') {
    return value;
  }
  const text = cellText(value);
  if (!text) return 0;
  if (/^\d+$/.test(text)) {
    return Number(text);
  }
  const normalized = text.replace(' ', 'T');
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function createUserCells(value?: unknown): number[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[、,，/]/) : value ? [value] : [];

  return uniqueNumbers(values.map(extractNumericUserId).filter((id): id is number => id !== null));
}

function extractNumericUserId(item: unknown): number | null {
  if (typeof item === 'number') {
    return Number.isSafeInteger(item) && item > 0 ? item : null;
  }
  if (typeof item === 'string') {
    const trimmed = item.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const id = Number(trimmed);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestException(`人员 ID 超出安全范围：${trimmed}`);
    }
    return id;
  }
  if (item && typeof item === 'object') {
    const user = item as Record<string, unknown>;
    for (const key of ['user_id', 'userId', 'userID', 'miaoda_user_id', 'miaodaUserID', 'employee_id', 'employeeID', 'id']) {
      const id = extractNumericUserId(user[key]);
      if (id !== null) return id;
    }
  }
  return null;
}

function uniqueNumbers(values: number[] = []): number[] {
  return Array.from(new Set(values));
}

function emptyPermissionConfig(): PermissionConfig {
  return {
    admins: [],
    dataScientists: [],
    developers: [],
    acceptors: [],
    viewers: [],
  };
}

function normalizePermissionConfig(config?: Partial<PermissionConfig>): PermissionConfig {
  return {
    admins: uniqueStrings(config?.admins || []),
    dataScientists: uniqueStrings(config?.dataScientists || []),
    developers: uniqueStrings(config?.developers || []),
    acceptors: uniqueStrings(config?.acceptors || []),
    viewers: uniqueStrings(config?.viewers || []),
    updatedAt: config?.updatedAt,
    updatedBy: config?.updatedBy,
  };
}

function parsePermissionConfig(value: Cell): PermissionConfig {
  const text = cellText(value);
  if (!text) return emptyPermissionConfig();
  try {
    const parsed = JSON.parse(text) as Partial<PermissionConfig>;
    return normalizePermissionConfig(parsed);
  } catch {
    return emptyPermissionConfig();
  }
}

function uniqueStrings(values: string[] = []): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function isBootstrapAdmin(actorId?: string): boolean {
  return Boolean(actorId && BOOTSTRAP_ADMIN_USER_IDS.has(actorId));
}

function isBusinessWorkbenchRecord(record: BitableRecord): boolean {
  const evtId = cellText(record.record['evt_id']);
  const type = cellText(record.record['记录类型']);
  return evtId !== PERMISSION_RECORD_EVT_ID && type !== '模板' && type !== PERMISSION_RECORD_TYPE && (type === '埋点设计' || Boolean(evtId) || Boolean(cellText(record.record['事件中文名'])));
}

function isAdminActor(actorCandidates: string[], permissionConfig?: PermissionConfig | null): boolean {
  if (actorCandidates.some((candidate) => isBootstrapAdmin(candidate))) {
    return true;
  }
  if (!permissionConfig) return false;
  return intersects(actorCandidates, permissionConfig.admins || []);
}

function toPlatformCell(platform?: string, source?: TrackingSource): string[] {
  const raw = String(platform || '').trim();
  if (source === 'web' || raw === 'Web' || raw === 'Web通用') {
    return ['Web'];
  }
  if (!raw) return ['iOS', 'Android'];
  if (raw === 'iOS、Android' || raw === 'iOS,Android' || raw === 'iOS, Android') {
    return ['iOS', 'Android'];
  }
  return raw
    .split(/[、,，/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSource(value?: string): TrackingSource {
  return value === 'web' ? 'web' : 'app';
}

function normalizeSourceFilter(value?: string): TrackingSourceFilter {
  return value === 'app' || value === 'web' ? value : 'all';
}

function createUniqueRequestId(source: TrackingSource, existingIds: string[] = []): string {
  const prefix = source === 'web' ? 'WEB_REQ' : 'APP_REQ';
  const existing = new Set(existingIds.map((id) => String(id || '').trim()).filter(Boolean));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    const id = `${prefix}_${timestamp}_${random}`;
    if (!existing.has(id)) return id;
  }
  return `${prefix}_${Date.now().toString(36).toUpperCase()}_${process.hrtime.bigint().toString(36).toUpperCase()}`;
}

function workbenchKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webWorkbench' : 'workbench';
}

function hasWorkbenchField(source: TrackingSource, fieldName: string): boolean {
  return (BITABLE_FIELDS[workbenchKey(source)] || []).some((field) => field.name === fieldName);
}

function paramDetailKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webParamDetail' : 'paramDetail';
}

function queryLibraryKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webQueryLibrary' : 'queryLibrary';
}

function officialParamDetailKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webOfficialParamDetail' : 'officialParamDetail';
}

function enumDictionaryKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webEnumDictionary' : 'enumDictionary';
}

function deprecatedEventKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webDeprecatedEvent' : 'deprecatedEvent';
}

function deprecatedParamDetailKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webDeprecatedParamDetail' : 'deprecatedParamDetail';
}

function paramFields(source: TrackingSource): readonly string[] {
  return source === 'web' ? WEB_PARAM_FIELDS : APP_PARAM_FIELDS;
}

function officialParamFields(source: TrackingSource): readonly string[] {
  return source === 'web' ? WEB_OFFICIAL_PARAM_FIELDS : APP_OFFICIAL_PARAM_FIELDS;
}

function enumDictionaryFields(): readonly string[] {
  return [
    '枚举主键',
    'evt_id',
    '参数名',
    '枚举值',
    '枚举中文名',
    '枚举定义',
    '是否兜底值',
    '备注',
    '关联设计参数',
    '关联正式参数',
    '下线版本',
    '枚举状态',
    '首次版本',
  ];
}

function deprecatedEventFields(): readonly string[] {
  return [
    '废弃主键',
    'evt_id',
    '事件中文名',
    '需求ID',
    '需求名称',
    '端',
    '版本',
    '废弃原因',
    '废弃时间',
    '原流程阶段',
    '原正式状态',
    '原工作台记录ID',
    '原正式记录ID',
    '事件定义',
    '触发时机',
    '指标/使用场景',
  ];
}

function deprecatedParamFields(): readonly string[] {
  return [
    '废弃参数主键',
    'evt_id',
    '事件中文名',
    '参数名',
    '数据类型',
    '必传规则',
    '条件说明',
    '枚举/取值范围',
    '参数定义',
    '版本',
    '参数状态',
    '事件状态',
    '废弃原因',
    '废弃时间',
    '原设计参数ID',
    '原正式参数ID',
    '来源表',
    '备注',
  ];
}

function officialParamBaseLink(source: TrackingSource): string {
  return source === 'web' ? WEB_OFFICIAL_PARAM_LINK : APP_OFFICIAL_PARAM_LINK;
}

function toOfficialQueryRecord(
  source: TrackingSource,
  designRecordId: string,
  record: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!shouldSyncOfficialQueryRecord(record)) return null;

  const evtId = cellText(record['evt_id']).trim();
  const eventName = cellText(record['事件中文名']).trim();
  if (!evtId || !eventName) return null;

  const minimumVersion = firstText(record['最低版本'], record['版本']);
  const dataOwners = createOfficialUserCells(record, '数据负责人');
  const devOwners = createOfficialUserCells(record, '研发负责人');
  const dsAcceptors = createOfficialUserCells(record, 'DS验收人');
  const archiveTime = cellTimestamp(record['稳定归档时间']);
  const priority = cellText(record['优先级']).trim();
  const handler = cellText(record['处理方']).trim();
  const category = cellText(record['一级分类']).trim();
  const commonProps = cellText(record['公共属性要求']).trim();

  return {
    evt_id: evtId,
    事件中文名: eventName,
    端: toPlatformCell(cellText(record['端']), source),
    上线版本: firstText(record['版本'], record['最低版本']) || '1.0.0',
    ...(minimumVersion ? { 最低版本: minimumVersion } : {}),
    状态: getOfficialQueryStatus(record),
    生命周期状态: cellText(record['流程阶段']) || '上线监控',
    参数明细入口: officialParamBaseLink(source),
    事件定义: cellText(record['事件定义']),
    触发时机: cellText(record['触发时机']),
    '指标/使用场景': cellText(record['指标/使用场景']),
    ...(priority ? { 优先级: priority } : {}),
    ...(dataOwners.length ? { 数据负责人: dataOwners } : {}),
    ...(devOwners.length ? { 研发负责人: devOwners } : {}),
    ...(dsAcceptors.length ? { DS验收人: dsAcceptors } : {}),
    ...(archiveTime ? { 稳定归档时间: archiveTime } : {}),
    ...(handler ? { 处理方: handler } : {}),
    ...(category ? { 一级分类: category } : {}),
    ...(commonProps ? { 公共属性要求: commonProps } : {}),
    ...(designRecordId ? { 源事件记录ID: designRecordId } : {}),
  };
}

function createOfficialUserCells(record: Record<string, unknown>, fieldName: string): number[] {
  const baseUsers = cellUsers(record[fieldName]).items;
  const snapshotUsers = parseNotificationIdentitySnapshot(record[NOTIFICATION_IDENTITY_FIELD])[fieldName] || [];
  return createUserCells(
    [...baseUsers, ...snapshotUsers].map(enrichDefaultProjectUser),
  );
}

function toOfficialParamRecord(source: TrackingSource, designRecord: Record<string, unknown>, designParam: Record<string, unknown>, officialEventRecordId: string): Record<string, unknown> | null {
  const evtId = firstText(designParam.evt_id, designRecord['evt_id']).trim();
  const paramName = cellText(designParam['参数名']).trim();
  const paramKey = buildParamKey(evtId, paramName);
  if (!paramKey) return null;

  const platformField = source === 'web' ? 'Web适用性' : 'App适用性';
  const example = cellText(designParam['默认值/示例']).trim();
  const remark = cellText(designParam['备注']).trim() || (example ? `默认值/示例：${example}` : '');

  return {
    参数主键: paramKey,
    evt_id: evtId,
    事件中文名: cellText(designRecord['事件中文名']),
    参数名: paramName,
    数据类型: normalizeParamType(cellText(designParam['数据类型'])),
    必传规则: normalizeRequiredRule(cellText(designParam['必传规则'])),
    条件说明: cellText(designParam['条件说明']),
    '枚举/取值范围': cellText(designParam['枚举/取值范围']),
    参数定义: cellText(designParam['参数定义']),
    版本: firstText(designRecord['版本'], designRecord['最低版本'], designParam['版本']) || '1.0.0',
    参数状态: normalizeOfficialParamStatus(cellText(designParam['参数状态']), cellText(designParam['变更类型'])),
    事件状态: getOfficialQueryStatus(designRecord),
    来源表: '埋点设计库',
    关联事件: [officialEventRecordId],
    [platformField]: normalizeParamApplicability(cellText(designParam[platformField]), source),
    备注: remark,
  };
}

function normalizeOfficialParamStatus(paramStatus: string, changeType: string): string {
  if (paramStatus === '废弃' || changeType === '废弃') return '已废弃';
  return '正式';
}

function mergeOfficialParamRecord(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    ...incoming,
    '枚举/取值范围': mergeEnumRangeText(
      cellText(existing['枚举/取值范围']),
      cellText(incoming['枚举/取值范围']),
    ),
  };

  for (const fieldName of [
    '数据类型',
    '必传规则',
    '条件说明',
    '参数定义',
    '版本',
    '来源表',
    'App适用性',
    'Web适用性',
    '备注',
  ]) {
    if (!cellText(merged[fieldName]) && cellText(existing[fieldName])) {
      merged[fieldName] = existing[fieldName];
    }
  }

  return merged;
}

function mergeEnumRangeText(existingText: string, incomingText: string): string {
  const existingParts = splitEnumRange(existingText);
  const incomingParts = splitEnumRange(incomingText);
  const merged = uniqueStrings([...existingParts, ...incomingParts]);
  if (!merged.length) return incomingText || existingText || '';
  return merged.join(detectEnumDelimiter(existingText || incomingText));
}

function parseEnumDictionaryEntries(evtId: string, paramName: string, enumRange: string): Array<{ key: string; value: string; label: string; definition: string }> {
  const text = String(enumRange || '').trim();
  if (!text) return [];

  return uniqueStrings(splitEnumRangeForDictionary(text))
    .map((rawItem) => parseEnumDictionaryItem(rawItem))
    .filter((entry) => isValidEnumDictionaryValue(entry.value))
    .map((entry) => ({
      key: `${evtId}.${paramName}.${entry.value}`,
      value: entry.value,
      label: entry.label,
      definition: entry.definition,
    }));
}

function splitEnumRangeForDictionary(value: string): string[] {
  const normalized = value.replace(/\r/g, '\n');
  if (normalized.includes('\n')) {
    return normalized.split('\n').map((item) => item.trim()).filter(Boolean);
  }
  if (normalized.includes('//')) {
    return [normalized.trim()];
  }
  return normalized.split(/[,，、/|]+/).map((item) => item.trim()).filter(Boolean);
}

function parseEnumDictionaryItem(rawItem: string): { value: string; label: string; definition: string } {
  const item = rawItem.trim();
  const commentMatch = item.match(/^(.+?)\s*(?:\/\/|#|：|:)\s*(.+)$/);
  if (commentMatch?.[1]) {
    const value = commentMatch[1].trim();
    const label = (commentMatch[2] || '').trim();
    return {
      value,
      label,
      definition: label,
    };
  }
  return {
    value: item,
    label: '',
    definition: '',
  };
}

function isValidEnumDictionaryValue(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (['-', '—', '无', '暂无', '待确认', '无特殊参数'].includes(text)) return false;
  return !/^\.{2,}$/.test(text) && !/^…+$/.test(text);
}

function splitEnumRange(value: string): string[] {
  return String(value || '')
    .split(/[\n,，、/|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function detectEnumDelimiter(value: string): string {
  if (value.includes('\n')) return '\n';
  if (value.includes('，')) return '，';
  if (value.includes('、')) return '、';
  if (value.includes('/')) return '/';
  if (value.includes('|')) return '|';
  return ',';
}

function isRemovedDesignParam(record: Record<string, unknown>): boolean {
  const paramStatus = cellText(record['参数状态']).trim();
  const changeType = cellText(record['变更类型']).trim();
  return ['废弃', '已废弃'].includes(paramStatus) || ['删除', '废弃'].includes(changeType);
}

function isRemovedOfficialParam(record: Record<string, unknown>): boolean {
  const paramStatus = cellText(record['参数状态']).trim();
  return ['废弃', '已废弃'].includes(paramStatus);
}

function getDesignParamKey(record: Record<string, unknown>): string {
  return cellText(record['设计参数主键']) || buildParamKey(cellText(record.evt_id), cellText(record['参数名']));
}

function isOfficialParamForEvent(record: BitableRecord, officialEventRecordId: string, evtId: string): boolean {
  const linkedEventIds = cellIds(record.record['关联事件']);
  if (linkedEventIds.includes(officialEventRecordId)) return true;
  return Boolean(evtId) && cellText(record.record.evt_id) === evtId;
}

function getOfficialParamKey(record: Record<string, unknown>): string {
  return cellText(record['参数主键']) || buildParamKey(cellText(record.evt_id), cellText(record['参数名']));
}

function toDesignParamRecordFromOfficial(
  source: TrackingSource,
  designRecordId: string,
  evtId: string,
  version: string,
  officialParam: Record<string, unknown>,
): Record<string, unknown> {
  const platformField = source === 'web' ? 'Web适用性' : 'App适用性';
  const paramName = cellText(officialParam['参数名']).trim();
  return {
    设计参数主键: buildParamKey(evtId, paramName),
    evt_id: evtId,
    参数名: paramName,
    数据类型: normalizeParamType(cellText(officialParam['数据类型'])),
    必传规则: normalizeRequiredRule(cellText(officialParam['必传规则'])),
    条件说明: cellText(officialParam['条件说明']),
    '枚举/取值范围': cellText(officialParam['枚举/取值范围']),
    参数定义: cellText(officialParam['参数定义']),
    '默认值/示例': extractOfficialParamExample(officialParam),
    [platformField]: normalizeParamApplicability(cellText(officialParam[platformField]), source),
    参数状态: '草稿',
    版本: version || '1.0.0',
    变更类型: '修改',
    来源设计记录ID: designRecordId,
    关联设计: [designRecordId],
  };
}

function extractOfficialParamExample(record: Record<string, unknown>): string {
  const remark = cellText(record['备注']).trim();
  if (!remark) return '';
  return remark.replace(/^默认值\/示例[:：]\s*/, '').trim();
}

function shouldSyncOfficialQueryRecord(record: Record<string, unknown>): boolean {
  if (!cellText(record['evt_id']).trim() || !cellText(record['事件中文名']).trim()) {
    return false;
  }
  if (isValidationOnlyChange(record)) {
    return false;
  }

  const stage = cellText(record['流程阶段']);
  const officialStatus = cellText(record['正式状态']);
  const publishStatus = cellText(record['发布状态']);
  const monitorStatus = cellText(record['上线监控状态']);

  return officialStatus === '已上线' || stage === '稳定归档' || (stage === '上线监控' && publishStatus === '发布成功' && ['通过', '豁免'].includes(monitorStatus));
}

function shouldSyncDeprecatedQueryRecord(record: Record<string, unknown>): boolean {
  if (!cellText(record['evt_id']).trim()) return false;
  if (isValidationOnlyChange(record)) return false;

  const stage = cellText(record['流程阶段']);
  const officialStatus = cellText(record['正式状态']);
  const changeType = normalizeChangeType(cellText(record['变更类型']));
  return stage === '已废弃' || (stage === '稳定归档' && (officialStatus === '已废弃' || changeType === '废弃'));
}

function hasOfficialSyncFootprint(record: Record<string, unknown>): boolean {
  if (shouldSyncOfficialQueryRecord(record) || shouldSyncDeprecatedQueryRecord(record)) {
    return true;
  }

  const stage = cellText(record['流程阶段']);
  const officialStatus = cellText(record['正式状态']);
  const publishStatus = cellText(record['发布状态']);
  return ['稳定归档', '已废弃'].includes(stage) ||
    ['已上线', '已废弃'].includes(officialStatus) ||
    publishStatus === '发布成功';
}

function getOfficialQueryStatus(record: Record<string, unknown>): string {
  const officialStatus = cellText(record['正式状态']);
  if (officialStatus && officialStatus !== '待开发' && officialStatus !== '未归档') {
    return officialStatus;
  }
  return '已上线';
}

function isValidationOnlyChange(record: Record<string, unknown>): boolean {
  return normalizeChangeType(cellText(record['变更类型'])) === '仅校验';
}

function toDeprecatedEventRecord(
  source: TrackingSource,
  designRecordId: string,
  record: Record<string, unknown>,
  officialEvent?: BitableRecord,
): Record<string, unknown> | null {
  const evtId = cellText(record['evt_id']).trim();
  if (!evtId) return null;

  return {
    废弃主键: evtId,
    evt_id: evtId,
    事件中文名: cellText(record['事件中文名']),
    需求ID: cellText(record['需求ID']),
    需求名称: cellText(record['需求名称']),
    端: toPlatformCell(cellText(record['端']), source),
    版本: firstText(record['版本'], record['最低版本']) || '1.0.0',
    废弃原因: getDeprecatedReason(record, '事件标记为废弃'),
    废弃时间: cellTimestamp(record['稳定归档时间']) || Date.now(),
    原流程阶段: cellText(record['流程阶段']),
    原正式状态: firstText(officialEvent?.record['状态'], record['正式状态'], '已废弃'),
    原工作台记录ID: designRecordId,
    原正式记录ID: officialEvent?.id || '',
    事件定义: cellText(record['事件定义']),
    触发时机: cellText(record['触发时机']),
    '指标/使用场景': cellText(record['指标/使用场景']),
  };
}

function toDeprecatedParamRecord(
  designRecord: Record<string, unknown>,
  param: BitableRecord,
  sourceTable: '设计参数明细' | '正式参数明细',
  ids: { designParamId?: string; officialParamId?: string } = {},
): Record<string, unknown> | null {
  const record = param.record;
  const evtId = firstText(record['evt_id'], designRecord['evt_id']).trim();
  const paramName = cellText(record['参数名']).trim();
  const paramKey = firstText(
    record['参数主键'],
    record['设计参数主键'],
    buildParamKey(evtId, paramName),
  ).trim();
  if (!paramKey || !evtId || !paramName) return null;

  const example = cellText(record['默认值/示例']).trim();
  const remark = firstText(record['备注'], example ? `默认值/示例：${example}` : '');
  return {
    废弃参数主键: paramKey,
    evt_id: evtId,
    事件中文名: firstText(record['事件中文名'], designRecord['事件中文名']),
    参数名: paramName,
    数据类型: normalizeParamType(cellText(record['数据类型'])),
    必传规则: normalizeRequiredRule(cellText(record['必传规则'])),
    条件说明: cellText(record['条件说明']),
    '枚举/取值范围': cellText(record['枚举/取值范围']),
    参数定义: cellText(record['参数定义']),
    版本: firstText(record['版本'], designRecord['版本'], designRecord['最低版本']) || '1.0.0',
    参数状态: '已废弃',
    事件状态: shouldSyncDeprecatedQueryRecord(designRecord) ? '已废弃' : getOfficialQueryStatus(designRecord),
    废弃原因: getDeprecatedReason(designRecord, sourceTable === '正式参数明细' ? '事件标记为废弃' : '参数标记为废弃'),
    废弃时间: cellTimestamp(designRecord['稳定归档时间']) || Date.now(),
    原设计参数ID: ids.designParamId || '',
    原正式参数ID: ids.officialParamId || '',
    来源表: sourceTable,
    备注: remark,
  };
}

function getDeprecatedReason(record: Record<string, unknown>, fallback: string): string {
  return firstText(
    record['废弃原因'],
    record['发布错误'],
    record['发布门禁失败原因'],
    record['上线监控结论'],
    record['评审意见'],
    fallback,
  );
}

function encodeScopedRecordId(source: TrackingSource, rawId: string): string {
  return `${source}:${rawId}`;
}

function parseScopedRecordId(recordId: string): ScopedRecordRef {
  if (recordId.startsWith('web:')) {
    return { source: 'web', rawId: recordId.slice(4) };
  }
  if (recordId.startsWith('app:')) {
    return { source: 'app', rawId: recordId.slice(4) };
  }
  return { source: 'app', rawId: recordId };
}

function normalizeScopedRawId(recordId: string, source: TrackingSource): string {
  const trimmed = String(recordId || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('app:') || trimmed.startsWith('web:')) {
    const parsed = parseScopedRecordId(trimmed);
    return parsed.source === source ? parsed.rawId : '';
  }
  return trimmed;
}

function calculateRawRecordPermissions(record: Record<string, Cell>, actorId?: string, actorLarkId?: string, permissionConfig?: PermissionConfig | null): StagePermissions {
  const currentRecord = { id: '', record };
  const requester = recordUsers(currentRecord, '需求提出人');
  const dataOwner = recordUsers(currentRecord, '数据负责人');
  const devOwner = recordUsers(currentRecord, '研发负责人');
  const dsAcceptor = recordUsers(currentRecord, 'DS验收人');
  const actor = actorId || actorLarkId || '';
  const actorCandidates = uniqueStrings([actorId || '', actorLarkId || '']);

  return calculateRecordPermissions(actor, actorCandidates, requester.ids, dataOwner.ids, devOwner.ids, dsAcceptor.ids, permissionConfig, cellText(record['流程阶段']) || '需求录入');
}

function getRequiredPermissionsForUpdate(body: UpdateTrackingRecordRequest): PermissionKey[] {
  const required = new Set<PermissionKey>();
  const stageId = String(body.stageId || '').trim();
  const stageFieldPermissions = FIELD_PERMISSION_BY_STAGE_ID[stageId] || {};

  for (const fieldName of Object.keys(body.fields || {})) {
    if (fieldName === '流程阶段') {
      required.add(STAGE_PERMISSION_BY_STAGE_ID[stageId] || 'canEditDesign');
      continue;
    }

    required.add(stageFieldPermissions[fieldName] || FIELD_PERMISSION_BY_NAME[fieldName] || 'canEditDesign');
  }

  const transitionPermission = getTransitionPermission(body.targetStage, stageId);
  if (transitionPermission) {
    required.add(transitionPermission);
  }

  return Array.from(required);
}

function getTransitionPermission(targetStage?: string, stageId?: string): PermissionKey | null {
  if (!targetStage) return null;
  return TARGET_STAGE_PERMISSION_BY_BASE_STAGE[getBaseStageFromUi(targetStage)] || (stageId ? STAGE_PERMISSION_BY_STAGE_ID[stageId] : undefined) || 'canEditDesign';
}

function mergePermissions(items: StagePermissions[]): StagePermissions {
  return {
    canEditRequirement: items.some((item) => item.canEditRequirement),
    canEditDesign: items.some((item) => item.canEditDesign),
    canEditReview: items.some((item) => item.canEditReview),
    canEditDev: items.some((item) => item.canEditDev),
    canEditAcceptance: items.some((item) => item.canEditAcceptance),
    canEditLaunch: items.some((item) => item.canEditLaunch),
    canEditArchive: items.some((item) => item.canEditArchive),
    canEditParams: items.some((item) => item.canEditParams),
  };
}

function getGroupTodoAction(records: BitableRecord[], workflowRecord: BitableRecord, actorCandidates: string[]): { stage: string; targetStage: string; todoRole: string } | null {
  const baseStage = cellText(workflowRecord.record['流程阶段']);
  const requesters = mergeRecordUsers(records, '需求提出人').ids;
  const dataOwners = mergeRecordUsers(records, '数据负责人').ids;
  const devOwners = mergeRecordUsers(records, '研发负责人').ids;
  const dsAcceptors = mergeRecordUsers(records, 'DS验收人').ids;

  const isRequester = intersects(actorCandidates, requesters);
  const isDataOwner = intersects(actorCandidates, dataOwners);
  const isDevOwner = intersects(actorCandidates, devOwners);
  const isAcceptor = intersects(actorCandidates, dsAcceptors);
  const isProjectParticipant = isRequester || isDataOwner || isDevOwner || isAcceptor;

  switch (baseStage) {
    case '需求录入':
      if (isProjectParticipant) {
        return {
          stage: '埋点提需',
          targetStage: 'requirement',
          todoRole: getFirstRole([
            [isRequester, '提需人'],
            [isDataOwner, '数据负责人'],
            [isDevOwner, '研发负责人'],
            [isAcceptor, '埋点校验人'],
          ]),
        };
      }
      return null;
    case '埋点设计':
      if (isProjectParticipant) {
        return {
          stage: '埋点设计',
          targetStage: 'design',
          todoRole: getFirstRole([
            [isDataOwner, '数据负责人'],
            [isDevOwner, '研发负责人'],
            [isAcceptor, '埋点校验人'],
            [isRequester, '提需人'],
          ]),
        };
      }
      return null;
    case '评审通过':
      if (isProjectParticipant) {
        return {
          stage: '埋点开发',
          targetStage: 'dev',
          todoRole: getFirstRole([
            [isDevOwner, '研发负责人'],
            [isDataOwner, '数据负责人'],
            [isAcceptor, '埋点校验人'],
            [isRequester, '提需人'],
          ]),
        };
      }
      return null;
    case '埋点开发':
      if (isProjectParticipant) {
        return {
          stage: '埋点开发',
          targetStage: 'dev',
          todoRole: getFirstRole([
            [isDevOwner, '研发负责人'],
            [isDataOwner, '数据负责人'],
            [isAcceptor, '埋点校验人'],
            [isRequester, '提需人'],
          ]),
        };
      }
      return null;
    case '数据验收':
      if (isProjectParticipant) {
        return {
          stage: '埋点校验',
          targetStage: 'acceptance',
          todoRole: getFirstRole([
            [isDataOwner, '数据负责人'],
            [isAcceptor, '埋点校验人'],
            [isDevOwner, '研发负责人'],
            [isRequester, '提需人'],
          ]),
        };
      }
      return null;
    case '上线监控':
      if (isProjectParticipant) {
        return {
          stage: '埋点上线',
          targetStage: 'launch',
          todoRole: getFirstRole([
            [isDataOwner, '数据负责人'],
            [isAcceptor, '埋点校验人'],
            [isDevOwner, '研发负责人'],
            [isRequester, '提需人'],
          ]),
        };
      }
      return null;
    default:
      return null;
  }
}

function getAdminTodoAction(record: BitableRecord): { stage: string; targetStage: string; todoRole: string } | null {
  const baseStage = cellText(record.record['流程阶段']);
  switch (baseStage) {
    case '需求录入':
      return {
        stage: '埋点提需',
        targetStage: 'requirement',
        todoRole: '管理员',
      };
    case '埋点设计':
      return { stage: '埋点设计', targetStage: 'design', todoRole: '管理员' };
    case '评审通过':
    case '埋点开发':
      return { stage: '埋点开发', targetStage: 'dev', todoRole: '管理员' };
    case '数据验收':
      return {
        stage: '埋点校验',
        targetStage: 'acceptance',
        todoRole: '管理员',
      };
    case '上线监控':
      return { stage: '埋点上线', targetStage: 'launch', todoRole: '管理员' };
    default:
      return null;
  }
}

function intersects(left: string[], right: string[]): boolean {
  return left.some((item) => right.includes(item));
}

function getFirstRole(items: Array<[boolean, string]>): string {
  return items.find(([matched]) => matched)?.[1] || '项目参与人';
}

function fullStagePermissions(): StagePermissions {
  return {
    canEditRequirement: true,
    canEditDesign: true,
    canEditReview: true,
    canEditDev: true,
    canEditAcceptance: true,
    canEditLaunch: true,
    canEditArchive: true,
    canEditParams: true,
  };
}

function calculateRecordPermissions(
  actorId: string,
  actorCandidates: string[],
  requesters: string[],
  dataOwner: string[],
  devOwner: string[],
  dsAcceptor: string[],
  permissionConfig?: PermissionConfig | null,
  currentStage?: string,
) {
  const candidates = uniqueStrings([actorId, ...actorCandidates]);
  const base = mergePermissions(candidates.map((candidate) => calculatePermissions(candidate, dataOwner, devOwner, dsAcceptor)));
  const canEditRequirementByRequester = candidates.some((candidate) => requesters.includes(candidate)) && (!currentStage || currentStage === '需求录入');
  if (candidates.some((candidate) => isBootstrapAdmin(candidate))) {
    return fullStagePermissions();
  }
  if (!permissionConfig) {
    return {
      ...base,
      canEditRequirement: base.canEditRequirement || canEditRequirementByRequester,
    };
  }

  const hasRole = (roleIds: string[]) => candidates.some((candidate) => roleIds.includes(candidate));
  const isAdmin = hasRole(permissionConfig.admins);

  if (isAdmin) return fullStagePermissions();

  return {
    ...base,
    canEditRequirement: base.canEditRequirement || canEditRequirementByRequester,
  };
}

function normalizeParamType(value?: string): string {
  const raw = String(value || 'STRING')
    .trim()
    .toUpperCase();
  const typeMap: Record<string, string> = {
    STRING: 'STRING',
    TEXT: 'STRING',
    NUMBER: 'NUMBER',
    FLOAT: 'NUMBER',
    DOUBLE: 'NUMBER',
    INTEGER: 'INTEGER',
    INT: 'INTEGER',
    BOOL: 'BOOL',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
    OBJECT: 'OBJECT',
    UNKNOWN: 'UNKNOWN',
  };
  return typeMap[raw] || 'STRING';
}

function normalizeParamStatus(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw || raw === '正常' || raw === '已评审') return '草稿';
  return ['草稿', '评审中', '已通过', '已发布', '待补定义', '废弃'].includes(raw) ? raw : '草稿';
}

function normalizeRequiredRule(value?: string, required = false): string {
  const raw = String(value || '').trim();
  if (['必传', '非必传', '条件必传'].includes(raw)) return raw;
  return required ? '必传' : '非必传';
}

function buildParamKey(evtId?: string, paramName?: string): string {
  const eventId = String(evtId || '').trim();
  const name = String(paramName || '').trim();
  return eventId && name ? `${eventId}.${name}` : '';
}

function normalizeWorkbenchPatch(patch: Record<string, unknown>, source: TrackingSource): void {
  if (Object.prototype.hasOwnProperty.call(patch, '处理方')) {
    patch['处理方'] = normalizeHandler(cellText(patch['处理方']), source);
  }
  if (Object.prototype.hasOwnProperty.call(patch, '变更类型')) {
    patch['变更类型'] = normalizeChangeType(cellText(patch['变更类型']));
  }
  if (Object.prototype.hasOwnProperty.call(patch, '埋点开发状态')) {
    patch['埋点开发状态'] = normalizeDevStatus(cellText(patch['埋点开发状态']));
  }
  if (Object.prototype.hasOwnProperty.call(patch, '评审状态')) {
    patch['评审状态'] = normalizeReviewStatus(cellText(patch['评审状态']));
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'DS验收状态')) {
    patch['DS验收状态'] = normalizeAcceptanceStatus(cellText(patch['DS验收状态']));
  }
  if (Object.prototype.hasOwnProperty.call(patch, '上线监控状态')) {
    patch['上线监控状态'] = normalizeMonitorStatus(cellText(patch['上线监控状态']));
  }
  if (Object.prototype.hasOwnProperty.call(patch, '发布门禁状态')) {
    patch['发布门禁状态'] = normalizeGateStatus(cellText(patch['发布门禁状态']));
  }
  if (Object.prototype.hasOwnProperty.call(patch, '发布状态')) {
    patch['发布状态'] = normalizePublishStatus(cellText(patch['发布状态']));
  }
  if (Object.prototype.hasOwnProperty.call(patch, '正式状态')) {
    patch['正式状态'] = normalizeOfficialStatus(cellText(patch['正式状态']));
  }
  if (Object.prototype.hasOwnProperty.call(patch, '记录类型')) {
    patch['记录类型'] = '埋点设计';
  }
}

function normalizeHandler(value: unknown, source: TrackingSource): string {
  const raw = String(value || '').trim();
  const allowed = source === 'web' ? ['前端', '服务端', '前端/服务端'] : ['客户端', '客户端/服务端'];
  return allowed.includes(raw) ? raw : allowed[0];
}

function normalizeChangeType(value?: string): string {
  const raw = String(value || '').trim();
  const alias: Record<string, string> = {
    删除: '废弃',
    不变: '修改',
    仅开发校验: '仅校验',
    开发校验: '仅校验',
    不修改正式库: '仅校验',
    仅校验不归档: '仅校验',
  };
  const normalized = alias[raw] || raw;
  return ['新增', '修改', '废弃', '口径调整', '仅校验'].includes(normalized) ? normalized : '新增';
}

function normalizeDevStatus(value?: string): string {
  const raw = String(value || '').trim();
  if (raw === '已完成') return '已开发';
  return ['未开始', '开发中', '已开发', '阻塞'].includes(raw) ? raw : '未开始';
}

function normalizeReviewStatus(value?: string): string {
  const raw = String(value || '').trim();
  const normalized = raw === '需修改' ? '已拒绝' : raw;
  return ['草稿', '评审中', '已通过', '已拒绝'].includes(normalized) ? normalized : '草稿';
}

function normalizeWorkflowProgressPatch(patch: Record<string, unknown>, currentRecord: Record<string, unknown>): void {
  const stage = cellText(patch['流程阶段']) || cellText(currentRecord['流程阶段']) || '需求录入';
  if (stage === '已废弃') return;

  const index = getStageIndex(stage);
  if (index >= getStageIndex('评审通过')) {
    const reviewStatus = cellText(patch['评审状态']) || cellText(currentRecord['评审状态']);
    if (reviewStatus !== '已通过') patch['评审状态'] = '已通过';
  }
  if (index >= getStageIndex('数据验收')) {
    const devStatus = cellText(patch['埋点开发状态']) || cellText(currentRecord['埋点开发状态']);
    if (devStatus !== '已开发') patch['埋点开发状态'] = '已开发';
  }
  if (index >= getStageIndex('上线监控')) {
    const acceptanceStatus = cellText(patch['DS验收状态']) || cellText(currentRecord['DS验收状态']);
    if (!['通过', '豁免'].includes(acceptanceStatus)) patch['DS验收状态'] = '通过';
  }
  if (index >= getStageIndex('稳定归档')) {
    const publishStatus = cellText(patch['发布状态']) || cellText(currentRecord['发布状态']);
    const monitorStatus = cellText(patch['上线监控状态']) || cellText(currentRecord['上线监控状态']);
    if (publishStatus !== '发布成功') patch['发布状态'] = '发布成功';
    if (!['通过', '豁免'].includes(monitorStatus)) patch['上线监控状态'] = '通过';
  }
}

const REQUEST_WORKFLOW_FIELDS_BY_STAGE_ID: Record<string, string[]> = {
  requirement: ['流程阶段'],
  design: ['评审状态'],
  review: ['流程阶段', '评审状态', '评审意见'],
  dev: ['流程阶段', '评审状态', '埋点开发状态'],
  acceptance: ['流程阶段', '评审状态', '埋点开发状态', 'DS验收状态', 'DS验收证据', 'DS验收时间'],
  launch: ['流程阶段', '评审状态', '埋点开发状态', 'DS验收状态', 'DS验收证据', 'DS验收时间', '发布门禁状态', '发布门禁失败原因', '发布状态', '发布错误', '上线监控状态', '上线监控结论', '发布时间'],
  archive: ['流程阶段', '评审状态', '埋点开发状态', 'DS验收状态', 'DS验收证据', 'DS验收时间', '发布门禁状态', '发布门禁失败原因', '发布状态', '发布错误', '上线监控状态', '上线监控结论', '发布时间', '正式状态', '稳定归档时间'],
};

const REQUEST_WORKFLOW_FIELD_NAMES = uniqueStrings(Object.values(REQUEST_WORKFLOW_FIELDS_BY_STAGE_ID).flat());

function applyRequestDisplayState(
  record: BitableRecord,
  workflowRecord: BitableRecord,
  requestSharedFields: Record<string, unknown>,
): BitableRecord {
  const workflowFields = pickPatchFields(workflowRecord.record, REQUEST_WORKFLOW_FIELD_NAMES);
  if (record.id === workflowRecord.id && !Object.keys(requestSharedFields).length) return record;

  return {
    id: record.id,
    record: {
      ...record.record,
      ...workflowFields,
      ...requestSharedFields,
    },
  };
}

function toRequestSharedPatch(patch: Record<string, unknown>): Record<string, unknown> | null {
  const sharedPatch = pickPatchFields(patch, REQUEST_SHARED_FIELD_NAMES);
  return Object.keys(sharedPatch).length ? sharedPatch : null;
}

function toRequestWorkflowPatch(
  stageId: string | undefined,
  targetStage: string | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> | null {
  const normalizedStageId = String(stageId || '').trim();
  if (!normalizedStageId) return null;

  const hasCompletionSignal =
    Boolean(targetStage) ||
    (normalizedStageId === 'design' && cellText(patch['评审状态']) === '评审中') ||
    (normalizedStageId === 'archive' && Object.prototype.hasOwnProperty.call(patch, '正式状态'));
  if (!hasCompletionSignal) return null;

  const allowedFields = REQUEST_WORKFLOW_FIELDS_BY_STAGE_ID[normalizedStageId] || [];
  const workflowPatch = pickPatchFields(patch, allowedFields);
  return Object.keys(workflowPatch).length ? workflowPatch : null;
}

function getWorkflowNotificationPlan(
  stageId: string | undefined,
  targetStage: string | undefined,
  previousRecord: Record<string, unknown>,
  nextRecord: Record<string, unknown>,
): WorkflowNotificationPlan | null {
  const normalizedStageId = String(stageId || '').trim();
  const previousBaseStage = cellText(previousRecord['流程阶段']) || '需求录入';
  const previousReviewStatus = cellText(previousRecord['评审状态']);
  const nextReviewStatus = cellText(nextRecord['评审状态']);

  if (normalizedStageId === 'design' && nextReviewStatus === '评审中' && previousReviewStatus !== '评审中') {
    return {
      fromStage: '埋点设计',
      toStage: '埋点评审',
      targetStageId: 'review',
      actionText: '埋点设计已提交评审，请完成评审确认。',
      recipientFields: ['数据负责人', '研发负责人'],
    };
  }

  if (!targetStage) return null;

  const targetBaseStage = getBaseStageFromUi(targetStage);
  if (!targetBaseStage || targetBaseStage === previousBaseStage) return null;

  const targetPlan = WORKFLOW_NOTIFICATION_BY_TARGET_BASE_STAGE[targetBaseStage];
  if (!targetPlan) return null;

  return {
    fromStage: getUiStageFromBase(previousBaseStage, previousReviewStatus),
    ...targetPlan,
  };
}

const WORKFLOW_NOTIFICATION_BY_TARGET_BASE_STAGE: Record<string, Omit<WorkflowNotificationPlan, 'fromStage'>> = {
  埋点设计: {
    toStage: '埋点设计',
    targetStageId: 'design',
    actionText: '需求录入已完成，请开始埋点设计。',
    recipientFields: ['数据负责人'],
  },
  评审通过: {
    toStage: '埋点开发',
    targetStageId: 'dev',
    actionText: '埋点评审已通过，请开始埋点开发。',
    recipientFields: ['研发负责人'],
  },
  数据验收: {
    toStage: '埋点校验',
    targetStageId: 'acceptance',
    actionText: '埋点开发已完成，请进行数据验收。',
    recipientFields: ['数据负责人', 'DS验收人'],
  },
  上线监控: {
    toStage: '埋点上线',
    targetStageId: 'launch',
    actionText: '数据验收已通过，请关注上线监控。',
    recipientFields: ['数据负责人'],
  },
  稳定归档: {
    toStage: '归档',
    targetStageId: 'archive',
    actionText: '埋点已上线，上线监控已完成，请关注上线结果与归档状态。',
    recipientFields: PROJECT_PARTICIPANT_NOTIFICATION_FIELDS,
  },
  已废弃: {
    toStage: '归档',
    targetStageId: 'archive',
    actionText: '需求已标记废弃，请关注归档状态。',
    recipientFields: PROJECT_PARTICIPANT_NOTIFICATION_FIELDS,
  },
};

function pickPatchFields(patch: Record<string, unknown>, fieldNames: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const fieldName of fieldNames) {
    if (Object.prototype.hasOwnProperty.call(patch, fieldName)) {
      result[fieldName] = patch[fieldName];
    }
  }
  return result;
}

function shouldApplyRequestWorkflowPatch(
  record: BitableRecord,
  stageId: string | undefined,
  workflowPatch: Record<string, unknown>,
): boolean {
  const targetStage = cellText(workflowPatch['流程阶段']);
  if (targetStage) {
    const currentStage = cellText(record.record['流程阶段']) || '需求录入';
    const currentIndex = getStageIndex(currentStage);
    const targetIndex = getStageIndex(targetStage);
    if (currentIndex >= 0 && targetIndex >= 0) {
      return targetIndex >= currentIndex;
    }
    return isStageTransitionValid(currentStage, targetStage);
  }

  if (stageId === 'design' && cellText(workflowPatch['评审状态']) === '评审中') {
    return cellText(record.record['流程阶段']) === '埋点设计' && cellText(record.record['评审状态']) !== '已通过';
  }

  if (stageId === 'archive' && Object.prototype.hasOwnProperty.call(workflowPatch, '正式状态')) {
    return ['稳定归档', '已废弃'].includes(cellText(record.record['流程阶段']));
  }

  return true;
}

function isPatchNoop(record: Record<string, unknown>, patch: Record<string, unknown>): boolean {
  return Object.entries(patch).every(([fieldName, value]) =>
    cellText(record[fieldName]) === cellText(value),
  );
}

function mergeBitableRecordUpdates<T extends { id: string; record: Record<string, unknown>; nextRecord: Record<string, unknown> }>(updates: T[]): T[] {
  const merged = new Map<string, T>();
  for (const update of updates) {
    const existing = merged.get(update.id);
    if (!existing) {
      merged.set(update.id, { ...update, record: { ...update.record }, nextRecord: { ...update.nextRecord } });
      continue;
    }
    existing.record = { ...existing.record, ...update.record };
    existing.nextRecord = { ...existing.nextRecord, ...update.record };
  }
  return Array.from(merged.values());
}

function normalizeAcceptanceStatus(value?: string): string {
  const raw = String(value || '').trim();
  return ['未开始', '验收中', '通过', '不通过', '豁免'].includes(raw) ? raw : '未开始';
}

function normalizeMonitorStatus(value?: string): string {
  const raw = String(value || '').trim();
  return ['未开始', '监控中', '通过', '异常', '豁免'].includes(raw) ? raw : '未开始';
}

function normalizeGateStatus(value?: string): string {
  const raw = String(value || '').trim();
  if (raw === '待检查') return '未检查';
  return ['未检查', '已通过', '阻塞', '豁免'].includes(raw) ? raw : '未检查';
}

function normalizePublishStatus(value?: string): string {
  const raw = String(value || '').trim();
  if (raw === '已发布') return '发布成功';
  return ['未发布', '发布中', '发布成功', '发布失败'].includes(raw) ? raw : '未发布';
}

function normalizeOfficialStatus(value?: string): string {
  const raw = String(value || '').trim();
  if (raw === '未归档') return '待开发';
  return ['待开发', '待验收', '已验收', '已上线', '已废弃', '待治理'].includes(raw) ? raw : '待开发';
}

function hasApiParamFields(fields: Record<string, unknown>): boolean {
  return ['paramName', 'paramType', 'required', 'requiredRule', 'triggerCondition', 'enumRange', 'definition', 'defaultValue', 'example', 'platform', 'status', 'version', 'changeType'].some((key) =>
    Object.prototype.hasOwnProperty.call(fields, key),
  );
}

function toParamPatch(fields: Partial<CreateParamRequest>, source: TrackingSource): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.evtId !== undefined) patch.evt_id = fields.evtId;
  if (fields.paramName !== undefined) patch['参数名'] = fields.paramName;
  if (fields.paramType !== undefined) patch['数据类型'] = normalizeParamType(fields.paramType);
  if (fields.requiredRule !== undefined || fields.required !== undefined) {
    patch['必传规则'] = normalizeRequiredRule(fields.requiredRule, fields.required);
  }
  if (fields.triggerCondition !== undefined) patch['条件说明'] = fields.triggerCondition;
  if (fields.enumRange !== undefined) patch['枚举/取值范围'] = fields.enumRange;
  if (fields.definition !== undefined) patch['参数定义'] = fields.definition;
  if (fields.defaultValue !== undefined || fields.example !== undefined) {
    patch['默认值/示例'] = fields.example || fields.defaultValue || '';
  }
  if (fields.platform !== undefined) {
    patch[source === 'web' ? 'Web适用性' : 'App适用性'] = normalizeParamApplicability(fields.platform, source);
  }
  if (fields.status !== undefined) patch['参数状态'] = normalizeParamStatus(fields.status);
  if (fields.changeType !== undefined) patch['变更类型'] = normalizeChangeType(fields.changeType);
  return patch;
}

function normalizeParamApplicability(value: unknown, source: TrackingSource): string {
  const raw = String(value || '').trim();
  if (source === 'web') {
    const alias: Record<string, string> = {
      Web: 'Web通用',
      仅Web: 'Web通用',
    };
    const normalized = alias[raw] || raw || 'Web通用';
    return ['Web通用', 'Web&App历史兼容', 'Web/App差异待拆', '待确认', '无特殊参数'].includes(normalized) ? normalized : 'Web通用';
  }

  const alias: Record<string, string> = {
    App: 'App通用',
    仅App: 'App通用',
    iOS: '仅iOS',
    Android: '仅Android',
    'iOS、Android': 'App通用',
    'iOS,Android': 'App通用',
    'iOS, Android': 'App通用',
  };
  const normalized = alias[raw] || raw || 'App通用';
  return ['App通用', '仅iOS', '仅Android', 'Web&App历史兼容', 'App/Web差异待拆', '待确认', '无特殊参数'].includes(normalized) ? normalized : 'App通用';
}
