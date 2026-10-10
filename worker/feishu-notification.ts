import type { TrackingSource, TrackingUserRef, WorkflowNotificationResult } from '../shared/api.interface';
import { getFeishuTenantToken, type FeishuCredentials } from './feishu-token';

type FetchLike = typeof fetch;

export type WorkflowNotificationRecipient = TrackingUserRef & { role?: string };

export interface WorkflowTransitionNotification {
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
}

export async function sendWorkflowNotification(
  credentials: FeishuCredentials & { TRACKING_APP_URL?: string },
  payload: WorkflowTransitionNotification,
  fetchImpl: FetchLike = fetch,
): Promise<WorkflowNotificationResult> {
  const configured = Boolean(credentials.FEISHU_APP_ID?.trim() && credentials.FEISHU_APP_SECRET?.trim());
  const recipients = dedupeRecipients(payload.recipients);
  const result: WorkflowNotificationResult = {
    planned: true,
    configured,
    recipientCount: recipients.length,
    sentCount: 0,
    skippedCount: 0,
    failedCount: 0,
  };
  if (!configured) return { ...result, skippedCount: recipients.length, skippedReasons: ['Feishu bot credential is not configured'] };
  if (!recipients.length) return { ...result, skippedCount: 1, skippedReasons: ['no recipients'] };

  const token = await getFeishuTenantToken(credentials, fetchImpl);
  const errors: string[] = [];
  const skippedReasons: string[] = [];
  for (const recipient of recipients) {
    try {
      const userId = await resolveRecipientUserId(token, recipient, fetchImpl);
      if (!userId) {
        skippedReasons.push(`cannot resolve recipient: ${recipient.name || recipient.user_id}`);
        continue;
      }
      await postFeishu(fetchImpl, token, 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=user_id', {
        receive_id: userId,
        msg_type: 'interactive',
        content: JSON.stringify(buildMessageCard(credentials.TRACKING_APP_URL, payload, recipient)),
      });
      result.sentCount += 1;
    } catch (error) {
      errors.push(`${recipient.name || recipient.email || recipient.user_id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  result.failedCount = errors.length;
  result.skippedCount = skippedReasons.length;
  if (errors.length) result.errors = errors;
  if (skippedReasons.length) result.skippedReasons = skippedReasons;
  return result;
}

async function resolveRecipientUserId(token: string, recipient: WorkflowNotificationRecipient, fetchImpl: FetchLike): Promise<string> {
  const directUserId = String(recipient.user_id || '').trim();
  if (directUserId && !directUserId.startsWith('ou_')) return directUserId;
  const email = normalizeEmail(recipient.email);
  if (!email) return '';
  const response = await postFeishu<{ user_list?: Array<{ user_id?: string; email?: string }> }>(
    fetchImpl,
    token,
    'https://open.feishu.cn/open-apis/contact/v3/users/batch_get_id?user_id_type=user_id',
    { emails: [email], include_resigned: false },
  );
  return String(response.user_list?.find((user) => normalizeEmail(user.email) === email)?.user_id || response.user_list?.[0]?.user_id || '').trim();
}

async function postFeishu<T = Record<string, unknown>>(
  fetchImpl: FetchLike,
  token: string,
  url: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as { code?: number; msg?: string; data?: T };
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Feishu API failed: http=${response.status}, code=${payload.code}, msg=${payload.msg || 'unknown'}`);
  }
  return payload.data || {} as T;
}

function buildMessageCard(
  configuredBaseUrl: string | undefined,
  payload: WorkflowTransitionNotification,
  recipient: WorkflowNotificationRecipient,
): Record<string, unknown> {
  const baseUrl = (configuredBaseUrl || 'https://app-tracking-management.pollocloud.com').replace(/\/+$/, '');
  const detailUrl = `${baseUrl}/tracking/${encodeURIComponent(payload.recordId)}?stage=${encodeURIComponent(payload.targetStageId)}`;
  const events = payload.eventIds.slice(0, 5).map((eventId, index) => {
    const name = payload.eventNames[index] || '';
    return name && name !== eventId ? `- ${eventId}：${name}` : `- ${eventId}`;
  });
  if (payload.eventIds.length > events.length) events.push(`- 另有 ${payload.eventIds.length - events.length} 个埋点事件`);
  return {
    config: { wide_screen_mode: true },
    header: { template: 'blue', title: { tag: 'plain_text', content: `轮到你处理：${payload.requestName}` } },
    elements: [
      { tag: 'div', text: { tag: 'lark_md', content: `**${payload.fromStage} → ${payload.toStage}**\n${payload.actionText}` } },
      {
        tag: 'div',
        fields: [
          { is_short: true, text: { tag: 'lark_md', content: `**优先级**\n${payload.priority || '-'}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**端**\n${payload.platform || '-'}` } },
          { is_short: true, text: { tag: 'lark_md', content: `**你的角色**\n${recipient.role || '-'}` } },
        ],
      },
      { tag: 'div', text: { tag: 'lark_md', content: `**涉及埋点**\n${events.join('\n') || '-'}` } },
      { tag: 'action', actions: [{ tag: 'button', text: { tag: 'plain_text', content: '进入处理' }, type: 'primary', url: detailUrl }] },
    ],
  };
}

function dedupeRecipients(recipients: WorkflowNotificationRecipient[]): WorkflowNotificationRecipient[] {
  const map = new Map<string, WorkflowNotificationRecipient>();
  for (const recipient of recipients) {
    const key = normalizeEmail(recipient.email) || String(recipient.user_id || '').trim();
    if (!key) continue;
    const current = map.get(key);
    map.set(key, {
      ...recipient,
      name: current?.name || recipient.name,
      email: current?.email || recipient.email,
      role: [...new Set([current?.role, recipient.role].filter(Boolean))].join('、'),
    });
  }
  return [...map.values()];
}

function normalizeEmail(value?: string): string {
  const email = String(value || '').trim().toLocaleLowerCase();
  return email.includes('@') ? email : '';
}
