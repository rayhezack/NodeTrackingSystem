import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { BitableService } from '../bitable/bitable.service';

interface FeishuTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  refreshExpiresAt?: number;
  scope?: string;
  openId?: string;
}

interface AuthorizationSession {
  actorKey: string;
  actorLarkId?: string;
  recordId: string;
  codeVerifier: string;
  expiresAt: number;
}

interface OAuthTokenResponse {
  code?: number;
  msg?: string;
  error?: string;
  error_description?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  scope?: string;
}

@Injectable()
export class FeishuOAuthService {
  private readonly sessions = new Map<string, AuthorizationSession>();
  private readonly tokens = new Map<string, FeishuTokenSet>();

  constructor(private readonly bitable: BitableService) {}

  get configured(): boolean {
    return this.missingConfigKeys.length === 0;
  }

  get missingConfigKeys(): string[] {
    return [
      ...(!this.appId ? ['FEISHU_APP_ID'] : []),
      ...(!this.appSecret ? ['FEISHU_APP_SECRET'] : []),
      ...(!this.redirectUri ? ['FEISHU_OAUTH_REDIRECT_URI'] : []),
      ...(!this.encryptionSecret ? ['FEISHU_TOKEN_ENCRYPTION_KEY'] : []),
    ];
  }

  async getStatus(actorId?: string, actorLarkId?: string) {
    const token = await this.loadToken(actorKey(actorId, actorLarkId));
    return {
      authorized: Boolean(
        token?.accessToken &&
        (token.expiresAt > Date.now() || Boolean(token.refreshToken && (token.refreshExpiresAt || 0) > Date.now())),
      ),
      ...(token ? { expiresAt: token.expiresAt, scope: token.scope } : {}),
      tokenStorage: 'encrypted_base' as const,
    };
  }

  getSessionActor(cookieHeader?: string): string | undefined {
    const cookieValue = readCookie(cookieHeader, 'ai_tracking_session');
    if (!cookieValue) return undefined;
    const separator = cookieValue.lastIndexOf('.');
    if (separator <= 0) return undefined;
    const encodedActor = cookieValue.slice(0, separator);
    const receivedSignature = cookieValue.slice(separator + 1);
    const expectedSignature = this.signSessionActor(encodedActor);
    const receivedBuffer = Buffer.from(receivedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) return undefined;
    try {
      const actor = Buffer.from(encodedActor, 'base64url').toString('utf8').trim();
      return actor || undefined;
    } catch {
      return undefined;
    }
  }

  createSessionCookie(actor: string): string {
    const encodedActor = Buffer.from(actor, 'utf8').toString('base64url');
    return `${encodedActor}.${this.signSessionActor(encodedActor)}`;
  }

  startAuthorization(input: {
    recordId: string;
    actorId?: string;
    actorLarkId?: string;
  }) {
    if (!this.configured) {
      throw new BadRequestException('飞书 OAuth 尚未配置，请补充应用凭证、回调地址和 FEISHU_TOKEN_ENCRYPTION_KEY');
    }
    const key = actorKey(input.actorId, input.actorLarkId);
    const state = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const expiresAt = Date.now() + 10 * 60 * 1000;
    this.sessions.set(state, {
      actorKey: key,
      actorLarkId: input.actorLarkId,
      recordId: input.recordId,
      codeVerifier,
      expiresAt,
    });
    this.pruneExpiredSessions();

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state,
      scope: this.scopes,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return {
      authorizationUrl: `https://accounts.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`,
      expiresAt,
    };
  }

  async completeAuthorization(code: string, state: string, oauthError?: string) {
    const session = this.sessions.get(state);
    this.sessions.delete(state);
    if (!session || session.expiresAt <= Date.now()) {
      throw new BadRequestException('授权会话已失效，请返回埋点系统重新发起授权');
    }
    if (oauthError) {
      throw new UnauthorizedException('飞书文档授权未完成');
    }
    if (!code) {
      throw new BadRequestException('飞书 OAuth 回调缺少授权码');
    }

    const response = await this.exchangeToken({
      grant_type: 'authorization_code',
      client_id: this.appId,
      client_secret: this.appSecret,
      code,
      redirect_uri: this.redirectUri,
      code_verifier: session.codeVerifier,
    });
    const now = Date.now();
    const token: FeishuTokenSet = {
      accessToken: requiredToken(response.access_token),
      refreshToken: response.refresh_token,
      expiresAt: now + Math.max(60, Number(response.expires_in || 7200)) * 1000,
      refreshExpiresAt: response.refresh_token
        ? now + Math.max(60, Number(response.refresh_token_expires_in || 604800)) * 1000
        : undefined,
      scope: response.scope,
    };
    const userInfo = await this.fetchUserInfo(token.accessToken);
    token.openId = typeof userInfo.open_id === 'string' ? userInfo.open_id : undefined;
    if (session.actorLarkId && token.openId && session.actorLarkId !== token.openId) {
      throw new UnauthorizedException('扫码账号与当前埋点系统账号不一致，请使用当前账号重新授权');
    }
    const authenticatedActor = token.openId || session.actorKey;
    await this.persistToken(authenticatedActor, token);
    return { recordId: session.recordId, authenticatedActor };
  }

