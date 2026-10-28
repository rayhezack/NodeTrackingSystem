import type { D1Database } from './ai-tracking';

const protectedTables = new Set(['queryLibrary', 'webQueryLibrary', 'officialParamDetail', 'webOfficialParamDetail', 'enumDictionary', 'webEnumDictionary']);
export async function reserveBaseCreates(db: D1Database | undefined, instance: string, fields: Array<Record<string, unknown>>): Promise<Array<{ key: string; owner: string }>> {
  if (!db || !protectedTables.has(instance)) return [];
  await db.prepare('CREATE TABLE IF NOT EXISTS tracking_base_keys (instance TEXT NOT NULL, identity TEXT NOT NULL, owner TEXT NOT NULL, record_id TEXT, created_at INTEGER NOT NULL, PRIMARY KEY(instance, identity))').run();
  const reservations: Array<{ key: string; owner: string }> = [];
  for (const record of fields) {
    const keys = instance.endsWith('QueryLibrary') || instance === 'queryLibrary'
      ? ['evt_id'] : instance.endsWith('ParamDetail') || instance === 'officialParamDetail'
        ? ['evt_id', '参数名'] : ['evt_id', '参数名', '枚举值'];
    const values = keys.map((name) => String(record[name] || '').trim());
    if (values.some((value) => !value)) throw new Error('正式库新增缺少唯一标识，已停止写入');
    const key = JSON.stringify(values);
    const owner = crypto.randomUUID();
    const previous = await db.prepare('SELECT owner, record_id FROM tracking_base_keys WHERE instance = ? AND identity = ?').bind(instance, key).first<{ owner: string; record_id?: string }>();
    if (previous) throw new Error(previous.record_id
      ? `Base 已记录此唯一键，查询可能尚未同步，请重新读取后重试：${key}`
      : `此唯一键有未确认的写入，请核查 Base 与写入记录后恢复：${key}`);
    reservations.push({ key, owner });
  }
  // Claim the whole validated batch before any external write. Never delete an uncertain claim automatically.
  try {
    for (const reservation of reservations) {
      await db.prepare('INSERT INTO tracking_base_keys(instance, identity, owner, created_at) VALUES(?, ?, ?, ?)').bind(instance, reservation.key, reservation.owner, Date.now()).run();
    }
  } catch (cause) {
    for (const claim of reservations) await db.prepare('DELETE FROM tracking_base_keys WHERE instance = ? AND identity = ? AND owner = ? AND record_id IS NULL').bind(instance, claim.key, claim.owner).run();
    throw cause;
  }
  return reservations;
}
export async function confirmBaseCreates(db: D1Database | undefined, instance: string, reservations: Array<{ key: string; owner: string }>, ids: string[]): Promise<void> {
  for (const [index, claim] of reservations.entries()) {
    await db!.prepare('UPDATE tracking_base_keys SET record_id = ? WHERE instance = ? AND identity = ? AND owner = ?').bind(ids[index], instance, claim.key, claim.owner).run();
  }
}
