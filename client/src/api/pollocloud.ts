export interface PolloCloudCurrentUser {
  user_id: string;
  name: string;
  email?: string;
  lark_user_id?: string;
  open_id?: string;
}

export async function getPolloCloudCurrentUser(
  signal?: AbortSignal,
): Promise<PolloCloudCurrentUser> {
  // The worker normalizes PolloCloud's trusted identity headers for the client.
  // eslint-disable-next-line no-restricted-syntax
  const response = await fetch('/api/me', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`Unable to load current user: ${response.status}`);
  }
  return normalizePolloCloudCurrentUser(await response.json());
}

export function normalizePolloCloudCurrentUser(value: unknown): PolloCloudCurrentUser {
  const root = asRecord(value);
  const user = asRecord(root.data ?? root.user ?? root);
  const id = firstText(user.user_id, user.userId, user.id);
  if (!id) throw new Error('Current user response does not contain a user id');

  const larkUserId = firstText(user.lark_user_id, user.larkUserId);
  const openId = firstText(user.open_id, user.openId);
  const email = firstText(user.email, user.enterprise_email, user.enterpriseEmail);

  return {
    user_id: id,
    name: firstText(user.name, user.user_name, user.userName) || '用户',
    ...(email ? { email } : {}),
    ...(larkUserId ? { lark_user_id: larkUserId } : {}),
    ...(openId ? { open_id: openId } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}
