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
    const apiKeyName = this.provider === 'kimi' ? 'KIMI_API_KEY' : 'OPENAI_API_KEY';
    return {
      configured: Boolean(this.apiKey),
      missingKeys: this.apiKey ? [] : [apiKeyName],
      provider: this.provider,
      model: this.model,
      reasoningEffort: this.reasoningEffort,
    };
  }

  async generateJson(messages: ChatMessage[]): Promise<unknown> {
    if (!this.apiKey) {
      throw new BadRequestException(`未配置 ${this.provider === 'kimi' ? 'KIMI_API_KEY' : 'OPENAI_API_KEY'}`);
    }
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: this.provider === 'kimi' ? this.kimiTemperature : 0.1,
      response_format: { type: 'json_object' },
      reasoning_effort: this.reasoningEffort,
    };
    if (this.provider === 'kimi') body.thinking = { type: 'disabled' };

    let response = await this.request(body);
    if (!response.ok && response.status === 400) {
      delete body.response_format;
      delete body.thinking;
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

  private get provider(): 'kimi' | 'openai' {
    return process.env.AI_PROVIDER === 'openai' ? 'openai' : 'kimi';
  }

  private get apiKey(): string {
    return this.provider === 'openai'
      ? process.env.OPENAI_API_KEY || ''
      : process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY || '';
  }

  private get baseUrl(): string {
    const fallback = this.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://api.moonshot.cn/v1';
    return (process.env.AI_BASE_URL || fallback).replace(/\/+$/, '');
  }

  private get model(): string {
    return process.env.AI_MODEL || (this.provider === 'openai' ? 'gpt-5.6-terra' : 'kimi-k3');
  }

  private get kimiTemperature(): number {
    return this.model === 'kimi-k3' ? 0.6 : 1;
  }

  private get reasoningEffort(): string {
    return process.env.AI_REASONING_EFFORT || 'medium';
  }
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}
