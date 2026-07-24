type StageFormUtils = {
  buildStageUpdateRequest?: (
    stageId: string,
    fields: Record<string, unknown>,
    dirtyFieldNames: Set<string>,
  ) => { fields: Record<string, unknown>; targetStage?: string };
  toTrackingUserRefs?: (value: unknown) => Array<{
    user_id: string;
    larkUserId?: string;
    name?: string;
  }>;
};

function loadStageFormUtils(): StageFormUtils {
  try {
    return require('../../client/src/pages/tracking-detail/stage-form.utils') as StageFormUtils;
  } catch {
    return {};
  }
}

describe('详情阶段表单状态', () => {
  const utils = loadStageFormUtils();

  it('应识别 Base 返回的飞书人员 ID 并保留姓名', () => {
    expect(typeof utils.toTrackingUserRefs).toBe('function');
    if (!utils.toTrackingUserRefs) return;

    expect(utils.toTrackingUserRefs([{ id: 'ou_sunwen', name: '孙文' }])).toEqual([
      {
        user_id: 'ou_sunwen',
        larkUserId: 'ou_sunwen',
        name: '孙文',
      },
    ]);
  });

  it('只回写用户实际修改过的字段，避免空表单覆盖 Base', () => {
    expect(typeof utils.buildStageUpdateRequest).toBe('function');
    if (!utils.buildStageUpdateRequest) return;

    const request = utils.buildStageUpdateRequest(
      'design',
      {
        'evt_id': 'test_event',
        '事件定义': '点击测试按钮时上报',
        '数据负责人': [],
      },
      new Set(['evt_id', '事件定义']),
    );

    expect(request).toEqual({
      fields: {
        'evt_id': 'test_event',
        '事件定义': '点击测试按钮时上报',
      },
    });
  });

  it('需求录入保存时应推进到埋点设计', () => {
    expect(typeof utils.buildStageUpdateRequest).toBe('function');
    if (!utils.buildStageUpdateRequest) return;

    expect(
      utils.buildStageUpdateRequest(
        'requirement',
        { '需求背景': '验证工作流' },
        new Set(['需求背景']),
      ),
    ).toEqual({
      fields: { '需求背景': '验证工作流' },
      targetStage: '埋点设计',
    });
  });
});
