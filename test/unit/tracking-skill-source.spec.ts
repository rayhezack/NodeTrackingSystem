import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadTrackingDesignSkill } from '../../shared/pollo-tracking-policy';
import { TRACKING_SKILL_DOCUMENTS, TRACKING_SKILL_SOURCE_HASH } from '../../shared/tracking-skill.generated';
import { loadTrackingDesignSkill as loadWorkerSkill } from '../../worker/pollo-tracking-governance-skill';
import { loadTrackingDesignSkill as loadServerSkill } from '../../server/modules/ai-tracking/tracking-design-guidelines';

describe('repository tracking Skill delivery', () => {
  it('ships the self-contained single Markdown source without a stale generated copy', () => {
    const sources = {
      'SKILL.md': readFileSync('skills/pollo-tracking-design/SKILL.md', 'utf8').replace(/\r\n/g, '\n'),
    };
    expect(TRACKING_SKILL_DOCUMENTS).toEqual(sources);
    expect(TRACKING_SKILL_SOURCE_HASH).toBe(createHash('sha256').update(JSON.stringify(sources)).digest('hex'));
    expect(Object.keys(TRACKING_SKILL_DOCUMENTS)).toEqual(['SKILL.md']);
    expect(sources['SKILL.md']).not.toMatch(/\]\((?:\.\.\/)?references\//);
  });

  it.each(['planning', 'design'] as const)('loads the same single Skill in both runtimes for %s, with the current stage instruction', (stage) => {
    const text = loadTrackingDesignSkill(stage);
    expect(loadWorkerSkill(stage)).toBe(text);
    expect(loadServerSkill(stage)).toBe(text);
    expect(text).toContain(TRACKING_SKILL_DOCUMENTS['SKILL.md']);
    expect(text).toContain(`执行当前阶段：${stage}`);
    expect(text).toContain(stage === 'planning' ? '只返回复用规划 JSON' : '只返回事件与参数增量 JSON');
  });
});
