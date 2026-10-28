import type { BaseWriteState } from './base-write-state';
import type { D1Database } from './ai-tracking';

/** A persistent global writer gate: Base has no atomic unique upsert or compare-and-swap. */
export async function withBaseWriteGuard(db: D1Database | undefined, path: string, operation: (state: BaseWriteState) => Promise<Response>): Promise<Response> {
  if (!db) return error('Base 写入协调数据库不可用，已停止写入', 503);
  const owner = crypto.randomUUID();
  await db.prepare('CREATE TABLE IF NOT EXISTS tracking_base_writes (id TEXT PRIMARY KEY, path TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, status TEXT NOT NULL)').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS tracking_base_writer (id TEXT PRIMARY KEY, owner TEXT NOT NULL, started_at INTEGER NOT NULL)').run();
  await db.prepare('INSERT INTO tracking_base_writer(id, owner, started_at) VALUES(?, ?, ?) ON CONFLICT(id) DO NOTHING').bind('global', owner, Date.now()).run();
  const lock = await db.prepare('SELECT owner FROM tracking_base_writer WHERE id = ?').bind('global').first<{ owner: string }>();
  if (lock?.owner !== owner) {
    const task = lock?.owner ? await db.prepare('SELECT status, finished_at FROM tracking_base_writes WHERE id = ?').bind(lock.owner).first<{ status: string; finished_at: number | null }>() : null;
    if (task?.status === 'needs_reconciliation' || task?.finished_at) {
      return error(`上一次 Base 写入异常待核对，未完成内容已保留。请管理员恢复任务 ${lock?.owner}`, 409);
    }
    return error('另一个 Base 写入任务正在处理，请稍后重试；未完成内容会保留', 409);
  }
  // Do not automatically steal an expired lease: an old HTTP write may still commit at Base.
  let confirmed = false;
  const state: BaseWriteState = { pending: 0, uncertain: 0 };
  try {
    await db.prepare('INSERT INTO tracking_base_writes(id, path, started_at, status) VALUES(?, ?, ?, ?)').bind(owner, path, Date.now(), 'running').run();
    const response = await operation(state);
    const uncertain = state.pending > 0 || state.uncertain > 0;
    await db.prepare('UPDATE tracking_base_writes SET finished_at = ?, status = ? WHERE id = ?').bind(Date.now(), uncertain ? 'needs_reconciliation' : response.ok ? 'succeeded' : response.status < 500 ? 'rejected' : 'failed_without_uncertain_write', owner).run();
    confirmed = !uncertain;
    return uncertain && response.ok ? error(`Base 写入结果待核对，请管理员恢复任务 ${owner}`, 503) : response;
  } catch (cause) {
    confirmed = state.pending === 0 && state.uncertain === 0;
    await db.prepare('UPDATE tracking_base_writes SET finished_at = ?, status = ? WHERE id = ?').bind(Date.now(), state.pending > 0 || state.uncertain > 0 ? 'needs_reconciliation' : 'failed_without_uncertain_write', owner).run();
    throw cause;
  } finally {
    if (confirmed) await db.prepare('DELETE FROM tracking_base_writer WHERE id = ? AND owner = ?').bind('global', owner).run();
  }
}
function error(message: string, status: number): Response {
  return new Response(JSON.stringify({ message }), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
export function isBaseMutation(method: string, path: string): boolean {
  return ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)
    && (/^\/api\/tracking\/(records|params|permissions)(\/|$)/.test(path)
      || /^\/api\/tracking\/ai\/records\/[^/]+\/drafts\/[^/]+\/apply$/.test(path));
}
