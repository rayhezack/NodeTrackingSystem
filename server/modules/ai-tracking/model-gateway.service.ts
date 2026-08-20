import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface ModelResponse {
  choices?: Array<{ message?: { content?: string } }>;
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string }>;
  }>;
  error?: { message?: string };
}

@Injectable()
export class ModelGatewayService {
  get status() {
    return {
      configured: Boolean(this.apiKey),
      missingKeys: this.apiKey ? [] : ['OPENAI_API_KEY'],
      provider: 'openai' as const,
      model: this.model,
      reasoningEffort: this.reasoningEffort,
      wireApi: this.wireApi,
    };
  }

  async generateJson(messages: ChatMessage[]): Promise<unknown> {
    if (!this.apiKey) {
      throw new BadRequestException('未配置 OPENAI_API_KEY');
    }
    const body = this.wireApi === 'responses'
      ? buildResponsesBody(messages, this.model, this.reasoningEffort)
      : buildChatBody(messages, this.model, this.reasoningEffort);

    let response: Response;
    try {
      response = await this.request(body);
    } catch (error) {
      throw modelNetworkError(error);
    }

    const payload = (await response.json().catch(() => ({}))) as ModelResponse;
    if (!response.ok) {
      throw new ServiceUnavailableException(payload.error?.message || `大模型请求失败（HTTP ${response.status}）`);
    }
    const content = extractContent(payload);
    if (!content) throw new ServiceUnavailableException('大模型未返回可解析内容');
    try {
      return JSON.parse(stripCodeFence(content));
    } catch {
      throw new ServiceUnavailableException('大模型返回内容不是有效 JSON，请重新生成');
    }
  }

  private request(body: Record<string, unknown>) {
    return fetch(`${this.baseUrl}/${this.wireApi}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  }

  private get apiKey(): string {
    return process.env.OPENAI_API_KEY || '';
  }

  private get baseUrl(): string {
    return (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  }

  private get model(): string {
    return process.env.AI_MODEL || 'gpt-5.5';
  }

  private get reasoningEffort(): string {
    return process.env.AI_REASONING_EFFORT || 'xhigh';
  }

  private get wireApi(): 'responses' | 'chat/completions' {
    return process.env.AI_WIRE_API === 'chat/completions' ? 'chat/completions' : 'responses';
  }
}

function buildResponsesBody(
  messages: ChatMessage[],
  model: string,
  reasoningEffort: string,
): Record<string, unknown> {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const input = messages
    .filter((message) => message.role === 'user')
    .map((message) => ({
      role: 'user',
      content: [{ type: 'input_text', text: message.content }],
    }));

  return {
    model,
    ...(instructions ? { instructions } : {}),
    input,
    reasoning: { effort: reasoningEffort },
    text: { format: { type: 'json_object' } },
  };
}

function buildChatBody(
  messages: ChatMessage[],
  model: string,
  reasoningEffort: string,
): Record<string, unknown> {
  return {
    model,
    messages,
    temperature: 0.1,
    response_format: { type: 'json_object' },
    reasoning_effort: reasoningEffort,
  };
}

function extractContent(payload: ModelResponse): string | undefined {
  if (typeof payload.output_text === 'string') return payload.output_text;

  const outputText = payload.output
    ?.flatMap((item) => item.content || [])
    .map((content) => content.text)
    .find((text): text is string => Boolean(text));
  if (outputText) return outputText;

  return payload.choices?.[0]?.message?.content;
}

function modelNetworkError(error: unknown): ServiceUnavailableException {
  const cause = error instanceof Error ? error.cause : undefined;
  const code = typeof cause === 'object' && cause !== null && 'code' in cause
    ? String((cause as { code?: unknown }).code)
    : error instanceof Error && 'code' in error
      ? String((error as Error & { code?: unknown }).code)
      : '';

  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ABORT_ERR') {
    return new ServiceUnavailableException('大模型服务连接超时，请稍后重试或联系管理员检查 AI 中转站配置');
  }
  return new ServiceUnavailableException('大模型服务暂时不可用，请稍后重试');
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
