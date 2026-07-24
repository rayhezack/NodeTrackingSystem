import type { AccountType, UserSelectItemValue } from './types';
import { getI18nText } from '../utils/user';
import type { User } from '../types/user';

export function userToItemValue(
  user: User,
  accountType: AccountType,
): UserSelectItemValue {
  return {
    id:
      accountType === 'lark'
        ? user.larkUserId || user.user_id || ''
        : user.user_id || user.larkUserId || '',
    name: getI18nText(user.name) || '未知用户',
    avatar: user.avatar,
    raw: user,
  };
}

export function getObjectUserIdsToFetch(value: unknown): string[] {
  const users = Array.isArray(value) ? value : value ? [value] : [];
  return [
    ...new Set(
      users
        .filter((user): user is User => Boolean(user && typeof user === 'object'))
        .filter((user) => !getI18nText(user.name))
        .map((user) => String(user.user_id || '').trim())
        .filter((id) => /^\d+$/.test(id)),
    ),
  ].sort();
}

export function resolveObjectUserValue(
  user: User,
  accountType: AccountType,
  fetchedUsers: Map<string, UserSelectItemValue>,
): UserSelectItemValue {
  const current = userToItemValue(user, accountType);
  if (current.name !== '未知用户') return current;
  return fetchedUsers.get(current.id) || current;
}
