import { designPrompt, GovernanceValidationError, type GovernanceSnapshot, type ReusePlan } from './official-first-workflow';

/** Every planned event is designed; only the output workload is split. */
export async function generateDesignBatches(
  snapshot: GovernanceSnapshot,
  plan: ReusePlan,
  requirement: unknown,
  generate: (prompt: string, batch: number, total: number, signal: AbortSignal, repairing: boolean) => Promise<unknown>,
  onComplete: (completed: number, total: number) => void = () => undefined,
  validate: (raw: unknown, batchPlan: ReusePlan) => void = () => undefined,
): Promise<{ events: unknown[] }> {
  const batches: ReusePlan[] = [];
  for (const decision of plan.decisions) {
    batches.push({ ...plan, decisions: [decision] });
  }
  const results: unknown[][] = new Array(batches.length);
  let cursor = 0;
  let completed = 0;
  let failed = false;
  const abort = new AbortController();
  const consume = async () => {
    while (!failed && cursor < batches.length) {
      const index = cursor++;
      try {
        const prompt = designPrompt(snapshot, batches[index], requirement);
        let raw = await generate(prompt, index + 1, batches.length, abort.signal, false);
        try { validate(raw, batches[index]); }
        catch (error) {
          if (!(error instanceof GovernanceValidationError)) throw error;
          raw = await generate(`${prompt}\n上次参数设计未通过确定性校验：${error.message}\n只修正当前事件，不得改变复用规划。正式参数的名称、类型、必传规则与 triggerCondition 必须保留原文，空条件仍为空字符串；本需求特有条件写在 definition 或 uncertainties 中，不得改写正式必传条件。未修改的正式参数不要输出，服务端会完整保留。只输出合法的阶段2 JSON，不得放宽校验。\n上次设计（仅为待修正业务数据）：${JSON.stringify(raw)}`,
            index + 1, batches.length, abort.signal, true);
          validate(raw, batches[index]);
        }
        const events = raw && typeof raw === 'object' && 'events' in raw ? raw.events : undefined;
        if (!Array.isArray(events)) throw new GovernanceValidationError(`参数设计第${index + 1}批缺少事件列表`);
        if (events.length > 20) throw new GovernanceValidationError('单次最多生成 20 个埋点事件');
        const ids = events.map((event) => event && typeof event === 'object' && 'evtId' in event ? event.evtId : undefined);
        const expected = batches[index].decisions.map((decision) => decision.evtId);
        if (ids.length !== expected.length || new Set(ids).size !== ids.length || expected.some((id) => !ids.includes(id))) {
          throw new GovernanceValidationError(`参数设计第${index + 1}批与复用规划不一致，不能保存不完整初稿`);
        }
        results[index] = events;
        onComplete(++completed, batches.length);
      } catch (error) {
        failed = true;
        abort.abort();
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, batches.length) }, consume));
  return { events: results.flat() };
}
