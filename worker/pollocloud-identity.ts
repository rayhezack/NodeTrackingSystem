import type { D1Database } from './ai-tracking';
import { resolveDirectoryUserByName } from './feishu-directory';
import type { FeishuCredentials } from './feishu-token';

type FetchLike = typeof fetch;

export interface PlatformIdentity {
  id: string;
  name: string;
}

export interface CanonicalIdentity extends PlatformIdentity {
  platformId: string;
  openId?: string;
  email?: string;
}

type IdentityEnv = FeishuCredentials & { DB?: D1Database };
type StoredIdentity = {
  feishu_user_id?: string;
  name?: string;
  feishu_open_id?: string;
  email?: string;
};

let schemaReady: Promise<void> | null = null;

export async function resolveCanonicalIdentity(
  env: IdentityEnv,
  platformUser: PlatformIdentity,
  fetchImpl: FetchLike = fetch,
): Promise<CanonicalIdentity> {
  const stored = await loadStoredIdentity(env, platformUser.id);
  if (stored?.feishu_user_id) {
    return {
      id: stored.feishu_user_id,
      name: stored.name || platformUser.name,
      platformId: platformUser.id,
      ...(stored.feishu_open_id ? { openId: stored.feishu_open_id } : {}),
      ...(stored.email ? { email: stored.email } : {}),
    };
  }

  const matched = await resolveDirectoryUserByName(env, platformUser.name, fetchImpl);
  const userId = matched?.user_id?.trim();
  if (!matched || !userId) {
    throw new Error(`无法在飞书通讯录中唯一匹配当前用户“${platformUser.name || platformUser.id}”`);
  }

  const identity: CanonicalIdentity = {
    id: userId,
    name: matched.name || platformUser.name,
    platformId: platformUser.id,
    ...(matched.open_id ? { openId: matched.open_id } : {}),
    ...(matched.email ? { email: matched.email } : {}),
  };
  await saveStoredIdentity(env, identity);
  return identity;
}

async function loadStoredIdentity(env: IdentityEnv, platformUserId: string): Promise<StoredIdentity | null> {
  if (!env.DB) return null;
  await ensureSchema(env.DB);
  return env.DB.prepare(
    'SELECT feishu_user_id, name, feishu_open_id, email FROM pollocloud_feishu_identity WHERE platform_user_id = ?',
  ).bind(platformUserId).first<StoredIdentity>();
}

async function saveStoredIdentity(env: IdentityEnv, identity: CanonicalIdentity): Promise<void> {
  if (!env.DB) return;
  await ensureSchema(env.DB);
  await env.DB.prepare(
    'INSERT INTO pollocloud_feishu_identity(platform_user_id, feishu_user_id, name, feishu_open_id, email, updated_at) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(platform_user_id) DO UPDATE SET feishu_user_id = excluded.feishu_user_id, name = excluded.name, feishu_open_id = excluded.feishu_open_id, email = excluded.email, updated_at = excluded.updated_at',
  ).bind(identity.platformId, identity.id, identity.name, identity.openId || '', identity.email || '', Date.now()).run();
}

async function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = db.prepare(
      'CREATE TABLE IF NOT EXISTS pollocloud_feishu_identity (platform_user_id TEXT PRIMARY KEY, feishu_user_id TEXT NOT NULL, name TEXT NOT NULL, feishu_open_id TEXT, email TEXT, updated_at INTEGER NOT NULL)',
    ).run().then(() => undefined);
  }
  await schemaReady;
}

export function resetIdentitySchemaCache(): void {
  schemaReady = null;
}
