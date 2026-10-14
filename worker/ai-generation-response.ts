import { TrackingWriteError } from './tracking-write';

// Whitespace is valid before a JSON document. Send it periodically while the
// request is alive; Workers background work after a response is time limited.
export function streamingGenerationResponse(generate: (signal: AbortSignal) => Promise<unknown>): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  let heartbeat: ReturnType<typeof setInterval>;
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(' '));
      heartbeat = setInterval(() => { if (open) controller.enqueue(encoder.encode(' ')); }, 10_000);
      const run = async () => {
        let payload: unknown;
        try { payload = await generate(AbortSignal.any([abort.signal, AbortSignal.timeout(300_000)])); }
        catch (error) {
          payload = { generationError: true, status: error instanceof TrackingWriteError ? error.status : 502,
            message: error instanceof TrackingWriteError ? error.message : 'AI 生成服务暂时不可用，请稍后重试' };
        }
        clearInterval(heartbeat);
        if (open) {
          open = false;
          controller.enqueue(encoder.encode(JSON.stringify(payload)));
          controller.close();
        }
      };
      void run();
    },
    cancel() { open = false; clearInterval(heartbeat); abort.abort(); },
  });
  return new Response(stream, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, no-transform', 'x-accel-buffering': 'no' } });
}
