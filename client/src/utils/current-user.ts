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
  if (!userProfile || typeof userProfile !== 'object') return localActor || {};

  const profile = userProfile as Record<string, unknown>;
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
    profile.email,
  ].find((value): value is string => typeof value === 'string' && value.length > 0);

  if (!id && !larkId && !name) return localActor || {};
  return {
    id: id != null ? String(id) : localActor?.id,
    larkId: larkId || localActor?.larkId,
    name: name || localActor?.name,
  };
}

export function getCurrentActorId(userProfile: unknown): string | undefined {
  return getCurrentActor(userProfile).id;
}

function getLocalDevActor(): CurrentActor | undefined {
  if (typeof window === 'undefined') return undefined;
  return ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? LOCAL_DEV_ACTOR
    : undefined;
}
