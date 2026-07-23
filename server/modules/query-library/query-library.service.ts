import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  GetOfficialEventsParams,
  GetOfficialEventsResponse,
  GetOfficialParamsResponse,
  OfficialEvent,
  OfficialParam,
} from '@shared/api.interface';
import { BitableRecord, BitableService } from '../bitable/bitable.service';

const OFFICIAL_FIELDS = [
  'evt_id',
  '事件中文名',
  '端',
  '上线版本',
  '状态',
  '生命周期状态',
  '参数明细入口',
  '事件定义',
  '触发时机',
  '指标/使用场景',
] as const;

@Injectable()
export class QueryLibraryService {
  constructor(private readonly bitable: BitableService) {}

  async getEvents(params: GetOfficialEventsParams): Promise<GetOfficialEventsResponse> {
    const pageSize = Number(params.pageSize || 50);
    const keyword = (params.keyword || '').trim().toLowerCase();
    const result = await this.bitable.searchRecords('queryLibrary', {
      fieldNames: [...OFFICIAL_FIELDS],
      pageSize: 200,
    });
    const items = result.records
      .map((record) => this.toOfficialEvent(record))
      .filter((event) => {
        if (!event.evtId) return false;
        if (!keyword) return true;
        return `${event.evtId} ${event.eventName}`.toLowerCase().includes(keyword);
      });

    return {
      items: items.slice(0, pageSize),
      hasMore: items.length > pageSize,
      total: items.length,
    };
  }

  async getParams(recordId: string): Promise<GetOfficialParamsResponse> {
    const record = await this.bitable.getRecord('queryLibrary', recordId);
    if (!record) {
      throw new NotFoundException('正式事件不存在');
    }

    const params: OfficialParam[] = [];
    const paramLink = cellText(record.record['参数明细入口']);
    if (paramLink) {
      params.push({
        paramKey: '参数明细入口',
        paramName: '点击打开正式参数表',
        paramType: 'LINK',
        required: false,
        definition: paramLink,
        example: paramLink,
      });
    }

    return { items: params, total: params.length };
  }

  private toOfficialEvent(record: BitableRecord): OfficialEvent {
    return {
      recordId: record.id,
      evtId: cellText(record.record['evt_id']),
      eventName: cellText(record.record['事件中文名']) || '未命名事件',
      platform: cellText(record.record['端']) || '-',
      version: cellText(record.record['上线版本']) || '-',
      status: cellText(record.record['状态']) || cellText(record.record['生命周期状态']) || '-',
    };
  }
}

function cellText(value: unknown): string {
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
  }
  return '';
}
