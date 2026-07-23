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
  '需求背景',
  '需求链接',
  '指标/使用场景',
  '流程阶段',
  '记录类型',
  '优先级',
  '端',
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

const PARAM_FIELDS = [
  '设计参数主键',
  'evt_id',
  '参数名',
  '数据类型',
  '必传规则',
  '条件说明',
  '枚举/取值范围',
  '参数定义',
  '默认值/示例',
  'App适用性',
  'Web适用性',
  '参数状态',
  '版本',
  '变更类型',
  '来源设计记录ID',
  '关联设计',
] as const;

const PERMISSION_RECORD_TYPE = '权限配置';
const PERMISSION_RECORD_NAME = '系统权限配置';
const PERMISSION_RECORD_EVT_ID = '__system_permissions__';
const APP_DESIGN_PARAM_LINK =
  'https://bcn0tgplxp2e.feishu.cn/base/Kgy0b4bvmaJSK8sjQDscUrNJnOf?table=tblesT69TDCUKzhs';
const WEB_DESIGN_PARAM_LINK =
  'https://bcn0tgplxp2e.feishu.cn/base/EX4RbTvp9agYNws6PIHcKD20nqf?table=tblMaw89yVi68YY6';
const TRACKING_SOURCES: TrackingSource[] = ['app', 'web'];

