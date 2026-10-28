import { reserveBaseCreates, confirmBaseCreates } from './base-write-identity';
import { getFeishuTenantToken, resetFeishuTokenCache, type FeishuCredentials } from './feishu-token';

export const BITABLE_INSTANCES = {
  workbench: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblqHhr5aZwr4QOZ' },
  paramDetail: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblesT69TDCUKzhs' },
  queryLibrary: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblAhScEFQYAJC2g' },
  officialParamDetail: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblEYv9lGZeenbT2' },
  enumDictionary: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblQ8Ph3N8GJHeVA' },
  commonProperties: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblIdlancSXgX9VX' },
  deprecatedEvent: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblBioKXiaou302p' },
  deprecatedParamDetail: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tbl3HA2sLaHuxRD1' },
  webWorkbench: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tblsFFvYkTPkabFT' },
  webParamDetail: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tblMaw89yVi68YY6' },
  webQueryLibrary: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tbly7VI4kwFz5qwR' },
  webOfficialParamDetail: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tblNAMKr5S38iXJQ' },
  webEnumDictionary: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tbl2KEj2zyg8bOmk' },
  webCommonProperties: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tblb783YDTiBNts0' },
  webDeprecatedEvent: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tblqwh7naUc3WxNz' },
  webDeprecatedParamDetail: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tblKjUGEx3mxICcY' },
} as const;

export type BitableInstanceKey = keyof typeof BITABLE_INSTANCES;

type FetchLike = typeof fetch;

export interface BitableRecord {
  id: string;
  record: Record<string, unknown>;
}

export interface BitableRecordPage {
  records: BitableRecord[];
  hasMore: boolean;
  pageToken?: string;
  total?: number;
}

export async function searchBitableRecords(
  env: FeishuCredentials,
  instance: string,
  options: { pageSize?: number; pageToken?: string } = {},
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const config = BITABLE_INSTANCES[instance as BitableInstanceKey];
  if (!config) throw new Error(`Unknown bitable instance: ${instance}`);

  const token = await getFeishuTenantToken(env, fetchImpl);
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize || 100), 1), 500);
  const query = new URLSearchParams({ user_id_type: 'user_id', page_size: String(pageSize) });
  if (options.pageToken) query.set('page_token', options.pageToken);
  const response = await fetchImpl(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/search?${query}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  );
  const payload = await response.json() as { code?: number; msg?: string; data?: unknown };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Feishu bitable search failed: ${response.status} ${payload.msg || 'unknown error'}`);
  }
  return payload.data ?? {};
}

export async function searchBitableRecordPage(
  env: FeishuCredentials,
  instance: BitableInstanceKey,
  options: { pageSize?: number; pageToken?: string; fieldNames?: readonly string[]; viewId?: string; filter?: { conjunction: 'and' | 'or'; conditions: Array<{ field_name: string; operator: string; value: string[] }> } } = {},
  fetchImpl: FetchLike = fetch,
): Promise<BitableRecordPage> {
  const config = BITABLE_INSTANCES[instance];
  const token = await getFeishuTenantToken(env, fetchImpl);
  const query = new URLSearchParams({
    user_id_type: 'user_id',
    page_size: String(Math.min(Math.max(Math.trunc(options.pageSize || 500), 1), 500)),
  });
  if (options.pageToken) query.set('page_token', options.pageToken);
  const body = {
    ...(options.fieldNames?.length ? { field_names: [...options.fieldNames] } : {}),
    ...(options.viewId ? { view_id: options.viewId } : {}),
    ...(options.filter ? { filter: options.filter } : {}),
  };
  const response = await fetchImpl(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/search?${query}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const payload = await response.json() as {
    code?: number;
    msg?: string;
    data?: {
      items?: Array<{ record_id?: string; fields?: Record<string, unknown> }>;
      has_more?: boolean;
      page_token?: string;
      total?: number;
    };
  };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Feishu bitable search failed: ${response.status} ${payload.msg || 'unknown error'}`);
  }
  const data = payload.data || {};
  return {
    records: (data.items || []).map((item) => ({ id: item.record_id || '', record: item.fields || {} })).filter((item) => item.id),
    hasMore: Boolean(data.has_more),
    pageToken: data.page_token,
    total: data.total,
  };
}

export async function getBitableRecord(
  env: FeishuCredentials,
  instance: BitableInstanceKey,
  recordId: string,
  fetchImpl: FetchLike = fetch,
): Promise<BitableRecord | null> {
  const config = BITABLE_INSTANCES[instance];
  const token = await getFeishuTenantToken(env, fetchImpl);
  const response = await fetchImpl(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/${encodeURIComponent(recordId)}?user_id_type=user_id`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (response.status === 404) return null;
  const payload = await response.json() as {
    code?: number;
    msg?: string;
    data?: { record?: { record_id?: string; fields?: Record<string, unknown> } };
  };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Feishu bitable get record failed: ${response.status} ${payload.msg || 'unknown error'}`);
  }
  const record = payload.data?.record;
  return record ? { id: record.record_id || recordId, record: record.fields || {} } : null;
}

