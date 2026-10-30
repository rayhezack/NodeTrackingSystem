import { eventDeletionRestriction, filterEvents } from '../../client/src/pages/tracking-detail/event-navigation.utils';
import type { RelatedTrackingEvent } from '../../shared/api.interface';
const event = { recordId: 'web:rec', evtId: 'creation_template_view', eventName: '模板曝光', stage: '埋点设计', uiStage: '埋点设计' } as RelatedTrackingEvent;
describe('事件导航和删除限制', () => {
  it('支持标识和中文名称搜索，不改变原始顺序', () => {
    const events = [event, { ...event, recordId: '2', evtId: 'banner_click', eventName: '横幅点击' }];
    expect(filterEvents(events, ' TEMPLATE ')).toEqual([event]);
    expect(filterEvents(events, '点击')).toEqual([events[1]]);
    expect(filterEvents(events, '')).toEqual(events);
    expect(filterEvents(events, 'missing')).toEqual([]);
  });
  it('允许删除有权限的设计事件，但至少保留一个', () => {
    expect(eventDeletionRestriction(event, 2, true)).toBe('');
    expect(eventDeletionRestriction(event, 1, true)).toContain('至少保留');
    expect(eventDeletionRestriction(event, 2, false)).toContain('权限');
  });
  it.each(['埋点上线', '归档', '上线监控', '稳定归档', '已上线', '已废弃'])('明确显示 %s 的删除限制', stage => {
    expect(eventDeletionRestriction({ ...event, uiStage: stage }, 13, true)).toContain('不能直接删除');
  });
});