type Cell = unknown;
type ScopedRecordRef = { source: TrackingSource; rawId: string };


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
    const todoStages = new Set(['需求录入', '埋点设计', '评审通过', '埋点开发', '数据验收']);
    const items = records
      .filter(({ record }) => todoStages.has(cellText(record.record['流程阶段'])))
      .map(({ record, source }) => this.toTrackingRecord(record, source))
      .sort(compareTrackingRecord)
      .slice(0, limit)
      .map((record) => ({
        recordId: record.recordId,
        source: record.source,
        evtId: record.evtId,
        eventName: record.eventName,
        stage: record.stage,
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
                effectiveConfig.admins.includes(actorId)),
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
      !currentConfig.admins.includes(actorId)
    ) {
      throw new ForbiddenException('只有管理员可以更新权限配置');
    }

    const nextConfig = normalizePermissionConfig({
      ...body.config,
      admins: uniqueStrings([...(body.config?.admins || []), actorId]),
      updatedAt: Date.now(),
      updatedBy: actorId,
    });
    const actorCell = createUserCell(body.actorLarkId || actorId, body.actorName);

    const record = {
      evt_id: PERMISSION_RECORD_EVT_ID,
      '事件中文名': PERMISSION_RECORD_NAME,
      '需求背景': JSON.stringify(nextConfig),
      '流程阶段': '稳定归档',
      '记录类型': PERMISSION_RECORD_TYPE,
      '优先级': 'P3',
      '端': 'App通用',
      '数据负责人': actorCell ? [actorCell] : [],
      '研发负责人': [],
      'DS验收人': [],
      '评审状态': '',
      '埋点开发状态': '',
      'DS验收状态': '',
      '发布门禁状态': '',
      '发布状态': '',
      '正式状态': '系统记录',
      '版本': 'system',
      '变更类型': '权限配置',
      '创建时间': existing
        ? cellTimestamp(existing.record['创建时间']) || Date.now()
        : Date.now(),
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
    if (!evtId || !eventName) {
      throw new BadRequestException('evt_id 和事件名不能为空');
    }

    await this.assertCanCreateRecord(body.actorId);

    const records = await this.listWorkbenchRecords(source);
    const duplicate = records.find(
      (record) => cellText(record.record['evt_id']).toLowerCase() === evtId.toLowerCase(),
    );
    if (duplicate) {
      throw new BadRequestException(`工作台已存在 evt_id：${evtId}`);
    }

    const ownerCell = createUserCell(body.actorLarkId || body.actorId, body.actorName);
    const workbench = workbenchKey(source);
    const paramDetail = paramDetailKey(source);
    const now = Date.now();
    const [created] = await this.bitable.batchAddRecords(workbench, [
      {
        evt_id: evtId,
        '事件中文名': eventName,
        '事件定义': body.eventDefinition || '',
        '触发时机': body.triggerTiming || '',
        '需求背景': body.requirementBackground || '',
        '需求链接': body.requirementLink || '',
        '指标/使用场景': body.metricScenario || '',
        '流程阶段': '需求录入',
        '记录类型': source === 'web' ? '埋点设计' : '需求',
        '优先级': body.priority || 'P2',
        '端': source === 'web' ? 'Web' : body.platform || 'iOS、Android',
        '数据负责人': ownerCell ? [ownerCell] : [],
        '研发负责人': [],
        'DS验收人': ownerCell ? [ownerCell] : [],
        '评审状态': '草稿',
        '评审意见': '',
        '埋点开发状态': '未开始',
        'DS验收状态': '未开始',
        'DS验收证据': '',
        'DS验收时间': '',
        '上线监控状态': '未开始',
        '上线监控结论': '',
        '发布门禁状态': source === 'web' ? '未检查' : '待检查',
        '发布门禁失败原因': '',
        '发布状态': '未发布',
        '发布错误': '',
        '正式状态': source === 'web' ? '待开发' : '未归档',
        '版本': body.version || '1.0.0',
        '最低版本': body.minVersion || body.version || '1.0.0',
        '变更类型': body.changeType || '新增',
        '处理方': body.handler || (source === 'web' ? '前端' : '客户端'),
        '公共属性要求': body.commonProps || '',
        '参数明细入口': source === 'web' ? WEB_DESIGN_PARAM_LINK : APP_DESIGN_PARAM_LINK,
        '参数拆行状态': body.initialParams?.length ? '已拆行' : '未拆行',
        '稳定归档时间': '',
        '创建时间': now,
      },
    ]);

    const paramRecords = (body.initialParams || [])
      .map((param) =>
        this.toParamRecord(source, created.id, evtId, body.version || '1.0.0', param),
      )
      .filter((record) => cellText(record['参数名']) || cellText(record['设计参数主键']));

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

    await this.bitable.batchUpdateRecords(workbench, [{ id: ref.rawId, record: patch }]);
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
      fieldNames: [...PARAM_FIELDS],
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

  async deleteParam(paramRecordId: string): Promise<DeleteParamResponse> {
    const ref = parseScopedRecordId(paramRecordId);
    await this.bitable.batchUpdateRecords(paramDetailKey(ref.source), [
      { id: ref.rawId, record: { '参数状态': '废弃' } },
    ]);
    return { success: true };
  }

  private async assertCanCreateRecord(actorId?: string): Promise<void> {
    const stored = await this.getPermissionRecord();
    if (!stored) return;

    const config = parsePermissionConfig(stored.record['需求背景']);
    const actor = (actorId || '').trim();
    if (!actor) {
      throw new ForbiddenException('无法识别当前用户，不能新增需求');
    }
    if (!config.admins.includes(actor) && !config.dataScientists.includes(actor)) {
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
        (record) => cellText(record.record['记录类型']) === PERMISSION_RECORD_TYPE,
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
      return Boolean(evtId) && type !== '模板' && type !== PERMISSION_RECORD_TYPE;
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
      eventName: cellText(record.record['事件中文名']) || '未命名事件',
      stage,
      uiStage: getUiStageFromBase(stage),
      priority: cellText(record.record['优先级']) || 'P2',
      platform: cellText(record.record['端']) || '-',
      dataOwner: users.data.ids,
      dataOwnerIds: users.data.ids,
      devOwner: users.dev.ids,
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
      dsAcceptor: dsAcceptor.ids,
      dsAcceptorIds: dsAcceptor.ids,
      requirementFields: pickFields(record.record, [
        '需求背景',
        '需求链接',
        '指标/使用场景',
        '优先级',
        '端',
        '数据负责人',
      ]),
      designFields: pickFields(record.record, [
        '事件中文名',
        '事件定义',
        '触发时机',
        '处理方',
        '公共属性要求',
        '版本',
        '最低版本',
        '变更类型',
        '参数拆行状态',
      ]),
      reviewFields: pickFields(record.record, ['评审状态', '评审意见', '发布门禁状态', '发布门禁失败原因']),
      devFields: pickFields(record.record, ['研发负责人', '埋点开发状态']),
      acceptanceFields: pickFields(record.record, ['DS验收人', 'DS验收状态', 'DS验收证据', 'DS验收时间']),
      launchFields: pickFields(record.record, ['上线监控状态', '上线监控结论', '发布状态', '发布错误', '发布时间']),
      archiveFields: pickFields(record.record, ['正式状态', '稳定归档时间']),
      permissions: actor
        ? calculateRecordPermissions(
            actor,
            actorCandidates,
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
    return {
      recordId: encodeScopedRecordId(source, record.id),
      paramKey: cellText(record.record['设计参数主键']),
      evtId: cellText(record.record['evt_id']),
      paramName: cellText(record.record['参数名']),
      paramType: cellText(record.record['数据类型']) || 'STRING',
      required: requiredRule === '必传' || requiredRule === '条件必传',
      triggerCondition: cellText(record.record['条件说明']),
      enumRange: cellText(record.record['枚举/取值范围']),
      definition: cellText(record.record['参数定义']),
      defaultValue: cellText(record.record['默认值/示例']),
      example: cellText(record.record['默认值/示例']),
      platform: cellText(record.record[source === 'web' ? 'Web适用性' : 'App适用性']),
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
    const paramKey = (body.paramKey || '').trim() || (paramName ? `${evtId}.${paramName}` : '');
    const platformField = source === 'web' ? 'Web适用性' : 'App适用性';
    return {
      '设计参数主键': paramKey,
      evt_id: body.evtId || evtId,
      '参数名': paramName,
      '数据类型': normalizeParamType(body.paramType),
      '必传规则': body.required ? '必传' : '非必传',
      '条件说明': body.triggerCondition || '',
      '枚举/取值范围': body.enumRange || '',
      '参数定义': body.definition || '',
      '默认值/示例': body.example || body.defaultValue || '',
      [platformField]: body.platform || (source === 'web' ? 'Web通用' : 'App通用'),
      '参数状态': normalizeParamStatus(body.status),
      '版本': body.version || version || '1.0.0',
      '变更类型': body.changeType || '新增',
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

function pickFields(record: Record<string, Cell>, fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field, cellText(record[field])]));
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
    if (typeof objectValue.text === 'string') return objectValue.text;
    if (typeof objectValue.id === 'string') return objectValue.id;
    if (typeof objectValue.link === 'string') return objectValue.link;
    return '';
  }
  return '';
}

function cellUsers(value: Cell): { ids: string[]; names: string[] } {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.reduce(
    (acc, item) => {
      if (item && typeof item === 'object') {
        const user = item as Record<string, unknown>;
        const id = typeof user.id === 'string' ? user.id : '';
        const name = typeof user.name === 'string' ? user.name : id;
        if (id) acc.ids.push(id);
        if (name) acc.names.push(name);
      }
      return acc;
    },
    { ids: [] as string[], names: [] as string[] },
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

function createUserCell(userId?: string, userName?: string): Record<string, string> | null {
  const id = (userId || '').trim();
  if (!id) return null;
  return {
    id,
    name: (userName || id).trim(),
  };
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

function calculateRecordPermissions(
  actorId: string,
  actorCandidates: string[],
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
  if (!permissionConfig) return base;

  const isAdmin = permissionConfig.admins.includes(actorId);
  const isDs = permissionConfig.dataScientists.includes(actorId);
  const isDeveloper = permissionConfig.developers.includes(actorId);
  const isAcceptor = permissionConfig.acceptors.includes(actorId);

  if (isAdmin) {
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

  return {
    canEditRequirement: base.canEditRequirement || isDs,
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

function hasApiParamFields(fields: Record<string, unknown>): boolean {
  return [
    'paramKey',
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
  if (fields.paramKey !== undefined) patch['设计参数主键'] = fields.paramKey;
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
    patch[source === 'web' ? 'Web适用性' : 'App适用性'] = fields.platform;
  }
  if (fields.status !== undefined) patch['参数状态'] = normalizeParamStatus(fields.status);
  if (fields.version !== undefined) patch['版本'] = fields.version;
  if (fields.changeType !== undefined) patch['变更类型'] = fields.changeType;
  return patch;
}
