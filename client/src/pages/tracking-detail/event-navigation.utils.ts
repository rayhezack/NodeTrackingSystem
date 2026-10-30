import type { RelatedTrackingEvent } from '@shared/api.interface';

export function eventDeletionRestriction(
  event: RelatedTrackingEvent,
  eventCount: number,
  canEdit: boolean,
): string {
  const stage = event.uiStage || event.stage || '';
  if (
    ['埋点上线', '归档', '上线监控', '稳定归档', '已上线', '已废弃'].includes(
      stage,
    )
  ) {
    return '已上线或归档的事件不能直接删除';
  }
  if (!canEdit) return '没有删除此事件的权限';
  if (eventCount <= 1) return '需求至少保留一个事件';
  return '';
}

export function filterEvents<T extends { evtId: string; eventName: string }>(
  events: T[],
  query: string,
): T[] {
  const keyword = query.trim().toLocaleLowerCase();
  return keyword
    ? events.filter((event) =>
        `${event.evtId} ${event.eventName}`
          .toLocaleLowerCase()
          .includes(keyword),
      )
    : events;
}
