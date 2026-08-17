export const MISSING_PRD_GENERATION_MESSAGE = '请先提供 PRD 文档链接，再生成 AI 埋点初稿';

export function getAiDraftGenerationBlockReason(requirementLink: string): string | null {
  return requirementLink.trim() ? null : MISSING_PRD_GENERATION_MESSAGE;
}
