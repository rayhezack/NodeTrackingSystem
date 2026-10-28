import type { TrackingRecord } from '../../shared/api.interface';
import { newOwnerRequests, readAcknowledgedRequests, requestNotificationKey } from '../../client/src/pages/workbench/request-notifications';
const record = (overrides: Partial<TrackingRecord> = {}): TrackingRecord => ({
  recordId: 'web:rec1', requestId: 'REQ1', source: 'web', requestName: '首页需求', evtId: '', eventIds: [], eventName: '', eventNames: [], eventCount: 1,
  stage: '需求录入', uiStage: '埋点提需', priority: 'P1', platform: 'Web', requester: [], requesterIds: [], dataOwner: ['Owner'], dataOwnerIds: ['owner'],
  devOwner: [], devOwnerIds: [], updatedAt: 1, ...overrides,
});
describe('owner 的新需求提醒', () => {
  it('只提醒数据负责人，开发负责人和管理员不会自动收到所有需求', () => {
    const rows = [record({ devOwnerIds: ['dev'] })];
    expect(newOwnerRequests(rows, ['owner'], [])).toHaveLength(1);
    expect(newOwnerRequests(rows, ['dev'], [])).toHaveLength(0);
    expect(newOwnerRequests(rows, ['admin'], [])).toHaveLength(0);
    expect(newOwnerRequests(rows, [], [])).toHaveLength(0);
  });
  it('支持平台和飞书身份；同需求多个事件只提醒一次，跨库不合并', () => {
    const rows = [record(), record({ recordId: 'web:rec2' }), record({ source: 'app', recordId: 'app:rec1' })];
    expect(newOwnerRequests(rows, ['platform-id', 'owner'], [])).toHaveLength(2);
  });
  it('已读项和已离开提需阶段的需求不再提醒', () => {
    expect(newOwnerRequests([record()], ['owner'], [requestNotificationKey(record())])).toEqual([]);
    expect(newOwnerRequests([record({ stage: '埋点设计', uiStage: '埋点设计' })], ['owner'], [])).toEqual([]);
  });
  it('新需求优先，损坏的本地已读记录不阻断提醒', () => {
    const rows = [record(), record({ requestId: 'REQ2', recordId: 'web:rec2', updatedAt: 2 })];
    expect(newOwnerRequests(rows, ['owner'], [])[0].requestId).toBe('REQ2');
    expect(readAcknowledgedRequests('{bad')).toEqual([]);
    expect(readAcknowledgedRequests('["web:REQ1", 4]')).toEqual(['web:REQ1']);
  });
});
