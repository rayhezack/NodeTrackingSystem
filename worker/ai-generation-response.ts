import type { AiTrackingGenerationProgress } from '../shared/api.interface';
import { TrackingWriteError } from './tracking-write';

export const GENERATION_TIMEOUT_MS = 600_000;
type Progress = (value: AiTrackingGenerationProgress) => void;

// Keep the legacy whitespace/JSON protocol for existing open browser tabs.
export function streamingGenerationResponse(
  generate: (signal: AbortSignal, progress: Progress) => Promise<unknown>,
  options: { format?: 'json' | 'ndjson'; timeoutMs?: number } = {},
): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const ndjson = options.format === 'ndjson';
  const startedAt = Date.now();
  let heartbeat: ReturnType<typeof setInterval>;
  let deadline: ReturnType<typeof setTimeout>;
  let open = true;
  let stage = '准备生成';
  const cleanup = () => { clearInterval(heartbeat); clearTimeout(deadline); };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: unknown) => {
        if (open) controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
      };
      const finish = (value: unknown) => {
        if (!open) return;
        cleanup();
        controller.enqueue(encoder.encode(JSON.stringify(value) + (ndjson ? '\n' : '')));
        open = false;
        controller.close();
      };
      const fail = (message: string, status: number) => {
        finish(ndjson ? { type: 'error', message, status, stage } : { generationError: true, message, status });
        abort.abort();
      };
      const progress: Progress = (value) => {
        if (!open) return;
        stage = value.message;
        if (ndjson) send({ ...value, type: 'progress', elapsedMs: Date.now() - startedAt });
      };
      if (ndjson) progress({ stage: 'preparing', message: '准备生成' });
      else controller.enqueue(encoder.encode(' '));
      heartbeat = setInterval(() => {
        if (!open) return;
        if (ndjson) send({ type: 'heartbeat', elapsedMs: Date.now() - startedAt });
        else controller.enqueue(encoder.encode(' '));
      }, 10_000);
      deadline = setTimeout(() => {
        // AbortSignal alone does not settle a promise that ignores cancellation.
        fail(`AI 生成超过总时限（当前阶段：${stage}），本次已停止，请重试`, 504);
        abort.abort(new DOMException('Generation deadline exceeded', 'TimeoutError'));
      }, options.timeoutMs ?? GENERATION_TIMEOUT_MS);
      // Invoke synchronously so disconnects can cancel upstream work immediately.
      let pending: Promise<unknown>;
      try { pending = generate(abort.signal, progress); }
      catch (error) { pending = Promise.reject(error); }
      void pending.then(
        (value) => finish(ndjson ? { type: 'result', data: value } : value),
        (error) => fail(error instanceof TrackingWriteError ? error.message : `AI 生成失败（当前阶段：${stage}），请重试`, error instanceof TrackingWriteError ? error.status : 502),
      );
    },
    cancel() { open = false; cleanup(); abort.abort(); },
  });
  return new Response(stream, { headers: { 'content-type': ndjson ? 'application/x-ndjson; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' } });
}
