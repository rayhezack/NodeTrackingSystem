import { Injectable, Logger } from '@nestjs/common';
import type { NotificationRuntimeStatus, TrackingSource, TrackingUserRef, WorkflowNotificationResult } from '@shared/api.interface';

type FeishuApiResponse<T = Record<string, unknown>> = {
  code?: number;
  msg?: string;
  data?: T;
  tenant_access_token?: string;
  expire?: number;
};

type RecipientDeliveryResult = {
  sent: boolean;
  skippedReason?: string;
  error?: string;
};

type ReceiveIdType = 'open_id' | 'email' | 'user_id';

type RecipientReceiveTarget = {
  receiveId: string;
  receiveIdType: ReceiveIdType;
  source: string;
};

const DEFAULT_FEISHU_APP_ID = 'cli_aaeb58a8113a9be5';

export type WorkflowNotificationRecipient = TrackingUserRef & {
  role?: string;
};

export type WorkflowTransitionNotification = {
  idempotencyKey: string;
  source: TrackingSource;
  recordId: string;
  requestId?: string;
  requestName: string;
  fromStage: string;
  toStage: string;
  actionText: string;
  targetStageId: string;
  priority: string;
  platform: string;
  eventIds: string[];
  eventNames: string[];
  recipients: WorkflowNotificationRecipient[];
};

@Injectable()
export class FeishuNotificationService {
  private readonly logger = new Logger(FeishuNotificationService.name);
  private readonly openIdCache = new Map<string, { openId: string; expiresAt: number }>();
  private readonly sentKeys = new Map<string, number>();
  private tokenCache: { token: string; expiresAt: number } | null = null;

  getRuntimeStatus(): NotificationRuntimeStatus {
    return {
      configured: this.isConfigured(),
      hasAppId: Boolean(this.appId),
      hasAppSecret: Boolean(this.appSecret),
      usingDefaultAppId: !process.env.FEISHU_APP_ID && !process.env.LARK_APP_ID,
    };
  }

  async sendWorkflowTransitionNotification(payload: WorkflowTransitionNotification): Promise<WorkflowNotificationResult> {
    const baseResult: WorkflowNotificationResult = {
      planned: true,
      configured: this.isConfigured(),
      recipientCount: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };

    if (!this.isConfigured()) {
      const skippedReason = 'Feishu bot credential is not configured';
      this.logger.warn(
        JSON.stringify({
          message: `Skip workflow notification: ${skippedReason}`,
          requestId: payload.requestId,
          recordId: payload.recordId,
          toStage: payload.toStage,
          hasAppId: Boolean(this.appId),
          hasAppSecret: Boolean(this.appSecret),
          recipientCount: payload.recipients.length,
        }),
      );
      return {
        ...baseResult,
        skippedCount: payload.recipients.length,
        skippedReasons: [skippedReason],
      };
    }

    const recipients = dedupeRecipients(payload.recipients);
    baseResult.recipientCount = recipients.length;
    if (!recipients.length) {
      const skippedReason = 'no recipients';
      this.logger.warn(`Skip workflow notification: ${skippedReason} for ${payload.idempotencyKey}`);
      return {
        ...baseResult,
        skippedCount: 1,
        skippedReasons: [skippedReason],
      };
    }

    let token = '';
    try {
      token = await this.getTenantAccessToken();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        JSON.stringify({
          message: 'Failed to get Feishu tenant access token',
          requestId: payload.requestId,
          recordId: payload.recordId,
          toStage: payload.toStage,
          error: errorMessage,
        }),
      );
      return {
        ...baseResult,
        failedCount: recipients.length,
        errors: [errorMessage],
      };
    }

