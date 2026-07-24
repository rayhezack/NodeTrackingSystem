import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateParamRequest,
  CreateParamResponse,
  CreateTrackingRecordRequest,
  CreateTrackingRecordResponse,
  DeleteParamResponse,
  GetMyTodosParams,
  GetMyTodosResponse,
  GetParamsResponse,
  GetPermissionConfigResponse,
  GetStageStatsParams,
  GetStageStatsResponse,
  GetTrackingDetailResponse,
  GetTrackingRecordsParams,
  GetTrackingRecordsResponse,
  PermissionConfig,
  ParamDetail,
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
} from '@shared/api.interface';
import {
  UI_STAGE_NODES,
  PRIORITY_WEIGHT,
  type BitableInstanceKey,
} from '../bitable/bitable.constants';
import { BitableRecord, BitableService } from '../bitable/bitable.service';
import {
  calculatePermissions,
  getBaseStageFromUi,
  getUiStageFromBase,
  isStageTransitionValid,
  type StagePermissions,
} from '../bitable/bitable.utils';

const WORKBENCH_FIELDS = [
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

const PARAM_BASE_FIELDS = [
  '设计参数主键',
  'evt_id',
  '参数名',
  '数据类型',
  '必传规则',
  '条件说明',
  '枚举/取值范围',
  '参数定义',
  '默认值/示例',
  '参数状态',
  '版本',
  '变更类型',
  '来源设计记录ID',
  '关联设计',
] as const;

const APP_PARAM_FIELDS = [
  ...PARAM_BASE_FIELDS.slice(0, 9),
  'App适用性',
  ...PARAM_BASE_FIELDS.slice(9),
] as const;

const WEB_PARAM_FIELDS = [
  ...PARAM_BASE_FIELDS.slice(0, 9),
  'Web适用性',
  ...PARAM_BASE_FIELDS.slice(9),
] as const;

const PERMISSION_RECORD_TYPE = '权限配置';
const PERMISSION_RECORD_NAME = '系统权限配置';
const PERMISSION_RECORD_EVT_ID = '__system_permissions__';
const BOOTSTRAP_ADMIN_USER_IDS = new Set([
  // 当前 App 创建/开发账号在妙搭运行时与本地开发态可能拿到不同 user_id，均作为兜底管理员。
  '1867390536304713',
  '7648831973842095079',
]);
const APP_DESIGN_PARAM_LINK =
  'https://bcn0tgplxp2e.feishu.cn/base/Kgy0b4bvmaJSK8sjQDscUrNJnOf?table=tblesT69TDCUKzhs';
const WEB_DESIGN_PARAM_LINK =
  'https://bcn0tgplxp2e.feishu.cn/base/EX4RbTvp9agYNws6PIHcKD20nqf?table=tblMaw89yVi68YY6';
const TRACKING_SOURCES: TrackingSource[] = ['app', 'web'];

type Cell = unknown;
type ScopedRecordRef = { source: TrackingSource; rawId: string };

const USER_FIELD_NAMES = new Set([
  '需求提出人',
  '需求录入人',
  '数据负责人',
  '研发负责人',
  'DS验收人',
]);
const ATTACHMENT_FIELD_NAMES = new Set(['UI图']);

@Injectable()
export class TrackingService {
  constructor(private readonly bitable: BitableService) {}

  async getStageStats(
    params: GetStageStatsParams = {},
  ): Promise<GetStageStatsResponse> {
    const records = await this.listWorkbenchRecordsBySource(params.source);
    const countMap = new Map(UI_STAGE_NODES.map((stage) => [stage, 0]));
    for (const { record } of records) {
      const uiStage = getUiStageFromBase(cellText(record.record['流程阶段']));
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

  async getMyTodos(
    limit = 10,
    params: GetMyTodosParams = {},
  ): Promise<GetMyTodosResponse> {
    const records = await this.listWorkbenchRecordsBySource(params.source);
    const actorCandidates = uniqueStrings([params.actorId || '', params.actorLarkId || '']);
    if (!actorCandidates.length) {
      return { items: [] };
    }
    const permissionConfig = await this.getStoredPermissionConfig();
    const isAdmin = isAdminActor(actorCandidates, permissionConfig);

    const items = records
      .map(({ record, source }) => {
        const action = isAdmin ? getAdminTodoAction(record) : getTodoAction(record, actorCandidates);
        if (!action) return null;
        const trackingRecord = this.toTrackingRecord(record, source);
        return {
          ...trackingRecord,
          stage: action.stage,
          targetStage: action.targetStage,
          todoRole: action.todoRole,
        };
      })
      .filter((record): record is TrackingRecord & {
        targetStage: string;
        todoRole: string;
      } => Boolean(record))
      .sort(compareTrackingRecord)
      .slice(0, limit)
      .map((record) => ({
        recordId: record.recordId,
        source: record.source,
        evtId: record.evtId,
        eventName: record.eventName,
        stage: record.stage,
        targetStage: record.targetStage,
        todoRole: record.todoRole,
        priority: record.priority,
        platform: record.platform,
      }));

    return { items };
  }

  async getRecords(params: GetTrackingRecordsParams): Promise<GetTrackingRecordsResponse> {
    const pageSize = Number(params.pageSize || 50);
    const records = await this.listWorkbenchRecordsBySource(params.source);
    const keyword = (params.keyword || '').trim().toLowerCase();
    const filtered = records
      .map(({ record, source }) => this.toTrackingRecord(record, source))
      .filter((record) => {
        if (keyword) {
          const haystack = `${record.evtId} ${record.eventName}`.toLowerCase();
          if (!haystack.includes(keyword)) return false;
        }
        if (params.stage && record.uiStage !== params.stage && record.stage !== params.stage) {
          return false;
        }
        if (params.priority && record.priority !== params.priority) return false;
        if (params.platform && !record.platform.includes(params.platform)) return false;
        if (params.owner) {
          const owners = [...record.dataOwner, ...record.devOwner].join(' ');
          if (!owners.includes(params.owner)) return false;
        }
        return true;
      })
      .sort(compareTrackingRecord);

    return {
      items: filtered.slice(0, pageSize),
      hasMore: filtered.length > pageSize,
      total: filtered.length,
    };
  }

  async getDetail(
    recordId: string,
    actorId?: string,
    actorLarkId?: string,
  ): Promise<GetTrackingDetailResponse> {
    const ref = parseScopedRecordId(recordId);
    const record = await this.bitable.getRecord(workbenchKey(ref.source), ref.rawId);
    if (!record) {
      throw new NotFoundException('埋点需求不存在');
    }
    const permissionConfig = await this.getStoredPermissionConfig();
    return {
      data: this.toTrackingDetail(
        record,
        ref.source,
        actorId,
        actorLarkId,
        permissionConfig,
      ),
    };
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
          dataScientists: actorId ? [actorId] : [],
        };

    return {
      config: effectiveConfig,
      initialized,
      canManage: initialized
        ? Boolean(
            actorId &&
              (effectiveConfig.admins.length === 0 ||
                effectiveConfig.admins.includes(actorId) ||
                isBootstrapAdmin(actorId)),
          )
        : Boolean(actorId),
    };
  }

  async updatePermissionConfig(
    body: UpdatePermissionConfigRequest,
  ): Promise<UpdatePermissionConfigResponse> {
    const actorId = (body.actorId || '').trim();
    if (!actorId) {
      throw new BadRequestException('无法识别当前用户，不能更新权限配置');
    }

    const existing = await this.getPermissionRecord();
    const currentConfig = existing
      ? parsePermissionConfig(existing.record['需求背景'])
      : emptyPermissionConfig();
    if (
      existing &&
      currentConfig.admins.length > 0 &&
      !currentConfig.admins.includes(actorId) &&
      !isBootstrapAdmin(actorId)
    ) {
      throw new ForbiddenException('只有管理员可以更新权限配置');
    }

    const nextConfig = normalizePermissionConfig({
      ...body.config,
      admins: uniqueStrings([...(body.config?.admins || []), actorId]),
      updatedAt: Date.now(),
      updatedBy: actorId,
    });

    // 权限配置是应用自身状态，不是业务埋点需求。写成 Base「模板」记录并只写稳定字段，
    // 避免因为业务枚举、人员字段或系统只读字段导致初始化 400。
    const record = {
      evt_id: PERMISSION_RECORD_EVT_ID,
      '事件中文名': PERMISSION_RECORD_NAME,
      '需求背景': JSON.stringify(nextConfig),
      '流程阶段': '稳定归档',
      '记录类型': '模板',
      '优先级': 'P2',
      '版本': 'system',
    };

    if (existing) {
      await this.bitable.batchUpdateRecords('workbench', [
        { id: existing.id, record },
      ]);
    } else {
      await this.bitable.batchAddRecords('workbench', [record]);
    }

    return { success: true, config: nextConfig };
  }

  async createRecord(
    body: CreateTrackingRecordRequest,
  ): Promise<CreateTrackingRecordResponse> {
    const source = normalizeSource(body.source);
    const evtId = (body.evtId || '').trim();
    const eventName = (body.eventName || '').trim();
    if (!eventName) {
      throw new BadRequestException('需求名称不能为空');
    }

    await this.assertCanCreateRecord(body.actorId, body.actorLarkId);

    const records = await this.listWorkbenchRecords(source);
    if (evtId) {
      const duplicate = records.find(
        (record) => cellText(record.record['evt_id']).toLowerCase() === evtId.toLowerCase(),
      );
      if (duplicate) {
        throw new BadRequestException(`工作台已存在 evt_id：${evtId}`);
      }
    }

    const actorCellId = body.actorId;
    const requesterCells = createUserCells(body.requesterIds);
    const recorderCells = createUserCells(
      body.recorderIds?.length ? body.recorderIds : actorCellId ? [actorCellId] : [],
    );
    const dataOwnerCells = createUserCells(
      body.dataOwnerIds?.length ? body.dataOwnerIds : actorCellId ? [actorCellId] : [],
    );
    const devOwnerCells = createUserCells(body.devOwnerIds);
    const dsAcceptorCells = createUserCells(
      body.dsAcceptorIds?.length ? body.dsAcceptorIds : actorCellId ? [actorCellId] : [],
    );
    const workbench = workbenchKey(source);
    const paramDetail = paramDetailKey(source);
    const requirementLink = (body.requirementLink || '').trim();
    const [created] = await this.bitable.batchAddRecords(workbench, [
      {
        evt_id: evtId,
        '事件中文名': eventName,
        '事件定义': body.eventDefinition || '',
        '触发时机': body.triggerTiming || '',
        '需求背景': body.requirementBackground || '',
        ...(requirementLink ? { '需求链接': requirementLink } : {}),
        '指标/使用场景': body.metricScenario || '',
        '流程阶段': '需求录入',
        '记录类型': '埋点设计',
        '优先级': body.priority || 'P2',
        '端': toPlatformCell(body.platform, source),
        '需求提出人': requesterCells,
        '需求录入人': recorderCells,
        '数据负责人': dataOwnerCells,
        '研发负责人': devOwnerCells,
        'DS验收人': dsAcceptorCells,
        '评审状态': '草稿',
        '评审意见': '',
        '埋点开发状态': '未开始',
        'DS验收状态': '未开始',
        '上线监控状态': '未开始',
        '上线监控结论': '',
        '发布门禁状态': '未检查',
        '发布门禁失败原因': '',
        '发布状态': '未发布',
        '发布错误': '',
        '正式状态': '待开发',
        '版本': body.version || '1.0.0',
        '最低版本': body.minVersion || body.version || '1.0.0',
        '变更类型': normalizeChangeType(body.changeType),
        '处理方': normalizeHandler(body.handler, source),
        '公共属性要求': body.commonProps || '',
        '参数明细入口': source === 'web' ? WEB_DESIGN_PARAM_LINK : APP_DESIGN_PARAM_LINK,
        '参数拆行状态': body.initialParams?.length ? '已拆行' : '未拆行',
      },
    ]);

    const paramRecords = (body.initialParams || [])
      .map((param) =>
        this.toParamRecord(source, created.id, evtId, body.version || '1.0.0', param),
      )
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

  async updateRecord(
    recordId: string,
    body: UpdateTrackingRecordRequest,
  ): Promise<UpdateTrackingRecordResponse> {
    const ref = parseScopedRecordId(recordId);
    const workbench = workbenchKey(ref.source);
    const current = await this.bitable.getRecord(workbench, ref.rawId);
    if (!current) {
      throw new NotFoundException('埋点需求不存在');
    }

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
      patch['端'] = Array.isArray(patch['端'])
        ? patch['端']
        : toPlatformCell(cellText(patch['端']), ref.source);
    }
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
    normalizeWorkbenchPatch(patch, ref.source);

    const currentEvtId = cellText(current.record['evt_id']);
    const hasEvtIdPatch = Object.prototype.hasOwnProperty.call(patch, 'evt_id');
    const nextEvtId = hasEvtIdPatch ? cellText(patch.evt_id) : currentEvtId;

    await this.bitable.batchUpdateRecords(workbench, [{ id: ref.rawId, record: patch }]);
    if (hasEvtIdPatch && nextEvtId && nextEvtId !== currentEvtId) {
      await this.syncParamEvtId(ref.source, ref.rawId, currentEvtId, nextEvtId);
    }
    return { success: true, recordId, currentStage };
  }

  async getParams(recordId: string): Promise<GetParamsResponse> {
    const ref = parseScopedRecordId(recordId);
    const detail = await this.bitable.getRecord(workbenchKey(ref.source), ref.rawId);
    if (!detail) {
      throw new NotFoundException('埋点需求不存在');
    }

    const evtId = cellText(detail.record['evt_id']);
    const result = await this.bitable.searchRecords(paramDetailKey(ref.source), {
      fieldNames: [...paramFields(ref.source)],
      pageSize: 200,
    });
    const items = result.records
      .filter((record) => this.isParamForDesign(record, ref.rawId, evtId))
      .map((record) => this.toParamDetail(record, ref.source))
      .sort((a, b) => a.paramKey.localeCompare(b.paramKey));

    return { items, total: items.length };
  }

  async createParam(
    recordId: string,
    body: CreateParamRequest,
  ): Promise<CreateParamResponse> {
    const ref = parseScopedRecordId(recordId);
    const detail = await this.bitable.getRecord(workbenchKey(ref.source), ref.rawId);
    if (!detail) {
      throw new NotFoundException('埋点需求不存在');
    }
    const evtId = body.evtId || cellText(detail.record['evt_id']);
    const paramName = body.paramName.trim();
    if (!evtId || !paramName) {
      throw new BadRequestException('evt_id 和参数名不能为空');
    }

    const [created] = await this.bitable.batchAddRecords(paramDetailKey(ref.source), [
      this.toParamRecord(ref.source, ref.rawId, evtId, cellText(detail.record['版本']), body),
    ]);

    return { success: true, recordId: encodeScopedRecordId(ref.source, created.id) };
  }

  async updateParam(
    paramRecordId: string,
    body: UpdateParamRequest,
  ): Promise<UpdateParamResponse> {
    const ref = parseScopedRecordId(paramRecordId);
    const fields = body.fields || {};
    const patch = hasApiParamFields(fields)
      ? toParamPatch(fields as Partial<CreateParamRequest>, ref.source)
      : fields;
    await this.bitable.batchUpdateRecords(paramDetailKey(ref.source), [
      { id: ref.rawId, record: patch },
    ]);
    return { success: true, recordId: paramRecordId };
  }

  private async syncParamEvtId(
    source: TrackingSource,
    designRecordId: string,
    previousEvtId: string,
    nextEvtId: string,
  ): Promise<void> {
    const result = await this.bitable.searchRecords(paramDetailKey(source), {
      fieldNames: [...paramFields(source)],
      pageSize: 200,
    });
    const updates = result.records
      .filter((record) => this.isParamForDesign(record, designRecordId, previousEvtId))
      .map((record) => ({
        id: record.id,
        record: { evt_id: nextEvtId },
      }));
    if (!updates.length) return;

    for (let index = 0; index < updates.length; index += 200) {
      await this.bitable.batchUpdateRecords(paramDetailKey(source), updates.slice(index, index + 200));
    }
  }

  async deleteParam(paramRecordId: string): Promise<DeleteParamResponse> {
    const ref = parseScopedRecordId(paramRecordId);
    await this.bitable.batchUpdateRecords(paramDetailKey(ref.source), [
      { id: ref.rawId, record: { '参数状态': '废弃' } },
    ]);
    return { success: true };
  }

  private async assertCanCreateRecord(actorId?: string, actorLarkId?: string): Promise<void> {
    const stored = await this.getPermissionRecord();
    if (!stored) return;

    const config = parsePermissionConfig(stored.record['需求背景']);
    const actors = uniqueStrings([actorId || '', actorLarkId || '']);
    if (!actors.length) {
      throw new ForbiddenException('无法识别当前用户，不能新增需求');
    }
    const canCreate = actors.some(
      (actor) =>
        config.admins.includes(actor) ||
        config.dataScientists.includes(actor) ||
        isBootstrapAdmin(actor),
    );
    if (!canCreate) {
      throw new ForbiddenException('只有管理员或 DS 可以新增埋点需求');
    }
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
    return (
      result.records.find(
        (record) =>
          cellText(record.record['evt_id']) === PERMISSION_RECORD_EVT_ID ||
          cellText(record.record['记录类型']) === PERMISSION_RECORD_TYPE,
      ) || null
    );
  }

  private async listWorkbenchRecordsBySource(
    sourceFilter?: TrackingSourceFilter,
  ): Promise<Array<{ source: TrackingSource; record: BitableRecord }>> {
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
    return result.records.filter((record) => {
      const evtId = cellText(record.record['evt_id']);
      const type = cellText(record.record['记录类型']);
      return (
        evtId !== PERMISSION_RECORD_EVT_ID &&
        type !== '模板' &&
        type !== PERMISSION_RECORD_TYPE &&
        (type === '埋点设计' || Boolean(evtId) || Boolean(cellText(record.record['事件中文名'])))
      );
    });
  }

  private toTrackingRecord(record: BitableRecord, source: TrackingSource): TrackingRecord {
    const users = {
      data: cellUsers(record.record['数据负责人']),
      dev: cellUsers(record.record['研发负责人']),
    };
    const stage = cellText(record.record['流程阶段']) || '需求录入';
    return {
      recordId: encodeScopedRecordId(source, record.id),
      source,
      evtId: cellText(record.record['evt_id']),
      eventName: cellText(record.record['事件中文名']) || '未命名需求',
      stage,
      uiStage: getUiStageFromBase(stage),
      priority: cellText(record.record['优先级']) || 'P2',
      platform: cellText(record.record['端']) || '-',
      dataOwner: users.data.names,
      dataOwnerIds: users.data.ids,
      devOwner: users.dev.names,
      devOwnerIds: users.dev.ids,
      updatedAt: cellTimestamp(record.record['创建时间']),
    };
  }

  private toTrackingDetail(
    record: BitableRecord,
    source: TrackingSource,
    actorId?: string,
    actorLarkId?: string,
    permissionConfig?: PermissionConfig | null,
  ): TrackingDetail {
    const requester = cellUsers(record.record['需求提出人']);
    const recorder = cellUsers(record.record['需求录入人']);
    const dataOwner = cellUsers(record.record['数据负责人']);
    const devOwner = cellUsers(record.record['研发负责人']);
    const dsAcceptor = cellUsers(record.record['DS验收人']);
    const actor = actorId || actorLarkId || '';
    const actorCandidates = uniqueStrings([actorId || '', actorLarkId || '']);

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
      requirementFields: pickFields(record.record, [
        '需求提出人',
        '需求录入人',
        '需求背景',
        '需求链接',
        '指标/使用场景',
        '优先级',
        '端',
        '数据负责人',
        '研发负责人',
        'DS验收人',
      ]),
      designFields: pickFields(record.record, [
        'evt_id',
        '事件中文名',
        '优先级',
        '端',
        '事件定义',
        '触发时机',
        'UI图',
        '处理方',
        '公共属性要求',
        '版本',
        '最低版本',
        '变更类型',
        '参数拆行状态',
      ]),
      reviewFields: pickFields(record.record, ['评审状态', '评审意见']),
      devFields: pickFields(record.record, ['研发负责人', '埋点开发状态']),
      acceptanceFields: pickFields(record.record, ['DS验收人', 'DS验收状态', 'DS验收证据', 'DS验收时间']),
      launchFields: pickFields(record.record, [
        '发布门禁状态',
        '发布门禁失败原因',
        '发布状态',
        '发布错误',
        '上线监控状态',
        '上线监控结论',
        '发布时间',
      ]),
      archiveFields: pickFields(record.record, ['正式状态', '稳定归档时间']),
      permissions: actor
        ? calculateRecordPermissions(
            actor,
            actorCandidates,
            requester.ids,
            recorder.ids,
            dataOwner.ids,
            devOwner.ids,
            dsAcceptor.ids,
            permissionConfig,
          )
        : calculatePermissions('', [], [], []),
    };
  }

  private isParamForDesign(record: BitableRecord, recordId: string, evtId: string): boolean {
    const sourceRecordId = cellText(record.record['来源设计记录ID']);
    if (sourceRecordId === recordId) return true;
    const links = cellIds(record.record['关联设计']);
    if (links.includes(recordId)) return true;
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
      triggerCondition: cellText(record.record['条件说明']),
      enumRange: cellText(record.record['枚举/取值范围']),
      definition: cellText(record.record['参数定义']),
      defaultValue: cellText(record.record['默认值/示例']),
      example: cellText(record.record['默认值/示例']),
      platform: normalizeParamApplicability(
        cellText(record.record[source === 'web' ? 'Web适用性' : 'App适用性']),
        source,
      ),
      status: cellText(record.record['参数状态']) || '草稿',
      version: cellText(record.record['版本']),
      changeType: cellText(record.record['变更类型']) || '新增',
    };
  }

  private toParamRecord(
    source: TrackingSource,
    recordId: string,
    evtId: string,
    version: string,
    body: CreateParamRequest,
  ): Record<string, unknown> {
    const paramName = (body.paramName || '').trim();
    const eventId = (body.evtId || evtId).trim();
    const platformField = source === 'web' ? 'Web适用性' : 'App适用性';
    return {
      evt_id: eventId,
      '参数名': paramName,
      '数据类型': normalizeParamType(body.paramType),
      '必传规则': body.required ? '必传' : '非必传',
      '条件说明': body.triggerCondition || '',
      '枚举/取值范围': body.enumRange || '',
      '参数定义': body.definition || '',
      '默认值/示例': body.example || body.defaultValue || '',
      [platformField]: normalizeParamApplicability(body.platform, source),
      '参数状态': normalizeParamStatus(body.status),
      '版本': body.version || version || '1.0.0',
      '变更类型': normalizeChangeType(body.changeType),
      '来源设计记录ID': recordId,
      '关联设计': [{ id: recordId }],
    };
  }
}

