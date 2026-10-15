import { TrackingWriteError } from './tracking-write';
import { GovernanceValidationError } from '../shared/official-first-workflow';

/** Bound the wait even when an upstream operation does not honour cancellation. */
export async function runGenerationStage<T>(label: string, timeoutMs: number, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new DOMException('Stage deadline exceeded', 'TimeoutError'));
      reject(new TrackingWriteError(`${label}超时，请重试；若持续失败，请联系管理员检查该阶段日志`, 504));
    }, timeoutMs);
  });
  const startedAt = Date.now();
  try {
    const result = await Promise.race([Promise.resolve().then(() => task(controller.signal)), deadline]);
    console.info(JSON.stringify({ component: 'ai-generation', stage: label, status: 'completed', durationMs: Date.now() - startedAt }));
    return result;
  } catch (error) {
    console.error(JSON.stringify({ component: 'ai-generation', stage: label, status: 'failed', durationMs: Date.now() - startedAt }));
    if (error instanceof GovernanceValidationError) throw error;
    if (error instanceof TrackingWriteError) throw new TrackingWriteError(`${label}：${error.message}`, error.status);
    throw new TrackingWriteError(`${label}失败，请重试；若持续失败，请联系管理员检查该阶段日志`, 502);
  } finally {
    clearTimeout(timer!);
  }
}
