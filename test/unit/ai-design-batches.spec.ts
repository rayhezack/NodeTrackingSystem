import { generateDesignBatches } from '../../shared/ai-design-batches';
import type { GovernanceSnapshot, ReusePlan } from '../../shared/official-first-workflow';

const snapshot: GovernanceSnapshot = {
  source: 'web', events: [], contexts: [], commonProps: [], enums: [], fingerprint: 'test',
  counts: { events: 0, params: 0, commonProps: 0, enums: 0 },
};
const plan: ReusePlan = {
  primaryBoard: 'Agent', decisions: Array.from({ length: 8 }, (_, index) => ({
    evtId: `event_${index + 1}`, decision: 'new', reason: 'No existing event', comparedEventIds: [],
  })),
};

describe('batched event design', () => {
  it('covers every planned event exactly once while bounding parallel model calls', async () => {
    let active = 0;
    let peak = 0;
    const pending: Array<() => void> = [];
    const completed: number[] = [];
    const generate = jest.fn(async (prompt: string, batch: number) => {
      active += 1;
      peak = Math.max(peak, active);
      expect(prompt).toContain('完整 PRD 测试');
      await new Promise<void>((resolve) => pending.push(resolve));
      active -= 1;
      const planned = JSON.parse(prompt.split('复用规划：')[1].split('\n')[0]) as ReusePlan;
      expect(planned.decisions).toHaveLength(1);
      expect(planned.decisions[0].evtId).toBe(plan.decisions[batch - 1].evtId);
      return { events: [{ evtId: planned.decisions[0].evtId }] };
    });
    const result = generateDesignBatches(snapshot, plan, { prd: '完整 PRD 测试' }, generate, (count) => completed.push(count));
    expect(generate).toHaveBeenCalledTimes(2);
    pending.shift()!();
    await new Promise((resolve) => setImmediate(resolve));
    expect(generate).toHaveBeenCalledTimes(3);
    while (completed.length < plan.decisions.length) {
      pending.splice(0).forEach((resolve) => resolve());
      await new Promise((resolve) => setImmediate(resolve));
    }
    await expect(result).resolves.toEqual({ events: plan.decisions.map((decision) => ({ evtId: decision.evtId })) });
    expect(peak).toBe(2);
    expect(completed).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('rejects missing, duplicate, or unexpected event IDs rather than saving a partial draft', async () => {
    for (const events of [[], [{ evtId: 'event_1' }, { evtId: 'event_1' }, { evtId: 'event_2' }], [{ evtId: 'unexpected' }]]) {
      await expect(generateDesignBatches(snapshot, plan, {}, async () => ({ events }))).rejects.toThrow('与复用规划不一致');
    }
  });
});
