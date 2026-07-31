import { Injectable, Logger } from '@nestjs/common';
import type { TrackingSource, TrackingUserRef } from '@shared/api.interface';

type FeishuApiResponse<T = Record<string, unknown>> = {
  code?: number;
  msg?: string;
  data?: T;
  tenant_access_token?: string;
  expire?: number;
};

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

  async sendWorkflowTransitionNotification(payload: WorkflowTransitionNotification): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn('Skip workflow notification: FEISHU_APP_ID or FEISHU_APP_SECRET is not configured');
      return;
    }

    const recipients = dedupeRecipients(payload.recipients);
    if (!recipients.length) {
      this.logger.warn(`Skip workflow notification: no recipients for ${payload.idempotencyKey}`);
      return;
    }

    const token = await this.getTenantAccessToken();
    await Promise.all(
      recipients.map((recipient) =>
        this.sendToRecipient(token, payload, recipient).catch((error) => {
          this.logger.warn(
            JSON.stringify({
              message: 'Failed to send workflow notification',
              requestId: payload.requestId,
              recordId: payload.recordId,
              toStage: payload.toStage,
              recipient: maskRecipient(recipient),
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }),
      ),
    );
  }

  private async sendToRecipient(token: string, payload: WorkflowTransitionNotification, recipient: WorkflowNotificationRecipient): Promise<void> {
    const recipientKey = recipient.larkUserId || normalizeEmail(recipient.email) || recipient.user_id;
    const dedupeKey = `${payload.idempotencyKey}:${recipientKey}`;
    if (this.hasRecentSentKey(dedupeKey)) return;

    const openId = await this.resolveOpenId(token, recipient);
    if (!openId) {
      this.logger.warn(
        JSON.stringify({
          message: 'Skip workflow notification: cannot resolve recipient open_id',
          requestId: payload.requestId,
          recordId: payload.recordId,
          toStage: payload.toStage,
          recipient: maskRecipient(recipient),
        }),
      );
      return;
    }

    this.markSentKey(dedupeKey);
    try {
      await this.postFeishuApi(
        `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id`,
        {
          receive_id: openId,
          msg_type: 'interactive',
          content: JSON.stringify(this.buildMessageCard(payload, recipient)),
        },
        token,
      );
    } catch (error) {
      this.sentKeys.delete(dedupeKey);
      throw error;
    }
  }

  private async resolveOpenId(token: string, recipient: WorkflowNotificationRecipient): Promise<string | null> {
    const directOpenId = [recipient.larkUserId, recipient.user_id].find((value) => typeof value === 'string' && value.startsWith('ou_'));
    if (directOpenId) return directOpenId;

    const email = normalizeEmail(recipient.email);
    if (!email) return null;

    const cached = this.openIdCache.get(email);
    if (cached && cached.expiresAt > Date.now()) return cached.openId;

    const response = await this.postFeishuApi<{ user_list?: Array<{ user_id?: string }> }>(
      'https://open.feishu.cn/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id',
      {
        emails: [email],
        include_resigned: false,
      },
      token,
    );
    const openId = response.data?.user_list?.[0]?.user_id || '';
    if (!openId) return null;

    this.openIdCache.set(email, {
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
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
    return process.env.FEISHU_APP_ID || process.env.LARK_APP_ID || '';
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
    const key = recipient.larkUserId || normalizeEmail(recipient.email) || recipient.user_id;
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

function uniqueRoleLabels(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
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
