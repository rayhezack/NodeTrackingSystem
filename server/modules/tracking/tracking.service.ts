import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { BitableService, type BitableFilter } from '../bitable/bitable.service';
import {
  STAGE_UI_MAP,
  UI_STAGE_NODES,
  PRIORITY_WEIGHT,
  STAGE_ORDER,
} from '../bitable/bitable.constants';
import {
  getUiStageFromBase,
  isStageTransitionValid,
  calculatePermissions,
} from '../bitable/bitable.utils';
import type {
  StageStat,
  TodoItem,
  TrackingRecord,
  GetTrackingRecordsParams,
  GetTrackingRecordsResponse,
  TrackingDetail,
  UpdateTrackingRecordRequest,
  UpdateTrackingRecordResponse,
  ParamDetail,
  GetParamsResponse,
  CreateParamRequest,
  CreateParamResponse,
  UpdateParamRequest,
  UpdateParamResponse,
  DeleteParamResponse,
} from '@shared/api.interface';

interface BaseUserField {
  id?: string;
  user_id?: string;
  name?: string;
}

function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[\s_\-]+/g, '');
}

function findFieldKey(
  record: Record<string, unknown>,
  candidates: string[],
): string | undefined {
  const keys = Object.keys(record);
  for (const candidate of candidates) {
    const norm = normalizeFieldName(candidate);
    for (const key of keys) {
      if (normalizeFieldName(key) === norm) {
        return key;
      }
    }
  }
  return undefined;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly bitableService: BitableService,
  ) {}

  /**
   * 从 Base user 类型字段中提取 user_id 数组
   */
  private extractUserIds(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .map((item: unknown) => {
          if (typeof item === 'string') return item;
          if (typeof item === 'number') return String(item);
          if (item && typeof item === 'object') {
            const obj = item as BaseUserField;
            return obj.id || obj.user_id || '';
          }
          return '';
        })
        .filter(Boolean);
    }
    if (typeof value === 'string') return [value];
    if (typeof value === 'number') return [String(value)];
    return [];
  }

  /**
   * 从记录中安全获取字段值（字符串）
   */
  private getFieldStr(record: Record<string, unknown>, ...candidates: string[]): string {
    const key = findFieldKey(record, candidates);
    if (!key) return '';
    const val = record[key];
    if (val == null) return '';
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object' && 'text' in val) {
      return String((val as { text: string }).text);
    }
    if (Array.isArray(val) && val.length > 0) {
      const first = val[0];
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object' && 'text' in first) {
        return String((first as { text: string }).text);
      }
    }
    return String(val);
  }

  /**
   * 阶段统计：按 UI 业务节点聚合
   */
  async getStageStats(): Promise<{ items: StageStat[] }> {
    const result = await this.bitableService.aggregateQuery('workbench', {
      dimensions: ['流程阶段'],
      measures: [{ fieldName: '流程阶段', aggregation: 'count_all', alias: 'count_all' }],
    });

    // 初始化 6 个 UI 节点，数量为 0
    const stageCount: Record<string, number> = {};
    for (const node of UI_STAGE_NODES) {
      stageCount[node] = 0;
    }

    // 解析聚合结果并映射到 UI 节点
    if (result.result && result.result.length > 0) {
      for (const item of result.result) {
        const stageField = item['流程阶段'] as { value?: string } | undefined;
        const baseStage = stageField?.value || '';
        const countField = item.count_all as { value?: number | string } | undefined;
        const count = Number(countField?.value ?? 0) || 0;
        if (!baseStage) continue;
        const uiStage = getUiStageFromBase(baseStage);
        if (stageCount[uiStage] !== undefined) {
          stageCount[uiStage] += count;
        }
      }
    }

    const items: StageStat[] = UI_STAGE_NODES.map((stage: string) => ({
      stage,
      count: stageCount[stage],
    }));

    return { items };
  }

  /**
   * 我的待办：当前用户作为数据负责人/研发负责人/DS验收人，且非归档/废弃
   */
  async getMyTodos(
    userId: string,
    limit = 10,
  ): Promise<{ items: TodoItem[] }> {
    const result = await this.bitableService.searchRecords('workbench', {
      pageSize: Math.max(limit * 10, 100),
    });

    const records = result.records || [];
    const todos: (TodoItem & { priorityWeight: number })[] = [];

    for (const rec of records) {
      const record = rec.record;
      const dataOwners = this.extractUserIds(record['数据负责人']);
      const devOwners = this.extractUserIds(record['研发负责人']);
      const dsAcceptors = this.extractUserIds(record['DS验收人']);

      const isInvolved =
        dataOwners.includes(userId) ||
        devOwners.includes(userId) ||
        dsAcceptors.includes(userId);

      if (!isInvolved) continue;

      const stage = this.getFieldStr(record, '流程阶段');
      if (stage === '稳定归档' || stage === '已废弃') continue;

      const priority = this.getFieldStr(record, '优先级');
      const priorityWeight =
        PRIORITY_WEIGHT[priority] !== undefined
          ? PRIORITY_WEIGHT[priority]
          : 99;

      todos.push({
        recordId: rec.id,
        evtId: this.getFieldStr(record, 'evt_id', 'evt id', '事件ID'),
        eventName: this.getFieldStr(record, '事件中文名', '事件名', '事件名称'),
        stage: getUiStageFromBase(this.getFieldStr(record, '流程阶段', '阶段')),
        priority: this.getFieldStr(record, '优先级'),
        platform: this.getFieldStr(record, '平台', '端', '适用端'),
        priorityWeight,
      });
    }

    // 按优先级排序
    todos.sort((a, b) => a.priorityWeight - b.priorityWeight);

    const items: TodoItem[] = todos.slice(0, limit).map((t) => {
      const { priorityWeight: _pw, ...rest } = t;
      return rest;
    });

    return { items };
  }

  /**
   * 需求列表：支持搜索、筛选、分页
   */
  async getRecords(
    params: GetTrackingRecordsParams,
  ): Promise<GetTrackingRecordsResponse> {
    const {
      keyword,
      stage,
      priority,
      platform,
      owner,
      pageSize = 20,
      pageToken,
    } = params;

    const conditions: BitableFilter['conditions'] = [];

    // 阶段筛选（UI 阶段 → Base 枚举值）
    if (stage) {
      // 找到该 UI 阶段对应的所有 Base 枚举值
      const baseStages: string[] = [];
      for (const [baseStage, uiStage] of Object.entries(STAGE_UI_MAP)) {
        if (uiStage === stage) baseStages.push(baseStage);
      }
      if (baseStages.length > 0) {
        conditions.push({
          fieldName: '流程阶段',
          operator: 'is',
          value: baseStages,
        });
      }
    }

    if (priority) {
      conditions.push({
        fieldName: '优先级',
        operator: 'is',
        value: [priority],
      });
    }

    if (platform) {
      conditions.push({
        fieldName: '平台',
        operator: 'is',
        value: [platform],
      });
    }

    // keyword 搜索：evt_id 或 事件名 包含
    // Base searchRecords 不支持原生 OR 模糊搜索，使用 contains + 内存补充
    // 这里先不加 keyword 到 filter，在内存中过滤（更可靠）
    const filter: BitableFilter | undefined =
      conditions.length > 0 ? { conjunction: 'and', conditions } : undefined;

    const result = await this.bitableService.searchRecords('workbench', {
      filter,
      pageSize: keyword || owner ? Math.max(pageSize * 3, 100) : pageSize,
      pageToken,
    });

    let records = result.records || [];

    // 内存过滤：keyword
    if (keyword) {
      const kw = keyword.toLowerCase();
      records = records.filter((rec) => {
        const evtId = this.getFieldStr(rec.record, 'evt_id', 'evt id', '事件ID').toLowerCase();
        const eventName = this.getFieldStr(rec.record, '事件中文名', '事件名', '事件名称').toLowerCase();
        return evtId.includes(kw) || eventName.includes(kw);
      });
    }

    // 内存过滤：owner（数据负责人或研发负责人包含该用户）
    if (owner) {
      records = records.filter((rec) => {
        const dataOwners = this.extractUserIds(rec.record['数据负责人']);
        const devOwners = this.extractUserIds(rec.record['研发负责人']);
        return dataOwners.includes(owner) || devOwners.includes(owner);
      });
    }

    // 分页截取
    const total = result.total ?? records.length;
    const items: TrackingRecord[] = records.slice(0, pageSize).map((rec) => {
      const record = rec.record;
      const updatedAtRaw = record['更新时间'];
      const updatedAt =
        typeof updatedAtRaw === 'number'
          ? updatedAtRaw
          : new Date(String(updatedAtRaw || 0)).getTime();

      return {
        recordId: rec.id,
        evtId: this.getFieldStr(record, 'evt_id', 'evt id', '事件ID'),
        eventName: this.getFieldStr(record, '事件中文名', '事件名', '事件名称'),
        stage: getUiStageFromBase(this.getFieldStr(record, '流程阶段', '阶段')),
        priority: this.getFieldStr(record, '优先级'),
        platform: this.getFieldStr(record, '平台', '端', '适用端'),
        dataOwner: this.extractUserIds(record['数据负责人']),
        devOwner: this.extractUserIds(record['研发负责人']),
        updatedAt,
      };
    });

    const hasMore = records.length > pageSize && !!result.hasMore;
    const nextPageToken = hasMore ? result.pageToken : undefined;

    return {
      items,
      hasMore,
      pageToken: nextPageToken,
      total,
    };
  }

  /**
   * 需求详情：获取单条记录的完整信息及权限
   */
  async getDetail(
    recordId: string,
    userId: string,
  ): Promise<{ data: TrackingDetail }> {
    const rec = await this.bitableService.getRecord('workbench', recordId);
    if (!rec) {
      throw new NotFoundException('需求记录不存在或已被删除');
    }

    const record = rec.record;
    const dataOwner = this.extractUserIds(record['数据负责人']);
    const devOwner = this.extractUserIds(record['研发负责人']);
    const dsAcceptor = this.extractUserIds(record['DS验收人']);
    const permissions = calculatePermissions(userId, dataOwner, devOwner, dsAcceptor);

    const stage = this.getFieldStr(record, '流程阶段');
    const updatedAtRaw = record['更新时间'];
    const updatedAt =
      typeof updatedAtRaw === 'number'
        ? updatedAtRaw
        : new Date(String(updatedAtRaw || 0)).getTime();

    // 将所有字段先放入 requirementFields，其他分组留空
    // 后续可根据实际字段名细化分组
    const requirementFields: Record<string, unknown> = { ...record };

    const detail: TrackingDetail = {
      recordId: rec.id,
      evtId: this.getFieldStr(record, 'evt_id'),
      eventName: this.getFieldStr(record, '事件中文名', '事件名'),
      stage,
      reviewStatus: this.getFieldStr(record, '评审状态'),
      devStatus: this.getFieldStr(record, '开发状态'),
      acceptanceStatus: this.getFieldStr(record, '验收状态'),
      dataOwner,
      devOwner,
      dsAcceptor,
      priority: this.getFieldStr(record, '优先级'),
      platform: this.getFieldStr(record, '平台'),
      requirementFields,
      designFields: {},
      reviewFields: {},
      devFields: {},
      acceptanceFields: {},
      launchFields: {},
      archiveFields: {},
      permissions,
      updatedAt,
    };

    return { data: detail };
  }

  /**
   * 判断字段是否属于研发侧（研发负责人可编辑）
   */
  private isDevField(fieldName: string): boolean {
    const devFields = [
      '开发状态',
      '研发负责人',
      '开发备注',
      '预计完成时间',
      '实际完成时间',
    ];
    return devFields.includes(fieldName);
  }

  /**
   * 判断字段是否属于 DS 侧（数据负责人/DS验收人可编辑）
   */
  private isDsField(fieldName: string): boolean {
    // 除研发侧字段外，其余均视为 DS 侧字段
    return !this.isDevField(fieldName);
  }

  /**
   * 更新主表字段
   */
  async updateRecord(
    recordId: string,
    userId: string,
    data: UpdateTrackingRecordRequest,
  ): Promise<UpdateTrackingRecordResponse> {
    // 先获取当前记录
    const rec = await this.bitableService.getRecord('workbench', recordId);
    if (!rec) {
      throw new NotFoundException('需求记录不存在或已被删除');
    }

    const record = rec.record;
    const dataOwner = this.extractUserIds(record['数据负责人']);
    const devOwner = this.extractUserIds(record['研发负责人']);
    const dsAcceptor = this.extractUserIds(record['DS验收人']);
    const currentStage = this.getFieldStr(record, '流程阶段');

    const isDs = dataOwner.includes(userId) || dsAcceptor.includes(userId);
    const isDevOwner = devOwner.includes(userId);

    // 校验阶段跳转合法性
    let targetStage = currentStage;
    if (data.targetStage) {
      targetStage = data.targetStage;
      if (!STAGE_ORDER.includes(targetStage)) {
        throw new BadRequestException(`无效的阶段：${targetStage}`);
      }
      if (!isStageTransitionValid(currentStage, targetStage)) {
        throw new BadRequestException(
          `非法阶段跳转：不能从「${currentStage}」跳转到「${targetStage}」`,
        );
      }
      // 阶段跳转需要 DS 权限
      if (!isDs) {
        throw new ForbiddenException('无权限变更流程阶段');
      }
    }

    // 校验字段编辑权限
    const fieldKeys = Object.keys(data.fields || {});
    for (const fieldKey of fieldKeys) {
      if (this.isDevField(fieldKey)) {
        if (!isDevOwner) {
          throw new ForbiddenException(`无权限编辑字段：${fieldKey}`);
        }
      } else if (this.isDsField(fieldKey)) {
        if (!isDs) {
          throw new ForbiddenException(`无权限编辑字段：${fieldKey}`);
        }
      }
    }

    // 构造更新数据
    const updateRecord: Record<string, unknown> = { ...data.fields };
    if (data.targetStage) {
      updateRecord['流程阶段'] = data.targetStage;
    }

    // 调用 Base 更新
    await this.bitableService.batchUpdateRecords('workbench', [
      { id: recordId, record: updateRecord },
    ]);

    return {
      success: true,
      recordId,
      currentStage: targetStage,
    };
  }

  /**
   * 从主表获取记录并解析负责人信息（用于权限校验）
   */
  private async getWorkbenchOwners(recordId: string): Promise<{
    dataOwner: string[];
    devOwner: string[];
    dsAcceptor: string[];
    evtId: string;
  }> {
    const rec = await this.bitableService.getRecord('workbench', recordId);
    if (!rec) {
      throw new NotFoundException('需求记录不存在或已被删除');
    }
    const record = rec.record;
    return {
      dataOwner: this.extractUserIds(record['数据负责人']),
      devOwner: this.extractUserIds(record['研发负责人']),
      dsAcceptor: this.extractUserIds(record['DS验收人']),
      evtId: this.getFieldStr(record, 'evt_id'),
    };
  }

  /**
   * 校验 DS 权限（数据负责人或 DS 验收人）
   */
  private assertDsPermission(
    userId: string,
    dataOwner: string[],
    dsAcceptor: string[],
  ): void {
    const isDs = dataOwner.includes(userId) || dsAcceptor.includes(userId);
    if (!isDs) {
      throw new ForbiddenException('无权限操作参数，需数据负责人或 DS 验收人权限');
    }
  }

  /**
   * 将 Base 记录映射为 ParamDetail
   */
  private mapParamRecord(rec: { id: string; record: Record<string, unknown> }): ParamDetail {
    const r = rec.record;
    const requiredRaw = r['必传规则'];
    let required = false;
    if (typeof requiredRaw === 'boolean') {
      required = requiredRaw;
    } else if (typeof requiredRaw === 'string') {
      required = requiredRaw === '必传' || requiredRaw === '是' || requiredRaw === 'true';
    }

    return {
      recordId: rec.id,
      paramKey: this.getFieldStr(r, '参数名'),
      evtId: this.getFieldStr(r, 'evt_id'),
      paramName: this.getFieldStr(r, '参数名'),
      paramType: this.getFieldStr(r, '数据类型'),
      required,
      triggerCondition: this.getFieldStr(r, '条件说明'),
      enumRange: this.getFieldStr(r, '枚举/取值范围'),
      definition: this.getFieldStr(r, '参数定义'),
      defaultValue: this.getFieldStr(r, '默认值/示例'),
      example: this.getFieldStr(r, '默认值/示例'),
      platform: this.getFieldStr(r, 'App适用性'),
      status: this.getFieldStr(r, '参数状态'),
      version: this.getFieldStr(r, '版本'),
      changeType: this.getFieldStr(r, '变更类型'),
    };
  }

  /**
   * 获取参数列表
   */
  async getParams(recordId: string): Promise<GetParamsResponse> {
    const { evtId } = await this.getWorkbenchOwners(recordId);

    const filter = {
      conjunction: 'and' as const,
      conditions: [
        {
          fieldName: 'evt_id',
          operator: 'is',
          value: [evtId],
        },
      ],
    };

    const result = await this.bitableService.searchRecords('paramDetail', {
      filter,
      pageSize: 200,
    });

    const records = result.records || [];
    const items: ParamDetail[] = records.map((rec) => this.mapParamRecord(rec));
    const total = result.total ?? items.length;

    return { items, total };
  }

  /**
   * 新增参数
   */
  async createParam(
    recordId: string,
    userId: string,
    data: CreateParamRequest,
  ): Promise<CreateParamResponse> {
    const { dataOwner, dsAcceptor, evtId } = await this.getWorkbenchOwners(recordId);
    this.assertDsPermission(userId, dataOwner, dsAcceptor);

    const fields: Record<string, unknown> = {
      '参数 key': data.paramKey,
      evt_id: data.evtId || evtId,
      '参数名': data.paramName,
      '参数类型': data.paramType,
      '是否必传': data.required ? '是' : '否',
      '触发条件': data.triggerCondition || '',
      '枚举范围': data.enumRange || '',
      '定义': data.definition || '',
      '默认值': data.defaultValue || '',
      '示例': data.example || '',
      '适用端': data.platform || '',
      '状态': data.status || '正常',
      '版本': data.version || '',
      '变更类型': data.changeType || '',
    };

    const result = await this.bitableService.batchAddRecords('paramDetail', [fields]);
    const newRecordId = result[0]?.id || '';

    return { success: true, recordId: newRecordId };
  }

  /**
   * 编辑参数
   */
  async updateParam(
    paramRecordId: string,
    userId: string,
    data: UpdateParamRequest,
  ): Promise<UpdateParamResponse> {
    // 先获取参数记录，找到 evt_id 后反查主表权限
    const paramRec = await this.bitableService.getRecord('paramDetail', paramRecordId);
    if (!paramRec) {
      throw new NotFoundException('参数记录不存在或已被删除');
    }

    const evtId = this.getFieldStr(paramRec.record, 'evt_id');

    // 通过 evt_id 反查主表记录以获取负责人信息
    const workbenchResult = await this.bitableService.searchRecords('workbench', {
      fieldNames: ['数据负责人', '研发负责人', 'DS验收人', 'evt_id'],
      filter: {
        conjunction: 'and',
        conditions: [
          {
            fieldName: 'evt_id',
            operator: 'is',
            value: [evtId],
          },
        ],
      },
      pageSize: 1,
    });

    if (!workbenchResult.records || workbenchResult.records.length === 0) {
      throw new NotFoundException('未找到关联的需求记录');
    }

    const wbRecord = workbenchResult.records[0].record;
    const dataOwner = this.extractUserIds(wbRecord['数据负责人']);
    const dsAcceptor = this.extractUserIds(wbRecord['DS验收人']);
    this.assertDsPermission(userId, dataOwner, dsAcceptor);

    // 构造更新字段（只更新传入的字段）
    const fields = data.fields || {};
    const updateFields: Record<string, unknown> = {};

    const fieldMap: Record<string, string> = {
      paramKey: '参数 key',
      evtId: 'evt_id',
      paramName: '参数名',
      paramType: '参数类型',
      triggerCondition: '触发条件',
      enumRange: '枚举范围',
      definition: '定义',
      defaultValue: '默认值',
      example: '示例',
      platform: '适用端',
      status: '状态',
      version: '版本',
      changeType: '变更类型',
    };

    for (const [key, value] of Object.entries(fields)) {
      if (key === 'required') {
        updateFields['是否必传'] = value ? '是' : '否';
      } else if (fieldMap[key]) {
        updateFields[fieldMap[key]] = value;
      }
    }

    if (Object.keys(updateFields).length > 0) {
      await this.bitableService.batchUpdateRecords('paramDetail', [
        { id: paramRecordId, record: updateFields },
      ]);
    }

    return { success: true, recordId: paramRecordId };
  }

  /**
   * 软删除参数（更新状态为「废弃」）
   */
  async deleteParam(
    paramRecordId: string,
    userId: string,
  ): Promise<DeleteParamResponse> {
    const paramRec = await this.bitableService.getRecord('paramDetail', paramRecordId);
    if (!paramRec) {
      throw new NotFoundException('参数记录不存在或已被删除');
    }

    const evtId = this.getFieldStr(paramRec.record, 'evt_id');

    const workbenchResult = await this.bitableService.searchRecords('workbench', {
      fieldNames: ['数据负责人', '研发负责人', 'DS验收人', 'evt_id'],
      filter: {
        conjunction: 'and',
        conditions: [
          {
            fieldName: 'evt_id',
            operator: 'is',
            value: [evtId],
          },
        ],
      },
      pageSize: 1,
    });

    if (!workbenchResult.records || workbenchResult.records.length === 0) {
      throw new NotFoundException('未找到关联的需求记录');
    }

    const wbRecord = workbenchResult.records[0].record;
    const dataOwner = this.extractUserIds(wbRecord['数据负责人']);
    const dsAcceptor = this.extractUserIds(wbRecord['DS验收人']);
    this.assertDsPermission(userId, dataOwner, dsAcceptor);

    await this.bitableService.batchUpdateRecords('paramDetail', [
      { id: paramRecordId, record: { '状态': '废弃' } },
    ]);

    return { success: true };
  }
}
