import { webcrypto } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withBaseWriteGuard, isBaseMutation } from '../../worker/base-write-guard';
import { reserveBaseCreates, confirmBaseCreates } from '../../worker/base-write-identity';
import type { D1Database } from '../../worker/ai-tracking';

Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const { DatabaseSync } = require('node:sqlite');
function database(path: string): D1Database {
  const sqlite = new DatabaseSync(path);
  return { prepare(query: string) {
    let parameters: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { parameters = values; return statement; },
      async run() { return sqlite.prepare(query).run(...parameters); },
      async first<T>() { return (sqlite.prepare(query).get(...parameters) || null) as T | null; },
      async all<T>() { return { results: sqlite.prepare(query).all(...parameters) as T[] }; },
    };
    return statement;
  } };
}
describe('persistent Base writer coordination using real SQLite constraints', () => {
  let folder: string;
  let db: D1Database;
  beforeEach(() => { folder = mkdtempSync(join(tmpdir(), 'tracking-guard-')); db = database(join(folder, 'test.sqlite')); });
  afterEach(() => rmSync(folder, { recursive: true, force: true }));
  it('serializes independent database clients instead of relying on a Worker local mutex', async () => {
    const other = database(join(folder, 'test.sqlite'));
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const first = withBaseWriteGuard(db, '/api/tracking/records/a', async () => { entered(); await new Promise<void>((resolve) => { release = resolve; }); return new Response('{}'); });
    await ready;
    const blocked = jest.fn(async () => new Response('{}'));
    expect((await withBaseWriteGuard(other, '/api/tracking/params/b', blocked)).status).toBe(409);
    expect(blocked).not.toHaveBeenCalled();
    release(); await first;
    expect((await withBaseWriteGuard(other, '/api/tracking/params/b', blocked)).status).toBe(200);
  });
  it('retains an uncertain write lock until an operator reconciles it, without unsafe lease takeover', async () => {
    await withBaseWriteGuard(db, '/archive', async (state) => { state.uncertain = 1; return new Response('{}', { status: 502 }); });
    const blocked = jest.fn(async () => new Response('{}'));
    const response = await withBaseWriteGuard(db, '/archive', blocked);
    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain('异常待核对');
    expect(blocked).not.toHaveBeenCalled();
    const row = await db.prepare('SELECT status FROM tracking_base_writes').first<{ status: string }>();
    expect(row?.status).toBe('needs_reconciliation');
  });
  it('fails closed without the database, while allowing ordinary validation failures to release the lock', async () => {
    const write = jest.fn(async () => new Response('{}'));
    expect((await withBaseWriteGuard(undefined, '/archive', write)).status).toBe(503);
    expect(write).not.toHaveBeenCalled();
    await withBaseWriteGuard(db, '/archive', async () => new Response('{}', { status: 422 }));
    expect((await withBaseWriteGuard(db, '/archive', write)).status).toBe(200);
  });
  it('releases the writer after a failed read without hiding a genuinely uncertain write', async () => {
    const { trackBaseMutation } = await import('../../worker/base-write-state');
    await withBaseWriteGuard(db, '/read-before-save', async () => new Response('{}', { status: 502 }));
    const next = jest.fn(async () => new Response('{}'));
    expect((await withBaseWriteGuard(db, '/next', next)).status).toBe(200);
    await withBaseWriteGuard(db, '/uncertain-write', async (state) => {
      try { await trackBaseMutation({ BASE_WRITE_STATE: state }, async () => { throw new Error('network lost'); }); } catch { /* Return the API failure after preserving mutation evidence. */ }
      return new Response('{}', { status: 502 });
    });
    expect((await withBaseWriteGuard(db, '/blocked', next)).status).toBe(409);
  });
  it('does not keep a global lock after a missing-event validation response', async () => {
    const rejected = await withBaseWriteGuard(db, '/api/tracking/records/blank', async () => new Response(JSON.stringify({ message: '归档事件缺少 evt_id 或事件名' }), { status: 422 }));
    expect(rejected.status).toBe(422);
    const next = jest.fn(async () => new Response('{}'));
    expect((await withBaseWriteGuard(db, '/api/tracking/records/blank/reuse-official-event', next)).status).toBe(200);
    expect(next).toHaveBeenCalledTimes(1);
  });
  it('records unique create claims permanently so an eventually consistent Base read cannot cause duplicate inserts', async () => {
    const values = [{ evt_id: 'test_event', 参数名: 'mode', 枚举值: 'Agent' }];
    const claims = await reserveBaseCreates(db, 'webEnumDictionary', values);
    await expect(reserveBaseCreates(db, 'webEnumDictionary', values)).rejects.toThrow('未确认');
    await confirmBaseCreates(db, 'webEnumDictionary', claims, ['enum-1']);
    await expect(reserveBaseCreates(db, 'webEnumDictionary', values)).rejects.toThrow('已记录');
    await expect(reserveBaseCreates(db, 'webEnumDictionary', [{ ...values[0], 枚举值: 'agent' }])).resolves.toHaveLength(1);
  });
  it('handles a full 500-enum batch within D1 binding limits and rejects duplicates before writing', async () => {
    const bounded: D1Database = { prepare(query: string) {
      const statement = db.prepare(query);
      return { ...statement, bind(...values: unknown[]) {
        expect(values.length).toBeLessThanOrEqual(100);
        return statement.bind(...values);
      } };
    } };
    const values = Array.from({ length: 500 }, (_, index) => ({ evt_id: 'event', 参数名: 'mode', 枚举值: `value_${index}` }));
    const claims = await reserveBaseCreates(bounded, 'webEnumDictionary', values);
    await confirmBaseCreates(bounded, 'webEnumDictionary', claims, values.map((_, index) => `record_${index}`));
    const row = await db.prepare('SELECT COUNT(*) AS count FROM tracking_base_keys WHERE record_id IS NOT NULL').first<{ count: number }>();
    expect(row?.count).toBe(500);
    await expect(reserveBaseCreates(db, 'webEnumDictionary', [values[0], values[0]])).rejects.toThrow('重复唯一键');
  });
  it('covers parameter edits and AI apply, but does not block read endpoints or long AI generation', () => {
    expect(isBaseMutation('PATCH', '/api/tracking/records/web:a')).toBe(true);
    expect(isBaseMutation('POST', '/api/tracking/ai/records/web:a/drafts/d/apply')).toBe(true);
    expect(isBaseMutation('POST', '/api/tracking/ai/records/web:a/drafts')).toBe(false);
    expect(isBaseMutation('GET', '/api/tracking/records')).toBe(false);
  });
});
