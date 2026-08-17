import { Injectable, NotFoundException } from '@nestjs/common';
import type { GetOfficialEventsParams, GetOfficialEventsResponse, GetOfficialParamsResponse, OfficialEvent, OfficialEventContext, OfficialParam, TrackingSource } from '@shared/api.interface';
import { BitableRecord, BitableService } from '../bitable/bitable.service';
import type { BitableInstanceKey } from '../bitable/bitable.constants';

const APP_OFFICIAL_FIELDS = ['evt_id', '事件中文名', '端', '上线版本', '状态', '生命周期状态', '参数明细入口', '事件定义', '触发时机', '指标/使用场景'] as const;

const WEB_OFFICIAL_FIELDS = ['evt_id', '事件中文名', '端', '上线版本', '状态', '生命周期状态', '参数明细入口', '事件定义', '触发时机', '指标/使用场景'] as const;

const OFFICIAL_PARAM_BASE_FIELDS = [
  '参数主键',
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
  '来源表',
  '关联事件',
  '备注',
] as const;

const APP_OFFICIAL_PARAM_FIELDS = [...OFFICIAL_PARAM_BASE_FIELDS.slice(0, 13), 'App适用性', ...OFFICIAL_PARAM_BASE_FIELDS.slice(13)] as const;

const WEB_OFFICIAL_PARAM_FIELDS = [...OFFICIAL_PARAM_BASE_FIELDS.slice(0, 13), 'Web适用性', ...OFFICIAL_PARAM_BASE_FIELDS.slice(13)] as const;

const APP_PARAM_BASE_LINK = 'https://bcn0tgplxp2e.feishu.cn/base/Kgy0b4bvmaJSK8sjQDscUrNJnOf?table=tblEYv9lGZeenbT2';
const WEB_PARAM_BASE_LINK = 'https://bcn0tgplxp2e.feishu.cn/base/EX4RbTvp9agYNws6PIHcKD20nqf?table=tblNAMKr5S38iXJQ';

@Injectable()
export class QueryLibraryService {
  constructor(private readonly bitable: BitableService) {}

  async getEvents(params: GetOfficialEventsParams): Promise<GetOfficialEventsResponse> {
    const source = normalizeSource(params.source);
    const pageSize = Number(params.pageSize || 50);
    const offset = Number(params.pageToken || 0);
    const keyword = (params.keyword || '').trim().toLowerCase();
    const records = await this.searchAllRecords(queryLibraryKey(source), officialFields(source));
    const filtered = records
      .map((record) => this.toOfficialEvent(record, source))
      .filter((event) => {
        if (!event.evtId) return false;
        if (!keyword) return true;
        return `${event.evtId} ${event.eventName}`.toLowerCase().includes(keyword);
      });
    const items = dedupeOfficialEvents(filtered);
    const nextOffset = offset + pageSize;

    return {
      items: items.slice(offset, nextOffset),
      hasMore: nextOffset < items.length,
      pageToken: nextOffset < items.length ? String(nextOffset) : undefined,
      total: items.length,
    };
  }

  async getParams(recordId: string): Promise<GetOfficialParamsResponse> {
    const ref = parseScopedRecordId(recordId);
    const record = await this.bitable.getRecord(queryLibraryKey(ref.source), ref.rawId);
    if (!record) {
      throw new NotFoundException('正式事件不存在');
    }

    const evtId = cellText(record.record['evt_id']);
    const baseLink = cellText(record.record['参数明细入口']) || paramBaseLink(ref.source);
    const records = await this.searchAllRecords(officialParamDetailKey(ref.source), officialParamFields(ref.source));
    const params = records
      .filter((paramRecord) => isOfficialParamForEvent(paramRecord, ref.rawId, evtId))
      .map((paramRecord) => this.toOfficialParam(paramRecord, ref.source))
      .filter((param) => param.paramKey || param.paramName)
      .filter((param) => param.status !== '已废弃')
      .sort((a, b) => a.paramKey.localeCompare(b.paramKey));

    return { items: params, total: params.length, baseLink };
  }

  async getEventContexts(events: OfficialEvent[]): Promise<OfficialEventContext[]> {
    if (!events.length) return [];
    const source = events[0].source;
    const sourceEvents = events.filter((event) => event.source === source);
    const records = await this.searchAllRecords(
      officialParamDetailKey(source),
      officialParamFields(source),
    );

    return sourceEvents.map((event) => {
      const rawEventId = parseScopedRecordId(event.recordId).rawId;
      const params = records
        .filter((record) => isOfficialParamForEvent(record, rawEventId, event.evtId))
        .map((record) => this.toOfficialParam(record, source))
        .filter((param) => (param.paramKey || param.paramName) && param.status !== '已废弃')
        .sort((left, right) => left.paramKey.localeCompare(right.paramKey));
      return { event, params };
    });
  }

