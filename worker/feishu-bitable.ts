import { getFeishuTenantToken, resetFeishuTokenCache, type FeishuCredentials } from './feishu-token';

export const BITABLE_INSTANCES = {
  workbench: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblqHhr5aZwr4QOZ' },
  paramDetail: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblesT69TDCUKzhs' },
  queryLibrary: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblAhScEFQYAJC2g' },
  officialParamDetail: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblEYv9lGZeenbT2' },
  enumDictionary: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblQ8Ph3N8GJHeVA' },
  deprecatedEvent: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tblBioKXiaou302p' },
  deprecatedParamDetail: { appToken: 'Kgy0b4bvmaJSK8sjQDscUrNJnOf', tableId: 'tbl3HA2sLaHuxRD1' },
  webWorkbench: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tblsFFvYkTPkabFT' },
  webParamDetail: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tblMaw89yVi68YY6' },
  webQueryLibrary: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tbly7VI4kwFz5qwR' },
  webOfficialParamDetail: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tblNAMKr5S38iXJQ' },
  webEnumDictionary: { appToken: 'EX4RbTvp9agYNws6PIHcKD20nqf', tableId: 'tbl2KEj2zyg8bOmk' },
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
  options: { pageSize?: number; pageToken?: string; fieldNames?: readonly string[]; viewId?: string } = {},
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
  const response = await fetchImpl(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/batch_create?user_id_type=user_id`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: records.map((fields) => ({ fields })) }),
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
  return (payload.data?.records || []).map((record) => ({
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
      body: JSON.stringify({ records: records.map(({ id, record }) => ({ record_id: id, fields: record })) }),
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
  return (payload.data?.records || []).map((record) => ({
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
