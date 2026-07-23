export interface CurrentActor {
  id?: string;
  larkId?: string;
  name?: string;
}

const LOCAL_DEV_ACTOR: CurrentActor = {
  id: '7648831973842095079',
  larkId: 'ou_dc88ea9baf066ba2f8b0b5fbcb59ca28',
  name: '孙文',
};

export function getCurrentActor(userProfile: unknown): CurrentActor {
  const localActor = getLocalDevActor();
  const platformProfile = getPlatformUserProfile();
  if (!userProfile || typeof userProfile !== 'object') {
    return withFallbackActor(extractActor(platformProfile), localActor);
  }

  const profile = {
    ...platformProfile,
    ...(userProfile as Record<string, unknown>),
  };
  return withFallbackActor(extractActor(profile), localActor);
}

export function getCurrentActorId(userProfile: unknown): string | undefined {
  return getCurrentActor(userProfile).id;
}

function extractActor(profile: Record<string, unknown>): CurrentActor | null {
  const id = [
    profile.user_id,
    profile.userID,
    profile.userId,
    profile.miaodaUserID,
    profile.id,
    profile.employeeID,
  ].find(
    (value): value is string | number =>
      (typeof value === 'string' && value.length > 0) || typeof value === 'number',
  );

  const larkId = [
    profile.lark_user_id,
    profile.larkUserID,
    profile.larkID,
    profile.openId,
    profile.open_id,
    profile.feishuOpenID,
  ].find((value): value is string => typeof value === 'string' && value.length > 0);

  const name = [
    profile.name,
    profile.userName,
    profile.user_name,
    profile.email,
  ]
    .map(toText)
    .find((value) => value.length > 0);

  if (!id && !larkId && !name) return null;
  return {
    id: id != null ? String(id) : undefined,
    larkId,
    name,
  };
}

function withFallbackActor(actor: CurrentActor | null, fallback?: CurrentActor): CurrentActor {
  if (!actor) return fallback || {};
  return {
    id: actor.id || fallback?.id,
    larkId: actor.larkId || fallback?.larkId,
    name: actor.name || fallback?.name,
  };
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    for (const key of ['zh_cn', 'name', 'en_us', 'ja_jp']) {
      const item = objectValue[key];
      if (typeof item === 'string' && item.trim()) return item;
    }
  }
  return '';
}

function getLocalDevActor(): CurrentActor | undefined {
  if (typeof window === 'undefined') return undefined;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_DEV_ACTOR
    : undefined;
}

function getPlatformUserProfile(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  const platform = (window as typeof window & {
    __platform__?: Record<string, unknown>;
  }).__platform__;
  if (!platform || typeof platform !== 'object') return {};

  const nestedUser =
    platform.user && typeof platform.user === 'object'
      ? (platform.user as Record<string, unknown>)
      : {};
  const nestedWebUser =
    platform.webUser && typeof platform.webUser === 'object'
      ? (platform.webUser as Record<string, unknown>)
      : {};

  return {
    user_id: platform.user_id || platform.userId || nestedUser.user_id || nestedUser.userId || nestedWebUser.user_id || nestedWebUser.userId,
    userID: platform.userID || nestedUser.userID || nestedWebUser.userID,
    lark_user_id: platform.lark_user_id || platform.open_id || platform.openId || nestedUser.lark_user_id || nestedUser.open_id || nestedUser.openId || nestedWebUser.lark_user_id || nestedWebUser.open_id || nestedWebUser.openId,
    open_id: platform.open_id || platform.openId || nestedUser.open_id || nestedUser.openId || nestedWebUser.open_id || nestedWebUser.openId,
    name: platform.name || platform.userName || nestedUser.name || nestedUser.userName || nestedWebUser.name || nestedWebUser.userName,
    email: platform.email || nestedUser.email || nestedWebUser.email,
  };
}
