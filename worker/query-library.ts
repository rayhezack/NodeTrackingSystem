import type {
  GetOfficialEventsParams,
  GetOfficialEventsResponse,
  GetOfficialParamsResponse,
  OfficialEvent,
  OfficialParam,
  TrackingSource,
} from '../shared/api.interface';
import {
  getBitableRecord,
  searchBitableRecordPage,
  type BitableInstanceKey,
  type BitableRecord,
} from './feishu-bitable';
import type { FeishuCredentials } from './feishu-token';

type FetchLike = typeof fetch;

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

const APP_PARAM_BASE_LINK = 'https://bcn0tgplxp2e.feishu.cn/base/Kgy0b4bvmaJSK8sjQDscUrNJnOf?table=tblEYv9lGZeenbT2';
const WEB_PARAM_BASE_LINK = 'https://bcn0tgplxp2e.feishu.cn/base/EX4RbTvp9agYNws6PIHcKD20nqf?table=tblNAMKr5S38iXJQ';
const EXCLUDED_EVENT_STATUSES = new Set(['已废弃', '待治理']);

export async function getOfficialEvents(
  credentials: FeishuCredentials,
  params: GetOfficialEventsParams,
  fetchImpl: FetchLike = fetch,
): Promise<GetOfficialEventsResponse> {
  const source = normalizeSource(params.source);
  const pageSize = Math.min(Math.max(Math.trunc(Number(params.pageSize) || 50), 1), 100);
  const offset = Math.max(Math.trunc(Number(params.pageToken) || 0), 0);
  const keyword = (params.keyword || '').trim().toLocaleLowerCase();
  const records = await searchAllRecords(credentials, queryLibraryKey(source), OFFICIAL_FIELDS, fetchImpl);
  const matchingParams = keyword
    ? await searchAllRecords(credentials, officialParamDetailKey(source), officialParamFields(source), fetchImpl)
    : [];
  const matchingEventIds = new Set<string>();
  const matchingRecordIds = new Set<string>();
  for (const param of matchingParams) {
    if (cellText(param.record['参数状态']) === '已废弃') continue;
    const searchable = [
      param.record['参数主键'], param.record['参数名'], param.record['数据类型'],
      param.record['条件说明'], param.record['枚举/取值范围'],
      param.record['参数定义'], param.record['备注'], param.record['来源表'],
    ].map(cellText).join(' ').toLocaleLowerCase();
    if (!searchable.includes(keyword)) continue;
    const evtId = cellText(param.record.evt_id);
    if (evtId) matchingEventIds.add(evtId);
    cellIds(param.record['关联事件']).forEach((id) => matchingRecordIds.add(id));
  }
  const filtered = records
    .map((record) => toOfficialEvent(record, source))
    .filter((event) => {
      if (!event.evtId || EXCLUDED_EVENT_STATUSES.has(event.status)) return false;
      return !keyword || [event.evtId, event.eventName, event.eventDefinition, event.triggerTiming, event.metricScenario]
        .join(' ').toLocaleLowerCase().includes(keyword)
        || matchingEventIds.has(event.evtId)
        || matchingRecordIds.has(event.recordId.slice(source.length + 1));
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

export async function getOfficialParams(
  credentials: FeishuCredentials,
  recordId: string,
  fetchImpl: FetchLike = fetch,
): Promise<GetOfficialParamsResponse> {
  const ref = parseScopedRecordId(recordId);
  const record = await getBitableRecord(credentials, queryLibraryKey(ref.source), ref.rawId, fetchImpl);
  if (!record) throw new Error('正式事件不存在');

  const evtId = cellText(record.record.evt_id);
  const baseLink = cellText(record.record['参数明细入口']) || paramBaseLink(ref.source);
  const records = await searchAllRecords(
    credentials,
    officialParamDetailKey(ref.source),
    officialParamFields(ref.source),
    fetchImpl,
  );
  const items = records
    .filter((item) => isOfficialParamForEvent(item, ref.rawId, evtId))
    .map((item) => toOfficialParam(item, ref.source))
    .filter((item) => item.paramKey || item.paramName)
    .filter((item) => item.status !== '已废弃')
    .sort((left, right) => left.paramKey.localeCompare(right.paramKey));
  return { items, total: items.length, baseLink };
}

async function searchAllRecords(
  credentials: FeishuCredentials,
  instance: BitableInstanceKey,
  fieldNames: readonly string[],
  fetchImpl: FetchLike,
): Promise<BitableRecord[]> {
  const records: BitableRecord[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await searchBitableRecordPage(credentials, instance, {
      fieldNames,
      pageSize: 500,
      pageToken,
    }, fetchImpl);
    records.push(...result.records);
    if (!result.hasMore || !result.pageToken) return records;
    pageToken = result.pageToken;
  }
  throw new Error('Feishu bitable pagination exceeded 20 pages');
}

function toOfficialEvent(record: BitableRecord, source: TrackingSource): OfficialEvent {
  return {
    recordId: `${source}:${record.id}`,
    source,
    evtId: cellText(record.record.evt_id),
    eventName: cellText(record.record['事件中文名']) || '未命名事件',
    platform: cellText(record.record['端']) || '-',
    version: firstText(record.record['上线版本'], record.record['版本']) || '-',
    status: firstText(record.record['状态'], record.record['正式状态'], record.record['生命周期状态'], record.record['流程阶段']) || '-',
    paramLink: cellText(record.record['参数明细入口']) || paramBaseLink(source),
    eventDefinition: cellText(record.record['事件定义']),
    triggerTiming: cellText(record.record['触发时机']),
    metricScenario: cellText(record.record['指标/使用场景']),
  };
}

function toOfficialParam(record: BitableRecord, source: TrackingSource): OfficialParam {
  const requiredRule = cellText(record.record['必传规则']);
  const evtId = cellText(record.record.evt_id);
  const paramName = cellText(record.record['参数名']);
  const notes = cellText(record.record['备注']);
  return {
    paramKey: cellText(record.record['参数主键']) || (evtId && paramName ? `${evtId}.${paramName}` : ''),
    paramName,
    paramType: cellText(record.record['数据类型']) || '-',
    required: requiredRule === '必传' || requiredRule === '条件必传',
    requiredRule: requiredRule || '非必传',
    triggerCondition: cellText(record.record['条件说明']),
    enumRange: cellText(record.record['枚举/取值范围']),
    definition: cellText(record.record['参数定义']),
    example: /^默认值\/示例[:：]\s*/.test(notes) ? notes.replace(/^默认值\/示例[:：]\s*/, '') : '',
    notes,
    version: cellText(record.record['版本']),
    sourceTable: cellText(record.record['来源表']),
    platform: normalizeParamApplicability(cellText(record.record[source === 'web' ? 'Web适用性' : 'App适用性']), source),
    status: cellText(record.record['参数状态']),
  };
}

function dedupeOfficialEvents(items: OfficialEvent[]): OfficialEvent[] {
  const deduped = new Map<string, OfficialEvent>();
  for (const item of items) {
    const key = item.evtId.trim().toLocaleLowerCase();
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, item);
      continue;
    }
    deduped.set(key, {
      ...existing,
      eventName: existing.eventName !== '未命名事件' ? existing.eventName : item.eventName,
      platform: mergeTextList(existing.platform, item.platform),
      version: firstDisplayText(existing.version, item.version),
      status: firstDisplayText(existing.status, item.status),
      paramLink: firstDisplayText(existing.paramLink, item.paramLink),
    });
  }
  return [...deduped.values()];
}

function isOfficialParamForEvent(record: BitableRecord, recordId: string, evtId: string): boolean {
  if (cellIds(record.record['关联事件']).includes(recordId)) return true;
  return Boolean(evtId) && cellText(record.record.evt_id) === evtId;
}

function cellIds(value: unknown): string[] {
  return (Array.isArray(value) ? value : value ? [value] : []).map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).id === 'string') {
      return String((item as Record<string, unknown>).id);
    }
    return '';
  }).filter(Boolean);
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value);
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join('、');
  if (typeof value === 'object') {
    const item = value as Record<string, unknown>;
    for (const key of ['name', 'link', 'url', 'text', 'id']) {
      if (typeof item[key] === 'string') return item[key] as string;
    }
  }
  return '';
}

