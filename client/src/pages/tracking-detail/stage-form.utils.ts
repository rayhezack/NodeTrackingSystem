import type { TrackingDetail, TrackingUserRef, UpdateTrackingRecordRequest } from '@shared/api.interface';

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
      const monitorStatus = fields['上线监控状态'] === '豁免' ? '通过' : fields['上线监控状态'];
      if (monitorStatus !== '通过') {
        throw new Error('上线监控状态必须为“通过”才能完成上线');
      }
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

export function shouldReturnToWorkbenchAfterCompletion(stageId: string): boolean {
  return stageId === 'archive';
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
      const candidates = userObjectCandidates(user);
      const numericId = firstNumericId(candidates);
      const larkUserId = firstLarkUserId(candidates);
      const id = numericId || larkUserId;
      if (!id) return null;
      const name = firstLocalizedText(candidates, ['name', 'en_name', 'display_name', 'displayName']);
      const email = firstEmail(candidates);

      return {
        user_id: id,
        ...(larkUserId ? { larkUserId } : {}),
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
      };
    })
    .filter((item): item is TrackingUserRef => Boolean(item));
}

/**
 * Resolve a person field across old Miaoda records and Pollo Cloud records.
 * Some migrated records retain only the numeric ids at the detail root while
 * the stage field is empty, so the form must not treat an empty object list as
 * an intentional empty selection.
 */
export function getTrackingUserFieldValue(
  detail: TrackingDetail,
  fieldName: string,
  fieldValue: unknown,
): TrackingUserRef[] {
  const direct = toTrackingUserRefs(fieldValue);
  if (direct.length) return direct;

  const refsByField: Record<string, unknown> = {
    '需求提出人': detail.requester,
    '需求录入人': detail.recorder,
    '数据负责人': detail.dataOwner,
    '研发负责人': detail.devOwner,
    'DS验收人': detail.dsAcceptor,
  };
  const idsByField: Record<string, unknown> = {
    '需求提出人': detail.requesterIds,
    '需求录入人': detail.recorderIds,
    '数据负责人': detail.dataOwnerIds,
    '研发负责人': detail.devOwnerIds,
    'DS验收人': detail.dsAcceptorIds,
  };

  const refs = toTrackingUserRefs(refsByField[fieldName]);
  return refs.length ? refs : toTrackingUserRefs(idsByField[fieldName]);
}

function userObjectCandidates(user: Record<string, unknown>): Record<string, unknown>[] {
  const raw = user.raw;
  const candidates = [user];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    candidates.push(raw as Record<string, unknown>);
  }
  return candidates;
}

function firstNumericId(candidates: Record<string, unknown>[]): string {
  for (const user of candidates) {
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
  }
  return '';
}

function firstLarkUserId(candidates: Record<string, unknown>[]): string {
  for (const user of candidates) {
    for (const key of [
      'larkUserId',
      'larkUserID',
      'lark_user_id',
      'larkID',
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
  }
  return '';
}

function firstEmail(candidates: Record<string, unknown>[]): string {
  for (const user of candidates) {
    for (const key of ['email', 'mail', 'emailAddress', 'email_address']) {
      const value = user[key];
      if (typeof value === 'string' && value.includes('@')) return value.trim();
    }
  }
  return '';
}

function firstLocalizedText(candidates: Record<string, unknown>[], keys: string[]): string {
  for (const user of candidates) {
    for (const key of keys) {
      const value = localizedText(user[key]);
      if (value) return value;
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
