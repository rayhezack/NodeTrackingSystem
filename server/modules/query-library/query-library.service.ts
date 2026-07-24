import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  GetOfficialEventsParams,
  GetOfficialEventsResponse,
  GetOfficialParamsResponse,
  OfficialEvent,
  OfficialParam,
  TrackingSource,
} from '@shared/api.interface';
import { BitableRecord, BitableService } from '../bitable/bitable.service';
import type { BitableInstanceKey } from '../bitable/bitable.constants';

const APP_OFFICIAL_FIELDS = [
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

const WEB_OFFICIAL_FIELDS = [
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

const PARAM_BASE_FIELDS = [
  '设计参数主键',
  'evt_id',
  '参数名',
  '数据类型',
  '必传规则',
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
  ...PARAM_BASE_FIELDS.slice(0, 8),
  'App适用性',
  ...PARAM_BASE_FIELDS.slice(8),
] as const;

const WEB_PARAM_FIELDS = [
  ...PARAM_BASE_FIELDS.slice(0, 8),
  'Web适用性',
  ...PARAM_BASE_FIELDS.slice(8),
] as const;

const APP_PARAM_BASE_LINK =
  'https://bcn0tgplxp2e.feishu.cn/base/Kgy0b4bvmaJSK8sjQDscUrNJnOf?table=tblesT69TDCUKzhs';
const WEB_PARAM_BASE_LINK =
  'https://bcn0tgplxp2e.feishu.cn/base/EX4RbTvp9agYNws6PIHcKD20nqf?table=tblMaw89yVi68YY6';

@Injectable()
export class QueryLibraryService {
  constructor(private readonly bitable: BitableService) {}

  async getEvents(params: GetOfficialEventsParams): Promise<GetOfficialEventsResponse> {
    const source = normalizeSource(params.source);
    const pageSize = Number(params.pageSize || 50);
    const offset = Number(params.pageToken || 0);
    const keyword = (params.keyword || '').trim().toLowerCase();
    const result = await this.bitable.searchRecords(queryLibraryKey(source), {
      fieldNames: [...officialFields(source)],
      pageSize: 200,
    });
    const filtered = result.records
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
    const result = await this.bitable.searchRecords(paramDetailKey(ref.source), {
      fieldNames: [...paramFields(ref.source)],
      pageSize: 200,
    });
    const params = result.records
      .filter((paramRecord) => cellText(paramRecord.record['evt_id']) === evtId)
      .map((paramRecord) => this.toOfficialParam(paramRecord, ref.source))
      .filter((param) => param.paramKey || param.paramName)
      .sort((a, b) => a.paramKey.localeCompare(b.paramKey));

    return { items: params, total: params.length, baseLink };
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
      status:
        firstText(
          record.record['状态'],
          record.record['正式状态'],
          record.record['生命周期状态'],
          record.record['流程阶段'],
        ) || '-',
    };
  }

  private toOfficialParam(record: BitableRecord, source: TrackingSource): OfficialParam {
    const requiredRule = cellText(record.record['必传规则']);
    const evtId = cellText(record.record['evt_id']);
    const paramName = cellText(record.record['参数名']);
    return {
      paramKey: buildParamKey(evtId, paramName) || cellText(record.record['设计参数主键']),
      paramName,
      paramType: cellText(record.record['数据类型']) || '-',
      required: requiredRule === '必传' || requiredRule === '条件必传',
      enumRange: cellText(record.record['枚举/取值范围']),
      definition: cellText(record.record['参数定义']),
      example: cellText(record.record['默认值/示例']),
      platform: normalizeParamApplicability(
        cellText(record.record[source === 'web' ? 'Web适用性' : 'App适用性']),
        source,
      ),
      status: cellText(record.record['参数状态']),
    };
  }
}

function normalizeSource(value?: string): TrackingSource {
  return value === 'web' ? 'web' : 'app';
}

function queryLibraryKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webQueryLibrary' : 'queryLibrary';
}

function paramDetailKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webParamDetail' : 'paramDetail';
}

function officialFields(source: TrackingSource): readonly string[] {
  return source === 'web' ? WEB_OFFICIAL_FIELDS : APP_OFFICIAL_FIELDS;
}

function paramFields(source: TrackingSource): readonly string[] {
  return source === 'web' ? WEB_PARAM_FIELDS : APP_PARAM_FIELDS;
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
  const values = [...left.split(/[、,，]/), ...right.split(/[、,，]/)]
    .map((item) => item.trim())
    .filter((item) => item && item !== '-');
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

function normalizeParamApplicability(value: string, source: TrackingSource): string {
  const raw = String(value || '').trim();
  if (source === 'web') {
    const alias: Record<string, string> = { Web: '仅Web' };
    return alias[raw] || raw || '-';
  }
  const alias: Record<string, string> = {
    iOS: '仅iOS',
    Android: '仅Android',
    'iOS,Android': 'iOS、Android',
    'iOS, Android': 'iOS、Android',
    App通用: 'iOS、Android',
    仅App: 'iOS、Android',
  };
  return alias[raw] || raw || '-';
}

function encodeScopedRecordId(source: TrackingSource, rawId: string): string {
  return `${source}:${rawId}`;
}

function parseScopedRecordId(recordId: string): { source: TrackingSource; rawId: string } {
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
    return value.map((item) => cellText(item)).filter(Boolean).join('、');
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