function firstText(...values: unknown[]): string {
  return values.map(cellText).find(Boolean) || '';
}

function mergeTextList(left: string, right: string): string {
  const values = [...left.split(/[、,，]/), ...right.split(/[、,，]/)].map((item) => item.trim()).filter((item) => item && item !== '-');
  return [...new Set(values)].join('、') || '-';
}

function firstDisplayText(...values: string[]): string {
  return values.find((value) => value && value !== '-') || '-';
}

function normalizeParamApplicability(value: string, source: TrackingSource): string {
  const raw = value.trim();
  if (source === 'web') return ({ Web: 'Web通用', '仅Web': 'Web通用' } as Record<string, string>)[raw] || raw || '-';
  return ({ App: 'App通用', '仅App': 'App通用', iOS: '仅iOS', Android: '仅Android', 'iOS、Android': 'App通用', 'iOS,Android': 'App通用', 'iOS, Android': 'App通用' } as Record<string, string>)[raw] || raw || '-';
}

function officialParamFields(source: TrackingSource): readonly string[] {
  return [...OFFICIAL_PARAM_BASE_FIELDS.slice(0, 13), source === 'web' ? 'Web适用性' : 'App适用性', ...OFFICIAL_PARAM_BASE_FIELDS.slice(13)];
}

function normalizeSource(source?: string): TrackingSource {
  return source === 'web' ? 'web' : 'app';
}

function queryLibraryKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webQueryLibrary' : 'queryLibrary';
}

function officialParamDetailKey(source: TrackingSource): BitableInstanceKey {
  return source === 'web' ? 'webOfficialParamDetail' : 'officialParamDetail';
}

function paramBaseLink(source: TrackingSource): string {
  return source === 'web' ? WEB_PARAM_BASE_LINK : APP_PARAM_BASE_LINK;
}

function parseScopedRecordId(recordId: string): { source: TrackingSource; rawId: string } {
  if (recordId.startsWith('web:')) return { source: 'web', rawId: recordId.slice(4) };
  if (recordId.startsWith('app:')) return { source: 'app', rawId: recordId.slice(4) };
  return { source: 'app', rawId: recordId };
}
