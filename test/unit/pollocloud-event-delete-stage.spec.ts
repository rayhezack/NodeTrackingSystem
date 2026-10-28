import { deleteTrackingEvent } from '../../worker/tracking-write';
import { getBitableRecord, searchBitableRecordPage, deleteBitableRecords } from '../../worker/feishu-bitable';
jest.mock('../../worker/feishu-bitable', () => ({
  getBitableRecord: jest.fn(), searchBitableRecordPage: jest.fn(), deleteBitableRecords: jest.fn(),
}));
const credentials = { FEISHU_APP_ID: 'test', FEISHU_APP_SECRET: 'test' };
describe('线上 Worker 与设计页的删除阶段一致', () => {
  beforeEach(() => jest.resetAllMocks());
  function prepare(stage: string, extra: Record<string, unknown> = {}, siblings = true) {
    const current = { id: 'rec1', record: { evt_id: 'event_1', 需求ID: 'request_1', 流程阶段: stage, 评审状态: '评审中', ...extra } };
    jest.mocked(getBitableRecord).mockResolvedValue(current);
    jest.mocked(searchBitableRecordPage).mockImplementation(async (_credentials, key, params) => {
      const groupQuery = params?.filter?.conditions?.some(item => item.field_name === '需求ID');
      const records = key === 'workbench' && groupQuery ? [current, ...(siblings ? [{ id: 'rec2', record: { 需求ID: 'request_1' } }] : [])] : [];
      return { records, hasMore: false };
    });
    jest.mocked(deleteBitableRecords).mockResolvedValue(undefined);
  }
  it.each(['需求录入', '埋点设计', '评审通过', '埋点开发', '数据验收'])('有权限时允许删除 %s 的同需求事件', async stage => {
    prepare(stage);
    await expect(deleteTrackingEvent(credentials, 'app:rec1', 'sunwen-1663469')).resolves.toMatchObject({ success: true, redirectRecordId: 'app:rec2' });
    expect(deleteBitableRecords).toHaveBeenCalledTimes(1);
  });
  it.each(['上线监控', '稳定归档', '已废弃'])('阻止删除 %s 的事件', async stage => {
    prepare(stage);
    await expect(deleteTrackingEvent(credentials, 'app:rec1', 'sunwen-1663469')).rejects.toThrow('不可删除');
    expect(deleteBitableRecords).not.toHaveBeenCalled();
  });
  it('拒绝删除已发布记录，即使流程阶段被改回设计', async () => {
    prepare('埋点设计', { 发布状态: '发布成功' });
    await expect(deleteTrackingEvent(credentials, 'app:rec1', 'sunwen-1663469')).rejects.toThrow('不可删除');
    expect(deleteBitableRecords).not.toHaveBeenCalled();
  });
  it('仍保留权限和至少一个事件的保护', async () => {
    prepare('埋点设计');
    await expect(deleteTrackingEvent(credentials, 'app:rec1', 'stranger')).rejects.toThrow('无权限');
    prepare('埋点设计', {}, false);
    await expect(deleteTrackingEvent(credentials, 'app:rec1', 'sunwen-1663469')).rejects.toThrow('至少需要保留');
    expect(deleteBitableRecords).not.toHaveBeenCalled();
  });
});
