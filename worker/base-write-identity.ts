import type { D1Database } from './ai-tracking';
import { TrackingEnumError } from '../shared/tracking-enums';

const protectedTables = new Set(['queryLibrary', 'webQueryLibrary', 'officialParamDetail', 'webOfficialParamDetail', 'enumDictionary', 'webEnumDictionary']);
type Claim = { key: string; owner: string };
export async function reserveBaseCreates(db: D1Database | undefined, instance: string, fields: Array<Record<string, unknown>>): Promise<Claim[]> {
  if (!db || !protectedTables.has(instance)) return [];
  await db.prepare('CREATE TABLE IF NOT EXISTS tracking_base_keys (instance TEXT NOT NULL, identity TEXT NOT NULL, owner TEXT NOT NULL, record_id TEXT, created_at INTEGER NOT NULL, PRIMARY KEY(instance, identity))').run();
  const reservations = fields.map((record) => {
    const keys = instance.endsWith('QueryLibrary') || instance === 'queryLibrary'
      ? ['evt_id'] : instance.endsWith('ParamDetail') || instance === 'officialParamDetail'
        ? ['evt_id', '参数名'] : ['evt_id', '参数名', '枚举值'];
    const values = keys.map((name) => String(record[name] || '').trim());
    if (values.some((value) => !value)) throw new TrackingEnumError('正式库新增缺少唯一标识，已停止写入');
    return { key: JSON.stringify(values), owner: crypto.randomUUID() };
  });
  if (new Set(reservations.map((claim) => claim.key)).size !== reservations.length) throw new TrackingEnumError('同一新增批次包含重复唯一键，已停止写入');
  for (let offset = 0; offset < reservations.length; offset += 80) {
    const keys = reservations.slice(offset, offset + 80).map((claim) => claim.key);
    const result = await db.prepare(`SELECT identity, record_id FROM tracking_base_keys WHERE instance = ? AND identity IN (${keys.map(() => '?').join(',')})`).bind(instance, ...keys).all<{ identity: string; record_id?: string }>();
    const previous = result.results?.[0];
    if (previous?.record_id) throw new TrackingEnumError(`Base 已记录此唯一键，查询可能尚未同步，请重新读取后重试：${previous.identity}`);
    if (previous) throw new Error(`此唯一键有未确认的写入，请核查 Base 与写入记录后恢复：${previous.identity}`);
  }
  // Keep each statement below D1's 100-bound-parameter limit; no per-enum HTTP/SQL round trips.
  try {
    for (let offset = 0; offset < reservations.length; offset += 20) {
      const batch = reservations.slice(offset, offset + 20);
      await db.prepare(`INSERT INTO tracking_base_keys(instance, identity, owner, created_at) VALUES ${batch.map(() => '(?, ?, ?, ?)').join(',')}`)
        .bind(...batch.flatMap((claim) => [instance, claim.key, claim.owner, Date.now()])).run();
    }
  } catch (cause) {
    // No external writes have started: only our own unconfirmed reservations may be rolled back.
    for (const claim of reservations) await db.prepare('DELETE FROM tracking_base_keys WHERE instance = ? AND identity = ? AND owner = ? AND record_id IS NULL').bind(instance, claim.key, claim.owner).run();
    throw cause;
  }
  return reservations;
}
export async function confirmBaseCreates(db: D1Database | undefined, instance: string, reservations: Claim[], ids: string[]): Promise<void> {
  for (let offset = 0; offset < reservations.length; offset += 20) {
    const batch = reservations.slice(offset, offset + 20);
    await db!.prepare(`INSERT INTO tracking_base_keys(instance, identity, owner, record_id, created_at) VALUES ${batch.map(() => '(?, ?, ?, ?, ?)').join(',')} ON CONFLICT(instance, identity) DO UPDATE SET record_id = excluded.record_id WHERE tracking_base_keys.owner = excluded.owner`)
      .bind(...batch.flatMap((claim, index) => [instance, claim.key, claim.owner, ids[offset + index], Date.now()])).run();
  }
}