    const deliveries: RecipientDeliveryResult[] = [];
    for (const recipient of recipients) {
      deliveries.push(await this.sendToRecipient(token, payload, recipient));
    }
    const skippedReasons = uniqueStrings(deliveries.map((item) => item.skippedReason || '').filter(Boolean));
    const errors = uniqueStrings(deliveries.map((item) => item.error || '').filter(Boolean));
    return {
      ...baseResult,
      sentCount: deliveries.filter((item) => item.sent).length,
      skippedCount: deliveries.filter((item) => item.skippedReason).length,
      failedCount: deliveries.filter((item) => item.error).length,
      ...(skippedReasons.length ? { skippedReasons } : {}),
      ...(errors.length ? { errors } : {}),
    };
  }

  private async sendToRecipient(token: string, payload: WorkflowTransitionNotification, recipient: WorkflowNotificationRecipient): Promise<RecipientDeliveryResult> {
    const recipientKey = normalizeEmail(recipient.email) || recipient.larkUserId || recipient.user_id;
    const dedupeKey = `${payload.idempotencyKey}:${recipientKey}`;
    if (this.hasRecentSentKey(dedupeKey)) {
      return {
        sent: false,
        skippedReason: 'duplicate notification suppressed',
      };
    }

    const directTargets = buildDirectReceiveTargets(recipient);
    const fallbackTargets = await this.resolveFallbackReceiveTargets(token, recipient, directTargets).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        JSON.stringify({
          message: 'Failed to resolve workflow notification recipient fallback targets',
          requestId: payload.requestId,
          recordId: payload.recordId,
          toStage: payload.toStage,
          recipient: maskRecipient(recipient),
          error: errorMessage,
        }),
      );
      return [] as RecipientReceiveTarget[];
    });
    const targets = dedupeReceiveTargets([...directTargets, ...fallbackTargets]);
    if (!targets.length) {
      this.logger.warn(
        JSON.stringify({
          message: 'Skip workflow notification: cannot resolve recipient delivery target',
          requestId: payload.requestId,
          recordId: payload.recordId,
          toStage: payload.toStage,
          recipient: maskRecipient(recipient),
        }),
      );
      return {
        sent: false,
        skippedReason: 'cannot resolve recipient delivery target',
      };
    }

    this.markSentKey(dedupeKey);
    const errors: string[] = [];
    for (const target of targets) {
      try {
        await this.postFeishuMessageWithRetry(
          `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${target.receiveIdType}`,
          {
            receive_id: target.receiveId,
            msg_type: 'interactive',
            content: JSON.stringify(this.buildMessageCard(payload, recipient)),
          },
          token,
        );
        this.logger.log(
          JSON.stringify({
            message: 'Workflow notification sent',
            requestId: payload.requestId,
            recordId: payload.recordId,
            toStage: payload.toStage,
            recipient: maskRecipient(recipient),
            receiveIdType: target.receiveIdType,
            receiveTargetSource: target.source,
          }),
        );
        return { sent: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`${target.receiveIdType}/${target.source}: ${errorMessage}`);
        this.logger.warn(
          JSON.stringify({
            message: 'Failed to send workflow notification with receive target',
            requestId: payload.requestId,
            recordId: payload.recordId,
            toStage: payload.toStage,
            recipient: maskRecipient(recipient),
            receiveIdType: target.receiveIdType,
            receiveTargetSource: target.source,
            error: errorMessage,
          }),
        );
      }
    }

    this.sentKeys.delete(dedupeKey);
    const recipientLabel = formatRecipientLabel(recipient);
    return {
      sent: false,
      error: `${recipientLabel}: ${uniqueStrings(errors).join('; ') || 'all recipient delivery targets failed'}`,
    };
  }

  private async postFeishuMessageWithRetry(
    url: string,
    body: Record<string, unknown>,
    token: string,
  ): Promise<FeishuApiResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.postFeishuApi(url, body, token);
      } catch (error) {
        lastError = error;
        if (attempt >= 2 || !isRetryableFeishuError(error)) break;
        await delay(250 * (attempt + 1));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Feishu message send failed'));
  }

  private async resolveFallbackReceiveTargets(
    token: string,
    recipient: WorkflowNotificationRecipient,
    existingTargets: RecipientReceiveTarget[],
  ): Promise<RecipientReceiveTarget[]> {
    const targets: RecipientReceiveTarget[] = [];

    const email = normalizeEmail(recipient.email);
    if (email) {
      const emailOpenId = await this.resolveOpenIdByEmail(token, email).catch(() => null);
      if (emailOpenId && !hasReceiveTarget(existingTargets, 'open_id', emailOpenId)) {
        targets.push({
          receiveId: emailOpenId,
          receiveIdType: 'open_id',
          source: 'contact.email',
        });
      }
    }

    const hasStrongerDirectTarget = existingTargets.some((target) => target.receiveIdType === 'open_id' || target.receiveIdType === 'email');
    const userId = normalizeFeishuUserId(recipient.user_id);
    if (userId && !hasStrongerDirectTarget) {
      const userOpenId = await this.resolveOpenIdByUserId(token, userId).catch(() => null);
      if (userOpenId && !hasReceiveTarget(existingTargets, 'open_id', userOpenId)) {
        targets.push({
          receiveId: userOpenId,
          receiveIdType: 'open_id',
          source: 'contact.user_id',
        });
      }
    }

    return targets;
  }

  private async resolveOpenIdByEmail(token: string, email: string): Promise<string | null> {
    const cacheKey = `email:${email}`;
    const cached = this.openIdCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.openId;

    const response = await this.postFeishuApi<{ user_list?: Array<{ user_id?: string; open_id?: string }> }>(
      'https://open.feishu.cn/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id',
      {
        emails: [email],
        include_resigned: false,
      },
      token,
    );
    const openId = response.data?.user_list?.[0]?.user_id || response.data?.user_list?.[0]?.open_id || '';
    if (!openId) return null;

    this.openIdCache.set(cacheKey, {
      openId,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    return openId;
  }

  private async resolveOpenIdByUserId(token: string, userId: string): Promise<string | null> {
    const cacheKey = `user_id:${userId}`;
    const cached = this.openIdCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.openId;

    const response = await this.getFeishuApi<{ user?: { open_id?: string; user_id?: string; email?: string } }>(
      `https://open.feishu.cn/open-apis/contact/v3/users/${encodeURIComponent(userId)}?user_id_type=user_id`,
      token,
    );
    const openId = response.data?.user?.open_id || (response.data?.user?.user_id?.startsWith('ou_') ? response.data.user.user_id : '');
    if (!openId) return null;

    this.openIdCache.set(cacheKey, {
      openId,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    });
    return openId;
  }

  private async getTenantAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }

    const response = await this.postFeishuApi(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        app_id: this.appId,
        app_secret: this.appSecret,
      },
    );
    const token = response.tenant_access_token;
    if (!token) {
      throw new Error(`Feishu tenant_access_token is empty: ${response.msg || 'unknown error'}`);
    }

    this.tokenCache = {
      token,
      expiresAt: Date.now() + Math.max(60, Number(response.expire || 7200) - 120) * 1000,
    };
    return token;
  }

  private async postFeishuApi<T = Record<string, unknown>>(
    url: string,
    body: Record<string, unknown>,
    token?: string,
  ): Promise<FeishuApiResponse<T>> {
    return this.requestFeishuApi('POST', url, token, body);
  }

  private async getFeishuApi<T = Record<string, unknown>>(
    url: string,
    token?: string,
  ): Promise<FeishuApiResponse<T>> {
    return this.requestFeishuApi('GET', url, token);
  }

  private async requestFeishuApi<T = Record<string, unknown>>(
    method: 'GET' | 'POST',
    url: string,
    token?: string,
    body?: Record<string, unknown>,
  ): Promise<FeishuApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json().catch(() => ({})) as FeishuApiResponse<T>;
    if (!response.ok || payload.code !== 0) {
      throw new Error(`Feishu API failed: http=${response.status}, code=${payload.code}, msg=${payload.msg || 'unknown'}`);
    }
    return payload;
  }

  private buildMessageCard(payload: WorkflowTransitionNotification, recipient: WorkflowNotificationRecipient): Record<string, unknown> {
    const detailUrl = this.buildDetailUrl(payload.recordId, payload.targetStageId);
    const eventSummary = formatEventSummary(payload.eventIds, payload.eventNames);
    return {
      config: {
        wide_screen_mode: true,
      },
      header: {
        template: 'blue',
        title: {
          tag: 'plain_text',
          content: `轮到你处理：${payload.requestName}`,
        },
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**${payload.fromStage} → ${payload.toStage}**\n${payload.actionText}`,
          },
        },
        {
          tag: 'div',
          fields: [
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**优先级**\n${payload.priority || '-'}`,
              },
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**端**\n${payload.platform || '-'}`,
              },
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**你的角色**\n${recipient.role || '-'}`,
              },
            },
            {
              is_short: true,
              text: {
                tag: 'lark_md',
                content: `**埋点数量**\n${payload.eventIds.length || 1}`,
              },
            },
          ],
        },
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**涉及埋点**\n${eventSummary}`,
          },
        },
        {
          tag: 'action',
          actions: [
            {
              tag: 'button',
              text: {
                tag: 'plain_text',
                content: '进入处理',
              },
              type: 'primary',
              url: detailUrl,
            },
          ],
        },
      ],
    };
  }

  private buildDetailUrl(recordId: string, targetStageId: string): string {
    const baseUrl = (process.env.TRACKING_APP_URL || process.env.FEISHU_TRACKING_APP_URL || 'https://bcn0tgplxp2e.aiforce.cloud/app/app_17apvbcusvs').replace(/\/+$/, '');
    const stageQuery = targetStageId ? `?stage=${encodeURIComponent(targetStageId)}` : '';
    return `${baseUrl}/tracking/${recordId}${stageQuery}`;
  }

  private isConfigured(): boolean {
    return Boolean(this.appId && this.appSecret);
  }

  private get appId(): string {
    return process.env.FEISHU_APP_ID || process.env.LARK_APP_ID || DEFAULT_FEISHU_APP_ID;
  }

  private get appSecret(): string {
    return process.env.FEISHU_APP_SECRET || process.env.LARK_APP_SECRET || '';
  }

  private hasRecentSentKey(key: string): boolean {
    const now = Date.now();
    this.purgeExpiredSentKeys(now);
    const expiresAt = this.sentKeys.get(key) || 0;
    return expiresAt > now;
  }

  private markSentKey(key: string): void {
    this.sentKeys.set(key, Date.now() + 12 * 60 * 60 * 1000);
  }

  private purgeExpiredSentKeys(now = Date.now()): void {
    if (this.sentKeys.size < 500) return;
    for (const [key, expiresAt] of this.sentKeys.entries()) {
      if (expiresAt <= now) this.sentKeys.delete(key);
    }
  }
}

function dedupeRecipients(recipients: WorkflowNotificationRecipient[]): WorkflowNotificationRecipient[] {
  const keyToRecipient = new Map<string, WorkflowNotificationRecipient>();
  for (const recipient of recipients) {
    const key = normalizeEmail(recipient.email) || recipient.larkUserId || recipient.user_id;
    if (!key) continue;
    const current = keyToRecipient.get(key);
    keyToRecipient.set(key, {
      ...recipient,
      role: uniqueRoleLabels([current?.role, recipient.role]).join('、'),
      name: current?.name || recipient.name,
      email: current?.email || recipient.email,
      larkUserId: current?.larkUserId || recipient.larkUserId,
    });
  }
  return Array.from(keyToRecipient.values());
}

function formatEventSummary(eventIds: string[], eventNames: string[]): string {
  const lines = eventIds.slice(0, 5).map((eventId, index) => {
    const eventName = eventNames[index] || '';
    return eventName && eventName !== eventId ? `- ${eventId}：${eventName}` : `- ${eventId}`;
  });
  const extraCount = Math.max(0, eventIds.length - lines.length);
  if (extraCount > 0) lines.push(`- 另有 ${extraCount} 个埋点事件`);
  return lines.length ? lines.join('\n') : '-';
}

function normalizeEmail(value?: string): string {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}

function buildDirectReceiveTargets(recipient: WorkflowNotificationRecipient): RecipientReceiveTarget[] {
  const targets: RecipientReceiveTarget[] = [];
  const directOpenId = [recipient.larkUserId, recipient.user_id]
    .map((value) => String(value || '').trim())
    .find((value) => value.startsWith('ou_'));
  if (directOpenId) {
    targets.push({
      receiveId: directOpenId,
      receiveIdType: 'open_id',
      source: 'recipient.open_id',
    });
  }

  const email = normalizeEmail(recipient.email);
  if (email) {
    targets.push({
      receiveId: email,
      receiveIdType: 'email',
      source: 'recipient.email',
    });
  }

  const userId = normalizeFeishuUserId(recipient.user_id);
  if (userId) {
    targets.push({
      receiveId: userId,
      receiveIdType: 'user_id',
      source: 'recipient.user_id',
    });
  }

  return dedupeReceiveTargets(targets);
}

function normalizeFeishuUserId(value?: string): string {
  const id = String(value || '').trim();
  if (!id || id.startsWith('ou_') || id.includes('@')) return '';
  return id;
}

function hasReceiveTarget(targets: RecipientReceiveTarget[], receiveIdType: ReceiveIdType, receiveId: string): boolean {
  return targets.some((target) => target.receiveIdType === receiveIdType && target.receiveId === receiveId);
}

function dedupeReceiveTargets(targets: RecipientReceiveTarget[]): RecipientReceiveTarget[] {
  const map = new Map<string, RecipientReceiveTarget>();
  for (const target of targets) {
    const receiveId = String(target.receiveId || '').trim();
    if (!receiveId) continue;
    const key = `${target.receiveIdType}:${receiveId}`;
    if (!map.has(key)) {
      map.set(key, {
        ...target,
        receiveId,
      });
    }
  }
  return Array.from(map.values());
}

function uniqueRoleLabels(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function isRetryableFeishuError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /http=429|http=5\d\d|rate|too many|frequency|timeout|ECONNRESET|ETIMEDOUT/i.test(message);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function formatRecipientLabel(recipient: WorkflowNotificationRecipient): string {
  return recipient.name || normalizeEmail(recipient.email) || recipient.larkUserId || recipient.user_id || 'unknown recipient';
}

function maskRecipient(recipient: WorkflowNotificationRecipient): Record<string, unknown> {
  return {
    user_id: recipient.user_id,
    larkUserId: recipient.larkUserId ? `${recipient.larkUserId.slice(0, 5)}***${recipient.larkUserId.slice(-4)}` : undefined,
    email: recipient.email ? maskEmail(recipient.email) : undefined,
    name: recipient.name,
    role: recipient.role,
  };
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return '***';
  return `${name.slice(0, 2)}***@${domain}`;
}
