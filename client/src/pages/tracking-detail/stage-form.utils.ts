import type { TrackingUserRef, UpdateTrackingRecordRequest } from '@shared/api.interface';

export function buildStageUpdateRequest(
  stageId: string,
  fields: Record<string, unknown>,
  dirtyFieldNames: Set<string>,
): UpdateTrackingRecordRequest {
  return {
    stageId,
    fields: pickDirtyFields(fields, dirtyFieldNames),
  };
}

export function buildStageCompletionRequest(
  stageId: string,
  fields: Record<string, unknown>,
  dirtyFieldNames: Set<string>,
  completedAt = new Date().toISOString(),
): UpdateTrackingRecordRequest {
  const dirtyFields = pickDirtyFields(fields, dirtyFieldNames);

  switch (stageId) {
    case 'requirement':
      return {
        stageId,
        fields: dirtyFields,
        targetStage: '埋点设计',
      };
    case 'design':
      return {
        stageId,
        fields: { ...dirtyFields, '评审状态': '评审中' },
      };
    case 'review':
      return {
        stageId,
        fields: { ...dirtyFields, '评审状态': '已通过' },
        targetStage: '评审通过',
      };
    case 'dev':
      return {
        stageId,
        fields: { ...dirtyFields, '埋点开发状态': '已开发' },
        targetStage: '数据验收',
      };
    case 'acceptance': {
      const acceptanceStatus = fields['DS验收状态'] === '豁免' ? '豁免' : '通过';
      return {
        stageId,
        fields: {
          ...dirtyFields,
          'DS验收状态': acceptanceStatus,
          'DS验收时间': completedAt,
        },
        targetStage: '上线监控',
      };
    }
    case 'launch': {
      const monitorStatus = fields['上线监控状态'] === '豁免' ? '豁免' : '通过';
      return {
        stageId,
        fields: {
          ...dirtyFields,
          '发布状态': '发布成功',
          '上线监控状态': monitorStatus,
          '发布时间': completedAt,
        },
        targetStage: '稳定归档',
      };
    }
    case 'archive': {
      const officialStatus = fields['正式状态'] === '已废弃' ? '已废弃' : '已上线';
      return {
        stageId,
        fields: {
          ...dirtyFields,
          '正式状态': officialStatus,
          '稳定归档时间': completedAt,
        },
        ...(officialStatus === '已废弃' ? { targetStage: '已废弃' } : {}),
      };
    }
    default:
      return { stageId, fields: dirtyFields };
  }
}

function pickDirtyFields(
  fields: Record<string, unknown>,
  dirtyFieldNames: Set<string>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([fieldName]) => dirtyFieldNames.has(fieldName)),
  );
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
