import { requestModelJson } from '../../worker/ai-model';
import { streamingGenerationResponse } from '../../worker/ai-generation-response';
import { TrackingWriteError } from '../../worker/tracking-write';

const url = 'https://model.example.test/v1/chat/completions';
const body = { model: 'test-model', response_format: { type: 'json_object' } };

describe('production AI model responses', () => {
  it('reports plaintext 524 as a timeout instead of a JSON syntax error', async () => {
    const mock = jest.fn().mockResolvedValue(new Response('error code: 524', { status: 524 }));
    await expect(requestModelJson(url, 'test-key', body, mock)).rejects.toThrow('大模型服务响应超时（HTTP 524）');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('does not leak HTML or parser errors for non-JSON gateway failures', async () => {
    const mock = jest.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(requestModelJson(url, 'test-key', body, mock)).rejects.toThrow('大模型请求失败（HTTP 502）');
  });

  it('does not retry unrelated 400 errors', async () => {
    const mock = jest.fn().mockResolvedValue(Response.json({ error: { message: 'Invalid model' } }, { status: 400 }));
    await expect(requestModelJson(url, 'test-key', body, mock)).rejects.toThrow('Invalid model');
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it('falls back without JSON mode only for a compatibility error', async () => {
    const mock = jest.fn()
      .mockResolvedValueOnce(Response.json({ error: { message: 'response_format unsupported' } }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '{"events":[]}' } }] }));
    await expect(requestModelJson(url, 'test-key', body, mock)).resolves.toEqual({ events: [] });
    const fallback = JSON.parse(mock.mock.calls[1][1].body);
    expect(fallback.stream).toBe(true);
    expect(fallback.response_format).toBeUndefined();
  });

  it('consumes UTF-8 SSE split across network chunks and CRLF boundaries', async () => {
    const text = 'data: {"choices":[{"delta":{"content":"{\\\"summary\\\":\\\"中文\\\""}}]}\r\n\r\n' +
      'data: {"choices":[{"delta":{"content":"}"},"finish_reason":"stop"}]}\r\n\r\n' + 'data: [DONE]\r\n\r\n';
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
      controller.close();
    } });
    const mock = jest.fn().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
    await expect(requestModelJson(url, 'test-key', body, mock)).resolves.toEqual({ summary: '中文' });
    expect(JSON.parse(mock.mock.calls[0][1].body).stream).toBe(true);
  });

  it('rejects a prematurely closed stream even if the partial JSON is valid', async () => {
    const mock = jest.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"{}"}}]}\n\n', { headers: { 'content-type': 'text/event-stream' } }));
    await expect(requestModelJson(url, 'test-key', body, mock)).rejects.toThrow('初稿未完成');
  });

  it('finishes at the model completion marker even if the upstream socket never closes', async () => {
    const cancel = jest.fn(() => new Promise<void>(() => undefined));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"{}"},"finish_reason":"stop"}]}\n\n'));
      }, cancel,
    });
    const mock = jest.fn().mockResolvedValue(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
    await expect(requestModelJson(url, 'test-key', body, mock)).resolves.toEqual({});
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects length-truncated output and maps connection timeouts', async () => {
    const mock = jest.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '{}' }, finish_reason: 'length' }] }));
    await expect(requestModelJson(url, 'test-key', body, mock)).rejects.toThrow('超出单次生成长度');
    mock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(requestModelJson(url, 'test-key', body, mock)).rejects.toThrow('AI 生成超时');
  });
});

describe('AI response connection lifecycle', () => {
  afterEach(() => jest.useRealTimers());

  it('sends headers and keepalives while generation is pending, then returns valid JSON', async () => {
    jest.useFakeTimers();
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => { resolve = done; });
    const response = streamingGenerationResponse(() => pending);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(' ');
    jest.advanceTimersByTime(10_000);
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(' ');
    resolve({ draft: { id: 'draft-1' } });
    const value = new TextDecoder().decode((await reader.read()).value);
    expect(JSON.parse(value)).toEqual({ draft: { id: 'draft-1' } });
    expect((await reader.read()).done).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('returns a structured error when generation fails after headers are sent', async () => {
    const response = streamingGenerationResponse(async () => { throw new TrackingWriteError('模型响应超时', 502); });
    await expect(response.json()).resolves.toEqual({ generationError: true, status: 502, message: '模型响应超时' });
  });

  it('cancels upstream requests and heartbeat when the client disconnects', async () => {
    jest.useFakeTimers();
    let signal!: AbortSignal;
    let resolve!: (value: unknown) => void;
    const response = streamingGenerationResponse((received) => { signal = received; return new Promise((done) => { resolve = done; }); });
    await response.body!.cancel();
    expect(signal.aborted).toBe(true);
    resolve({ draft: {} });
    await Promise.resolve();
    expect(jest.getTimerCount()).toBe(0);
  });
});