function compareTrackingRecord(a: TrackingRecord, b: TrackingRecord): number {
  const priorityDiff =
    (PRIORITY_WEIGHT[a.priority] ?? 9) - (PRIORITY_WEIGHT[b.priority] ?? 9);
  if (priorityDiff !== 0) return priorityDiff;
  return b.updatedAt - a.updatedAt;
}

function pickFields(record: Record<string, Cell>, fields: string[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      USER_FIELD_NAMES.has(field)
        ? cellUsers(record[field]).items
        : ATTACHMENT_FIELD_NAMES.has(field)
          ? cellFiles(record[field])
          : cellText(record[field]),
    ]),
  );
}

function cellFiles(value: Cell): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function cellText(value: Cell): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => cellText(item)).filter(Boolean).join('、');
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

function cellUsers(value: Cell): { ids: string[]; names: string[]; items: TrackingUserRef[] } {
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
        const id = [
          user.user_id,
          user.userId,
          user.miaoda_user_id,
          user.miaodaUserID,
          user.employee_id,
          user.employeeID,
          user.id,
          user.open_id,
          user.openId,
          user.larkUserId,
          user.lark_user_id,
        ].find(
          (candidate): candidate is string | number =>
            (typeof candidate === 'string' && candidate.length > 0) ||
            typeof candidate === 'number',
        ) || '';
        const name = typeof user.name === 'string' ? user.name.trim() : '';
        const normalizedId = id ? String(id) : '';
        const larkUserId = [
          user.larkUserId,
          user.lark_user_id,
          user.open_id,
          user.openId,
          user.lark_id,
        ].find((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);
        const resolvedLarkUserId =
          larkUserId || (normalizedId.startsWith('ou_') ? normalizedId : undefined);
        if (normalizedId) acc.ids.push(normalizedId);
        if (name && name !== normalizedId) acc.names.push(name);
        if (normalizedId) {
          acc.items.push({
            user_id: normalizedId,
            larkUserId: resolvedLarkUserId,
            ...(name && name !== normalizedId ? { name } : {}),
          });
        }
      }
      return acc;
    },
    { ids: [] as string[], names: [] as string[], items: [] as TrackingUserRef[] },
  );
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
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[、,，/]/)
      : value
        ? [value]
        : [];

  return uniqueNumbers(values.map(extractNumericUserId).filter((id): id is number => id !== null));
}

