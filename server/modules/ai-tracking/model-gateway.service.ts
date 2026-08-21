import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface KimiResponse {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  error?: { message?: string };
}

interface KimiStreamChunk {
  choices?: Array<{
    delta?: { content?: string };
    message?: { content?: string | Array<{ text?: string }> };
  }>;
  error?: { message?: string };
}

export interface ModelGenerationOptions {
  onProgress?: (stage: 'connected' | 'completed') => void;
}

@Injectable()
export class ModelGatewayService {
  private readonly logger = new Logger(ModelGatewayService.name);

  get status() {
    return {
      configured: Boolean(this.apiKey),
      missingKeys: this.apiKey ? [] : ['KIMI_API_KEY'],
      provider: 'kimi' as const,
      model: this.model,
      reasoningEffort: this.reasoningEffort,
      wireApi: 'chat/completions' as const,
    };
  }

  async generateJson(messages: ChatMessage[], options: ModelGenerationOptions = {}): Promise<unknown> {
    if (!this.apiKey) {
      throw new BadRequestException('未配置 KIMI_API_KEY');
    }

    const startedAt = Date.now();
    const requestId = randomRequestId();
    const body = buildKimiBody(messages, this.model, this.reasoningEffort);
    this.logger.log(JSON.stringify({
      message: 'AI model request started',
      requestId,
      provider: 'kimi',
      model: this.model,
      reasoningEffort: this.reasoningEffort,
      wireApi: 'chat/completions',
      inputChars: messages.reduce((total, message) => total + message.content.length, 0),
    }));

    let response: Response;
    try {
      response = await this.request(body);
    } catch (error) {
      this.logger.error(JSON.stringify({
        message: 'AI model request failed before response',
        requestId,
        durationMs: Date.now() - startedAt,
        error: describeModelError(error),
      }));
      throw modelNetworkError(error);
    }
    options.onProgress?.('connected');

    let rawBody = await readResponseBody(response, requestId, startedAt, this.logger);
    let parsedResponse = parseKimiResponse(rawBody, response.headers.get('content-type'));
    let payload = parsedResponse.payload;

    // Some Kimi-compatible gateways do not implement JSON mode. Retry once
    // without response_format, while keeping Kimi's model-specific reasoning setting.
    if (!response.ok && isJsonModeCompatibilityError(response.status, payload)) {
      this.logger.warn(JSON.stringify({
        message: 'Kimi gateway rejected JSON mode; retrying without response_format',
        requestId,
        status: response.status,
      }));
      try {
        response = await this.request(buildKimiBody(messages, this.model, this.reasoningEffort, true));
      } catch (error) {
        throw modelNetworkError(error);
      }
      rawBody = await readResponseBody(response, requestId, startedAt, this.logger);
      parsedResponse = parseKimiResponse(rawBody, response.headers.get('content-type'));
      payload = parsedResponse.payload;
    }

    if (!response.ok) {
      this.logger.error(JSON.stringify({
        message: 'AI model request returned an error',
        requestId,
        durationMs: Date.now() - startedAt,
        status: response.status,
        providerRequestId: response.headers.get('x-request-id') || '',
        errorMessage: payload.error?.message || '',
      }));
      throw new ServiceUnavailableException(
        parsedResponse.errorMessage || payload.error?.message || `大模型请求失败（HTTP ${response.status}）`,
      );
    }

    if (parsedResponse.errorMessage) {
      throw new ServiceUnavailableException(parsedResponse.errorMessage);
    }
    const content = parsedResponse.content || extractContent(payload);
    if (!content) throw new ServiceUnavailableException('大模型未返回可解析内容');
    try {
      const parsed = JSON.parse(stripCodeFence(content));
      options.onProgress?.('completed');
      this.logger.log(JSON.stringify({
        message: 'AI model request completed',
        requestId,
        durationMs: Date.now() - startedAt,
        responseChars: content.length,
      }));
      return parsed;
    } catch {
      this.logger.error(JSON.stringify({
        message: 'AI model returned invalid JSON',
        requestId,
        durationMs: Date.now() - startedAt,
        responseChars: content.length,
      }));
      throw new ServiceUnavailableException('大模型返回内容不是有效 JSON，请重新生成');
    }
  }

