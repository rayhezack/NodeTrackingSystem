import { TrackingWriteError } from './tracking-write';

type ModelPayload = {
  choices?: Array<{ message?: { content?: string }; delta?: { content?: string }; finish_reason?: string }>;
  error?: { message?: string };
};

export async function requestModelJson(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const request = (omitJsonMode = false) => fetchImpl(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ ...body, stream: true, ...(omitJsonMode ? { response_format: undefined } : {}) }),
    signal: AbortSignal.timeout(300_000),
  });
  try {
    let response = await request();
    let payload: ModelPayload | undefined;
    if (!response.ok) {
      payload = await readError(response);
      if (response.status === 400 && /response[_ -]?format|json mode|json_object|structured output/i.test(payload.error?.message || '')) {
        response = await request(true);
        payload = undefined;
      }
    }
    if (!response.ok) {
      payload ||= await readError(response);
      throw new TrackingWriteError(payload.error?.message || `大模型请求失败（HTTP ${response.status}），请稍后重试`, 502);
    }

    let content = '';
    let finishReason = '';
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      if (!response.body) throw new TrackingWriteError('大模型未返回内容，请重新生成', 502);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let completed = false;
      const consume = (block: string) => {
        const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
        if (!data) return;
        if (data === '[DONE]') { completed = true; return; }
        const chunk = parsePayload(data);
        if (chunk.error?.message) throw new TrackingWriteError(chunk.error.message, 502);
        const choice = chunk.choices?.[0];
        content += choice?.delta?.content || choice?.message?.content || '';
        if (choice?.finish_reason) { finishReason = choice.finish_reason; completed = true; }
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          const blocks = pending.split(/\r?\n\r?\n/);
          pending = blocks.pop() || '';
          blocks.forEach(consume);
          if (done) { if (pending.trim()) consume(pending); break; }
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      if (!completed) throw new TrackingWriteError('大模型生成连接中断，初稿未完成，请重新生成', 502);
    } else {
      payload = parsePayload(await response.text());
      if (payload.error?.message) throw new TrackingWriteError(payload.error.message, 502);
      content = payload.choices?.[0]?.message?.content || '';
      finishReason = payload.choices?.[0]?.finish_reason || '';
    }
    if (finishReason === 'length') throw new TrackingWriteError('AI 初稿超出单次生成长度，请缩小需求范围后重新生成', 502);
    if (!content) throw new TrackingWriteError('大模型未返回可解析内容，请重新生成', 502);
    try { return JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); }
    catch { throw new TrackingWriteError('大模型返回内容不是有效 JSON，请重新生成', 502); }
  } catch (error) {
    if (error instanceof TrackingWriteError) throw error;
    const info = error && typeof error === 'object' ? error as { name?: string; cause?: { code?: string } } : {};
    const isTimeout = /Timeout|Abort/.test(info.name || '') || /TIMEOUT|TIMEDOUT/.test(info.cause?.code || '');
    throw new TrackingWriteError(isTimeout ? 'AI 生成超时，请稍后重试或缩小需求范围' : '大模型服务连接中断，请稍后重试', 502);
  }
}

async function readError(response: Response): Promise<ModelPayload> {
  if ([408, 504, 524].includes(response.status)) {
    await response.body?.cancel();
    throw new TrackingWriteError(`大模型服务响应超时（HTTP ${response.status}），请稍后重试或缩小需求范围`, 502);
  }
  try { return JSON.parse(await response.text()) as ModelPayload; }
  catch { return {}; }
}

function parsePayload(value: string): ModelPayload {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') return parsed as ModelPayload;
  } catch { /* Convert gateway text/HTML into a stable application error. */ }
  throw new TrackingWriteError('大模型网关返回了异常响应，请稍后重试', 502);
}
