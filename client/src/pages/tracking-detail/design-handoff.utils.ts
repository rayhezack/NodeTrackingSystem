import type {
  RelatedTrackingEvent,
  TrackingAttachment,
  TrackingDetail,
  TrackingDetailSnapshot,
} from '@shared/api.interface';

export type HandoffEvent = RelatedTrackingEvent & {
  detail?: TrackingDetail | TrackingDetailSnapshot;
};

const DESIGN_SUMMARY_FIELDS = [
  { key: 'evt_id', label: 'evt_id' },
  { key: '事件中文名', label: '事件名' },
  { key: '优先级', label: '优先级' },
  { key: '端', label: '适用端' },
  { key: '处理方', label: '处理方' },
  { key: '版本', label: '版本' },
  { key: '最低版本', label: '最低版本' },
  { key: '变更类型', label: '变更类型' },
] as const;

export function getHandoffPresentation(detail: TrackingDetail | TrackingDetailSnapshot) {
  const fields = detail.designFields || {};
  const summaryItems = DESIGN_SUMMARY_FIELDS.map((field) => ({
    label: field.label,
    value:
      field.key === 'evt_id'
        ? detail.evtId || handoffTextValue(fields[field.key])
        : field.key === '事件中文名'
          ? detail.eventName || handoffTextValue(fields[field.key])
          : field.key === '优先级'
            ? detail.priority || handoffTextValue(fields[field.key])
            : field.key === '端'
              ? handoffTextValue(fields[field.key]) || detail.platform
              : handoffTextValue(fields[field.key]),
  })).filter((item) => item.value);

  return {
    summaryItems,
    uiImages: toTrackingAttachments(fields['UI图']),
  };
}

export function getHandoffEvents(detail: TrackingDetail): HandoffEvent[] {
  const relatedEvents = detail.relatedEvents?.length
    ? detail.relatedEvents
    : [{
        recordId: detail.recordId,
        source: detail.source,
        evtId: detail.evtId,
        eventName: detail.eventName,
        stage: detail.stage,
        uiStage: detail.uiStage,
        priority: detail.priority,
        platform: detail.platform,
        isCurrent: true,
      } satisfies RelatedTrackingEvent];

  return relatedEvents.map((event) => (
    event.recordId === detail.recordId
      ? { ...event, detail }
      : event
  ));
}

export function toTrackingAttachments(value: unknown): TrackingAttachment[] {
  if (value == null) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .map<TrackingAttachment | null>((item) => {
      if (typeof item === 'string') {
        const text = item.trim();
        if (!text) return null;
        return {
          url: isPreviewableUrl(text) ? text : '',
          file_path: isPreviewableUrl(text) ? '' : text,
          name: text.split('/').pop() || text,
        };
      }
      if (!item || typeof item !== 'object') return null;
      const file = item as TrackingAttachment;
      return {
        ...file,
        bucket_id: handoffTextValue(file.bucket_id || file.bucketId),
        file_path: handoffTextValue(file.file_path || file.filePath),
        file_token: handoffTextValue(file.file_token || file.fileToken || file.token),
        url: handoffTextValue(
          file.url || file.download_url || file.downloadUrl || file.tmp_url || file.thumbnail_url || file.link,
        ),
        name: handoffTextValue(file.name || file.fileName),
      };
    })
    .filter((item): item is TrackingAttachment => Boolean(item));
}

export function toAttachmentTextArray(value: unknown): string[] {
  return Array.from(
    new Set(
      toTrackingAttachments(value)
        .map((file) =>
          handoffTextValue(
            file.url || file.download_url || file.downloadUrl || file.tmp_url || file.thumbnail_url || file.link,
          ) ||
          handoffTextValue(file.file_path || file.filePath) ||
          handoffTextValue(file.name || file.fileName),
        )
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function handoffTextValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(handoffTextValue).filter(Boolean).join('、');
  }
  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return handoffTextValue(
      objectValue.text ||
      objectValue.name ||
      objectValue.link ||
      objectValue.url ||
      objectValue.id,
    );
  }
  return '';
}

function isPreviewableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'blob:';
  } catch {
    return false;
  }
}
