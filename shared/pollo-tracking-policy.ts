import { TRACKING_SKILL_DOCUMENTS, TRACKING_SKILL_SOURCE_HASH } from './tracking-skill.generated';

/** Load the repository Skill and the references required by this workflow stage. */
export function loadTrackingDesignSkill(stage: 'planning' | 'design'): string {
  const paths = ['SKILL.md', 'references/reuse-contract.md', `references/${stage}.md`] as const;
  return [
    `已加载 Skill：pollo-tracking-design（来源版本 ${TRACKING_SKILL_SOURCE_HASH}）。执行当前阶段：${stage}。`,
    ...paths.map((path) => `--- Skill 文件：${path} ---\n${TRACKING_SKILL_DOCUMENTS[path]}`),
  ].join('\n\n');
}
