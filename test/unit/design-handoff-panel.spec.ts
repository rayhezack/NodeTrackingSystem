import type { TrackingDetail, TrackingDetailSnapshot } from '../../shared/api.interface';
import { getHandoffEvents } from '../../client/src/pages/tracking-detail/design-handoff.utils';

describe('研发对接面板事件集合', () => {
  it('应展示同一需求下的全部埋点事件，而不是只展示当前事件', () => {
    const siblingDetail = {
      recordId: 'app:rec_2',
      source: 'app',
      evtId: 'event_2',
      eventName: '补充事件',
      designFields: { 事件定义: '补充事件定义' },
    } as unknown as TrackingDetailSnapshot;
    const detail = {
      recordId: 'app:rec_1',
      source: 'app',
      evtId: 'event_1',
      eventName: '主事件',
      relatedEvents: [
        {
          recordId: 'app:rec_1',
          source: 'app',
          evtId: 'event_1',
          eventName: '主事件',
          stage: '埋点开发',
          uiStage: '埋点开发',
          priority: 'P1',
          platform: 'App',
          isCurrent: true,
        },
        {
          recordId: 'app:rec_2',
          source: 'app',
          evtId: 'event_2',
          eventName: '补充事件',
          stage: '埋点开发',
          uiStage: '埋点开发',
          priority: 'P1',
          platform: 'App',
          isCurrent: false,
          detail: siblingDetail,
        },
      ],
    } as unknown as TrackingDetail;

    const events = getHandoffEvents(detail);

    expect(events.map((event) => event.recordId)).toEqual([
      'app:rec_1',
      'app:rec_2',
    ]);
    expect(events[0].detail).toBe(detail);
    expect(events[1].detail).toBe(siblingDetail);
  });
});
