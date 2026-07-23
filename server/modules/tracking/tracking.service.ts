import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateParamRequest,
  CreateParamResponse,
  DeleteParamResponse,
  GetMyTodosResponse,
  GetParamsResponse,
  GetStageStatsResponse,
  GetTrackingDetailResponse,
  GetTrackingRecordsParams,
  GetTrackingRecordsResponse,
  ParamDetail,
  TrackingDetail,
  TrackingRecord,
  UpdateParamRequest,
  UpdateParamResponse,
  UpdateTrackingRecordRequest,
  UpdateTrackingRecordResponse,
} from '@shared/api.interface';
import { UI_STAGE_NODES, PRIORITY_WEIGHT } from '../bitable/bitable.constants';
import { BitableRecord, BitableService } from '../bitable/bitable.service';
import {
  calculatePermissions,
  getBaseStageFromUi,
  getUiStageFromBase,
  isStageTransitionValid,
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
  '参数状态',
  '版本',
  '变更类型',
  '来源设计记录ID',
  '关联设计',
] as const;

type Cell = unknown;

@Injectable()
export class TrackingService {
  constructor(private readonly bitable: BitableService) {}

  async getStageStats(): Promise<GetStageStatsResponse> {
    const records = await this.listWorkbenchRecords();
    const countMap = new Map(UI_STAGE_NODES.map((stage) => [stage, 0]));
    for (const record of records) {
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

  async getMyTodos(limit = 10): Promise<GetMyTodosResponse> {
    const records = await this.listWorkbenchRecords();
    const todoStages = new Set(['需求录入', '埋点设计', '评审通过', '埋点开发', '数据验收']);
    const items = records
      .filter((record) => todoStages.has(cellText(record.record['流程阶段'])))
      .map((record) => this.toTrackingRecord(record))
      .sort(compareTrackingRecord)
      .slice(0, limit)
      .map((record) => ({
        recordId: record.recordId,
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
    const records = await this.listWorkbenchRecords();
    const keyword = (params.keyword || '').trim().toLowerCase();
    const filtered = records
      .map((record) => this.toTrackingRecord(record))
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

  async getDetail(recordId: string, actorId?: string): Promise<GetTrackingDetailResponse> {
    const record = await this.bitable.getRecord('workbench', recordId);
    if (!record) {
      throw new NotFoundException('埋点需求不存在');
    }
    return { data: this.toTrackingDetail(record, actorId) };
  }

  async updateRecord(
    recordId: string,
    body: UpdateTrackingRecordRequest,
  ): Promise<UpdateTrackingRecordResponse> {
    const current = await this.bitable.getRecord('workbench', recordId);
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

    await this.bitable.batchUpdateRecords('workbench', [{ id: recordId, record: patch }]);
    return { success: true, recordId, currentStage };
  }

  async getParams(recordId: string): Promise<GetParamsResponse> {
    const detail = await this.bitable.getRecord('workbench', recordId);
    if (!detail) {
      throw new NotFoundException('埋点需求不存在');
    }

    const evtId = cellText(detail.record['evt_id']);
    const result = await this.bitable.searchRecords('paramDetail', {
      fieldNames: [...PARAM_FIELDS],
      pageSize: 200,
    });
    const items = result.records
      .filter((record) => this.isParamForDesign(record, recordId, evtId))
      .map((record) => this.toParamDetail(record))
      .sort((a, b) => a.paramKey.localeCompare(b.paramKey));

    return { items, total: items.length };
  }

  async createParam(
    recordId: string,
    body: CreateParamRequest,
  ): Promise<CreateParamResponse> {
    const detail = await this.bitable.getRecord('workbench', recordId);
    if (!detail) {
      throw new NotFoundException('埋点需求不存在');
    }
    const evtId = body.evtId || cellText(detail.record['evt_id']);
    const paramName = body.paramName.trim();
    if (!evtId || !paramName) {
      throw new BadRequestException('evt_id 和参数名不能为空');
    }

    const [created] = await this.bitable.batchAddRecords('paramDetail', [
      {
        '设计参数主键': body.paramKey || `${evtId}.${paramName}`,
        evt_id: evtId,
        '参数名': paramName,
        '数据类型': body.paramType || 'STRING',
        '必传规则': body.required ? '必传' : '非必传',
        '条件说明': body.triggerCondition || '',
        '枚举/取值范围': body.enumRange || '',
        '参数定义': body.definition || '',
        '默认值/示例': body.example || body.defaultValue || '',
        'App适用性': body.platform || 'App通用',
        '参数状态': body.status || '草稿',
        '版本': body.version || cellText(detail.record['版本']),
        '变更类型': body.changeType || '新增',
        '来源设计记录ID': recordId,
        '关联设计': [{ id: recordId }],
      },
    ]);

    return { success: true, recordId: created.id };
  }

  async updateParam(
    paramRecordId: string,
    body: UpdateParamRequest,
  ): Promise<UpdateParamResponse> {
    await this.bitable.batchUpdateRecords('paramDetail', [
      { id: paramRecordId, record: body.fields || {} },
    ]);
    return { success: true, recordId: paramRecordId };
  }

  async deleteParam(paramRecordId: string): Promise<DeleteParamResponse> {
    await this.bitable.batchUpdateRecords('paramDetail', [
      { id: paramRecordId, record: { '参数状态': '废弃' } },
    ]);
    return { success: true };
  }

  private async listWorkbenchRecords(): Promise<BitableRecord[]> {
    const result = await this.bitable.searchRecords('workbench', {
      fieldNames: [...WORKBENCH_FIELDS],
      pageSize: 200,
    });
    return result.records.filter((record) => {
      const evtId = cellText(record.record['evt_id']);
      const type = cellText(record.record['记录类型']);
      return Boolean(evtId) && type !== '模板';
    });
  }

  private toTrackingRecord(record: BitableRecord): TrackingRecord {
    const users = {
      data: cellUsers(record.record['数据负责人']),
      dev: cellUsers(record.record['研发负责人']),
    };
    const stage = cellText(record.record['流程阶段']) || '需求录入';
    return {
      recordId: record.id,
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

  private toTrackingDetail(record: BitableRecord, actorId?: string): TrackingDetail {
    const dataOwner = cellUsers(record.record['数据负责人']);
    const devOwner = cellUsers(record.record['研发负责人']);
    const dsAcceptor = cellUsers(record.record['DS验收人']);
    const actor = actorId || '';

    return {
      ...this.toTrackingRecord(record),
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
        ? calculatePermissions(actor, dataOwner.ids, devOwner.ids, dsAcceptor.ids)
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

  private toParamDetail(record: BitableRecord): ParamDetail {
    const requiredRule = cellText(record.record['必传规则']);
    return {
      recordId: record.id,
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
      platform: cellText(record.record['App适用性']),
      status: cellText(record.record['参数状态']) || '草稿',
      version: cellText(record.record['版本']),
      changeType: cellText(record.record['变更类型']) || '新增',
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
