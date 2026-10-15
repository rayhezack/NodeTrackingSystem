import { generateDesignBatches } from '../../shared/ai-design-batches';
import type { GovernanceSnapshot, ReusePlan } from '../../shared/official-first-workflow';
import { enforceGovernance, GovernanceValidationError } from '../../shared/official-first-workflow';
import type { AiTrackingDraftEvent, OfficialEvent } from '../../shared/api.interface';

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

  it('repairs a changed formal required condition once and only counts the validated event', async () => {
    const official: OfficialEvent = { recordId: 'web:template', source: 'web', evtId: 'creation_template_click',
      eventName: '模板点击', platform: 'Web', version: '1', status: '已上线', paramLink: '', triggerTiming: '点击时' };
    const library: GovernanceSnapshot = { ...snapshot, events: [official], contexts: [{ event: official, params: [{
      paramKey: 'creation_template_click.button_name', paramName: 'button_name', paramType: 'STRING',
      required: true, requiredRule: '必传', triggerCondition: '', definition: '按钮名', example: 'recreate', status: '正式',
    }] }] };
    const one: ReusePlan = { primaryBoard: '模板使用', decisions: [{ evtId: official.evtId, decision: 'reuse', reason: '复用模板点击', comparedEventIds: [official.evtId] }] };
    const event: AiTrackingDraftEvent = { clientId: 'test', evtId: official.evtId, eventName: official.eventName,
      eventDefinition: '模板点击', triggerTiming: '点击时', metricScenario: '', priority: 'P0', platform: 'Web', handler: '前端',
      commonProps: '', version: '1', minVersion: '1', changeType: '修改', evidence: [], uncertainties: [],
      params: [{ paramName: 'button_name', paramType: 'STRING', requiredRule: '必传', triggerCondition: '仅 Motion 模板点击时',
        enumRange: '', definition: '按钮名', defaultValue: '', example: 'recreate', platform: 'Web', source: 'ai', uncertainties: [] }] };
    const repaired = { ...event, params: [{ ...event.params[0], triggerCondition: '' }] };
    const generate = jest.fn().mockResolvedValueOnce({ events: [event] }).mockResolvedValueOnce({ events: [repaired] });
    const onComplete = jest.fn();
    await expect(generateDesignBatches(library, one, { prd: '完整正文' }, generate, onComplete,
      (raw, batchPlan) => { enforceGovernance((raw as { events: AiTrackingDraftEvent[] }).events, library, batchPlan); }))
      .resolves.toEqual({ events: [repaired] });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain('参数必传条件冲突：creation_template_click.button_name');
    expect(generate.mock.calls[1][0]).toContain('完整正文');
    expect(generate.mock.calls[1][4]).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('stops after one failed repair and aborts outstanding work', async () => {
    const one = { ...plan, decisions: plan.decisions.slice(0, 1) };
    const generate = jest.fn().mockResolvedValue({ events: [{ evtId: 'event_1' }] });
    const onComplete = jest.fn();
    await expect(generateDesignBatches(snapshot, one, {}, generate, onComplete,
      () => { throw new GovernanceValidationError('参数类型冲突'); })).rejects.toThrow('参数类型冲突');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][3].aborted).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not retry model connection or deadline failures', async () => {
    const generate = jest.fn().mockRejectedValue(new Error('model timeout'));
    await expect(generateDesignBatches(snapshot, { ...plan, decisions: plan.decisions.slice(0, 1) }, {}, generate))
      .rejects.toThrow('model timeout');
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
