import { FeishuOAuthService } from '../../server/modules/ai-tracking/feishu-oauth.service';

describe('Feishu OAuth token storage', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.FEISHU_APP_ID = 'cli_test';
    process.env.FEISHU_APP_SECRET = 'app_secret';
    process.env.FEISHU_OAUTH_REDIRECT_URI = 'https://example.com/api/tracking/ai/feishu-auth/callback';
    process.env.FEISHU_TOKEN_ENCRYPTION_KEY = 'test-only-encryption-key-with-more-than-32-bytes';
    delete process.env.FEISHU_OAUTH_SCOPES;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('应以密文持久化 token，并能在新服务实例中恢复授权状态', async () => {
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
      batchAddRecords: jest.fn().mockResolvedValue([{ id: 'token_record' }]),
      batchUpdateRecords: jest.fn(),
    };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          access_token: 'plain-access-token',
          refresh_token: 'plain-refresh-token',
          expires_in: 7200,
          refresh_token_expires_in: 604800,
          scope: 'offline_access auth:user.id:read docx:document:readonly wiki:node:read',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, data: { open_id: 'ou_test' } }),
      }) as typeof fetch;

    const service = new FeishuOAuthService(bitable as never);
    const started = service.startAuthorization({
      recordId: 'app:rec_1',
      actorId: 'actor_1',
    });
    const state = new URL(started.authorizationUrl).searchParams.get('state') || '';
    const completed = await service.completeAuthorization('oauth-code', state);

    expect(completed.authenticatedActor).toBe('actor_1');
    const sessionCookie = service.createSessionCookie(completed.authenticatedActor);
    expect(service.getSessionActor(`other=value; ai_tracking_session=${sessionCookie}`)).toBe('actor_1');
    expect(service.getSessionActor(`ai_tracking_session=${sessionCookie}tampered`)).toBeUndefined();

    const storedRecord = bitable.batchAddRecords.mock.calls[0][1][0] as Record<string, unknown>;
    expect(storedRecord['记录类型']).toBe('模板');
    expect(storedRecord['evt_id']).toMatch(/^__system_ai_oauth__/);
    expect(storedRecord['evt_id']).not.toContain('ou_test');
    expect(String(storedRecord['需求背景'])).toMatch(/^v1\./);
    expect(String(storedRecord['需求背景'])).not.toContain('plain-access-token');
    expect(String(storedRecord['需求背景'])).not.toContain('plain-refresh-token');

    const restoredBitable = {
      searchRecords: jest.fn().mockResolvedValue({
        records: [{ id: 'token_record', record: storedRecord }],
        hasMore: false,
      }),
    };
    const restored = new FeishuOAuthService(restoredBitable as never);
    await expect(restored.getStatus('actor_1')).resolves.toEqual(expect.objectContaining({
      authorized: true,
      tokenStorage: 'encrypted_base',
    }));
  });

  it('授权链接必须包含实际 docx 接口所需的只读权限', () => {
    process.env.FEISHU_OAUTH_SCOPES = 'offline_access docs:document.content:read wiki:node:read';
    const service = new FeishuOAuthService({} as never);

    const started = service.startAuthorization({
      recordId: 'app:rec_1',
      actorId: 'actor_1',
    });
    const scopes = new Set(
      (new URL(started.authorizationUrl).searchParams.get('scope') || '').split(/\s+/),
    );

    expect(scopes).toContain('docx:document:readonly');
  });

  it('OAuth 返回的用户 Token 缺少 docx 权限时不得标记授权成功', async () => {
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({ records: [], hasMore: false }),
      batchAddRecords: jest.fn(),
      batchUpdateRecords: jest.fn(),
    };
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          access_token: 'legacy-access-token',
          refresh_token: 'legacy-refresh-token',
          expires_in: 7200,
          refresh_token_expires_in: 604800,
          scope: 'offline_access auth:user.id:read docs:document.content:read wiki:node:read',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ code: 0, data: { open_id: 'ou_test' } }),
      }) as typeof fetch;

    const service = new FeishuOAuthService(bitable as never);
    const started = service.startAuthorization({ recordId: 'app:rec_1', actorId: 'actor_1' });
    const state = new URL(started.authorizationUrl).searchParams.get('state') || '';

    await expect(service.completeAuthorization('oauth-code', state)).rejects.toThrow(
      'docx:document:readonly',
    );
    expect(bitable.batchAddRecords).not.toHaveBeenCalled();
  });

  it('Base 中恢复的旧 Token 缺少 docx 权限时应显示需要重新授权', async () => {
    const setupService = new FeishuOAuthService({} as never);
    const encrypted = (setupService as unknown as { encrypt(value: string): string }).encrypt(JSON.stringify({
      accessToken: 'legacy-access-token',
      refreshToken: 'legacy-refresh-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      refreshExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
      scope: 'offline_access docs:document.content:read wiki:node:read',
    }));
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({
        records: [{ id: 'token_record', record: { 需求背景: encrypted } }],
        hasMore: false,
      }),
    };
    const service = new FeishuOAuthService(bitable as never);

    await expect(service.getStatus('actor_1')).resolves.toEqual(expect.objectContaining({
      authorized: false,
      reauthorizationRequired: true,
      missingScopes: ['docx:document:readonly'],
    }));
  });

  it('生成前不得继续使用缺少 docx 权限的旧 Token', async () => {
    const setupService = new FeishuOAuthService({} as never);
    const encrypted = (setupService as unknown as { encrypt(value: string): string }).encrypt(JSON.stringify({
      accessToken: 'legacy-access-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
      scope: 'offline_access docs:document.content:read wiki:node:read',
    }));
    const bitable = {
      searchRecords: jest.fn().mockResolvedValue({
        records: [{ id: 'token_record', record: { 需求背景: encrypted } }],
        hasMore: false,
      }),
    };
    const service = new FeishuOAuthService(bitable as never);

    await expect(service.getAccessToken('actor_1')).rejects.toThrow('docx:document:readonly');
  });
});
