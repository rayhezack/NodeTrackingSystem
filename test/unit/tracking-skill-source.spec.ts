import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadTrackingDesignSkill } from '../../shared/pollo-tracking-policy';
import { TRACKING_SKILL_DOCUMENTS, TRACKING_SKILL_SOURCE_HASH } from '../../shared/tracking-skill.generated';
import { loadTrackingDesignSkill as loadWorkerSkill } from '../../worker/pollo-tracking-governance-skill';
import { loadTrackingDesignSkill as loadServerSkill } from '../../server/modules/ai-tracking/tracking-design-guidelines';

describe('repository tracking Skill delivery', () => {
  it('ships the actual Markdown sources without omitting references or using a stale generated copy', () => {
    const sources = Object.fromEntries(Object.keys(TRACKING_SKILL_DOCUMENTS).map((path) => [path,
      readFileSync(`skills/pollo-tracking-design/${path}`, 'utf8').replace(/\r\n/g, '\n'),
    ]));
    expect(TRACKING_SKILL_DOCUMENTS).toEqual(sources);
    expect(TRACKING_SKILL_SOURCE_HASH).toBe(createHash('sha256').update(JSON.stringify(sources)).digest('hex'));
    const links = [...sources['SKILL.md'].matchAll(/\]\((references\/[^)]+)\)/g)].map((match) => match[1]);
    expect(new Set(links)).toEqual(new Set(Object.keys(sources).filter((path) => path !== 'SKILL.md')));
  });

  it.each(['planning', 'design'] as const)('loads the same Skill in both runtimes for %s, with only the current stage protocol', (stage) => {
    const text = loadTrackingDesignSkill(stage);
    expect(loadWorkerSkill(stage)).toBe(text);
    expect(loadServerSkill(stage)).toBe(text);
    expect(text).toContain(TRACKING_SKILL_DOCUMENTS['SKILL.md']);
    expect(text).toContain(TRACKING_SKILL_DOCUMENTS['references/reuse-contract.md']);
    expect(text).toContain(TRACKING_SKILL_DOCUMENTS[`references/${stage}.md`]);
    const other = stage === 'planning' ? 'design' : 'planning';
    expect(text).not.toContain(TRACKING_SKILL_DOCUMENTS[`references/${other}.md`]);
  });
});
