import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
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
    };
  }

  async generateJson(messages: ChatMessage[]): Promise<unknown> {
    if (!this.apiKey) {
      throw new BadRequestException('未配置 OPENAI_API_KEY');
    }
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      reasoning_effort: this.reasoningEffort,
    };

    let response = await this.request(body);
    if (!response.ok && response.status === 400) {
      delete body.response_format;
      response = await this.request(body);
    }
    const payload = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
    if (!response.ok) {
      throw new ServiceUnavailableException(payload.error?.message || `大模型请求失败（HTTP ${response.status}）`);
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new ServiceUnavailableException('大模型未返回可解析内容');
    try {
      return JSON.parse(stripCodeFence(content));
    } catch {
      throw new ServiceUnavailableException('大模型返回内容不是有效 JSON，请重新生成');
    }
  }

  private request(body: Record<string, unknown>) {
    return fetch(`${this.baseUrl}/chat/completions`, {
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
    return process.env.AI_MODEL || 'gpt-5.6-terra';
  }

  private get reasoningEffort(): string {
    return process.env.AI_REASONING_EFFORT || 'high';
  }
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
