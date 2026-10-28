import type { D1Database } from './ai-tracking';

export type FeishuCredentials = { DB?: D1Database; FEISHU_APP_ID?: string; FEISHU_APP_SECRET?: string };
type FetchLike = typeof fetch;
let tokenCache: { appId: string; token: string; expiresAt: number } | null = null;
let tokenPending: { appId: string; promise: Promise<string> } | null = null;

export async function getFeishuTenantToken(credentials: FeishuCredentials, fetchImpl: FetchLike = fetch): Promise<string> {
  const appId = credentials.FEISHU_APP_ID?.trim();
  const appSecret = credentials.FEISHU_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new Error('Feishu app credentials are not configured');
  if (tokenCache?.appId === appId && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;
  if (tokenPending?.appId === appId) return tokenPending.promise;

  const promise = requestFeishuTenantToken(appId, appSecret, fetchImpl);
  tokenPending = { appId, promise };
  try {
    return await promise;
  } finally {
    if (tokenPending?.promise === promise) tokenPending = null;
  }
}

async function requestFeishuTenantToken(appId: string, appSecret: string, fetchImpl: FetchLike): Promise<string> {
  const response = await fetchImpl('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const payload = await response.json() as { code?: number; msg?: string; tenant_access_token?: string; expire?: number };
  if (!response.ok || payload.code !== 0 || !payload.tenant_access_token) {
    throw new Error(`Feishu token request failed: ${response.status} ${payload.msg || 'unknown error'}`);
  }
  tokenCache = { appId, token: payload.tenant_access_token, expiresAt: Date.now() + Math.max((payload.expire || 0) - 60, 30) * 1000 };
  return tokenCache.token;
}

export function resetFeishuTokenCache(): void {
  tokenCache = null;
  tokenPending = null;
}
