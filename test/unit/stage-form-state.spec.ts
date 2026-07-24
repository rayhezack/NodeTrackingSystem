type StageFormUtils = {
  buildStageUpdateRequest?: (
    stageId: string,
    fields: Record<string, unknown>,
    dirtyFieldNames: Set<string>,
  ) => { fields: Record<string, unknown>; targetStage?: string };
  buildStageCompletionRequest?: (
    stageId: string,
    fields: Record<string, unknown>,
    dirtyFieldNames: Set<string>,
    completedAt?: string,
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

  it('应保留人员选择器返回的多语言姓名', () => {
    expect(typeof utils.toTrackingUserRefs).toBe('function');
    if (!utils.toTrackingUserRefs) return;

    expect(
      utils.toTrackingUserRefs([
        {
          user_id: '1867390536304713',
          name: { zh_cn: '孙文', en_us: 'Sun Wen' },
        },
      ]),
    ).toEqual([
      {
        user_id: '1867390536304713',
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
      stageId: 'design',
      fields: {
        'evt_id': 'test_event',
        '事件定义': '点击测试按钮时上报',
      },
    });
  });

  it('普通保存不应推进流程', () => {
    expect(typeof utils.buildStageUpdateRequest).toBe('function');
    if (!utils.buildStageUpdateRequest) return;

    expect(
      utils.buildStageUpdateRequest(
        'requirement',
        { '需求背景': '验证工作流' },
        new Set(['需求背景']),
      ),
    ).toEqual({
      stageId: 'requirement',
      fields: { '需求背景': '验证工作流' },
    });
  });

  it.each([
    ['requirement', {}, '埋点设计'],
    ['review', { '评审意见': '通过' }, '评审通过'],
    ['dev', {}, '数据验收'],
    ['acceptance', { 'DS验收状态': '豁免' }, '上线监控'],
    ['launch', { '上线监控状态': '通过' }, '稳定归档'],
  ])('确认完成 %s 时应推进到下一阶段', (stageId, fields, expected) => {
    expect(typeof utils.buildStageCompletionRequest).toBe('function');
    expect(
      utils.buildStageCompletionRequest?.(
        stageId as string,
        fields as Record<string, unknown>,
        new Set(Object.keys(fields)),
        '2026-07-24T10:00:00.000Z',
      ).targetStage,
    ).toBe(expected);
  });

  it('设计确认完成时应进入评审，但不改写 Base 流程阶段', () => {
    const request = utils.buildStageCompletionRequest?.(
      'design',
      { '事件定义': '点击时上报' },
      new Set(['事件定义']),
    );

    expect(request).toEqual({
      stageId: 'design',
      fields: {
        '事件定义': '点击时上报',
        '评审状态': '评审中',
      },
    });
  });

  it('验收和归档完成时应自动记录时间', () => {
    const completedAt = '2026-07-24T10:00:00.000Z';
    const acceptance = utils.buildStageCompletionRequest?.(
      'acceptance',
      {},
      new Set(),
      completedAt,
    );
    const archive = utils.buildStageCompletionRequest?.(
      'archive',
      {},
      new Set(),
      completedAt,
    );

    expect(acceptance?.fields).toEqual({
      'DS验收状态': '通过',
      'DS验收时间': completedAt,
    });
    expect(archive?.fields).toEqual({
      '正式状态': '已上线',
      '稳定归档时间': completedAt,
    });
  });
});