  private toOfficialEvent(record: BitableRecord, source: TrackingSource): OfficialEvent {
    return {
      recordId: encodeScopedRecordId(source, record.id),
      source,
      evtId: cellText(record.record['evt_id']),
      eventName: cellText(record.record['事件中文名']) || '未命名事件',
      platform: cellText(record.record['端']) || '-',
      version: firstText(record.record['上线版本'], record.record['版本']) || '-',
      paramLink: cellText(record.record['参数明细入口']) || paramBaseLink(source),
      status: firstText(record.record['状态'], record.record['正式状态'], record.record['生命周期状态'], record.record['流程阶段']) || '-',
      eventDefinition: cellText(record.record['事件定义']),
      triggerTiming: cellText(record.record['触发时机']),
      metricScenario: cellText(record.record['指标/使用场景']),
    };
  }

  private toOfficialParam(record: BitableRecord, source: TrackingSource): OfficialParam {
    const requiredRule = cellText(record.record['必传规则']);
    const evtId = cellText(record.record['evt_id']);
    const paramName = cellText(record.record['参数名']);
    return {
      paramKey: cellText(record.record['参数主键']) || buildParamKey(evtId, paramName),
      paramName,
      paramType: cellText(record.record['数据类型']) || '-',
      required: requiredRule === '必传' || requiredRule === '条件必传',
      requiredRule: requiredRule || '非必传',
      enumRange: cellText(record.record['枚举/取值范围']),
      definition: cellText(record.record['参数定义']),
      example: cellText(record.record['备注']),
      platform: normalizeParamApplicability(cellText(record.record[source === 'web' ? 'Web适用性' : 'App适用性']), source),
      status: cellText(record.record['参数状态']),
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
}

function normalizeSource(value?: string): TrackingSource {
  return value === 'web' ? 'web' : 'app';
}

function queryLibraryKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webQueryLibrary' : 'queryLibrary';
}

function officialParamDetailKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webOfficialParamDetail' : 'officialParamDetail';
}

function officialFields(source: TrackingSource): readonly string[] {
  return source === 'web' ? WEB_OFFICIAL_FIELDS : APP_OFFICIAL_FIELDS;
}

function officialParamFields(source: TrackingSource): readonly string[] {
  return source === 'web' ? WEB_OFFICIAL_PARAM_FIELDS : APP_OFFICIAL_PARAM_FIELDS;
}

function paramBaseLink(source: TrackingSource): string {
  return source === 'web' ? WEB_PARAM_BASE_LINK : APP_PARAM_BASE_LINK;
}

function dedupeOfficialEvents(items: OfficialEvent[]): OfficialEvent[] {
  const map = new Map<string, OfficialEvent>();
  for (const item of items) {
    const key = item.evtId.trim().toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    map.set(key, {
      ...existing,
      eventName: existing.eventName !== '未命名事件' ? existing.eventName : item.eventName,
      platform: mergeTextList(existing.platform, item.platform),
      version: firstDisplayText(existing.version, item.version),
      status: firstDisplayText(existing.status, item.status),
      paramLink: firstDisplayText(existing.paramLink, item.paramLink),
    });
  }
  return Array.from(map.values());
}

function mergeTextList(left: string, right: string): string {
  const values = [...left.split(/[、,，]/), ...right.split(/[、,，]/)].map((item) => item.trim()).filter((item) => item && item !== '-');
  return Array.from(new Set(values)).join('、') || '-';
}

function firstDisplayText(...values: string[]): string {
  return values.find((value) => value && value !== '-') || '-';
}

function buildParamKey(evtId?: string, paramName?: string): string {
  const eventId = String(evtId || '').trim();
  const name = String(paramName || '').trim();
  return eventId && name ? `${eventId}.${name}` : '';
}

function isOfficialParamForEvent(record: BitableRecord, officialEventRecordId: string, evtId: string): boolean {
  const linkedEventIds = cellIds(record.record['关联事件']);
  if (linkedEventIds.includes(officialEventRecordId)) return true;
  return Boolean(evtId) && cellText(record.record.evt_id) === evtId;
}

function cellIds(value: unknown): string[] {
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

function normalizeParamApplicability(value: string, source: TrackingSource): string {
  const raw = String(value || '').trim();
  if (source === 'web') {
    const alias: Record<string, string> = {
      Web: 'Web通用',
      仅Web: 'Web通用',
    };
    return alias[raw] || raw || '-';
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
  return alias[raw] || raw || '-';
}

function encodeScopedRecordId(source: TrackingSource, rawId: string): string {
  return `${source}:${rawId}`;
}

function parseScopedRecordId(recordId: string): {
  source: TrackingSource;
  rawId: string;
} {
  if (recordId.startsWith('web:')) {
    return { source: 'web', rawId: recordId.slice(4) };
  }
  if (recordId.startsWith('app:')) {
    return { source: 'app', rawId: recordId.slice(4) };
  }
  return { source: 'app', rawId: recordId };
}

function firstText(...values: unknown[]): string {
  return values.map(cellText).find(Boolean) || '';
}

function cellText(value: unknown): string {
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
  }
  return '';
}
