import { Injectable, Logger } from '@nestjs/common';
import { BitableService, type BitableFilter } from '../bitable/bitable.service';
import type {
  OfficialEvent,
  OfficialParam,
  GetOfficialEventsParams,
  GetOfficialEventsResponse,
  GetOfficialParamsResponse,
} from '@shared/api.interface';

// 「02 App埋点查询库（正式）」表字段名（中文）
const EVENT_FIELDS = {
  evtId: 'evt_id',
  eventName: '事件中文名',
  platform: '端',
  version: '版本',
  status: '正式状态',
} as const;

// 参数表字段名（中文）— 若查询库表内含子表/关联表，按实际字段读取
const PARAM_FIELDS = {
  paramKey: '参数名',
  paramName: '参数名',
  paramType: '数据类型',
  required: '必传规则',
  definition: '参数定义',
  example: '默认值/示例',
  evtId: 'evt_id',
} as const;

function normalizeFieldName(name: string): string {
  return name.toLowerCase().replace(/[\s_\-]+/g, '');
}

function findFieldKey(record: Record<string, unknown>, candidates: string[]): string | undefined {
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

function getFieldText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => getFieldText(v)).join('');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('text' in obj) return String(obj.text);
    if ('value' in obj) return String(obj.value);
    if ('name' in obj) return String(obj.name);
  }
  return String(value);
}

function getFieldBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['是', 'true', 'True', 'TRUE', '1', '必传', 'required'].includes(value);
  }
  return false;
}

@Injectable()
export class QueryLibraryService {
  private readonly logger = new Logger(QueryLibraryService.name);

  constructor(private readonly bitableService: BitableService) {}

  async getEvents(
    params: GetOfficialEventsParams,
  ): Promise<GetOfficialEventsResponse> {
    const { keyword, pageSize = 20, pageToken } = params;

    const filter: BitableFilter | undefined = keyword
      ? {
          conjunction: 'or',
          conditions: [
            {
              fieldName: EVENT_FIELDS.evtId,
              operator: 'contains',
              value: [keyword],
            },
            {
              fieldName: EVENT_FIELDS.eventName,
              operator: 'contains',
              value: [keyword],
            },
          ],
        }
      : undefined;

    const result = await this.bitableService.searchRecords('queryLibrary', {
      filter,
      pageSize,
      pageToken,
    });

    const items: OfficialEvent[] = result.records.map((rec) => {
      const r = rec.record;
      const evtIdKey = findFieldKey(r, [EVENT_FIELDS.evtId, 'evt id', '事件ID', '事件id']);
      const eventNameKey = findFieldKey(r, [EVENT_FIELDS.eventName, '事件名称']);
      const platformKey = findFieldKey(r, [EVENT_FIELDS.platform, '端', '适用端']);
      const versionKey = findFieldKey(r, [EVENT_FIELDS.version, '版本号']);
      const statusKey = findFieldKey(r, [EVENT_FIELDS.status, '事件状态']);
      return {
        recordId: rec.id,
        evtId: evtIdKey ? getFieldText(r[evtIdKey]) : '',
        eventName: eventNameKey ? getFieldText(r[eventNameKey]) : '',
        platform: platformKey ? getFieldText(r[platformKey]) : '',
        version: versionKey ? getFieldText(r[versionKey]) : '',
        status: statusKey ? getFieldText(r[statusKey]) : '',
      };
    });

    return {
      items,
      hasMore: result.hasMore,
      pageToken: result.pageToken,
      total: result.total ?? items.length,
    };
  }

  async getEventParams(recordId: string): Promise<GetOfficialParamsResponse> {
    // 先查主表记录，获取 evt_id
    const record = await this.bitableService.getRecord(
      'queryLibrary',
      recordId,
    );

    if (!record) {
      return { items: [], total: 0 };
    }

    const evtIdKey = findFieldKey(record.record, [EVENT_FIELDS.evtId, 'evt id', '事件ID', '事件id']);
    const evtId = evtIdKey ? getFieldText(record.record[evtIdKey]) : '';

    // 尝试从同一张查询库表中读取参数字段（可能是子表/关联记录）
    // 若该表没有独立的参数字段，返回空数组
    const paramListRaw = record.record['参数列表'] ?? record.record['参数'];

    // 如果参数是内嵌数组结构（如子表记录），直接解析
    if (Array.isArray(paramListRaw) && paramListRaw.length > 0) {
      const items: OfficialParam[] = paramListRaw
        .map((item: unknown) => {
          if (typeof item !== 'object' || item == null) return null;
          const obj = item as Record<string, unknown>;
          const fields = (obj.fields ?? obj) as Record<string, unknown>;
          return {
            paramKey: getFieldText(fields[PARAM_FIELDS.paramKey]),
            paramName: getFieldText(fields[PARAM_FIELDS.paramName]),
            paramType: getFieldText(fields[PARAM_FIELDS.paramType]),
            required: getFieldBool(fields[PARAM_FIELDS.required]),
            definition: getFieldText(fields[PARAM_FIELDS.definition]),
            example: getFieldText(fields[PARAM_FIELDS.example]),
          } as OfficialParam;
        })
        .filter((p): p is OfficialParam => p != null && p.paramKey !== '');

      return { items, total: items.length };
    }

    // 兜底：通过 paramDetail 表（参数明细表）按 evt_id 关联查询
    try {
      const paramResult = await this.bitableService.searchRecords(
        'paramDetail',
        {
          filter: {
            conditions: [
              {
                fieldName: PARAM_FIELDS.evtId,
                operator: 'is',
                value: [evtId],
              },
            ],
          },
          pageSize: 100,
        },
      );

      const items: OfficialParam[] = paramResult.records.map((rec) => {
        const r = rec.record;
        return {
          paramKey: getFieldText(r[PARAM_FIELDS.paramKey]),
          paramName: getFieldText(r[PARAM_FIELDS.paramName]),
          paramType: getFieldText(r[PARAM_FIELDS.paramType]),
          required: getFieldBool(r[PARAM_FIELDS.required]),
          definition: getFieldText(r[PARAM_FIELDS.definition]),
          example: getFieldText(r[PARAM_FIELDS.example]),
        };
      });

      return { items, total: paramResult.total ?? items.length };
    } catch (error) {
      this.logger.warn(
        `查询参数明细失败，返回空数组：${error instanceof Error ? error.message : String(error)}`,
      );
      return { items: [], total: 0 };
    }
  }
}
