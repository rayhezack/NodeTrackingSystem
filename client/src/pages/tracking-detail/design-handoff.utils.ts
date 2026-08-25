import type { RelatedTrackingEvent, TrackingDetail, TrackingDetailSnapshot } from '@shared/api.interface';

export type HandoffEvent = RelatedTrackingEvent & {
  detail?: TrackingDetail | TrackingDetailSnapshot;
};

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
