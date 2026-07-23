import { Injectable, Logger } from '@nestjs/common';
import { BitableService, type BitableFilter } from '../bitable/bitable.service';
import {
  STAGE_UI_MAP,
  UI_STAGE_NODES,
  PRIORITY_WEIGHT,
} from '../bitable/bitable.constants';
import { getUiStageFromBase } from '../bitable/bitable.utils';
import type {
  StageStat,
  TodoItem,
  TrackingRecord,
  GetTrackingRecordsParams,
  GetTrackingRecordsResponse,
} from '@shared/api.interface';

interface BaseUserField {
  id?: string;
  user_id?: string;
  name?: string;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(private readonly bitableService: BitableService) {}

  /**
   * 从 Base user 类型字段中提取 user_id 数组
   */
  private extractUserIds(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .map((item: unknown) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') {
            const obj = item as BaseUserField;
            return obj.user_id || obj.id || '';
          }
          return '';
        })
        .filter(Boolean);
    }
    if (typeof value === 'string') return [value];
    return [];
  }

  /**
   * 从记录中安全获取字段值（字符串）
   */
  private getFieldStr(record: Record<string, unknown>, field: string): string {
    const val = record[field];
    if (val == null) return '';
    if (typeof val === 'string') return val;
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
      measures: [{ fieldName: '', aggregation: 'count_all', alias: 'count_all' }],
    });

    // 初始化 6 个 UI 节点，数量为 0
    const stageCount: Record<string, number> = {};
    for (const node of UI_STAGE_NODES) {
      stageCount[node] = 0;
    }

    // 解析聚合结果并映射到 UI 节点
    if (result.result && result.result.length > 0) {
      for (const item of result.result) {
        const val = item.value;
        if (!val) continue;
        const baseStageVal = val['流程阶段'];
        const baseStage = Array.isArray(baseStageVal)
          ? String(baseStageVal[0] || '')
          : String(baseStageVal || '');
        const count = Number(val.count_all) || 0;
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
    const filter: BitableFilter = {
      conjunction: 'and',
      conditions: [
        {
          fieldName: '流程阶段',
          operator: 'isNot',
          value: ['稳定归档', '已废弃'],
        },
      ],
    };

    // 先拉取较多数据，再在内存中按负责人过滤和优先级排序
    // （Base 对 user 字段的过滤操作符有限，用内存过滤更可靠）
    const result = await this.bitableService.searchRecords('workbench', {
      fieldNames: [
        'evt_id',
        '事件名',
        '流程阶段',
        '优先级',
        '平台',
        '数据负责人',
        '研发负责人',
        'DS验收人',
      ],
      filter,
      pageSize: Math.max(limit * 5, 50),
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

      const priority = this.getFieldStr(record, '优先级');
      const priorityWeight =
        PRIORITY_WEIGHT[priority] !== undefined
          ? PRIORITY_WEIGHT[priority]
          : 99;

      todos.push({
        recordId: rec.id,
        evtId: this.getFieldStr(record, 'evt_id'),
        eventName: this.getFieldStr(record, '事件名'),
        stage: getUiStageFromBase(this.getFieldStr(record, '流程阶段')),
        priority,
        platform: this.getFieldStr(record, '平台'),
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
      fieldNames: [
        'evt_id',
        '事件名',
        '流程阶段',
        '优先级',
        '平台',
        '数据负责人',
        '研发负责人',
        '更新时间',
      ],
      filter,
      sort: [{ fieldName: '更新时间', desc: true }],
      pageSize: keyword || owner ? Math.max(pageSize * 3, 100) : pageSize,
      pageToken,
    });

    let records = result.records || [];

    // 内存过滤：keyword
    if (keyword) {
      const kw = keyword.toLowerCase();
      records = records.filter((rec) => {
        const evtId = this.getFieldStr(rec.record, 'evt_id').toLowerCase();
        const eventName = this.getFieldStr(rec.record, '事件名').toLowerCase();
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
        evtId: this.getFieldStr(record, 'evt_id'),
        eventName: this.getFieldStr(record, '事件名'),
        stage: getUiStageFromBase(this.getFieldStr(record, '流程阶段')),
        priority: this.getFieldStr(record, '优先级'),
        platform: this.getFieldStr(record, '平台'),
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
}
