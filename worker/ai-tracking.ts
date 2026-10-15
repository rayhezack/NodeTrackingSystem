import type {
  AiFeishuAuthStatus,
  AiTrackingConfigStatus,
  AiTrackingContextFile,
  AiTrackingDraft,
  AiTrackingDraftEvent,
  AiTrackingDraftParam,
  ApplyAiTrackingDraftRequest,
  ApplyAiTrackingDraftResponse,
  GenerateAiTrackingDraftRequest,
  GenerateAiTrackingDraftResponse,
  GetAiTrackingDraftResponse,
  GetLatestAiTrackingDraftResponse,
  StartAiFeishuAuthResponse,
  TrackingDetail,
} from '../shared/api.interface';
import { POLLO_TRACKING_GOVERNANCE_RUNTIME_SKILL } from './pollo-tracking-governance-skill';
import { requestModelJson } from './ai-model';
import { getOfficialGovernanceSnapshot } from './query-library';
import { assertFreshGovernance, designPrompt, enforceGovernance, governanceReport, GovernanceValidationError, normalizeReusePlan, reusePlanningPrompt } from '../shared/official-first-workflow';
import { getTrackingDetail, getTrackingParams } from './tracking-read';
import { applyAiDraftEvents, TrackingWriteError } from './tracking-write';
import type { FeishuCredentials } from './feishu-token';

type FetchLike = typeof fetch;

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export type AiWorkerEnv = FeishuCredentials & {
  DB?: D1Database;
  FEISHU_OAUTH_REDIRECT_URI?: string;
  FEISHU_TOKEN_ENCRYPTION_KEY?: string;
  KIMI_API_KEY?: string;
  MOONSHOT_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
};

type TokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  refreshExpiresAt?: number;
  scope?: string;
};

const REQUIRED_SCOPES = ['offline_access', 'docx:document:readonly', 'wiki:node:read'];
let schemaReady: Promise<void> | null = null;

export function getAiConfigStatus(env: AiWorkerEnv, origin: string): AiTrackingConfigStatus {
  const missingKeys = [
    ...(!apiKey(env) ? ['KIMI_API_KEY'] : []),
    ...(!env.FEISHU_APP_ID?.trim() ? ['FEISHU_APP_ID'] : []),
    ...(!env.FEISHU_APP_SECRET?.trim() ? ['FEISHU_APP_SECRET'] : []),
    ...(!env.FEISHU_TOKEN_ENCRYPTION_KEY?.trim() ? ['FEISHU_TOKEN_ENCRYPTION_KEY'] : []),
    ...(!env.DB ? ['DB'] : []),
  ];
  return {
    configured: missingKeys.length === 0,
    missingKeys,
    provider: 'kimi',
    model: env.AI_MODEL?.trim() || 'kimi-k3',
    reasoningEffort: 'low',
    feishuOAuthConfigured: Boolean(env.FEISHU_APP_ID && env.FEISHU_APP_SECRET && env.FEISHU_TOKEN_ENCRYPTION_KEY && env.DB && redirectUri(env, origin)),
    tokenStorage: 'encrypted_d1',
  };
}

export async function getAiAuthStatus(env: AiWorkerEnv, actorId: string): Promise<AiFeishuAuthStatus> {
  if (!env.DB || !env.FEISHU_TOKEN_ENCRYPTION_KEY) return { authorized: false, tokenStorage: 'encrypted_d1' };
  const token = await loadToken(env, actorId);
  if (!token) return { authorized: false, tokenStorage: 'encrypted_d1' };
  const missingScopes = requiredMissingScopes(token.scope);
  const available = token.expiresAt > Date.now() || Boolean(token.refreshToken && (token.refreshExpiresAt || 0) > Date.now());
  return {
    authorized: available && !missingScopes.length,
    expiresAt: token.expiresAt,
    scope: token.scope,
    ...(available && missingScopes.length ? { reauthorizationRequired: true, missingScopes } : {}),
    tokenStorage: 'encrypted_d1',
  };
}

