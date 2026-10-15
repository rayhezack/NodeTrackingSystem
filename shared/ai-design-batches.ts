import { designPrompt, GovernanceValidationError, type GovernanceSnapshot, type ReusePlan } from './official-first-workflow';

/** Every planned event is designed; only the output workload is split. */
export async function generateDesignBatches(
  snapshot: GovernanceSnapshot,
  plan: ReusePlan,
  requirement: unknown,
  generate: (prompt: string, batch: number, total: number, signal: AbortSignal) => Promise<unknown>,
  onComplete: (completed: number, total: number) => void = () => undefined,
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
        const raw = await generate(designPrompt(snapshot, batches[index], requirement), index + 1, batches.length, abort.signal);
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
