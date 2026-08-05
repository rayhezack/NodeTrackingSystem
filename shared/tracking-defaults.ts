import type { TrackingUserRef } from './api.interface';

export const DEFAULT_DATA_OWNER: TrackingUserRef = {
  user_id: '1867390536304713',
  larkUserId: 'ou_dc88ea9baf066ba2f8b0b5fbcb59ca28',
  email: 'ray@mail.pollo.ai',
  name: '孙文',
};

export const DEFAULT_TRACKING_VALIDATOR: TrackingUserRef = {
  user_id: '1855461847682347',
  larkUserId: 'ou_baee777128714311d1a0fdd2f8304c04',
  email: 'joe@mail.pollo.ai',
  name: '刘桥',
};

export const DEFAULT_TRACKING_VALIDATORS = [DEFAULT_DATA_OWNER, DEFAULT_TRACKING_VALIDATOR];
export const DEFAULT_PROJECT_USERS = [DEFAULT_DATA_OWNER, DEFAULT_TRACKING_VALIDATOR];

export function enrichDefaultProjectUser<T extends TrackingUserRef>(user: T): T {
  const identityKeys = [user.user_id, user.larkUserId].filter(Boolean);
  const knownUser = DEFAULT_PROJECT_USERS.find((candidate) =>
    [candidate.user_id, candidate.larkUserId].some((key) => key && identityKeys.includes(key)),
  );
  if (!knownUser) return user;
  return {
    ...knownUser,
    ...user,
    larkUserId: user.larkUserId || knownUser.larkUserId,
    name: user.name || knownUser.name,
  };
}
