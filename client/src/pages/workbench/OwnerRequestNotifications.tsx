import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TrackingRecord } from '@shared/api.interface';
import { getTrackingRecords } from '@client/src/api/tracking';
import { ToastStack } from '@client/src/components/bencho/ToastStack';
import { logger } from '@client/src/lib/logger';
import { newOwnerRequests, readAcknowledgedRequests, requestNotificationKey } from './request-notifications';

export function OwnerRequestNotifications({ actorId, actorLarkId }: { actorId?: string; actorLarkId?: string }) {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<TrackingRecord[]>([]);
  const identity = actorId || actorLarkId || '';
  const storageKey = `pollo:request-notifications:v1:${identity}`;
  useEffect(() => {
    let cancelled = false;
    setRequests([]);
    if (!identity) return;
    const load = async () => {
      // Independent of the workbench's filters and first ten table rows.
      const all: TrackingRecord[] = [];
      let pageToken: string | undefined;
      const tokens = new Set<string>();
      do {
        const page = await getTrackingRecords({ source: 'all', stage: '埋点提需', pageSize: 100, pageToken });
        if (cancelled) return;
        all.push(...page.items);
        pageToken = page.hasMore ? page.pageToken : undefined;
        if (pageToken && tokens.has(pageToken)) throw new Error('新需求分页游标重复');
        if (pageToken) tokens.add(pageToken);
      } while (pageToken);
      let acknowledged: string[] = [];
      try { acknowledged = readAcknowledgedRequests(localStorage.getItem(storageKey)); } catch { /* Storage can be unavailable in private mode; session state still works. */ }
      if (!cancelled) setRequests(newOwnerRequests(all, [actorId || '', actorLarkId || ''], acknowledged));
    };
    void load().catch(error => { if (!cancelled) logger.error('新需求提醒读取失败', error); });
    return () => { cancelled = true; };
  }, [actorId, actorLarkId, identity, storageKey]);

  const acknowledge = (key: string) => {
    setRequests(previous => previous.filter(record => requestNotificationKey(record) !== key));
    try {
      const old = readAcknowledgedRequests(localStorage.getItem(storageKey));
      localStorage.setItem(storageKey, JSON.stringify([...new Set([...old, key])].slice(-1000)));
    } catch { /* Dismissal still applies to the current visit. */ }
  };
  return <ToastStack items={requests.map(record => ({
    id: requestNotificationKey(record), kind: 'info',
    title: record.requestName || record.eventName || '新埋点需求',
    body: `${record.source === 'web' ? 'Web' : 'App'} · 新需求待处理，点击查看需求录入`,
  }))} onDismiss={acknowledge} onActivate={key => {
    const record = requests.find(item => requestNotificationKey(item) === key);
    if (!record) return;
    acknowledge(key);
    navigate(`/tracking/${encodeURIComponent(record.recordId)}?stage=requirement`);
  }} />;
}