  private request(body: Record<string, unknown>) {
    return fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });
  }

  private get apiKey(): string {
    return process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || '';
  }

  private get baseUrl(): string {
    return (process.env.AI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, '');
  }

  private get model(): string {
    return process.env.AI_MODEL || 'kimi-k3';
  }

  private get reasoningEffort(): 'low' {
    return 'low';
  }
}

function buildKimiBody(
  messages: ChatMessage[],
  model: string,
  reasoningEffort: string,
  omitJsonMode = false,
): Record<string, unknown> {
  return {
    model,
    messages,
    reasoning_effort: reasoningEffort,
    max_completion_tokens: 12_000,
    stream: true,
    ...(omitJsonMode ? {} : { response_format: { type: 'json_object' } }),
  };
}

function extractContent(payload: KimiResponse): string | undefined {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => part.text || '').join('');
  }
  return undefined;
}

function parseModelResponse(value: string): KimiResponse {
  try {
    return JSON.parse(value) as KimiResponse;
  } catch {
    return {};
  }
}

function parseKimiResponse(value: string, contentType: string | null): {
  content?: string;
  errorMessage?: string;
  payload: KimiResponse;
} {
  if (!contentType?.toLowerCase().includes('text/event-stream')) {
    return { payload: parseModelResponse(value) };
  }

  let content = '';
  let errorMessage: string | undefined;
  let payload: KimiResponse = {};

  for (const block of value.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n');
    if (!data || data === '[DONE]') continue;

    try {
      const chunk = JSON.parse(data) as KimiStreamChunk;
      if (chunk.error?.message) {
        errorMessage = chunk.error.message;
        payload = { error: chunk.error };
        continue;
      }
      const choice = chunk.choices?.[0];
      if (typeof choice?.delta?.content === 'string') content += choice.delta.content;
      if (choice?.message) payload = { choices: [{ message: choice.message }] };
    } catch {
      // Ignore non-JSON heartbeat events.
    }
  }

  return { content: content || undefined, errorMessage, payload };
}

function isJsonModeCompatibilityError(status: number, payload: KimiResponse): boolean {
  if (status !== 400) return false;
  const message = payload.error?.message?.toLowerCase() || '';
  return /(response[_ -]?format|json mode|json_object|structured output)/.test(message);
}

async function readResponseBody(
  response: Response,
  requestId: string,
  startedAt: number,
  logger: Logger,
): Promise<string> {
  logger.log(JSON.stringify({
    message: 'AI model response headers received',
    requestId,
    durationMs: Date.now() - startedAt,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    providerRequestId: response.headers.get('x-request-id') || '',
  }));
  try {
    return await response.text();
  } catch (error) {
    logger.error(JSON.stringify({
      message: 'AI model response body failed',
      requestId,
      durationMs: Date.now() - startedAt,
      error: describeModelError(error),
    }));
    throw modelNetworkError(error);
  }
}

function modelNetworkError(error: unknown): ServiceUnavailableException {
  const cause = error instanceof Error ? error.cause : undefined;
  const code = typeof cause === 'object' && cause !== null && 'code' in cause
    ? String((cause as { code?: unknown }).code)
    : error instanceof Error && 'code' in error
      ? String((error as Error & { code?: unknown }).code)
      : '';

  const name = error instanceof Error ? error.name : '';
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ABORT_ERR' || name === 'TimeoutError') {
    return new ServiceUnavailableException('大模型服务连接超时，请稍后重试或联系管理员检查 Kimi 配置');
  }
  if (['UND_ERR_SOCKET', 'ECONNRESET', 'EPIPE', 'ECONNREFUSED', 'ENETUNREACH', 'ENOTFOUND'].includes(code)) {
    return new ServiceUnavailableException('Kimi 服务连接中断，请稍后重试或联系管理员检查 Kimi 服务稳定性');
  }
  return new ServiceUnavailableException('Kimi 大模型服务暂时不可用，请稍后重试');
}

function describeModelError(error: unknown): Record<string, string> {
  const cause = error instanceof Error ? error.cause : undefined;
  const causeRecord = typeof cause === 'object' && cause !== null ? cause as Record<string, unknown> : {};
  return {
    name: error instanceof Error ? error.name : 'unknown',
    message: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
    code: String((error as { code?: unknown })?.code || ''),
    causeCode: String(causeRecord.code || ''),
    causeName: String(causeRecord.name || ''),
  };
}

function randomRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