export async function startAiAuthorization(
  env: AiWorkerEnv,
  actorId: string,
  recordId: string,
  origin: string,
): Promise<StartAiFeishuAuthResponse> {
  assertAiStorageConfig(env);
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const state = await encrypt(env, JSON.stringify({ actorId, recordId, expiresAt }));
  const verifier = await codeVerifier(env, state);
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const params = new URLSearchParams({
    client_id: env.FEISHU_APP_ID!.trim(),
    redirect_uri: redirectUri(env, origin),
    response_type: 'code',
    state,
    scope: REQUIRED_SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return { authorizationUrl: `https://accounts.feishu.cn/open-apis/authen/v1/authorize?${params}`, expiresAt };
}

export async function completeAiAuthorization(
  env: AiWorkerEnv,
  code: string,
  state: string,
  oauthError: string | null,
  origin: string,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  assertAiStorageConfig(env);
  const session = JSON.parse(await decrypt(env, state)) as { actorId?: string; recordId?: string; expiresAt?: number };
  if (!session.actorId || !session.expiresAt || session.expiresAt <= Date.now()) throw new TrackingWriteError('授权会话已失效，请返回埋点系统重新发起授权', 400);
  if (oauthError || !code) throw new TrackingWriteError('飞书文档授权未完成', 401);
  const payload = await exchangeToken(env, {
    grant_type: 'authorization_code', client_id: env.FEISHU_APP_ID!, client_secret: env.FEISHU_APP_SECRET!,
    code, redirect_uri: redirectUri(env, origin), code_verifier: await codeVerifier(env, state),
  }, fetchImpl);
  const now = Date.now();
  const token: TokenSet = {
    accessToken: requiredText(payload.access_token, '飞书 OAuth 未返回 access_token'),
    refreshToken: optionalText(payload.refresh_token),
    expiresAt: now + Math.max(60, Number(payload.expires_in || 7200)) * 1000,
    refreshExpiresAt: payload.refresh_token ? now + Math.max(60, Number(payload.refresh_token_expires_in || 604800)) * 1000 : undefined,
    scope: optionalText(payload.scope),
  };
  const missing = requiredMissingScopes(token.scope);
  if (missing.length) throw new TrackingWriteError(`飞书授权缺少必要权限：${missing.join('、')}`, 400);
  await persistToken(env, session.actorId, token);
  return session.recordId || '';
}

export async function generateAiDraft(
  env: AiWorkerEnv,
  recordId: string,
  body: GenerateAiTrackingDraftRequest,
  actorId: string,
  origin: string,
  fetchImpl: FetchLike = fetch,
): Promise<GenerateAiTrackingDraftResponse> {
  const config = getAiConfigStatus(env, origin);
  if (!config.configured) throw new TrackingWriteError(`AI 功能缺少配置：${config.missingKeys.join('、')}`, 400);
  const detail = (await getTrackingDetail(env, recordId, actorId, fetchImpl)).data;
  if (!detail.permissions.canEditDesign) throw new TrackingWriteError('当前用户无埋点设计权限，不能使用 AI 生成草稿', 403);
  const requirementUrl = extractUrl(detail.requirementFields['需求链接']);
  if (!requirementUrl) throw new TrackingWriteError('请先提供 PRD 文档链接，再生成 AI 埋点初稿', 400);
  const accessToken = await getAccessToken(env, actorId, fetchImpl);
  const prd = await fetchPrd(requirementUrl, accessToken, fetchImpl);
  const params = (await getTrackingParams(env, recordId, fetchImpl)).items;
  let snapshot;
  try { snapshot = await getOfficialGovernanceSnapshot(env, detail.source, fetchImpl); }
  catch (error) { throw error instanceof GovernanceValidationError ? governanceWriteError(error) : new TrackingWriteError('正式库四表未能完整读取，请检查事件、参数、公共属性和枚举表的访问权限后重试；未继续调用 AI', 502); }
  const requirement = { source: detail.source, requestName: detail.requestName, background: detail.requirementFields['需求背景'], scenario: detail.requirementFields['指标/使用场景'], currentEvents: detail.relatedEvents, currentParams: params, prd, files: normalizeContextFiles(body.contextFiles) };
  const planned = await generateModelJson(env, reusePlanningPrompt(snapshot, requirement), fetchImpl);
  let plan;
  try { plan = normalizeReusePlan(planned, snapshot); }
  catch (error) { throw governanceWriteError(error); }
  const version = (await latestDraft(env, actorId, recordId))?.version || 0;
  const raw = await generateModelJson(env, designPrompt(snapshot, plan, requirement), fetchImpl);
  let events;
  try { events = enforceGovernance(normalizeModelEvents(raw, detail), snapshot, plan); }
  catch (error) { throw governanceWriteError(error); }
  const draft: AiTrackingDraft = {
    id: crypto.randomUUID(), recordId, requestId: detail.requestId, version: version + 1, status: 'draft', createdAt: Date.now(),
    provider: 'kimi', model: env.AI_MODEL?.trim() || 'kimi-k3',
    prd: { url: prd.url, title: prd.title, revision: prd.revision, truncated: prd.truncated },
    summary: `正式库校验完成：复用 ${events.filter((event) => event.reuseSource).length} 个，新增建议 ${events.filter((event) => !event.reuseSource).length} 个`, analystQuestions: unique([...(prd.truncated ? ['PRD已截断，指标覆盖需核对原文'] : []), ...events.flatMap((event) => [...event.uncertainties, ...event.params.flatMap((param) => param.uncertainties)])]), events,
    governance: governanceReport(snapshot, plan, events),
    diffs: events.map((event, index) => ({ scope: index === 0 && !detail.evtId ? 'current_event' : 'new_event', eventClientId: event.clientId, changedFields: ['evtId', 'eventName', 'eventDefinition', 'triggerTiming'], addedParamNames: event.params.map((param) => param.paramName), changedParamNames: [] })),
  };
  await persistDraft(env, actorId, draft);
  return { draft };
}

export async function getLatestAiDraft(env: AiWorkerEnv, actorId: string, recordId: string): Promise<GetLatestAiTrackingDraftResponse> {
  const draft = await latestDraft(env, actorId, recordId);
  return { draft: draft?.status === 'applied' ? null : draft || null };
}

export async function getAiDraft(env: AiWorkerEnv, actorId: string, recordId: string, draftId: string): Promise<GetAiTrackingDraftResponse> {
  await ensureSchema(env);
  const row = await env.DB!.prepare('SELECT payload FROM ai_tracking_drafts WHERE id = ? AND actor_id = ? AND record_id = ?').bind(draftId, actorId, recordId).first<{ payload?: string }>();
  return { draft: row?.payload ? JSON.parse(row.payload) as AiTrackingDraft : null };
}

export async function applyAiDraft(
  env: AiWorkerEnv,
  actorId: string,
  recordId: string,
  draftId: string,
  body: ApplyAiTrackingDraftRequest,
  fetchImpl: FetchLike = fetch,
): Promise<ApplyAiTrackingDraftResponse> {
  const draft = (await getAiDraft(env, actorId, recordId, draftId)).draft;
  if (!draft) throw new TrackingWriteError('AI 草稿不存在或已过期', 404);
  if (draft.status === 'applied') return { success: true, draftId, appliedRecordIds: draft.appliedRecordIds || [], createdEventCount: draft.appliedRecordIds?.length || 0, createdParamCount: draft.appliedParamCount || 0 };
  const selected = new Set(body.selectedEventClientIds || draft.events.map((event) => event.clientId));
  const events = draft.events.filter((event) => selected.has(event.clientId));
  if (!events.length) throw new TrackingWriteError('至少选择一个埋点事件', 400);
  const detail = (await getTrackingDetail(env, recordId, actorId, fetchImpl)).data;
  if (!detail.permissions.canEditDesign) throw new TrackingWriteError('当前用户无埋点设计权限', 403);
  const snapshot = await getOfficialGovernanceSnapshot(env, detail.source, fetchImpl);
  let checkedEvents: AiTrackingDraftEvent[];
  try {
    const plan = assertFreshGovernance(draft.governance, snapshot);
    checkedEvents = enforceGovernance(events, snapshot, { ...plan, decisions: plan.decisions.filter((item) => events.some((event) => event.evtId === item.evtId)) });
  } catch (error) {
    throw new TrackingWriteError(error instanceof Error ? error.message : '正式库校验失败', 409);
  }
  const result = await applyAiDraftEvents(env, recordId, checkedEvents, actorId, fetchImpl);
  draft.status = 'applied';
  draft.appliedRecordIds = result.appliedRecordIds;
  draft.appliedParamCount = result.createdParamCount;
  await persistDraft(env, actorId, draft);
  return { success: true, draftId, ...result };
}

function assertAiStorageConfig(env: AiWorkerEnv): void {
  const missing = [...(!env.FEISHU_APP_ID ? ['FEISHU_APP_ID'] : []), ...(!env.FEISHU_APP_SECRET ? ['FEISHU_APP_SECRET'] : []), ...(!env.FEISHU_TOKEN_ENCRYPTION_KEY ? ['FEISHU_TOKEN_ENCRYPTION_KEY'] : []), ...(!env.DB ? ['DB'] : [])];
  if (missing.length) throw new TrackingWriteError(`飞书 OAuth 缺少配置：${missing.join('、')}`, 400);
}

async function ensureSchema(env: AiWorkerEnv): Promise<void> {
  if (!env.DB) throw new TrackingWriteError('PolloCloud D1 未启用', 500);
  schemaReady ||= Promise.all([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS ai_feishu_tokens (actor_id TEXT PRIMARY KEY, encrypted_token TEXT NOT NULL, updated_at INTEGER NOT NULL)').run(),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS ai_tracking_drafts (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, record_id TEXT NOT NULL, version INTEGER NOT NULL, created_at INTEGER NOT NULL, payload TEXT NOT NULL)').run(),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_ai_drafts_owner ON ai_tracking_drafts(actor_id, record_id, created_at DESC)').run(),
  ]).then(() => undefined).catch((error) => { schemaReady = null; throw error; });
  await schemaReady;
}

async function loadToken(env: AiWorkerEnv, actorId: string): Promise<TokenSet | null> {
  await ensureSchema(env);
  const row = await env.DB!.prepare('SELECT encrypted_token FROM ai_feishu_tokens WHERE actor_id = ?').bind(actorId).first<{ encrypted_token?: string }>();
  return row?.encrypted_token ? JSON.parse(await decrypt(env, row.encrypted_token)) as TokenSet : null;
}

async function persistToken(env: AiWorkerEnv, actorId: string, token: TokenSet): Promise<void> {
  await ensureSchema(env);
  const encrypted = await encrypt(env, JSON.stringify(token));
  await env.DB!.prepare('INSERT INTO ai_feishu_tokens(actor_id, encrypted_token, updated_at) VALUES(?, ?, ?) ON CONFLICT(actor_id) DO UPDATE SET encrypted_token = excluded.encrypted_token, updated_at = excluded.updated_at').bind(actorId, encrypted, Date.now()).run();
}

async function getAccessToken(env: AiWorkerEnv, actorId: string, fetchImpl: FetchLike): Promise<string> {
  const token = await loadToken(env, actorId);
  if (!token) throw new TrackingWriteError('请先授权飞书文档读取权限', 401);
  const missing = requiredMissingScopes(token.scope);
  if (missing.length) throw new TrackingWriteError(`飞书授权缺少必要权限：${missing.join('、')}`, 401);
  if (token.expiresAt > Date.now() + 60_000) return token.accessToken;
  if (!token.refreshToken || (token.refreshExpiresAt || 0) <= Date.now()) throw new TrackingWriteError('飞书文档授权已过期，请重新授权', 401);
  const payload = await exchangeToken(env, { grant_type: 'refresh_token', client_id: env.FEISHU_APP_ID!, client_secret: env.FEISHU_APP_SECRET!, refresh_token: token.refreshToken }, fetchImpl);
  const refreshed: TokenSet = {
    ...token,
    accessToken: requiredText(payload.access_token, '飞书 OAuth 刷新失败'),
    refreshToken: optionalText(payload.refresh_token) || token.refreshToken,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 7200)) * 1000,
    refreshExpiresAt: payload.refresh_token_expires_in ? Date.now() + Number(payload.refresh_token_expires_in) * 1000 : token.refreshExpiresAt,
    scope: optionalText(payload.scope) || token.scope,
  };
  await persistToken(env, actorId, refreshed);
  return refreshed.accessToken;
}