function extractNumericUserId(item: unknown): number | null {
  if (typeof item === 'number') {
    return Number.isFinite(item) && item > 0 ? item : null;
  }
  if (typeof item === 'string') {
    const trimmed = item.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const id = Number(trimmed);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  if (item && typeof item === 'object') {
    const user = item as Record<string, unknown>;
    for (const key of [
      'user_id',
      'userId',
      'userID',
      'miaoda_user_id',
      'miaodaUserID',
      'employee_id',
      'employeeID',
      'id',
    ]) {
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
  return Array.from(
    new Set(values.map((value) => String(value || '').trim()).filter(Boolean)),
  );
}

function isBootstrapAdmin(actorId?: string): boolean {
  return Boolean(actorId && BOOTSTRAP_ADMIN_USER_IDS.has(actorId));
}

function isAdminActor(
  actorCandidates: string[],
  permissionConfig?: PermissionConfig | null,
): boolean {
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

function workbenchKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webWorkbench' : 'workbench';
}

function paramDetailKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webParamDetail' : 'paramDetail';
}

function paramFields(source: TrackingSource): readonly string[] {
  return source === 'web' ? WEB_PARAM_FIELDS : APP_PARAM_FIELDS;
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

function getTodoAction(
  record: BitableRecord,
  actorCandidates: string[],
): { stage: string; targetStage: string; todoRole: string } | null {
  const baseStage = cellText(record.record['流程阶段']);
  const requesters = cellUsers(record.record['需求提出人']).ids;
  const recorders = cellUsers(record.record['需求录入人']).ids;
  const dataOwners = cellUsers(record.record['数据负责人']).ids;
  const devOwners = cellUsers(record.record['研发负责人']).ids;
  const dsAcceptors = cellUsers(record.record['DS验收人']).ids;

  const isRequester = intersects(actorCandidates, requesters);
  const isRecorder = intersects(actorCandidates, recorders);
  const isDataOwner = intersects(actorCandidates, dataOwners);
  const isDevOwner = intersects(actorCandidates, devOwners);
  const isAcceptor = intersects(actorCandidates, dsAcceptors);
  const isDataParticipant = isDataOwner || isAcceptor;

  switch (baseStage) {
    case '需求录入':
      if (isRequester || isRecorder || isDataParticipant) {
        return { stage: '埋点提需', targetStage: 'requirement', todoRole: getFirstRole([
          [isRequester, '提需人'],
          [isRecorder, '录入人'],
          [isDataOwner, '数据负责人'],
          [isAcceptor, 'DS验收人'],
        ]) };
      }
      return null;
    case '埋点设计':
      if (isDataParticipant) {
        return { stage: '埋点设计', targetStage: 'design', todoRole: getFirstRole([
          [isDataOwner, '数据负责人'],
          [isAcceptor, 'DS验收人'],
        ]) };
      }
      return null;
    case '评审通过':
      if (isDevOwner) {
        return { stage: '埋点开发', targetStage: 'dev', todoRole: '研发负责人' };
      }
      return null;
    case '埋点开发':
      if (isDevOwner) {
        return { stage: '埋点开发', targetStage: 'dev', todoRole: '研发负责人' };
      }
      return null;
    case '数据验收':
      if (isDataParticipant) {
        return { stage: '埋点校验', targetStage: 'acceptance', todoRole: getFirstRole([
          [isDataOwner, '数据负责人'],
          [isAcceptor, 'DS验收人'],
        ]) };
      }
      return null;
    case '上线监控':
      if (isDataParticipant) {
        return { stage: '埋点上线', targetStage: 'launch', todoRole: getFirstRole([
          [isDataOwner, '数据负责人'],
          [isAcceptor, 'DS验收人'],
        ]) };
      }
      return null;
    default:
      return null;
  }
}

function getAdminTodoAction(
  record: BitableRecord,
): { stage: string; targetStage: string; todoRole: string } | null {
  const baseStage = cellText(record.record['流程阶段']);
  switch (baseStage) {
    case '需求录入':
      return { stage: '埋点提需', targetStage: 'requirement', todoRole: '管理员' };
    case '埋点设计':
      return { stage: '埋点设计', targetStage: 'design', todoRole: '管理员' };
    case '评审通过':
    case '埋点开发':
      return { stage: '埋点开发', targetStage: 'dev', todoRole: '管理员' };
    case '数据验收':
      return { stage: '埋点校验', targetStage: 'acceptance', todoRole: '管理员' };
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
  recorders: string[],
  dataOwner: string[],
  devOwner: string[],
  dsAcceptor: string[],
  permissionConfig?: PermissionConfig | null,
) {
  const candidates = uniqueStrings([actorId, ...actorCandidates]);
  const base = mergePermissions(
    candidates.map((candidate) =>
      calculatePermissions(candidate, dataOwner, devOwner, dsAcceptor),
    ),
  );
  const canEditRequirementByRequester = candidates.some(
    (candidate) => requesters.includes(candidate) || recorders.includes(candidate),
  );
  if (candidates.some((candidate) => isBootstrapAdmin(candidate))) {
    return fullStagePermissions();
  }
  if (!permissionConfig) return base;

  const hasRole = (roleIds: string[]) => candidates.some((candidate) => roleIds.includes(candidate));
  const isAdmin = hasRole(permissionConfig.admins);
  const isDs = hasRole(permissionConfig.dataScientists);
  const isDeveloper = hasRole(permissionConfig.developers);
  const isAcceptor = hasRole(permissionConfig.acceptors);

  if (isAdmin) return fullStagePermissions();

  return {
    canEditRequirement: base.canEditRequirement || isDs || canEditRequirementByRequester,
    canEditDesign: base.canEditDesign || isDs,
    canEditReview: base.canEditReview || isDs,
    canEditDev: base.canEditDev || isDeveloper,
    canEditAcceptance: base.canEditAcceptance || isDs || isAcceptor,
    canEditLaunch: base.canEditLaunch || isDs,
    canEditArchive: base.canEditArchive || isDs,
    canEditParams: base.canEditParams || isDs,
  };
}

function normalizeParamType(value?: string): string {
  const raw = String(value || 'STRING').trim().toUpperCase();
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
  return raw;
}

function buildParamKey(evtId?: string, paramName?: string): string {
  const eventId = String(evtId || '').trim();
  const name = String(paramName || '').trim();
  return eventId && name ? `${eventId}.${name}` : '';
}

function normalizeWorkbenchPatch(
  patch: Record<string, unknown>,
  source: TrackingSource,
): void {
  if (Object.prototype.hasOwnProperty.call(patch, '处理方')) {
    patch['处理方'] = normalizeHandler(cellText(patch['处理方']), source);
  }
  if (Object.prototype.hasOwnProperty.call(patch, '变更类型')) {
    patch['变更类型'] = normalizeChangeType(cellText(patch['变更类型']));
  }
  if (Object.prototype.hasOwnProperty.call(patch, '埋点开发状态')) {
    patch['埋点开发状态'] = normalizeDevStatus(cellText(patch['埋点开发状态']));
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
  const allowed = source === 'web'
    ? ['前端', '服务端', '前端/服务端']
    : ['客户端', '客户端/服务端'];
  return allowed.includes(raw) ? raw : allowed[0];
}

function normalizeChangeType(value?: string): string {
  const raw = String(value || '').trim();
  const alias: Record<string, string> = {
    删除: '废弃',
    不变: '修改',
  };
  const normalized = alias[raw] || raw;
  return ['新增', '修改', '废弃', '口径调整'].includes(normalized) ? normalized : '新增';
}

function normalizeDevStatus(value?: string): string {
  const raw = String(value || '').trim();
  if (raw === '已完成') return '已开发';
  return ['未开始', '开发中', '已开发', '阻塞'].includes(raw) ? raw : '未开始';
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
  return ['待开发', '待验收', '已验收', '已上线', '已废弃', '待治理'].includes(raw)
    ? raw
    : '待开发';
}

function hasApiParamFields(fields: Record<string, unknown>): boolean {
  return [
    'paramName',
    'paramType',
    'required',
    'triggerCondition',
    'enumRange',
    'definition',
    'defaultValue',
    'example',
    'platform',
    'status',
    'version',
    'changeType',
  ].some((key) => Object.prototype.hasOwnProperty.call(fields, key));
}

function toParamPatch(
  fields: Partial<CreateParamRequest>,
  source: TrackingSource,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.evtId !== undefined) patch.evt_id = fields.evtId;
  if (fields.paramName !== undefined) patch['参数名'] = fields.paramName;
  if (fields.paramType !== undefined) patch['数据类型'] = normalizeParamType(fields.paramType);
  if (fields.required !== undefined) patch['必传规则'] = fields.required ? '必传' : '非必传';
  if (fields.triggerCondition !== undefined) patch['条件说明'] = fields.triggerCondition;
  if (fields.enumRange !== undefined) patch['枚举/取值范围'] = fields.enumRange;
  if (fields.definition !== undefined) patch['参数定义'] = fields.definition;
  if (fields.defaultValue !== undefined || fields.example !== undefined) {
    patch['默认值/示例'] = fields.example || fields.defaultValue || '';
  }
  if (fields.platform !== undefined) {
    patch[source === 'web' ? 'Web适用性' : 'App适用性'] = normalizeParamApplicability(
      fields.platform,
      source,
    );
  }
  if (fields.status !== undefined) patch['参数状态'] = normalizeParamStatus(fields.status);
  if (fields.version !== undefined) patch['版本'] = fields.version;
  if (fields.changeType !== undefined) patch['变更类型'] = normalizeChangeType(fields.changeType);
  return patch;
}

function normalizeParamApplicability(
  value: unknown,
  source: TrackingSource,
): string {
  const raw = String(value || '').trim();
  if (source === 'web') {
    const alias: Record<string, string> = {
      Web: '仅Web',
    };
    const normalized = alias[raw] || raw || 'Web通用';
    return [
      'Web通用',
      '仅Web',
      'Web&App历史兼容',
      'Web/App差异待拆',
      '待确认',
      '无特殊参数',
    ].includes(normalized) ? normalized : 'Web通用';
  }

  const alias: Record<string, string> = {
    iOS: '仅iOS',
    Android: '仅Android',
    'iOS,Android': 'iOS、Android',
    'iOS, Android': 'iOS、Android',
    App通用: 'iOS、Android',
    仅App: 'iOS、Android',
  };
  const normalized = alias[raw] || raw || 'iOS、Android';
  return [
    'iOS、Android',
    '仅iOS',
    '仅Android',
    'Web&App历史兼容',
    'App/Web差异待拆',
    '待确认',
    '无特殊参数',
  ].includes(normalized) ? normalized : 'iOS、Android';
}