export async function createBitableRecords(
  env: FeishuCredentials,
  instance: BitableInstanceKey,
  records: Array<Record<string, unknown>>,
  fetchImpl: FetchLike = fetch,
): Promise<BitableRecord[]> {
  if (!records.length) return [];
  if (records.length > 500) throw new Error('Feishu bitable batch create supports at most 500 records');
  const config = BITABLE_INSTANCES[instance];
  const token = await getFeishuTenantToken(env, fetchImpl);
  const reservations = await reserveBaseCreates(env.DB, instance, records);
  const response = await fetchImpl(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/batch_create?user_id_type=user_id`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: records.map((fields) => ({ fields: normalizeWorkerFields(fields) })) }),
    },
  );
  const payload = await response.json() as {
    code?: number;
    msg?: string;
    data?: { records?: Array<{ record_id?: string; fields?: Record<string, unknown> }> };
  };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Feishu bitable create failed: ${response.status} ${payload.msg || 'unknown error'}`);
  }
  const returned = payload.data?.records || [];
  if (returned.length !== records.length || returned.some((record) => !record.record_id)) throw new Error('Feishu Base 批量写入返回数量或记录 ID 不完整，已停止归档');
  if (new Set(returned.map((record) => record.record_id)).size !== returned.length) throw new Error('Feishu Base 新增返回重复记录 ID');
  await confirmBaseCreates(env.DB, instance, reservations, returned.map((record) => record.record_id!));
  return returned.map((record) => ({
    id: record.record_id || '',
    record: record.fields || {},
  })).filter((record) => record.id);
}

export async function updateBitableRecords(
  env: FeishuCredentials,
  instance: BitableInstanceKey,
  records: Array<{ id: string; record: Record<string, unknown> }>,
  fetchImpl: FetchLike = fetch,
): Promise<BitableRecord[]> {
  if (!records.length) return [];
  if (records.length > 500) throw new Error('Feishu bitable batch update supports at most 500 records');
  const config = BITABLE_INSTANCES[instance];
  const token = await getFeishuTenantToken(env, fetchImpl);
  const response = await fetchImpl(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/batch_update?user_id_type=user_id`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: records.map(({ id, record }) => ({ record_id: id, fields: normalizeWorkerFields(record) })) }),
    },
  );
  const payload = await response.json() as {
    code?: number;
    msg?: string;
    data?: { records?: Array<{ record_id?: string; fields?: Record<string, unknown> }> };
  };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Feishu bitable update failed: ${response.status} ${payload.msg || 'unknown error'}`);
  }
  const returned = payload.data?.records || [];
  if (returned.length !== records.length || returned.some((record) => !record.record_id)) throw new Error('Feishu Base 批量写入返回数量或记录 ID 不完整，已停止归档');
  const expectedIds = new Set(records.map((record) => record.id));
  if (returned.some((record) => !expectedIds.has(record.record_id!)) || new Set(returned.map((record) => record.record_id)).size !== returned.length) throw new Error('Feishu Base 更新返回记录 ID 不匹配');
  return returned.map((record) => ({
    id: record.record_id || '',
    record: record.fields || {},
  })).filter((record) => record.id);
}

export async function deleteBitableRecords(
  env: FeishuCredentials,
  instance: BitableInstanceKey,
  recordIds: string[],
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const ids = [...new Set(recordIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return;
  if (ids.length > 500) throw new Error('Feishu bitable batch delete supports at most 500 records');
  const config = BITABLE_INSTANCES[instance];
  const token = await getFeishuTenantToken(env, fetchImpl);
  const response = await fetchImpl(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/batch_delete`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: ids }),
    },
  );
  const payload = await response.json() as { code?: number; msg?: string };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Feishu bitable delete failed: ${response.status} ${payload.msg || 'unknown error'}`);
  }
}

export { resetFeishuTokenCache };

const URL_FIELDS = new Set(['需求链接', 'UI图对应网页链接', '参数明细入口']);

function normalizeWorkerFields(fields: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...fields };
  for (const field of URL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(normalized, field)) {
      normalized[field] = normalizeWorkerUrlCell(normalized[field]);
    }
  }
  if (Object.prototype.hasOwnProperty.call(normalized, 'UI图')) {
    normalized['UI图'] = normalizeWorkerAttachmentCell(normalized['UI图']);
  }
  return normalized;
}

function normalizeWorkerAttachmentCell(value: unknown): Array<{ file_token: string }> {
  const values = Array.isArray(value) ? value : value == null || value === '' ? [] : [value];
  return values.map((item) => {
    const token = typeof item === 'string'
      ? item.trim()
      : item && typeof item === 'object'
        ? String((item as Record<string, unknown>).file_token || (item as Record<string, unknown>).fileToken || (item as Record<string, unknown>).token || '').trim()
        : '';
    if (!token) throw new Error('Feishu Base Attachment field UI图 requires file_token; please re-upload the image');
    return { file_token: token };
  });
}

function normalizeWorkerUrlCell(value: unknown): { link: string; text: string } | null | undefined {
  if (value == null || value === '') return value == null ? value : null;
  const candidate = Array.isArray(value) ? value.find((item) => item != null && item !== '') : value;
  if (candidate == null || candidate === '') return null;
  if (typeof candidate === 'object') {
    const objectValue = candidate as Record<string, unknown>;
    const link = String(objectValue.link || objectValue.Link || objectValue.url || objectValue.href || '').trim();
    if (!link) return null;
    assertWorkerHttpUrl(link);
    return { link, text: String(objectValue.text || objectValue.name || link).trim() || link };
  }
  const link = String(candidate).trim();
  if (link) assertWorkerHttpUrl(link);
  return link ? { link, text: link } : null;
}

function assertWorkerHttpUrl(value: string): void {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return;
  } catch {
    // Normalize all invalid URL input to one actionable error below.
  }
  throw new Error(`Feishu Base URL field requires an http(s) URL: ${value}`);
}
