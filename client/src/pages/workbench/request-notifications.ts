import type { TrackingRecord } from '@shared/api.interface';

export function requestNotificationKey(record: TrackingRecord) {
  return `${record.source}:${record.requestId || record.recordId}`;
}

/** Notify the assigned data owner, not every administrator or developer.
 *  A grouped request is one notification even when it contains many events. */
export function newOwnerRequests(records: TrackingRecord[], actorIds: string[], acknowledged: string[]) {
  const identities = new Set(actorIds.filter(Boolean));
  const seen = new Set(acknowledged), unique = new Map<string, TrackingRecord>();
  for (const record of records) {
    if (!['需求录入', '埋点提需'].includes(record.stage) && record.uiStage !== '埋点提需') continue;
    if (!record.dataOwnerIds.some(id => identities.has(id))) continue;
    const key = requestNotificationKey(record);
    if (!seen.has(key) && !unique.has(key)) unique.set(key, record);
  }
  return [...unique.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function readAcknowledgedRequests(value: string | null): string[] {
  try { const parsed: unknown = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []; }
  catch { return []; }
}
