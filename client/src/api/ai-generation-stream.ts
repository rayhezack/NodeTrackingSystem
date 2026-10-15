import type { AiTrackingGenerationProgress, GenerateAiTrackingDraftResponse } from '../../../shared/api.interface';

export async function readAiGenerationStream(
  response: Response,
  onProgress: (progress: AiTrackingGenerationProgress) => void = () => undefined,
): Promise<GenerateAiTrackingDraftResponse> {
  if (!response.ok) {
    let message = `AI 生成服务请求失败（HTTP ${response.status}）`;
    try {
      const payload = await response.json();
      if (typeof payload.message === 'string') message = payload.message;
    } catch { /* Gateway HTML must not be shown as an application/parser error. */ }
    throw new Error(message);
  }
  // Local Nest development still returns the original JSON response.
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('AI 生成网关返回异常，请重试'); }
    if (payload.generationError) throw new Error(payload.message || 'AI 生成失败');
    if (!payload.draft) throw new Error('AI 生成接口返回异常，请重试');
    return payload;
  }
  if (!response.body) throw new Error('AI 生成连接未建立，请重试');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result: GenerateAiTrackingDraftResponse | undefined;
  let progress: AiTrackingGenerationProgress | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    let payload;
    try { payload = JSON.parse(line); }
    catch { throw new Error('AI 生成连接返回异常，请重试'); }
    if (payload.type === 'error') throw new Error(payload.message || 'AI 生成失败，请重试');
    if (payload.type === 'progress') { progress = payload; onProgress(payload); }
    if (payload.type === 'heartbeat' && progress) onProgress({ ...progress, elapsedMs: payload.elapsedMs });
    if (payload.type === 'result') {
      if (!payload.data?.draft) throw new Error('AI 生成接口返回异常，请重试');
      result = payload.data;
    }
  };
  try {
    while (!result) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      lines.forEach(consume);
      if (done) {
        if (pending.trim()) consume(pending);
        break;
      }
    }
  } finally {
    // Do not wait forever for a broken transport to acknowledge cancellation.
    void reader.cancel().catch(() => undefined);
  }
  if (!result) throw new Error('AI 生成连接中断，初稿未完成，请重试');
  return result;
}
