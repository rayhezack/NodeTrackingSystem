import { getAiConfigStatus, startAiAuthorization, type D1Database, type D1PreparedStatement } from '../../worker/ai-tracking';

describe('PolloCloud AI tracking runtime', () => {
  it('reports every missing deployment binding explicitly', () => {
    expect(getAiConfigStatus({}, 'https://tracking.pollocloud.com')).toEqual(expect.objectContaining({
      configured: false,
      feishuOAuthConfigured: false,
      tokenStorage: 'encrypted_d1',
      missingKeys: expect.arrayContaining(['KIMI_API_KEY', 'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_TOKEN_ENCRYPTION_KEY', 'DB']),
    }));
  });

  it('creates a PKCE Feishu authorization URL with an encrypted actor state', async () => {
    const result = await startAiAuthorization({
      DB: unusedDb,
      FEISHU_APP_ID: 'cli_test',
      FEISHU_APP_SECRET: 'secret',
      FEISHU_TOKEN_ENCRYPTION_KEY: 'a-long-random-encryption-key',
    }, 'trusted-user', 'app:rec-1', 'https://tracking.pollocloud.com');

    const url = new URL(result.authorizationUrl);
    expect(url.origin).toBe('https://accounts.feishu.cn');
    expect(url.searchParams.get('client_id')).toBe('cli_test');
    expect(url.searchParams.get('redirect_uri')).toBe('https://tracking.pollocloud.com/api/tracking/ai/feishu-auth/callback');
    expect(url.searchParams.get('scope')).toContain('docx:document:readonly');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).not.toContain('trusted-user');
  });
});

const unusedStatement: D1PreparedStatement = {
  bind: () => unusedStatement,
  first: async () => null,
  all: async () => ({ results: [] }),
  run: async () => ({}),
};

const unusedDb: D1Database = {
  prepare: () => unusedStatement,
};