async function exchangeToken(env: AiWorkerEnv, body: Record<string, string>, fetchImpl: FetchLike): Promise<Record<string, unknown>> {
  const response = await fetchImpl('https://open.feishu.cn/open-apis/authen/v2/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
  const root = await response.json() as Record<string, unknown>;
  const payload = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root;
  if (!response.ok || root.error || (root.code != null && Number(root.code) !== 0)) throw new TrackingWriteError(text(root.error_description || root.msg) || '飞书 OAuth 令牌交换失败', 401);
  return payload;
}

async function fetchPrd(urlValue: string, accessToken: string, fetchImpl: FetchLike): Promise<{ url: string; title: string; revision?: string; content: string; truncated: boolean }> {
  const parsed = parseDocumentUrl(urlValue);
  let token = parsed.token;
  let wikiTitle = '';
  if (parsed.type === 'wiki') {
    const node = await feishuGet(fetchImpl, `https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(token)}`, accessToken) as { node?: { obj_type?: string; obj_token?: string; title?: string } };
    if (node.node?.obj_type !== 'docx' || !node.node.obj_token) throw new TrackingWriteError('该 Wiki 节点不是 docx 文档', 400);
    token = node.node.obj_token;
    wikiTitle = node.node.title || '';
  }
  const document = await feishuGet(fetchImpl, `https://open.feishu.cn/open-apis/docx/v1/documents/${encodeURIComponent(token)}`, accessToken) as { document?: { title?: string; revision_id?: number } };
  const raw = await feishuGet(fetchImpl, `https://open.feishu.cn/open-apis/docx/v1/documents/${encodeURIComponent(token)}/raw_content`, accessToken) as { content?: string };
  const content = text(raw.content);
  if (!content) throw new TrackingWriteError('PRD 正文为空，无法生成埋点草稿', 400);
  const limit = 36_000;
  return { url: urlValue, title: document.document?.title || wikiTitle || '未命名 PRD', revision: document.document?.revision_id != null ? String(document.document.revision_id) : undefined, content: content.length > limit ? `${content.slice(0, 26_000)}\n\n[中间内容已截断]\n\n${content.slice(-10_000)}` : content, truncated: content.length > limit };
}

async function feishuGet(fetchImpl: FetchLike, url: string, token: string): Promise<unknown> {
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json() as { code?: number; msg?: string; data?: unknown };
  if (!response.ok || payload.code !== 0 || !payload.data) throw new TrackingWriteError(payload.msg || '飞书文档读取失败，请检查文档权限和 OAuth Scope', response.status === 403 ? 403 : 400);
  return payload.data;
}

async function generateModelJson(env: AiWorkerEnv, prompt: string, fetchImpl: FetchLike): Promise<unknown> {
  const body: Record<string, unknown> = { model: env.AI_MODEL?.trim() || 'kimi-k3', messages: [{ role: 'system', content: POLLO_TRACKING_GOVERNANCE_RUNTIME_SKILL }, { role: 'user', content: prompt }], reasoning_effort: 'low', max_completion_tokens: 12000, response_format: { type: 'json_object' } };
  return requestModelJson(`${(env.AI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, '')}/chat/completions`, apiKey(env), body, fetchImpl);
}

function normalizeModelEvents(raw: unknown, detail: TrackingDetail): AiTrackingDraftEvent[] {
  const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rows = Array.isArray(root.events) ? root.events : [];
  if (rows.length > 20) throw new TrackingWriteError('AI 草稿超过20个事件，不能截断', 400);
  if (!rows.length) throw new TrackingWriteError('AI 草稿结构校验失败：没有生成事件', 400);
  const events = rows.map((value, index): AiTrackingDraftEvent => {
    const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const evtId = text(item.evtId) || `pending_event_${index + 1}`;
    if (Array.isArray(item.params) && item.params.length > 100) throw new TrackingWriteError('单事件超过100个参数，不能截断', 400);
    const params = (Array.isArray(item.params) ? item.params : []).flatMap((entry): AiTrackingDraftParam[] => {
      const param = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      const paramName = text(param.paramName);
      if (!paramName) return [];
      return [{ paramName, paramType: normalizeAiParamType(text(param.paramType)), requiredRule: ['必传', '非必传', '条件必传'].includes(text(param.requiredRule)) ? text(param.requiredRule) : '非必传', triggerCondition: text(param.triggerCondition), enumRange: text(param.enumRange), definition: text(param.definition) || '待人工确认', defaultValue: text(param.defaultValue), example: text(param.example), platform: text(param.platform) || (detail.source === 'web' ? 'Web通用' : '待确认'), source: 'ai', uncertainties: textList(param.uncertainties) }];
    });
    const reuseSource = normalizeReuseSource(item.reuseSource);
    return { clientId: crypto.randomUUID(), evtId, eventName: text(item.eventName) || '待人工确认', eventDefinition: text(item.eventDefinition) || '待人工确认', triggerTiming: text(item.triggerTiming) || '待人工确认', metricScenario: text(item.metricScenario), priority: ['P0', 'P1', 'P2'].includes(text(item.priority)) ? text(item.priority) : 'P1', platform: detail.source === 'web' ? 'Web' : (['iOS', 'Android', 'iOS、Android'].includes(text(item.platform)) ? text(item.platform) : detail.platform || 'iOS、Android'), handler: text(item.handler) || (detail.source === 'web' ? '前端' : '客户端'), commonProps: text(item.commonProps), version: text(item.version) || '待人工确认', minVersion: text(item.minVersion) || '待人工确认', changeType: ['新增', '修改', '废弃', '口径调整'].includes(text(item.changeType)) ? text(item.changeType) : '新增', evidence: textList(item.evidence), uncertainties: unique([...(evtId.startsWith('pending_') ? ['evt_id 待人工确认'] : []), ...textList(item.uncertainties)]), ...(reuseSource ? { reuseSource } : {}), params };
  });
  if (events.reduce((sum, event) => sum + event.params.length, 0) > 400) throw new TrackingWriteError('AI 草稿结构校验失败：单次最多生成 400 个参数', 400);
  if (new Set(events.map((event) => event.evtId)).size !== events.length) throw new TrackingWriteError('AI 草稿内存在重复 evt_id，请重新生成', 400);
  return events;
}



function normalizeReuseSource(value: unknown): AiTrackingDraftEvent['reuseSource'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const recordId = text(source.recordId);
  const evtId = text(source.evtId);
  if (!recordId || !evtId) return undefined;
  return { recordId, evtId, eventName: text(source.eventName) || '待人工确认', modificationSummary: text(source.modificationSummary) || '待人工确认' };
}

function governanceWriteError(error: unknown): Error {
  return error instanceof GovernanceValidationError ? new TrackingWriteError(`正式库治理校验未通过：${error.message}`, 422) : error instanceof Error ? error : new Error('正式库校验失败');
}

async function persistDraft(env: AiWorkerEnv, actorId: string, draft: AiTrackingDraft): Promise<void> {
  await ensureSchema(env);
  await env.DB!.prepare('INSERT INTO ai_tracking_drafts(id, actor_id, record_id, version, created_at, payload) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload').bind(draft.id, actorId, draft.recordId, draft.version, draft.createdAt, JSON.stringify(draft)).run();
}

async function latestDraft(env: AiWorkerEnv, actorId: string, recordId: string): Promise<AiTrackingDraft | null> {
  await ensureSchema(env);
  const row = await env.DB!.prepare('SELECT payload FROM ai_tracking_drafts WHERE actor_id = ? AND record_id = ? ORDER BY created_at DESC LIMIT 1').bind(actorId, recordId).first<{ payload?: string }>();
  return row?.payload ? JSON.parse(row.payload) as AiTrackingDraft : null;
}

async function encrypt(env: AiWorkerEnv, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(env);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value)));
  return `v1.${base64Url(iv)}.${base64Url(ciphertext)}`;
}

