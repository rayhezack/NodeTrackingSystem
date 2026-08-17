import { SIDEBAR_STAGES } from '../../client/src/pages/tracking-detail/stage-config';

type AiTrackingPrdUtils = {
  getAiDraftGenerationBlockReason?: (requirementLink: string) => string | null;
};

function loadAiTrackingPrdUtils(): AiTrackingPrdUtils {
  try {
    return require('../../client/src/pages/tracking-detail/ai-tracking-prd.utils') as AiTrackingPrdUtils;
  } catch {
    return {};
  }
}

describe('AI 埋点 PRD 门禁', () => {
  it('需求录入详情页应把 PRD 文档链接标记为必填', () => {
    const requirementStage = SIDEBAR_STAGES.find((stage) => stage.id === 'requirement');
    const requirementLink = requirementStage?.fields.find((field) => field.key === 'requirementLink');

    expect(requirementLink).toEqual(expect.objectContaining({
      label: 'PRD 文档链接',
      required: true,
    }));
  });

  it('缺少 PRD 链接时应直接提示先补充文档', () => {
    const { getAiDraftGenerationBlockReason } = loadAiTrackingPrdUtils();

    expect(getAiDraftGenerationBlockReason).toEqual(expect.any(Function));
    expect(getAiDraftGenerationBlockReason?.('')).toBe('请先提供 PRD 文档链接，再生成 AI 埋点初稿');
    expect(getAiDraftGenerationBlockReason?.('   ')).toBe('请先提供 PRD 文档链接，再生成 AI 埋点初稿');
    expect(getAiDraftGenerationBlockReason?.('https://example.feishu.cn/wiki/test')).toBeNull();
  });
});