  async getAccessToken(actorId?: string, actorLarkId?: string): Promise<string> {
    const key = actorKey(actorId, actorLarkId);
    const token = await this.loadToken(key);
    if (!token) {
      throw new UnauthorizedException('请先授权飞书文档读取权限');
    }
    if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
    if (!token.refreshToken || (token.refreshExpiresAt || 0) <= Date.now()) {
      this.tokens.delete(key);
      throw new UnauthorizedException('飞书文档授权已过期，请重新授权');
    }

    const response = await this.exchangeToken({
      grant_type: 'refresh_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      refresh_token: token.refreshToken,
    });
    const now = Date.now();
    const refreshed: FeishuTokenSet = {
      ...token,
      accessToken: requiredToken(response.access_token),
      refreshToken: response.refresh_token || token.refreshToken,
      expiresAt: now + Math.max(60, Number(response.expires_in || 7200)) * 1000,
      refreshExpiresAt: response.refresh_token_expires_in
        ? now + Number(response.refresh_token_expires_in) * 1000
        : token.refreshExpiresAt,
      scope: response.scope || token.scope,
    };
    await this.persistToken(key, refreshed);
    return refreshed.accessToken;
  }

  private async loadToken(key: string): Promise<FeishuTokenSet | undefined> {
    const cached = this.tokens.get(key);
    if (cached) return cached;
    const recordKey = tokenRecordKey(key);
    const result = await this.bitable.searchRecords('workbench', {
      fieldNames: ['evt_id', '需求背景', '记录类型'],
      filter: {
        conjunction: 'and',
        conditions: [{ fieldName: 'evt_id', operator: 'is', value: [recordKey] }],
      },
      pageSize: 2,
    });
    const encrypted = result.records[0]?.record['需求背景'];
    if (typeof encrypted !== 'string' || !encrypted) return undefined;
    try {
      const token = JSON.parse(this.decrypt(encrypted)) as FeishuTokenSet;
      if (!token.accessToken || !token.expiresAt) return undefined;
      this.tokens.set(key, token);
      return token;
    } catch {
      throw new UnauthorizedException('飞书授权密文无法解密，请重新授权');
    }
  }

  private async persistToken(key: string, token: FeishuTokenSet): Promise<void> {
    const recordKey = tokenRecordKey(key);
    const result = await this.bitable.searchRecords('workbench', {
      fieldNames: ['evt_id', '需求背景', '记录类型'],
      filter: {
        conjunction: 'and',
        conditions: [{ fieldName: 'evt_id', operator: 'is', value: [recordKey] }],
      },
      pageSize: 2,
    });
    const record = {
      evt_id: recordKey,
      事件中文名: 'AI 文档授权密文',
      需求背景: this.encrypt(JSON.stringify(token)),
      流程阶段: '稳定归档',
      记录类型: '模板',
      优先级: 'P2',
      版本: 'system',
    };
    if (result.records[0]) {
      await this.bitable.batchUpdateRecords('workbench', [{ id: result.records[0].id, record }]);
    } else {
      await this.bitable.batchAddRecords('workbench', [record]);
    }
    this.tokens.set(key, token);
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  private decrypt(value: string): string {
    const [version, ivValue, tagValue, encryptedValue] = value.split('.');
    if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('invalid ciphertext');
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private async exchangeToken(body: Record<string, string>): Promise<OAuthTokenResponse> {
    const response = await fetch('https://open.feishu.cn/open-apis/authen/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = (await response.json().catch(() => ({}))) as OAuthTokenResponse;
    if (!response.ok || payload.error || (payload.code != null && payload.code !== 0)) {
      throw new UnauthorizedException(payload.error_description || payload.msg || '飞书 OAuth 令牌交换失败');
    }
    return payload;
  }

  private async fetchUserInfo(accessToken: string): Promise<Record<string, unknown>> {
    const response = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(20_000),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || Number(payload.code || 0) !== 0) {
      throw new UnauthorizedException(String(payload.msg || '无法校验飞书授权用户'));
    }
    return (payload.data && typeof payload.data === 'object' ? payload.data : payload) as Record<string, unknown>;
  }

  private pruneExpiredSessions() {
    const now = Date.now();
    for (const [state, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) this.sessions.delete(state);
    }
  }

  private get appId(): string {
    return process.env.FEISHU_APP_ID || process.env.LARK_APP_ID || '';
  }

  private get appSecret(): string {
    return process.env.FEISHU_APP_SECRET || process.env.LARK_APP_SECRET || '';
  }

  private get redirectUri(): string {
    return process.env.FEISHU_OAUTH_REDIRECT_URI || '';
  }

  private get encryptionSecret(): string {
    return process.env.FEISHU_TOKEN_ENCRYPTION_KEY || '';
  }

  private get encryptionKey(): Buffer {
    if (!this.encryptionSecret) throw new Error('FEISHU_TOKEN_ENCRYPTION_KEY is missing');
    return createHash('sha256').update(this.encryptionSecret).digest();
  }

  private get scopes(): string {
    return process.env.FEISHU_OAUTH_SCOPES ||
      'offline_access auth:user.id:read docs:document.content:read wiki:node:read wiki:node:retrieve';
  }

  private signSessionActor(encodedActor: string): string {
    if (!this.encryptionSecret) throw new Error('FEISHU_TOKEN_ENCRYPTION_KEY is missing');
    return createHmac('sha256', this.encryptionSecret).update(encodedActor).digest('base64url');
  }
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const entry of cookieHeader.split(';')) {
    const [key, ...valueParts] = entry.trim().split('=');
    if (key === name) return valueParts.join('=');
  }
  return undefined;
}

function tokenRecordKey(actorKeyValue: string): string {
  const hash = createHash('sha256').update(actorKeyValue).digest('hex').slice(0, 32);
  return `__system_ai_oauth__${hash}`;
}

function actorKey(actorId?: string, actorLarkId?: string): string {
  const key = String(actorLarkId || actorId || '').trim();
  if (!key) throw new BadRequestException('无法识别当前用户');
  return key;
}

function requiredToken(value?: string): string {
  if (!value) throw new UnauthorizedException('飞书 OAuth 未返回 access_token');
  return value;
}
