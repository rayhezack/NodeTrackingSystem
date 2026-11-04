import { TRACKING_SKILL_DOCUMENTS, TRACKING_SKILL_SOURCE_HASH } from './tracking-skill.generated';

/** Load the single repository Skill source for the requested workflow stage. */
export function loadTrackingDesignSkill(stage: 'planning' | 'design'): string {
  return [
    `已加载单文件 Skill：pollo-tracking-design（来源版本 ${TRACKING_SKILL_SOURCE_HASH}）。执行当前阶段：${stage}。`,
    `--- Skill 源文件：skills/pollo-tracking-design/SKILL.md ---\n${TRACKING_SKILL_DOCUMENTS['SKILL.md']}`,
    stage === 'planning'
      ? '当前仅执行 Skill 中“阶段一：复用规划”协议，只返回复用规划 JSON，不生成参数。'
      : '当前仅执行 Skill 中“阶段二：设计增量”协议，只返回事件与参数增量 JSON，不重新规划或增加事件。',
  ].join('\n\n');
}
