import { streamingGenerationResponse } from '../../worker/ai-generation-response';
import { runGenerationStage } from '../../worker/ai-generation-stage';
import { readAiGenerationStream } from '../../client/src/api/ai-generation-stream';

describe('AI generation deadlines and progress', () => {
  afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

  it('ends the response and cancels upstream even when generation ignores abort', async () => {
    jest.useFakeTimers();
    let signal!: AbortSignal;
    const response = streamingGenerationResponse((received, progress) => {
      signal = received;
      progress({ stage: 'planning', message: '对照正式库规划复用' });
      return new Promise(() => undefined);
    }, { format: 'ndjson', timeoutMs: 1000 });
    const updates: string[] = [];
    const pending = readAiGenerationStream(response, (progress) => updates.push(progress.message));
    const rejected = expect(pending).rejects.toThrow('对照正式库规划复用');
    await jest.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(signal.aborted).toBe(true);
    expect(updates).toContain('对照正式库规划复用');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('bounds individual stage waits and names the failing stage', async () => {
    jest.useFakeTimers();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let signal!: AbortSignal;
    const pending = runGenerationStage('读取 PRD 正文', 1000, (received) => {
      signal = received;
      return new Promise(() => undefined);
    });
    const rejected = expect(pending).rejects.toThrow('读取 PRD 正文');
    await jest.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('streams progress before the final draft and accepts UTF-8 split between chunks', async () => {
    const updates: string[] = [];
    const text = [
      { type: 'progress', stage: 'prd', message: '读取正文', elapsedMs: 2 },
      { type: 'heartbeat', elapsedMs: 10000 },
      { type: 'result', data: { draft: { id: 'draft-1' } } },
    ].map((value) => JSON.stringify(value)).join('\n');
    const bytes = new TextEncoder().encode(text);
    const response = new Response(new ReadableStream({ start(controller) {
      bytes.forEach((byte) => controller.enqueue(new Uint8Array([byte])));
      controller.close();
    } }), { headers: { 'content-type': 'application/x-ndjson' } });
    await expect(readAiGenerationStream(response, (value) => updates.push(`${value.message}:${value.elapsedMs}`)))
      .resolves.toEqual({ draft: { id: 'draft-1' } });
    expect(updates).toEqual(['读取正文:2', '读取正文:10000']);
  });

  it('rejects a disconnected stream instead of reporting success for HTTP 200', async () => {
    const response = new Response('{"type":"heartbeat"}\n', { headers: { 'content-type': 'application/x-ndjson' } });
    await expect(readAiGenerationStream(response)).rejects.toThrow('初稿未完成');
  });

  it('keeps the legacy JSON protocol usable and clears deadline timers on success', async () => {
    jest.useFakeTimers();
    const response = streamingGenerationResponse(async () => ({ draft: { id: 'legacy' } }));
    await expect(readAiGenerationStream(response)).resolves.toEqual({ draft: { id: 'legacy' } });
    expect(jest.getTimerCount()).toBe(0);
  });
});
