import type { TrackingUserRef, UpdateTrackingRecordRequest } from '@shared/api.interface';

export function buildStageUpdateRequest(
  stageId: string,
  fields: Record<string, unknown>,
  dirtyFieldNames: Set<string>,
): UpdateTrackingRecordRequest {
  const dirtyFields = Object.fromEntries(
    Object.entries(fields).filter(([fieldName]) => dirtyFieldNames.has(fieldName)),
  );

  return {
    fields: dirtyFields,
    ...(stageId === 'requirement' ? { targetStage: '埋点设计' } : {}),
  };
}

export function toTrackingUserRefs(value: unknown): TrackingUserRef[] {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];

  return values
    .map<TrackingUserRef | null>((item) => {
      if (typeof item === 'string' || typeof item === 'number') {
        const id = String(item).trim();
        if (!id) return null;
        return {
          user_id: id,
          ...(isLarkUserId(id) ? { larkUserId: id } : {}),
        };
      }
      if (!item || typeof item !== 'object') return null;

      const user = item as Record<string, unknown>;
      const numericId = firstNumericId(user);
      const larkUserId = firstLarkUserId(user);
      const id = numericId || larkUserId;
      if (!id) return null;
      const name = localizedText(user.name);

      return {
        user_id: id,
        ...(larkUserId ? { larkUserId } : {}),
        ...(name ? { name } : {}),
      };
    })
    .filter((item): item is TrackingUserRef => Boolean(item));
}

function firstNumericId(user: Record<string, unknown>): string {
  for (const key of [
    'user_id',
    'userId',
    'userID',
    'miaoda_user_id',
    'miaodaUserID',
    'employee_id',
    'employeeID',
    'id',
  ]) {
    const value = user[key];
    const id = typeof value === 'number' ? String(value) : String(value || '').trim();
    if (/^\d+$/.test(id)) return id;
  }
  return '';
}

function firstLarkUserId(user: Record<string, unknown>): string {
  for (const key of [
    'larkUserId',
    'lark_user_id',
    'lark_id',
    'open_id',
    'openId',
    'id',
    'user_id',
  ]) {
    const value = user[key];
    if (typeof value === 'string' && isLarkUserId(value.trim())) {
      return value.trim();
    }
  }
  return '';
}

function isLarkUserId(value: string): boolean {
  return value.startsWith('ou_');
}

function localizedText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';

  const text = value as Record<string, unknown>;
  for (const key of ['zh_cn', 'en_us', 'ja_jp']) {
    if (typeof text[key] === 'string' && text[key].trim()) {
      return text[key].trim();
    }
  }
  return '';
}