async function decrypt(env: AiWorkerEnv, value: string): Promise<string> {
  const [version, iv, ciphertext] = value.split('.');
  if (version !== 'v1' || !iv || !ciphertext) throw new TrackingWriteError('飞书授权密文无法解密，请重新授权', 401);
  const result = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, await encryptionKey(env), fromBase64Url(ciphertext));
  return new TextDecoder().decode(result);
}

async function encryptionKey(env: AiWorkerEnv): Promise<CryptoKey> { return crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.FEISHU_TOKEN_ENCRYPTION_KEY || '')), 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function codeVerifier(env: AiWorkerEnv, state: string): Promise<string> { const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.FEISHU_TOKEN_ENCRYPTION_KEY || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return base64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(state)))); }
function base64Url(bytes: Uint8Array): string { let binary = ''; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> { const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '='); const binary = atob(base64); const bytes = new Uint8Array(new ArrayBuffer(binary.length)); for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index); return bytes; }
function redirectUri(env: AiWorkerEnv, origin: string): string { return env.FEISHU_OAUTH_REDIRECT_URI?.trim() || `${origin}/api/tracking/ai/feishu-auth/callback`; }
function apiKey(env: AiWorkerEnv): string { return env.KIMI_API_KEY?.trim() || env.MOONSHOT_API_KEY?.trim() || ''; }
function requiredMissingScopes(scope?: string): string[] { const values = new Set(text(scope).split(/[\s,]+/).filter(Boolean)); return REQUIRED_SCOPES.filter((item) => !values.has(item)); }
function parseDocumentUrl(value: string): { type: 'wiki' | 'docx'; token: string } { try { const url = new URL(value); const match = url.pathname.match(/^\/(wiki|docx)\/([A-Za-z0-9_-]+)/); if (!(url.hostname === 'feishu.cn' || url.hostname.endsWith('.feishu.cn')) || !match) throw new Error(); return { type: match[1] as 'wiki' | 'docx', token: match[2] }; } catch { throw new TrackingWriteError('需求链接不是有效的飞书 wiki/docx URL', 400); } }
function extractUrl(value: unknown): string { const raw = text(value); return raw.match(/\]\((https?:\/\/[^)\s]+)\)/)?.[1] || raw.match(/https?:\/\/[^\s)\]]+/)?.[0] || ''; }
function normalizeContextFiles(files?: AiTrackingContextFile[]): AiTrackingContextFile[] { let remaining = 24_000; return (Array.isArray(files) ? files : []).slice(0, 5).flatMap((file) => { const content = text(file?.content).slice(0, Math.min(8_000, remaining)); remaining -= content.length; return content ? [{ name: text(file?.name).slice(0, 160) || '未命名文件', content }] : []; }); }
function normalizeAiParamType(value: string): string { const raw = value.toUpperCase(); if (raw === 'BOOL') return 'BOOLEAN'; return ['STRING', 'INTEGER', 'NUMBER', 'BOOLEAN', 'ARRAY', 'OBJECT', 'UNKNOWN'].includes(raw) ? raw : 'UNKNOWN'; }
function snake(value: string): string { return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }
function unique(values: string[]): string[] { return [...new Set(values.map((value) => text(value)).filter(Boolean))]; }
function textList(value: unknown): string[] { return (Array.isArray(value) ? value : [value]).map((item) => text(item)).filter(Boolean); }
function text(value: unknown): string { return value == null ? '' : typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''; }
function optionalText(value: unknown): string | undefined { return text(value) || undefined; }
function requiredText(value: unknown, message: string): string { const result = text(value); if (!result) throw new TrackingWriteError(message, 401); return result; }

export function aiOAuthCallbackHtml(success: boolean, message: string): string {
  const safe = message.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>飞书文档授权</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#f5f6f8;color:#1f2329}main{max-width:520px;margin:18vh auto;padding:28px;background:#fff;border:1px solid #dee0e3;border-radius:4px}h1{font-size:18px;color:${success ? '#00a870' : '#d54941'}}</style></head><body><main><h1>${success ? '授权成功' : '授权失败'}</h1><p>${safe}</p></main><script>setTimeout(function(){window.close()},1800)</script></body></html>`;
}
